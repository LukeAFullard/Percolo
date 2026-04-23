export interface CTFIDFOptions {
  seedWords?: string[];
  seedMultiplier?: number;
  vocabulary?: string[];
}

export class CTFIDF {
  static calculate(
    classTermFrequencies: number[][],
    globalTermFrequencies: number[],
    averageClassSize: number,
    options: CTFIDFOptions = {}
  ): number[][] {
    const { seedWords = [], seedMultiplier = 1.5, vocabulary = [] } = options;
    const numClasses = classTermFrequencies.length;
    if (numClasses === 0) return [];

    const numVocab = globalTermFrequencies.length;
    const ctfidfMatrix: number[][] = [];

    for (let c = 0; c < numClasses; c++) {
      const classFrequencies = classTermFrequencies[c];

      let maxFreqInClass = 0;
      for (let x = 0; x < numVocab; x++) {
        if (classFrequencies[x] > maxFreqInClass) {
          maxFreqInClass = classFrequencies[x];
        }
      }

      maxFreqInClass = Math.max(maxFreqInClass, 1);

      const classScores: number[] = new Array(numVocab);

      for (let x = 0; x < numVocab; x++) {
        let f_xc = classFrequencies[x];
        const f_x = globalTermFrequencies[x];

        // Apply seed word boosting if applicable
        if (seedWords.length > 0 && vocabulary.length === numVocab) {
          const word = vocabulary[x];
          if (seedWords.includes(word)) {
            f_xc *= seedMultiplier;
          }
        }

        const termFreq = f_xc / maxFreqInClass;
        const idf = Math.log(1 + (averageClassSize / (1 + f_x)));
        classScores[x] = termFreq * idf;
      }

      ctfidfMatrix.push(classScores);
    }

    return ctfidfMatrix;
  }

  static extractTopWordsPerClass(
    ctfidfMatrix: number[][],
    vocabulary: string[],
    topK: number = 10
  ): Array<Array<{ word: string; score: number }>> {
    return ctfidfMatrix.map((classScores) => {
      const wordScores = classScores.map((score, idx) => ({
        word: vocabulary[idx],
        score: score
      }));

      wordScores.sort((a, b) => b.score - a.score);
      return wordScores.slice(0, topK);
    });
  }
}
