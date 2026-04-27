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
import { execSync } from 'node:child_process';

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
    // ENOTEMPTY or EPERM (locked files / antivirus) on non-empty directories.
    // Use rmdir /s /q via the shell on Windows (most reliable), fall back to
    // fs.rmSync on other platforms. Both are wrapped in try/catch so that a
    // failure is non-fatal — Vite will overwrite files on the next build anyway.
    {
      name: 'clean-dist-windows',
      buildStart() {
        const distPath = resolve(__dirname, 'dist');
        if (!existsSync(distPath)) return;
        try {
          if (process.platform === 'win32') {
            execSync(`rmdir /s /q "${distPath}"`, {
              stdio: 'ignore',
              shell: true,
            });
          } else {
            rmSync(distPath, { recursive: true, force: true });
          }
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
