import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineCache } from '../../src/io/cache';
import 'fake-indexeddb/auto'; // Polyfill IndexedDB for Node.js environment

describe('PipelineCache', () => {
  beforeEach(async () => {
    // Clear the database before each test to ensure isolation
    await PipelineCache.clearCheckpoints();
  });

  it('should save and load a checkpoint correctly', async () => {
    const key = 'test-embeddings';
    const phase = 'embeddings';
    const data = [[1.0, 2.0], [3.0, 4.0]];

    await PipelineCache.saveCheckpoint(key, phase, data);

    const loaded = await PipelineCache.loadCheckpoint(key);

    expect(loaded).not.toBeNull();
    expect(loaded!.phase).toBe(phase);
    expect(loaded!.data).toEqual(data);
    expect(loaded!.timestamp).toBeGreaterThan(0);
  });

  it('should return null when loading a non-existent checkpoint', async () => {
    const loaded = await PipelineCache.loadCheckpoint('non-existent-key');
    expect(loaded).toBeNull();
  });

  it('should clear all checkpoints correctly', async () => {
    await PipelineCache.saveCheckpoint('key1', 'phase1', { a: 1 });
    await PipelineCache.saveCheckpoint('key2', 'phase2', { b: 2 });

    let loaded1 = await PipelineCache.loadCheckpoint('key1');
    expect(loaded1).not.toBeNull();

    await PipelineCache.clearCheckpoints();

    loaded1 = await PipelineCache.loadCheckpoint('key1');
    const loaded2 = await PipelineCache.loadCheckpoint('key2');

    expect(loaded1).toBeNull();
    expect(loaded2).toBeNull();
  });
});
