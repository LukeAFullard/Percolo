# Testing, Validation & Benchmarking

This document details how the Edge-Native Topic Modeler ensures mathematical accuracy and manages resources when executing high-dimensional algorithms entirely client-side.

## 1. Validation Strategies

Because the entire NLP pipeline runs in the browser, testing its structural fidelity is critical.

### End-to-End Golden Dataset Validation

The primary validation tool is the **Golden Dataset test** located in `tests/benchmarks/golden.test.ts`.
This test runs the entire pipeline—from generating text embeddings and calculating UMAP projections to HDBSCAN clustering and c-TF-IDF extraction—against a subset of the famous **20 Newsgroups dataset** (representing the Space, Autos, and Medicine categories).

To execute this validation manually:
```bash
npm run test tests/benchmarks/golden.test.ts
```

It asserts that:
1. Embeddings are correctly dimensioned.
2. UMAP effectively reduces dimensions without exploding.
3. HDBSCAN identifies semantic clusters instead of grouping everything as noise.
4. The Extracted Lexical Terms mathematically map back to the expected original semantic fields (e.g. 'rover', 'vaccine').
5. The final **NPMI (Normalized Pointwise Mutual Information)** Coherence Score is successfully calculated.

### UI / Frontend Validation

If you modify the visualization layers (`ui/src/components`), it is heavily recommended to use Playwright (as outlined in standard PR verification steps) to record user journeys covering file uploads, visual rendering of Plotly maps, and ensuring Semantic Search resolves correctly.

## 2. Resource Constraints & RAM Usage

To avoid browser Out-Of-Memory (OOM) crashes, this application leverages a "Cap-and-Tier" model. AI execution falls into three general buckets of memory usage.

### Tier 1: Baseline Extraction & WASM (CPU)
**Likely RAM Limit: ~200 - 300 MB**
If the user only runs standard c-TF-IDF extraction and the generic Embedding pipeline (`all-MiniLM-L6-v2`) on a standard CPU (WASM fallback), the application is highly efficient. The application actively forces garbage collection (`.dispose()`) on the `FeatureExtractionPipeline` immediately after creating vectors, ensuring memory is freed for UMAP and HDBSCAN graph computations.

### Tier 2: Extractive UI + PII + Analytics
**Likely RAM Limit: ~300 - 500 MB**
Running Aspect-Based Sentiment Analysis (`ABSAEngine`), PII Redaction, and basic NLP Analytics loads the `wink-nlp` language model and optionally an additional sequence classification model into WASM memory.

### Tier 3: Generative LLMs (WebGPU)
**Likely RAM/VRAM Limit: 1.5GB - 3GB+**
If the user enables **Generative Summarization** or the **OpenAI Privacy Filter**, the browser must load multi-billion parameter models (like `TinyLlama` or `Qwen`) into VRAM via WebGPU. This is incredibly memory-intensive. While `transformers.js` supports quantization (`q8`, `q4`), these models will crash mobile browsers and should only be targeted for modern Desktop environments.

## 3. Benchmarking

The `golden.test.ts` suite includes CPU timing logs and heap-memory delta profiling.

*Example Benchmark Output (WASM Fallback/Node - 15 documents):*
```text
Starting Golden Dataset validation...
Embeddings generated in ~2100ms
UMAP completed in ~650ms
Clustering completed in ~15ms
c-TF-IDF completed in ~34ms
Total Pipeline time: ~2870ms
Memory Usage Delta (Heap Used): ~-1.36 MB (due to explicit garbage collection)
```

### Synthetic Stress Testing
The `stress.test.ts` suite scales up the document ingestion to test the upper bounds of the local memory. It runs 500 documents iteratively.

*Example Stress Benchmark (WASM Fallback/Node - 500 documents):*
```text
Starting Stress Test validation on 500 documents...
Embeddings generated in 5095ms
UMAP completed in 3653ms
Clustering via HDBSCAN completed in 1059ms
c-TF-IDF completed in 174ms
Total Pipeline time: 9982ms
Memory Usage Delta (Heap Used): 3.64 MB
```
Notice the memory delta holds consistently tight (~3 MB) despite the massive scale-up in documents processed, proving the application's tensor disposal mechanisms reliably prevent Memory Leaks.