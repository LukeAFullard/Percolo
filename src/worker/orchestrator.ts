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

      // Vite worker initialization safety fallback
      setTimeout(() => {
          if (this.worker && this.onProgressCallback) {
             this.worker.postMessage({ type: 'PING' });
          }
      }, 100);
    }
  }

  public setOnProgress(callback: (progress: PipelineProgress) => void) {
    this.onProgressCallback = callback;
  }

  // Support for chunked transfers when SharedArrayBuffer is unavailable
  private chunks: Map<string, any[]> = new Map();

  private handleWorkerMessage(event: MessageEvent) {
    const message: WorkerMessage = event.data;

    switch (message.type) {
      case 'PROGRESS':
        if (this.onProgressCallback && message.payload) {
          this.onProgressCallback(message.payload);
        }
        break;
      case 'RESULT':
        if (this.onProgressCallback) {
          this.onProgressCallback({
            phase: 'result',
            status: 'completed',
            payload: message.payload
          } as any);
        }
        break;
      case 'CHUNK_METADATA':
        this.chunks.set(message.payload.id, message.payload.data);
        break;
      case 'CHUNK':
        this.handleChunk(message.payload);
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

  private chunkMetadata: Map<string, { labelsIsTyped: boolean, probsIsTyped: boolean, totalLength: number }> = new Map();

  private handleChunk(payload: any) {
    const { id, chunkIndex, totalChunks, data, labelsIsTyped, probsIsTyped, totalLength } = payload;

    if (!this.chunks.has(id)) {
      this.chunks.set(id, new Array(totalChunks));
      this.chunkMetadata.set(id, { labelsIsTyped, probsIsTyped, totalLength });
    }

    const chunkArray = this.chunks.get(id)!;
    chunkArray[chunkIndex] = data;

    // Check if all chunks received
    let complete = true;
    for (let i = 0; i < totalChunks; i++) {
      if (chunkArray[i] === undefined) {
        complete = false;
        break;
      }
    }

    if (complete) {
      // Reassemble and process
      const metadata = this.chunkMetadata.get(id)!;

      let reassembledLabels: any;
      if (metadata.labelsIsTyped && chunkArray.length > 0 && chunkArray[0].labels.constructor) {
          // Reconstruct TypedArray
          const TypedArrayConstructor = chunkArray[0].labels.constructor;
          reassembledLabels = new TypedArrayConstructor(metadata.totalLength);
          let offset = 0;
          for (const chunk of chunkArray) {
              if (chunk.labels.length > 0) {
                  reassembledLabels.set(chunk.labels, offset);
                  offset += chunk.labels.length;
              }
          }
      } else {
          // Reconstruct normal array
          reassembledLabels = chunkArray.flatMap(chunk => Array.from(chunk.labels || []));
      }

      let reassembledProbs: any;
      if (metadata.probsIsTyped && chunkArray.length > 0 && chunkArray[0].probabilities.constructor && chunkArray[0].probabilities.length > 0) {
          const TypedArrayConstructor = chunkArray[0].probabilities.constructor;
          // Assuming probabilities length is same as totalLength or matches chunks length
          const totalProbsLength = chunkArray.reduce((acc, c) => acc + (c.probabilities ? c.probabilities.length : 0), 0);
          reassembledProbs = new TypedArrayConstructor(totalProbsLength);
          let offset = 0;
          for (const chunk of chunkArray) {
              if (chunk.probabilities && chunk.probabilities.length > 0) {
                  reassembledProbs.set(chunk.probabilities, offset);
                  offset += chunk.probabilities.length;
              }
          }
      } else {
          reassembledProbs = chunkArray.flatMap(chunk => Array.from(chunk.probabilities || []));
      }

      const metadataForReassembly = this.chunks.get(id + '-metadata') || {};
      // Support full payload reassembly including ui specific objects
      const reassembled = Object.assign({}, metadataForReassembly, {
        labels: reassembledLabels,
        probabilities: reassembledProbs
      });

      this.chunks.delete(id);
      this.chunks.delete(id + '-metadata');
      this.chunkMetadata.delete(id);

      // Process the reassembled data (e.g. final result)
      // Call the callback or handle it based on the id/context
      if (this.onProgressCallback) {
        this.onProgressCallback({
          phase: 'pipeline',
          status: 'completed',
          message: 'Chunked data reassembled completely.'
        });
      }

      // We could trigger a synthetic RESULT message here
      this.handleWorkerMessage({
        data: {
          type: 'RESULT',
          payload: reassembled
        }
      } as MessageEvent);
    }
  }

  private handleWorkerError(error: ErrorEvent) {
    if (this.onProgressCallback) {
      this.onProgressCallback({
        phase: 'pipeline',
        status: 'error',
        message: error.message || 'Worker initialization failed (e.g. cross-origin/MIME issue)'
      });
    }
  }

  public startPipeline(documents: string[], config?: any) {
    if (!this.worker) {
        // Fallback for non-browser environments or if worker failed to initialize
        this.runFallbackPipeline(documents, config);
        return;
    }

    // Send documents to worker
    this.worker.postMessage({
      type: 'START_PIPELINE',
      payload: { documents, config }
    });
  }

  private runFallbackPipeline(_documents: string[], _config?: any) {
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
