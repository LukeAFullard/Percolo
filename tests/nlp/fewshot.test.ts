import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FewShotClassifier } from '../../src/nlp/fewshot';
import { EmbeddingPipeline } from '../../src/nlp/embeddings';

// Mock EmbeddingPipeline to return deterministic embeddings
vi.mock('../../src/nlp/embeddings', () => ({
  EmbeddingPipeline: {
    embedTexts: vi.fn(async (texts: string[]) => {
       return texts.map(t => {
           if (t.includes('sports')) return [1.0, 0.0];
           if (t.includes('finance')) return [0.0, 1.0];
           return [0.5, 0.5]; // Neutral/fallback
       });
    })
  }
}));

describe('FewShotClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should embed examples and correctly classify new document embeddings', async () => {
    const docEmbeddings = [
      [0.9, 0.1], // Leans sports
      [0.1, 0.9]  // Leans finance
    ];

    const categoriesMap = {
      "Sports": ["football is a sports game", "baseball sports"],
      "Finance": ["stock market finance", "banking and finance"]
    };

    const results = await FewShotClassifier.classify(docEmbeddings, categoriesMap);

    expect(results.length).toBe(2);
    expect(results[0].label).toBe("Sports");
    expect(results[0].similarity).toBeGreaterThan(0.9);
    expect(results[1].label).toBe("Finance");
    expect(results[1].similarity).toBeGreaterThan(0.9);

    // EmbeddingPipeline should have been called for each category
    expect(EmbeddingPipeline.embedTexts).toHaveBeenCalledTimes(2);
  });
});
