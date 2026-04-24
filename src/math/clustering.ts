import { HDBSCAN, HDBSCANParams } from 'hdbscan-ts';
import { KMeansEngine } from './kmeans';

export interface ClusteringResult {
  labels: number[];
  probabilities: number[];
}

export interface ClusteringOptions {
  minClusterSize?: number;
  minSamples?: number;
  useLowMemoryFallback?: boolean;
  fallbackK?: number;
}

export class ClusteringEngine {
  /**
   * Partitions reduced embeddings into thematic clusters using HDBSCAN or KMeans.
   * Identifies arbitrary cluster shapes and variable densities, while excluding noise.
   *
   * @param embeddings Reduced 2D/5D vectors (typically from UMAP)
   * @param options Configuration options, including fallback parameters.
   * @returns An object containing an array of cluster labels (-1 is noise) and an array of membership probabilities
   */
  static cluster(embeddings: number[][], options: ClusteringOptions = {}): ClusteringResult {
    const {
        minClusterSize = 5,
        minSamples,
        useLowMemoryFallback = false,
        fallbackK = 10
    } = options;

    if (!embeddings || embeddings.length === 0) {
      return { labels: [], probabilities: [] };
    }

    // If memory is constrained, or we have an incredibly large dataset where HDBSCAN would OOM
    if (useLowMemoryFallback) {
        const labels = KMeansEngine.cluster(embeddings, fallbackK);
        // KMeans doesn't produce probabilities natively in this basic implementation,
        // so we return 1.0 for confident assignment (since it's a hard assignment).
        return {
            labels,
            probabilities: new Array(embeddings.length).fill(1.0)
        };
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

  /**
   * Asynchronously partitions reduced embeddings.
   * Wraps the synchronous clustering process in a Promise and yields the event loop
   * before starting the heavy computation. This helps keep the Web Worker somewhat
   * responsive to message events (like cancellation or status checks) just before
   * the intensive clustering phase begins.
   *
   * @param embeddings Reduced 2D/5D vectors
   * @param options Configuration options
   * @returns A Promise resolving to the ClusteringResult
   */
  static async clusterAsync(embeddings: number[][], options: ClusteringOptions = {}): Promise<ClusteringResult> {
    // Yield the event loop to allow pending messages (e.g. PROGRESS updates) to be processed
    await new Promise(resolve => setTimeout(resolve, 0));

    // Execute the heavy synchronous task
    const result = this.cluster(embeddings, options);

    // Yield again before returning
    await new Promise(resolve => setTimeout(resolve, 0));

    return result;
  }
}
