import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * Package name of a node_modules module id (`@scope/name` or `name`), or null
 * for our own source. Understands the pnpm layout this repo installs with
 * (`node_modules/.pnpm/<name>@<ver>/node_modules/<name>/...`).
 */
function packageOf(id: string): string | null {
  const marker = id.lastIndexOf("node_modules/");
  if (marker < 0) return null;
  let rest = id.slice(marker + "node_modules/".length);
  if (rest.startsWith(".pnpm/")) {
    const after = rest.slice(".pnpm/".length).split("/node_modules/")[1];
    if (!after) return null;
    rest = after;
  }
  const parts = rest.split("/");
  return parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * Vendor chunking for the libraries the app always loads. Grouping them by
 * family is what turns one 4 MB entry chunk into a handful of scripts WebView2
 * can parse and compile in parallel before the first paint.
 *
 * Only listed packages are touched. Everything else keeps Rollup's own
 * chunking — nothing here may catch a package that splits itself up (mermaid
 * and tldraw both do, and forcing their modules into one chunk re-inlines
 * every diagram editor they lazily load).
 */
const VENDOR_GROUPS: Array<[string, string[]]> = [
  [
    "vendor-vue",
    ["vue", "@vue/runtime-core", "@vue/runtime-dom", "@vue/reactivity", "@vue/shared", "pinia"],
  ],
  [
    "vendor-editor",
    [
      "@codemirror/view",
      "@codemirror/state",
      "@codemirror/language",
      "@codemirror/commands",
      "@codemirror/search",
      "@codemirror/autocomplete",
      "@codemirror/theme-one-dark",
      // The markdown grammar itself is needed the moment the editor mounts;
      // every other grammar is a `load()` description (lib/code-languages.ts)
      // and becomes its own chunk, so it is deliberately NOT listed here.
      "@codemirror/lang-markdown",
      "@lezer/markdown",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
      "style-mod",
      "w3c-keyname",
      "crelt",
      "@marijn/find-cluster-break",
    ],
  ],
  ["vendor-editor-vim", ["@replit/codemirror-vim"]],
  ["vendor-katex", ["katex"]],
  [
    "vendor-preview",
    [
      "markdown-it",
      "markdown-it-anchor",
      "markdown-it-front-matter",
      "markdown-it-footnote",
      "markdown-it-mark",
      "markdown-it-cjk-friendly",
      "@vscode/markdown-it-katex",
      "linkify-it",
      "mdurl",
      "uc.micro",
      "entities",
      "punycode.js",
      "js-yaml",
      "dompurify",
      "highlight.js",
      "get-east-asian-width",
      "fflate",
    ],
  ],
];

const VENDOR_BY_PACKAGE = new Map<string, string>();
for (const [chunk, pkgs] of VENDOR_GROUPS) {
  for (const pkg of pkgs) VENDOR_BY_PACKAGE.set(pkg, chunk);
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],

  resolve: {
    alias: [
      // `@vscode/markdown-it-katex` ships CommonJS only, so its `require('katex')`
      // resolved to dist/katex.js while our own `import katex from 'katex'` got
      // dist/katex.mjs — Rollup bundled BOTH copies (~600 kB of duplicated
      // KaTeX) into the entry chunk. Pin the bare specifier to the ESM build;
      // the anchor keeps subpaths (`katex/dist/katex.min.css`,
      // `katex/contrib/mhchem`) resolving as before.
      { find: /^katex$/, replacement: "katex/dist/katex.mjs" },
    ],
  },

  build: {
    // Vite's 500 kB default answers a web question — "how much does the user
    // wait for over the network". Everything above it here is a single
    // *on-demand* library that cannot be divided further and loads only when
    // its feature is used: tldraw (~1.7 MB, whiteboard), OpenCC + pinyin-pro
    // (~1.4 MB, Chinese conversion), jsPDF + html2pdf.js (~1 MB, PDF export),
    // mermaid core (~590 kB, diagrams). The chunks that actually gate the
    // first paint are the entry (editor, preview pipeline, toolbar, file tree)
    // and vendor-editor / vendor-preview — all well under this number.
    //
    // Set just above the largest chunk we knowingly ship, so the warning keeps
    // meaning something: a new 1.8 MB chunk is still a mistake worth stopping
    // for.
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      // tldraw pulls in Radix UI, and every Radix ESM build opens with Next.js'
      // `"use client"` directive. Rollup cannot keep a module-level directive
      // once modules are concatenated, so it drops it and says so — 38 times a
      // build. Nothing here consumes that directive (a Vite/WebView2 SPA has no
      // React Server Components runtime), so dropping it is exactly what we
      // want; the warnings only bury the ones that matter. Matched on the
      // warning code *and* the directive name, so every other Rollup warning —
      // including the `INEFFECTIVE_DYNAMIC_IMPORT` notes that do carry
      // information — still reaches the console.
      onwarn(warning, warn) {
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          /["']use client["']/.test(warning.message)
        ) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id: string) {
          const pkg = packageOf(id);
          // Our own source, and everything NOT listed in VENDOR_GROUPS, keeps
          // Rollup's own chunking. That matters: libraries that split
          // themselves up (mermaid's per-diagram chunks, tldraw, html2pdf)
          // would be flattened back into one giant file by a catch-all rule.
          if (!pkg) return undefined;
          if (pkg.startsWith("@tauri-apps/")) return "vendor-tauri";
          return VENDOR_BY_PACKAGE.get(pkg);
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
