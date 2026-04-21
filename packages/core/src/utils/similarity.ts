/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import levenshtein from 'fast-levenshtein';
import type { SkillConfig } from '../skills/types.js';
import type { MemoryConfig, MemoryType } from '../memory/types.js';

/**
 * A match surfaced by the similarity scanner. The `score` is in [0, 1] where
 * 1 means identical and 0 means no similarity; the `reason` tag identifies
 * which signal drove the match so callers can render a helpful UI.
 */
export interface SimilarityHit<T> {
  item: T;
  score: number;
  reason: SimilarityReason;
}

export type SimilarityReason =
  | 'exact' // same slug (case-insensitive)
  | 'name_fuzzy' // Levenshtein distance on slug is small
  | 'tag_overlap' // Jaccard on tag sets exceeds threshold
  | 'desc_overlap'; // token-set overlap on descriptions exceeds threshold

// ─── Public API ────────────────────────────────────────────────

export interface SkillSimilarityThresholds {
  /** Max Levenshtein distance on name slug (<= triggers name_fuzzy). */
  nameDistance?: number;
  /** Min Jaccard similarity on tag sets. */
  tagOverlap?: number;
  /** Min token-set overlap ratio on descriptions. */
  descOverlap?: number;
  /** Global minimum score to include in result. */
  minScore?: number;
}

export interface MemorySimilarityThresholds {
  nameDistance?: number;
  descOverlap?: number;
  minScore?: number;
}

export interface SkillDraft {
  name: string;
  description: string;
  tags?: string[];
}

export interface MemoryDraft {
  name: string;
  description: string;
  type?: MemoryType;
}

const DEFAULT_SKILL_THRESHOLDS: Required<SkillSimilarityThresholds> = {
  nameDistance: 3,
  tagOverlap: 0.7,
  descOverlap: 0.6,
  minScore: 0.7,
};

const DEFAULT_MEMORY_THRESHOLDS: Required<MemorySimilarityThresholds> = {
  nameDistance: 3,
  descOverlap: 0.6,
  minScore: 0.7,
};

/**
 * Find existing skills that would be near-duplicates of `draft`.
 * Returns hits sorted by score descending.
 *
 * Scoring strategy:
 *   - Name slug match (exact or Levenshtein) contributes 0.6 – 1.0
 *   - Tag overlap (Jaccard) contributes 0.0 – 1.0
 *   - Description token overlap contributes 0.0 – 1.0
 *   - We take the MAX of those signals (not the sum) so a single strong
 *     match is enough to surface — callers decide whether to merge or
 *     rename.
 */
export function findSimilarSkills(
  draft: SkillDraft,
  existing: readonly SkillConfig[],
  thresholds: SkillSimilarityThresholds = {},
): Array<SimilarityHit<SkillConfig>> {
  const t = { ...DEFAULT_SKILL_THRESHOLDS, ...thresholds };
  const draftSlug = slugify(draft.name);
  const draftTags = normalizeTagList(draft.tags);
  const draftDescTokens = tokenize(draft.description);

  const hits: Array<SimilarityHit<SkillConfig>> = [];
  for (const item of existing) {
    const nameHit = scoreName(draftSlug, item.name, t.nameDistance);
    const tagHit = scoreTags(draftTags, [], t.tagOverlap);
    const descHit = scoreDesc(draftDescTokens, item.description, t.descOverlap);

    const best = pickBest(nameHit, tagHit, descHit);
    if (best && best.score >= t.minScore) {
      hits.push({ item, ...best });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

/**
 * Find existing memories that would be near-duplicates of `draft`. If
 * `draft.type` is set, only memories of the same type are considered
 * (description similarity across types is typically not meaningful).
 */
export function findSimilarMemories(
  draft: MemoryDraft,
  existing: readonly MemoryConfig[],
  thresholds: MemorySimilarityThresholds = {},
): Array<SimilarityHit<MemoryConfig>> {
  const t = { ...DEFAULT_MEMORY_THRESHOLDS, ...thresholds };
  const draftSlug = slugify(draft.name);
  const draftDescTokens = tokenize(draft.description);

  const hits: Array<SimilarityHit<MemoryConfig>> = [];
  for (const item of existing) {
    if (draft.type && item.type !== draft.type) continue;
    const nameHit = scoreName(draftSlug, item.name, t.nameDistance);
    const descHit = scoreDesc(draftDescTokens, item.description, t.descOverlap);
    const best = pickBest(nameHit, undefined, descHit);
    if (best && best.score >= t.minScore) {
      hits.push({ item, ...best });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

// ─── Individual signals ────────────────────────────────────────

interface ScoreCandidate {
  score: number;
  reason: SimilarityReason;
}

function scoreName(
  draftSlug: string,
  candidateName: string,
  maxDistance: number,
): ScoreCandidate | undefined {
  const other = slugify(candidateName);
  if (!draftSlug || !other) return undefined;
  if (draftSlug === other) {
    return { score: 1.0, reason: 'exact' };
  }
  const dist = levenshtein.get(draftSlug, other);
  if (dist > maxDistance) return undefined;
  const maxLen = Math.max(draftSlug.length, other.length) || 1;
  // score = 1 - normalized_distance, clipped to [0, 1]
  const score = Math.max(0, 1 - dist / maxLen);
  // Gentle floor so a 2-char diff on 8-char slug still flags.
  const boosted = Math.max(score, 0.75);
  return { score: boosted, reason: 'name_fuzzy' };
}

function scoreTags(
  draftTags: Set<string>,
  candidateTags: string[],
  minOverlap: number,
): ScoreCandidate | undefined {
  if (draftTags.size === 0 || candidateTags.length === 0) return undefined;
  const other = normalizeTagList(candidateTags);
  const score = jaccard(draftTags, other);
  if (score < minOverlap) return undefined;
  return { score, reason: 'tag_overlap' };
}

function scoreDesc(
  draftTokens: Set<string>,
  candidateDesc: string,
  minOverlap: number,
): ScoreCandidate | undefined {
  if (draftTokens.size === 0) return undefined;
  const other = tokenize(candidateDesc);
  if (other.size === 0) return undefined;
  // Overlap ratio relative to the SMALLER side — this catches the case
  // where the draft description is a subset of a longer existing one,
  // which pure Jaccard would score low.
  const common = intersectSize(draftTokens, other);
  const denom = Math.min(draftTokens.size, other.size);
  const score = denom === 0 ? 0 : common / denom;
  if (score < minOverlap) return undefined;
  return { score, reason: 'desc_overlap' };
}

function pickBest(
  ...candidates: Array<ScoreCandidate | undefined>
): ScoreCandidate | undefined {
  let best: ScoreCandidate | undefined;
  for (const c of candidates) {
    if (!c) continue;
    if (!best || c.score > best.score) best = c;
  }
  return best;
}

// ─── Helpers ──────────────────────────────────────────────────

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[_.\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'for',
  'to',
  'in',
  'on',
  'at',
  'by',
  'is',
  'with',
  'from',
  'this',
  'that',
  'these',
  'those',
  'be',
  'as',
  'it',
  'its',
  'my',
  'our',
  'your',
]);

export function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9+\-_]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t)),
  );
}

export function normalizeTagList(tags: string[] | undefined): Set<string> {
  if (!tags) return new Set();
  return new Set(
    tags.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 0),
  );
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = intersectSize(a, b);
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function intersectSize<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of smaller) if (larger.has(v)) n++;
  return n;
}
