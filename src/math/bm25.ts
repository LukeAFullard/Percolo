export interface BM25Options {
  k1?: number;
  b?: number;
  seedWords?: string[];
  seedMultiplier?: number;
  vocabulary?: string[];
}

export class BM25 {
  /**
   * Calculates Okapi BM25 scores for terms across classes.
   * BM25 addresses the document length bias in standard TF-IDF.
   *
   * @param classTermFrequencies Dense matrix of term frequencies per class
   * @param globalTermFrequencies Global term frequencies across all classes
   * @param averageClassSize Average length (in terms) of a class document
   * @param classSizes Array of lengths (in terms) for each class document
   * @param options Hyperparameters (k1, b) and Seed Word boosting
   * @returns Dense matrix of BM25 scores
   */
  static calculate(
    classTermFrequencies: number[][],
    globalTermFrequencies: number[],
    averageClassSize: number,
    classSizes: number[],
    options: BM25Options = {}
  ): number[][] {
    const {
      k1 = 1.5,
      b = 0.75,
      seedWords = [],
      seedMultiplier = 1.5,
      vocabulary = []
    } = options;

    const numClasses = classTermFrequencies.length;
    if (numClasses === 0) return [];

    const numVocab = globalTermFrequencies.length;
    const bm25Matrix: number[][] = [];

    for (let c = 0; c < numClasses; c++) {
      const classFrequencies = classTermFrequencies[c];
      const docLength = classSizes[c];

      const classScores: number[] = new Array(numVocab);

      for (let x = 0; x < numVocab; x++) {
        let f_xc = classFrequencies[x];

        // Apply seed word boosting
        if (seedWords.length > 0 && vocabulary.length === numVocab) {
          const word = vocabulary[x];
          if (seedWords.includes(word)) {
            f_xc *= seedMultiplier;
          }
        }

        // Standard BM25 IDF variant (probabilistic)
        // In our context, 'classes' are documents, so numClasses is the total number of docs.
        // The standard formula: idf(q) = ln(1 + (N - n(q) + 0.5) / (n(q) + 0.5))
        // However, if f_x (the number of classes containing the term) is equal to N, it can be negative or zero.
        // To avoid negative IDFs for terms appearing in > half of the corpus (like stop words that weren't caught),
        // we use a positive-only variant like Lucene's: Math.log(1 + (N - n(q) + 0.5)/(n(q) + 0.5))
        // Or simply the classic TF-IDF log(N/df). Let's use a safe variant.
        let df = 0;
        for (let idx = 0; idx < numClasses; idx++) {
            if (classTermFrequencies[idx][x] > 0) df++;
        }

        const idf = Math.log(1 + ((numClasses - df + 0.5) / (df + 0.5)));

        // TF component with saturation and length normalization
        const numerator = f_xc * (k1 + 1);
        const denominator = f_xc + k1 * (1 - b + b * (docLength / averageClassSize));

        const tf = numerator / denominator;

        classScores[x] = tf * idf;
      }

      bm25Matrix.push(classScores);
    }

    return bm25Matrix;
  }
}
