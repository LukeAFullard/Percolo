export interface PipelineProgress {
  phase: string;
  status: 'running' | 'completed' | 'error';
  progress?: number; // 0-100
  message?: string;
}

export interface WorkerMessage {
  type: string;
  payload?: any;
}

export class PipelineOrchestrator {
  private worker: Worker | null = null;
  private onProgressCallback: ((progress: PipelineProgress) => void) | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    // In a real application, this would point to the bundled worker script.
    // Assuming Vite or Webpack handles the worker import in the production build.
    if (typeof window !== 'undefined' && window.Worker) {
      this.worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
    }
  }

  public setOnProgress(callback: (progress: PipelineProgress) => void) {
    this.onProgressCallback = callback;
  }

  private handleWorkerMessage(event: MessageEvent) {
    const message: WorkerMessage = event.data;

    switch (message.type) {
      case 'PROGRESS':
        if (this.onProgressCallback && message.payload) {
          this.onProgressCallback(message.payload);
        }
        break;
      case 'RESULT':
        // Handle final result
        break;
      case 'ERROR':
        if (this.onProgressCallback) {
          this.onProgressCallback({
            phase: 'pipeline',
            status: 'error',
            message: message.payload?.message || 'Unknown worker error'
          });
        }
        break;
    }
  }

  private handleWorkerError(error: ErrorEvent) {
    if (this.onProgressCallback) {
      this.onProgressCallback({
        phase: 'pipeline',
        status: 'error',
        message: error.message
      });
    }
  }

  public startPipeline(documents: string[]) {
    if (!this.worker) {
        // Fallback for non-browser environments or if worker failed to initialize
        this.runFallbackPipeline(documents);
        return;
    }

    // Send documents to worker
    this.worker.postMessage({
      type: 'START_PIPELINE',
      payload: { documents }
    });
  }

  private runFallbackPipeline(documents: string[]) {
      if (this.onProgressCallback) {
          this.onProgressCallback({
              phase: 'initialization',
              status: 'error',
              message: 'Web Workers are not supported in this environment.'
          });
      }
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
