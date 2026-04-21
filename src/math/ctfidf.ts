export class CTFIDF {
  static calculate(
    classTermFrequencies: number[][],
    globalTermFrequencies: number[],
    averageClassSize: number
  ): number[][] {
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
        const f_xc = classFrequencies[x];
        const f_x = globalTermFrequencies[x];

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
