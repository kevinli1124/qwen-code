#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * convert-claude-skills.mjs
 *
 * Batch-convert a folder of Claude Code-style skills into Qwen-native form.
 *
 * Each skill is a directory containing SKILL.md. This script walks the source
 * root, parses frontmatter, normalizes the Claude-specific fields (`allowed-
 * tools` → `allowedTools` with PascalCase → snake_case tool names), and writes
 * the result. Sibling files and sub-directories (`scripts/`, `references/`,
 * `assets/`, …) are copied verbatim.
 *
 * Usage:
 *   node scripts/convert-claude-skills.mjs <source>                  # preview
 *   node scripts/convert-claude-skills.mjs <source> --out=<dest>     # copy
 *   node scripts/convert-claude-skills.mjs <source> --in-place       # rewrite
 *   node scripts/convert-claude-skills.mjs <source> --out=<dest> --dry-run
 *
 * Note: the Qwen runtime also auto-migrates Claude frontmatter on load, so
 * running this script is optional — it only helps if you want the files on
 * disk to be canonical Qwen form (e.g. for committing into version control).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const positional = args.filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);

const sourceRoot = positional[0];
if (!sourceRoot) {
  console.error('error: missing <source> argument');
  process.exit(2);
}

const inPlace = Boolean(flags['in-place']);
const outRoot = typeof flags['out'] === 'string' ? flags['out'] : null;
const dryRun = Boolean(flags['dry-run']);

if (!inPlace && !outRoot) {
  console.error(
    'error: provide either --in-place or --out=<dest>. Use --dry-run to preview.',
  );
  process.exit(2);
}
if (inPlace && outRoot) {
  console.error('error: --in-place and --out are mutually exclusive.');
  process.exit(2);
}

// Load the compat shim from the built core package. Prefer dist (post-build);
// fall back to the TypeScript source via tsx (dev mode).
const compat = await loadCompatModule();

await main();

async function main() {
  const stat = await fs.stat(sourceRoot).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    console.error(`error: ${sourceRoot} is not a directory`);
    process.exit(2);
  }

  const skills = await discoverSkills(sourceRoot);
  if (skills.length === 0) {
    console.log(`No SKILL.md files found under ${sourceRoot}.`);
    return;
  }

  console.log(
    `Found ${skills.length} skill${skills.length === 1 ? '' : 's'} under ${sourceRoot}`,
  );
  console.log(`Mode: ${inPlace ? 'in-place' : `copy to ${outRoot}`}${dryRun ? ' (dry-run)' : ''}`);
  console.log('');

  let migratedCount = 0;
  let unchangedCount = 0;
  const report = [];

  for (const skill of skills) {
    const { relDir, manifestPath } = skill;
    const raw = await fs.readFile(manifestPath, 'utf8');
    const result = migrateManifest(raw);

    if (result.migrated) migratedCount++;
    else unchangedCount++;

    const destDir = inPlace
      ? path.join(sourceRoot, relDir)
      : path.join(outRoot, relDir);
    const destManifest = path.join(destDir, 'SKILL.md');

    report.push({
      skill: relDir,
      migrated: result.migrated,
      notes: result.notes,
    });

    if (dryRun) continue;

    if (!inPlace) {
      await fs.mkdir(destDir, { recursive: true });
      await copyTree(path.join(sourceRoot, relDir), destDir, ['SKILL.md']);
    }
    await fs.writeFile(destManifest, result.content, 'utf8');
  }

  console.log('--- Report ---');
  for (const r of report) {
    const tag = r.migrated ? '[migrated]' : '[unchanged]';
    console.log(`${tag} ${r.skill}`);
    for (const n of r.notes) console.log(`    · ${n}`);
  }
  console.log('');
  console.log(
    `Summary: ${migratedCount} migrated, ${unchangedCount} already Qwen-native${dryRun ? ' (dry-run, no files written)' : ''}.`,
  );
}

async function discoverSkills(root) {
  const results = [];
  async function walk(dir, relBase) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const hasManifest = entries.some(
      (e) => e.isFile() && e.name === 'SKILL.md',
    );
    if (hasManifest) {
      results.push({
        relDir: relBase,
        manifestPath: path.join(dir, 'SKILL.md'),
      });
      // Don't recurse below a skill — nested skills are unusual.
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        await walk(path.join(dir, e.name), path.join(relBase, e.name));
      }
    }
  }
  await walk(root, '');
  return results;
}

/**
 * Rewrite a single SKILL.md string. Re-serializes the frontmatter from the
 * parsed AST so field names and values are guaranteed canonical, and appends
 * the body unchanged.
 */
function migrateManifest(raw) {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) {
    return {
      content: raw,
      migrated: false,
      notes: ['No YAML frontmatter found — skipped.'],
    };
  }

  const [, fmYaml, body] = match;
  const parsed = compat.parseYaml(fmYaml);
  const { frontmatter, migrated, notes } = compat.normalizeClaudeFrontmatter(
    parsed,
  );

  if (!migrated) {
    return { content: raw, migrated: false, notes: ['Already Qwen-native.'] };
  }

  const serialized = compat.stringifyYaml(frontmatter).trimEnd();
  const content = `---\n${serialized}\n---\n${body.startsWith('\n') ? body.slice(1) : body}`;
  return { content, migrated: true, notes };
}

async function copyTree(src, dst, skipNames = []) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (skipNames.includes(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      await fs.mkdir(d, { recursive: true });
      await copyTree(s, d);
    } else if (e.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

async function loadCompatModule() {
  // Try built dist first (production path).
  const distCompat = path.resolve(
    'packages/core/dist/src/skills/claude-compat.js',
  );
  const distYaml = path.resolve('packages/core/dist/src/utils/yaml-parser.js');
  try {
    await fs.access(distCompat);
    const compatMod = await import(pathToFileURL(distCompat).href);
    const yamlMod = await import(pathToFileURL(distYaml).href);
    return {
      normalizeClaudeFrontmatter: compatMod.normalizeClaudeFrontmatter,
      parseYaml: yamlMod.parse,
      stringifyYaml: yamlMod.stringify,
    };
  } catch {
    // Fall through to tsx path.
  }

  // Fallback: load TypeScript source via tsx. User must have tsx on PATH
  // (it's a devDependency of this repo).
  console.error(
    'Built `packages/core/dist` not found. Run `npm run build` first, ' +
      'or re-invoke this script under tsx:',
  );
  console.error('  npx tsx scripts/convert-claude-skills.mjs <source> ...');
  process.exit(2);
}

function printHelp() {
  console.log(`convert-claude-skills — rewrite Claude Code-style skills in Qwen form

Usage:
  node scripts/convert-claude-skills.mjs <source> --out=<dest>
  node scripts/convert-claude-skills.mjs <source> --in-place
  node scripts/convert-claude-skills.mjs <source> --out=<dest> --dry-run

Options:
  --out=<dir>    Write converted skills to <dir> (preserves source).
  --in-place     Rewrite skills under <source> directly.
  --dry-run      Print a report without writing any files.
  -h, --help     Show this message.

Notes:
  - Each skill must be a directory containing SKILL.md.
  - Sibling files (scripts/, references/, assets/) are copied verbatim.
  - The Qwen runtime auto-migrates at load time, so running this script is
    optional. Use it when you want the on-disk form to be canonical.
`);
}
