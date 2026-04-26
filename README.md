# Percolo: Edge-Native BERTopic Pipeline

Percolo is a fully edge-native **BERTopic** pipeline. It performs privacy-first, serverless topic modeling by running all high-dimensional vector math and NLP tasks entirely within the client's browser using WebAssembly (WASM), WebGPU, and high-performance JavaScript.

Data never leaves your device.

## Features

* **Zero-Server Architecture**: Runs locally in the browser. Ideal for sensitive documents (legal, medical, enterprise).
* **Native File Ingestion**: Drag and drop entire local folders, PDFs, DOCX, JSON, or text files directly.
* **Hardware Accelerated Embeddings**: Uses `@huggingface/transformers` to compute semantic vectors via WebGPU (falling back gracefully to WASM/CPU).
* **Dimensionality Reduction**: Client-side UMAP (`umap-js`) batched via Web Workers to keep the UI responsive.
* **Density-Based Clustering**: `hdbscan-ts` extracts arbitrary cluster shapes with a dynamic `KMeans` fallback for low-RAM devices.
* **Lexical Extraction**: High-throughput tokenization and pruning via `winkNLP`.
* **c-TF-IDF**: Extracts highly representative topic labels, supporting "Seed Word Boosting" for domain adaptation.
* **Progressive Web App (PWA)**: Installable, offline-first execution via Service Workers and IndexedDB model caching.

## Project Structure

* `/src`: The headless, framework-agnostic NPM package containing the mathematical and NLP core.
* `/ui`: A React + Vite frontend visualization tool featuring an interactive Intertopic Distance Map.
* `/tests`: Comprehensive Vitest suite covering unit tests and Golden Dataset (20 Newsgroups) E2E validation.

## Getting Started

### Prerequisites
* Node.js 18+
* A modern web browser (Chrome/Edge with WebGPU enabled is recommended for maximum performance).

### Running the UI (Development)

```bash
# Install dependencies in root and UI
npm install
npm install --prefix ui

# Start the Vite development server
npm run dev --prefix ui
```
Navigate to `http://localhost:5173`.

### Building and Testing

```bash
# Run headless unit and E2E benchmark tests
npm test

# Build the headless engine (for NPM consumption)
npm run build

# Build the UI for production
npm run build --prefix ui
```

## Browser Constraints & Memory Hygiene

Because Percolo runs entirely client-side, it implements a dynamic **Cap-and-Tier** scaling system to prevent browser Out-Of-Memory (OOM) crashes:

*   **Token Budgets:** Memory constraints limit the volume of text that can be processed simultaneously. Low-end mobile devices are capped at ~250k tokens, while WebGPU desktop environments scale up to ~2.5M tokens.
*   **Web Worker Isolation:** Heavy graph traversals (UMAP/HDBSCAN) are executed in a dedicated Web Worker to prevent UI thread blocking.
*   **Memory Release:** The ONNX FeatureExtractionPipeline is explicitly disposed of (`.dispose()`) immediately after embedding generation, forcefully releasing GPU memory back to the OS before synchronous CPU graph algorithms execute.
*   **COOP/COEP Headers:** To utilize `SharedArrayBuffer` for multi-threaded WASM execution, your host must serve the application with strict Cross-Origin Isolation headers. If unavailable, Percolo falls back to chunked `postMessage` data transfers.

## Architecture & Math

Percolo achieves high structural fidelity to the original BERTopic reference implementation:
1.  **Embed:** Converts documents to dense vectors (`all-MiniLM-L6-v2`).
2.  **Reduce:** Projects high-dimensional space down to 2-5 dimensions using Stochastic Gradient Descent (UMAP).
3.  **Cluster:** Identifies dense semantic neighborhoods and excludes outliers (HDBSCAN).
4.  **Represent:** Creates Class-Documents, computes sparse CSR matrices, and extracts uniquely weighting terms via c-TF-IDF.

## Future NLP Extensions (Roadmap)

Percolo is designed with a modular architecture, allowing new NLP tasks to be integrated seamlessly by swapping or chaining browser-compatible ONNX models via `transformers.js`. The following tasks are mapped for future integration, with explicit memory evaluations to ensure edge-native stability:

### 1. Keyphrase Extraction (KeyBERT integration)
* **Details:** Embed document n-grams and use cosine similarity against the parent document's embedding to extract highly representative phrases, augmenting c-TF-IDF cluster labels.
* **Modular Models:** Reuses the active `EmbeddingPipeline` (e.g., `Xenova/all-MiniLM-L6-v2`).
* **Memory Evaluation:** *Low overhead.* The embedding model is already loaded in VRAM. It is computationally bounded by vocabulary size and requires Web Worker yielding during massive dot-product operations.

### 2. POS-based Filtering for Topic Labels
* **Details:** Enhance the `LexicalExtractor` to filter vocabulary strictly to Nouns and Adjectives before sparse matrix construction, yielding more interpretable topic names.
* **Modular Models:** Default to `wink-nlp`'s built-in POS tagger for a zero-cost dependency. Pluggable to specialized ONNX token-classification models if needed.
* **Memory Evaluation:** *Near-zero* additional RAM for `wink-nlp`. Linear increase in CPU parsing time.

### 3. Modular Generative Summarization (Micro-LLMs)
* **Details:** Prompt a micro-LLM to generate a fluent 1-2 sentence summary of a cluster based on its top documents.
* **Modular Models:** ONNX WebGPU text-generation models like `Xenova/Qwen1.5-0.5B-Chat`, `Xenova/TinyLlama-1.1B-Chat-v1.0`, or WebLLM variants (e.g., Phi-3-mini).
* **Memory Evaluation:** *High Memory Cost (500MB - 2GB+ VRAM).* Must be strictly gated to Desktop/WebGPU environments. The system must explicitly `dispose()` the Embedding pipeline to free WebGPU memory *before* loading the Generative model.

### 4. Automated PII Redaction
* **Details:** A pre-processing hook to identify and mask Personally Identifiable Information (Names, Locations, SSNs) before vectorization or RAG export.
* **Modular Models:** Regular expressions via `wink-nlp` or dedicated ONNX token-classification models (e.g., `Xenova/bert-base-NER`).
* **Memory Evaluation:** *Moderate (50-100MB RAM).* Can run safely on Tier-2 (Laptop) hardware but should be unloaded immediately after preprocessing.

### 5. Cross-Lingual Topic Alignment
* **Details:** Process mixed-language corpora into a unified semantic space, then translate resulting topic labels back to a target language (e.g., English).
* **Modular Models:** Swap default embeddings to a multilingual variant (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`). Use seq2seq models like `Xenova/nllb-200-distilled-600M` for translation.
* **Memory Evaluation:** *High.* Multilingual embeddings add minimal overhead, but the translation model is heavy (~600MB) and risks out-of-memory errors on mobile. Restricted to Desktop profiles.

### 6. Aspect-Based Sentiment Analysis (ABSA)
* **Details:** Extract specific noun-phrases (aspects) and score the sentiment *specifically targeted at that aspect*.
* **Modular Models:** Sequence classification or targeted question-answering models (e.g., a quantized DeBERTa-v3 ABSA model).
* **Memory Evaluation:** *Moderate-to-High (~100MB-250MB RAM).* Highly compute-intensive because inference must run on every extracted aspect per document. Requires background Web Worker processing.

## License
MIT