import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import csr from 'csr-matrix';

const nlp = winkNLP(model);
const its = nlp.its;

export interface LexicalExtractionOptions {
  minDf?: number; // Minimum document frequency for vocabulary pruning (default 2)
}

export interface LexicalResult {
  matrix: any; // CSR matrix
  vocabulary: string[];
  globalTermFrequencies: number[];
  averageClassSize: number;
  uniqueClasses: number[];
}

export class LexicalExtractor {
  /**
   * Phase 5: Lexical Extraction & Sparse Matrix Construction
   * Aggregates documents by class, tokenizes, prunes vocabulary, and constructs a CSR matrix.
   *
   * @param documents Array of original document strings
   * @param labels Array of cluster labels corresponding to each document
   * @param options LexicalExtractionOptions (e.g., minDf)
   * @returns LexicalResult containing the CSR matrix, vocabulary, and stats for TF-IDF
   */
  static extract(documents: string[], labels: number[], options: LexicalExtractionOptions = {}): LexicalResult {
    const minDf = options.minDf !== undefined ? options.minDf : 2;

    if (documents.length === 0 || labels.length === 0 || documents.length !== labels.length) {
      return {
        matrix: null,
        vocabulary: [],
        globalTermFrequencies: [],
        averageClassSize: 0,
        uniqueClasses: []
      };
    }

    // 1. Class-Document Aggregation
    const classDocumentsMap = new Map<number, string[]>();
    for (let i = 0; i < documents.length; i++) {
      const label = labels[i];
      if (!classDocumentsMap.has(label)) {
        classDocumentsMap.set(label, []);
      }
      classDocumentsMap.get(label)!.push(documents[i]);
    }

    const uniqueClasses = Array.from(classDocumentsMap.keys()).sort((a, b) => a - b);
    const aggregatedDocs: string[] = [];
    uniqueClasses.forEach(label => {
      aggregatedDocs.push(classDocumentsMap.get(label)!.join(' '));
    });

    // 2. High-Speed Tokenization & Term Frequencies
    // First pass: Calculate document frequencies (across classes) to prune vocabulary
    const classTermCounts = new Map<number, Map<string, number>>();
    const docFrequencies = new Map<string, number>();

    for (let i = 0; i < uniqueClasses.length; i++) {
      const label = uniqueClasses[i];
      const text = aggregatedDocs[i];
      const doc = nlp.readDoc(text);

      // Extract tokens, remove punctuation, remove stop words
      // Optionally extract bigrams here, but sticking to unigrams as default for now
      const tokens = doc.tokens()
        .filter((t: any) => t.out(its.type) === 'word' && !t.out(its.stopWordFlag))
        .out(its.normal);

      const termCountsForClass = new Map<string, number>();
      const uniqueTermsInClass = new Set<string>();

      for (const token of tokens) {
        termCountsForClass.set(token, (termCountsForClass.get(token) || 0) + 1);
        uniqueTermsInClass.add(token);
      }

      classTermCounts.set(label, termCountsForClass);

      for (const term of uniqueTermsInClass) {
        docFrequencies.set(term, (docFrequencies.get(term) || 0) + 1);
      }
    }

    // 3. Vocabulary Pruning
    const vocabulary: string[] = [];
    const termToIndex = new Map<string, number>();
    const globalTermFrequencies: number[] = [];

    // Filter terms based on minDf and build final vocabulary
    let termIdx = 0;
    for (const [term, df] of docFrequencies.entries()) {
      if (df >= minDf) {
        vocabulary.push(term);
        termToIndex.set(term, termIdx);
        termIdx++;

        // Calculate global frequency for this term across all classes
        let globalFreq = 0;
        for (const counts of classTermCounts.values()) {
            globalFreq += (counts.get(term) || 0);
        }
        globalTermFrequencies.push(globalFreq);
      }
    }

    // 4. Sparse Storage (CSR Matrix)
    // Build coordinate list format first, then convert to CSR
    const cells: [number, number, number][] = [];

    for (let rowIdx = 0; rowIdx < uniqueClasses.length; rowIdx++) {
      const label = uniqueClasses[rowIdx];
      const termCounts = classTermCounts.get(label)!;

      for (const [term, count] of termCounts.entries()) {
        const colIdx = termToIndex.get(term);
        if (colIdx !== undefined) {
          cells.push([rowIdx, colIdx, count]);
        }
      }
    }

    const matrix = csr.fromList(cells, uniqueClasses.length, vocabulary.length);

    // Calculate average class size (in words) for c-TF-IDF
    let totalWords = 0;
    for (const count of globalTermFrequencies) {
        totalWords += count;
    }
    const averageClassSize = totalWords / uniqueClasses.length;

    return {
      matrix,
      vocabulary,
      globalTermFrequencies,
      averageClassSize,
      uniqueClasses
    };
  }
}