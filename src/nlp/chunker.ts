import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);
const its = nlp.its;

export interface ChunkerOptions {
  maxTokens: number;
  overlapTokens: number;
}

export class DocumentChunker {
  /**
   * Chunks a string of text into smaller segments based on token count using winkNLP.
   *
   * @param text The input text to chunk.
   * @param options Configuration for chunk size and overlap.
   * @returns An array of string chunks.
   */
  static chunkText(text: string, options: ChunkerOptions = { maxTokens: 256, overlapTokens: 50 }): string[] {
    if (!text || text.trim() === '') return [];

    const { maxTokens, overlapTokens } = options;
    if (maxTokens <= 0) throw new Error("maxTokens must be greater than 0");
    if (overlapTokens >= maxTokens) throw new Error("overlapTokens must be less than maxTokens");

    const doc = nlp.readDoc(text);
    const tokens = doc.tokens().out();

    if (tokens.length <= maxTokens) {
      return [text];
    }

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < tokens.length) {
      const endIndex = Math.min(startIndex + maxTokens, tokens.length);
      const chunkTokens = tokens.slice(startIndex, endIndex);

      // Reconstruct text from tokens. Note: This simple join might lose original
      // whitespace formatting, but is generally acceptable for semantic embedding.
      // winkNLP has built-in text reconstruction but token slice extraction is manual.
      chunks.push(chunkTokens.join(' '));

      if (endIndex === tokens.length) {
        break;
      }

      startIndex += (maxTokens - overlapTokens);
    }

    return chunks;
  }
}
