export class CoherenceMetrics {
  /**
   * Calculates the Normalized Pointwise Mutual Information (NPMI) topic coherence score.
   *
   * @param topWordsPerTopic A list of arrays, where each array contains the top K words for a topic.
   * @param tokenizedDocuments The reference corpus (array of documents, where each document is an array of string tokens)
   * @returns An array of NPMI scores (one per topic) and the mean NPMI score across all topics.
   */
  static calculateNPMI(
    topWordsPerTopic: string[][],
    tokenizedDocuments: string[][]
  ): { topicScores: number[]; meanScore: number } {
    if (topWordsPerTopic.length === 0 || tokenizedDocuments.length === 0) {
      return { topicScores: [], meanScore: 0 };
    }

    const D = tokenizedDocuments.length;

    // First, compute document frequencies for each word and word pair
    const wordDocFreq = new Map<string, number>();
    const pairDocFreq = new Map<string, number>();

    // For efficiency, we only care about words that actually appear in topWordsPerTopic
    const targetWords = new Set<string>();
    topWordsPerTopic.forEach(topic => topic.forEach(word => targetWords.add(word)));

    for (const docTokens of tokenizedDocuments) {
      // Get unique words in the document that are also in our target set
      const uniqueWordsInDoc = Array.from(new Set(docTokens)).filter(word => targetWords.has(word));

      // Update individual word document frequency
      for (const word of uniqueWordsInDoc) {
        wordDocFreq.set(word, (wordDocFreq.get(word) || 0) + 1);
      }

      // Update word pair document frequency
      for (let i = 0; i < uniqueWordsInDoc.length; i++) {
        for (let j = i + 1; j < uniqueWordsInDoc.length; j++) {
          const w1 = uniqueWordsInDoc[i];
          const w2 = uniqueWordsInDoc[j];
          // Ensure consistent pair ordering
          const pair = w1 < w2 ? `${w1}|${w2}` : `${w2}|${w1}`;
          pairDocFreq.set(pair, (pairDocFreq.get(pair) || 0) + 1);
        }
      }
    }

    const topicScores: number[] = [];
    const epsilon = 1e-12; // Smoothing to avoid log(0) and division by zero

    for (const topicWords of topWordsPerTopic) {
      let npmiSum = 0;
      let pairsCount = 0;

      for (let i = 0; i < topicWords.length; i++) {
        for (let j = i + 1; j < topicWords.length; j++) {
          const w1 = topicWords[i];
          const w2 = topicWords[j];
          const pair = w1 < w2 ? `${w1}|${w2}` : `${w2}|${w1}`;

          const p_w1 = (wordDocFreq.get(w1) || 0) / D;
          const p_w2 = (wordDocFreq.get(w2) || 0) / D;
          const p_w1_w2 = (pairDocFreq.get(pair) || 0) / D;

          // If words never co-occur, NPMI is -1
          if (p_w1_w2 === 0) {
            npmiSum += -1;
          } else {
            const pmi = Math.log(p_w1_w2 / (p_w1 * p_w2 + epsilon));
            const npmi = pmi / -Math.log(p_w1_w2 + epsilon);
            npmiSum += npmi;
          }
          pairsCount++;
        }
      }

      // If a topic has less than 2 words, score is 0
      topicScores.push(pairsCount > 0 ? npmiSum / pairsCount : 0);
    }

    const meanScore = topicScores.length > 0
      ? topicScores.reduce((sum, score) => sum + score, 0) / topicScores.length
      : 0;

    return { topicScores, meanScore };
  }
}
