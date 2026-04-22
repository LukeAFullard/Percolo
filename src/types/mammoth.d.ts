declare module 'mammoth' {
  interface Input {
    path?: string;
    buffer?: Buffer | Uint8Array | ArrayBuffer;
    arrayBuffer?: ArrayBuffer;
  }

  interface Options {
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    includeEmbeddedStyleMap?: boolean;
    transformDocument?: (element: any) => any;
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
  }

  interface Result {
    value: string;
    messages: any[];
  }

  function extractRawText(input: Input, options?: Options): Promise<Result>;
  function convertToHtml(input: Input, options?: Options): Promise<Result>;
  function convertToMarkdown(input: Input, options?: Options): Promise<Result>;
}