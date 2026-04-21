/**
 * @license
 * Copyright 2026 Qwen Team
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
  EpisodeError,
  EpisodeErrorCode,
  totalScore,
  type EpisodeConfig,
  type EpisodeOutcome,
  type EpisodeScores,
  type EpisodeToolStat,
  type ListEpisodeOptions,
} from './types.js';

const QWEN_CONFIG_DIR = '.qwen';
const EPISODE_DIR = 'episodes';
const FILE_EXT = '.md';
const ARCHIVE_DIR = 'archived';

const debugLogger = createDebugLogger('EPISODE_STORE');

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const VALID_OUTCOMES: EpisodeOutcome[] = [
  'success',
  'partial',
  'failed',
  'cancelled',
];

/**
 * Resolves the base directory for episode storage.
 *
 * Episodes are always user-scoped (under `~/.qwen/episodes/`) because they
 * are cross-project records of task patterns. Distillation later may produce
 * project-scoped memories from these episodes.
 */
function resolveBaseDir(): string {
  return path.join(os.homedir(), QWEN_CONFIG_DIR, EPISODE_DIR);
}

function resolveArchiveDir(): string {
  return path.join(resolveBaseDir(), ARCHIVE_DIR);
}

/**
 * File-backed episode store.
 *
 * Invariants:
 *   - Each episode is one markdown file with YAML frontmatter, named
 *     `<id>.md` where id is unique (typically ISO-like timestamp + slug).
 *   - The cache is refreshed on write/remove and on-demand via `force`.
 *   - Retention cleanup moves expired episodes to `archived/` rather than
 *     deleting, so nothing is ever lost.
 */
export class EpisodeStore {
  private cache: EpisodeConfig[] | null = null;

  // ─── Read side ──────────────────────────────────────────────

  async listEpisodes(
    options: ListEpisodeOptions = {},
  ): Promise<EpisodeConfig[]> {
    if (options.force || this.cache === null) {
      await this.refreshCache();
    }
    let items = (this.cache ?? []).slice();

    if (options.outcome) {
      items = items.filter((e) => e.outcome === options.outcome);
    }
    if (options.tags && options.tags.length > 0) {
      const wanted = new Set(options.tags.map((t) => t.toLowerCase()));
      items = items.filter((e) =>
        e.tags.some((t) => wanted.has(t.toLowerCase())),
      );
    }
    if (options.minScore !== undefined) {
      items = items.filter((e) => totalScore(e.scores) >= options.minScore!);
    }
    if (options.sinceIso) {
      items = items.filter((e) => e.timestamp >= options.sinceIso!);
    }

    // Newest first.
    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return items;
  }

  async loadEpisode(id: string): Promise<EpisodeConfig | null> {
    const all = await this.listEpisodes();
    return all.find((e) => e.id === id) ?? null;
  }

  async count(options: ListEpisodeOptions = {}): Promise<number> {
    const items = await this.listEpisodes(options);
    return items.length;
  }

  // ─── Write side ─────────────────────────────────────────────

  async writeEpisode(
    cfg: EpisodeConfig,
    options: { overwrite?: boolean } = {},
  ): Promise<EpisodeConfig> {
    validateShape(cfg);
    const filePath = this.getEpisodePath(cfg.id);
    const existing = await readFileOrNull(filePath);
    if (existing && !options.overwrite) {
      throw new EpisodeError(
        `Episode "${cfg.id}" already exists at ${filePath}. Pass overwrite=true to update.`,
        EpisodeErrorCode.ALREADY_EXISTS,
        cfg.id,
      );
    }

    const now = Date.now();
    const createdAt = existing ? (extractCreatedAt(existing) ?? now) : now;
    const finalCfg: EpisodeConfig = {
      ...cfg,
      metadata: {
        ...cfg.metadata,
        filePath,
        createdAt,
      },
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const serialized = serialize(finalCfg);
    try {
      await fs.writeFile(filePath, serialized, 'utf8');
    } catch (err) {
      throw new EpisodeError(
        `Failed to write episode file: ${err instanceof Error ? err.message : String(err)}`,
        EpisodeErrorCode.FILE_ERROR,
        cfg.id,
      );
    }

    await this.refreshCache();
    return finalCfg;
  }

  async removeEpisode(id: string): Promise<void> {
    const cfg = await this.loadEpisode(id);
    if (!cfg) {
      throw new EpisodeError(
        `Episode "${id}" not found`,
        EpisodeErrorCode.NOT_FOUND,
        id,
      );
    }
    const filePath = cfg.metadata?.filePath;
    if (!filePath) {
      throw new EpisodeError(
        `Episode "${id}" has no file path`,
        EpisodeErrorCode.FILE_ERROR,
        id,
      );
    }
    try {
      await fs.unlink(filePath);
    } catch (err) {
      throw new EpisodeError(
        `Failed to delete episode file: ${err instanceof Error ? err.message : String(err)}`,
        EpisodeErrorCode.FILE_ERROR,
        id,
      );
    }
    await this.refreshCache();
  }

  /**
   * Archive episodes older than `retentionDays`. Archived files are moved to
   * `~/.qwen/episodes/archived/` rather than deleted. Returns archived count.
   *
   * Pass retentionDays <= 0 to disable (no-op).
   */
  async archiveExpired(retentionDays: number): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const all = await this.listEpisodes({ force: true });
    let moved = 0;
    for (const ep of all) {
      const ts = Date.parse(ep.timestamp);
      if (!Number.isFinite(ts) || ts >= cutoff) continue;
      const src = ep.metadata?.filePath;
      if (!src) continue;
      try {
        const destDir = resolveArchiveDir();
        await fs.mkdir(destDir, { recursive: true });
        const dest = path.join(destDir, `${ep.id}${FILE_EXT}`);
        await fs.rename(src, dest);
        moved++;
      } catch (err) {
        debugLogger.warn(
          `Failed to archive episode ${ep.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (moved > 0) await this.refreshCache();
    return moved;
  }

  // ─── Paths ──────────────────────────────────────────────────

  getEpisodePath(id: string): string {
    return path.join(resolveBaseDir(), `${id}${FILE_EXT}`);
  }

  getBaseDir(): string {
    return resolveBaseDir();
  }

  // ─── Internal ───────────────────────────────────────────────

  private async refreshCache(): Promise<void> {
    const baseDir = resolveBaseDir();
    let entries: string[];
    try {
      entries = await fs.readdir(baseDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = [];
        return;
      }
      throw err;
    }

    const out: EpisodeConfig[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(FILE_EXT)) continue;
      const filePath = path.join(baseDir, entry);
      // Skip directories (e.g., archived/).
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const cfg = parseContent(raw, filePath);
        out.push(cfg);
      } catch (err) {
        debugLogger.warn(
          `Skipping invalid episode file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.cache = out;
  }
}

// ─── Module-level helpers ─────────────────────────────────────

function validateShape(cfg: EpisodeConfig): void {
  if (!cfg.id || !VALID_ID_RE.test(cfg.id)) {
    throw new EpisodeError(
      `Invalid episode id "${cfg.id}" — use letters/digits/dot/dash/underscore; must start alphanumerically`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (!cfg.title || cfg.title.trim().length === 0) {
    throw new EpisodeError(
      `Episode "${cfg.id}" missing title`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (cfg.title.length > 200) {
    throw new EpisodeError(
      `Episode "${cfg.id}" title too long (${cfg.title.length} chars; max 200)`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (!cfg.timestamp || Number.isNaN(Date.parse(cfg.timestamp))) {
    throw new EpisodeError(
      `Episode "${cfg.id}" has invalid timestamp`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (!Number.isFinite(cfg.durationMins) || cfg.durationMins < 0) {
    throw new EpisodeError(
      `Episode "${cfg.id}" has invalid durationMins`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (!Number.isFinite(cfg.toolCalls) || cfg.toolCalls < 0) {
    throw new EpisodeError(
      `Episode "${cfg.id}" has invalid toolCalls`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (!VALID_OUTCOMES.includes(cfg.outcome)) {
    throw new EpisodeError(
      `Episode "${cfg.id}" has unknown outcome "${cfg.outcome}"`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  validateScores(cfg.scores, cfg.id);
  if (!Array.isArray(cfg.tags)) {
    throw new EpisodeError(
      `Episode "${cfg.id}" tags must be an array`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (!cfg.content || cfg.content.trim().length === 0) {
    throw new EpisodeError(
      `Episode "${cfg.id}" has empty content`,
      EpisodeErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
}

function validateScores(scores: EpisodeScores, id: string): void {
  const keys: Array<keyof EpisodeScores> = [
    'novelty',
    'reusability',
    'complexity',
    'outcome',
  ];
  for (const k of keys) {
    const v = scores[k];
    if (!Number.isFinite(v) || v < 0 || v > 3) {
      throw new EpisodeError(
        `Episode "${id}" scores.${k} must be between 0 and 3 (got ${v})`,
        EpisodeErrorCode.INVALID_CONFIG,
        id,
      );
    }
  }
}

function parseContent(raw: string, filePath: string): EpisodeConfig {
  const normalized = normalizeContent(raw);
  const match = normalized.match(FRONTMATTER_RE);
  if (!match) throw new Error('missing YAML frontmatter');
  const [, yamlBody, body] = match;
  const fm = parseYaml(yamlBody) as Record<string, unknown>;

  const fileBase = path.basename(filePath, FILE_EXT);
  const id = String(fm['id'] ?? fileBase);
  const title = typeof fm['title'] === 'string' ? fm['title'] : id;
  const timestamp =
    typeof fm['timestamp'] === 'string'
      ? fm['timestamp']
      : new Date(0).toISOString();
  const durationMins =
    typeof fm['durationMins'] === 'number' ? fm['durationMins'] : 0;
  const toolCalls = typeof fm['toolCalls'] === 'number' ? fm['toolCalls'] : 0;
  const outcomeRaw = fm['outcome'];
  const outcome: EpisodeOutcome = VALID_OUTCOMES.includes(
    outcomeRaw as EpisodeOutcome,
  )
    ? (outcomeRaw as EpisodeOutcome)
    : 'partial';
  const tags = Array.isArray(fm['tags'])
    ? (fm['tags'] as unknown[]).filter(
        (t): t is string => typeof t === 'string',
      )
    : [];

  const scoresRaw = (fm['scores'] ?? {}) as Record<string, unknown>;
  const scores: EpisodeScores = {
    novelty: numOr(scoresRaw['novelty'], 0),
    reusability: numOr(scoresRaw['reusability'], 0),
    complexity: numOr(scoresRaw['complexity'], 0),
    outcome: numOr(scoresRaw['outcome'], 0),
  };

  const toolStats = Array.isArray(fm['toolStats'])
    ? (fm['toolStats'] as unknown[])
        .filter(
          (s): s is Record<string, unknown> => !!s && typeof s === 'object',
        )
        .map(
          (s) =>
            ({
              name: String(s['name'] ?? ''),
              count: numOr(s['count'], 0),
            }) as EpisodeToolStat,
        )
        .filter((s) => s.name)
    : undefined;

  const filesTouched = Array.isArray(fm['filesTouched'])
    ? (fm['filesTouched'] as unknown[]).filter(
        (f): f is string => typeof f === 'string',
      )
    : undefined;

  const createdAt =
    typeof fm['createdAt'] === 'number'
      ? (fm['createdAt'] as number)
      : undefined;

  return {
    id,
    title,
    timestamp,
    durationMins,
    toolCalls,
    outcome,
    tags,
    scores,
    toolStats,
    filesTouched,
    content: body.trim(),
    metadata: { filePath, createdAt },
  };
}

function serialize(cfg: EpisodeConfig): string {
  const fm: Record<string, unknown> = {
    id: cfg.id,
    title: cfg.title,
    timestamp: cfg.timestamp,
    durationMins: cfg.durationMins,
    toolCalls: cfg.toolCalls,
    outcome: cfg.outcome,
    tags: cfg.tags ?? [],
    scores: {
      novelty: cfg.scores.novelty,
      reusability: cfg.scores.reusability,
      complexity: cfg.scores.complexity,
      outcome: cfg.scores.outcome,
    },
  };
  if (cfg.toolStats && cfg.toolStats.length > 0) {
    fm['toolStats'] = cfg.toolStats.map((s) => ({
      name: s.name,
      count: s.count,
    }));
  }
  if (cfg.filesTouched && cfg.filesTouched.length > 0) {
    fm['filesTouched'] = cfg.filesTouched;
  }
  if (cfg.metadata?.createdAt) fm['createdAt'] = cfg.metadata.createdAt;
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

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
