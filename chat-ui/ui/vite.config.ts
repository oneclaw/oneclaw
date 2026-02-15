import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";

/**
 * Strip `crossorigin` attribute from HTML output.
 * Electron loads chat-ui via loadFile (file:// protocol).
 * Chromium treats `crossorigin` on module scripts as a CORS fetch,
 * which silently fails for file:// URLs → blank page.
 */
function stripCrossorigin(): Plugin {
  return {
    name: "strip-crossorigin",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, "");
    },
  };
}

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [stripCrossorigin()],
  resolve: {
    alias: {
      // The UI source references files outside ui/ via ../../../src/
      // We map these to our local copies at chat-ui/src/
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
