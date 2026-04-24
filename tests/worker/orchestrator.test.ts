import { describe, it, expect, vi } from 'vitest';
import { PipelineOrchestrator } from '../../src/worker/orchestrator';

describe('PipelineOrchestrator', () => {
  it('should handle missing worker support gracefully', () => {
    // Ensure window.Worker is undefined for this test
    const originalWindow = global.window;
    // @ts-ignore
    global.window = undefined;

    const orchestrator = new PipelineOrchestrator();

    const progressCallback = vi.fn();
    orchestrator.setOnProgress(progressCallback);

    orchestrator.startPipeline(["doc 1"]);

    expect(progressCallback).toHaveBeenCalledWith({
      phase: 'initialization',
      status: 'error',
      message: 'Web Workers are not supported in this environment.'
    });

    // Restore window if it existed
    // @ts-ignore
    global.window = originalWindow;
  });
  it('should handle chunked transfers successfully with arrays', () => {
    const orchestrator = new PipelineOrchestrator();

    // Create a mock worker message handler manually since the real Worker is not fully available here
    const mockHandleWorkerMessage = (orchestrator as any).handleWorkerMessage.bind(orchestrator);

    const progressCallback = vi.fn();
    orchestrator.setOnProgress(progressCallback);

    // Simulate sending chunk 1
    mockHandleWorkerMessage({
      data: {
        type: 'CHUNK',
        payload: {
          id: 'test-chunk',
          chunkIndex: 0,
          totalChunks: 2,
          data: { labels: [1, 2, 3], probabilities: [0.1, 0.2, 0.3] },
          labelsIsTyped: false,
          probsIsTyped: false,
          totalLength: 5
        }
      }
    } as MessageEvent);

    // Simulate sending chunk 2
    mockHandleWorkerMessage({
      data: {
        type: 'CHUNK',
        payload: {
          id: 'test-chunk',
          chunkIndex: 1,
          totalChunks: 2,
          data: { labels: [4, 5], probabilities: [0.4, 0.5] },
          labelsIsTyped: false,
          probsIsTyped: false,
          totalLength: 5
        }
      }
    } as MessageEvent);

    // The callback should be called with completed message
    expect(progressCallback).toHaveBeenCalledWith({
      phase: 'pipeline',
      status: 'completed',
      message: 'Chunked data reassembled completely.'
    });

    // We expect the RESULT message to be triggered internally, which isn't easily assertable
    // directly without spying on handleWorkerMessage, but we can check the internal state
    expect((orchestrator as any).chunks.has('test-chunk')).toBe(false);
  });

  it('should handle chunked transfers successfully with TypedArrays', () => {
    const orchestrator = new PipelineOrchestrator();

    const mockHandleWorkerMessage = (orchestrator as any).handleWorkerMessage.bind(orchestrator);

    // Simulate sending chunk 1
    mockHandleWorkerMessage({
      data: {
        type: 'CHUNK',
        payload: {
          id: 'typed-chunk',
          chunkIndex: 0,
          totalChunks: 2,
          data: { labels: new Int32Array([1, 2, 3]), probabilities: new Float32Array([0.1, 0.2, 0.3]) },
          labelsIsTyped: true,
          probsIsTyped: true,
          totalLength: 5
        }
      }
    } as MessageEvent);

    // Simulate sending chunk 2
    mockHandleWorkerMessage({
      data: {
        type: 'CHUNK',
        payload: {
          id: 'typed-chunk',
          chunkIndex: 1,
          totalChunks: 2,
          data: { labels: new Int32Array([4, 5]), probabilities: new Float32Array([0.4, 0.5]) },
          labelsIsTyped: true,
          probsIsTyped: true,
          totalLength: 5
        }
      }
    } as MessageEvent);

    // Reassembly logic shouldn't crash and chunks map should be empty
    expect((orchestrator as any).chunks.has('typed-chunk')).toBe(false);
  });
});