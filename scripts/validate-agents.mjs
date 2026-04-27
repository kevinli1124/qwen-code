#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Static validator for agent definition files (.qwen/agents/*.md).
 *
 * Checks YAML frontmatter schema without running the CLI or making LLM calls.
 * Runs against project-level and user-level agent directories.
 *
 * Usage:
 *   node scripts/validate-agents.mjs              # validate project + user dirs
 *   node scripts/validate-agents.mjs --dir <path> # validate a specific dir
 *   node scripts/validate-agents.mjs --strict      # exit 1 on warnings too
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ── YAML frontmatter parser ────────────────────────────────────────────────

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const yaml = match[1];
  const body = match[2] ?? '';
  const data = {};
  let currentKey = null;
  let listKey = null;
  let multiline = '';

  for (const rawLine of yaml.split(/\r?\n/)) {
    // Array item
    if (/^\s+-\s+/.test(rawLine) && listKey !== null) {
      data[listKey] = data[listKey] ?? [];
      data[listKey].push(rawLine.replace(/^\s+-\s+/, '').replace(/^['"]|['"]$/g, ''));
      continue;
    }
    listKey = null;

    const kv = rawLine.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (kv) {
      if (currentKey && multiline.trim()) {
        data[currentKey] = multiline.trim();
      }
      currentKey = kv[1];
      const val = kv[2].trim();
      if (val === '' || val === '|' || val === '>') {
        multiline = '';
        listKey = currentKey;
      } else {
        data[currentKey] = val.replace(/^['"]|['"]$/g, '');
        multiline = '';
        currentKey = null;
      }
    } else if (currentKey && rawLine.startsWith('  ')) {
      multiline += ' ' + rawLine.trim();
    }
  }
  if (currentKey && multiline.trim()) {
    data[currentKey] = multiline.trim();
  }

  return { frontmatter: data, body: body.trim() };
}

// ── Known valid tool names ─────────────────────────────────────────────────

export const KNOWN_TOOLS = new Set([
  'read_file', 'write_file', 'edit', 'multi_edit',
  'grep_search', 'glob', 'list_directory', 'get_file_info',
  'run_shell_command', 'web_fetch', 'web_search',
  'computer', 'ask_user_question',
  'lsp', 'lsp_diagnostics',
  'memory_write', 'memory_read', 'skill',
  'find_files',
]);

const VALID_APPROVAL_MODES = new Set(['default', 'plan', 'auto-edit', 'yolo']);
const AGENT_NAME_RE = /^[a-z][a-z0-9-]*$/;

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a parsed agent definition.
 * Returns { errors: string[], warnings: string[] }.
 */
export function validateAgentDefinition(filePath, parsed) {
  const errors = [];
  const warnings = [];
  const { frontmatter: fm, body } = parsed;

  // Required: name
  if (!fm.name || typeof fm.name !== 'string' || !fm.name.trim()) {
    errors.push('frontmatter.name is required and must be a non-empty string');
  } else if (!AGENT_NAME_RE.test(fm.name.trim())) {
    errors.push(
      `frontmatter.name "${fm.name}" must be lowercase alphanumeric with hyphens (e.g. "my-agent")`,
    );
  } else {
    const baseName = path.basename(filePath, '.md');
    if (fm.name.trim() !== baseName) {
      warnings.push(
        `frontmatter.name "${fm.name}" does not match filename "${baseName}.md"`,
      );
    }
  }

  // Required: description
  if (!fm.description || (typeof fm.description === 'string' && !fm.description.trim())) {
    errors.push('frontmatter.description is required and must be non-empty');
  }

  // Optional: tools
  if (fm.tools !== undefined) {
    if (!Array.isArray(fm.tools)) {
      errors.push('frontmatter.tools must be an array');
    } else {
      const nonStrings = fm.tools.filter((t) => typeof t !== 'string');
      if (nonStrings.length > 0) {
        errors.push('frontmatter.tools entries must all be strings');
      }
      const unknown = fm.tools.filter((t) => typeof t === 'string' && !KNOWN_TOOLS.has(t));
      if (unknown.length > 0) {
        warnings.push(`frontmatter.tools contains unknown tool name(s): ${unknown.join(', ')}`);
      }
    }
  }

  // Optional: disallowedTools
  if (fm.disallowedTools !== undefined && !Array.isArray(fm.disallowedTools)) {
    errors.push('frontmatter.disallowedTools must be an array');
  }

  // Optional: approvalMode
  if (fm.approvalMode !== undefined && !VALID_APPROVAL_MODES.has(fm.approvalMode)) {
    errors.push(
      `frontmatter.approvalMode "${fm.approvalMode}" must be one of: ${[...VALID_APPROVAL_MODES].join(', ')}`,
    );
  }

  // Optional: model
  if (fm.model !== undefined && typeof fm.model !== 'string') {
    errors.push('frontmatter.model must be a string');
  }

  // System prompt presence
  if (!body) {
    warnings.push('System prompt (content after frontmatter) is empty');
  } else if (body.length < 50) {
    warnings.push(`System prompt is very short (${body.length} chars) — add more guidance`);
  }

  return { errors, warnings };
}

/**
 * Validate a single agent file by path.
 * Returns { errors, warnings } or throws if the file cannot be read.
 */
export function validateAgentFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(content);
  if (!parsed) {
    return {
      errors: ['Missing or malformed YAML frontmatter (expected --- block at top of file)'],
      warnings: [],
    };
  }
  return validateAgentDefinition(filePath, parsed);
}

// ── Directory scanner ──────────────────────────────────────────────────────

function scanDir(dir, label) {
  if (!fs.existsSync(dir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => ({ file: path.join(dir, f), label }));
}

// ── Main (CLI entrypoint) ──────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const dirIdx = args.indexOf('--dir');
  const customDir = dirIdx !== -1 ? args[dirIdx + 1] : null;

  const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

  let targets = [];
  if (customDir) {
    targets = scanDir(customDir, 'custom');
  } else {
    targets = [
      ...scanDir(path.join(repoRoot, '.qwen', 'agents'), 'project'),
      ...scanDir(path.join(os.homedir(), '.qwen', 'agents'), 'user'),
    ];
  }

  if (targets.length === 0) {
    console.log('No agent files found.');
    process.exit(0);
  }

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const { file, label } of targets) {
    const tag = `[${label}] ${path.basename(file)}`;
    let result;
    try {
      result = validateAgentFile(file);
    } catch (err) {
      console.error(`${tag}: ERROR — cannot read file: ${err.message}`);
      totalErrors++;
      continue;
    }

    const { errors, warnings } = result;
    if (errors.length === 0 && warnings.length === 0) {
      console.log(`${tag}: OK`);
      continue;
    }
    for (const e of errors) {
      console.error(`${tag}: ERROR — ${e}`);
      totalErrors++;
    }
    for (const w of warnings) {
      console.warn(`${tag}: WARN  — ${w}`);
      totalWarnings++;
    }
  }

  console.log('');
  console.log(
    `Result: ${targets.length} file(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`,
  );

  if (totalErrors > 0 || (strict && totalWarnings > 0)) {
    process.exit(1);
  }
}
