# Deployment Guide

The Edge-Native Topic Modeler is built as a static site that executes entirely client-side using WebAssembly (WASM) and WebGPU via `@huggingface/transformers`.

Because it relies on heavy, multi-threaded computations (like UMAP and HDBSCAN) directly in the browser, it **requires** specific web server configurations to function correctly—specifically, Cross-Origin Isolation to enable `SharedArrayBuffer` for multi-threaded WASM execution.

This guide outlines how to deploy the built UI (`/ui/dist`) to static hosting platforms like Cloudflare Pages, GitHub Pages, or Netlify.

## 1. Build the Application

To prepare the application for production, you must build the React frontend and the WASM assets.

```bash
# From the root directory, install all dependencies
npm install
npm install --prefix ui

# Build the headless engine and then the UI
npm run build
npm run build --prefix ui
```

This will generate the static assets in the `ui/dist/` directory. **This `ui/dist/` folder is your deployment payload.**

## 2. Crucial Requirement: COOP/COEP Headers

Multi-threaded WebAssembly requires the `SharedArrayBuffer` object. Modern browsers disable `SharedArrayBuffer` for security reasons unless the site is served with strict "Cross-Origin Isolation" headers.

If you fail to provide these headers, the application will degrade gracefully to chunked `postMessage` transfers, which are significantly slower and may crash on large datasets.

To enable full hardware acceleration, your host **must** serve the following HTTP headers with every asset:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Deploying to Cloudflare Pages (Recommended)

Cloudflare Pages makes header injection incredibly easy. The `ui/public/` folder already includes a `_headers` file specifically for Cloudflare:

1. Connect your Git repository to Cloudflare Pages.
2. Set the **Build Command** to: `npm install && npm install --prefix ui && npm run build && npm run build --prefix ui`
3. Set the **Build Output Directory** to: `ui/dist`
4. The `ui/public/_headers` file will automatically be copied to `ui/dist/_headers` and Cloudflare will serve the application with strict Cross-Origin Isolation.

### Deploying to GitHub Pages

GitHub Pages natively does **not** support setting custom HTTP headers out of the box.

If you deploy directly to GitHub Pages, the application will run in "fallback mode" (no `SharedArrayBuffer`).

To achieve full hardware acceleration on GitHub Pages, you must use a Service Worker workaround (like `coi-serviceworker`) to manually inject the headers on the client.

For standard deployment (fallback mode):
1. Use a GitHub Action workflow to build the project.
2. Deploy the `ui/dist` folder to your `gh-pages` branch.
3. Ensure you update `vite.config.ts` to set the `base` path to your repository name (e.g., `base: '/my-repo-name/'`).

### Deploying to Netlify

Netlify supports custom headers using a `_headers` file (similar to Cloudflare) or a `netlify.toml` file.

Create a `netlify.toml` file in the root of your repository:

```toml
[build]
  command = "npm install && npm install --prefix ui && npm run build && npm run build --prefix ui"
  publish = "ui/dist"

[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```

## 3. PWA and Offline Support

The application is bundled with `vite-plugin-pwa` to enable offline capability.
* When the site is loaded, the service worker caches the `index.html`, CSS, JS, and the large WASM files (`.wasm`).
* Once cached, users can run the entire topic modeling pipeline locally without an active internet connection.
* The ONNX AI models downloaded from HuggingFace are natively cached in the browser's Cache API by `transformers.js`.

Ensure your host serves the `manifest.webmanifest` and `sw.js` files with correct MIME types (`application/manifest+json` and `application/javascript`).