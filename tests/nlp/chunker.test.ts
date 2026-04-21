import { describe, it, expect } from 'vitest';
import { DocumentChunker } from '../../src/nlp/chunker';

describe('DocumentChunker', () => {
  it('should return an empty array for empty or whitespace text', () => {
    expect(DocumentChunker.chunkText('')).toEqual([]);
    expect(DocumentChunker.chunkText('   ')).toEqual([]);
  });

  it('should not chunk text shorter than maxTokens', () => {
    const text = 'This is a short text.';
    const chunks = DocumentChunker.chunkText(text, { maxTokens: 10, overlapTokens: 2 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('should throw an error if maxTokens is less than or equal to 0', () => {
    expect(() => DocumentChunker.chunkText('text', { maxTokens: 0, overlapTokens: 0 })).toThrow();
  });

  it('should throw an error if overlapTokens is greater than or equal to maxTokens', () => {
    expect(() => DocumentChunker.chunkText('text', { maxTokens: 5, overlapTokens: 5 })).toThrow();
    expect(() => DocumentChunker.chunkText('text', { maxTokens: 5, overlapTokens: 6 })).toThrow();
  });

  it('should chunk text with overlap correctly', () => {
    // 10 words
    const text = 'One two three four five six seven eight nine ten';

    // Max tokens 5, overlap 2.
    // Chunk 1: One two three four five
    // Chunk 2: four five six seven eight
    // Chunk 3: seven eight nine ten
    const chunks = DocumentChunker.chunkText(text, { maxTokens: 5, overlapTokens: 2 });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe('One two three four five');
    expect(chunks[1]).toBe('four five six seven eight');
    expect(chunks[2]).toBe('seven eight nine ten');
  });

  it('should handle edge cases where overlap causes infinite loops if not careful', () => {
    const text = 'A B C D E F G H I J K L M N O P';
    const chunks = DocumentChunker.chunkText(text, { maxTokens: 5, overlapTokens: 4 });

    // Chunk 1: A B C D E
    // Chunk 2: B C D E F
    // Chunk 3: C D E F G
    // etc.
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toBe('A B C D E');
    expect(chunks[1]).toBe('B C D E F');
  });

  it('should include all original tokens across chunks', () => {
    const text = 'This is a longer document that needs to be chunked into multiple pieces so that we can test if no words are lost during the process of chunking.';
    const chunks = DocumentChunker.chunkText(text, { maxTokens: 6, overlapTokens: 2 });

    const joined = chunks.join(' ');
    // Check if the first and last words are present
    expect(joined).toContain('This');
    expect(joined).toContain('chunking .');

    // Let's verify no words are completely missing
    const words = text.split(/\s+/);
    for (const word of words) {
        // winkNLP might separate punctuation, but the base words should exist
        const cleanedWord = word.replace(/[^a-zA-Z]/g, '');
        if (cleanedWord) {
            expect(joined).toContain(cleanedWord);
        }
    }
  });
});
