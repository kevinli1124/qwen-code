/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified Trigger system — types.
 *
 * A Trigger is a persistent config that fires a subagent when a condition
 * becomes true. Kinds: cron (time), file (fs changes), webhook (http),
 * chat (keyword match in user turn), system (git / process events).
 */

export type TriggerKind = 'cron' | 'file' | 'webhook' | 'chat' | 'system';

export type TriggerLevel = 'project' | 'user' | 'session';

export interface TriggerConfig {
  /** Stable slug derived from filename (project/user levels) or generated (session level). */
  id: string;
  /** Human-readable label. */
  name: string;
  kind: TriggerKind;
  enabled: boolean;
  /** Subagent name (`.qwen/agents/<name>.md`) that will be forked when this trigger fires. */
  agentRef: string;
  /** Kind-specific parameters. Shape validated by each trigger class's validate(). */
  spec: Record<string, unknown>;
  /**
   * Prompt to send to the subagent. Supports `${payload.xxx}` placeholders
   * filled from TriggerContext.payload at fire time. If absent, the subagent
   * receives a default prompt describing the trigger event.
   */
  promptTemplate?: string;
  metadata?: {
    createdAt?: number;
    filePath?: string;
    level?: TriggerLevel;
  };
}

/**
 * Runtime context passed to the subagent when a trigger fires.
 * Placed into ContextState as the `trigger` variable; `payload` fields
 * are also flattened into top-level context keys for template substitution.
 */
export interface TriggerContext {
  triggerId: string;
  kind: TriggerKind;
  firedAt: number;
  payload: Record<string, unknown>;
}

export interface ListTriggersOptions {
  level?: TriggerLevel;
  kind?: TriggerKind;
  enabled?: boolean;
  force?: boolean;
}

export interface CreateTriggerOptions {
  level: Exclude<TriggerLevel, 'session'>;
  overwrite?: boolean;
}

/**
 * Error codes for trigger operations, mirroring SubagentErrorCode conventions.
 */
export enum TriggerErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_CONFIG = 'INVALID_CONFIG',
  FILE_ERROR = 'FILE_ERROR',
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  UNSUPPORTED_KIND = 'UNSUPPORTED_KIND',
}

export class TriggerError extends Error {
  constructor(
    message: string,
    readonly code: TriggerErrorCode,
    readonly triggerId?: string,
  ) {
    super(message);
    this.name = 'TriggerError';
  }
}
