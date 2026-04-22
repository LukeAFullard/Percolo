import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);

export type HardwareTier = 'Tier 1' | 'Tier 2' | 'Tier 3';

export interface HardwareProfile {
  tier: HardwareTier;
  maxTokens: number;
  enforceQuantization: 'INT4' | 'INT8' | 'FP16' | 'FP32';
}

export class HardwareProfiler {
  /**
   * Profiles the current client environment to determine hardware capabilities
   * and assigns a Cap-and-Tier safety limit based on a Token Budget to prevent OOM crashes.
   */
  static determineTier(): HardwareProfile {
    // navigator.deviceMemory is an experimental feature and may not exist on all browsers (e.g. Safari)
    // We fall back to 4GB if undefined, forcing a conservative Tier 1.

    const memory = (navigator as any)?.deviceMemory || 4;

    if (memory <= 4) {
      // Mobile or low-RAM environments
      return {
        tier: 'Tier 1',
        maxTokens: 250000,
        enforceQuantization: 'INT4'
      };
    } else if (memory > 4 && memory <= 8) {
      // Mid-range laptop
      return {
        tier: 'Tier 2',
        maxTokens: 1000000,
        enforceQuantization: 'INT8'
      };
    } else {
      // High-end desktop
      return {
        tier: 'Tier 3',
        maxTokens: 2500000,
        enforceQuantization: 'FP16' // Or FP32 based on WebGPU stress test
      };
    }
  }

  /**
   * Performs a fast pre-flight token count using winkNLP.
   * While the project plan mentions a WASM token counter, winkNLP is capable
   * of millions of tokens per second and acts as our current fast pre-flight counter.
   * Note: winkNLP uses word-level tokenization, while transformer models (MiniLM)
   * use subword tokenization (WordPiece). We apply a 1.3x multiplier to approximate
   * subword tokens and ensure the budget isn't underestimated.
   */
  static async countTokens(texts: string[]): Promise<number> {
    let totalTokens = 0;
    for (const text of texts) {
      const doc = nlp.readDoc(text);
      totalTokens += doc.tokens().length();
    }
    return Math.ceil(totalTokens * 1.3);
  }

  /**
   * Validates if the uploaded corpus exceeds the hardware token budget.
   * Throws an error if the budget is exceeded.
   */
  static async validateCorpusSize(texts: string[], profile: HardwareProfile): Promise<void> {
    const totalTokens = await this.countTokens(texts);
    if (totalTokens > profile.maxTokens) {
      throw new Error(
        `Memory constraints exceeded. Your device (${profile.tier}) supports up to ${profile.maxTokens} tokens. You attempted to load ${totalTokens} tokens.`
      );
    }
  }
}
