#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper to toggle general.promptProfile in ~/.qwen/settings.json during
 * A/B testing. Backs up the original on first run.
 *
 * Usage:
 *   node tests/capability/set-profile.mjs fork
 *   node tests/capability/set-profile.mjs qwen-native
 *   node tests/capability/set-profile.mjs restore   # put the original back
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SETTINGS_PATH = path.join(os.homedir(), '.qwen', 'settings.json');
const BACKUP_PATH = SETTINGS_PATH + '.bak';

const mode = process.argv[2];
if (!['fork', 'qwen-native', 'restore', 'show'].includes(mode ?? '')) {
  console.error(
    'Usage: set-profile.mjs <fork|qwen-native|restore|show>',
  );
  process.exit(1);
}

if (!fs.existsSync(SETTINGS_PATH)) {
  console.error(`settings file not found at ${SETTINGS_PATH}`);
  process.exit(1);
}

if (mode === 'show') {
  const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  console.log(
    `promptProfile = ${JSON.stringify(parsed.general?.promptProfile ?? '(unset → defaults to fork)')}`,
  );
  process.exit(0);
}

if (mode === 'restore') {
  if (!fs.existsSync(BACKUP_PATH)) {
    console.error('no backup at', BACKUP_PATH);
    process.exit(1);
  }
  fs.copyFileSync(BACKUP_PATH, SETTINGS_PATH);
  console.log('restored settings from', BACKUP_PATH);
  process.exit(0);
}

// fork | qwen-native
if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(SETTINGS_PATH, BACKUP_PATH);
  console.log('backed up original →', BACKUP_PATH);
}

const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
const parsed = JSON.parse(raw);
parsed.general = parsed.general ?? {};
parsed.general.promptProfile = mode;
fs.writeFileSync(SETTINGS_PATH, JSON.stringify(parsed, null, 2) + '\n');
console.log(`promptProfile set to "${mode}"`);
