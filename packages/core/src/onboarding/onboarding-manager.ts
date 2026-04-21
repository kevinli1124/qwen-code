/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OnboardingManager — decides whether the first-run user-profile prompt
 * should be injected into the session's system-prompt memory block, and
 * writes the collected answers into structured memory.
 *
 * Design:
 *   - State lives in `~/.qwen/memory/user_profile.md` (type: user, scope:
 *     user). Once present, `shouldPromptOnboarding()` returns false.
 *   - The prompt itself is a Markdown block prepended to the memory index
 *     injection (via Config.refreshHierarchicalMemory). No additional
 *     tool is required — the model is instructed to ask the questions in
 *     natural turn and call `memory_write` to persist the profile.
 *   - `detectGaps()` lets later code (or a future hook) probe whether the
 *     saved profile is still missing one of the canonical keys; when
 *     `settings.askOnGap` is true callers may surface a follow-up nudge.
 */

import type { MemoryStore } from '../memory/memory-store.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import {
  DEFAULT_ONBOARDING_SETTINGS,
  DEFAULT_PROFILE_QUESTIONS,
  type OnboardingSettings,
  type ProfileQuestion,
} from './types.js';

const debugLogger = createDebugLogger('ONBOARDING');

const USER_PROFILE_MEMORY_NAME = 'user_profile';

export interface ProfileAnswers {
  /** Required: how the user wants to be addressed. */
  name: string;
  /** Optional free-form role. */
  role?: string;
  /** Optional reply-style preference. */
  reply_style?: string;
  /** Optional language preference. */
  language?: string;
  /** Additional free-form key/value pairs (added via askOnGap). */
  extra?: Record<string, string>;
}

export class OnboardingManager {
  constructor(
    private readonly store: MemoryStore,
    private readonly settings: OnboardingSettings = DEFAULT_ONBOARDING_SETTINGS,
    private readonly questions: ProfileQuestion[] = DEFAULT_PROFILE_QUESTIONS,
  ) {}

  getSettings(): OnboardingSettings {
    return this.settings;
  }

  getQuestions(): ProfileQuestion[] {
    return this.questions;
  }

  /**
   * True when:
   *   - onboarding is enabled in settings, AND
   *   - no `user_profile` memory exists at either scope.
   *
   * Best-effort: filesystem errors return false so a broken memory store
   * never blocks the startup path.
   */
  async shouldPromptOnboarding(): Promise<boolean> {
    if (!this.settings.enabled) return false;
    try {
      const existing = await this.store.loadMemory(USER_PROFILE_MEMORY_NAME);
      return existing === null;
    } catch (err) {
      debugLogger.warn(
        `Failed to probe user_profile memory: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * Renders the onboarding hint block that should be prepended to the
   * session's memory index. The block instructs the model to ask the
   * canonical questions and then save a user_profile memory.
   *
   * Only required questions count toward `minQuestions`; the optional
   * ones are always surfaced but never blocking.
   */
  buildOnboardingHint(): string {
    const required = this.questions.filter((q) => q.required);
    const optional = this.questions.filter((q) => !q.required);
    const minRequired = Math.max(
      1,
      Math.min(this.settings.minQuestions, required.length || 1),
    );

    const lines: string[] = [];
    lines.push('--- First-run onboarding ---');
    lines.push('');
    lines.push(
      "This is a fresh setup — no `user_profile` memory exists yet. Before answering the user's first substantive request:",
    );
    lines.push('');
    lines.push(
      `1. Ask at least the required question${minRequired === 1 ? '' : 's'} below in one short message (skip any the user has already volunteered).`,
    );
    lines.push(
      '2. Once answered, call `memory_write` with `name: "user_profile"`, `type: "user"`, `scope: "user"`, and a Markdown body listing each field as a bullet (e.g. `- name: Sky`).',
    );
    lines.push(
      '3. Optional questions below are nice-to-have: ask them only if the flow feels natural; skip otherwise.',
    );
    lines.push(
      "4. After saving, proceed with the user's original request. Do **not** block on optional answers.",
    );
    lines.push('');

    if (required.length > 0) {
      lines.push('### Required');
      for (const q of required) {
        lines.push(`- **${q.key}** — ${q.prompt}`);
      }
      lines.push('');
    }
    if (optional.length > 0) {
      lines.push('### Optional (skip if user seems in a hurry)');
      for (const q of optional) {
        lines.push(`- **${q.key}** — ${q.prompt}`);
      }
      lines.push('');
    }

    lines.push('--- End first-run onboarding ---');
    return lines.join('\n');
  }

  /**
   * Persists the collected answers as a structured `user_profile` memory.
   * Overwrites any existing entry so repeat calls are idempotent.
   */
  async recordProfile(answers: ProfileAnswers): Promise<void> {
    if (!answers.name || !answers.name.trim()) {
      throw new Error('Profile requires at least a non-empty `name`.');
    }

    const lines: string[] = [];
    lines.push(`- name: ${answers.name.trim()}`);
    if (answers.role) lines.push(`- role: ${answers.role.trim()}`);
    if (answers.reply_style)
      lines.push(`- reply_style: ${answers.reply_style.trim()}`);
    if (answers.language) lines.push(`- language: ${answers.language.trim()}`);
    if (answers.extra) {
      for (const [k, v] of Object.entries(answers.extra)) {
        if (!v) continue;
        lines.push(`- ${k}: ${String(v).trim()}`);
      }
    }

    const description = `User profile (addressed as ${answers.name.trim()})`;
    const content = lines.join('\n');

    await this.store.writeMemory(
      {
        name: USER_PROFILE_MEMORY_NAME,
        type: 'user',
        scope: 'user',
        description,
        content,
      },
      { overwrite: true },
    );
  }

  /**
   * Returns the list of canonical keys missing from the current profile.
   * Used by callers that want to follow up when `askOnGap` is enabled.
   *
   * `expectedKeys` lets the caller probe for ad-hoc fields beyond the
   * canonical set (e.g. `['shell']`).
   */
  async detectGaps(expectedKeys: string[] = []): Promise<string[]> {
    const required = this.questions.map((q) => q.key);
    const wanted = Array.from(new Set([...required, ...expectedKeys]));
    const profile = await this.loadProfileKeys();
    return wanted.filter((k) => !profile.has(k));
  }

  private async loadProfileKeys(): Promise<Set<string>> {
    const cfg = await this.store.loadMemory(USER_PROFILE_MEMORY_NAME);
    if (!cfg) return new Set();
    const present = new Set<string>();
    for (const raw of cfg.content.split(/\r?\n/)) {
      const m = raw.match(/^\s*-\s+([A-Za-z0-9_]+)\s*:\s*\S/);
      if (m) present.add(m[1]);
    }
    return present;
  }
}
