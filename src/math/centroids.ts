export class Centroids {
  /**
   * Calculates the centroid (mean vector) for each cluster.
   *
   * @param embeddings The list of document embeddings.
   * @param labels The corresponding cluster labels for each document.
   * @returns A map of cluster label to its centroid vector.
   */
  static calculate(embeddings: number[][], labels: number[]): Map<number, number[]> {
    if (embeddings.length === 0 || embeddings.length !== labels.length) {
      return new Map();
    }

    const embedDim = embeddings[0].length;
    const clusterSums = new Map<number, number[]>();
    const clusterCounts = new Map<number, number>();

    // Accumulate sums and counts
    for (let i = 0; i < embeddings.length; i++) {
      const label = labels[i];
      const embedding = embeddings[i];

      if (!clusterSums.has(label)) {
        clusterSums.set(label, new Array(embedDim).fill(0));
        clusterCounts.set(label, 0);
      }

      const currentSum = clusterSums.get(label)!;
      for (let j = 0; j < embedDim; j++) {
        currentSum[j] += embedding[j];
      }
      clusterCounts.set(label, clusterCounts.get(label)! + 1);
    }

    // Compute average
    const centroids = new Map<number, number[]>();
    for (const [label, sumArray] of clusterSums.entries()) {
      const count = clusterCounts.get(label)!;
      const centroid = sumArray.map(val => val / count);
      centroids.set(label, centroid);
    }

    return centroids;
  }
}
