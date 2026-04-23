import { describe, it, expect } from 'vitest';
import { TopicReduction } from '../../src/nlp/reduction';

describe('TopicReduction', () => {
  it('should merge the most similar topics until target is reached', () => {
    // 3 distinct groups of embeddings
    // Group 0 and 1 are very close to each other. Group 2 is far away.
    const embeddings = [
      [1, 0.1], [1, 0],     // Topic 0
      [0.9, 0], [0.9, 0.1], // Topic 1 (similar to Topic 0)
      [0, 10], [0.1, 10]    // Topic 2 (very different)
    ];
    const initialLabels = [0, 0, 1, 1, 2, 2];

    // Reduce from 3 topics down to 2
    const newLabels = TopicReduction.reduce(embeddings, initialLabels, 2);

    // Topic 0 and 1 should be merged. Topic 2 should remain distinct.
    expect(new Set(newLabels.slice(0, 4)).size).toBe(1); // 0 and 1 merged
    expect(new Set(newLabels.slice(4, 6)).size).toBe(1); // 2 remains 2
    expect(newLabels[0]).not.toBe(newLabels[5]); // Merged topic is distinct from topic 2

    // Expected exactly 2 topics
    const uniqueTopics = new Set(newLabels);
    expect(uniqueTopics.size).toBe(2);
  });

  it('should ignore noise (-1) during reduction count', () => {
    const embeddings = [
        [1, 1],
        [-10, -10], // Noise
        [10, 10]
    ];
    const initialLabels = [0, -1, 1];

    // Already at 2 active topics (0 and 1). Should not merge.
    const newLabels = TopicReduction.reduce(embeddings, initialLabels, 2);
    expect(newLabels).toEqual([0, -1, 1]);
  });

  it('should return original labels if already at or below target', () => {
    const embeddings = [[1], [2]];
    const initialLabels = [0, 1];

    expect(TopicReduction.reduce(embeddings, initialLabels, 5)).toEqual(initialLabels);
  });
});
