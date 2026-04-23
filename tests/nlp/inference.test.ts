import { describe, it, expect } from 'vitest';
import { InferenceEngine } from '../../src/nlp/inference';

describe('InferenceEngine', () => {
  it('should assign new embeddings to the most similar topic centroid', () => {
    const topicCentroids = new Map<number, number[]>([
      [0, [1, 0, 0]],
      [1, [0, 1, 0]],
      [-1, [0, 0, 1]] // Noise centroid just to test
    ]);

    const newEmbeddings = [
      [0.9, 0.1, 0],   // Should map to topic 0
      [0, 0.9, 0.1],   // Should map to topic 1
      [0, 0, 0.9],     // Should map to topic -1
      [0.5, 0.5, 0]    // Ties between 0 and 1, will pick the first one encountered (0)
    ];

    const results = InferenceEngine.transform(newEmbeddings, topicCentroids);

    expect(results.length).toBe(4);

    expect(results[0].label).toBe(0);
    expect(results[0].similarity).toBeGreaterThan(0.8);

    expect(results[1].label).toBe(1);
    expect(results[1].similarity).toBeGreaterThan(0.8);

    expect(results[2].label).toBe(-1);
    expect(results[2].similarity).toBeGreaterThan(0.8);

    expect(results[3].label).toBe(0);
  });

  it('should handle empty inputs', () => {
    const results1 = InferenceEngine.transform([], new Map([[0, [1]]]));
    expect(results1.length).toBe(0);

    const results2 = InferenceEngine.transform([[1]], new Map());
    expect(results2.length).toBe(0);
  });
});
