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
});