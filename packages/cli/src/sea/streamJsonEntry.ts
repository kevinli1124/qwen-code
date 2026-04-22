/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Headless stream-json CLI bootstrap used by the SEA build. Mirrors the
 * minimum subset of gemini.tsx's main() needed to drive
 * runNonInteractiveStreamJson() without pulling in any React / Ink / yoga
 * dependencies (those would introduce top-level await and break CJS bundling
 * for SEA).
 */

import { loadSettings } from '../config/settings.js';
import { parseArguments, loadCliConfig } from '../config/config.js';
import { validateNonInteractiveAuth } from '../validateNonInterActiveAuth.js';
import { runNonInteractiveStreamJson } from '../nonInteractive/session.js';

export async function runSeaStreamJson(): Promise<void> {
  const settings = loadSettings();
  const argv = await parseArguments();

  const config = await loadCliConfig(
    settings.merged,
    argv,
    process.cwd(),
    argv.extensions,
  );

  const nonInteractiveConfig = await validateNonInteractiveAuth(
    settings.merged.security?.auth?.useExternal,
    config,
    settings,
  );

  // Initial user message comes over stdin once SessionManager starts streaming;
  // runNonInteractiveStreamJson handles the reader itself, no pre-prompt here.
  await runNonInteractiveStreamJson(nonInteractiveConfig, '');
  process.exit(0);
}
