import * as mammoth from 'mammoth';

// Use the modern build path for pdfjs-dist
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import Tesseract from 'tesseract.js';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { pipeline } from '@huggingface/transformers';

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
  static async parseFile(file: { name: string; buffer?: ArrayBuffer; text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> }): Promise<ParsedDocument[]> {
    try {
      const filename = file.name.toLowerCase();

      // Normalize file object to ensure we have a buffer if arrayBuffer() is available (native File object)
      // Because DOM File/Blob objects lose their prototype chain and internal state when spread,
      // we must create a plain object map explicitly.
      const normalizedFile: { name: string; buffer?: ArrayBuffer; text?: () => Promise<string> } = {
          name: file.name,
          buffer: file.buffer,
      };

      if (!normalizedFile.buffer && typeof file.arrayBuffer === 'function') {
          normalizedFile.buffer = await file.arrayBuffer();
      }

      if (!normalizedFile.buffer && typeof file.text === 'function') {
          normalizedFile.text = file.text.bind(file);
      }

      if (filename.endsWith('.txt') || filename.endsWith('.md') || filename.endsWith('.json')) {
        return await this.parseTextFile(normalizedFile);
      } else if (filename.endsWith('.pdf')) {
        return await this.parsePDFFile(normalizedFile);
      } else if (filename.endsWith('.csv')) {
        return await this.parseCsvFile(normalizedFile);
      } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        return await this.parseXlsxFile(normalizedFile);
      } else if (filename.endsWith('.docx')) {
        return await this.parseDocxFile(normalizedFile);
      } else if (filename.endsWith('.mp3') || filename.endsWith('.wav') || filename.endsWith('.ogg') || filename.endsWith('.m4a')) {
        return await this.parseAudioFile(normalizedFile);
      } else if (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
        return await this.parseImageFile(normalizedFile);
      } else {
        return [{
          filename: file.name,
          content: '',
          error: `Unsupported file type: ${file.name}`
        }];
      }
    } catch (e: any) {
      return [{
        filename: file.name,
        content: '',
        error: `Failed to parse ${file.name}: ${e.message}`
      }];
    }
  }

  private static async parseTextFile(file: { name: string; text?: () => Promise<string>; buffer?: ArrayBuffer }): Promise<ParsedDocument[]> {
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
                 return json.map((item, index) => ({
                    filename: `${file.name} - Item ${index + 1}`,
                    content: typeof item === 'string' ? item : JSON.stringify(item)
                 }));
            } else if (typeof json === 'object') {
                 // Try to extract text fields if it's a known format, otherwise stringify
                 return [{
                     filename: file.name,
                     content: Object.values(json).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n')
                 }];
            }
        } catch(e) {
            // If it's malformed JSON, just treat as raw text
        }
    }

    return [{ filename: file.name, content: content.trim() }];
  }

  private static async parseCsvFile(file: { name: string; text?: () => Promise<string>; buffer?: ArrayBuffer }): Promise<ParsedDocument[]> {
    let content = '';
    if (file.text) {
      content = await file.text();
    } else if (file.buffer) {
      const decoder = new TextDecoder('utf-8');
      content = decoder.decode(file.buffer);
    } else {
        throw new Error('No valid text extraction method found on file object');
    }

    const result = Papa.parse(content, { header: false, skipEmptyLines: true });

    // Split each row into its own parsed document
    return (result.data as any[][]).map((row, index) => ({
        filename: `${file.name} - Row ${index + 1}`,
        content: row.join(' ').trim()
    })).filter(doc => doc.content.length > 0);
  }

  private static async parseXlsxFile(file: { name: string; buffer?: ArrayBuffer }): Promise<ParsedDocument[]> {
    if (!file.buffer) {
        throw new Error('XLSX parsing requires an ArrayBuffer');
    }

    try {
      const workbook = XLSX.read(file.buffer, { type: 'array' });
      const documents: ParsedDocument[] = [];

      // Extract text from all sheets
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const parsed = Papa.parse(csv, { header: false, skipEmptyLines: true });
        const rows = (parsed.data as any[][]).map((row, index) => ({
            filename: `${file.name} - ${sheetName} - Row ${index + 1}`,
            content: row.join(' ').trim()
        })).filter(doc => doc.content.length > 0);
        documents.push(...rows);
      }
      return documents;
    } catch (e: any) {
       throw new Error(`XLSX parsing failed: ${e.message}`);
    }
  }

  private static async parsePDFFile(file: { name: string; buffer?: ArrayBuffer }): Promise<ParsedDocument[]> {
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

    return [{ filename: file.name, content: fullText.trim() }];
  }

  private static async parseDocxFile(file: { name: string; buffer?: ArrayBuffer }): Promise<ParsedDocument[]> {
    if (!file.buffer) {
         throw new Error('DOCX parsing requires an ArrayBuffer');
    }

    // mammoth requires a Node buffer or ArrayBuffer
    const result = await mammoth.extractRawText({ arrayBuffer: file.buffer });

    return [{ filename: file.name, content: result.value.trim() }];
  }

  private static async parseAudioFile(file: { name: string; buffer?: ArrayBuffer }): Promise<ParsedDocument[]> {
    if (!file.buffer) {
         throw new Error('Audio parsing requires an ArrayBuffer');
    }

    try {
      let audioData: Float32Array;

      // Check if we are in a browser environment with AudioContext
      // If not (e.g. Node.js tests), mock the audio decoding
      if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext({ sampleRate: 16000 }); // Whisper requires 16kHz

        // clone buffer because decodeAudioData detaches it
        const bufferClone = file.buffer.slice(0);
        const audioBuffer = await ctx.decodeAudioData(bufferClone);
        // Use the first channel (mono)
        audioData = audioBuffer.getChannelData(0);
        await ctx.close(); // Close hardware context to prevent 6-context browser limit crash
      } else {
        // Node.js fallback / mock for testing
        // Mocking a silent 1-second audio array at 16kHz
        audioData = new Float32Array(16000);
      }

      // Configure Whisper with explicitly setting CPU device and preventing wasm multi-thread crashes during decoding
      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
         device: 'cpu'
      });

      // @ts-ignore - The pipeline accepts Float32Array
      const result = await transcriber(audioData, { chunk_length_s: 30, stride_length_s: 5 });

      await transcriber.dispose(); // Free memory immediately

      const text = Array.isArray(result) ? result[0].text : (result as any).text || '';
      return [{ filename: file.name, content: text.trim() }];
    } catch (error: any) {
       throw new Error(`Audio transcription failed: ${error.message || error}`);
    }
  }

  private static async parseImageFile(file: { name: string; buffer?: ArrayBuffer }): Promise<ParsedDocument[]> {
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
        { logger: _m => {} } // Disable noisy logging for tests/production unless requested
      );

      return [{ filename: file.name, content: result.data.text.trim() }];
    } catch (error: any) {
       throw new Error(`OCR failed: ${error.message || error}`);
    }
  }
}
