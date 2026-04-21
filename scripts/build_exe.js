/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Packages dist/cli.js into a single executable using Node.js SEA.
 * Requires: Node 20+, npx postject (installed automatically via npx).
 *
 * Node.js SEA only supports CommonJS scripts, so this script first
 * re-bundles dist/cli.js → dist/cli-sea.cjs (CJS format) before injecting.
 *
 * Usage: node scripts/build_exe.js [--out=qwen.exe]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const outArg = process.argv.find((a) => a.startsWith('--out='));
const platform = process.platform;
const defaultName = platform === 'win32' ? 'qwen.exe' : 'qwen';
const OUT_NAME = outArg ? outArg.split('=')[1] : defaultName;
const OUT_PATH = path.resolve(ROOT, OUT_NAME);
const CLI_BUNDLE = path.join(ROOT, 'dist', 'cli.js');
const SEA_BUNDLE = path.join(ROOT, 'dist', 'cli-sea.cjs');
const SEA_CONFIG = path.join(ROOT, 'sea-config.json');
const BLOB_PATH = path.join(ROOT, 'sea-prep.blob');

function run(cmd, opts = {}) {
  console.log(`[build_exe] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

if (!fs.existsSync(CLI_BUNDLE)) {
  console.error(
    `[build_exe] ERROR: ${CLI_BUNDLE} not found. Run "npm run bundle" first.`,
  );
  process.exit(1);
}

// 1. Re-bundle web-entry.ts as CJS for SEA
// SEA only supports CommonJS. The full CLI entry uses Ink/yoga-layout which
// have top-level await (incompatible with CJS). The web-entry.ts only imports
// the HTTP web server and has no such dependencies.
console.log('[build_exe] Bundling web-entry.ts as CJS for SEA...');
const esbuild = (await import('esbuild')).default;
const pkg = require(path.resolve(ROOT, 'package.json'));
await esbuild.build({
  entryPoints: ['packages/cli/src/web-entry.ts'],
  bundle: true,
  outfile: SEA_BUNDLE,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // import.meta.url → CJS equivalent so FileURLToPath works at runtime
  banner: {
    js: "const __import_meta_url = require('url').pathToFileURL(__filename).href;",
  },
  define: {
    'import.meta.url': '__import_meta_url',
    'process.env.CLI_VERSION': JSON.stringify(pkg.version),
    global: 'globalThis',
  },
  keepNames: true,
});
console.log('[build_exe] CJS bundle written to dist/cli-sea.cjs');

// 2. Write SEA config
const seaConfig = {
  main: 'dist/cli-sea.cjs',
  output: 'sea-prep.blob',
  disableExperimentalSEAWarning: true,
};
fs.writeFileSync(SEA_CONFIG, JSON.stringify(seaConfig, null, 2));
console.log('[build_exe] Wrote sea-config.json');

// 3. Generate blob
run(`node --experimental-sea-config ${SEA_CONFIG}`);

// 4. Copy node executable
const nodeExe = process.execPath;
fs.copyFileSync(nodeExe, OUT_PATH);
console.log(`[build_exe] Copied ${nodeExe} → ${OUT_PATH}`);

// 5. Remove existing signature (macOS/Windows)
if (platform === 'darwin') {
  try {
    run(`codesign --remove-signature ${OUT_PATH}`);
  } catch {
    /* skip */
  }
} else if (platform === 'win32') {
  // On Windows, signtool remove is optional; postject handles unsigned binaries
}

// 6. Inject blob via postject
const fuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const postjectArgs =
  platform === 'darwin'
    ? `--sentinel-fuse ${fuse} --macho-segment-name NODE_SEA`
    : `--sentinel-fuse ${fuse}`;

run(
  `npx --yes postject ${OUT_PATH} NODE_SEA_BLOB ${BLOB_PATH} ${postjectArgs}`,
);

// 7. Re-sign (macOS only)
if (platform === 'darwin') {
  try {
    run(`codesign --sign - ${OUT_PATH}`);
  } catch {
    /* skip */
  }
}

// Cleanup temp files
for (const f of [SEA_CONFIG, BLOB_PATH, SEA_BUNDLE]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const sizeMb = (fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(1);
console.log(`\n✓ Built ${OUT_NAME} (${sizeMb} MB)`);
console.log(`  Run: ${OUT_PATH} --web`);
