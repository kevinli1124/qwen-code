/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import type { Content } from '@google/genai';
import { createDebugLogger } from '../utils/debugLogger.js';
import { EpisodeStore } from './episode-store.js';
import {
  type EpisodeConfig,
  type EpisodeOutcome,
  type EpisodeScores,
  type EpisodeToolStat,
  totalScore,
} from './types.js';

const debugLogger = createDebugLogger('SESSION_REVIEWER');

export type AutoCaptureMode = 'off' | 'ask' | 'auto';

export interface EpisodeCaptureSettings {
  autoCapture: AutoCaptureMode;
  toolCallThreshold: number;
  durationMsThreshold: number;
  retentionDays: number;
}

export const DEFAULT_EPISODE_SETTINGS: EpisodeCaptureSettings = {
  autoCapture: 'ask',
  toolCallThreshold: 15,
  durationMsThreshold: 20 * 60 * 1000,
  retentionDays: 90,
};

/**
 * Summary of a single completed turn, fed to the reviewer for evaluation.
 */
export interface TurnSummary {
  /** Chat history at turn end (newest last). */
  history: Content[];
  /** Index into history where this turn's user message lives (inclusive). */
  turnStartIndex: number;
  /** Epoch ms when the turn began. */
  turnStartedAt: number;
  /** Epoch ms when the turn ended (typically now). */
  turnEndedAt: number;
  /** Whether the turn completed normally. */
  completedNormally: boolean;
  /** Optional: session ID or prompt ID for identification. */
  sessionId?: string;
}

export type CaptureAction =
  | { kind: 'skipped'; reason: string }
  | {
      kind: 'written';
      episode: EpisodeConfig;
      /**
       * Set when the current episode count has reached the distill
       * threshold (default 5) without the user having distilled recently.
       * Callers can surface this as a gentle nudge to invoke `memory_distill`.
       */
      distillSuggestion?: DistillSuggestion;
      /**
       * Set when the just-written episode (or a tag-overlapping cluster
       * with recent ones) crosses the skill-promotion threshold.
       * Callers can surface this as a nudge to invoke `skill_propose`.
       */
      skillProposal?: SkillProposal;
    }
  | { kind: 'pending'; candidate: EpisodeConfig };

export interface DistillSuggestion {
  /** Total episodes currently on disk. */
  episodeCount: number;
  /** Human-readable prompt for the UI layer. */
  message: string;
}

export interface SkillProposal {
  /** Which rule triggered the proposal. */
  trigger: 'high_score' | 'recurring_pattern';
  /** Score of the just-written episode (0-12). */
  episodeScore: number;
  /** IDs of episodes supporting this proposal (includes the current one). */
  episodeIds: string[];
  /** Tags shared across supporting episodes. */
  sharedTags: string[];
  /** Human-readable prompt for the UI layer. */
  message: string;
}

const DEFAULT_DISTILL_THRESHOLD = 5;
const DEFAULT_SKILL_SCORE_THRESHOLD = 9;
const RECURRING_LOOKBACK = 10;
const RECURRING_MIN_TAG_OVERLAP = 2;

/**
 * Decides whether a completed turn is worth preserving as an episode and,
 * if so, produces a heuristic episode record.
 *
 * Phase 1 behaviour:
 *   - No LLM call; all fields (title, tags, scores) are derived from turn stats
 *     and chat-history scanning.
 *   - `autoCapture === 'auto'` writes directly; `'ask'` returns a pending
 *     candidate for the UI to confirm before writing (the UI plumbing lives
 *     in a later phase — for now the caller may call writeCandidate() to
 *     commit). `'off'` skips entirely.
 */
export class SessionReviewer {
  constructor(
    private readonly store: EpisodeStore = new EpisodeStore(),
    private readonly settings: EpisodeCaptureSettings = DEFAULT_EPISODE_SETTINGS,
  ) {}

  getSettings(): EpisodeCaptureSettings {
    return this.settings;
  }

  /**
   * Entry point called from client.ts after a turn ends. Returns a
   * description of what happened so the caller can log/notify.
   */
  async maybeCapture(summary: TurnSummary): Promise<CaptureAction> {
    if (this.settings.autoCapture === 'off') {
      return { kind: 'skipped', reason: 'autoCapture=off' };
    }

    const stats = analyseTurn(summary);
    if (!meetsLongTaskThreshold(stats, this.settings)) {
      return {
        kind: 'skipped',
        reason: `below thresholds (tools=${stats.toolCalls}, durationMs=${stats.durationMs})`,
      };
    }

    const candidate = buildEpisode(summary, stats);

    if (this.settings.autoCapture === 'auto') {
      try {
        const written = await this.store.writeEpisode(candidate);
        const distillSuggestion = await this.maybeBuildDistillSuggestion();
        const skillProposal = await this.maybeBuildSkillProposal(written);
        return {
          kind: 'written',
          episode: written,
          distillSuggestion,
          skillProposal,
        };
      } catch (err) {
        debugLogger.warn(
          `Failed to auto-write episode ${candidate.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { kind: 'skipped', reason: `write failed: ${String(err)}` };
      }
    }

    // 'ask' mode: caller decides when/whether to commit.
    return { kind: 'pending', candidate };
  }

  /**
   * Commit a pending candidate (used by 'ask' mode after user confirms).
   */
  async writeCandidate(
    candidate: EpisodeConfig,
    options: { overwrite?: boolean } = {},
  ): Promise<EpisodeConfig> {
    return this.store.writeEpisode(candidate, options);
  }

  /**
   * Run retention cleanup. Safe to call on startup; returns archived count.
   */
  async archiveExpired(): Promise<number> {
    return this.store.archiveExpired(this.settings.retentionDays);
  }

  getStore(): EpisodeStore {
    return this.store;
  }

  /**
   * Builds a skill-proposal suggestion when the just-written episode
   * qualifies. Triggers:
   *   - "high_score": total score >= DEFAULT_SKILL_SCORE_THRESHOLD (9/12).
   *   - "recurring_pattern": two or more recent episodes share a tag set
   *     of size >= RECURRING_MIN_TAG_OVERLAP.
   * Best-effort: filesystem errors return undefined.
   */
  private async maybeBuildSkillProposal(
    just: EpisodeConfig,
  ): Promise<SkillProposal | undefined> {
    try {
      const episodeScore = totalScore(just.scores);

      if (episodeScore >= DEFAULT_SKILL_SCORE_THRESHOLD) {
        return {
          trigger: 'high_score',
          episodeScore,
          episodeIds: [just.id],
          sharedTags: just.tags.slice(),
          message:
            `Episode scored ${episodeScore}/12 — high enough to promote into a reusable skill. ` +
            `Consider running \`skill_propose\` to draft one from this pattern.`,
        };
      }

      if (just.tags.length === 0) return undefined;

      // Look at recent episodes for tag-set overlap signalling recurrence.
      const recent = await this.store.listEpisodes({ force: true });
      const pool = recent
        .filter((e) => e.id !== just.id)
        .slice(0, RECURRING_LOOKBACK);

      const justTags = new Set(just.tags.map((t) => t.toLowerCase()));
      const supporters: EpisodeConfig[] = [];
      const sharedTagCounts = new Map<string, number>();

      for (const other of pool) {
        const otherTags = new Set(other.tags.map((t) => t.toLowerCase()));
        let shared = 0;
        const localShared: string[] = [];
        for (const t of justTags) {
          if (otherTags.has(t)) {
            shared++;
            localShared.push(t);
          }
        }
        if (shared >= RECURRING_MIN_TAG_OVERLAP) {
          supporters.push(other);
          for (const t of localShared) {
            sharedTagCounts.set(t, (sharedTagCounts.get(t) ?? 0) + 1);
          }
        }
      }

      if (supporters.length === 0) return undefined;

      // Keep tags that appeared in at least one supporter, sorted by frequency.
      const sharedTags = Array.from(sharedTagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t);

      return {
        trigger: 'recurring_pattern',
        episodeScore,
        episodeIds: [just.id, ...supporters.map((s) => s.id)],
        sharedTags,
        message:
          `Detected ${supporters.length + 1} episodes sharing tags [${sharedTags.join(', ')}]. ` +
          `Consider running \`skill_propose\` to crystallise the pattern.`,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Builds a distillation suggestion when the episode pile has grown past
   * the threshold. Best-effort: any filesystem error returns undefined so
   * the caller still gets its primary result.
   */
  private async maybeBuildDistillSuggestion(
    threshold: number = DEFAULT_DISTILL_THRESHOLD,
  ): Promise<DistillSuggestion | undefined> {
    try {
      const episodeCount = await this.store.count({ force: true });
      if (episodeCount < threshold) return undefined;
      return {
        episodeCount,
        message:
          `You now have ${episodeCount} episode${episodeCount === 1 ? '' : 's'} on file. ` +
          `Consider running \`memory_distill\` to review them and promote recurring ` +
          `lessons into durable memories.`,
      };
    } catch {
      return undefined;
    }
  }
}

// ─── Turn analysis ─────────────────────────────────────────────

export interface TurnStats {
  toolCalls: number;
  toolStats: EpisodeToolStat[];
  filesTouched: string[];
  tags: string[];
  durationMs: number;
  assistantTextTail: string;
  outcome: EpisodeOutcome;
}

const FILE_LIKE_KEYS = [
  'file_path',
  'filePath',
  'path',
  'absolute_path',
  'absolutePath',
  'target_file',
  'targetFile',
];

/**
 * Walk the chat history slice belonging to this turn and derive stats.
 * Does NOT read outside the turnStartIndex window — avoids leaking prior
 * turn context.
 */
export function analyseTurn(summary: TurnSummary): TurnStats {
  const { history, turnStartIndex, turnStartedAt, turnEndedAt } = summary;
  const slice = history.slice(Math.max(0, turnStartIndex));

  const toolCountByName = new Map<string, number>();
  const filesSet = new Set<string>();
  let assistantTextTail = '';

  for (const content of slice) {
    const parts = content.parts ?? [];
    for (const part of parts) {
      // Function call = tool invocation by model.
      const fn = (part as { functionCall?: { name?: string; args?: unknown } })
        .functionCall;
      if (fn && fn.name) {
        toolCountByName.set(fn.name, (toolCountByName.get(fn.name) ?? 0) + 1);
        // Extract file-like paths from args.
        if (fn.args && typeof fn.args === 'object') {
          collectFilePaths(fn.args as Record<string, unknown>, filesSet);
        }
      }
      // Accumulate the latest assistant text (for title/summary).
      if (content.role === 'model') {
        const text = (part as { text?: string }).text;
        if (typeof text === 'string' && text.trim().length > 0) {
          assistantTextTail = text;
        }
      }
    }
  }

  const toolCalls = Array.from(toolCountByName.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const toolStats: EpisodeToolStat[] = Array.from(toolCountByName.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const filesTouched = Array.from(filesSet).sort();
  const tags = deriveTags(toolStats, filesTouched, assistantTextTail);
  const durationMs = Math.max(0, turnEndedAt - turnStartedAt);
  const outcome = summary.completedNormally ? 'success' : 'partial';

  return {
    toolCalls,
    toolStats,
    filesTouched,
    tags,
    durationMs,
    assistantTextTail,
    outcome,
  };
}

function collectFilePaths(
  obj: Record<string, unknown>,
  sink: Set<string>,
): void {
  for (const key of FILE_LIKE_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      sink.add(v.trim());
    }
  }
}

function deriveTags(
  toolStats: EpisodeToolStat[],
  filesTouched: string[],
  assistantTail: string,
): string[] {
  const tags = new Set<string>();

  // Top 3 tool names (normalized).
  for (const s of toolStats.slice(0, 3)) {
    tags.add(slugify(s.name));
  }

  // File extensions (top 3).
  const extCount = new Map<string, number>();
  for (const f of filesTouched) {
    const ext = path.extname(f).replace(/^\./, '').toLowerCase();
    if (!ext || ext.length > 6) continue;
    extCount.set(ext, (extCount.get(ext) ?? 0) + 1);
  }
  for (const [ext] of Array.from(extCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)) {
    tags.add(ext);
  }

  // Keyword mining from last assistant message (very conservative).
  const keywords = pickKeywords(assistantTail);
  for (const k of keywords) tags.add(k);

  return Array.from(tags).filter(Boolean).slice(0, 8);
}

const KEYWORD_ALLOWLIST = new Set([
  'eslint',
  'typescript',
  'vitest',
  'jest',
  'build',
  'bundle',
  'lint',
  'test',
  'monorepo',
  'migration',
  'refactor',
  'regression',
  'performance',
  'security',
  'i18n',
  'telegram',
  'webui',
  'agent',
  'memory',
  'skill',
  'ci',
  'docker',
  'windows',
  'linux',
  'macos',
  'auth',
  'settings',
]);

function pickKeywords(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const kw of KEYWORD_ALLOWLIST) {
    if (lower.includes(kw)) out.push(kw);
    if (out.length >= 4) break;
  }
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

// ─── Threshold check ───────────────────────────────────────────

export function meetsLongTaskThreshold(
  stats: TurnStats,
  settings: EpisodeCaptureSettings,
): boolean {
  return (
    stats.toolCalls >= settings.toolCallThreshold ||
    stats.durationMs >= settings.durationMsThreshold
  );
}

// ─── Heuristic scoring ────────────────────────────────────────

export function scoreHeuristically(stats: TurnStats): EpisodeScores {
  // Novelty: placeholder — without comparing to prior episodes we can't judge.
  // Give 2 by default; Phase 3 distillation will refine by checking tag overlap.
  const novelty = 2;

  // Reusability: higher when multiple distinct tools are used and files touched.
  const distinctTools = stats.toolStats.length;
  const reusability = clamp(
    Math.round(
      Math.min(
        3,
        distinctTools / 2 + Math.min(stats.filesTouched.length, 3) / 3,
      ),
    ),
    0,
    3,
  );

  // Complexity: log-scaled on tool call count.
  // 1-5 → 1, 6-15 → 2, 16+ → 3.
  const complexity = stats.toolCalls <= 5 ? 1 : stats.toolCalls <= 15 ? 2 : 3;

  // Outcome: success=3, partial=2, failed=0, cancelled=1.
  const outcome =
    stats.outcome === 'success'
      ? 3
      : stats.outcome === 'partial'
        ? 2
        : stats.outcome === 'cancelled'
          ? 1
          : 0;

  return { novelty, reusability, complexity, outcome };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// ─── Episode builder ──────────────────────────────────────────

export function buildEpisode(
  summary: TurnSummary,
  stats: TurnStats,
): EpisodeConfig {
  const timestamp = new Date(summary.turnEndedAt).toISOString();
  const title = deriveTitle(stats.assistantTextTail, stats.tags);
  const id = deriveId(timestamp, title);
  const scores = scoreHeuristically(stats);
  const durationMins = Math.round(stats.durationMs / 60000);

  const content = renderBody(title, stats, scores);

  return {
    id,
    title,
    timestamp,
    durationMins,
    toolCalls: stats.toolCalls,
    outcome: stats.outcome,
    tags: stats.tags,
    scores,
    toolStats: stats.toolStats,
    filesTouched: stats.filesTouched,
    content,
  };
}

function deriveTitle(assistantTail: string, tags: string[]): string {
  const firstLine = (assistantTail || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine && firstLine.length <= 120) {
    return firstLine;
  }
  if (firstLine) return firstLine.slice(0, 117) + '...';
  return tags.length > 0
    ? `Task involving ${tags.slice(0, 3).join(', ')}`
    : 'Completed task';
}

function deriveId(isoTimestamp: string, title: string): string {
  // Format: YYYY-MM-DD-HHMM-<slug>
  const date = isoTimestamp.slice(0, 10);
  const time = isoTimestamp.slice(11, 16).replace(':', '');
  const slug = slugify(title).slice(0, 40) || 'task';
  return `${date}-${time}-${slug}`;
}

function renderBody(
  title: string,
  stats: TurnStats,
  scores: EpisodeScores,
): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(
    truncate(stats.assistantTextTail || '(no assistant text recorded)', 1200),
  );
  lines.push('');

  lines.push('## Stats');
  lines.push(`- tool calls: ${stats.toolCalls}`);
  lines.push(`- duration: ${Math.round(stats.durationMs / 1000)}s`);
  lines.push(`- outcome: ${stats.outcome}`);
  lines.push(`- score total: ${totalScore(scores)}/12`);
  lines.push('');

  if (stats.toolStats.length > 0) {
    lines.push('## Tool usage');
    for (const s of stats.toolStats) {
      lines.push(`- ${s.name}: ${s.count}`);
    }
    lines.push('');
  }

  if (stats.filesTouched.length > 0) {
    lines.push('## Files touched');
    for (const f of stats.filesTouched.slice(0, 30)) {
      lines.push(`- ${f}`);
    }
    if (stats.filesTouched.length > 30) {
      lines.push(`- ... (${stats.filesTouched.length - 30} more)`);
    }
    lines.push('');
  }

  lines.push('## Notes');
  lines.push(
    '> This episode was captured automatically from a long-running turn. ' +
      'Title, tags, and scores are heuristic. Later phases replace the ' +
      'heuristic with subagent-based review.',
  );
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}
