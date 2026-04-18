/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  parse as parseYaml,
  stringify as stringifyYaml,
} from '../utils/yaml-parser.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { normalizeContent } from '../utils/textUtils.js';
import {
  MemoryError,
  MemoryErrorCode,
  type ListMemoryOptions,
  type MemoryConfig,
  type MemoryScope,
  type MemoryType,
} from './types.js';

const QWEN_CONFIG_DIR = '.qwen';
const MEMORY_DIR = 'memory';
const INDEX_FILENAME = 'MEMORY.md';
const FILE_EXT = '.md';

const debugLogger = createDebugLogger('MEMORY_STORE');

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const VALID_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const TYPE_ORDER: MemoryType[] = [
  'user',
  'feedback',
  'project',
  'decision',
  'reference',
];

const TYPE_LABELS: Record<MemoryType, string> = {
  user: 'User',
  feedback: 'Feedback',
  project: 'Project',
  decision: 'Decisions',
  reference: 'References',
};

/**
 * Always-on guidance shown alongside the memory index. Teaches the agent
 * when to call `memory_write`, when not to, and how to structure entries.
 * Kept short — every session pays this token cost.
 */
const MEMORY_DISCIPLINE = `--- Memory discipline ---

Use \`memory_write\` to save information that helps FUTURE sessions — not information easily re-derived from the project. Individual memory bodies are loaded on demand via \`read_file\`; only the hooks in the index below are always-loaded.

## Save these proactively

- User role, preferences, working habits → type: user
- Corrections or preferences the user gave you → type: feedback, body structured as
  \`\`\`
  The rule in one sentence.
  **Why:** reason (prior incident, strong preference).
  **How to apply:** when this kicks in.
  \`\`\`
- Non-obvious project facts or architectural decisions → type: project or decision
- External system pointers (Linear project, Grafana dashboard URL) → type: reference

## Do NOT save

- Code patterns, file paths, architecture — re-read the repo instead
- Git history or recent changes — \`git log\` / \`git blame\` are authoritative
- Debug steps or one-off fix recipes — the commit message has the context
- Content already in QWEN.md or AGENTS.md
- Current task state — that belongs in plan / tasks, not memory

Apply these exclusions even when the user asks you to save. If unsure, ask: "is this for future sessions or just now?"

## Writing rules

- \`name\`: a stable slug (\`user_role\`, \`feedback_testing\`, \`project_arch\`).
- \`description\`: one line, ≤150 chars. Specific enough that future-you can judge relevance from the hook alone without reading the body.
- Before creating a new memory, scan the index below for a near-duplicate — update the existing entry instead.
- Set \`agent: <name>\` to scope a memory to a single subagent (only loads when that agent is forked).

## Before acting on a recalled memory

Memory is frozen in time. If a memory names a specific file, function, or flag, verify it still exists (grep / read) before recommending action. When you spot stale memory, update or remove it rather than quietly propagate it.

--- End memory discipline ---`;

/**
 * Resolves the base directory for a given memory scope.
 *   user  → ~/.qwen/memory
 *   project → <projectRoot>/.qwen/memory
 *
 * Project root is supplied by the caller (usually `Config.getProjectRoot()`)
 * so the store does not need to run directory walks itself.
 */
function resolveBaseDir(scope: MemoryScope, projectRoot: string): string {
  if (scope === 'user') {
    return path.join(os.homedir(), QWEN_CONFIG_DIR, MEMORY_DIR);
  }
  return path.join(projectRoot, QWEN_CONFIG_DIR, MEMORY_DIR);
}

/**
 * File-backed memory store.
 *
 * Invariants:
 *   - Every memory is a single markdown file with YAML frontmatter. No entries
 *     are stored elsewhere (no DB, no index-only records).
 *   - `MEMORY.md` in each scope is **rebuilt from scratch** on every write/delete
 *     from the current set of files. It is never hand-edited by the agent.
 *   - `listMemories` reads the directory fresh when `force` is set; otherwise
 *     the cache is used.
 */
export class MemoryStore {
  private cache: Map<MemoryScope, MemoryConfig[]> | null = null;

  constructor(private readonly projectRoot: string) {}

  // ─── Read side ──────────────────────────────────────────────

  async listMemories(options: ListMemoryOptions = {}): Promise<MemoryConfig[]> {
    const shouldRefresh = options.force || this.cache === null;
    if (shouldRefresh) {
      await this.refreshCache();
    }

    const scopes: MemoryScope[] = options.scope
      ? [options.scope]
      : ['project', 'user'];

    const out: MemoryConfig[] = [];
    const seen = new Set<string>();
    const agentFilter = options.agent?.toLowerCase();
    for (const scope of scopes) {
      const items = this.cache?.get(scope) ?? [];
      for (const m of items) {
        // Precedence: project overrides user with same name.
        if (seen.has(m.name)) continue;
        if (options.type && m.type !== options.type) continue;
        if (agentFilter !== undefined) {
          if ((m.agent ?? '').toLowerCase() !== agentFilter) continue;
        }
        seen.add(m.name);
        out.push(m);
      }
    }
    return out;
  }

  async loadMemory(
    name: string,
    scope?: MemoryScope,
  ): Promise<MemoryConfig | null> {
    const all = await this.listMemories({ scope });
    return all.find((m) => m.name === name) ?? null;
  }

  // ─── Write side ─────────────────────────────────────────────

  async writeMemory(
    cfg: MemoryConfig,
    options: { overwrite?: boolean } = {},
  ): Promise<MemoryConfig> {
    validateShape(cfg);
    const filePath = this.getMemoryPath(cfg.name, cfg.scope);
    const existingContent = await readFileOrNull(filePath);

    if (existingContent && !options.overwrite) {
      throw new MemoryError(
        `Memory "${cfg.name}" already exists at ${filePath}. Pass overwrite=true to update.`,
        MemoryErrorCode.ALREADY_EXISTS,
        cfg.name,
      );
    }

    const now = Date.now();
    const createdAt = existingContent
      ? (extractCreatedAt(existingContent) ?? now)
      : now;
    const finalCfg: MemoryConfig = {
      ...cfg,
      metadata: {
        ...cfg.metadata,
        filePath,
        createdAt,
        updatedAt: now,
      },
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const serialized = serialize(finalCfg);
    try {
      await fs.writeFile(filePath, serialized, 'utf8');
    } catch (err) {
      throw new MemoryError(
        `Failed to write memory file: ${err instanceof Error ? err.message : String(err)}`,
        MemoryErrorCode.FILE_ERROR,
        cfg.name,
      );
    }

    await this.refreshCache();
    await this.rebuildIndex(cfg.scope);
    return finalCfg;
  }

  async removeMemory(name: string, scope?: MemoryScope): Promise<void> {
    const cfg = await this.loadMemory(name, scope);
    if (!cfg) {
      throw new MemoryError(
        `Memory "${name}" not found`,
        MemoryErrorCode.NOT_FOUND,
        name,
      );
    }
    const filePath = cfg.metadata?.filePath;
    if (!filePath) {
      throw new MemoryError(
        `Memory "${name}" has no file path`,
        MemoryErrorCode.FILE_ERROR,
        name,
      );
    }
    try {
      await fs.unlink(filePath);
    } catch (err) {
      throw new MemoryError(
        `Failed to delete memory file: ${err instanceof Error ? err.message : String(err)}`,
        MemoryErrorCode.FILE_ERROR,
        name,
      );
    }
    await this.refreshCache();
    await this.rebuildIndex(cfg.scope);
  }

  // ─── Index composition (for system-prompt injection) ────────

  /**
   * Returns the memory discipline block followed by the per-scope indexes,
   * each wrapped in context markers. Intended to be appended to the user
   * memory string that ends up in the system prompt (main session and
   * forked subagents alike).
   *
   * The discipline is always included so even a session with zero memories
   * sees the rules for creating the first one; scope blocks only appear
   * when that scope has memories.
   */
  async loadIndexContent(): Promise<string> {
    const blocks: string[] = [MEMORY_DISCIPLINE];
    for (const scope of ['user', 'project'] as const) {
      const indexPath = this.getIndexPath(scope);
      const content = await readFileOrNull(indexPath);
      if (!content) continue;
      const relPath =
        scope === 'user'
          ? '~/.qwen/memory/MEMORY.md'
          : path.relative(this.projectRoot, indexPath).replace(/\\/g, '/');
      blocks.push(
        `--- Memory index (${scope}): ${relPath} ---\n${content.trim()}\n--- End of memory index (${scope}) ---`,
      );
    }
    return blocks.join('\n\n');
  }

  /**
   * Returns memories tagged for a specific agent (both scopes). Used by
   * SubagentManager to inject relevant memories into a forked agent's
   * system prompt.
   */
  async listForAgent(agent: string): Promise<MemoryConfig[]> {
    return this.listMemories({ agent, force: false });
  }

  // ─── Paths ──────────────────────────────────────────────────

  getMemoryPath(name: string, scope: MemoryScope): string {
    return path.join(
      resolveBaseDir(scope, this.projectRoot),
      `${name}${FILE_EXT}`,
    );
  }

  getIndexPath(scope: MemoryScope): string {
    return path.join(resolveBaseDir(scope, this.projectRoot), INDEX_FILENAME);
  }

  // ─── Internal ───────────────────────────────────────────────

  private async refreshCache(): Promise<void> {
    const next = new Map<MemoryScope, MemoryConfig[]>();
    for (const scope of ['user', 'project'] as const) {
      next.set(scope, await this.loadScope(scope));
    }
    this.cache = next;
  }

  private async loadScope(scope: MemoryScope): Promise<MemoryConfig[]> {
    const baseDir = resolveBaseDir(scope, this.projectRoot);
    // Skip project scope when the working tree IS home (avoids duplicating
    // the user-level memory dir as if it were project-level).
    if (
      scope === 'project' &&
      path.resolve(this.projectRoot) === path.resolve(os.homedir())
    ) {
      return [];
    }

    let entries: string[];
    try {
      entries = await fs.readdir(baseDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    const out: MemoryConfig[] = [];
    for (const entry of entries) {
      if (entry === INDEX_FILENAME) continue;
      if (!entry.endsWith(FILE_EXT)) continue;
      const filePath = path.join(baseDir, entry);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const cfg = parseContent(raw, filePath, scope);
        out.push(cfg);
      } catch (err) {
        debugLogger.warn(
          `Skipping invalid memory file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return out;
  }

  private async rebuildIndex(scope: MemoryScope): Promise<void> {
    const memories = (this.cache?.get(scope) ?? []).slice();
    const indexPath = this.getIndexPath(scope);

    if (memories.length === 0) {
      // Remove a now-empty index rather than leave a stale file.
      try {
        await fs.unlink(indexPath);
      } catch {
        // Index may not exist yet — ignore.
      }
      return;
    }

    memories.sort((a, b) => {
      const ta = TYPE_ORDER.indexOf(a.type);
      const tb = TYPE_ORDER.indexOf(b.type);
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    });

    const lines: string[] = [
      '# Memory Index',
      '',
      'Entries below live in `.qwen/memory/<name>.md`. Load a specific memory on demand with `read_file` when the hook matches the current task.',
      '',
    ];
    let currentType: MemoryType | null = null;
    for (const m of memories) {
      if (m.type !== currentType) {
        if (currentType !== null) lines.push('');
        lines.push(`## ${TYPE_LABELS[m.type]}`);
        currentType = m.type;
      }
      const link = `./${m.name}${FILE_EXT}`;
      const agent = m.agent ? ` [agent:${m.agent}]` : '';
      const title = m.title ?? humanize(m.name);
      lines.push(`- [${title}](${link})${agent} — ${m.description}`);
    }
    lines.push('');

    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, lines.join('\n'), 'utf8');
  }
}

// ─── Module-level helpers ─────────────────────────────────────

function validateShape(cfg: MemoryConfig): void {
  if (!cfg.name || !VALID_NAME_RE.test(cfg.name)) {
    throw new MemoryError(
      `Invalid memory name "${cfg.name}" — use letters/digits/dot/dash/underscore; must start alphanumerically`,
      MemoryErrorCode.INVALID_CONFIG,
      cfg.name,
    );
  }
  if (cfg.name === 'MEMORY') {
    throw new MemoryError(
      'Memory name "MEMORY" is reserved for the index file',
      MemoryErrorCode.INVALID_CONFIG,
      cfg.name,
    );
  }
  if (!cfg.description || cfg.description.trim().length === 0) {
    throw new MemoryError(
      `Memory "${cfg.name}" missing description`,
      MemoryErrorCode.INVALID_CONFIG,
      cfg.name,
    );
  }
  if (cfg.description.length > 200) {
    throw new MemoryError(
      `Memory "${cfg.name}" description is too long (${cfg.description.length} chars; max 200)`,
      MemoryErrorCode.INVALID_CONFIG,
      cfg.name,
    );
  }
  if (!TYPE_ORDER.includes(cfg.type)) {
    throw new MemoryError(
      `Memory "${cfg.name}" has unknown type "${cfg.type}"`,
      MemoryErrorCode.INVALID_CONFIG,
      cfg.name,
    );
  }
  if (cfg.scope !== 'user' && cfg.scope !== 'project') {
    throw new MemoryError(
      `Memory "${cfg.name}" has unknown scope "${cfg.scope}"`,
      MemoryErrorCode.INVALID_CONFIG,
      cfg.name,
    );
  }
  if (!cfg.content || cfg.content.trim().length === 0) {
    throw new MemoryError(
      `Memory "${cfg.name}" has empty content`,
      MemoryErrorCode.INVALID_CONFIG,
      cfg.name,
    );
  }
}

function parseContent(
  raw: string,
  filePath: string,
  scope: MemoryScope,
): MemoryConfig {
  const normalized = normalizeContent(raw);
  const match = normalized.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error('missing YAML frontmatter');
  }
  const [, yamlBody, body] = match;
  const fm = parseYaml(yamlBody) as Record<string, unknown>;
  const fileBase = path.basename(filePath, FILE_EXT);
  const name = String(fm['name'] ?? fileBase);
  const description =
    typeof fm['description'] === 'string' ? fm['description'] : '';
  const type = fm['type'] as MemoryType | undefined;
  if (!type || !TYPE_ORDER.includes(type)) {
    throw new Error(`invalid or missing type: ${String(type)}`);
  }
  const title = typeof fm['title'] === 'string' ? fm['title'] : undefined;
  const agent = typeof fm['agent'] === 'string' ? fm['agent'] : undefined;
  const createdAt =
    typeof fm['createdAt'] === 'number'
      ? (fm['createdAt'] as number)
      : undefined;
  const updatedAt =
    typeof fm['updatedAt'] === 'number'
      ? (fm['updatedAt'] as number)
      : undefined;
  return {
    name,
    title,
    description,
    type,
    scope,
    agent,
    content: body.trim(),
    metadata: { filePath, createdAt, updatedAt },
  };
}

function serialize(cfg: MemoryConfig): string {
  const fm: Record<string, unknown> = {
    name: cfg.name,
    description: cfg.description,
    type: cfg.type,
    scope: cfg.scope,
  };
  if (cfg.title) fm['title'] = cfg.title;
  if (cfg.agent) fm['agent'] = cfg.agent;
  if (cfg.metadata?.createdAt) fm['createdAt'] = cfg.metadata.createdAt;
  if (cfg.metadata?.updatedAt) fm['updatedAt'] = cfg.metadata.updatedAt;
  const yaml = stringifyYaml(fm, { lineWidth: 0, minContentWidth: 0 }).trim();
  return `---\n${yaml}\n---\n\n${cfg.content.trim()}\n`;
}

function extractCreatedAt(raw: string): number | null {
  const normalized = normalizeContent(raw);
  const match = normalized.match(FRONTMATTER_RE);
  if (!match) return null;
  try {
    const fm = parseYaml(match[1]) as Record<string, unknown>;
    const v = fm['createdAt'];
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function humanize(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
