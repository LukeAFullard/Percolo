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

Because the application runs entirely client-side, it is incredibly well-suited for completely offline usage.

The application is bundled with `vite-plugin-pwa` to enable this:
* Upon the first visit, a Service Worker installs and caches the `index.html`, CSS, JS, and the large WebAssembly (`.wasm`) binaries.
* The ONNX AI models (e.g., embeddings, ABSA, LLMs) downloaded via `@huggingface/transformers` are natively cached in the browser's Cache API upon their first execution.
* Users can "Install" the application to their device (via Chrome/Edge). Once installed and the models are downloaded once, **the application can be used forever without an internet connection**. No data is ever sent to a server.

Ensure your host serves the `manifest.webmanifest` and `sw.js` files with correct MIME types (`application/manifest+json` and `application/javascript`).

## 4. Desktop Deployment (Electron)

If you want to distribute the Edge-Native Topic Modeler as a standalone desktop application (Windows, macOS, Linux) without relying on a web browser, you can wrap the static build output in an **Electron** shell.

### Creating an Electron Wrapper

1. Create a new directory for the Electron app and initialize it:
   ```bash
   mkdir percolo-desktop && cd percolo-desktop
   npm init -y
   npm install electron --save-dev
   ```

2. Copy the `ui/dist` folder from your build step into this new directory.

3. Create a `main.js` file to bootstrap the Electron window. **Crucially**, you must instruct Electron to bypass specific security policies or intercept headers to enable `SharedArrayBuffer` for the WASM threads.

```javascript
const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Inject Cross-Origin-Isolation headers to enable SharedArrayBuffer for WASM threads
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp']
      }
    });
  });

  // Load the Vite build output
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

4. Update the `package.json` of your Electron app to point to `main.js`:
   ```json
   "main": "main.js",
   "scripts": {
     "start": "electron ."
   }
   ```

5. Run `npm start` to launch the standalone desktop application.

*(Note: If you plan to distribute the Electron app, consider using `electron-builder` or `electron-forge` to package it into `.exe`, `.dmg`, or `.AppImage` files.)*