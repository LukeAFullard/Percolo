import { pipeline, TextClassificationPipeline } from '@huggingface/transformers';
import { EmbeddingPipeline } from './embeddings';

export interface ToxicityOptions {
  modelName?: string;
  precision?: 'fp32' | 'fp16' | 'q8' | 'q4';
}

export class ToxicityEngine {
  private static instance: TextClassificationPipeline | null = null;
  private static currentModel: string = '';

  static async getInstance(options: ToxicityOptions = {}): Promise<TextClassificationPipeline> {
    const {
      modelName = 'Xenova/toxic-bert',
      precision = 'q8'
    } = options;

    if (this.instance && this.currentModel === modelName) {
      return this.instance;
    }

    // Ensure heavy models are disposed before loading this one to prevent OOM
    await EmbeddingPipeline.dispose();

    try {
      this.instance = await pipeline('text-classification', modelName, {
        dtype: precision as any,
        device: 'webgpu'
      });
      this.currentModel = modelName;
    } catch (error) {
      console.warn(`Failed to initialize toxicity model ${modelName} on webgpu. Falling back to cpu. Error: ${error}`);
      this.instance = await pipeline('text-classification', modelName, {
        dtype: precision as any,
        device: 'cpu'
      });
      this.currentModel = modelName;
    }

    return this.instance;
  }

  static async analyzeBatch(texts: string[], options: ToxicityOptions = {}): Promise<number[]> {
    if (!texts || texts.length === 0) return [];

    const classifier = await this.getInstance(options);

    // We batch process to avoid hanging, processing one by one
    const results: number[] = [];
    for (const text of texts) {
        if (!text.trim()) {
            results.push(0);
            continue;
        }

        try {
            // text-classification pipelines usually return { label: 'toxic', score: 0.99 }
            const output = await classifier(text);

            if (Array.isArray(output) && output.length > 0) {
                // If model returns multiple labels (multi-label), we look for 'toxic' or take the top score if it's a binary model
                const pred = output[0] as any;
                // toxic-bert usually outputs 'toxic' or 'LABEL_1' for toxicity
                if (pred.label === 'toxic' || pred.label === 'LABEL_1') {
                    results.push(pred.score);
                } else if (pred.label === 'non-toxic' || pred.label === 'LABEL_0') {
                    results.push(1.0 - pred.score);
                } else {
                    // Fallback, just store the score
                    results.push(pred.score);
                }
            } else {
                results.push(0);
            }
        } catch (e) {
            console.warn("Toxicity classification failed for a document", e);
            results.push(0);
        }
    }

    return results;
  }

  static async dispose() {
    if (this.instance) {
      await this.instance.dispose();
      this.instance = null;
      this.currentModel = '';
    }
  }
}
