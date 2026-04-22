import { describe, it, expect } from 'vitest';
import { LexicalExtractor } from '../../src/nlp/lexical';

describe('LexicalExtractor', () => {
  it('should aggregate documents, tokenize, and construct a CSR matrix', () => {
    const documents = [
      "The quick brown fox jumps.",
      "The quick brown dog barks.",
      "Space exploration is fascinating.",
      "Astronomy involves space exploration.",
      "A completely unique sentence."
    ];
    // Two main clusters, plus one outlier
    const labels = [0, 0, 1, 1, -1];

    // minDf = 1 to keep all words for the test
    const result = LexicalExtractor.extract(documents, labels, { minDf: 1 });

    expect(result.matrix).toBeDefined();
    // 3 unique classes: -1, 0, 1. csr-matrix row length is in `rows.length - 1` or conceptually we know we passed 3
    expect(result.matrix.rows.length - 1).toBe(3);

    // Check vocabulary extraction (stop words like 'The', 'is', 'a' should be removed)
    expect(result.vocabulary).toContain('quick');
    expect(result.vocabulary).toContain('brown');
    expect(result.vocabulary).toContain('space');
    expect(result.vocabulary).toContain('exploration');
    expect(result.vocabulary).not.toContain('the');
    expect(result.vocabulary).not.toContain('is');

    // Check sizes
    expect(result.globalTermFrequencies.length).toBe(result.vocabulary.length);
    expect(result.averageClassSize).toBeGreaterThan(0);
  });

  it('should prune vocabulary based on minDf', () => {
     const documents = [
      "apple banana orange", // class 0
      "apple grape pear",    // class 1
      "apple kiwi mango"     // class 2
    ];
    const labels = [0, 1, 2];

    // minDf = 2: Only words appearing in at least 2 class-documents should remain
    const result = LexicalExtractor.extract(documents, labels, { minDf: 2 });

    expect(result.vocabulary).toContain('apple');
    expect(result.vocabulary).not.toContain('banana');
    expect(result.vocabulary).not.toContain('grape');
  });

  it('should handle empty inputs gracefully', () => {
    const result = LexicalExtractor.extract([], []);
    expect(result.matrix).toBeNull();
    expect(result.vocabulary.length).toBe(0);
  });
});
