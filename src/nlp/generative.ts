import { pipeline, TextGenerationPipeline } from '@huggingface/transformers';
import { EmbeddingPipeline } from './embeddings';

export interface ISummarizer {
  summarize(text: string, options?: any): Promise<string[]>;
}

export interface GenerativeOptions {
  modelName?: string; // e.g., 'Xenova/TinyLlama-1.1B-Chat-v1.0' or 'Xenova/Qwen1.5-0.5B-Chat'
  precision?: 'fp32' | 'fp16' | 'q4' | 'q8';
  maxNewTokens?: number;
  temperature?: number;
  promptTemplate?: (text: string) => string;
}

export class GenerativeSummarizer implements ISummarizer {
  private static instance: TextGenerationPipeline | null = null;
  private static currentModel: string = '';

  /**
   * Initializes the LLM pipeline singleton.
   * VERY IMPORTANT: WebGPU LLMs require significant VRAM.
   * This method forces the disposal of the EmbeddingPipeline to prevent OOM errors.
   */
  static async getInstance(options: GenerativeOptions = {}): Promise<TextGenerationPipeline> {
    const {
      modelName = 'Xenova/TinyLlama-1.1B-Chat-v1.0',
      precision = 'q4' // Default to highly quantized to survive browser limits
    } = options;

    if (this.instance && this.currentModel === modelName) {
      return this.instance;
    }

    // 🚨 CAP-AND-TIER ENFORCEMENT: Clear embedding memory before loading LLM 🚨
    await EmbeddingPipeline.dispose();

    try {
      this.instance = await pipeline('text-generation', modelName, {
        dtype: precision as any,
        device: 'webgpu' // LLMs practically require WebGPU. CPU/WASM is too slow.
      });
      this.currentModel = modelName;
    } catch (error) {
      console.warn(`Failed to initialize generative LLM ${modelName} on WebGPU. Falling back to CPU (This will be extremely slow). Error: ${error}`);
      this.instance = await pipeline('text-generation', modelName, {
        dtype: precision as any,
        device: 'cpu'
      });
      this.currentModel = modelName;
    }

    return this.instance;
  }

  /**
   * Generates a summary for a given text using a local Micro-LLM.
   */
  async summarize(text: string, options: GenerativeOptions = {}): Promise<string[]> {
    if (!text || text.trim() === '') return [];

    const llm = await GenerativeSummarizer.getInstance(options);

    const defaultPrompt = (input: string) => `Summarize the following text in one concise sentence:\n\n${input}\n\nSummary:`;
    const promptFunc = options.promptTemplate || defaultPrompt;

    // To prevent context window overflows, we must truncate the input text.
    // A primitive character truncation is used here; a real app might use the tokenizer length.
    const MAX_CHARS = 1500; // Roughly ~300-400 tokens
    const truncatedText = text.length > MAX_CHARS ? text.substring(0, MAX_CHARS) + '...' : text;

    const prompt = promptFunc(truncatedText);

    const output = await llm(prompt, {
      max_new_tokens: options.maxNewTokens || 50,
      temperature: options.temperature || 0.3,
      do_sample: true,
      return_full_text: false // We only want the generated summary, not the prompt echo
    });

    // The output format from transformers.js text-generation is an array of objects
    if (Array.isArray(output) && output.length > 0 && output[0].generated_text) {
        // Return as a single-element array to match the ISummarizer signature (which supports multi-sentence extractive)
        return [output[0].generated_text.trim()];
    }

    return [];
  }

  /**
   * Generates a concise 2-3 word topic label based on a list of keywords.
   */
  async generateTopicLabel(keywords: string[], options: GenerativeOptions = {}): Promise<string> {
    if (!keywords || keywords.length === 0) return "";

    const llm = await GenerativeSummarizer.getInstance(options);

    const keywordStr = keywords.join(', ');
    const defaultPrompt = (input: string) => `Based on the following keywords: [${input}], write a concise 2-to-3 word label that describes this topic.\n\nTopic Label:`;
    const promptFunc = options.promptTemplate || defaultPrompt;

    const prompt = promptFunc(keywordStr);

    const output = await llm(prompt, {
      max_new_tokens: options.maxNewTokens || 10, // keep it very short
      temperature: options.temperature || 0.1, // low temp for deterministic labeling
      do_sample: true,
      return_full_text: false
    });

    if (Array.isArray(output) && output.length > 0 && output[0].generated_text) {
        let label = output[0].generated_text.trim();
        // LLMs sometimes answer verbosely even when asked not to.
        // We do a basic cleanup (e.g. taking the first line or removing quotes)
        label = label.replace(/^["']|["']$/g, '').split('\n')[0].trim();
        return label;
    }

    return "";
  }

  /**
   * Disposes of the active LLM to free VRAM.
   */
  static async dispose() {
    if (this.instance) {
      await this.instance.dispose();
      this.instance = null;
      this.currentModel = '';
    }
  }
}
