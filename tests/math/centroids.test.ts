import { describe, it, expect } from 'vitest';
import { Centroids } from '../../src/math/centroids';

describe('Centroids Module', () => {
  it('should calculate centroids correctly', () => {
    const embeddings = [
      [1, 2],
      [3, 4], // Class 0 sum = [4, 6], count = 2 -> Centroid = [2, 3]
      [0, 0],
      [2, 2]  // Class 1 sum = [2, 2], count = 2 -> Centroid = [1, 1]
    ];
    const labels = [0, 0, 1, 1];

    const result = Centroids.calculate(embeddings, labels);

    expect(result.size).toBe(2);
    expect(result.get(0)).toEqual([2, 3]);
    expect(result.get(1)).toEqual([1, 1]);
  });

  it('should handle negative noise class (-1)', () => {
    const embeddings = [
      [1, 1],
      [2, 2], // Noise
      [3, 3],
      [3, 3]  // Class 0
    ];
    const labels = [-1, -1, 0, 0];

    const result = Centroids.calculate(embeddings, labels);
    expect(result.size).toBe(2);
    expect(result.get(-1)).toEqual([1.5, 1.5]);
    expect(result.get(0)).toEqual([3, 3]);
  });

  it('should return empty map for invalid inputs', () => {
    const result1 = Centroids.calculate([], []);
    expect(result1.size).toBe(0);

    const result2 = Centroids.calculate([[1, 2]], [0, 1]); // Mismatched lengths
    expect(result2.size).toBe(0);
  });
});
