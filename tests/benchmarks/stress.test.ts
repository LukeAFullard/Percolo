import { describe, it, expect } from 'vitest';
import { EmbeddingPipeline } from '../../src/nlp/embeddings';
import { UMAPReducer } from '../../src/math/umap';
import { ClusteringEngine } from '../../src/math/clustering';
import { LexicalExtractor } from '../../src/nlp/lexical';
import { CTFIDF } from '../../src/math/ctfidf';

function generateSyntheticDataset(size: number): string[] {
    const categories = [
        ["The stock market crashed today leading to a massive selloff in technology sectors.", "Investors are worried about the inflation report and upcoming federal reserve rate hikes.", "Cryptocurrency markets remain highly volatile after new regulations were announced."],
        ["Artificial intelligence models are requiring more GPU compute power than ever before.", "Software engineering paradigms are shifting towards test-driven development.", "The new quantum processor exceeded all benchmark expectations for cryptography."],
        ["The patient's blood pressure dropped significantly after administering the new intravenous drug.", "Clinical trials for the cancer vaccine are moving into phase three next week.", "Doctors emphasize the importance of a balanced diet and regular cardiovascular exercise."]
    ];

    const dataset: string[] = [];
    for (let i = 0; i < size; i++) {
        // Pick a random category
        const cat = categories[i % categories.length];
        // Pick a random sentence from that category
        const sentence = cat[Math.floor(Math.random() * cat.length)];
        // Add some noise to make embeddings slightly unique
        const noise = ` Item ${i} index ${Math.random().toString(36).substring(7)}`;
        dataset.push(sentence + noise);
    }
    return dataset;
}

describe('Stress Test - High Volume Dataset', () => {
    it('should successfully process 500 documents without crashing', async () => {
        const DATASET_SIZE = 500;
        const dataset = generateSyntheticDataset(DATASET_SIZE);

        const start = performance.now();
        const initialMemory = process.memoryUsage();
        console.log(`Starting Stress Test validation on ${DATASET_SIZE} documents...`);

        console.log("Generating embeddings...");
        const embeddings = await EmbeddingPipeline.embedTexts(dataset, { modelName: 'Xenova/all-MiniLM-L6-v2' });
        const embedTime = performance.now();
        console.log(`Embeddings generated in ${Math.round(embedTime - start)}ms`);

        console.log("Reducing dimensions via UMAP...");
        // Use more realistic UMAP params for larger datasets
        const umapCoords = await UMAPReducer.reduceAsync(embeddings, { nNeighbors: 15, minDist: 0.1, nComponents: 2, randomState: 42 });
        const umapTime = performance.now();
        console.log(`UMAP completed in ${Math.round(umapTime - embedTime)}ms`);

        console.log("Clustering via HDBSCAN...");
        const clustering = await ClusteringEngine.clusterAsync(umapCoords, { minClusterSize: 10 });
        const clusterTime = performance.now();
        console.log(`Clustering completed in ${Math.round(clusterTime - umapTime)}ms`);

        console.log("Extracting Lexical CSR...");
        const csrData = LexicalExtractor.extract(dataset, clustering.labels, { minDf: 2 });

        console.log("Calculating c-TF-IDF...");
        const denseMatrix = csrData.matrix.toDense();
        const ctfidfScores = CTFIDF.calculate(denseMatrix, csrData.globalTermFrequencies, csrData.averageClassSize, { vocabulary: csrData.vocabulary });
        const topicWords = CTFIDF.extractTopWordsPerClass(ctfidfScores, csrData.vocabulary, 5);

        const finalTime = performance.now();
        console.log(`c-TF-IDF completed in ${Math.round(finalTime - clusterTime)}ms`);
        console.log(`Total Pipeline time: ${Math.round(finalTime - start)}ms`);

        const finalMemory = process.memoryUsage();
        const heapUsedDelta = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
        console.log(`Memory Usage Delta (Heap Used): ${heapUsedDelta.toFixed(2)} MB`);

        expect(embeddings.length).toBe(DATASET_SIZE);
        expect(topicWords.length).toBeGreaterThan(0);

    }, 120000); // 120s timeout for large processing
});