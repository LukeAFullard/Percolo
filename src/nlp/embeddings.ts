import { pipeline, env, FeatureExtractionPipeline, Tensor } from '@huggingface/transformers';

// Configure transformers.js environment for browser execution
env.allowLocalModels = false; // We are fetching from the huggingface hub
if (env.backends.onnx.wasm) { env.backends.onnx.wasm.numThreads = 1; } // Default fallback thread count

export interface EmbeddingOptions {
  modelName?: string;
  precision?: 'fp32' | 'fp16' | 'int8' | 'q8' | 'int4';
  useWebGPU?: boolean;
}

export class EmbeddingPipeline {
  private static instance: FeatureExtractionPipeline | null = null;
  private static currentModel: string = '';

  /**
   * Initializes the embedding pipeline singleton.
   */
  static async getInstance(options: EmbeddingOptions = {}): Promise<FeatureExtractionPipeline> {
    const {
      // Default to English, but users can pass 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' for Cross-Lingual Alignment
      modelName = 'Xenova/all-MiniLM-L6-v2',
      precision = 'fp32',
      useWebGPU = false
    } = options;

    if (this.instance && this.currentModel === modelName) {
      return this.instance;
    }

    try {
      this.instance = await pipeline('feature-extraction', modelName, {
        dtype: precision as any, // Typecast for simplicity with the HF types
        device: useWebGPU ? 'webgpu' : 'wasm',
      });
      this.currentModel = modelName;
    } catch (error) {
      console.warn(`Failed to initialize ${modelName} on ${useWebGPU ? 'WebGPU' : 'WASM'}. Falling back to CPU. Error: ${error}`);
      // Fallback
      this.instance = await pipeline('feature-extraction', modelName, {
        device: 'cpu'
      });
      this.currentModel = modelName;
    }

    return this.instance;
  }

  /**
   * Embeds a list of string chunks into dense L2-normalized vectors using mean pooling.
   */
  static async embedTexts(texts: string[], options: EmbeddingOptions = {}): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    const extractor = await this.getInstance(options);

    // Perform embedding. `pooling: 'mean'` and `normalize: true` ensures
    // we get document-level vectors that are scaled to magnitude 1 (L2 normalization)
    const output = await extractor(texts, {
      pooling: 'mean',
      normalize: true,
    }) as Tensor;

    // Output is a tensor. We need to convert it to a 2D array of floats.
    // The tensor data is a flat Float32Array. We must chunk it by embedding dimension.
    const dimensions = output.dims; // e.g., [batch_size, embed_dim]
    const batchSize = dimensions[0];
    const embedDim = dimensions[1];

    const floatArray = output.data as Float32Array;
    const result: number[][] = [];

    for (let i = 0; i < batchSize; i++) {
      const startIndex = i * embedDim;
      const endIndex = startIndex + embedDim;
      // Convert Float32Array slice to standard JS Array of numbers
      result.push(Array.from(floatArray.slice(startIndex, endIndex)));
    }

    return result;
  }

  /**
   * Disposes of the active pipeline and frees up memory.
   */
  static async dispose() {
    if (this.instance) {
      await this.instance.dispose();
      this.instance = null;
      this.currentModel = '';
    }
  }
}
