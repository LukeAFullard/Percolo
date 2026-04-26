import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KeyphraseExtractor } from '../../src/nlp/keyphrase';
import { EmbeddingPipeline } from '../../src/nlp/embeddings';

describe('KeyphraseExtractor (KeyBERT)', () => {

  afterAll(async () => {
      await EmbeddingPipeline.dispose();
  });

  it('should handle empty or whitespace documents gracefully', async () => {
    const resultsEmpty = await KeyphraseExtractor.extract("");
    expect(resultsEmpty).toEqual([]);

    const resultsSpace = await KeyphraseExtractor.extract("   ");
    expect(resultsSpace).toEqual([]);
  });

  it('should extract sensible keyphrases from a document', async () => {
    const document = "Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data.";

    // We use a fast, quantized model for testing
    const options = {
        ngramRange: [1, 2] as [number, number],
        topK: 3,
        embeddingOptions: { modelName: 'Xenova/all-MiniLM-L6-v2' }
    };

    const keyphrases = await KeyphraseExtractor.extract(document, options);

    expect(keyphrases.length).toBeLessThanOrEqual(3);

    // Check that we got results and they have valid shapes
    for (const kp of keyphrases) {
        expect(typeof kp.phrase).toBe('string');
        expect(typeof kp.score).toBe('number');
        // Similarity scores should be between -1 and 1
        expect(kp.score).toBeGreaterThanOrEqual(-1);
        expect(kp.score).toBeLessThanOrEqual(1);
    }

    // We expect concepts like "machine learning" or "artificial intelligence" to score highly
    const phrases = keyphrases.map(k => k.phrase);
    const containsML = phrases.some(p => p.includes('machine learning') || p.includes('artificial intelligence') || p.includes('learning'));
    expect(containsML).toBe(true);

  }, 30000); // Allow time for model download
});
