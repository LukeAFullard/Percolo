import { describe, it, expect } from 'vitest';
import { SummarizationEngine } from '../../src/nlp/summarization';

describe('SummarizationEngine', () => {
  it('should extract top sentences based on word frequencies', () => {
    const text = `
      Artificial intelligence is rapidly evolving.
      The weather today is quite sunny and pleasant.
      Many researchers are studying artificial intelligence and machine learning.
      I bought some apples at the store.
      Advances in artificial intelligence will change the world.
    `;

    const summary = SummarizationEngine.extractSummary(text, 2);

    // We expect the sentences about "artificial intelligence" to score higher
    expect(summary.length).toBe(2);

    // Check that at least one of the expected top sentences is in the summary
    const containsAI = summary.some(sentence => sentence.includes('artificial intelligence'));
    expect(containsAI).toBe(true);

    const containsWeather = summary.some(sentence => sentence.includes('weather'));
    expect(containsWeather).toBe(false); // Weather should score low
  });

  it('should return all sentences if requested count exceeds available', () => {
    const text = "This is one sentence. This is two.";
    const summary = SummarizationEngine.extractSummary(text, 5);
    expect(summary.length).toBe(2);
  });

  it('should handle empty text', () => {
    expect(SummarizationEngine.extractSummary('', 2)).toEqual([]);
    expect(SummarizationEngine.extractSummary('   ', 2)).toEqual([]);
  });

  it('should summarize multiple clusters', () => {
    const classDocs = new Map<number, string>([
      [0, "Dogs are great. Cats are okay. Dogs bark loudly."],
      [1, "Space is big. Planets orbit stars. Space is cold."]
    ]);

    const summaries = SummarizationEngine.summarizeClusters(classDocs, 1);

    // For cluster 0, "Dogs" appears twice, so sentences with "Dogs" should score higher.
    // "Dogs are great." or "Dogs bark loudly." are valid.
    const cluster0Summary = summaries.get(0)![0];
    expect(cluster0Summary).toContain('Dogs');

    // For cluster 1, "Space" appears twice, so sentences with "Space" should score higher.
    const cluster1Summary = summaries.get(1)![0];
    expect(cluster1Summary).toContain('Space');
  });
});
