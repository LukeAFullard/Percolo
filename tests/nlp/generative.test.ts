import { describe, it, expect, afterAll } from 'vitest';
import { GenerativeSummarizer } from '../../src/nlp/generative';
import { SummarizationEngine } from '../../src/nlp/summarization';

describe('GenerativeSummarizer', () => {

  afterAll(async () => {
    await GenerativeSummarizer.dispose();
  });

  it('should handle empty or whitespace text gracefully', async () => {
    const summarizer = new GenerativeSummarizer();
    expect(await summarizer.summarize('')).toEqual([]);
    expect(await summarizer.summarize('   ')).toEqual([]);
  });

  it('should generate a summary using a mock Micro-LLM', async () => {
    // Note: In an actual CI environment, downloading a 500MB LLM will timeout or fail without a GPU.
    // We use a tiny proxy model (e.g., text-generation model) or test the interface logic directly.
    // Because testing real WebGPU LLMs in Vitest (Node) is unstable, we verify the interface and instantiation logic.

    const summarizer = new GenerativeSummarizer();

    // We expect the pipeline instantiation to fall back to WASM/CPU since WebGPU isn't available in Node,
    // and we expect the transformers.js pipeline to eventually return a string array.
    // For the sake of this test not timing out on GitHub Actions, we mock the pipeline response.

    // Mock the static getInstance to avoid downloading heavy models in CI
    const originalGetInstance = GenerativeSummarizer.getInstance;

    GenerativeSummarizer.getInstance = async () => {
        // Return a mock pipeline function
        return (async (prompt: string, options: any) => {
            return [{ generated_text: "Mocked generative summary." }];
        }) as any;
    };

    const result = await summarizer.summarize("A long text about space exploration and mars rovers discovering water.");

    expect(result.length).toBe(1);
    expect(result[0]).toBe("Mocked generative summary.");

    // Restore original
    GenerativeSummarizer.getInstance = originalGetInstance;
  });

  it('SummarizationEngine should implement ISummarizer correctly', async () => {
    const engine = new SummarizationEngine();
    const result = await engine.summarize("This is sentence one. This is sentence two.", { topK: 1 });
    expect(result.length).toBe(1);
    expect(result[0]).toBe("This is sentence one.");
  });

});
