import { UMAP } from 'umap-js';

export interface UMAPOptions {
  nComponents?: number;
  nNeighbors?: number;
  minDist?: number;
  spread?: number;
  random?: () => number;
}

export class UMAPReducer {
  /**
   * Projects high-dimensional vectors into a lower-dimensional manifold.
   * By default, it projects to 2 dimensions for visualization, or 5 for HDBSCAN clustering.
   *
   * @param embeddings A 2D array of high-dimensional vectors (e.g. from transformers.js)
   * @param options UMAP configuration options
   * @returns A 2D array of reduced vectors
   */
  static reduce(embeddings: number[][], options: UMAPOptions = {}): number[][] {
    if (!embeddings || embeddings.length === 0) {
      return [];
    }

    const {
      nComponents = 5,
      nNeighbors = 15,
      minDist = 0.1,
      spread = 1.0,
      random = Math.random
    } = options;

    const umap = new UMAP({
      nComponents,
      nNeighbors,
      minDist,
      spread,
      random
    });

    const projection = umap.fit(embeddings);
    return projection;
  }

  /**
   * Projects high-dimensional vectors into a lower-dimensional manifold asynchronously.
   * This is crucial for Web Workers to avoid blocking the thread and to send progress
   * updates back to the main UI.
   *
   * @param embeddings A 2D array of high-dimensional vectors
   * @param options UMAP configuration options
   * @param onProgress Callback function for epoch progress, returns false to stop
   * @returns A Promise resolving to a 2D array of reduced vectors
   */
  static async reduceAsync(
    embeddings: number[][],
    options: UMAPOptions = {},
    onProgress?: (epochNumber: number) => void | boolean
  ): Promise<number[][]> {
    if (!embeddings || embeddings.length === 0) {
      return [];
    }

    const {
      nComponents = 5,
      nNeighbors = 15,
      minDist = 0.1,
      spread = 1.0,
      random = Math.random
    } = options;

    const umap = new UMAP({
      nComponents,
      nNeighbors,
      minDist,
      spread,
      random
    });

    const projection = await umap.fitAsync(embeddings, onProgress);
    return projection;
  }

  /**
   * A helper to create a pseudo-random number generator from a seed.
   * This ensures reproducibility when requested by the user.
   * Uses a simple Mulberry32 implementation.
   */
  static seededRandom(seed: number): () => number {
    return function() {
      var t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }
}
