import * as mammoth from 'mammoth';

// Use the modern build path for pdfjs-dist
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import Tesseract from 'tesseract.js';

export interface ParsedDocument {
  filename: string;
  content: string;
  metadata?: any;
  error?: string;
}

export class FileParser {
  /**
   * Parses the content of a File object based on its extension or mime type.
   * Note: In a pure Node.js environment (for headless testing), we accept buffers/paths.
   * In a browser environment, we accept standard File objects.
   *
   * @param file The file object (browser) or an object with name/buffer properties
   * @returns ParsedDocument object
   */
  static async parseFile(file: { name: string; buffer?: ArrayBuffer; text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> }): Promise<ParsedDocument> {
    try {
      const filename = file.name.toLowerCase();

      // Normalize file object to ensure we have a buffer if arrayBuffer() is available (native File object)
      const normalizedFile = { ...file };
      if (!normalizedFile.buffer && normalizedFile.arrayBuffer) {
          normalizedFile.buffer = await normalizedFile.arrayBuffer();
      }

      if (filename.endsWith('.txt') || filename.endsWith('.md') || filename.endsWith('.json')) {
        return await this.parseTextFile(normalizedFile);
      } else if (filename.endsWith('.pdf')) {
        return await this.parsePDFFile(normalizedFile);
      } else if (filename.endsWith('.docx')) {
        return await this.parseDocxFile(normalizedFile);
      } else if (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
        return await this.parseImageFile(normalizedFile);
      } else {
        return {
          filename: file.name,
          content: '',
          error: `Unsupported file type: ${file.name}`
        };
      }
    } catch (e: any) {
      return {
        filename: file.name,
        content: '',
        error: `Failed to parse ${file.name}: ${e.message}`
      };
    }
  }

  private static async parseTextFile(file: { name: string; text?: () => Promise<string>; buffer?: ArrayBuffer }): Promise<ParsedDocument> {
    let content = '';
    if (file.text) {
      content = await file.text();
    } else if (file.buffer) {
      const decoder = new TextDecoder('utf-8');
      content = decoder.decode(file.buffer);
    } else {
        throw new Error('No valid text extraction method found on file object');
    }

    if (file.name.toLowerCase().endsWith('.json')) {
        try {
            // Attempt to parse JSON to see if it's a feed, or just stringify it
            const json = JSON.parse(content);
            if (Array.isArray(json)) {
                 content = json.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\\n');
            } else if (typeof json === 'object') {
                 // Try to extract text fields if it's a known format, otherwise stringify
                 content = Object.values(json).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\\n');
            }
        } catch(e) {
            // If it's malformed JSON, just treat as raw text
        }
    }

    return { filename: file.name, content: content.trim() };
  }

  private static async parsePDFFile(file: { name: string; buffer?: ArrayBuffer }): Promise<ParsedDocument> {
    if (!file.buffer) {
        throw new Error('PDF parsing requires an ArrayBuffer');
    }

    // Initialize PDF.js
    // Note: In a real browser environment, the workerSrc needs to be configured.
    // pdfjsLib.GlobalWorkerOptions.workerSrc = '.../pdf.worker.js';

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.buffer) });
    const pdf = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\\n';
    }

    return { filename: file.name, content: fullText.trim() };
  }

  private static async parseDocxFile(file: { name: string; buffer?: ArrayBuffer }): Promise<ParsedDocument> {
    if (!file.buffer) {
         throw new Error('DOCX parsing requires an ArrayBuffer');
    }

    // mammoth requires a Node buffer or ArrayBuffer
    const result = await mammoth.extractRawText({ arrayBuffer: file.buffer });

    return { filename: file.name, content: result.value.trim() };
  }

  private static async parseImageFile(file: { name: string; buffer?: ArrayBuffer }): Promise<ParsedDocument> {
    if (!file.buffer) {
         throw new Error('Image parsing requires an ArrayBuffer');
    }

    try {
      // Pre-check for empty buffer to avoid tesseract worker throwing uncaught exceptions internally
      if (file.buffer.byteLength === 0) {
        throw new Error('Image buffer is empty');
      }

      // Run OCR using Tesseract.js
      const result = await Tesseract.recognize(
        // @ts-ignore
        new Uint8Array(file.buffer),
        'eng', // Default to English for now, can be parameterized later
        { logger: m => {} } // Disable noisy logging for tests/production unless requested
      );

      return { filename: file.name, content: result.data.text.trim() };
    } catch (error: any) {
       throw new Error(`OCR failed: ${error.message || error}`);
    }
  }
}
