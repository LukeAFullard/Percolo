/// <reference lib="webworker" />

import { EmbeddingPipeline } from '../nlp/embeddings';
import { UMAPReducer } from '../math/umap';
import { ClusteringEngine } from '../math/clustering';
import { PipelineCache } from '../io/cache';

// Declare standard web worker scope
const ctx: Worker = self as any;

ctx.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

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

async function runPipeline(documents: string[]) {
  let embeddings: number[][];
  let reducedEmbeddings: number[][];
  let clusteringResult: any;

  const docHash = generateHash(documents);
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

    embeddings = await EmbeddingPipeline.embedTexts(documents);
    await PipelineCache.saveCheckpoint(cacheKeyEmbeddings, 'embeddings', embeddings);

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

  // Support graceful degradation for large results if SharedArrayBuffer/COOP is unavailable
  const finalPayload = {
    labels: clusteringResult.labels,
    probabilities: clusteringResult.probabilities
  };

  try {
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
