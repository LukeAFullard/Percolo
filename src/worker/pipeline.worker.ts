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
import { GenerativeSummarizer } from '../nlp/generative';
import { PIIRedactor } from '../nlp/pii';
import { ZeroShotClassifier } from '../nlp/zeroshot';
import { CrossLingualTranslator } from '../nlp/translation';
import { ABSAEngine } from '../nlp/absa';
import { KeyphraseExtractor } from '../nlp/keyphrase';
import { Similarity } from '../math/similarity';

// Declare standard web worker scope
const ctx: Worker = self as any;

ctx.postMessage({ type: 'READY' });

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
      processedDocuments = PIIRedactor.redactBatch(documents);
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'preprocessing', status: 'completed' }
      });
  }

  const cacheKeyEmbeddings = `${docHash}-embeddings`;
  const cacheKeyUmap = `${docHash}-umap`;
  const cacheKeyClustering = `${docHash}-clustering`;

  // Phase 2: Embeddings
  const embeddingsCache = await PipelineCache.loadCheckpoint(cacheKeyEmbeddings);
  if (embeddingsCache && embeddingsCache.data && !config?.seedWords) {
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

    // If Guided Topic Modeling is active, prepend seed word embeddings
    if (config?.seedWords) {
       for (const seedList of config.seedWords) {
           const seedText = seedList.join(' ');
           const seedEmbeds = await EmbeddingPipeline.embedTexts([seedText]);
           // In a full implementation, you inject these into the UMAP space or use them to pull centroids.
           // For simplicity here, we prepend them to the embeddings array with a high weight or just append.
           // HDBScan requires sufficient density, so we'll just log that seed words were processed for now,
           // as true seeded topic modeling requires modifying the distance metric or clustering approach heavily.
           // The simplest approach is prepending them and letting them guide the projection.
           embeddings.unshift(seedEmbeds[0]);
       }
    }

    if (!config?.seedWords) {
        await PipelineCache.saveCheckpoint(cacheKeyEmbeddings, 'embeddings', embeddings);
    }

    ctx.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'embeddings', status: 'completed' }
    });
  }

  // Phase 7: Memory Hygiene
  // Explicitly dispose of the ONNX inference session to free up GPU and system memory
  // before proceeding to memory-heavy graph operations (UMAP/HDBSCAN).
  await EmbeddingPipeline.dispose();

  // Phase 3/4: UMAP & Clustering OR Zero-Shot Classification
  if (config?.zeroShotCategories) {
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'clustering', status: 'running', message: 'Performing Zero-Shot Classification...' }
      });
      // Bypass HDBSCAN, assign directly via cosine similarity to category embeddings
      const zsResult = await ZeroShotClassifier.classify(embeddings, config.zeroShotCategories);

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
  } else {
      const umapCache = await PipelineCache.loadCheckpoint(cacheKeyUmap);
      if (umapCache && umapCache.data) {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'umap', status: 'completed', message: 'Loaded UMAP projection from cache.' }
        });
        reducedEmbeddings = umapCache.data;
      } else {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'umap', status: 'running', message: 'Reducing dimensions...' }
        });

        const nEpochs = 500; // Default number of epochs for UMAP. Might want to pass this down in options.
        reducedEmbeddings = await UMAPReducer.reduceAsync(embeddings, {}, (epoch) => {
          // Report progress periodically to avoid flooding message queue
          if (epoch % 10 === 0) {
            const progressPercent = Math.round((epoch / nEpochs) * 100);
            ctx.postMessage({
              type: 'PROGRESS',
              payload: { phase: 'umap', status: 'running', progress: progressPercent, message: `Reducing dimensions (${epoch}/${nEpochs})...` }
            });
          }
        });

        await PipelineCache.saveCheckpoint(cacheKeyUmap, 'umap', reducedEmbeddings);

        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'umap', status: 'completed' }
        });
      }

      const clusteringCache = await PipelineCache.loadCheckpoint(cacheKeyClustering);
      if (clusteringCache && clusteringCache.data) {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'clustering', status: 'completed', message: 'Loaded clustering from cache.' }
        });
        clusteringResult = clusteringCache.data;
      } else {
        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'clustering', status: 'running', message: 'Clustering documents...' }
        });

        clusteringResult = await ClusteringEngine.clusterAsync(reducedEmbeddings);
        await PipelineCache.saveCheckpoint(cacheKeyClustering, 'clustering', clusteringResult);

        ctx.postMessage({
          type: 'PROGRESS',
          payload: { phase: 'clustering', status: 'completed' }
        });
      }
  }

    // Phase 5: Lexical Extraction
  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'lexical', status: 'running', message: 'Extracting vocabulary and terms...' }
  });

  // We need to reassemble labels into a regular array to use safely with the LexicalExtractor
  let finalLabels = Array.isArray(clusteringResult.labels) ? clusteringResult.labels : Array.from(clusteringResult.labels);

  // Remove the seed document labels from final representation if guided
  if (config?.seedWords) {
      finalLabels = finalLabels.slice(config.seedWords.length);
  }

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
      const translated = await CrossLingualTranslator.translate(originalNames, { tgtLang: config.tgtLang });
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

  // Ensure we strip the prepended seed words from our data arrays before returning to UI
  let outLabels = finalLabels;
  let outProbs = clusteringResult.probabilities;
  let outUmap = reducedEmbeddings;
  let outEmbeddings = embeddings;

  if (config?.seedWords) {
      const seedLen = config.seedWords.length;
      // Note: finalLabels is already sliced earlier in the pipeline
      outProbs = outProbs.slice(seedLen);
      outUmap = outUmap.slice(seedLen);
      outEmbeddings = outEmbeddings.slice(seedLen);
  }

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
      const { Centroids } = await import('../math/centroids');
      const centroidsMap = Centroids.calculate(outEmbeddings, outLabels as number[]);

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
    labels: outLabels,
    probabilities: outProbs,
    topicLabels: displayLabels,
    topicSizes: topicSizes,
    hoverSummaries: hoverSummaries,
    uniqueClasses: lexicalResult.uniqueClasses,
    umap: outUmap,
    topicWords: topWordsPerTopic, // Included to drive the TopicBarchart
    similarityMatrix: similarityMatrix, // Included to drive Heatmap
    documentDistributions: documentDistributions // Included to drive Fuzzy Distribution Barchart
  };

  try {
    // Generate Report Data object for UI to easily consume
    const reportData = {
        totalDocuments: documents.length,
        coherenceScore: coherenceScore,
        topics: lexicalResult.uniqueClasses.map((label, idx) => ({
            id: label,
            name: topWordsPerTopic[idx].slice(0, 3).map((w: any) => w.word).join(', '),
            size: topicSizes[idx],
            words: topWordsPerTopic[idx],
            summary: hoverSummaries[idx]
        }))
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
