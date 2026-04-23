import { describe, it, expect } from 'vitest';
import { CTFIDF } from '../../src/math/ctfidf';

describe('CTFIDF', () => {
  it('should calculate CTFIDF scores correctly', () => {
    const classTermFrequencies = [
      [10, 2, 0], // Class 0
      [1, 8, 5]   // Class 1
    ];
    const globalTermFrequencies = [11, 10, 5];
    const averageClassSize = 13; // (12 + 14) / 2

    const matrix = CTFIDF.calculate(classTermFrequencies, globalTermFrequencies, averageClassSize);

    expect(matrix.length).toBe(2);
    expect(matrix[0].length).toBe(3);

    // Check relative ordering of scores
    // For Class 0, word 0 (freq 10) should have a much higher score than word 1 (freq 2)
    expect(matrix[0][0]).toBeGreaterThan(matrix[0][1]);
    expect(matrix[0][2]).toBe(0); // Freq 0 means score 0
  });

  it('should extract top words correctly', () => {
    const matrix = [
      [0.1, 0.5, 0.2, 0.9],
      [0.8, 0.2, 0.3, 0.1]
    ];
    const vocabulary = ['apple', 'banana', 'cherry', 'date'];

    const topWords = CTFIDF.extractTopWordsPerClass(matrix, vocabulary, 2);

    expect(topWords.length).toBe(2);

    // Class 0: 'date' (0.9), 'banana' (0.5)
    expect(topWords[0][0].word).toBe('date');
    expect(topWords[0][1].word).toBe('banana');

    // Class 1: 'apple' (0.8), 'cherry' (0.3)
    expect(topWords[1][0].word).toBe('apple');
    expect(topWords[1][1].word).toBe('cherry');
  });

  it('should apply seed word boosting correctly', () => {
    const classTermFrequencies = [
      [5, 5, 5] // All words have same frequency initially
    ];
    const globalTermFrequencies = [5, 5, 5];
    const averageClassSize = 15;
    const vocabulary = ['apple', 'banana', 'cherry'];

    // Calculate without boosting
    const matrixNormal = CTFIDF.calculate(classTermFrequencies, globalTermFrequencies, averageClassSize);

    // Calculate with boosting for 'banana'
    const matrixBoosted = CTFIDF.calculate(
      classTermFrequencies,
      globalTermFrequencies,
      averageClassSize,
      { seedWords: ['banana'], seedMultiplier: 2.0, vocabulary }
    );

    // Normally scores would be equal
    expect(matrixNormal[0][0]).toBeCloseTo(matrixNormal[0][1]);

    // With boosting, 'banana' (index 1) should be higher than 'apple' (index 0)
    expect(matrixBoosted[0][1]).toBeGreaterThan(matrixNormal[0][1]);
    expect(matrixBoosted[0][1]).toBeGreaterThan(matrixBoosted[0][0]);
  });
});
