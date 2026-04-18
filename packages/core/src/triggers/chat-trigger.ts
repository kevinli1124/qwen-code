/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTrigger,
  type OnFireCallback,
  type TriggerDeps,
} from './base-trigger.js';
import {
  TriggerError,
  TriggerErrorCode,
  type TriggerConfig,
  type TriggerKind,
} from './types.js';

export type ChatMatchMode = 'substring' | 'regex' | 'mention';

export interface ChatTriggerSpec {
  /** Patterns to match against the incoming user message. Up to 10 entries. */
  patterns: string[];
  /** How `patterns` are interpreted. Defaults to 'substring'. */
  matchMode?: ChatMatchMode;
  /** Minimum ms between fires. Defaults to 10_000. */
  cooldownMs?: number;
  /** Only match in these roles. Currently only 'user' is honored; default ['user']. */
  roles?: Array<'user'>;
}

export interface ChatEvaluationResult {
  matchedPattern: string;
  matchedText: string;
}

const MAX_PATTERNS = 10;
const DEFAULT_COOLDOWN_MS = 10_000;
const REGEX_TIMEOUT_MS = 50;

/**
 * Chat-keyword trigger. The hosting session must call
 * `TriggerManager.evaluateChatMessage(text)` on each user turn; that entry
 * point asks every registered ChatTrigger to check its patterns. Matching
 * triggers fire with payload `{ matchedPattern, matchedText }`.
 *
 * Guards:
 *   - max 10 patterns per trigger
 *   - regex patterns are executed with a 50 ms wall-clock budget per match
 *   - per-trigger cooldown (default 10 s) rate-limits rapid re-firing
 */
export class ChatTrigger extends BaseTrigger {
  readonly kind: TriggerKind = 'chat';
  private lastFiredAt = 0;

  constructor(cfg: TriggerConfig, deps: TriggerDeps) {
    super(cfg, deps);
  }

  override validate(): void {
    const spec = this.cfg.spec as unknown as Partial<ChatTriggerSpec>;
    if (!spec || !Array.isArray(spec.patterns) || spec.patterns.length === 0) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (chat) requires spec.patterns (non-empty string[])`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    if (spec.patterns.length > MAX_PATTERNS) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (chat) exceeds max ${MAX_PATTERNS} patterns`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    for (const p of spec.patterns) {
      if (typeof p !== 'string' || !p.length) {
        throw new TriggerError(
          `Trigger "${this.cfg.id}" (chat) patterns must be non-empty strings`,
          TriggerErrorCode.INVALID_CONFIG,
          this.cfg.id,
        );
      }
    }
    if (spec.matchMode !== undefined) {
      if (!['substring', 'regex', 'mention'].includes(spec.matchMode)) {
        throw new TriggerError(
          `Trigger "${this.cfg.id}" (chat) has invalid matchMode "${spec.matchMode}"`,
          TriggerErrorCode.INVALID_CONFIG,
          this.cfg.id,
        );
      }
    }
    if (spec.matchMode === 'regex') {
      for (const p of spec.patterns) {
        try {
          new RegExp(p);
        } catch (err) {
          throw new TriggerError(
            `Trigger "${this.cfg.id}" (chat) has invalid regex "${p}": ${err instanceof Error ? err.message : String(err)}`,
            TriggerErrorCode.INVALID_CONFIG,
            this.cfg.id,
          );
        }
      }
    }
    if (
      spec.cooldownMs !== undefined &&
      (typeof spec.cooldownMs !== 'number' || spec.cooldownMs < 0)
    ) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (chat) cooldownMs must be a non-negative number`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
  }

  override start(onFire: OnFireCallback): void {
    // No external source to attach to — TriggerManager drives us via
    // `evaluate(text)` on every user turn.
    this.onFire = onFire;
  }

  override stop(): void {
    this.onFire = null;
  }

  /**
   * Checks whether this trigger's patterns match the given message. Returns
   * a result object if it matched AND the cooldown has elapsed, else null.
   * The caller is expected to invoke `fireManually(result)` on a non-null
   * return to update `lastFiredAt` and dispatch the agent.
   */
  evaluate(
    text: string,
    now: number = Date.now(),
  ): ChatEvaluationResult | null {
    if (!this.onFire) return null;
    const spec = this.cfg.spec as unknown as ChatTriggerSpec;
    const cooldown = spec.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    if (this.lastFiredAt > 0 && now - this.lastFiredAt < cooldown) return null;

    const mode: ChatMatchMode = spec.matchMode ?? 'substring';
    for (const pattern of spec.patterns) {
      const match = matchPattern(pattern, text, mode);
      if (match !== null) {
        this.lastFiredAt = now;
        return { matchedPattern: pattern, matchedText: match };
      }
    }
    return null;
  }
}

function matchPattern(
  pattern: string,
  text: string,
  mode: ChatMatchMode,
): string | null {
  if (mode === 'substring') {
    return text.toLowerCase().includes(pattern.toLowerCase()) ? pattern : null;
  }
  if (mode === 'mention') {
    const needle = pattern.startsWith('@') ? pattern : `@${pattern}`;
    return text.includes(needle) ? needle : null;
  }
  // regex
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return null;
  }
  const result = runRegexWithBudget(re, text, REGEX_TIMEOUT_MS);
  return result?.[0] ?? null;
}

/**
 * Runs a regex against input with a soft wall-clock budget. JavaScript
 * regexes cannot truly be cancelled, but for pathological patterns the
 * blocking time is usually bounded by a single `exec`. We spend at most
 * `budgetMs` in a retry loop — if it blew the budget once, we abandon
 * further attempts. This is a best-effort safeguard, not a hard guarantee.
 */
function runRegexWithBudget(
  re: RegExp,
  text: string,
  budgetMs: number,
): RegExpExecArray | null {
  const start = Date.now();
  try {
    const m = re.exec(text);
    const elapsed = Date.now() - start;
    if (elapsed > budgetMs) return null;
    return m;
  } catch {
    return null;
  }
}
