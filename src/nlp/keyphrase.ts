import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import { EmbeddingPipeline } from './embeddings';
import type { EmbeddingOptions } from './embeddings';
import { Similarity } from '../math/similarity';

const nlp = winkNLP(model);
const its = nlp.its;

export interface KeyphraseOptions {
  ngramRange?: [number, number]; // e.g., [1, 2] for unigrams and bigrams
  topK?: number;
  embeddingOptions?: EmbeddingOptions;
}

export interface KeyphraseResult {
  phrase: string;
  score: number;
}

export class KeyphraseExtractor {
  /**
   * Extracts keyphrases from a document using the KeyBERT methodology.
   * 1. Tokenizes the document into candidate n-grams.
   * 2. Embeds the original document and all candidate n-grams.
   * 3. Computes cosine similarity between the document embedding and candidate embeddings.
   * 4. Returns the top K most similar phrases.
   *
   * Note: This is compute-intensive for large documents and vocabularies.
   */
  static async extract(document: string, options: KeyphraseOptions = {}): Promise<KeyphraseResult[]> {
    if (!document || document.trim() === '') return [];

    const {
      ngramRange = [1, 2],
      topK = 5,
      embeddingOptions = {}
    } = options;

    // 1. Generate candidate n-grams
    const doc = nlp.readDoc(document);
    // Extract words, filtering out pure punctuation and stop words
    const tokens = doc.tokens()
      .filter((t: any) => t.out(its.type) === 'word' && !t.out(its.stopWordFlag))
      .out(its.normal);

    if (tokens.length === 0) return [];

    const candidates = new Set<string>();

    const [minN, maxN] = ngramRange;
    for (let n = minN; n <= maxN; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const ngram = tokens.slice(i, i + n).join(' ');
        candidates.add(ngram);
      }
    }

    const candidateArray = Array.from(candidates);
    if (candidateArray.length === 0) return [];

    // 2. Embed document and candidates
    // We do this sequentially to respect memory limits. Document first, then candidates.
    const docEmbeddings = await EmbeddingPipeline.embedTexts([document], embeddingOptions);
    if (docEmbeddings.length === 0) return [];
    const docVector = docEmbeddings[0];

    // Batch candidate embeddings if there are many to prevent UI blocking / OOM
    const BATCH_SIZE = 128;
    const candidateEmbeddings: number[][] = [];

    for (let i = 0; i < candidateArray.length; i += BATCH_SIZE) {
        const batch = candidateArray.slice(i, i + BATCH_SIZE);
        const batchEmbeddings = await EmbeddingPipeline.embedTexts(batch, embeddingOptions);
        candidateEmbeddings.push(...batchEmbeddings);
        // Small yield to event loop
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    // 3. Compute cosine similarities
    const results: KeyphraseResult[] = [];
    for (let i = 0; i < candidateArray.length; i++) {
        const candidateVector = candidateEmbeddings[i];
        // embedTexts already returns L2 normalized vectors, so dot product == cosine similarity
        const similarity = Similarity.cosine(docVector, candidateVector);
        results.push({
            phrase: candidateArray[i],
            score: similarity
        });
    }

    // 4. Sort and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
