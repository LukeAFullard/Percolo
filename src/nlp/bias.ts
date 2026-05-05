import { pipeline, ZeroShotClassificationPipeline } from '@huggingface/transformers';
import { EmbeddingPipeline } from './embeddings';

export interface BiasOptions {
  modelName?: string;
  precision?: 'fp32' | 'fp16' | 'q8' | 'q4';
}

export class BiasEngine {
  private static instance: ZeroShotClassificationPipeline | null = null;
  private static currentModel: string = '';

  static async getInstance(options: BiasOptions = {}): Promise<ZeroShotClassificationPipeline> {
    const {
      modelName = 'Xenova/distilbert-base-uncased-mnli', // Lightweight, 67MB quantized, great for zero-shot in browser
      precision = 'q8'
    } = options;

    if (this.instance && this.currentModel === modelName) {
      return this.instance;
    }

    // Ensure heavy models are disposed before loading this one to prevent OOM
    await EmbeddingPipeline.dispose();

    try {
      this.instance = await pipeline('zero-shot-classification', modelName, {
        dtype: precision as any,
        device: 'webgpu'
      });
      this.currentModel = modelName;
    } catch (error) {
      console.warn(`Failed to initialize bias model ${modelName} on webgpu. Falling back to cpu. Error: ${error}`);
      this.instance = await pipeline('zero-shot-classification', modelName, {
        dtype: precision as any,
        device: 'cpu'
      });
      this.currentModel = modelName;
    }

    return this.instance;
  }

  static async analyzeBatch(texts: string[], options: BiasOptions = {}): Promise<number[]> {
    if (!texts || texts.length === 0) return [];

    const classifier = await this.getInstance(options);

    // We want to map to a [-1, 1] scale.
    // -1 = Left/Liberal
    //  0 = Center/Neutral
    //  1 = Right/Conservative
    const labels = ["liberal", "neutral", "conservative"];

    // We batch process to avoid hanging, processing one by one
    const results: number[] = [];
    for (const text of texts) {
        if (!text.trim()) {
            results.push(0);
            continue;
        }

        try {
            const output = await classifier(text, labels);

            if (output && output.labels && output.scores) {
                // Find scores
                const libIdx = output.labels.indexOf("liberal");
                const conIdx = output.labels.indexOf("conservative");

                const libScore = libIdx !== -1 ? output.scores[libIdx] : 0;
                const conScore = conIdx !== -1 ? output.scores[conIdx] : 0;

                // If it is mostly neutral, the weighted sum will naturally tend toward 0
                // since liberal and conservative scores will be low.
                // We calculate a weighted bias score:
                // If conservative is 0.8 and liberal is 0.1, score is 0.7 (Right-leaning)
                // If liberal is 0.8 and conservative is 0.1, score is -0.7 (Left-leaning)

                const finalScore = conScore - libScore;
                results.push(finalScore);
            } else {
                results.push(0);
            }
        } catch (e) {
            console.warn("Bias classification failed for a document", e);
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
