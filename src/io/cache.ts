import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'percolo-pipeline-state';
const STORE_NAME = 'checkpoints';
const DB_VERSION = 1;

export interface PipelineState {
  phase: string;
  data: any;
  timestamp: number;
}

export class PipelineCache {
  private static dbPromise: Promise<IDBPDatabase> | null = null;

  /**
   * Initializes the IndexedDB connection.
   */
  private static async getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is not supported in this environment.');
      }
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        },
      });
    }
    return this.dbPromise;
  }

  /**
   * Saves a state checkpoint to IndexedDB.
   * Useful for recovering from background tab evictions or Out-Of-Memory crashes.
   *
   * @param key The identifier for this specific checkpoint (e.g., 'embeddings', 'umap_state')
   * @param phase The string name of the pipeline phase.
   * @param data The data payload to save.
   */
  static async saveCheckpoint(key: string, phase: string, data: any): Promise<void> {
    try {
      const db = await this.getDB();
      const state: PipelineState = {
        phase,
        data,
        timestamp: Date.now(),
      };
      await db.put(STORE_NAME, state, key);
    } catch (e) {
      console.warn(`Failed to save checkpoint '${key}':`, e);
      // In private browsing or environments with constrained storage, this might fail.
      // We shouldn't crash the pipeline just because checkpointing failed.
    }
  }

  /**
   * Loads a saved state checkpoint from IndexedDB.
   *
   * @param key The identifier for the checkpoint.
   * @returns The saved PipelineState, or null if it doesn't exist.
   */
  static async loadCheckpoint(key: string): Promise<PipelineState | null> {
    try {
      const db = await this.getDB();
      const state = await db.get(STORE_NAME, key);
      return state || null;
    } catch (e) {
      console.warn(`Failed to load checkpoint '${key}':`, e);
      return null;
    }
  }

  /**
   * Clears all saved checkpoints from the database.
   */
  static async clearCheckpoints(): Promise<void> {
    try {
      const db = await this.getDB();
      await db.clear(STORE_NAME);
    } catch (e) {
      console.warn('Failed to clear checkpoints:', e);
    }
  }
}
