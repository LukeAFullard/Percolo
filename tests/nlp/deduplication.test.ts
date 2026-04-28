import { describe, it, expect } from 'vitest';
import { Deduplicator } from '../../src/nlp/deduplication';

describe('Deduplicator', () => {
  it('should correctly identify and merge duplicate embeddings above threshold', () => {
    const docs = [
      "Doc 1 unique content",
      "Doc 2 very similar to doc 1",
      "Doc 3 completely different stuff",
      "Doc 4 duplicate of doc 1 essentially"
    ];

    // Mock embeddings
    const embeddings = [
      [1.0, 0.0, 0.0],
      [0.99, 0.1, 0.0], // >0.95 sim to [1,0,0]
      [0.0, 1.0, 0.0],  // Orthogonal
      [1.0, 0.0, 0.0]   // Exact duplicate
    ];

    const result = Deduplicator.run(docs, embeddings, 0.95);

    expect(result.uniqueDocuments.length).toBe(2);
    expect(result.uniqueDocuments[0]).toBe(docs[0]);
    expect(result.uniqueDocuments[1]).toBe(docs[2]);

    expect(result.uniqueEmbeddings.length).toBe(2);

    expect(result.indexMapping).toEqual([
       0, // mapped to first unique (itself)
       0, // mapped to first unique
       1, // mapped to second unique
       0  // mapped to first unique
    ]);
  });
});
