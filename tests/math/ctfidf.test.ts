import { describe, it, expect } from 'vitest';
import { CTFIDF } from '../../src/math/ctfidf';

describe('CTFIDF Module', () => {
  it('should calculate c-TF-IDF scores correctly', () => {
    const classTermFrequencies = [
      [10, 5, 0, 0],
      [0, 0, 8, 2]
    ];

    const globalTermFrequencies = [10, 5, 8, 2];
    const averageClassSize = (15 + 10) / 2;

    const ctfidf = CTFIDF.calculate(
      classTermFrequencies,
      globalTermFrequencies,
      averageClassSize
    );

    expect(ctfidf.length).toBe(2);
    expect(ctfidf[0].length).toBe(4);

    expect(ctfidf[0][0]).toBeGreaterThan(ctfidf[0][1]);
    expect(ctfidf[1][2]).toBeGreaterThan(ctfidf[1][3]);

    expect(ctfidf[0][2]).toBe(0);
    expect(ctfidf[0][3]).toBe(0);
    expect(ctfidf[1][0]).toBe(0);
    expect(ctfidf[1][1]).toBe(0);
  });

  it('should extract top K words correctly', () => {
    const ctfidfMatrix = [
      [0.8, 0.4, 0.0, 0.0],
      [0.0, 0.0, 0.9, 0.3]
    ];
    const vocab = ["apple", "banana", "car", "dog"];

    const topWords = CTFIDF.extractTopWordsPerClass(ctfidfMatrix, vocab, 2);

    expect(topWords.length).toBe(2);
    expect(topWords[0][0].word).toBe("apple");
    expect(topWords[0][0].score).toBe(0.8);
    expect(topWords[0][1].word).toBe("banana");
    expect(topWords[0][1].score).toBe(0.4);

    expect(topWords[1][0].word).toBe("car");
    expect(topWords[1][0].score).toBe(0.9);
  });
});
