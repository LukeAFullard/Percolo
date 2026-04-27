import { describe, it, expect } from 'vitest';
import { EmbeddingPipeline } from '../../src/nlp/embeddings';

function generateSyntheticDataset(size: number): string[] {
    const categories = [
        ["The stock market crashed today leading to a massive selloff in technology sectors.", "Investors are worried about the inflation report and upcoming federal reserve rate hikes.", "Cryptocurrency markets remain highly volatile after new regulations were announced."],
        ["Artificial intelligence models are requiring more GPU compute power than ever before.", "Software engineering paradigms are shifting towards test-driven development.", "The new quantum processor exceeded all benchmark expectations for cryptography."],
        ["The patient's blood pressure dropped significantly after administering the new intravenous drug.", "Clinical trials for the cancer vaccine are moving into phase three next week.", "Doctors emphasize the importance of a balanced diet and regular cardiovascular exercise."]
    ];

    const dataset: string[] = [];
    for (let i = 0; i < size; i++) {
        const cat = categories[i % categories.length];
        const sentence = cat[Math.floor(Math.random() * cat.length)];
        const noise = ` Item ${i} index ${Math.random().toString(36).substring(7)}`;
        dataset.push(sentence + noise);
    }
    return dataset;
}

// Emulate worker context
const mockCtx = {
    postMessage: (msg: any) => { /* console.log(msg) */ }
};

describe('Pipeline Component Sizing Benchmark', () => {
    const sizes = [5000]; // Test larger datasets

    for (const size of sizes) {
        it(`should profile pipeline for ${size} documents`, async () => {
            const dataset = generateSyntheticDataset(size);

            console.log(`\n=== Pipeline Profile: ${size} Documents ===`);
            let start = performance.now();

            // 1. Embeddings (WASM since WebGPU adapters aren't in this sandbox environment)
            let stepStart = performance.now();
            await EmbeddingPipeline.dispose();
            const embeddings = await EmbeddingPipeline.embedTexts(dataset, { useWebGPU: false, modelName: 'Xenova/all-MiniLM-L6-v2' });
            let embedTime = performance.now() - stepStart;
            console.log(`Embeddings Time: ${Math.round(embedTime)}ms`);

            // Emulate worker UMAP & Clustering to test the Sampling Architecture!
            const { UMAPReducer } = await import('../../src/math/umap');
            const { ClusteringEngine } = await import('../../src/math/clustering');
            const { PipelineCache } = await import('../../src/io/cache');
            await PipelineCache.clearCheckpoints(); // ensure clear cache

            stepStart = performance.now();

            const MAX_SAMPLED_DOCS = 2500;
            const isSampling = embeddings.length > MAX_SAMPLED_DOCS;

            let sampledIndices: number[] = [];
            let sampledEmbeddings: number[][] = [];
            let unSampledIndices: number[] = [];

            if (isSampling) {
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

            let sampledReducedEmbeddings = await UMAPReducer.reduceAsync(sampledEmbeddings, {}, (epoch) => {});
            let umapTime = performance.now() - stepStart;
            console.log(`UMAP Time (sampled): ${Math.round(umapTime)}ms`);

            stepStart = performance.now();
            let sampledClusteringResult = await ClusteringEngine.clusterAsync(sampledReducedEmbeddings, { useLowMemoryFallback: false });

            let finalLabelsArray = new Array(embeddings.length).fill(-1);
            const probabilities = new Array(embeddings.length).fill(0);
            let reducedEmbeddings = new Array(embeddings.length).fill([0, 0]);

            const sampledLabels = Array.isArray(sampledClusteringResult.labels) ? sampledClusteringResult.labels : Array.from(sampledClusteringResult.labels);
            for (let i = 0; i < sampledIndices.length; i++) {
               const globalIdx = sampledIndices[i];
               finalLabelsArray[globalIdx] = sampledLabels[i];
               probabilities[globalIdx] = sampledClusteringResult.probabilities[i];
               reducedEmbeddings[globalIdx] = sampledReducedEmbeddings[i];
            }

            if (isSampling) {
               const { Centroids: LocalCentroids } = await import('../../src/math/centroids');
               const { InferenceEngine } = await import('../../src/nlp/inference');

               const sampledCentroids = LocalCentroids.calculate(sampledEmbeddings, sampledLabels as number[]);
               const unSampledEmbeddings = unSampledIndices.map(i => embeddings[i]);
               const inferenceResults = InferenceEngine.transform(unSampledEmbeddings, sampledCentroids);

               for (let i = 0; i < unSampledIndices.length; i++) {
                   const globalIdx = unSampledIndices[i];
                   const res = inferenceResults[i];
                   finalLabelsArray[globalIdx] = res.similarity >= 0.5 ? res.label : -1;
                   probabilities[globalIdx] = res.similarity;
               }
            }

            let clusterTime = performance.now() - stepStart;
            console.log(`HDBSCAN + Partial Fit Time: ${Math.round(clusterTime)}ms`);

            let totalTime = performance.now() - start;
            console.log(`Total Time: ${Math.round(totalTime)}ms`);

            expect(embeddings.length).toBe(size);
        }, 3600000); // 60 min timeout
    }
});
