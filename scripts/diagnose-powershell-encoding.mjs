#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Verifies the UTF-8 prefix we inject into PowerShell invocations actually
 * produces UTF-8 files (not UTF-16 LE with BOM, not Big5 / GBK / whatever
 * the system codepage happens to be).
 *
 * This only meaningfully runs on Windows. On Linux / macOS it's a no-op
 * that just reports "skipped".
 *
 * The prefix under test is the one in
 * packages/core/src/services/shellExecutionService.ts →
 * applyPowerShellUtf8Prefix(). Keep the two in sync or this test lies.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (os.platform() !== 'win32') {
  console.log('skipped: not Windows');
  process.exit(0);
}

// Same prefix as applyPowerShellUtf8Prefix(). Copied, not imported, because
// the TS module lives under packages/core/dist and this script stays simple.
const UTF8_PREFIX = [
  '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
  '[Console]::InputEncoding=[System.Text.Encoding]::UTF8',
  '$OutputEncoding=[System.Text.Encoding]::UTF8',
  "$PSDefaultParameterValues['Out-File:Encoding']='utf8'",
  "$PSDefaultParameterValues['Set-Content:Encoding']='utf8'",
  "$PSDefaultParameterValues['Add-Content:Encoding']='utf8'",
].join(';');

const comSpec = process.env['ComSpec'] || '';
const executable = comSpec.toLowerCase().endsWith('powershell.exe') ||
  comSpec.toLowerCase().endsWith('pwsh.exe')
  ? comSpec
  : 'powershell.exe';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen-ps-enc-'));
const fixtures = [
  { name: 'redirect-lt',   path: path.join(tmpDir, 'redirect-lt.txt'),   content: '測試：中文寫入' },
  { name: 'out-file',      path: path.join(tmpDir, 'out-file.txt'),      content: 'カタカナ and emoji 🎉' },
  { name: 'set-content',   path: path.join(tmpDir, 'set-content.txt'),   content: '混合 ABC 日本語 한국어' },
  { name: 'add-content',   path: path.join(tmpDir, 'add-content.txt'),   content: '追加 中文' },
];

// Using single-quoted PowerShell strings so JS escape rules don't fight us.
// Every file is written via a *different* PowerShell mechanism so we exercise
// each of the $PSDefaultParameterValues we set.
const psCommand = `
  '${fixtures[0].content}' > '${fixtures[0].path.replace(/'/g, "''")}';
  '${fixtures[1].content}' | Out-File '${fixtures[1].path.replace(/'/g, "''")}';
  Set-Content -Path '${fixtures[2].path.replace(/'/g, "''")}' -Value '${fixtures[2].content}';
  Set-Content -Path '${fixtures[3].path.replace(/'/g, "''")}' -Value 'seed';
  Add-Content -Path '${fixtures[3].path.replace(/'/g, "''")}' -Value '${fixtures[3].content}';
`;

/** Runs PowerShell with the command (prepended with our UTF-8 prefix). */
function runPs(prefix, body) {
  const full = prefix ? `${prefix};${body}` : body;
  const r = spawnSync(executable, ['-NoProfile', '-Command', full], {
    windowsHide: true,
  });
  if (r.status !== 0) {
    console.error(
      `PowerShell exited with status ${r.status}:`,
      r.stderr?.toString() ?? '',
    );
  }
  return r.status;
}

/** Inspects a file: returns {bom, encoding-guess, content-utf8-decoded}. */
function inspect(filePath) {
  const buf = fs.readFileSync(filePath);
  let bom = null;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) bom = 'UTF-8 BOM';
  else if (buf[0] === 0xff && buf[1] === 0xfe) bom = 'UTF-16 LE BOM';
  else if (buf[0] === 0xfe && buf[1] === 0xff) bom = 'UTF-16 BE BOM';
  // If no BOM, check if it's valid UTF-8 (won't catch sneaky codepages but ok)
  const looksUtf16 = buf.length >= 2 && buf[1] === 0 && buf[0] !== 0; // ASCII-in-UTF16 pattern
  return {
    sizeBytes: buf.length,
    firstBytes: Array.from(buf.slice(0, 6)).map((b) => b.toString(16).padStart(2, '0')).join(' '),
    bom,
    looksUtf16WithoutBom: looksUtf16 && !bom,
    textUtf8: buf.toString('utf8'),
  };
}

function runScenario(label, prefix) {
  console.log(`\n--- ${label} ---`);
  const status = runPs(prefix, psCommand);
  if (status !== 0) {
    console.log(`PowerShell failed (status ${status}) — skipping checks`);
    return { pass: false, failures: ['powershell_failed'] };
  }
  const failures = [];
  for (const f of fixtures) {
    const info = inspect(f.path);
    const expected = f.name === 'add-content'
      ? `seed\r\n${f.content}`  // PowerShell Add-Content adds a newline before appended text
      : f.content;
    // Strip trailing newline that PowerShell appends + a leading BOM char
    // (UTF-8 BOM is the single codepoint U+FEFF when decoded as UTF-8).
    const gotText = info.textUtf8
      .replace(/^\uFEFF/, '')
      .replace(/\r?\n$/, '');
    const contentMatches =
      gotText === expected ||
      gotText.replace(/\r/g, '') === expected.replace(/\r/g, '');
    // Goal: content round-trips cleanly via UTF-8 (PS 5.1's `utf8` means
    // UTF-8 WITH BOM — that's still UTF-8, just with a 3-byte marker —
    // so we accept both "UTF-8 BOM" and "none" as pass, reject UTF-16).
    const encodingOk =
      info.bom !== 'UTF-16 LE BOM' &&
      info.bom !== 'UTF-16 BE BOM' &&
      !info.looksUtf16WithoutBom;
    const ok = contentMatches && encodingOk;
    console.log(
      `  ${ok ? '✓' : '✗'} ${f.name.padEnd(14)} bom=${info.bom ?? 'none'} bytes=${info.firstBytes} text=${JSON.stringify(gotText.slice(0, 40))}`,
    );
    if (!ok) failures.push(f.name);
  }
  return { pass: failures.length === 0, failures };
}

// ─── Scenario A: WITHOUT our prefix (baseline — should be broken) ──────
const baseline = runScenario('baseline (NO prefix — expect broken)', '');

// Wipe files between runs so we see each scenario's output clearly.
for (const f of fixtures) {
  try { fs.unlinkSync(f.path); } catch { /* best effort */ }
}

// ─── Scenario B: WITH our UTF-8 prefix (expect clean UTF-8) ────────────
const withPrefix = runScenario('with UTF-8 prefix (expect clean UTF-8)', UTF8_PREFIX);

// ─── Cleanup ────────────────────────────────────────────────────────────
try {
  for (const f of fixtures) {
    try { fs.unlinkSync(f.path); } catch { /* best effort */ }
  }
  fs.rmdirSync(tmpDir);
} catch { /* best effort */ }

// ─── Verdict ────────────────────────────────────────────────────────────
console.log('\n--- Verdict ---');
console.log(`  Baseline (no prefix) pass: ${baseline.pass}  failures: ${baseline.failures.join(', ') || 'none'}`);
console.log(`  With UTF-8 prefix pass:    ${withPrefix.pass}  failures: ${withPrefix.failures.join(', ') || 'none'}`);

if (withPrefix.pass) {
  console.log('\n✓ Our prefix fixes PowerShell UTF-8 encoding across >, Out-File, Set-Content, Add-Content.');
  process.exit(0);
} else {
  console.log('\n✗ Our prefix is NOT enough — some mechanisms still produce non-UTF-8.');
  process.exit(1);
}
