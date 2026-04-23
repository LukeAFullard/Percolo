import { describe, it, expect } from 'vitest';
import { ClusteringEngine } from '../src/math/clustering';

describe('ClusteringEngine', () => {
  it('should handle empty input gracefully', () => {
    const result = ClusteringEngine.cluster([]);
    expect(result.labels).toEqual([]);
    expect(result.probabilities).toEqual([]);
  });

  it('should fallback to noise if points < minClusterSize', () => {
    // 3 points, default minClusterSize is 5
    const embeddings = [[1, 1], [2, 2], [3, 3]];
    const result = ClusteringEngine.cluster(embeddings);

    expect(result.labels).toEqual([-1, -1, -1]);
    expect(result.probabilities).toEqual([0, 0, 0]);
  });

  it('should cluster normally when points >= minClusterSize', () => {
      // 10 points grouped tightly into two clusters
      const embeddings = [
          [1, 1], [1.1, 1.1], [0.9, 0.9], [1, 1.1], [1.1, 1],
          [10, 10], [10.1, 10.1], [9.9, 9.9], [10, 10.1], [10.1, 10]
      ];

      const result = ClusteringEngine.cluster(embeddings, { minClusterSize: 4 });

      expect(result.labels.length).toBe(10);
      expect(result.probabilities.length).toBe(10);

      // Verify that the first 5 are in the same cluster, and the next 5 are in another
      const cluster1 = result.labels.slice(0, 5);
      const cluster2 = result.labels.slice(5, 10);

      // Check all elements in cluster1 are the same
      expect(new Set(cluster1).size).toBe(1);
      expect(new Set(cluster2).size).toBe(1);

      // Check they are distinct clusters
      expect(cluster1[0]).not.toBe(cluster2[0]);
  });

  it('should use KMeans fallback when requested', () => {
      const embeddings = [
          [1, 1], [1.1, 1.1], [0.9, 0.9], [1, 1.1], [1.1, 1],
          [10, 10], [10.1, 10.1], [9.9, 9.9], [10, 10.1], [10.1, 10]
      ];

      const result = ClusteringEngine.cluster(embeddings, { useLowMemoryFallback: true, fallbackK: 2 });

      expect(result.labels.length).toBe(10);
      // KMeans returns 1.0 probability
      expect(result.probabilities[0]).toBe(1.0);

      const cluster1 = result.labels.slice(0, 5);
      const cluster2 = result.labels.slice(5, 10);

      expect(new Set(cluster1).size).toBe(1);
      expect(new Set(cluster2).size).toBe(1);
      expect(cluster1[0]).not.toBe(cluster2[0]);
  });
});
