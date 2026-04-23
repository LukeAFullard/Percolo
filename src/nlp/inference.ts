import { Similarity } from '../math/similarity';

export interface InferenceResult {
  label: number;
  similarity: number;
}

export class InferenceEngine {
  /**
   * Maps new document embeddings to existing topics using cosine similarity against topic centroids.
   * Equivalent to BERTopic's `.transform()` method.
   *
   * @param newEmbeddings The embeddings of the new documents.
   * @param topicCentroids A map of existing topic labels to their centroid vectors.
   * @returns An array of results, where each element corresponds to a new document
   *          and contains the assigned topic label and the cosine similarity score.
   */
  static transform(newEmbeddings: number[][], topicCentroids: Map<number, number[]>): InferenceResult[] {
    if (newEmbeddings.length === 0 || topicCentroids.size === 0) {
      return [];
    }

    // Convert map to parallel arrays for easier iteration
    const labels: number[] = [];
    const centroids: number[][] = [];
    for (const [label, centroid] of topicCentroids.entries()) {
      labels.push(label);
      centroids.push(centroid);
    }

    const results: InferenceResult[] = [];

    for (const newEmbedding of newEmbeddings) {
      const similarities = Similarity.cosineMultiple(newEmbedding, centroids);

      let bestLabel = -1; // Default to noise if no topics
      let maxSimilarity = -Infinity;

      for (let i = 0; i < similarities.length; i++) {
        if (similarities[i] > maxSimilarity) {
          maxSimilarity = similarities[i];
          bestLabel = labels[i];
        }
      }

      results.push({
        label: bestLabel,
        similarity: maxSimilarity
      });
    }

    return results;
  }
}
