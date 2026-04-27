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

describe('WebGPU vs WASM Benchmark', () => {
    const sizes = [100, 500, 1000, 2500]; // Go up to 2500 to see limits

    for (const size of sizes) {
        it(`should profile ${size} documents`, async () => {
            const dataset = generateSyntheticDataset(size);

            // WASM test
            console.log(`\n--- Profiling WASM for ${size} documents ---`);
            let start = performance.now();
            let initialMemory = process.memoryUsage();

            // Re-initialize to ensure clean state
            await EmbeddingPipeline.dispose();
            const wasmEmbeddings = await EmbeddingPipeline.embedTexts(dataset, { useWebGPU: false, modelName: 'Xenova/all-MiniLM-L6-v2' });

            let time = performance.now() - start;
            let memory = (process.memoryUsage().heapUsed - initialMemory.heapUsed) / 1024 / 1024;

            console.log(`WASM Time: ${Math.round(time)}ms`);
            console.log(`WASM Memory Delta: ${memory.toFixed(2)} MB`);

            // WebGPU test
            console.log(`\n--- Profiling WebGPU for ${size} documents ---`);
            start = performance.now();
            initialMemory = process.memoryUsage();

            await EmbeddingPipeline.dispose();
            const webGpuEmbeddings = await EmbeddingPipeline.embedTexts(dataset, { useWebGPU: true, modelName: 'Xenova/all-MiniLM-L6-v2' });

            time = performance.now() - start;
            memory = (process.memoryUsage().heapUsed - initialMemory.heapUsed) / 1024 / 1024;

            console.log(`WebGPU Time: ${Math.round(time)}ms`);
            console.log(`WebGPU Memory Delta: ${memory.toFixed(2)} MB`);

            expect(wasmEmbeddings.length).toBe(size);
            expect(webGpuEmbeddings.length).toBe(size);
        }, 1200000); // 20 minutes timeout for very large test
    }
});
