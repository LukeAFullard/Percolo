import { describe, it, expect, afterAll } from 'vitest';
import { CrossLingualTranslator } from '../../src/nlp/translation';

describe('CrossLingualTranslator', () => {

  afterAll(async () => {
    await CrossLingualTranslator.dispose();
  });

  it('should handle empty input gracefully', async () => {
    expect(await CrossLingualTranslator.translate([])).toEqual([]);
  });

  it('should translate topics using a mock seq2seq model', async () => {
    // Note: In an actual CI environment, downloading a 600MB NLLB model will timeout or fail.
    // We mock the pipeline function to verify the interface logic directly.
    const originalGetInstance = CrossLingualTranslator.getInstance;

    CrossLingualTranslator.getInstance = async () => {
        // Return a mock pipeline function
        return (async (texts: string[], options: any) => {
            return texts.map(t => ({ translation_text: `Translated: ${t}` }));
        }) as any;
    };

    const frenchTopics = ["intelligence artificielle", "apprentissage automatique"];
    const results = await CrossLingualTranslator.translate(frenchTopics, { srcLang: 'fra_Latn', tgtLang: 'eng_Latn' });

    expect(results.length).toBe(2);
    expect(results[0]).toBe("Translated: intelligence artificielle");
    expect(results[1]).toBe("Translated: apprentissage automatique");

    // Restore original
    CrossLingualTranslator.getInstance = originalGetInstance;
  });

});
