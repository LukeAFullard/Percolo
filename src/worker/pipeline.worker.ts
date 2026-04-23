/// <reference lib="webworker" />

import { EmbeddingPipeline } from '../nlp/embeddings';
import { UMAPReducer } from '../math/umap';
import { ClusteringEngine } from '../math/clustering';

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
  // Phase 2: Embeddings
  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'embeddings', status: 'running', message: 'Generating embeddings...' }
  });

  const embeddings = await EmbeddingPipeline.embedTexts(documents);

  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'embeddings', status: 'completed' }
  });

  // Phase 3: UMAP
  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'umap', status: 'running', message: 'Reducing dimensions...' }
  });

  const nEpochs = 500; // Default number of epochs for UMAP. Might want to pass this down in options.
  const reducedEmbeddings = await UMAPReducer.reduceAsync(embeddings, {}, (epoch) => {
    // Report progress periodically to avoid flooding message queue
    if (epoch % 10 === 0) {
      const progressPercent = Math.round((epoch / nEpochs) * 100);
      ctx.postMessage({
        type: 'PROGRESS',
        payload: { phase: 'umap', status: 'running', progress: progressPercent, message: `Reducing dimensions (${epoch}/${nEpochs})...` }
      });
    }
  });

  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'umap', status: 'completed' }
  });

  // Phase 4: Clustering
  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'clustering', status: 'running', message: 'Clustering documents...' }
  });

  const clusteringResult = ClusteringEngine.cluster(reducedEmbeddings);

  ctx.postMessage({
    type: 'PROGRESS',
    payload: { phase: 'clustering', status: 'completed' }
  });

  // Send final result
  ctx.postMessage({
    type: 'RESULT',
    payload: {
        labels: clusteringResult.labels,
        probabilities: clusteringResult.probabilities
    }
  });
}
