import { describe, it, expect } from 'vitest';
import { ClusteringEngine } from '../src/math/clustering';

describe('ClusteringEngine', () => {
  it('should handle empty input', () => {
    const result = ClusteringEngine.cluster([]);
    expect(result.labels).toEqual([]);
    expect(result.probabilities).toEqual([]);
  });

  it('should return noise if dataset is smaller than minClusterSize', () => {
    // Generate 3 random points
    const points = [
      [0.1, 0.2],
      [0.2, 0.1],
      [0.15, 0.15]
    ];
    // Set minClusterSize to 5, which is larger than the dataset
    const result = ClusteringEngine.cluster(points, 5);

    expect(result.labels).toEqual([-1, -1, -1]);
    expect(result.probabilities.length).toBe(3);
  });

  it('should correctly cluster clearly separated dense regions', () => {
    const cluster1 = Array(15).fill(0).map(() => [Math.random() * 0.1, Math.random() * 0.1]);
    const cluster2 = Array(15).fill(0).map(() => [10 + Math.random() * 0.1, 10 + Math.random() * 0.1]);
    const noise = [[5, 5], [4, 6]];

    const embeddings = [...cluster1, ...cluster2, ...noise];

    const result = ClusteringEngine.cluster(embeddings, 5);

    expect(result.labels.length).toBe(32);
    expect(result.probabilities.length).toBe(32);

    // The noise points should ideally be labeled as -1
    const noiseLabel1 = result.labels[30];
    const noiseLabel2 = result.labels[31];
    expect(noiseLabel1).toBe(-1);
    expect(noiseLabel2).toBe(-1);

    // The two clusters should have distinct, valid labels (e.g., 0 and 1, though order is not guaranteed)
    const labelSet = new Set(result.labels);
    expect(labelSet.size).toBeGreaterThanOrEqual(3); // Noise (-1) + at least 2 clusters
    expect(labelSet.has(-1)).toBe(true);
  });
});
