/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Packages dist/cli.js into a single executable using Node.js SEA.
 * Requires: Node 20+, npx postject (installed automatically via npx).
 *
 * Usage: node scripts/build_exe.js [--out=qwen.exe]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const outArg = process.argv.find((a) => a.startsWith('--out='));
const platform = process.platform;
const defaultName = platform === 'win32' ? 'qwen.exe' : 'qwen';
const OUT_NAME = outArg ? outArg.split('=')[1] : defaultName;
const OUT_PATH = path.resolve(ROOT, OUT_NAME);
const CLI_BUNDLE = path.join(ROOT, 'dist', 'cli.js');
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

// 1. Write SEA config
const seaConfig = {
  main: 'dist/cli.js',
  output: 'sea-prep.blob',
  disableExperimentalSEAWarning: true,
};
fs.writeFileSync(SEA_CONFIG, JSON.stringify(seaConfig, null, 2));
console.log('[build_exe] Wrote sea-config.json');

// 2. Generate blob
run(`node --experimental-sea-config ${SEA_CONFIG}`);

// 3. Copy node executable
const nodeExe = process.execPath;
fs.copyFileSync(nodeExe, OUT_PATH);
console.log(`[build_exe] Copied ${nodeExe} → ${OUT_PATH}`);

// 4. Remove existing signature (macOS/Windows)
if (platform === 'darwin') {
  try {
    run(`codesign --remove-signature ${OUT_PATH}`);
  } catch {
    /* skip */
  }
} else if (platform === 'win32') {
  // On Windows, signtool remove is optional; postject handles unsigned binaries
}

// 5. Inject blob via postject
const fuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const postjectArgs =
  platform === 'darwin'
    ? `--sentinel-fuse ${fuse} --macho-segment-name NODE_SEA`
    : `--sentinel-fuse ${fuse}`;

run(
  `npx --yes postject ${OUT_PATH} NODE_SEA_BLOB ${BLOB_PATH} ${postjectArgs}`,
);

// 6. Re-sign (macOS only)
if (platform === 'darwin') {
  try {
    run(`codesign --sign - ${OUT_PATH}`);
  } catch {
    /* skip */
  }
}

// Cleanup temp files
for (const f of [SEA_CONFIG, BLOB_PATH]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const sizeMb = (fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(1);
console.log(`\n✓ Built ${OUT_NAME} (${sizeMb} MB)`);
console.log(`  Run: ${OUT_PATH} --web`);
