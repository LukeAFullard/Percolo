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
    expect(profile.maxDocuments).toBe(500);
    expect(profile.enforceQuantization).toBe('INT4');
  });

  it('should assign Tier 2 for mid-range memory devices', () => {
    vi.stubGlobal('navigator', { deviceMemory: 8 });
    const profile = HardwareProfiler.determineTier();

    expect(profile.tier).toBe('Tier 2');
    expect(profile.maxDocuments).toBe(2000);
    expect(profile.enforceQuantization).toBe('INT8');
  });

  it('should assign Tier 3 for high memory devices', () => {
    vi.stubGlobal('navigator', { deviceMemory: 16 });
    const profile = HardwareProfiler.determineTier();

    expect(profile.tier).toBe('Tier 3');
    expect(profile.maxDocuments).toBe(5000);
  });

  it('should fall back to Tier 1 if deviceMemory is unavailable (e.g. Safari)', () => {
    vi.stubGlobal('navigator', {});
    const profile = HardwareProfiler.determineTier();

    // Uses 4GB fallback, which falls under <=4 condition -> Tier 1
    expect(profile.tier).toBe('Tier 1');
  });

  it('should throw an error if corpus size exceeds tier limit', () => {
    const profile = { tier: 'Tier 1' as const, maxDocuments: 500, enforceQuantization: 'INT4' as const };

    expect(() => HardwareProfiler.validateCorpusSize(600, profile)).toThrow(/Memory constraints exceeded/);
    expect(() => HardwareProfiler.validateCorpusSize(400, profile)).not.toThrow();
  });
});
