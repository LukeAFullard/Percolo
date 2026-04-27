# Benchmarks

## WebGPU vs WASM/CPU Embeddings

Tested on `Xenova/all-MiniLM-L6-v2` (`fp32`).

*Note: The sandbox environment does not have a real WebGPU adapter (like a dedicated graphics card). Because of this, the `transformers.js` pipeline falls back to CPU when we request WebGPU, resulting in similar processing times to WASM.*

| Documents | WASM Time (ms) | WASM Mem Delta (MB) | WebGPU Time (ms) | WebGPU Mem Delta (MB) |
| :--- | :--- | :--- | :--- | :--- |
| 10 | 457 | 4.00 | 393 | 14.49 |
| 50 | 514 | -0.27 | 491 | 5.16 |
| 100 | 847 | 6.24 | 709 | 6.39 |
| 500 | 2302 | 13.61 | 2358 | -19.43 |
| 1000 | 4425 | 9.11 | 4527 | -8.11 |
| 2500 | 12639 | 9.54 | 11183 | 7.50 |

Memory delta fluctuated due to V8 garbage collection occurring at arbitrary intervals.

## Pipeline Component Scaling

Tested entire NLP mathematical path: Embeddings (WASM) -> UMAP (15 neighbors, 2 components) -> HDBSCAN (min 10 cluster size).

| Documents | Embeddings Time | UMAP Time | HDBSCAN Time | Total Time |
| :--- | :--- | :--- | :--- | :--- |
| 1,000 | ~4.6s | ~5.9s | ~2.9s | ~13.4s |
| 2,500 | ~10.7s | ~17.0s | ~31.0s | ~58.6s |
| 5,000 | ~30.0s | ~26.4s | ~227.4s | ~283.8s (~4.7 mins) |

## Practical Processing Limits
*   **Optimal / Fast Experience:** < 2,500 documents. At 1,000 documents, the pipeline completes in ~13 seconds.
*   **Tolerable Experience:** 2,500 - 5,000 documents. The heavy HDBSCAN distance matrix calculation begins to increase exponentially $O(N^2)$. Processing 5,000 documents takes almost 5 minutes.
*   **Impractical / Unstable:** > 5,000 documents. Because the application runs in-browser, allocating massive contiguous arrays for HDBSCAN distance matrices starts hitting V8 memory limits, leading to potential browser tab crashes.

To process > 5,000 documents efficiently in the browser, the app would either need to:
1. Fall back to KMeans clustering (which scales $O(N)$ instead of HDBSCAN's $O(N^2)$).
2. Utilize HDBSCAN sampling (cluster a 2,000 document subset, then use `IncrementalUpdater.partialFit` to assign the remaining 8,000 documents to the computed centroids via cosine similarity).

## Hardware Limits: Future Features Estimation

### 1. Retrieval-Augmented Generation (RAG)
Integrating Question-Answering inside the browser using local WebGPU Micro-LLMs.

*   **Models Checked:** `Xenova/TinyLlama-1.1B-Chat-v1.0`, `Xenova/Phi-3-mini-4k-instruct`
*   **Memory Cost:** ~700 MB - 1.5 GB in-browser RAM (quantized `q4f16` or `q8`).
*   **Processing Time:**
    *   **Retrieval:** < 50ms. Searching against cached document embeddings (via the existing `Similarity.cosine` engine) is extremely fast.
    *   **Generation:** Generating a 150-word answer heavily depends on WebGPU availability. On WebGPU, expect ~10-25 tokens per second (taking ~10 seconds total). If WebGPU is unavailable and it falls back to WASM/CPU, this could take **30-60+ seconds**, making it incredibly painful.
*   **Recommendation:** To avoid OOM crashes, RAG generation MUST implement an explicit model lifecycle, releasing the `transformers.js` generation pipeline immediately after the user query is answered, so the topic modeling clusters can be explored without crashing.

### 2. Coreference Resolution
Replacing generic pronouns ("he", "it", "they") with their actual entity names to boost c-TF-IDF extraction quality.

*   **Options Checked:** `wink-nlp` (no native coref), `Compromise` (lightweight but inaccurate coref), ONNX token-classification models.
*   **Memory Cost:** High accuracy ONNX models (like `SpanBERT`) are memory intensive (~400MB).
*   **Processing Time:** Coreference resolution scales terribly on long documents because it requires deep dependency parsing. Processing a 1,000 document corpus with an ONNX token-classifier could add **5+ minutes** to the pipeline overhead.
*   **Recommendation:** Due to edge-native limits, full neural coreference resolution should be avoided unless strictly necessary. If implemented, it should be an explicit "Advanced Opt-In" setting with a stern warning about processing times, or simplified down to basic heuristic pronoun replacement via `wink-nlp` POS tags.
