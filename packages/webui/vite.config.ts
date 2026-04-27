/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { rmSync, existsSync } from 'node:fs';

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
    // On Windows, Vite's built-in emptyOutDir uses rmdirSync which fails with
    // ENOTEMPTY on non-empty directories. Clean the dist folder ourselves using
    // fs.rmSync({ recursive, force }) which handles nested directories correctly.
    {
      name: 'clean-dist-windows',
      buildStart() {
        const distPath = resolve(__dirname, 'dist');
        if (existsSync(distPath)) {
          rmSync(distPath, { recursive: true, force: true });
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
