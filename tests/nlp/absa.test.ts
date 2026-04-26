import { describe, it, expect, afterAll } from 'vitest';
import { ABSAEngine } from '../../src/nlp/absa';

describe('ABSAEngine', () => {

  afterAll(async () => {
    await ABSAEngine.dispose();
  });

  it('should auto-extract sensible noun-phrase aspects', () => {
    const text = "The battery life is amazing, but the customer service was terrible. The shiny screen is nice.";
    const aspects = ABSAEngine.extractAspects(text);

    // Check for combinations of adjectives + nouns
    expect(aspects).toContain('battery life');
    expect(aspects).toContain('customer service');
    expect(aspects).toContain('shiny screen');
  });

  it('should handle empty text gracefully', async () => {
    const results = await ABSAEngine.analyze('');
    expect(results).toEqual([]);
  });

  it('should perform aspect-based sentiment analysis with a mocked model', async () => {

    const originalGetInstance = ABSAEngine.getInstance;

    ABSAEngine.getInstance = async () => {
        // Return a mock pipeline function
        return (async (text: string) => {
            if (text.toLowerCase().includes('battery')) return [{ label: '5 stars', score: 0.99 }]; // Positive
            if (text.toLowerCase().includes('screen')) return [{ label: '1 star', score: 0.85 }]; // Negative
            return [{ label: '3 stars', score: 0.5 }]; // Neutral
        }) as any;
    };

    const text = "The battery is amazing. The screen is broken.";
    // Force specific aspects for this test
    const results = await ABSAEngine.analyze(text, { aspects: ['battery', 'screen'] });

    expect(results.length).toBe(2);

    const batteryResult = results.find(r => r.aspect === 'battery');
    expect(batteryResult?.sentiment).toBe('positive');

    const screenResult = results.find(r => r.aspect === 'screen');
    expect(screenResult?.sentiment).toBe('negative');

    // Restore original
    ABSAEngine.getInstance = originalGetInstance;
  });

});
