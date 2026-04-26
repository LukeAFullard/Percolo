/// <reference lib="webworker" />

import { EmbeddingPipeline } from '../nlp/embeddings';
import { UMAPReducer } from '../math/umap';
import { ClusteringEngine } from '../math/clustering';
import { PipelineCache } from '../io/cache';
import { LexicalExtractor } from '../nlp/lexical';
import { CTFIDF } from '../math/ctfidf';
import { SummarizationEngine } from '../nlp/summarization';
import { GenerativeSummarizer } from '../nlp/generative';
import { PIIRedactor } from '../nlp/pii';

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

  // Phase 3: UMAP
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

  // Phase 4: Clustering
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

  const lexicalResult = LexicalExtractor.extract(processedDocuments, finalLabels as number[], { minDf: 2 });

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
    const ctfidfMatrix = CTFIDF.calculate(
        lexicalResult.matrix.toDense(),
        lexicalResult.globalTermFrequencies,
        lexicalResult.averageClassSize,
        {
           seedWords: config?.seedWords ? config.seedWords.flat() : [],
           vocabulary: lexicalResult.vocabulary
        }
    );
    topWordsPerTopic = CTFIDF.extractTopWordsPerClass(ctfidfMatrix, lexicalResult.vocabulary, 5);

    // Generate summaries
    const classDocumentsMap = new Map<number, string>();
    for (let i = 0; i < processedDocuments.length; i++) {
        const label = finalLabels[i] as number;
        classDocumentsMap.set(label, (classDocumentsMap.get(label) || '') + ' ' + processedDocuments[i]);
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
    for (const [label, text] of classDocumentsMap.entries()) {
        const summaryArr = await summarizer.summarize(text, { topK: 2 });
        summariesMap.set(label, summaryArr);
    }

    if (config?.useGenerativeSummarization) {
        await GenerativeSummarizer.dispose(); // clear WebGPU
    }

    hoverSummaries = lexicalResult.uniqueClasses.map(label => {
        const summaryLines = summariesMap.get(label) || [];
        return summaryLines.join(' ');
    });
  }

  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'ctfidf', status: 'completed' }
  });

// Support graceful degradation for large results if SharedArrayBuffer/COOP is unavailable
  const finalPayload: any = {
    labels: clusteringResult.labels,
    probabilities: clusteringResult.probabilities,
    topicLabels: topWordsPerTopic.map((words, i) => `Topic ${lexicalResult.uniqueClasses[i]}: ${words.slice(0, 3).map((w: any) => w.word).join(', ')}`),
    topicSizes: topicSizes,
    hoverSummaries: hoverSummaries,
    uniqueClasses: lexicalResult.uniqueClasses,
    umap: reducedEmbeddings
  };

  try {
    // Generate Report Data object for UI to easily consume
    const reportData = {
        totalDocuments: documents.length,
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
