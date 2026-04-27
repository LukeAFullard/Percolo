# Open Source License Compliance Report

This report details the licenses for all open-source packages (NPM dependencies) and machine learning models used in this project.

## Executive Summary

* **NPM Packages:** All used NPM packages utilize permissive open-source licenses (MIT, Apache-2.0, ISC, BSD-2-Clause) which are generally compatible with both open-source and commercial use.
* **Machine Learning Models:** Most models are permissively licensed (Apache-2.0, MIT). However, **one model uses a restrictive non-commercial license**.
* **⚠️ ACTION REQUIRED / ADDRESSED:** The `Xenova/nllb-200-distilled-600M` translation model is licensed under **CC-BY-NC-4.0** (Creative Commons Attribution-NonCommercial 4.0 International).
  * **Function:** This model is used for **Cross-Lingual Topic Alignment** within `src/nlp/translation.ts` (specifically the `CrossLingualTranslator` class).
  * **Replacement:** We have replaced it with `Xenova/m2m100_418M` as the new default model. This is derived from `facebook/m2m100_418M` which is licensed under the highly permissive **MIT** license, resolving the commercial compliance issue.

## Machine Learning Models

| Model Name | License | Source |
|---|---|---|
| `Xenova/TinyLlama-1.1B-Chat-v1.0` | **Apache-2.0** | Original Model (TinyLlama/TinyLlama-1.1B-Chat-v1.0) |
| `Xenova/bert-base-multilingual-uncased-sentiment` | **MIT** | Original Model (nlptown/bert-base-multilingual-uncased-sentiment) |
| `Xenova/m2m100_418M` | **MIT** | Replacement for nllb-200 (Original Model facebook/m2m100_418M) |
| `Xenova/nllb-200-distilled-600M` (Deprecated) | **CC-BY-NC-4.0** | Hugging Face API tags |
| `Xenova/all-MiniLM-L6-v2` | **Apache-2.0** | Hugging Face API tags |
| `openai/privacy-filter` | **Apache-2.0** | Hugging Face API tags |

## NPM Packages

| Package | License |
|---|---|
| `@huggingface/transformers` | Apache-2.0 |
| `csr-matrix` | MIT |
| `hdbscan-ts` | MIT |
| `idb` | ISC |
| `mammoth` | BSD-2-Clause |
| `pdfjs-dist` | Apache-2.0 |
| `tesseract.js` | Apache-2.0 |
| `umap-js` | MIT |
| `wink-eng-lite-web-model` | MIT |
| `wink-nlp` | MIT |
| `@types/node` | MIT |
| `fake-indexeddb` | Apache-2.0 |
| `tsx` | MIT |
| `typescript` | Apache-2.0 |
| `vitest` | MIT |
| `@tailwindcss/vite` | MIT |
| `@types/react-plotly.js` | MIT |
| `lucide-react` | ISC |
| `react` | MIT |
| `react-dom` | MIT |
| `react-plotly.js` | MIT |
| `tailwindcss` | MIT |
| `@eslint/js` | MIT |
| `@types/react` | MIT |
| `@types/react-dom` | MIT |
| `@vitejs/plugin-react` | MIT |
| `eslint` | MIT |
| `eslint-plugin-react-hooks` | MIT |
| `eslint-plugin-react-refresh` | MIT |
| `globals` | MIT |
| `path` | MIT |
| `typescript-eslint` | MIT |
| `vite` | MIT |
| `vite-plugin-pwa` | MIT |
