import { describe, it, expect } from 'vitest';
import { Similarity } from '../../src/math/similarity';

describe('Similarity Module', () => {
  it('should calculate cosine similarity correctly', () => {
    const vecA = [1, 2, 3];
    const vecB = [1, 2, 3];
    expect(Similarity.cosine(vecA, vecB)).toBeCloseTo(1.0);

    const vecC = [-1, -2, -3];
    expect(Similarity.cosine(vecA, vecC)).toBeCloseTo(-1.0);

    const vecD = [1, 0, 0];
    const vecE = [0, 1, 0];
    expect(Similarity.cosine(vecD, vecE)).toBeCloseTo(0.0);
  });

  it('should handle zero vectors gracefully', () => {
    const vecA = [1, 2, 3];
    const vecB = [0, 0, 0];
    expect(Similarity.cosine(vecA, vecB)).toBe(0);
    expect(Similarity.cosine(vecB, vecB)).toBe(0);
  });

  it('should calculate multiple cosine similarities', () => {
    const target = [1, 0, 0];
    const vectors = [[1, 0, 0], [0, 1, 0], [-1, 0, 0]];
    const scores = Similarity.cosineMultiple(target, vectors);

    expect(scores.length).toBe(3);
    expect(scores[0]).toBeCloseTo(1.0);
    expect(scores[1]).toBeCloseTo(0.0);
    expect(scores[2]).toBeCloseTo(-1.0);
  });
});
