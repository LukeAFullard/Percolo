import { describe, it, expect } from 'vitest';
import { UMAPReducer } from '../src/math/umap';

describe('UMAPReducer', () => {
  it('should handle empty input', () => {
    const result = UMAPReducer.reduce([]);
    expect(result).toEqual([]);
  });

  it('should reduce dimensions correctly', () => {
    // Generate some dummy high-dimensional data
    const embeddings: number[][] = [];
    for (let i = 0; i < 20; i++) {
      const vec = new Array(384).fill(0).map(() => Math.random());
      embeddings.push(vec);
    }

    // Since nNeighbors is 15 by default, 20 samples is enough
    const result = UMAPReducer.reduce(embeddings, { nComponents: 2 });

    expect(result.length).toBe(20);
    expect(result[0].length).toBe(2);
  });

  it('should produce reproducible results with a fixed seed', () => {
    const embeddings: number[][] = [];
    for (let i = 0; i < 20; i++) {
      // Use a fixed pseudo-randomness for the input data too
      const vec = new Array(10).fill(0).map((_, idx) => (i * idx) % 1.0);
      embeddings.push(vec);
    }

    const random1 = UMAPReducer.seededRandom(42);
    const result1 = UMAPReducer.reduce(embeddings, { nComponents: 2, random: random1 });

    const random2 = UMAPReducer.seededRandom(42);
    const result2 = UMAPReducer.reduce(embeddings, { nComponents: 2, random: random2 });

    // Ensure the results are exactly the same
    expect(result1).toEqual(result2);
  });

  it('should produce different results with different seeds', () => {
    const embeddings: number[][] = [];
    for (let i = 0; i < 20; i++) {
      const vec = new Array(10).fill(0).map((_, idx) => (i * idx) % 1.0);
      embeddings.push(vec);
    }

    const random1 = UMAPReducer.seededRandom(42);
    const result1 = UMAPReducer.reduce(embeddings, { nComponents: 2, random: random1 });

    const random2 = UMAPReducer.seededRandom(99);
    const result2 = UMAPReducer.reduce(embeddings, { nComponents: 2, random: random2 });

    // Due to floating point math and initial layout, they should diverge
    expect(result1).not.toEqual(result2);
  });
});
