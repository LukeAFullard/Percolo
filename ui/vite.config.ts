import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, '../src')
    }
  },
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext'
  },
  optimizeDeps: {
    include: ['hdbscan-ts', 'idb', 'umap-js', '@huggingface/transformers', 'wink-nlp', 'wink-eng-lite-web-model', 'csr-matrix']
  }
})
