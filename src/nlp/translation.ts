import { pipeline, TranslationPipeline } from '@huggingface/transformers';
import { EmbeddingPipeline } from './embeddings';

export interface TranslatorOptions {
  modelName?: string; // e.g., 'Xenova/nllb-200-distilled-600M' or 'Xenova/m2m100_418M'
  srcLang?: string; // e.g., 'fra_Latn'
  tgtLang?: string; // e.g., 'eng_Latn'
  precision?: 'fp32' | 'fp16' | 'q4' | 'q8';
}

export class CrossLingualTranslator {
  private static instance: TranslationPipeline | null = null;
  private static currentModel: string = '';

  /**
   * Initializes the Seq2Seq translation pipeline singleton.
   * VERY IMPORTANT: Like LLMs, translation models (600M+ parameters) require significant memory.
   * This method forces the disposal of the EmbeddingPipeline to prevent OOM errors.
   */
  static async getInstance(options: TranslatorOptions = {}): Promise<TranslationPipeline> {
    const {
      modelName = 'Xenova/nllb-200-distilled-600M',
      precision = 'q8' // Default to quantized to survive browser limits
    } = options;

    if (this.instance && this.currentModel === modelName) {
      return this.instance;
    }

    // 🚨 CAP-AND-TIER ENFORCEMENT: Clear embedding memory before loading Heavy Seq2Seq Model 🚨
    await EmbeddingPipeline.dispose();

    try {
      this.instance = await pipeline('translation', modelName, {
        dtype: precision as any,
        device: 'webgpu'
      });
      this.currentModel = modelName;
    } catch (error) {
      console.warn(`Failed to initialize translator ${modelName} on WebGPU. Falling back to WASM/CPU (This will be extremely slow). Error: ${error}`);
      this.instance = await pipeline('translation', modelName, {
        dtype: precision as any,
        device: 'wasm'
      });
      this.currentModel = modelName;
    }

    return this.instance;
  }

  /**
   * Translates a list of topic labels or sentences from a source language to a target language.
   *
   * Note for NLLB models: Language codes must follow FLORES-200 formats (e.g., eng_Latn, fra_Latn).
   */
  static async translate(texts: string[], options: TranslatorOptions = {}): Promise<string[]> {
    if (!texts || texts.length === 0) return [];

    const { srcLang, tgtLang = 'eng_Latn' } = options;
    const translator = await this.getInstance(options);

    // Some models like m2m100 or nllb require explicit language hints.
    // If not provided, some models auto-detect, but providing them is safer.
    const translationArgs: any = {
        tgt_lang: tgtLang
    };
    if (srcLang) {
        translationArgs.src_lang = srcLang;
    }

    const results: string[] = [];

    // Batch translation to avoid freezing
    const BATCH_SIZE = 8;
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const output = await translator(batch, translationArgs);

        if (Array.isArray(output)) {
             for (const res of output) {
                 if (res && (res as any).translation_text) {
                     results.push((res as any).translation_text);
                 } else {
                     results.push(""); // Fallback
                 }
             }
        }

        // Small yield to event loop
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  /**
   * Disposes of the active Translator to free RAM/VRAM.
   */
  static async dispose() {
    if (this.instance) {
      await this.instance.dispose();
      this.instance = null;
      this.currentModel = '';
    }
  }
}
