import { HDBSCAN, HDBSCANParams } from 'hdbscan-ts';

export interface ClusteringResult {
  labels: number[];
  probabilities: number[];
}

export class ClusteringEngine {
  /**
   * Partitions reduced embeddings into thematic clusters using HDBSCAN.
   * Identifies arbitrary cluster shapes and variable densities, while excluding noise.
   *
   * @param embeddings Reduced 2D/5D vectors (typically from UMAP)
   * @param minClusterSize The minimum number of points required to form a cluster
   * @param minSamples The number of samples in a neighborhood for a point to be considered a core point
   * @returns An object containing an array of cluster labels (-1 is noise) and an array of membership probabilities
   */
  static cluster(embeddings: number[][], minClusterSize: number = 5, minSamples?: number): ClusteringResult {
    if (!embeddings || embeddings.length === 0) {
      return { labels: [], probabilities: [] };
    }

    // HDBSCAN requires at least minClusterSize points to form a cluster.
    // If we have fewer points than the minClusterSize, it will crash or fail.
    // In that edge case, we just label everything as noise (-1).
    if (embeddings.length < minClusterSize) {
      return {
        labels: new Array(embeddings.length).fill(-1),
        probabilities: new Array(embeddings.length).fill(0)
      };
    }

    const params: HDBSCANParams = {
      minClusterSize,
      minSamples: minSamples || minClusterSize,
    };

    const hdbscan = new HDBSCAN(params);
    const labels = hdbscan.fit(embeddings);

    // Some implementations or versions might not expose probabilities cleanly or may return undefined.
    // We provide a fallback just in case.
    const probabilities = hdbscan.probabilities_ || new Array(embeddings.length).fill(0);

    return {
      labels,
      probabilities
    };
  }
}
