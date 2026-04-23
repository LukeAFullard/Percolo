import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncrementalUpdater } from '../../src/nlp/incremental';
import { EmbeddingPipeline } from '../../src/nlp/embeddings';
import { InferenceEngine } from '../../src/nlp/inference';

vi.mock('../../src/nlp/embeddings', () => ({
  EmbeddingPipeline: {
    embedTexts: vi.fn(),
  },
}));

vi.mock('../../src/nlp/inference', () => ({
  InferenceEngine: {
    transform: vi.fn(),
  },
}));

describe('IncrementalUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array if new documents are empty', async () => {
    const centroids = new Map<number, number[]>();
    const results = await IncrementalUpdater.partialFit([], centroids);
    expect(results).toEqual([]);
  });

  it('should correctly embed and map documents to existing topics', async () => {
    const docs = ['A new space doc', 'A new politics doc'];
    const centroids = new Map<number, number[]>([
      [0, [0.8, 0.2]],
      [1, [0.2, 0.8]]
    ]);

    const mockEmbeddings = [[0.9, 0.1], [0.1, 0.9]];
    vi.mocked(EmbeddingPipeline.embedTexts).mockResolvedValue(mockEmbeddings);

    vi.mocked(InferenceEngine.transform).mockReturnValue([
      { label: 0, similarity: 0.95 },
      { label: 1, similarity: 0.95 }
    ]);

    const results = await IncrementalUpdater.partialFit(docs, centroids);

    expect(EmbeddingPipeline.embedTexts).toHaveBeenCalledWith(docs, {});
    expect(InferenceEngine.transform).toHaveBeenCalledWith(mockEmbeddings, centroids);

    expect(results).toEqual([
      { label: 0, similarity: 0.95 },
      { label: 1, similarity: 0.95 }
    ]);
  });

  it('should apply the similarity threshold to outlier documents', async () => {
    const docs = ['Some completely unrelated document'];
    const centroids = new Map<number, number[]>([[0, [0.8, 0.2]]]);

    vi.mocked(EmbeddingPipeline.embedTexts).mockResolvedValue([[0.5, 0.5]]);

    vi.mocked(InferenceEngine.transform).mockReturnValue([
      { label: 0, similarity: 0.4 } // Below the default 0.5 threshold
    ]);

    const results = await IncrementalUpdater.partialFit(docs, centroids);

    expect(results).toEqual([
      { label: -1, similarity: 0.4 }
    ]);
  });

  it('should use custom similarity threshold if provided', async () => {
    const docs = ['Some somewhat related document'];
    const centroids = new Map<number, number[]>([[0, [0.8, 0.2]]]);

    vi.mocked(EmbeddingPipeline.embedTexts).mockResolvedValue([[0.6, 0.4]]);

    vi.mocked(InferenceEngine.transform).mockReturnValue([
      { label: 0, similarity: 0.45 }
    ]);

    const results = await IncrementalUpdater.partialFit(docs, centroids, { similarityThreshold: 0.4 });

    expect(results).toEqual([
      { label: 0, similarity: 0.45 } // Passes the custom 0.4 threshold
    ]);
  });
});
