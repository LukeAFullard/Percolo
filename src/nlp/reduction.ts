import { Similarity } from '../math/similarity';
import { Centroids } from '../math/centroids';

export class TopicReduction {
  /**
   * Merges topics based on the cosine similarity of their centroids.
   * Equivalent to BERTopic's `reduce_topics` functionality.
   *
   * @param embeddings The original document embeddings.
   * @param currentLabels The current cluster assignments for each document.
   * @param targetNumTopics The desired number of topics to reduce to.
   * @returns A new array of cluster labels representing the merged topics.
   */
  static reduce(embeddings: number[][], currentLabels: number[], targetNumTopics: number): number[] {
    if (embeddings.length === 0 || targetNumTopics <= 0) return currentLabels;

    const uniqueTopics = new Set(currentLabels);
    // Ignore noise (-1) in our count of active topics
    const activeTopics = Array.from(uniqueTopics).filter(t => t !== -1);

    if (activeTopics.length <= targetNumTopics) {
      return [...currentLabels]; // Already at or below target
    }

    let labels = [...currentLabels];
    let numCurrentTopics = activeTopics.length;

    // Iteratively merge the two most similar topics until target is reached
    while (numCurrentTopics > targetNumTopics) {
      // 1. Recompute centroids for current labels
      const centroidsMap = Centroids.calculate(embeddings, labels);

      const currentActiveTopics = Array.from(centroidsMap.keys()).filter(t => t !== -1);
      if (currentActiveTopics.length <= targetNumTopics) break;

      let maxSim = -Infinity;
      let topicA = -1;
      let topicB = -1;

      // 2. Find the pair of topics with the highest cosine similarity
      for (let i = 0; i < currentActiveTopics.length; i++) {
        for (let j = i + 1; j < currentActiveTopics.length; j++) {
          const t1 = currentActiveTopics[i];
          const t2 = currentActiveTopics[j];
          const vec1 = centroidsMap.get(t1)!;
          const vec2 = centroidsMap.get(t2)!;

          const sim = Similarity.cosine(vec1, vec2);
          if (sim > maxSim) {
            maxSim = sim;
            topicA = t1;
            topicB = t2;
          }
        }
      }

      // 3. Merge topicB into topicA (keep the label of topicA)
      // We could also do size-based logic to keep the larger topic's label, but this is simpler.
      for (let i = 0; i < labels.length; i++) {
        if (labels[i] === topicB) {
          labels[i] = topicA;
        }
      }

      numCurrentTopics--;
    }

    return labels;
  }
}
