import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import { pipeline, TextClassificationPipeline } from '@huggingface/transformers';
import { EmbeddingPipeline } from './embeddings';

const nlp = winkNLP(model);
const its = nlp.its;

export interface ABSAOptions {
  modelName?: string; // e.g. 'Xenova/bert-base-multilingual-uncased-sentiment'
  precision?: 'fp32' | 'fp16' | 'q8' | 'q4';
  aspects?: string[]; // Optional: if empty, the engine will attempt to auto-extract noun-phrases
}

export interface AspectSentiment {
  aspect: string;
  sentiment: string; // 'positive', 'negative', 'neutral'
  score: number; // confidence score
}

export class ABSAEngine {
  private static instance: TextClassificationPipeline | null = null;
  private static currentModel: string = '';

  /**
   * Initializes the sequence classification pipeline singleton.
   */
  static async getInstance(options: ABSAOptions = {}): Promise<TextClassificationPipeline> {
    const {
      modelName = 'Xenova/bert-base-multilingual-uncased-sentiment',
      precision = 'q8'
    } = options;

    if (this.instance && this.currentModel === modelName) {
      return this.instance;
    }

    // Like other heavy NLP tasks, free embedding memory if jumping into classification
    await EmbeddingPipeline.dispose();

    try {
      this.instance = await pipeline('text-classification', modelName, {
        dtype: precision as any,
        device: 'webgpu'
      });
      this.currentModel = modelName;
    } catch (error) {
      console.warn(`Failed to initialize ABSA model ${modelName} on WebGPU. Falling back to WASM/CPU. Error: ${error}`);
      this.instance = await pipeline('text-classification', modelName, {
        dtype: precision as any,
        device: 'wasm'
      });
      this.currentModel = modelName;
    }

    return this.instance;
  }

  /**
   * Extracts noun-phrases to serve as aspects for sentiment analysis.
   */
  static extractAspects(text: string): string[] {
      const doc = nlp.readDoc(text);
      // Noun phrases are often good candidates for aspects (e.g. "battery life", "customer service")

      // Since wink-eng-lite-web-model doesn't natively expose a `.nounPhrases()` method in the lite version,
      // we'll approximate by finding sequential NOUNs and ADJ+NOUN combos
      const tokens = doc.tokens().out(its.normal);
      const posTags = doc.tokens().out(its.pos);
      const aspects = new Set<string>();

      let currentAspectWords: string[] = [];
      let currentAspectPos: string[] = [];

      for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const pos = posTags[i];

          if (pos === 'NOUN' || pos === 'PROPN' || pos === 'ADJ') {
              currentAspectWords.push(token);
              currentAspectPos.push(pos);
          } else {
              if (currentAspectWords.length > 0) {
                  const phrase = currentAspectWords.join(' ').toLowerCase();
                  // Require at least one noun in the phrase, not just adjectives
                  if (currentAspectPos.includes('NOUN') || currentAspectPos.includes('PROPN')) {
                      if (phrase.length > 2 && phrase.length < 30) {
                          aspects.add(phrase);
                      }
                  }
                  currentAspectWords = [];
                  currentAspectPos = [];
              }
          }
      }
      // Catch dangling aspect at the end of the text
      if (currentAspectWords.length > 0) {
          const phrase = currentAspectWords.join(' ').toLowerCase();
          if (currentAspectPos.includes('NOUN') || currentAspectPos.includes('PROPN')) {
              if (phrase.length > 2 && phrase.length < 30) {
                  aspects.add(phrase);
              }
          }
      }

      return Array.from(aspects);
  }

  /**
   * Analyzes the sentiment of specific aspects within a given text.
   * Uses NLI or Sequence Classification approaches depending on the model.
   * Standard approach for non-ABSA specific models: inject the aspect into the text or format it.
   * For this implementation, we will extract sentences containing the aspect and score the sentence.
   */
  static async analyze(text: string, options: ABSAOptions = {}): Promise<AspectSentiment[]> {
    if (!text || text.trim() === '') return [];

    const aspectsToAnalyze = options.aspects && options.aspects.length > 0
        ? options.aspects
        : this.extractAspects(text);

    if (aspectsToAnalyze.length === 0) return [];

    const classifier = await this.getInstance(options);
    const doc = nlp.readDoc(text.toLowerCase());
    const sentences = doc.sentences().out();

    const results: AspectSentiment[] = [];

    // Batch process to avoid UI freeze
    for (const aspect of aspectsToAnalyze) {
        // Find sentences that mention the aspect
        const relevantSentences = sentences.filter((s: string) => s.includes(aspect));

        if (relevantSentences.length > 0) {
            // Score the combined relevant context
            const context = relevantSentences.join(' ');
            const output = await classifier(context);

            if (Array.isArray(output) && output.length > 0) {
                // Determine label based on generic model outputs
                // e.g. 1/2/3/4/5 stars, POSITIVE/NEGATIVE, etc.
                const rawLabel = (output[0] as any).label.toString().toLowerCase();
                const score = (output[0] as any).score;

                let finalSentiment = 'neutral';
                if (rawLabel.includes('pos') || rawLabel.includes('5') || rawLabel.includes('4')) finalSentiment = 'positive';
                if (rawLabel.includes('neg') || rawLabel.includes('1') || rawLabel.includes('2')) finalSentiment = 'negative';

                results.push({
                    aspect,
                    sentiment: finalSentiment,
                    score
                });
            }
        }
        await new Promise(resolve => setTimeout(resolve, 0)); // yield
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