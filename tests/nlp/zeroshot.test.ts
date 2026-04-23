import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZeroShotClassifier } from '../../src/nlp/zeroshot';
import { EmbeddingPipeline } from '../../src/nlp/embeddings';
import { Similarity } from '../../src/math/similarity';

vi.mock('../../src/nlp/embeddings', () => ({
  EmbeddingPipeline: {
    embedTexts: vi.fn(),
  },
}));

vi.mock('../../src/math/similarity', () => ({
  Similarity: {
    cosineMultiple: vi.fn(),
  },
}));

describe('ZeroShotClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array if document embeddings are empty', async () => {
    const results = await ZeroShotClassifier.classify([], ['sports']);
    expect(results).toEqual([]);
  });

  it('should return empty array if category labels are empty', async () => {
    const results = await ZeroShotClassifier.classify([[0.1, 0.2]], []);
    expect(results).toEqual([]);
  });

  it('should classify documents correctly', async () => {
    const docEmbeddings = [
      [0.9, 0.1], // Similar to "sports"
      [0.1, 0.9], // Similar to "politics"
    ];
    const categoryLabels = ['sports', 'politics'];
    const categoryEmbeddings = [
      [0.8, 0.2], // sports
      [0.2, 0.8], // politics
    ];

    vi.mocked(EmbeddingPipeline.embedTexts).mockResolvedValue(categoryEmbeddings);

    // Mock similarities for doc 1
    vi.mocked(Similarity.cosineMultiple).mockReturnValueOnce([0.95, 0.2]);
    // Mock similarities for doc 2
    vi.mocked(Similarity.cosineMultiple).mockReturnValueOnce([0.2, 0.95]);

    const results = await ZeroShotClassifier.classify(docEmbeddings, categoryLabels);

    expect(EmbeddingPipeline.embedTexts).toHaveBeenCalledWith(categoryLabels, {});
    expect(Similarity.cosineMultiple).toHaveBeenCalledTimes(2);

    expect(results).toEqual([
      { label: 'sports', similarity: 0.95 },
      { label: 'politics', similarity: 0.95 },
    ]);
  });
});
