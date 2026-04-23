import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuidedTopicModeling } from '../../src/nlp/guided';
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

describe('GuidedTopicModeling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return -1s if document embeddings are empty', async () => {
    const result = await GuidedTopicModeling.getPriors([], [['space', 'mars']]);
    expect(result.seedLabels).toEqual([]);
  });

  it('should return -1s if seed topics are empty', async () => {
    const result = await GuidedTopicModeling.getPriors([[0.1, 0.2], [0.3, 0.4]], []);
    expect(result.seedLabels).toEqual([-1, -1]);
  });

  it('should assign seed labels based on highest similarity above threshold', async () => {
    const docEmbeddings = [
      [0.9, 0.1], // matches seed 0
      [0.1, 0.9], // matches seed 1
      [0.5, 0.5], // matches neither (below threshold)
    ];
    const seedTopics = [
      ['space', 'mars', 'orbit'], // Seed 0
      ['politics', 'election', 'vote'], // Seed 1
    ];
    const seedEmbeddings = [
      [0.85, 0.15],
      [0.15, 0.85],
    ];

    vi.mocked(EmbeddingPipeline.embedTexts).mockResolvedValue(seedEmbeddings);

    // Mock similarities for doc 1
    vi.mocked(Similarity.cosineMultiple).mockReturnValueOnce([0.95, 0.2]);
    // Mock similarities for doc 2
    vi.mocked(Similarity.cosineMultiple).mockReturnValueOnce([0.2, 0.95]);
    // Mock similarities for doc 3
    vi.mocked(Similarity.cosineMultiple).mockReturnValueOnce([0.4, 0.45]);

    const result = await GuidedTopicModeling.getPriors(docEmbeddings, seedTopics, { similarityThreshold: 0.5 });

    // Ensure pseudo-documents were created correctly
    expect(EmbeddingPipeline.embedTexts).toHaveBeenCalledWith(
      ['space mars orbit', 'politics election vote'],
      {}
    );

    expect(Similarity.cosineMultiple).toHaveBeenCalledTimes(3);

    expect(result.seedLabels).toEqual([0, 1, -1]);
  });

  it('should use default threshold if none provided', async () => {
    const docEmbeddings = [[0.9, 0.1]];
    const seedTopics = [['space']];
    const seedEmbeddings = [[0.9, 0.1]];

    vi.mocked(EmbeddingPipeline.embedTexts).mockResolvedValue(seedEmbeddings);
    vi.mocked(Similarity.cosineMultiple).mockReturnValueOnce([0.49]); // Below default 0.5

    const result = await GuidedTopicModeling.getPriors(docEmbeddings, seedTopics);

    expect(result.seedLabels).toEqual([-1]);
  });
});
