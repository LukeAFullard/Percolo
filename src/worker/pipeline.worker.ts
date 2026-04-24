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

async function runPipeline(documents: string[]) {
  let embeddings: number[][];
  let reducedEmbeddings: number[][];
  let clusteringResult: any;

  // Phase 2: Embeddings
  const embeddingsCache = await PipelineCache.loadCheckpoint('embeddings');
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
    await PipelineCache.saveCheckpoint('embeddings', 'embeddings', embeddings);

    ctx.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'embeddings', status: 'completed' }
    });
  }

  // Phase 3: UMAP
  const umapCache = await PipelineCache.loadCheckpoint('umap');
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

    await PipelineCache.saveCheckpoint('umap', 'umap', reducedEmbeddings);

    ctx.postMessage({
      type: 'PROGRESS',
      payload: { phase: 'umap', status: 'completed' }
    });
  }

  // Phase 4: Clustering
  const clusteringCache = await PipelineCache.loadCheckpoint('clustering');
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
    await PipelineCache.saveCheckpoint('clustering', 'clustering', clusteringResult);

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
