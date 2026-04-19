/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext } from '../types.js';

export type SetupStepStatus = 'ok' | 'warn' | 'error' | 'info';

export interface SetupStep {
  status: SetupStepStatus;
  label: string;
  detail?: string;
}

export interface SetupResult {
  /** Headline shown at the top of the output block. */
  title: string;
  /** Ordered list of steps — `error` steps are rendered as failures. */
  steps: SetupStep[];
  /** Optional trailing hint (next command to run, docs link, etc.). */
  nextHint?: string;
  /** True if at least one step had `status: 'error'`. */
  failed: boolean;
}

/**
 * One pluggable channel setup provider (Telegram today; Discord/Slack later).
 *
 * `available = false` providers are listed but refuse to scaffold/verify —
 * the underlying gateway isn't built yet. This lets us advertise the
 * roadmap without wiring half-implementations.
 */
export interface GatewaySetupProvider {
  channel: string;
  label: string;
  available: boolean;
  /** One-line description shown in the provider listing. */
  summary: string;
  /**
   * Writes a template `.qwen/triggers/<id>.md` and prints next-step
   * instructions. Must be idempotent when `overwrite=true`; otherwise must
   * refuse to clobber an existing trigger file.
   */
  scaffold(
    ctx: CommandContext,
    options: { overwrite: boolean },
  ): Promise<SetupResult>;
  /**
   * Sanity-checks the setup: required env vars, trigger file on disk, live
   * connection to the service. Pure read-only.
   */
  verify(ctx: CommandContext): Promise<SetupResult>;
}

/** Helper: build a failed result from an error message. */
export function errorResult(title: string, message: string): SetupResult {
  return {
    title,
    steps: [{ status: 'error', label: message }],
    failed: true,
  };
}

/** Helper: render a result as plain text for the message pane. */
export function formatSetupResult(r: SetupResult): string {
  const glyph = (s: SetupStepStatus): string => {
    switch (s) {
      case 'ok':
        return '[OK]';
      case 'warn':
        return '[WARN]';
      case 'error':
        return '[FAIL]';
      default:
        return '[i]';
    }
  };
  const lines: string[] = [r.title, ''];
  for (const step of r.steps) {
    lines.push(`${glyph(step.status)} ${step.label}`);
    if (step.detail) {
      for (const detailLine of step.detail.split('\n')) {
        lines.push(`       ${detailLine}`);
      }
    }
  }
  if (r.nextHint) {
    lines.push('');
    lines.push(r.nextHint);
  }
  return lines.join('\n');
}
