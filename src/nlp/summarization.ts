import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);
const its = nlp.its;

import type { ISummarizer } from './generative';

export class SummarizationEngine implements ISummarizer {
  /**
   * Generates an extractive summary for a given text by scoring sentences using a basic TF-IDF approach.
   *
   * @param text The input document or cluster text.
   * @param options Configuration options. Uses topK to determine number of sentences (default 2).
   * @returns An array of the top K most representative sentences.
   */
  async summarize(text: string, options: { topK?: number } = {}): Promise<string[]> {
      const topK = options.topK || 2;
      return SummarizationEngine.extractSummary(text, topK);
  }

  /**
   * Generates an extractive summary for a given text by scoring sentences using a basic TF-IDF approach.
   *
   * @param text The input document or cluster text.
   * @param topK The number of sentences to extract for the summary (default 2).
   * @returns An array of the top K most representative sentences.
   */
  static extractSummary(text: string, topK: number = 2): string[] {
    if (!text || text.trim() === '') return [];

    const doc = nlp.readDoc(text);
    const sentences = doc.sentences().out();

    if (sentences.length <= topK) {
      return sentences;
    }

    // 1. Calculate Term Frequencies across the entire text (the "document")
    const words = doc.tokens()
      .filter((t: any) => t.out(its.type) === 'word' && !t.out(its.stopWordFlag))
      .out(its.normal);

    const termFrequencies = new Map<string, number>();
    for (const word of words) {
      termFrequencies.set(word, (termFrequencies.get(word) || 0) + 1);
    }

    // 2. Score each sentence
    const sentenceScores = sentences.map((sentence: string, index: number) => {
      const sentenceDoc = nlp.readDoc(sentence);
      const sentenceWords = sentenceDoc.tokens()
        .filter((t: any) => t.out(its.type) === 'word' && !t.out(its.stopWordFlag))
        .out(its.normal);

      let score = 0;
      for (const word of sentenceWords) {
        score += termFrequencies.get(word) || 0;
      }

      // Normalize by sentence length to prevent bias towards long sentences
      if (sentenceWords.length > 0) {
          score = score / sentenceWords.length;
      }

      return { sentence, score, index };
    });

    // 3. Sort by score descending
    sentenceScores.sort((a: any, b: any) => b.score - a.score);

    // 4. Extract top K and sort them back to original appearance order for readability
    const topSentences = sentenceScores.slice(0, topK);
    topSentences.sort((a: any, b: any) => a.index - b.index);

    return topSentences.map((item: any) => item.sentence);
  }

  /**
   * Summarizes multiple clusters.
   *
   * @param classDocuments A map of cluster labels to their aggregated text.
   * @param topK The number of sentences to extract per cluster.
   * @returns A map of cluster labels to their extracted summaries.
   */
  static summarizeClusters(classDocuments: Map<number, string>, topK: number = 2): Map<number, string[]> {
    const summaries = new Map<number, string[]>();
    for (const [label, text] of classDocuments.entries()) {
      summaries.set(label, this.extractSummary(text, topK));
    }
    return summaries;
  }
}
