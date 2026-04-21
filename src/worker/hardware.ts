export type HardwareTier = 'Tier 1' | 'Tier 2' | 'Tier 3';

export interface HardwareProfile {
  tier: HardwareTier;
  maxDocuments: number;
  enforceQuantization: 'INT4' | 'INT8' | 'FP16' | 'FP32';
}

export class HardwareProfiler {
  /**
   * Profiles the current client environment to determine hardware capabilities
   * and assigns a Cap-and-Tier safety limit to prevent OOM crashes.
   */
  static determineTier(): HardwareProfile {
    // navigator.deviceMemory is an experimental feature and may not exist on all browsers (e.g. Safari)
    // We fall back to 4GB if undefined, forcing a conservative Tier 1.
    // @ts-ignore
    const memory = navigator?.deviceMemory || 4;

    if (memory <= 4) {
      // Mobile or low-RAM environments
      return {
        tier: 'Tier 1',
        maxDocuments: 500,
        enforceQuantization: 'INT4'
      };
    } else if (memory > 4 && memory <= 8) {
      // Mid-range laptop
      return {
        tier: 'Tier 2',
        maxDocuments: 2000,
        enforceQuantization: 'INT8'
      };
    } else {
      // High-end desktop
      return {
        tier: 'Tier 3',
        maxDocuments: 5000,
        enforceQuantization: 'FP16' // Or FP32 based on WebGPU stress test
      };
    }
  }

  /**
   * Validates if the uploaded corpus exceeds the hardware limits.
   * Throws an error if the budget is exceeded.
   */
  static validateCorpusSize(numDocuments: number, profile: HardwareProfile): void {
    if (numDocuments > profile.maxDocuments) {
      throw new Error(
        `Memory constraints exceeded. Your device (${profile.tier}) supports up to ${profile.maxDocuments} documents. You attempted to load ${numDocuments}.`
      );
    }
  }
}
