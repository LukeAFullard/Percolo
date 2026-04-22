import { describe, it, expect } from 'vitest';
import { FileParser } from '../../src/io/fileParser';

describe('FileParser', () => {
  it('should parse simple text files', async () => {
    const textFile = {
      name: 'test.txt',
      text: async () => 'Hello World!'
    };

    const result = await FileParser.parseFile(textFile);
    expect(result.filename).toBe('test.txt');
    expect(result.content).toBe('Hello World!');
    expect(result.error).toBeUndefined();
  });

  it('should parse markdown files', async () => {
    const mdFile = {
      name: 'test.md',
      text: async () => '# Heading\\n\\nSome markdown text.'
    };

    const result = await FileParser.parseFile(mdFile);
    expect(result.content).toBe('# Heading\\n\\nSome markdown text.');
  });

  it('should handle JSON files', async () => {
    const jsonFile = {
      name: 'data.json',
      text: async () => JSON.stringify(["Document 1", "Document 2"])
    };

    const result = await FileParser.parseFile(jsonFile);
    expect(result.content).toBe('Document 1\\nDocument 2');
  });

  it('should return error for unsupported files', async () => {
    const unsupportedFile = {
      name: 'image.png',
      buffer: new ArrayBuffer(0)
    };

    const result = await FileParser.parseFile(unsupportedFile);
    expect(result.error).toContain('Unsupported file type');
  });
});
