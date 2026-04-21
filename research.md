**Project Plan: Edge-Native BERTopic Pipeline (Browser-First Implementation)**

This project plan outlines the architecture and implementation of a fully edge-native **BERTopic** pipeline. All computational tasks run entirely in the client’s browser using WebAssembly (WASM), WebGPU, and high-performance JavaScript libraries. The design preserves 100 % fidelity to the original BERTopic workflow while delivering complete feature parity—including guided/seeded topic modeling, seed-word boosting, multiple topic representations, topic reduction, hierarchical topics, document-topic probabilities, production inference (`.transform()`), and interactive visualization. Progressive batching, IndexedDB model caching, vocabulary pruning, low-memory fallbacks, native file handling, PWA offline support, multi-language adaptation, and rich export capabilities ensure scalability (comfortable target: 1 000–5 000 documents; graceful handling up to 10 k+), privacy-first operation, memory stability, and broad device compatibility. The pipeline is production-ready for 2026 web environments and designed for immediate real-world deployment as a privacy-first topic modeling tool.

## Phase 0: Input & File Handling Layer
Provide seamless, server-free ingestion of real-world document collections.

* **Native File Support**: Drag-and-drop interface + File System Access API for entire local folders (no upload required).
* **Document Formats**: PDF (via pdf.js), DOCX (via mammoth.js), TXT, Markdown, and plain text.
* **OCR Fallback**: Optional integration of Tesseract.js (WASM) for scanned/image-based PDFs.
* **Preprocessing**: Automatic text extraction, basic cleaning, and language auto-detection before passing to the embedding pipeline.
* **Progress & Cancellation**: Real-time loading indicators and user-initiated cancellation for large folders.

## Phase 1: Foundational Environment & Tooling Setup
Establish the core infrastructure required to handle high-dimensional vector math and heavy graph traversals without blocking the main UI thread.

* **Concurrency Model**: Configure **Web Workers** to offload the entire analytical pipeline, ensuring the main thread remains responsive for UI updates.
* **Memory Strategy**: Implement **Transferable Objects** to move large ArrayBuffer data between threads via memory ownership transfer rather than structured cloning to prevent memory bloat.
* **Browser Compatibility & Fallbacks**: Perform feature detection for WebGPU at startup. Use `device: 'webgpu'` in transformers.js when available; gracefully fall back to WASM/CPU backends with clear UI warnings and estimated processing times for lower-end devices (Firefox partial support, Safari limited as of April 2026).
* **Scalability & Progressive Processing**: Support batched embedding (chunks of 512 documents) and streaming of intermediate results to handle larger corpora without out-of-memory crashes. Include a configurable “low-memory mode” that reduces UMAP dimensions or uses approximate HDBSCAN / MiniBatchKMeans fallback.
* **Model Persistence (IndexedDB Caching)**: Leverage transformers.js built-in IndexedDB cache (or custom wrapper) to store quantized ONNX weights locally. Cold start loads weights once; subsequent sessions initialize in milliseconds.
* **PWA & Offline-First**: Full Progressive Web App support (manifest + service worker) with offline caching of models and previous analysis sessions.
* **Library Selection**:
  * **Feature Extraction**: transformers.js for transformer-based embeddings.
  * **Dimensionality Reduction**: umap-wasm (Rust/WASM) for manifold projection.
  * **Clustering**: hdbscan-wasm (primary) + optional MiniBatchKMeans fallback.
  * **Lexical Processing**: winkNLP for high-throughput tokenization.

## Phase 2: Semantic Embedding Generation (Feature Extraction)
Transform raw text into dense floating-point vectors using hardware-accelerated transformer models.

* **Hardware Acceleration**: Enable the **WebGPU** backend in transformers.js to achieve 40× to 120× speedups over standard CPU execution.
* **Model Selection**: Deploy **Xenova/all-MiniLM-L6-v2** (~90 MB) as the default memory-efficient model. Optional support for EmbeddingGemma or 8-bit quantized variants with user toggle for “High Precision” (fp32) mode on desktop.
* **Multi-Language Support**: Automatic language detection and loading of appropriate MiniLM multilingual variants (100+ languages supported by transformers.js).
* **Tensor Processing**:
  * Apply **Mean Pooling** to convert token-level embeddings into a single document vector.
  * Execute **L2 Normalization** to scale vectors to a magnitude of 1, allowing for efficient dot-product calculations later.

## Phase 3: Manifold Projection (Dimensionality Reduction)
Mitigate the “curse of dimensionality” by projecting embeddings into a lower-dimensional manifold (typically 2 to 5 dimensions).

* **Algorithmic Choice**: Utilize **UMAP** (Uniform Manifold Approximation and Projection) to preserve both local density and global semantic structure.
* **Implementation**: Use umap-wasm instead of pure JavaScript ports to leverage **deterministic initialization** and Rust-based random projection trees for faster nearest-neighbor searches.
* **Reproducibility**: Expose and document a configurable UMAP seed parameter to guarantee identical results across runs.
* **Optimization**: Execute stochastic gradient descent over hundreds of epochs within the WASM environment to minimize cross-entropy between high and low-dimensional projections.

## Phase 4: Density-Based Semantic Clustering
Partition the reduced embeddings into distinct thematic groups while identifying and excluding noise.

* **Clustering Logic**: Implement **HDBSCAN** (primary) to detect arbitrary cluster shapes and variable densities.
* **WASM Integration**: Pass the Float32Array output from UMAP into a WebAssembly-compiled HDBSCAN module to perform complex graph-theory operations (Minimum Spanning Trees) efficiently.
* **Probabilities & Outlier Scores**: Leverage HDBSCAN’s `prediction_data` to compute per-document membership probabilities and outlier scores.
* **Noise Handling**: Automatically label transitional or off-topic documents as noise (label -1).
* **Low-Memory Fallback**: Automatically switch to MiniBatchKMeans when device constraints exceed ~10 k documents.

## Phase 5: Lexical Extraction & Sparse Matrix Construction
Transition from mathematical vector space back to interpretable human language.

* **Class-Document Aggregation**: Concatenate all documents within a specific cluster into a single “class-document”.
* **High-Speed Tokenization**: Use winkNLP to tokenize text, strip stop words, and generate n-grams at speeds up to 4 million tokens per second.
* **Vocabulary Pruning**: Apply configurable `min_df` threshold (default = 2) before CSR construction to eliminate low-frequency terms (hapax legomena) and reduce matrix size by 60–80 %.
* **Sparse Storage**: Store the resulting document-term matrix in **Compressed Sparse Row (CSR)** format using csr-matrix.

## Phase 6: Topic Representation (c-TF-IDF)
Extract uniquely representative keywords for each cluster using modified TF-IDF mathematics.

* **L1 Normalization**: Normalize raw term frequencies by cluster size to prevent large clusters from dominating the keyword extraction.
* **Scaling**: Apply a square root transformation to normalized frequencies to shrink outlier values.
* **Seed Words Boost (optional)**: Accept an optional `seed_words: list[str]` list with a configurable `seed_multiplier` (default 1.0) to boost domain-specific terms **before** L1 normalization.
* **Weighting**: Calculate the final importance score using the class-based IDF formula (exact BERTopic reference implementation):

\[
c\text{-TF-IDF}_{x,c} = \frac{f_{x,c}}{\max(f_{.,c})} \times \log\left(1 + \frac{A}{1 + f_x}\right)
\]

where \( A \) is the average number of words per class-document, \( f_{x,c} \) is the term frequency of word \( x \) in class \( c \), and \( f_x \) is the absolute frequency of word \( x \) across all classes.

* **Labeling**: Retrieve the top 10 most heavily weighted words per cluster to serve as the final thematic labels.

## Phase 7: Memory Hygiene & Pipeline Optimization
Ensure long-term stability and prevent browser crashes during large-scale processing.

* **Session Disposal**: Explicitly call `.dispose()` and `session.release()` on ONNX inference sessions immediately after embedding generation to free up GPU and system memory.
* **Lifecycle Management**: Ensure temporary variables for dense tensors and large sparse matrices fall out of scope to trigger the JavaScript Garbage Collector.
* **WebAssembly Threading**: Tune `ort.env.wasm.numThreads` dynamically based on available hardware cores.
* **Asynchronous Mapping**: Efficiently manage WebGPU `readBuffer` mapping and use `device.queue.onSubmittedWorkDone()` to synchronize GPU/CPU handoff.
* **Pipeline Orchestration**: Implement progress callbacks via Web Worker `postMessage` for every phase, including live estimated remaining time and progressive loading bar for cold-start model weights.
* **Cold-Start UI**: Progressive loading bar for first-time model download; instant warm-start via IndexedDB thereafter.

## Phase 8: Guided Topic Modeling & Full BERTopic Feature Parity
Deliver complete feature parity with the original Python BERTopic library, including semi-supervised guidance and production inference capabilities.

* **Guided / Seeded Topic Modeling**:
  * Accept optional `seed_topic_list: list[list[str]]` from the user.
  * For each seed list, create a pseudo-document, embed it via transformers.js (WebGPU), and L2-normalize.
  * Compute cosine similarity matrix between all document embeddings and seed embeddings.
  * Use the highest-similarity seed as a soft prior label for HDBSCAN (or fall back to pure HDBSCAN for unseeded documents).
  * Expose the seeded assignments alongside normal cluster labels.
* **Multiple Topic Representations** (optional multi-aspect):
  * Support parallel c-TF-IDF + KeyBERTInspired (via winkNLP + embedding similarity) or other local representation models.
* **Topic Refinement & Merging**:
  * Implement hierarchical topic reduction and cosine-similarity-based merging of similar topics (ported from BERTopic’s `reduce_topics` logic).
  * Optional generation of topic hierarchies directly from the UMAP embedding space.
* **Document-Topic Probabilities**:
  * Compute soft cluster assignments using HDBSCAN probabilities, enabling probabilistic topic modeling and per-document topic distributions.
* **Inference & Production Features**:
  * Implement `.transform(new_docs)` using pre-computed topic embeddings (centroids) + cosine similarity.
  * Compute and expose representative documents per topic (top-k closest to centroid).
  * Store topic embeddings for downstream similarity search or merging.

## Phase 9: Visualization & Interactive UI
Leverage the fully in-memory results for rich, zero-cost interactivity.

* Render interactive **Intertopic Distance Map** (2D scatter plot of UMAP coordinates with topic bubbles, hover details, zoom/pan, and document previews) using Plotly.js or D3.js.
* Additional views: topic hierarchy tree, per-document topic probabilities heatmap, and representative document list.
* Fully client-side and responsive; no external rendering services required.

## Phase 10: Export & Integration Layer
Enable seamless output and reuse of analysis results.

* **One-Click Exports**: JSON (full BERTopic object), CSV (document-topic matrix), Excel, and interactive HTML report (self-contained Plotly).
* **Shareable Sessions**: Compressed blob URL export of analysis state (never leaves the device).
* **Embeddable Component**: Optional React/Vue wrapper + npm package for integration into other web applications.
* **Domain Adaptation**: Optional “Quick Fine-Tune” button using 50–200 user-provided example documents to generate lightweight LoRA-style adapters (runs entirely in-browser).

## Phase 11: Testing, Validation & Benchmarking
Validate correctness, performance, and reproducibility before production use.

* **Golden Dataset Validation**: Use a standardized subset (e.g., 20 Newsgroups) and assert that final topics, top words, and seeded runs match the Python BERTopic reference implementation within a defined tolerance.
* **End-to-End Benchmarking**: Measure performance against server-side BERTopic on identical hardware.
* **Reproducibility Testing**: Verify that enabling the fixed-seed mode produces bit-identical outputs across browser restarts and devices.
* **Unit & Integration Tests**: Cover every phase, including fallbacks, memory hygiene, progress reporting, seeded topic modeling, file handling, visualization, and exports.

## Browser Constraints, Technical Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| GPU/CPU Sync Latency | Explicit `device.queue.onSubmittedWorkDone()` before WASM handoff |
| Worker Serialization | Always use Transferable Objects (`postMessage(…, [array.buffer])`) |
| Quantization Loss | User toggle for fp32 “High Precision” mode on desktop |
| Memory Pressure at Scale | Vocabulary pruning + low-memory mode + MiniBatchKMeans fallback |

**Privacy & Security**: Zero data leaves the browser by design — ideal for sensitive domains (legal, medical, enterprise, research).  
**Reproducibility Mode**: Single toggle that fixes all random seeds for identical results across runs.  
**Opt-in Telemetry**: Anonymous usage statistics (corpus size, device specs, processing time) collected only with explicit user consent to inform public benchmarks and future improvements.  
**Documentation**: One-page “Browser Constraints” reference for maintainers covering feature detection, memory formulas, fallback behavior, and PWA installation instructions.
