/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Episodic memory system — types.
 *
 * An episode is a markdown record of a single meaningful task (a "long turn" or
 * milestone). It is written to `~/.qwen/episodes/<id>.md` after the user's turn
 * completes, and captures stats + a thin heuristic summary.
 *
 * Episodes feed two downstream mechanisms (implemented in later phases):
 *   1. Memory distillation — recurring decisions across N episodes get promoted
 *      into structured memories.
 *   2. Skill auto-proposal — episodes scoring ≥9/12 across 4 dimensions (or
 *      2+ episodes sharing a tag-set) become candidates for SKILL.md.
 *
 * Phase 1 writes episodes with heuristic scores. Later phases replace the
 * scoring heuristic with subagent review.
 */

export type EpisodeOutcome = 'success' | 'partial' | 'failed' | 'cancelled';

/**
 * 4-dimension self-scoring (0-3 each; total 0-12).
 *
 *   novelty:     Is this task pattern new vs prior episodes?
 *   reusability: Would the steps generalise to similar tasks?
 *   complexity:  Would starting fresh take >10 distinct steps?
 *   outcome:     Did the task actually succeed?
 *
 * Scores of 9+ (average ≥3/4) trigger skill-proposal candidacy.
 */
export interface EpisodeScores {
  novelty: number;
  reusability: number;
  complexity: number;
  outcome: number;
}

export interface EpisodeToolStat {
  name: string;
  count: number;
}

export interface EpisodeConfig {
  /** Slug (filename without .md). Letters, digits, dot, dash, underscore. */
  id: string;
  /** Short human-readable title — first line of summary, ≤120 chars. */
  title: string;
  /** ISO timestamp of when the turn ended. */
  timestamp: string;
  /** Wall-clock duration in minutes (rounded). */
  durationMins: number;
  /** Total tool call count during the turn. */
  toolCalls: number;
  /** Final outcome. */
  outcome: EpisodeOutcome;
  /** Free-form tags derived from tool args / file paths / keywords. */
  tags: string[];
  /** Per-dimension self-scores and total. */
  scores: EpisodeScores;
  /** Tool usage breakdown (sorted by count desc). */
  toolStats?: EpisodeToolStat[];
  /** Files read/written during the turn (absolute paths preferred). */
  filesTouched?: string[];
  /** Body: human-readable summary in Markdown. */
  content: string;
  /** File metadata populated by the store. */
  metadata?: {
    filePath?: string;
    createdAt?: number;
  };
}

export interface ListEpisodeOptions {
  /** Filter by outcome. */
  outcome?: EpisodeOutcome;
  /** Filter: return only episodes with any of these tags. */
  tags?: string[];
  /** Filter: return only episodes whose total score ≥ this. */
  minScore?: number;
  /** Filter: only episodes with timestamp ≥ this ISO string. */
  sinceIso?: string;
  /** If true, bypasses the in-memory cache. */
  force?: boolean;
}

export interface EpisodeCandidate {
  kind: 'memory' | 'skill';
  /** Suggested name / slug. */
  name: string;
  /** One-line hook. */
  description: string;
  /** Episode IDs that contributed to this candidate. */
  sourceEpisodeIds: string[];
  /** Confidence 0-1 (heuristic in Phase 1; LLM-judged later). */
  confidence: number;
}

export enum EpisodeErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_CONFIG = 'INVALID_CONFIG',
  FILE_ERROR = 'FILE_ERROR',
}

export class EpisodeError extends Error {
  constructor(
    message: string,
    readonly code: EpisodeErrorCode,
    readonly id?: string,
  ) {
    super(message);
    this.name = 'EpisodeError';
  }
}

/**
 * Compute total from scores. Always derivable; not serialised separately.
 */
export function totalScore(scores: EpisodeScores): number {
  return (
    scores.novelty + scores.reusability + scores.complexity + scores.outcome
  );
}
