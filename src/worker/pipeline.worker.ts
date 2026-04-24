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

  // Send final result
  ctx.postMessage({
    type: 'RESULT',
    payload: {
        labels: clusteringResult.labels,
        probabilities: clusteringResult.probabilities
    }
  });
}
