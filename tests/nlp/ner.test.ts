import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NEREngine } from '../../src/nlp/ner';

vi.mock('@huggingface/transformers', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    pipeline: vi.fn().mockImplementation(() => {
      return vi.fn().mockImplementation((text) => {
        if (text.includes('Apple')) {
            return [{ entity_group: 'ORG', score: 0.99, word: 'Apple', start: 0, end: 5 }];
        }
        return [];
      });
    }),
  };
});

describe('NEREngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle empty input', async () => {
    const results = await NEREngine.extractEntities('');
    expect(results).toEqual([]);
  });

  it('should extract entities correctly', async () => {
    const results = await NEREngine.extractEntities('Apple is a company.');
    expect(results.length).toBe(1);
    expect(results[0].entity_group).toBe('ORG');
    expect(results[0].word).toBe('Apple');
  });
});
