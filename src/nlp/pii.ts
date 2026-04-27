import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);
const its = nlp.its;

import { pipeline, env } from '@huggingface/transformers';

export interface PIIRedactorOptions {
  maskEmails?: boolean;
  maskPhones?: boolean;
  maskUrls?: boolean;
  maskMoney?: boolean;
  customRegex?: { name: string; regex: RegExp }[];
  useAIPrivacyFilter?: boolean; // Whether to use OpenAI Privacy Filter via transformers.js
}

export class PIIRedactor {
  private static classifier: any = null;

  /**
   * Initializes the OpenAI Privacy Filter model if not already loaded.
   */
  private static async initAIModel() {
    if (!this.classifier) {
      if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }
      try {
        this.classifier = await pipeline("token-classification", "openai/privacy-filter", {
          device: "webgpu", // Attempt WebGPU first for speed
          dtype: "q4",
        });
      } catch (err) {
        console.warn("PIIRedactor: WebGPU failed, falling back to CPU", err);
        this.classifier = await pipeline("token-classification", "openai/privacy-filter", {
          device: "cpu",
          dtype: "q4",
        });
      }
    }
  }

  /**
   * Disposes of the AI model to free memory.
   */
  static async dispose() {
    if (this.classifier) {
      if (typeof this.classifier.dispose === 'function') {
        await this.classifier.dispose();
      }
      this.classifier = null;
    }
  }

  /**
   * Redacts text using the OpenAI Privacy Filter.
   */
  private static async redactAI(text: string): Promise<string> {
    await this.initAIModel();
    // OpenAI Privacy Filter supports aggregation_strategy "simple"
    const output = await this.classifier(text, { aggregation_strategy: "simple" });

    // We get an array of entities, e.g., { entity_group: 'private_email', word: ' test@test.com', score: 0.99 }
    // We need to replace them in the text. Since word offsets might be tricky, we'll use a simple string replacement.
    // However, it's safer to sort them by length descending so we don't partially replace substrings.
    let redactedText = text;

    // Sort entities by length of word descending to prevent partial replacements overlapping
    const entities = output.sort((a: any, b: any) => b.word.length - a.word.length);

    for (const entity of entities) {
       const mask = `[REDACTED_${entity.entity_group.toUpperCase()}]`;
       // Some words might start with a space from tokenization
       const entityWord = entity.word.trim();
       if (entityWord.length > 0) {
           const escapedValue = entityWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
           // Try exact boundaries first, then fallback
           const regexStr = /(?:^|\W)/.test(entityWord[0]) ? escapedValue : `\\b${escapedValue}\\b`;
           try {
               redactedText = redactedText.replace(new RegExp(regexStr, 'g'), mask);
           } catch {
               redactedText = redactedText.split(entityWord).join(mask);
           }
       }
    }
    return redactedText;
  }

  /**
   * Identifies and masks Personally Identifiable Information (PII) within a document.
   * This operates as a pre-processing step before embeddings or RAG export.
   * Uses winkNLP entity extraction and custom regex fallbacks.
   * If `useAIPrivacyFilter` is true, it uses the OpenAI Privacy Filter via transformers.js.
   *
   * @param text The input document
   * @param options Configuration for which entity types to mask
   * @returns The redacted text
   */
  static async redact(text: string, options: PIIRedactorOptions = {}): Promise<string> {
    if (!text || text.trim() === '') return text;

    const {
      maskEmails = true,
      maskPhones = true,
      maskUrls = true,
      maskMoney = false,
      customRegex = [],
      useAIPrivacyFilter = false
    } = options;

    let redactedText = text;

    if (useAIPrivacyFilter) {
      redactedText = await this.redactAI(redactedText);
    }

    // 1. Regex Replacements (SSNs, custom formats, etc.)
    for (const custom of customRegex) {
        redactedText = redactedText.replace(custom.regex, `[REDACTED_${custom.name.toUpperCase()}]`);
    }

    // 2. Wink-NLP Entity Extraction Replacements
    const doc = nlp.readDoc(redactedText);
    const entities = doc.entities().out(its.detail) as any[];

    // We do simple string replacement, so sorting isn't strictly necessary for spans,
    // but it's good practice. However, `out(its.detail)` doesn't actually guarantee `span`
    // property on entities in wink-nlp depending on the exact extraction method,
    // so we just rely on `value` and `type`.

    for (const entity of entities) {
        const type = entity.type;

        let mask = null;

        if (maskEmails && type === 'EMAIL') {
            mask = '[REDACTED_EMAIL]';
        } else if (maskUrls && type === 'URL') {
            mask = '[REDACTED_URL]';
        } else if (maskMoney && type === 'MONEY') {
            mask = '[REDACTED_MONEY]';
        }
        // phone is sometimes detected by wink as custom depending on model version, but let's add basic support
        // if wink's base entity recognizes it.
        else if (maskPhones && (type === 'PHONE' || type === 'PHONENUMBER')) {
            mask = '[REDACTED_PHONE]';
        }

        if (mask) {
            // Wink gives token spans, we need to map them back to characters if we want exact replacements.
            // The safest way is to use markup, but we can also just do global replaces for the exact entity string
            // if we assume exact string matching is safe enough for emails/urls.
            // A more robust way using wink is doc.markup, but for simple string replacement:

            // To ensure we only replace exact matches and not substrings accidentally, we can use a global replace
            // but we must escape regex chars in the entity value.
            const entityValue = entity.value;
            const escapedValue = entityValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // We use word boundaries \b if it's alphanumeric, otherwise just global replace
            const regexStr = /^\w/.test(entityValue) ? `\\b${escapedValue}\\b` : escapedValue;

            try {
                redactedText = redactedText.replace(new RegExp(regexStr, 'g'), mask);
            } catch (e) {
                // Fallback to simple replace if regex creation fails for some weird edge case
                redactedText = redactedText.split(entityValue).join(mask);
            }
        }
    }

    return redactedText;
  }

  /**
   * Process a batch of documents.
   */
  static async redactBatch(documents: string[], options: PIIRedactorOptions = {}): Promise<string[]> {
      const results = [];
      for (const doc of documents) {
          results.push(await this.redact(doc, options));
      }
      return results;
  }
}
