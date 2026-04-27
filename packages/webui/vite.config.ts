/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { rmSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vite configuration for @qwen-code/webui library
 *
 * Build outputs:
 * - ESM: dist/index.js (primary format)
 * - CJS: dist/index.cjs (compatibility)
 * - UMD: dist/index.umd.js (for CDN usage)
 * - TypeScript declarations: dist/index.d.ts
 * - CSS: dist/styles.css (optional styles)
 */
export default defineConfig({
  plugins: [
    // Windows EPERM / ENOTEMPTY race-condition workaround:
    // Vite's emptyOutDir and any manual rmdir/rmSync can fail on Windows due
    // to pending-delete delays after directory removal. Skip pre-build cleanup
    // entirely on Windows — emptyOutDir:false means Vite will overwrite
    // existing files without trying to remove the directory first.
    // On non-Windows we still clean so stale .d.ts files don't accumulate.
    {
      name: 'clean-dist',
      buildStart() {
        if (process.platform === 'win32') {
          // Pre-create dist/src/** tree mirroring src/ to prevent EPERM
          // when vite-plugin-dts creates declaration files in subdirectories.
          const srcDir = resolve(__dirname, 'src');
          const distSrcDir = resolve(__dirname, 'dist', 'src');
          function mirrorDirs(src: string, dest: string) {
            if (!existsSync(src)) return;
            mkdirSync(dest, { recursive: true });
            for (const entry of readdirSync(src, { withFileTypes: true })) {
              if (entry.isDirectory()) {
                mirrorDirs(join(src, entry.name), join(dest, entry.name));
              }
            }
          }
          try {
            mirrorDirs(srcDir, distSrcDir);
          } catch {
            // Non-fatal: vite-plugin-dts will still attempt its own mkdir.
          }
          return;
        }
        const distPath = resolve(__dirname, 'dist');
        if (!existsSync(distPath)) return;
        try {
          rmSync(distPath, { recursive: true, force: true });
        } catch {
          // Non-fatal: Vite will overwrite existing files.
        }
      },
    },
    react(),
    dts({
      include: ['src'],
      outDir: 'dist',
      // rollupTypes: true drops everything to `export {}` when api-extractor
      // hits any sub-module's side-effect CSS import — even with *.css
      // declared as an ambient module, api-extractor's analysis is stricter
      // than plain tsc. Emit per-file declarations instead; consumers
      // resolve types via the individual files pointed at by exports map.
      rollupTypes: false,
      insertTypesEntry: true,
    }),
  ],
  build: {
    // emptyOutDir handled by the clean-dist-windows plugin above
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'QwenCodeWebUI',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => {
        if (format === 'es') return 'index.js';
        if (format === 'cjs') return 'index.cjs';
        if (format === 'umd') return 'index.umd.js';
        return 'index.js';
      },
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'ReactJSXRuntime',
        },
        assetFileNames: 'styles.[ext]',
      },
    },
    sourcemap: true,
    minify: false,
    cssCodeSplit: false,
  },
});
