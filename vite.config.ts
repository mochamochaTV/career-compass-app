import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

// =============================================================================
// Service Worker build-version stamping
// Replaces the __BUILD_ID__ placeholder in the built sw.js with a value that
// is unique to this build, so the file's bytes always change on deploy and
// the browser reliably picks up the new service worker (see client/public/sw.js
// for why this matters — without it, an update can silently fail to take
// effect at all).
// =============================================================================

function swBuildVersionPlugin(): Plugin {
  return {
    name: "sw-build-version",
    apply: "build",
    closeBundle() {
      const swPath = path.resolve(import.meta.dirname, "dist/public/sw.js");
      if (!fs.existsSync(swPath)) return;
      const buildId = Date.now().toString(36);
      const contents = fs.readFileSync(swPath, "utf-8").replaceAll("__BUILD_ID__", buildId);
      fs.writeFileSync(swPath, contents, "utf-8");
    },
  };
}

const plugins = [react(), tailwindcss(), jsxLocPlugin(), swBuildVersionPlugin()];

export default defineConfig({
  plugins,
  // Relative asset paths so the built app works from any subpath — the
  // domain root, or a GitHub Pages project site at
  // https://<user>.github.io/<repo-name>/ — without editing this file.
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
