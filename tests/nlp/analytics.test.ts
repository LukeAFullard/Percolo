import { describe, it, expect } from 'vitest';
import { NLPAnalytics } from '../../src/nlp/analytics';

describe('NLPAnalytics Module', () => {
  it('should calculate sentiment correctly', () => {
    const positiveDoc = NLPAnalytics.processDocument("I absolutely love this amazing product! It is fantastic.");
    expect(positiveDoc.sentiment).toBeGreaterThan(0);

    const negativeDoc = NLPAnalytics.processDocument("This is terrible. I hate this awful experience.");
    expect(negativeDoc.sentiment).toBeLessThan(0);

    const neutralDoc = NLPAnalytics.processDocument("The car is parked outside the house.");
    expect(neutralDoc.sentiment).toBe(0);
  });

  it('should extract entities correctly', () => {
    const text = "Please contact me at test@example.com by January 15th, 2024 to discuss the $500 invoice.";
    const result = NLPAnalytics.processDocument(text);

    expect(result.entities.emails).toContain("test@example.com");
    expect(result.entities.dates.length).toBeGreaterThan(0);
    expect(result.entities.money.length).toBeGreaterThan(0);
  });

  it('should aggregate cluster sentiment correctly', () => {
    const scores = [0.5, -0.2, 0.3, 0.4];
    const avg = NLPAnalytics.aggregateClusterSentiment(scores);
    expect(avg).toBe(0.25);

    expect(NLPAnalytics.aggregateClusterSentiment([])).toBe(0);
  });
});
