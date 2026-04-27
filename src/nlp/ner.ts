import { pipeline, TokenClassificationPipeline } from '@huggingface/transformers';
import { EmbeddingPipeline } from './embeddings';

export interface NEROptions {
  modelName?: string;
  precision?: 'fp32' | 'fp16' | 'q8' | 'q4';
}

export interface NEREntity {
  entity_group: string;
  score: number;
  word: string;
  start: number;
  end: number;
}

export class NEREngine {
  private static instance: TokenClassificationPipeline | null = null;
  private static currentModel: string = '';

  static async getInstance(options: NEROptions = {}): Promise<TokenClassificationPipeline> {
    const {
      modelName = 'Xenova/bert-base-NER',
      precision = 'q8'
    } = options;

    if (this.instance && this.currentModel === modelName) {
      return this.instance;
    }

    await EmbeddingPipeline.dispose();

    try {
      this.instance = await pipeline('token-classification', modelName, {
        dtype: precision as any,
        device: 'webgpu'
      });
      this.currentModel = modelName;
    } catch (error) {
      console.warn(`Failed to initialize NER model ${modelName} on WebGPU. Falling back to CPU. Error: ${error}`);
      this.instance = await pipeline('token-classification', modelName, {
        dtype: precision as any,
        device: 'cpu'
      });
      this.currentModel = modelName;
    }

    return this.instance;
  }

  static async extractEntities(text: string, options: NEROptions = {}): Promise<NEREntity[]> {
    if (!text || text.trim() === '') return [];

    const classifier = await this.getInstance(options);

    // Ignore words approach to speed up processing
    const output = await classifier(text, { ignore_labels: ['O'] });

    if (Array.isArray(output)) {
       return output as unknown as NEREntity[];
    }
    return [];
  }

  static async dispose() {
    if (this.instance) {
      await this.instance.dispose();
      this.instance = null;
      this.currentModel = '';
    }
  }
}
