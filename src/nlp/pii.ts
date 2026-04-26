import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);
const its = nlp.its;

export interface PIIRedactorOptions {
  maskEmails?: boolean;
  maskPhones?: boolean;
  maskUrls?: boolean;
  maskMoney?: boolean;
  customRegex?: { name: string; regex: RegExp }[];
}

export class PIIRedactor {
  /**
   * Identifies and masks Personally Identifiable Information (PII) within a document.
   * This operates as a pre-processing step before embeddings or RAG export.
   * Uses winkNLP entity extraction and custom regex fallbacks.
   *
   * @param text The input document
   * @param options Configuration for which entity types to mask
   * @returns The redacted text
   */
  static redact(text: string, options: PIIRedactorOptions = {}): string {
    if (!text || text.trim() === '') return text;

    const {
      maskEmails = true,
      maskPhones = true,
      maskUrls = true,
      maskMoney = false,
      customRegex = []
    } = options;

    let redactedText = text;

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
  static redactBatch(documents: string[], options: PIIRedactorOptions = {}): string[] {
      return documents.map(doc => this.redact(doc, options));
  }
}
