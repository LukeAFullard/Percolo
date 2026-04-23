export class KMeansEngine {
  /**
   * A basic k-means clustering implementation.
   * Serves as a low-memory fallback for environments where HDBSCAN exceeds limits.
   *
   * @param embeddings A 2D array of vectors (typically reduced by UMAP).
   * @param k The number of clusters to form.
   * @param maxIterations Maximum number of iterations (default 100).
   * @returns An array of cluster labels.
   */
  static cluster(embeddings: number[][], k: number, maxIterations: number = 100): number[] {
    if (!embeddings || embeddings.length === 0 || k <= 0) return [];
    if (embeddings.length < k) {
        // Edge case: fewer points than clusters. Just assign each point to its own cluster.
        return embeddings.map((_, i) => i);
    }

    const nPoints = embeddings.length;
    const dim = embeddings[0].length;
    let centroids = this.initializeCentroids(embeddings, k);
    let labels = new Array(nPoints).fill(-1);
    let iterations = 0;
    let changed = true;

    while (changed && iterations < maxIterations) {
      changed = false;
      const newCentroids = Array.from({ length: k }, () => new Float64Array(dim).fill(0));
      const clusterCounts = new Int32Array(k).fill(0);

      // Assignment step
      for (let i = 0; i < nPoints; i++) {
        const point = embeddings[i];
        let bestK = 0;
        let minSqDist = Infinity;

        for (let j = 0; j < k; j++) {
          const sqDist = this.squaredEuclideanDistance(point, centroids[j]);
          if (sqDist < minSqDist) {
            minSqDist = sqDist;
            bestK = j;
          }
        }

        if (labels[i] !== bestK) {
          labels[i] = bestK;
          changed = true;
        }

        // Accumulate for update step
        for (let d = 0; d < dim; d++) {
          newCentroids[bestK][d] += point[d];
        }
        clusterCounts[bestK]++;
      }

      // Update step
      for (let j = 0; j < k; j++) {
        if (clusterCounts[j] > 0) {
          for (let d = 0; d < dim; d++) {
            centroids[j][d] = newCentroids[j][d] / clusterCounts[j];
          }
        } else {
            // Handle empty cluster by picking a random point (rare but possible in standard k-means)
            const randomPoint = embeddings[Math.floor(Math.random() * nPoints)];
            centroids[j] = [...randomPoint];
        }
      }

      iterations++;
    }

    return labels;
  }

  /**
   * Initializes centroids using a simple random selection (Forgy method).
   * Note: In a true production system, KMeans++ initialization is preferred,
   * but random is sufficient for a low-memory fallback.
   */
  private static initializeCentroids(embeddings: number[][], k: number): number[][] {
    const centroids: number[][] = [];
    const usedIndices = new Set<number>();

    while (centroids.length < k) {
      const idx = Math.floor(Math.random() * embeddings.length);
      if (!usedIndices.has(idx)) {
        usedIndices.add(idx);
        centroids.push([...embeddings[idx]]);
      }
    }
    return centroids;
  }

  private static squaredEuclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return sum;
  }
}
