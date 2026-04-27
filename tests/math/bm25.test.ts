import { describe, it, expect } from 'vitest';
import { BM25 } from '../../src/math/bm25';
import { CTFIDF } from '../../src/math/ctfidf';

describe('BM25 Calculation', () => {
  it('should calculate BM25 scores correctly', () => {
    const classTermFrequencies = [
      [10, 0, 5],
      [2, 8, 1]
    ];
    const globalTermFrequencies = [12, 8, 6];
    const classSizes = [15, 11]; // total terms per class
    const averageClassSize = 13;

    const result = BM25.calculate(
      classTermFrequencies,
      globalTermFrequencies,
      averageClassSize,
      classSizes
    );

    expect(result.length).toBe(2);
    expect(result[0].length).toBe(3);

    // Higher frequency terms should generally score higher, but saturated
    expect(result[0][0]).toBeGreaterThan(result[0][2]);
    expect(result[1][1]).toBeGreaterThan(result[1][0]);
  });

  it('should apply seed multipliers', () => {
    const classTermFrequencies = [[5, 5]];
    const globalTermFrequencies = [5, 5];
    const classSizes = [10];
    const averageClassSize = 10;

    const vocab = ['apple', 'banana'];
    const seed = ['banana'];

    const result = BM25.calculate(
      classTermFrequencies,
      globalTermFrequencies,
      averageClassSize,
      classSizes,
      { seedWords: seed, vocabulary: vocab, seedMultiplier: 2.0 }
    );

    // banana should score higher than apple because of the multiplier
    expect(result[0][1]).toBeGreaterThan(result[0][0]);
  });

  it('can be extracted via CTFIDF extractTopWordsPerClass', () => {
      const classTermFrequencies = [
          [10, 1, 5],
      ];
      const globalTermFrequencies = [10, 1, 5];
      const classSizes = [16];
      const averageClassSize = 16;

      const result = BM25.calculate(
        classTermFrequencies,
        globalTermFrequencies,
        averageClassSize,
        classSizes
      );

      const extracted = CTFIDF.extractTopWordsPerClass(result, ['word0', 'word1', 'word2'], 2);
      expect(extracted[0].length).toBe(2);
      expect(extracted[0][0].word).toBe('word0');
  });
});
