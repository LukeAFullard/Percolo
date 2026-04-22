import { describe, it, expect, vi, afterEach } from 'vitest';
import { HardwareProfiler } from '../../src/worker/hardware';

describe('HardwareProfiler Module', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should assign Tier 1 for low memory devices', () => {
    vi.stubGlobal('navigator', { deviceMemory: 2 });
    const profile = HardwareProfiler.determineTier();

    expect(profile.tier).toBe('Tier 1');
    expect(profile.maxTokens).toBe(250000);
    expect(profile.enforceQuantization).toBe('INT4');
  });

  it('should assign Tier 2 for mid-range memory devices', () => {
    vi.stubGlobal('navigator', { deviceMemory: 8 });
    const profile = HardwareProfiler.determineTier();

    expect(profile.tier).toBe('Tier 2');
    expect(profile.maxTokens).toBe(1000000);
    expect(profile.enforceQuantization).toBe('INT8');
  });

  it('should assign Tier 3 for high memory devices', () => {
    vi.stubGlobal('navigator', { deviceMemory: 16 });
    const profile = HardwareProfiler.determineTier();

    expect(profile.tier).toBe('Tier 3');
    expect(profile.maxTokens).toBe(2500000);
  });

  it('should fall back to Tier 1 if deviceMemory is unavailable (e.g. Safari)', () => {
    vi.stubGlobal('navigator', {});
    const profile = HardwareProfiler.determineTier();

    // Uses 4GB fallback, which falls under <=4 condition -> Tier 1
    expect(profile.tier).toBe('Tier 1');
  });

  it('should throw an error if corpus size exceeds tier limit', async () => {
    const profile = { tier: 'Tier 1' as const, maxTokens: 10, enforceQuantization: 'INT4' as const };

    // 3 words each * 4 texts = 12 tokens
    const texts = ["Hello world test", "Hello world test", "Hello world test", "Hello world test"];

    await expect(HardwareProfiler.validateCorpusSize(texts, profile)).rejects.toThrow(/Memory constraints exceeded/);

    // 3 words each * 2 texts = 6 tokens
    const validTexts = ["Hello world test", "Hello world test"];
    await expect(HardwareProfiler.validateCorpusSize(validTexts, profile)).resolves.not.toThrow();
  });
});
