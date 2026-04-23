#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Compare two capability runs side-by-side. Each run directory must contain
 * a scorecard.json produced by runner.mjs.
 *
 * Usage:
 *   node tests/capability/diff-runs.mjs <runA> <runB> [--out=<report.md>]
 *
 * Example:
 *   node tests/capability/diff-runs.mjs \
 *     tests/capability/runs/2026-04-23-001234-profile-fork \
 *     tests/capability/runs/2026-04-23-014321-profile-qwen-native
 */

import fs from 'node:fs';
import path from 'node:path';

function loadScorecard(dir) {
  const p = path.join(dir, 'scorecard.json');
  if (!fs.existsSync(p)) {
    throw new Error(`scorecard not found: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/**
 * Expand a glob-ish argument like "tests/capability/runs/*qwen35-fork" into
 * a concrete directory. Windows cmd.exe does NOT expand `*`, so the argv
 * contains the literal pattern — handle it here so the same command line
 * works under bash / PowerShell / cmd without quoting tricks.
 *
 * When multiple matches exist, pick the most recent (by mtime) and warn.
 */
function resolveRunDir(arg) {
  if (!arg.includes('*')) {
    if (!fs.existsSync(arg)) {
      throw new Error(`run directory not found: ${arg}`);
    }
    return arg;
  }
  const dir = path.dirname(arg);
  const patternSuffix = path.basename(arg).replace(/\*/g, '');
  if (!fs.existsSync(dir)) {
    throw new Error(`runs parent directory missing: ${dir}`);
  }
  const candidates = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.includes(patternSuffix))
    .map((e) => {
      const full = path.join(dir, e.name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) {
    throw new Error(`no run directory matching "${arg}"`);
  }
  if (candidates.length > 1) {
    console.warn(
      `[diff-runs] pattern "${arg}" matched ${candidates.length} dirs; using most recent: ${candidates[0].full}`,
    );
  }
  return candidates[0].full;
}

function byId(card) {
  const m = new Map();
  for (const r of card.results) m.set(r.id, r);
  return m;
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    'Usage: diff-runs.mjs <runDirA> <runDirB> [--out=<path.md>]',
  );
  process.exit(1);
}
const [rawA, rawB] = args;
const outArg = args.find((a) => a.startsWith('--out='));
const outPath = outArg ? outArg.slice(6) : undefined;

const runA = resolveRunDir(rawA);
const runB = resolveRunDir(rawB);

const cardA = loadScorecard(runA);
const cardB = loadScorecard(runB);
const mapA = byId(cardA);
const mapB = byId(cardB);
const ids = [...new Set([...mapA.keys(), ...mapB.keys()])].sort();

function fmt(r) {
  if (!r) return { cell: '—', total: null, verdict: 'MISS' };
  return {
    cell: `${r.verdict} ${r.total}/12`,
    total: r.total,
    verdict: r.verdict,
  };
}

const lines = [];
lines.push(`# Diff · ${cardA.label} vs ${cardB.label}`);
lines.push('');
lines.push(`- A: \`${runA}\` (${cardA.ts})`);
lines.push(`- B: \`${runB}\` (${cardB.ts})`);
lines.push('');
lines.push(`| id | layer | A (${cardA.label}) | B (${cardB.label}) | Δ | notes (A / B) |`);
lines.push(`|----|-------|------|------|---|----------------|`);

let sumA = 0,
  sumB = 0,
  countA = 0,
  countB = 0,
  regressed = [],
  improved = [];

for (const id of ids) {
  const a = mapA.get(id);
  const b = mapB.get(id);
  const A = fmt(a);
  const B = fmt(b);
  const delta =
    A.total !== null && B.total !== null ? B.total - A.total : null;
  const deltaStr =
    delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`;
  const layer = a?.layer ?? b?.layer ?? '—';
  const notesA = a?.score?.notes ?? '';
  const notesB = b?.score?.notes ?? '';
  lines.push(
    `| ${id} | ${layer} | ${A.cell} | ${B.cell} | ${deltaStr} | ${notesA} / ${notesB} |`,
  );
  if (a?.total != null) {
    sumA += a.total;
    countA++;
  }
  if (b?.total != null) {
    sumB += b.total;
    countB++;
  }
  if (delta !== null) {
    if (delta < 0) regressed.push({ id, delta, layer });
    else if (delta > 0) improved.push({ id, delta, layer });
  }
}

lines.push('');
lines.push('## Summary');
const avgA = countA ? (sumA / countA).toFixed(2) : '—';
const avgB = countB ? (sumB / countB).toFixed(2) : '—';
lines.push(`- A average: **${avgA} / 12** across ${countA} tests`);
lines.push(`- B average: **${avgB} / 12** across ${countB} tests`);
const passA = [...mapA.values()].filter((r) => r.verdict === 'PASS').length;
const passB = [...mapB.values()].filter((r) => r.verdict === 'PASS').length;
lines.push(`- A pass rate: ${passA}/${countA}`);
lines.push(`- B pass rate: ${passB}/${countB}`);

if (regressed.length) {
  lines.push('');
  lines.push(`### 🔻 Regressed in B (${regressed.length})`);
  for (const r of regressed) lines.push(`- ${r.id} (${r.layer}): ${r.delta}`);
}
if (improved.length) {
  lines.push('');
  lines.push(`### 🔺 Improved in B (${improved.length})`);
  for (const r of improved) lines.push(`- ${r.id} (${r.layer}): +${r.delta}`);
}
if (!regressed.length && !improved.length) {
  lines.push('');
  lines.push('### ✅ No score deltas (identical performance)');
}

// Per-layer summary
const layers = [...new Set(ids.map((id) => mapA.get(id)?.layer ?? mapB.get(id)?.layer))]
  .filter(Boolean)
  .sort();
lines.push('');
lines.push('### Per-layer averages');
lines.push('| layer | A avg | B avg | Δ |');
lines.push('|-------|-------|-------|---|');
for (const L of layers) {
  const rowsA = [...mapA.values()].filter((r) => r.layer === L && r.total != null);
  const rowsB = [...mapB.values()].filter((r) => r.layer === L && r.total != null);
  const avgLA = rowsA.length
    ? (rowsA.reduce((a, r) => a + r.total, 0) / rowsA.length).toFixed(2)
    : '—';
  const avgLB = rowsB.length
    ? (rowsB.reduce((a, r) => a + r.total, 0) / rowsB.length).toFixed(2)
    : '—';
  const dL =
    typeof avgLA === 'string' && typeof avgLB === 'string'
      ? (Number(avgLB) - Number(avgLA)).toFixed(2)
      : '—';
  lines.push(`| ${L} | ${avgLA} | ${avgLB} | ${dL} |`);
}

const report = lines.join('\n') + '\n';
if (outPath) {
  fs.writeFileSync(outPath, report);
  console.log(`wrote ${outPath}`);
} else {
  console.log(report);
}
