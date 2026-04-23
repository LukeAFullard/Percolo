export class Similarity {
  /**
   * Calculates the cosine similarity between two vectors.
   * Assumes vectors are of the same length.
   * If vectors are already L2 normalized, this is equivalent to the dot product.
   *
   * @param vecA The first vector
   * @param vecB The second vector
   * @returns The cosine similarity score (-1 to 1)
   */
  static cosine(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0; // Handle zero vectors to avoid NaN
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculates the cosine similarity of a target vector against a list of vectors.
   *
   * @param target The target vector
   * @param vectors The list of vectors to compare against
   * @returns An array of cosine similarity scores
   */
  static cosineMultiple(target: number[], vectors: number[][]): number[] {
    return vectors.map(vec => this.cosine(target, vec));
  }
}
