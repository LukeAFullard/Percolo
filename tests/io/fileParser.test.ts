import { describe, it, expect } from 'vitest';
import { FileParser } from '../../src/io/fileParser';
import * as XLSX from 'xlsx';

describe('FileParser', () => {
  it('should parse simple text files', async () => {
    const textFile = {
      name: 'test.txt',
      text: async () => 'Hello World!'
    };

    const result = await FileParser.parseFile(textFile);
    expect(result[0].filename).toBe('test.txt');
    expect(result[0].content).toBe('Hello World!');
    expect(result[0].error).toBeUndefined();
  });

  it('should parse markdown files', async () => {
    const mdFile = {
      name: 'test.md',
      text: async () => '# Heading\\n\\nSome markdown text.'
    };

    const result = await FileParser.parseFile(mdFile);
    expect(result[0].content).toBe('# Heading\\n\\nSome markdown text.');
  });

  it('should handle JSON files', async () => {
    const jsonFile = {
      name: 'data.json',
      text: async () => JSON.stringify(["Document 1", "Document 2"])
    };

    const result = await FileParser.parseFile(jsonFile);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Document 1');
    expect(result[1].content).toBe('Document 2');
  });

  it('should handle CSV files', async () => {
    const csvFile = {
      name: 'data.csv',
      text: async () => 'col1,col2\nval1,val2\nval3,val4'
    };
    const result = await FileParser.parseFile(csvFile);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe('col1 col2');
    expect(result[1].content).toBe('val1 val2');
    expect(result[2].content).toBe('val3 val4');
  });

  it('should handle XLSX files', async () => {
    // Generate a dummy XLSX file buffer
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['col1', 'col2'], ['val1', 'val2']]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const xlsxFile = {
      name: 'data.xlsx',
      buffer: buffer
    };

    const result = await FileParser.parseFile(xlsxFile);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('col1 col2');
    expect(result[1].content).toBe('val1 val2');
  });

  it('should return error for unsupported files', async () => {
    const unsupportedFile = {
      name: 'archive.zip',
      buffer: new ArrayBuffer(0)
    };

    const result = await FileParser.parseFile(unsupportedFile);
    expect(result[0].error).toContain('Unsupported file type');
  });

  it('should return error if OCR fails (e.g. empty buffer)', async () => {
    const imageFile = {
      name: 'image.png',
      buffer: new ArrayBuffer(0)
    };

    const result = await FileParser.parseFile(imageFile);
    expect(result[0].error).toContain('Failed to parse image.png');
  });

  it('should handle mock audio parsing via Whisper fallback', async () => {
    const audioFile = {
      name: 'test.mp3',
      buffer: new ArrayBuffer(100) // Dummy buffer, node fallback just uses silent Float32Array
    };

    // Because this initializes Xenova/whisper-tiny.en, it might take a moment
    // but the output will be empty text since the fallback provides silence.
    const result = await FileParser.parseFile(audioFile);
    expect(result[0].filename).toBe('test.mp3');
    expect(result[0].content).toBeDefined();
    // It should just return empty string since it's transcribing zeroes, or throw if model fails to load without fetch API
  }, 20000); // Allow time for whisper download
});
