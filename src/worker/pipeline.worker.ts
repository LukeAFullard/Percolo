/// <reference lib="webworker" />

import { EmbeddingPipeline } from '../nlp/embeddings';
import { UMAPReducer } from '../math/umap';
import { ClusteringEngine } from '../math/clustering';
import { PipelineCache } from '../io/cache';
import { LexicalExtractor } from '../nlp/lexical';
import { TopicReduction } from '../nlp/reduction';
import { CoherenceMetrics } from '../math/coherence';
import { CTFIDF } from '../math/ctfidf';
import { SummarizationEngine } from '../nlp/summarization';
import { DocumentChunker } from '../nlp/chunker';
import { GenerativeSummarizer } from '../nlp/generative';
import { PIIRedactor } from '../nlp/pii';
import { ZeroShotClassifier } from '../nlp/zeroshot';
import { FewShotClassifier } from '../nlp/fewshot';
import { CrossLingualTranslator } from '../nlp/translation';
import { ABSAEngine } from '../nlp/absa';
import { KeyphraseExtractor } from '../nlp/keyphrase';
import { Similarity } from '../math/similarity';
import { NLPAnalytics } from '../nlp/analytics';
import { Deduplicator } from '../nlp/deduplication';

import { IncrementalUpdater } from '../nlp/incremental';

// Declare standard web worker scope
const ctx: Worker = self as any;

ctx.postMessage({ type: 'READY' });

// We cache our centroids in memory so inference is blazing fast
let latestCentroids: Map<number, number[]> | null = null;

ctx.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;
  if (type === 'PING') return;

  if (type === 'START_PIPELINE') {
    try {
      const { documents } = payload;
      await runPipeline(documents);
    } catch (error: any) {
      ctx.postMessage({
        type: 'ERROR',
        payload: { message: error.message }
      });
    }
  } else if (type === 'RUN_SEARCH') {
    try {
      const { query, documentEmbeddings, config } = payload;

      const queryEmbeddingArr = await EmbeddingPipeline.embedTexts([query], config);
      const queryEmbedding = queryEmbeddingArr[0];

      const similarities = documentEmbeddings.map((docEmb: number[], index: number) => {
          return {
              docIndex: index,
              similarity: Similarity.cosine(queryEmbedding, docEmb)
          };
      });

      // Sort by highest similarity
      similarities.sort((a: any, b: any) => b.similarity - a.similarity);

      ctx.postMessage({
        type: 'SEARCH_RESULT',
        payload: similarities
      });
    } catch (error: any) {
      ctx.postMessage({
        type: 'ERROR',
        payload: { message: error.message }
      });
    }
  } else if (type === 'RUN_INFERENCE') {
    try {
      if (!latestCentroids) {
         throw new Error("Cannot run inference. You must run the pipeline first to compute topic centroids.");
      }
      const { document, config } = payload;
      // We use IncrementalUpdater for a partial fit to map new document to existing topics
      const results = await IncrementalUpdater.partialFit([document], latestCentroids, config);
      await EmbeddingPipeline.dispose(); // maintain hygiene
      ctx.postMessage({
        type: 'INFERENCE_RESULT',
        payload: results
      });
    } catch (error: any) {
      ctx.postMessage({
        type: 'ERROR',
        payload: { message: error.message }
      });
    }
  }
};

// Simple deterministic string hash function to generate cache keys
function generateHash(strings: string[]): string {
  let hash = 0;
  const str = strings.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

async function runPipeline(documents: string[], config?: any) {
  const { HardwareProfiler } = await import('./hardware');
  const profile = HardwareProfiler.determineTier();
  try {
    await HardwareProfiler.validateCorpusSize(documents, profile);
  } catch (error: any) {
    throw new Error(`Hardware limit exceeded: ${error.message}`);
  }

  let embeddings: number[][];
  let reducedEmbeddings: number[][];
  let clusteringResult: any;

  // We hash based on config strings as well to avoid colliding with non-PII or different seed word runs
  const configHashString = config ? JSON.stringify(config) : "";
  const docHash = generateHash([documents.join('|') + configHashString]);
  let processedDocuments = documents;

  if (config?.redactPII) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'preprocessing', status: 'running', message: 'Redacting PII...' }
      });
      processedDocuments = await PIIRedactor.redactBatch(documents, { useAIPrivacyFilter: config?.useAIPrivacyFilter });

      // Clean up AI PII model if used
      if (config?.useAIPrivacyFilter) {
          await PIIRedactor.dispose();
      }

      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'preprocessing', status: 'completed' }
      });
  }

  // Keep track of which parent document each chunk belongs to
  let chunkToDocMap: number[] = [];

  if (config?.useChunking) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'preprocessing', status: 'running', message: 'Chunking documents...' }
      });
      const chunkedDocs: string[] = [];
      for (let i = 0; i < processedDocuments.length; i++) {
         const doc = processedDocuments[i];
         const chunks = DocumentChunker.chunkText(doc, {
             maxTokens: config.chunkMaxTokens || 256,
             overlapTokens: config.chunkOverlapTokens || 50
         });
         for (const chunk of chunks) {
            chunkedDocs.push(chunk);
            chunkToDocMap.push(i);
         }
      }
      processedDocuments = chunkedDocs;
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'preprocessing', status: 'completed' }
      });
  } else {
     // If not chunking, 1:1 mapping
     chunkToDocMap = Array.from({length: processedDocuments.length}, (_, i) => i);
  }

  const cacheKeyEmbeddings = `${docHash}-embeddings`;
  const cacheKeyUmap = `${docHash}-umap`;
  const cacheKeyClustering = `${docHash}-clustering`;

  // Phase 2: Embeddings
  const embeddingsCache = await PipelineCache.loadCheckpoint(cacheKeyEmbeddings);
  if (embeddingsCache && embeddingsCache.data) {
    ctx.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'embeddings', status: 'completed', message: 'Loaded embeddings from cache.' }
    });
    embeddings = embeddingsCache.data;
  } else {
    ctx.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'embeddings', status: 'running', message: 'Generating embeddings...' }
    });

    embeddings = await EmbeddingPipeline.embedTexts(processedDocuments);

    await PipelineCache.saveCheckpoint(cacheKeyEmbeddings, 'embeddings', embeddings);

    ctx.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'embeddings', status: 'completed' }
    });
  }

  let dedupMapping: number[] | null = null;
  if (config?.deduplicate) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'embeddings', status: 'running', message: 'Deduplicating documents...' }
      });
      const dedupResult = Deduplicator.run(processedDocuments, embeddings, 0.95);
      processedDocuments = dedupResult.uniqueDocuments;
      embeddings = dedupResult.uniqueEmbeddings;
      dedupMapping = dedupResult.indexMapping;
  }

  let guidedLabels: number[] | null = null;
  if (config?.seedWords && config.seedWords.length > 0) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'embeddings', status: 'running', message: 'Calculating Guided Topic Priors...' }
      });
      const { GuidedTopicModeling } = await import('../nlp/guided');
      const priorResult = await GuidedTopicModeling.getPriors(embeddings, config.seedWords);
      guidedLabels = priorResult.seedLabels;
  }

  // Phase 3/4: UMAP & Clustering OR Zero-Shot/Few-Shot Classification
  // We execute Few/Zero Shot *before* disposing embeddings since they require the pipeline to embed labels/examples.
  if (config?.fewShotCategories && Object.keys(config.fewShotCategories).length > 0) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'clustering', status: 'running', message: 'Performing Few-Shot Classification...' }
      });
      const zsResult = await FewShotClassifier.classify(embeddings, config.fewShotCategories, config);

      const categoryLabels = Object.keys(config.fewShotCategories);
      const categoryMap = new Map<string, number>();
      categoryLabels.forEach((cat: string, idx: number) => categoryMap.set(cat, idx));

      clusteringResult = {
         labels: zsResult.map(r => categoryMap.get(r.label) as number),
         probabilities: zsResult.map(r => r.similarity)
      };

      reducedEmbeddings = embeddings.map(e => [e[0] || 0, e[1] || 0]);
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'clustering', status: 'completed' }
      });
  } else if (config?.zeroShotCategories) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'clustering', status: 'running', message: 'Performing Zero-Shot Classification...' }
      });
      // Bypass HDBSCAN, assign directly via cosine similarity to category embeddings
      const zsResult = await ZeroShotClassifier.classify(embeddings, config.zeroShotCategories, config);

      // Map zero shot categories to numeric indices to mock HDBSCAN labels
      const categoryMap = new Map<string, number>();
      config.zeroShotCategories.forEach((cat: string, idx: number) => categoryMap.set(cat, idx));

      clusteringResult = {
         labels: zsResult.map(r => categoryMap.get(r.label) as number),
         probabilities: zsResult.map(r => r.similarity)
      };

      // Dummy UMAP representation for visualizer parity if strictly zero-shot, though normally skipped
      reducedEmbeddings = embeddings.map(e => [e[0] || 0, e[1] || 0]);
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'clustering', status: 'completed' }
      });
  }

  // Phase 7: Memory Hygiene
  // Explicitly dispose of the ONNX inference session to free up system memory
  // before proceeding to memory-heavy graph operations (UMAP/HDBSCAN) if falling through to standard clustering.
  await EmbeddingPipeline.dispose();

  if (config?.fewShotCategories || config?.zeroShotCategories) {
       // If we already clustered via zero/few shot, we skip standard clustering logic
  } else {
      const MAX_SAMPLED_DOCS = 2500;
      const isSampling = embeddings.length > MAX_SAMPLED_DOCS;

      let sampledIndices: number[] = [];
      let sampledEmbeddings: number[][] = [];
      let unSampledIndices: number[] = [];

      if (isSampling) {
         ctx.postMessage({
            type: 'PROGRESS',
            payload: { phase: 'umap', status: 'running', message: `Dataset is large. Sampling ${MAX_SAMPLED_DOCS} docs for clustering...` }
         });
         // Simple random sampling
         const indices = Array.from({ length: embeddings.length }, (_, i) => i);
         for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
         }
         sampledIndices = indices.slice(0, MAX_SAMPLED_DOCS);
         unSampledIndices = indices.slice(MAX_SAMPLED_DOCS);
         sampledEmbeddings = sampledIndices.map(i => embeddings[i]);
      } else {
         sampledIndices = Array.from({ length: embeddings.length }, (_, i) => i);
         sampledEmbeddings = embeddings;
      }

      const umapCache = await PipelineCache.loadCheckpoint(cacheKeyUmap);
      let sampledReducedEmbeddings: number[][] = [];

      if (umapCache && umapCache.data && !isSampling) {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'umap', status: 'completed', message: 'Loaded UMAP projection from cache.' }
        });
        sampledReducedEmbeddings = umapCache.data;
      } else {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'umap', status: 'running', message: 'Reducing dimensions...' }
        });

        const nEpochs = 500;
        sampledReducedEmbeddings = await UMAPReducer.reduceAsync(sampledEmbeddings, {}, (epoch) => {
          if (epoch % 10 === 0) {
            const progressPercent = Math.round((epoch / nEpochs) * 100);
            ctx.postMessage({
              type: 'PROGRESS',
              payload: { phase: 'umap', status: 'running', progress: progressPercent, message: `Reducing dimensions (${epoch}/${nEpochs})...` }
            });
          }
        });

        if (!isSampling) await PipelineCache.saveCheckpoint(cacheKeyUmap, 'umap', sampledReducedEmbeddings);

        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'umap', status: 'completed' }
        });
      }

      const clusteringCache = await PipelineCache.loadCheckpoint(cacheKeyClustering);
      let sampledClusteringResult: any;
      if (clusteringCache && clusteringCache.data && !isSampling) {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'clustering', status: 'completed', message: 'Loaded clustering from cache.' }
        });
        sampledClusteringResult = clusteringCache.data;
      } else {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'clustering', status: 'running', message: 'Clustering documents...' }
        });

        sampledClusteringResult = await ClusteringEngine.clusterAsync(sampledReducedEmbeddings, {
            useLowMemoryFallback: config?.useLowMemoryFallback
        });
        if (!isSampling) await PipelineCache.saveCheckpoint(cacheKeyClustering, 'clustering', sampledClusteringResult);

        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'clustering', status: 'completed' }
        });
      }

      let finalLabelsArray = new Array(embeddings.length).fill(-1);
      const probabilities = new Array(embeddings.length).fill(0);
      reducedEmbeddings = new Array(embeddings.length).fill([0, 0]);

      // Map sampled results back
      const sampledLabels = Array.isArray(sampledClusteringResult.labels) ? sampledClusteringResult.labels : Array.from(sampledClusteringResult.labels);
      for (let i = 0; i < sampledIndices.length; i++) {
         const globalIdx = sampledIndices[i];
         finalLabelsArray[globalIdx] = sampledLabels[i];
         probabilities[globalIdx] = sampledClusteringResult.probabilities[i];
         reducedEmbeddings[globalIdx] = sampledReducedEmbeddings[i];
      }

      if (isSampling) {
         ctx.postMessage({
           type: 'PROGRESS',
           payload: { phase: 'clustering', status: 'running', message: 'Partial fitting remaining documents...' }
         });

         const { Centroids: LocalCentroids } = await import('../math/centroids');
         const { InferenceEngine } = await import('../nlp/inference');

         // Calculate centroids of the sampled set
         const sampledCentroids = LocalCentroids.calculate(sampledEmbeddings, sampledLabels as number[]);

         // Infer remaining
         const unSampledEmbeddings = unSampledIndices.map(i => embeddings[i]);
         const inferenceResults = InferenceEngine.transform(unSampledEmbeddings, sampledCentroids);

         // First, compute 2D UMAP centroids for the sampled clusters to use as fallbacks
         const umapCentroids = new Map<number, number[]>();
         const clusterSizes = new Map<number, number>();

         for (let i = 0; i < sampledIndices.length; i++) {
             const label = sampledLabels[i];
             const coords = sampledReducedEmbeddings[i];
             if (label !== -1) {
                 const current = umapCentroids.get(label) || [0, 0];
                 const count = clusterSizes.get(label) || 0;
                 umapCentroids.set(label, [current[0] + coords[0], current[1] + coords[1]]);
                 clusterSizes.set(label, count + 1);
             }
         }

         for (const [label, sumCoords] of umapCentroids.entries()) {
             const count = clusterSizes.get(label)!;
             umapCentroids.set(label, [sumCoords[0] / count, sumCoords[1] / count]);
         }

         for (let i = 0; i < unSampledIndices.length; i++) {
             const globalIdx = unSampledIndices[i];
             const res = inferenceResults[i];

             // If similarity is low, treat as outlier
             const label = res.similarity >= 0.5 ? res.label : -1;
             finalLabelsArray[globalIdx] = label;
             probabilities[globalIdx] = res.similarity;

             // Approximate UMAP coordinate using the cluster's 2D centroid
             if (label !== -1 && umapCentroids.has(label)) {
                 // Add a tiny bit of random jitter so points don't stack perfectly
                 const centroid = umapCentroids.get(label)!;
                 const jitterX = (Math.random() - 0.5) * 0.1;
                 const jitterY = (Math.random() - 0.5) * 0.1;
                 reducedEmbeddings[globalIdx] = [centroid[0] + jitterX, centroid[1] + jitterY];
             } else {
                 reducedEmbeddings[globalIdx] = [0, 0]; // True outliers can stay near origin or be hidden
             }
         }
      }

      clusteringResult = { labels: finalLabelsArray, probabilities };
  }

  // We need to reassemble labels into a regular array to use safely with the LexicalExtractor
  let finalLabels = Array.isArray(clusteringResult.labels) ? clusteringResult.labels : Array.from(clusteringResult.labels);

  // Merge guided labels into the HDBSCAN clustering results, avoiding overriding strong HDBSCAN clusters if possible,
  // or simply override since seeded labels act as forced prior topic assignment in standard setups.
  if (guidedLabels && guidedLabels.length === finalLabels.length) {
       for (let i = 0; i < finalLabels.length; i++) {
           if (guidedLabels[i] !== -1) {
               // We assign the seed label as the topic class. To avoid collision with existing HDBSCAN numerical topics
               // we can leave them, but ensure they don't collide. For now we use the seed indices directly.
               // It may override existing topic numbers, but uniqueClasses will capture them.
               finalLabels[i] = guidedLabels[i];
               // Set high probability for guided assignments
               clusteringResult.probabilities[i] = 1.0;
           }
       }
  }

  // Phase 5: Lexical Extraction
  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'lexical', status: 'running', message: 'Extracting vocabulary and terms...' }
  });

  let lexicalResult = LexicalExtractor.extract(processedDocuments, finalLabels as number[], {
     minDf: 2,
     ngramRange: config?.ngramRange || [1, 1],
     posFilter: config?.posFilter
  });

  // Optional Phase: Topic Reduction
  if (config?.targetTopicCount && config.targetTopicCount > 0 && config.targetTopicCount < lexicalResult.uniqueClasses.length) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'lexical', status: 'running', message: `Reducing topics down to ${config.targetTopicCount}...` }
      });

      // TopicReduction.reduce returns an array of new labels corresponding to the uniqueClasses
      // We need to build a mapping from old class ID to new class ID
      const reductionResult = TopicReduction.reduce(
         lexicalResult.matrix,
         lexicalResult.uniqueClasses,
         config.targetTopicCount
      );

      const mapping = new Map<number, number>();
      for (let i = 0; i < lexicalResult.uniqueClasses.length; i++) {
          mapping.set(lexicalResult.uniqueClasses[i], reductionResult[i]);
      }

      // Update labels with merged mappings
      finalLabels = finalLabels.map((label: any) => {
          return mapping.has(label) ? mapping.get(label)! : label;
      });

      // Re-extract lexical context with new merged labels
      lexicalResult = LexicalExtractor.extract(processedDocuments, finalLabels as number[], {
         minDf: 2,
         ngramRange: config?.ngramRange || [1, 1],
         posFilter: config?.posFilter
      });
  }

  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'lexical', status: 'completed' }
  });

  // Phase 6: c-TF-IDF Topic Representation
  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'ctfidf', status: 'running', message: 'Calculating topic representations...' }
  });

  // We calculate the sizes and formatted labels
  const topicSizes = new Array(lexicalResult.uniqueClasses.length).fill(0);
  for (let i = 0; i < finalLabels.length; i++) {
    const labelIdx = lexicalResult.uniqueClasses.indexOf(finalLabels[i] as number);
    if (labelIdx !== -1) {
      topicSizes[labelIdx]++;
    }
  }

  let topWordsPerTopic: any[] = [];
  let hoverSummaries: string[] = [];
  let topicAnalytics: any[] = [];

  if (lexicalResult.matrix) {
    // If Custom Stopwords are provided, zero out their frequencies so they aren't extracted
    let globalTf = lexicalResult.globalTermFrequencies;
    if (config?.customStopWords) {
        globalTf = [...globalTf]; // clone
        for (const stopword of config.customStopWords) {
            const idx = lexicalResult.vocabulary.indexOf(stopword);
            if (idx !== -1) {
                globalTf[idx] = 0;
            }
        }
    }

    const denseMatrix = lexicalResult.matrix.toDense();

    let scoringMatrix: number[][];
    if (config?.useBM25) {
        // Compute class sizes for BM25
        const classSizes = denseMatrix.map((row: number[]) => row.reduce((a, b) => a + b, 0));
        // Need to require bm25 dynamically or import it at top
        const { BM25 } = await import('../math/bm25');
        scoringMatrix = BM25.calculate(denseMatrix, globalTf, lexicalResult.averageClassSize, classSizes, {
           seedWords: config?.seedWords ? config.seedWords.flat() : [],
           vocabulary: lexicalResult.vocabulary
        });
    } else {
        scoringMatrix = CTFIDF.calculate(
            denseMatrix,
            globalTf,
            lexicalResult.averageClassSize,
            {
               seedWords: config?.seedWords ? config.seedWords.flat() : [],
               vocabulary: lexicalResult.vocabulary
            }
        );
    }

    topWordsPerTopic = CTFIDF.extractTopWordsPerClass(scoringMatrix, lexicalResult.vocabulary, 5);

    // Generate summaries and map classes
    const classDocumentsMap = new Map<number, string>();
    for (let i = 0; i < processedDocuments.length; i++) {
        const label = finalLabels[i] as number;
        classDocumentsMap.set(label, (classDocumentsMap.get(label) || '') + ' ' + processedDocuments[i]);
    }

    // KeyBERT Phrases
    if (config?.useKeyBERT) {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'ctfidf', status: 'running', message: 'Extracting Keyphrases via KeyBERT...' }
        });
        // We run KeyBERT on the class documents
        for (let i = 0; i < lexicalResult.uniqueClasses.length; i++) {
             const label = lexicalResult.uniqueClasses[i];
             const text = classDocumentsMap.get(label) || '';
             const keyphrases = await KeyphraseExtractor.extract(text, { topK: 3 });
             // Append to the c-TF-IDF words so they render in the UI Barchart
             // We give them slightly higher artificial scores so they float to the top
             keyphrases.forEach((kp, idx) => {
                 topWordsPerTopic[i].unshift({ word: `[KP] ${kp.phrase}`, score: 1.0 - (idx * 0.01) });
             });
        }
        await EmbeddingPipeline.dispose(); // KeyBERT uses embeddings, so clean up
    }

    // Choose summarization engine based on config
    let summarizer: any;
    if (config?.useGenerativeSummarization) {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'ctfidf', status: 'running', message: 'Generating summaries using Micro-LLM...' }
        });
        summarizer = new GenerativeSummarizer();
    } else {
        summarizer = new SummarizationEngine();
    }

    const summariesMap = new Map<number, string[]>();
    const generativeLabels = new Map<number, string>();

    // We can iterate indices to access topWordsPerTopic
    for (let i = 0; i < lexicalResult.uniqueClasses.length; i++) {
        const label = lexicalResult.uniqueClasses[i];
        const text = classDocumentsMap.get(label) || '';

        const summaryArr = await summarizer.summarize(text, { topK: 2 });
        let finalSummary = summaryArr.join(' ');

        // ABSA Analysis
        if (config?.runABSA) {
            const absaResults = await ABSAEngine.analyze(text);
            if (absaResults.length > 0) {
               // Top 3 sentiments
               const topSentiments = absaResults.slice(0, 3).map(a => `${a.aspect} (${a.sentiment})`).join(', ');
               finalSummary += `\n[Sentiments: ${topSentiments}]`;
            }
        }
        summariesMap.set(label, [finalSummary]);

        // Run general analytics (Sentiment & Entities) if configured
        if (config?.runAnalytics) {
            const docAnalytics = NLPAnalytics.processDocument(text);
            // Append short info to hover summary
            const sentimentStr = docAnalytics.sentiment > 0 ? 'Positive' : docAnalytics.sentiment < 0 ? 'Negative' : 'Neutral';
            const extraLines = [];
            extraLines.push(`General Sentiment: ${sentimentStr} (${docAnalytics.sentiment.toFixed(2)})`);
            if (docAnalytics.entities.dates.length > 0) extraLines.push(`Dates: ${docAnalytics.entities.dates.slice(0,3).join(', ')}`);
            if (docAnalytics.entities.money.length > 0) extraLines.push(`Money: ${docAnalytics.entities.money.slice(0,3).join(', ')}`);

            const lines = summariesMap.get(label) || [];
            lines.push(...extraLines);
            summariesMap.set(label, lines);

            topicAnalytics.push({
               label,
               analytics: docAnalytics
            });
        }

        // Deep NER Extraction if configured
        if (config?.runNER) {
            const { NEREngine } = await import('../nlp/ner');
            const entities = await NEREngine.extractEntities(text);
            if (entities.length > 0) {
                 const topEntities = Array.from(new Set(entities.slice(0, 5).map(e => `${e.word} (${e.entity_group})`))).join(', ');
                 const lines = summariesMap.get(label) || [];
                 lines.push(`Named Entities: ${topEntities}`);
                 summariesMap.set(label, lines);

                 // Also attach to analytics metadata
                 const currentAnalytics = topicAnalytics.find(a => a.label === label);
                 if (currentAnalytics) {
                     currentAnalytics.analytics.deepEntities = entities;
                 } else {
                     topicAnalytics.push({
                         label,
                         analytics: { deepEntities: entities }
                     });
                 }
            }
            await NEREngine.dispose(); // Release memory after
        }

        // Generative Topic Labeling
        if (config?.useGenerativeSummarization && summarizer instanceof GenerativeSummarizer) {
            const keywords = topWordsPerTopic[i].slice(0, 5).map((w: any) => w.word);
            // Skip naming Noise/Outlier topics dynamically since it breaks cohesion
            if (label !== -1) {
                const generatedLabel = await summarizer.generateTopicLabel(keywords);
                if (generatedLabel) {
                    generativeLabels.set(label, generatedLabel);
                }
            }
        }
    }

    if (config?.useGenerativeSummarization) {
        await GenerativeSummarizer.dispose(); // clear WebGPU
    }
    if (config?.runABSA) {
        await ABSAEngine.dispose();
    }

    hoverSummaries = lexicalResult.uniqueClasses.map(label => {
        const summaryLines = summariesMap.get(label) || [];
        return summaryLines.join(' ');
    });

    // Default display labels (c-TF-IDF / BM25 fallback)
    let displayLabels = topWordsPerTopic.map((words, i) => `Topic ${lexicalResult.uniqueClasses[i]}: ${words.slice(0, 3).map((w: any) => w.word).join(', ')}`);

    // Apply Generative Labels if generated
    if (generativeLabels.size > 0) {
        displayLabels = displayLabels.map((defaultLabel, i) => {
            const classId = lexicalResult.uniqueClasses[i];
            const genLabel = generativeLabels.get(classId);
            return genLabel ? `Topic ${classId}: ${genLabel}` : defaultLabel;
        });
    }

    // Export labels to outer scope for final payload logic
    ctx.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'ctfidf', status: 'completed' }
    });

    // We mutate a let variable created outside this block if it existed, but `displayLabels`
    // is created right below. We need to restructure slightly to pass it down.
    var finalDisplayLabels = displayLabels;
  } else {
     var finalDisplayLabels: string[] = [];
  }

  // Fallback if matrix was empty
  if (finalDisplayLabels.length === 0 && topWordsPerTopic.length > 0) {
      finalDisplayLabels = topWordsPerTopic.map((words, i) => `Topic ${lexicalResult.uniqueClasses[i]}: ${words.slice(0, 3).map((w: any) => w.word).join(', ')}`);
  } else if (finalDisplayLabels.length === 0) {
      finalDisplayLabels = lexicalResult.uniqueClasses.map(c => `Topic ${c}`);
  }

  let displayLabels = finalDisplayLabels;

  if (config?.tgtLang && config.tgtLang.trim().length > 0) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'ctfidf', status: 'running', message: `Translating topics to ${config.tgtLang}...` }
      });
      const originalNames = topWordsPerTopic.map((words, _i) => words.slice(0, 3).map((w: any) => w.word).join(', '));

      // Map FLORES-200 3-letter codes (e.g. 'eng_Latn') to 2-letter codes (e.g. 'en') for m2m100
      let tgtLang = config.tgtLang || 'en';
      if (tgtLang.includes('_')) {
          const prefix = tgtLang.split('_')[0]; // e.g. 'eng', 'fra', 'spa', 'deu'
          const map: Record<string, string> = { 'eng': 'en', 'fra': 'fr', 'spa': 'es', 'deu': 'de', 'ita': 'it', 'por': 'pt', 'nld': 'nl', 'rus': 'ru', 'zho': 'zh', 'jpn': 'ja', 'kor': 'ko', 'ara': 'ar', 'hin': 'hi' };
          tgtLang = map[prefix] || prefix.slice(0, 2); // Fallback to first two letters if not in map
      }
      const translated = await CrossLingualTranslator.translate(originalNames, { tgtLang });

      displayLabels = translated.map((t, i) => `Topic ${lexicalResult.uniqueClasses[i]}: ${t}`);
      await CrossLingualTranslator.dispose();
  }

  // Calculate Topic Coherence (NPMI)
  const tokenizedDocs = processedDocuments.map(doc => doc.split(' '));
  const wordsOnly = topWordsPerTopic.map(topic => topic.map((w: any) => w.word));
  const coherenceScore = CoherenceMetrics.calculateNPMI(wordsOnly, tokenizedDocs).meanScore;

  // Calculate Topic Similarity Matrix
  const similarityMatrix: number[][] = [];
  if (lexicalResult.matrix && topWordsPerTopic.length > 0) {
      const denseMatrix = lexicalResult.matrix.toDense();
      for (let i = 0; i < denseMatrix.length; i++) {
          const rowSims = Similarity.cosineMultiple(denseMatrix[i], denseMatrix);
          similarityMatrix.push(rowSims);
      }
  }

  // Final arrays without seed prepending
  let outLabels = finalLabels;
  let outProbs = clusteringResult.probabilities;
  let outUmap = reducedEmbeddings!;
  let outEmbeddings = embeddings;

  // Rehydrate deduplicated documents if needed
  if (dedupMapping) {
      const restoredLabels = new Array(dedupMapping.length).fill(-1);
      const restoredProbs = new Array(dedupMapping.length).fill(0);
      const restoredUmap = new Array(dedupMapping.length).fill([0, 0]);

      for (let i = 0; i < dedupMapping.length; i++) {
          const uniqueIdx = dedupMapping[i];
          if (uniqueIdx !== -1) {
             restoredLabels[i] = outLabels[uniqueIdx];
             restoredProbs[i] = outProbs[uniqueIdx];
             restoredUmap[i] = outUmap[uniqueIdx];
          }
      }
      outLabels = restoredLabels;
      outProbs = restoredProbs;
      outUmap = restoredUmap;

      // We must rehydrate the embeddings array so Semantic Search matches the original document index
      const restoredEmbeddings = new Array(dedupMapping.length);
      for (let i = 0; i < dedupMapping.length; i++) {
          const uniqueIdx = dedupMapping[i];
          if (uniqueIdx !== -1) {
             restoredEmbeddings[i] = outEmbeddings[uniqueIdx];
          }
      }
      outEmbeddings = restoredEmbeddings;
  }

  // If chunking is enabled, roll up the chunk labels back to the parent document level
  // so the UI and exports match the original `documents` array.
  // The simplest strategy is "majority vote" or just take the first valid label.
  let finalParentLabels: any = outLabels;
  let finalParentProbs: any = outProbs;
  if (config?.useChunking) {
      const parentLabels = new Array(documents.length).fill(-1);
      const parentProbs = new Array(documents.length).fill(0);

      const docVotes = new Map<number, Map<number, { count: number, maxProb: number }>>();

      for (let i = 0; i < outLabels.length; i++) {
         const docIdx = chunkToDocMap[i];
         const label = outLabels[i] as number;
         const prob = outProbs[i];

         if (!docVotes.has(docIdx)) docVotes.set(docIdx, new Map());
         const labelStats = docVotes.get(docIdx)!.get(label) || { count: 0, maxProb: 0 };
         labelStats.count += 1;
         labelStats.maxProb = Math.max(labelStats.maxProb, prob);
         docVotes.get(docIdx)!.set(label, labelStats);
      }

      for (let i = 0; i < documents.length; i++) {
         const votes = docVotes.get(i);
         if (votes) {
            let bestLabel = -1;
            let highestCount = -1;
            for (const [label, stats] of votes.entries()) {
               if (label !== -1 && stats.count > highestCount) {
                  highestCount = stats.count;
                  bestLabel = label;
               }
            }
            if (bestLabel === -1 && votes.has(-1)) {
               bestLabel = -1;
            }
            parentLabels[i] = bestLabel;
            parentProbs[i] = votes.get(bestLabel)?.maxProb || 0;
         }
      }

      finalParentLabels = parentLabels;
      finalParentProbs = parentProbs;
  }

  // Cache Centroids for Inference
  const { Centroids: LocalCentroids } = await import('../math/centroids');
  latestCentroids = LocalCentroids.calculate(outEmbeddings, outLabels as number[]);

  // Calculate Document Probability Distribution (Fuzzy assignments to topics)
  // Standard HDBSCAN gives a single membership probability.
  // To get a distribution across ALL topics for a document, we calculate softmaxed cosine similarities
  // to the topic centroids.
  const documentDistributions: number[][] = [];
  if (config?.fuzzyClustering && lexicalResult.uniqueClasses.length > 1) {
       ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'ctfidf', status: 'running', message: `Calculating fuzzy probability distributions...` }
      });
      // 1. Calculate Centroids
      const centroidsMap = latestCentroids;

      // We need an ordered array of centroids matching the `uniqueClasses` indices
      const orderedCentroids: number[][] = [];
      const validClasses: number[] = [];

      for (const cls of lexicalResult.uniqueClasses) {
          if (cls !== -1 && centroidsMap.has(cls)) {
              orderedCentroids.push(centroidsMap.get(cls)!);
              validClasses.push(cls);
          }
      }

      if (orderedCentroids.length > 0) {
          // 2. Compute similarity of each document to each centroid
          for (let i = 0; i < outEmbeddings.length; i++) {
              const docVec = outEmbeddings[i];
              const sims = Similarity.cosineMultiple(docVec, orderedCentroids);

              // Apply Softmax to similarities to get probabilities
              const maxSim = Math.max(...sims);
              const expSims = sims.map((s: number) => Math.exp(s - maxSim)); // subtract max for numerical stability
              const sumExp = expSims.reduce((a: number, b: number) => a+b, 0);
              const probs = expSims.map((e: number) => sumExp > 0 ? e / sumExp : 0);

              // Map back to the full length of uniqueClasses (padding outliers with 0)
              const fullProbs = new Array(lexicalResult.uniqueClasses.length).fill(0);
              for (let pIdx = 0; pIdx < probs.length; pIdx++) {
                  const globalIdx = lexicalResult.uniqueClasses.indexOf(validClasses[pIdx]);
                  fullProbs[globalIdx] = probs[pIdx];
              }
              documentDistributions.push(fullProbs);
          }
      }
  }

// Support graceful degradation for large results if SharedArrayBuffer/COOP is unavailable
  const finalPayload: any = {
    labels: finalParentLabels, // Export parent labels to keep UI parity with original docs
    probabilities: finalParentProbs,
    topicLabels: displayLabels,
    topicSizes: topicSizes,
    hoverSummaries: hoverSummaries,
    uniqueClasses: lexicalResult.uniqueClasses,
    umap: outUmap, // Note: UMAP and Distributions might still be at chunk level. They can be rolled up later if needed, but for now parent labels solve the export issue.
    embeddings: outEmbeddings, // Included to drive Semantic Search
    topicWords: topWordsPerTopic, // Included to drive the TopicBarchart
    similarityMatrix: similarityMatrix, // Included to drive Heatmap
    documentDistributions: documentDistributions // Included to drive Fuzzy Distribution Barchart
  };

  try {
    // Generate Report Data object for UI to easily consume
    const reportData = {
        totalDocuments: documents.length,
        coherenceScore: coherenceScore,
        topics: lexicalResult.uniqueClasses.map((label, idx) => {
            const analyticsItem = topicAnalytics.find(a => a.label === label);
            return {
                id: label,
                name: topWordsPerTopic[idx].slice(0, 3).map((w: any) => w.word).join(', '),
                size: topicSizes[idx],
                words: topWordsPerTopic[idx],
                summary: hoverSummaries[idx],
                analytics: analyticsItem ? analyticsItem.analytics : null
            };
        })
    };
    finalPayload.reportData = reportData;

    // Attempt standard postMessage (will fail if object is too large or contains unclonable types)
    ctx.postMessage({
      type: 'RESULT',
      payload: finalPayload
    });
  } catch (err: any) {
    if (err.name === 'DataCloneError' || err.message.includes('clone')) {
      // Fallback: chunked transfer
      const uniqueId = `result-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      sendChunkedData(uniqueId, finalPayload);
    } else {
      ctx.postMessage({
        type: 'ERROR',
        payload: { message: `Failed to send result: ${err.message}` }
      });
    }
  }
}

function isArrayOrView(obj: any): boolean {
  return Array.isArray(obj) || ArrayBuffer.isView(obj);
}

function sliceArrayOrView(obj: any, start: number, end: number): any {
  if (Array.isArray(obj)) {
    return obj.slice(start, end);
  }
  // Important: Do not use .subarray for TypedArrays because subarray creates a view over the same ArrayBuffer.
  // postMessage structured clone algorithm will serialize the ENTIRE underlying ArrayBuffer if a view is passed.
  // We MUST use .slice() to create a new ArrayBuffer representing only the chunk.
  if (ArrayBuffer.isView(obj) && 'slice' in obj) {
    return (obj as any).slice(start, end);
  }
  // Fallback for extremely old environments without slice on TypedArrays
  if (ArrayBuffer.isView(obj) && 'subarray' in obj) {
      const sub = (obj as any).subarray(start, end);
      // Create a genuine copy to avoid the ArrayBuffer serialization bug
      const Constructor = (obj as any).constructor;
      return new Constructor(sub);
  }
  return [];
}

function sendChunkedData(id: string, data: any, chunkSize = 1000) {
  const nonChunkedData = { ...data };
  delete nonChunkedData.labels;
  delete nonChunkedData.probabilities;
  ctx.postMessage({
    type: 'CHUNK_METADATA',
    payload: { id: id + '-metadata', data: nonChunkedData }
  });
  // Check if labels is array or typed array
  if (data.labels && isArrayOrView(data.labels)) {
    if (data.labels.length === 0) {
        // If data is empty, it shouldn't trigger chunking or it's a trivial return
        ctx.postMessage({
            type: 'RESULT',
            payload: data
        });
        return;
    }

    const totalChunks = Math.ceil(data.labels.length / chunkSize);

    // Pass metadata to orchestrator so it knows what type of TypedArray to reconstruct
    const labelsIsTyped = ArrayBuffer.isView(data.labels);
    const probsIsTyped = data.probabilities ? ArrayBuffer.isView(data.probabilities) : false;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;

      const chunkLabels = sliceArrayOrView(data.labels, start, end);
      const chunkProbs = data.probabilities ? sliceArrayOrView(data.probabilities, start, end) : [];

      const chunkData = {
        labels: chunkLabels,
        probabilities: chunkProbs
      };

      ctx.postMessage({
        type: 'CHUNK',
        payload: {
          id,
          chunkIndex: i,
          totalChunks,
          data: chunkData,
          labelsIsTyped,
          probsIsTyped,
          totalLength: data.labels.length
        }
      });
    }
  } else {
      // If it's not an array, just send it back as an error as chunking arbitrary objects requires more complex serialization
      ctx.postMessage({
        type: 'ERROR',
        payload: { message: 'Data is too large and cannot be chunked automatically.' }
      });
  }
}
