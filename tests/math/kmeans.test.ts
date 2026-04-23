import { describe, it, expect } from 'vitest';
import { KMeansEngine } from '../../src/math/kmeans';

describe('KMeansEngine', () => {
  it('should cluster points correctly into distinct groups', () => {
    // 4 points clearly separated into 2 groups
    const embeddings = [
      [1, 1],
      [1.1, 1.1],
      [10, 10],
      [10.1, 10.1]
    ];

    const labels = KMeansEngine.cluster(embeddings, 2);

    expect(labels.length).toBe(4);

    // The first two should have the same label, and the last two should have the same label
    expect(labels[0]).toBe(labels[1]);
    expect(labels[2]).toBe(labels[3]);

    // The two groups should have different labels
    expect(labels[0]).not.toBe(labels[2]);
  });

  it('should handle edge cases', () => {
    expect(KMeansEngine.cluster([], 2)).toEqual([]);
    expect(KMeansEngine.cluster([[1,2]], 2)).toEqual([0]); // Fewer points than k
  });

  it('should assign valid labels (0 to k-1)', () => {
      const embeddings = Array.from({length: 20}, () => [Math.random() * 10, Math.random() * 10]);
      const k = 3;
      const labels = KMeansEngine.cluster(embeddings, k);

      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBeLessThanOrEqual(k); // Could be less if a cluster became empty, but should generally be k
      for (const label of labels) {
          expect(label).toBeGreaterThanOrEqual(0);
          expect(label).toBeLessThan(k);
      }
  });
});
