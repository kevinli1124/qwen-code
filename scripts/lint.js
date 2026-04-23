#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ACTIONLINT_VERSION = '1.7.7';
const SHELLCHECK_VERSION = '0.11.0';
const YAMLLINT_VERSION = '1.35.1';

const TEMP_DIR = join(tmpdir(), 'qwen-code-linters');

// Pinned SHA-256 checksums for downloaded linter tarballs. Supply-chain
// defense: if an attacker replaces the release asset we refuse to install.
// When bumping a version, update the corresponding entry below.
// Actionlint checksums are published at
//   https://github.com/rhysd/actionlint/releases/download/v<ver>/actionlint_<ver>_checksums.txt
// Shellcheck does not publish a checksum file; hashes are computed locally
// from the GitHub release asset bytes.
const EXPECTED_CHECKSUMS = {
  // actionlint 1.7.7
  'actionlint_1.7.7_linux_amd64.tar.gz':
    '023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757',
  'actionlint_1.7.7_darwin_amd64.tar.gz':
    '28e5de5a05fc558474f638323d736d822fff183d2d492f0aecb2b73cc44584f5',
  'actionlint_1.7.7_darwin_arm64.tar.gz':
    '2693315b9093aeacb4ebd91a993fea54fc215057bf0da2659056b4bc033873db',
  // shellcheck 0.11.0
  'shellcheck-v0.11.0.linux.x86_64.tar.xz':
    '8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198',
  'shellcheck-v0.11.0.darwin.x86_64.tar.xz':
    '3c89db4edcab7cf1c27bff178882e0f6f27f7afdf54e859fa041fca10febe4c6',
  'shellcheck-v0.11.0.darwin.aarch64.tar.xz':
    '56affdd8de5527894dca6dc3d7e0a99a873b0f004d7aabc30ae407d3f48b0a79',
};

function verifyChecksum(filePath, assetName) {
  const expected = EXPECTED_CHECKSUMS[assetName];
  if (!expected) {
    throw new Error(
      `No pinned SHA-256 checksum for asset "${assetName}". ` +
        `Add one to EXPECTED_CHECKSUMS in scripts/lint.js before installing.`,
    );
  }
  const actual = createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex');
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${assetName}.\n  expected ${expected}\n  got      ${actual}`,
    );
  }
}

function getPlatformArch() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'linux' && arch === 'x64') {
    return {
      actionlint: 'linux_amd64',
      shellcheck: 'linux.x86_64',
    };
  }
  if (platform === 'darwin' && arch === 'x64') {
    return {
      actionlint: 'darwin_amd64',
      shellcheck: 'darwin.x86_64',
    };
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      actionlint: 'darwin_arm64',
      shellcheck: 'darwin.aarch64',
    };
  }
  throw new Error(`Unsupported platform/architecture: ${platform}/${arch}`);
}

const platformArch = getPlatformArch();

const ACTIONLINT_ASSET = `actionlint_${ACTIONLINT_VERSION}_${platformArch.actionlint}.tar.gz`;
const SHELLCHECK_ASSET = `shellcheck-v${SHELLCHECK_VERSION}.${platformArch.shellcheck}.tar.xz`;

/**
 * @typedef {{
 *   check: string;
 *   installer: string;
 *   run: string;
 * }}
 */

/**
 * @type {{[linterName: string]: Linter}}
 */
const LINTERS = {
  actionlint: {
    check: 'command -v actionlint',
    downloadPath: `${TEMP_DIR}/.actionlint.tgz`,
    assetName: ACTIONLINT_ASSET,
    download: `
      mkdir -p "${TEMP_DIR}/actionlint"
      curl -fsSLo "${TEMP_DIR}/.actionlint.tgz" "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${ACTIONLINT_ASSET}"
    `,
    extract: `
      tar -xzf "${TEMP_DIR}/.actionlint.tgz" -C "${TEMP_DIR}/actionlint"
    `,
    run: `
      actionlint \
        -color \
        -ignore 'SC2002:' \
        -ignore 'SC2016:' \
        -ignore 'SC2129:' \
        -ignore 'label ".+" is unknown'
    `,
  },
  shellcheck: {
    check: 'command -v shellcheck',
    downloadPath: `${TEMP_DIR}/.shellcheck.txz`,
    assetName: SHELLCHECK_ASSET,
    download: `
      mkdir -p "${TEMP_DIR}/shellcheck"
      curl -fsSLo "${TEMP_DIR}/.shellcheck.txz" "https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/${SHELLCHECK_ASSET}"
    `,
    extract: `
      tar -xf "${TEMP_DIR}/.shellcheck.txz" -C "${TEMP_DIR}/shellcheck" --strip-components=1
    `,
    run: `
      git ls-files | grep -v '^integration-tests/terminal-bench/' | grep -E '^([^.]+|.*\\.(sh|zsh|bash))' | xargs file --mime-type \
        | grep "text/x-shellscript" | awk '{ print substr($1, 1, length($1)-1) }' \
        | xargs shellcheck \
          --check-sourced \
          --enable=all \
          --exclude=SC2002,SC2129,SC2310 \
          --severity=style \
          --format=gcc \
          --color=never | sed -e 's/note:/warning:/g' -e 's/style:/warning:/g'
    `,
  },
  yamllint: {
    check: 'command -v yamllint',
    // pip install from PyPI; pinned version above. PyPI itself verifies its
    // own package index signatures, so no separate SHA is needed here.
    install: `pip3 install --user "yamllint==${YAMLLINT_VERSION}"`,
    run: "git ls-files | grep -E '\\.(yaml|yml)' | xargs yamllint --format github",
  },
};

function runCommand(command, stdio = 'inherit') {
  try {
    const env = { ...process.env };
    const nodeBin = join(process.cwd(), 'node_modules', '.bin');
    env.PATH = `${nodeBin}:${TEMP_DIR}/actionlint:${TEMP_DIR}/shellcheck:${env.PATH}`;
    if (process.platform === 'darwin') {
      env.PATH = `${env.PATH}:${process.env.HOME}/Library/Python/3.12/bin`;
    } else if (process.platform === 'linux') {
      env.PATH = `${env.PATH}:${process.env.HOME}/.local/bin`;
    }
    execSync(command, { stdio, env });
    return true;
  } catch (_e) {
    return false;
  }
}

export function setupLinters() {
  console.log('Setting up linters...');
  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  for (const linter in LINTERS) {
    const entry = LINTERS[linter];
    if (!runCommand(entry.check, 'ignore')) {
      console.log(`Installing ${linter}...`);
      // Two modes: PyPI-style single-command install, or download→verify→extract.
      if (entry.install) {
        if (!runCommand(entry.install)) {
          console.error(
            `Failed to install ${linter}. Please install it manually.`,
          );
          process.exit(1);
        }
        continue;
      }
      if (!runCommand(entry.download)) {
        console.error(
          `Failed to download ${linter}. Please install it manually.`,
        );
        process.exit(1);
      }
      try {
        verifyChecksum(entry.downloadPath, entry.assetName);
      } catch (err) {
        console.error(
          `Checksum verification failed for ${linter}: ${err.message}`,
        );
        process.exit(1);
      }
      if (!runCommand(entry.extract)) {
        console.error(
          `Failed to extract ${linter}. Please install it manually.`,
        );
        process.exit(1);
      }
    }
  }
  console.log('All required linters are available.');
}

export function runESLint() {
  console.log('\nRunning ESLint...');
  if (!runCommand('npm run lint:ci')) {
    process.exit(1);
  }
}

export function runActionlint() {
  console.log('\nRunning actionlint...');
  if (!runCommand(LINTERS.actionlint.run)) {
    process.exit(1);
  }
}

export function runShellcheck() {
  console.log('\nRunning shellcheck...');
  if (!runCommand(LINTERS.shellcheck.run)) {
    process.exit(1);
  }
}

export function runYamllint() {
  console.log('\nRunning yamllint...');
  if (!runCommand(LINTERS.yamllint.run)) {
    process.exit(1);
  }
}

export function runPrettier() {
  console.log('\nRunning Prettier...');
  if (!runCommand('prettier --write .')) {
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--setup')) {
    setupLinters();
  }
  if (args.includes('--eslint')) {
    runESLint();
  }
  if (args.includes('--actionlint')) {
    runActionlint();
  }
  if (args.includes('--shellcheck')) {
    runShellcheck();
  }
  if (args.includes('--yamllint')) {
    runYamllint();
  }
  if (args.includes('--prettier')) {
    runPrettier();
  }

  if (args.length === 0) {
    setupLinters();
    runESLint();
    runActionlint();
    runShellcheck();
    runYamllint();
    runPrettier();
    console.log('\nAll linting checks passed!');
  }
}

main();
