/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * trigger_create tool — persist a new trigger to `.qwen/triggers/`.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import type { TriggerConfig, TriggerKind } from '../triggers/types.js';

export interface TriggerCreateParams {
  id: string;
  name?: string;
  kind: TriggerKind;
  agentRef: string;
  spec: Record<string, unknown>;
  promptTemplate?: string;
  enabled?: boolean;
  level?: 'project' | 'user';
}

class TriggerCreateInvocation extends BaseToolInvocation<
  TriggerCreateParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: TriggerCreateParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `${this.params.kind}:${this.params.id} → ${this.params.agentRef}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const manager = this.config.getTriggerManager();
      const cfg: TriggerConfig = {
        id: this.params.id,
        name: this.params.name ?? this.params.id,
        kind: this.params.kind,
        enabled: this.params.enabled !== false,
        agentRef: this.params.agentRef,
        spec: this.params.spec ?? {},
        promptTemplate: this.params.promptTemplate,
      };
      await manager.createTrigger(cfg, {
        level: this.params.level ?? 'project',
      });
      const llmContent =
        `Created trigger "${cfg.id}" (${cfg.kind}) bound to agent "${cfg.agentRef}". ` +
        `Stored at ${this.params.level ?? 'project'} level. ` +
        (cfg.enabled
          ? 'Registered and running.'
          : 'Created disabled — enable with TriggerToggle.');
      return { llmContent, returnDisplay: `Created ${cfg.id}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Error creating trigger: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }
  }
}

export class TriggerCreateTool extends BaseDeclarativeTool<
  TriggerCreateParams,
  ToolResult
> {
  static readonly Name = ToolNames.TRIGGER_CREATE;

  constructor(private config: Config) {
    super(
      TriggerCreateTool.Name,
      ToolDisplayNames.TRIGGER_CREATE,
      'Persist a new trigger to `.qwen/triggers/<id>.md`. Triggers fire a subagent (named by `agentRef`, resolved from `.qwen/agents/`) when their condition is met. Unlike CronCreate, triggers survive restarts and run as background subagents instead of injecting prompts into the main session.\n\n' +
        '## Kinds and spec shape\n\n' +
        '### kind=cron\n' +
        '  spec: { cron: string, recurring?: boolean }\n' +
        '  Example: { cron: "0 9 * * 1-5", recurring: true }\n\n' +
        '### kind=file\n' +
        '  spec: { paths: string[], events?: ("add"|"change"|"unlink")[], debounceMs?: number (>=100, default 500), ignoreInitial?: boolean (default true), ignored?: string[] }\n' +
        '  - paths: up to 20 glob patterns. Example: ["src/**/*.ts", "docs/**"]\n' +
        '  - Default ignored: node_modules, .git, dist, .qwen — cannot be un-ignored; supply `ignored` to add more.\n' +
        '  - Payload: { event, changedPath }\n\n' +
        '### kind=webhook\n' +
        '  spec: { path: string, method?: "GET"|"POST"|"PUT"|"PATCH"|"DELETE" (default POST), secretEnv?: string, allowedIPs?: string[] }\n' +
        '  - path: url path registered on the shared webhook server (defaults to http://127.0.0.1:9876, override with env QWEN_TRIGGER_WEBHOOK_PORT / QWEN_TRIGGER_WEBHOOK_BIND).\n' +
        '  - secretEnv: name of env var holding an HMAC-SHA256 secret. Server rejects requests whose "X-Trigger-Signature" header (optionally "sha256=..." prefixed) does not match. Required when bind != 127.0.0.1.\n' +
        '  - allowedIPs: exact-match client IP allowlist (empty = allow all).\n' +
        '  - Body size limit: 1 MB. Payload: { method, path, headers, query, body, json?, ip }.\n\n' +
        '### kind=chat\n' +
        '  spec: { patterns: string[], matchMode?: "substring"|"regex"|"mention" (default "substring"), cooldownMs?: number (default 10000) }\n' +
        '  - patterns: up to 10. substring is case-insensitive; mention matches `@<pattern>`; regex compiles each as a JS regex.\n' +
        '  - Fires once per matched user message; cooldown rate-limits rapid re-firing. Payload: { matchedPattern, matchedText }.\n\n' +
        '### kind=system\n' +
        '  spec: { event: "git", on: "commit"|"branch-change", pollMs?: number (>=1000, default 5000), cwd?: string }\n' +
        '  - on="commit": fires when `git rev-parse HEAD` changes. Payload: { event, previous, current } where `previous`/`current` are commit SHAs.\n' +
        '  - on="branch-change": fires when the checked-out branch name changes.\n' +
        '  - process events are not implemented yet.\n\n' +
        '## promptTemplate\n\n' +
        'Optional. Supports `${key}` placeholders filled from the trigger payload (e.g. `${changedPath}` for file triggers, `${cronExpr}` for cron). Unknown placeholders are left verbatim. If omitted, a default descriptive prompt is generated.\n\n' +
        '## level\n\n' +
        'project (default) = `<projectRoot>/.qwen/triggers/<id>.md` — shared with the repo.\n' +
        'user = `~/.qwen/triggers/<id>.md` — personal, applies across all repos.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'Stable slug (letters, numbers, dot, dash, underscore). Becomes the filename.',
          },
          name: {
            type: 'string',
            description: 'Human-readable label. Defaults to id.',
          },
          kind: {
            type: 'string',
            enum: ['cron', 'file', 'webhook', 'chat', 'system'],
            description:
              'Trigger kind. See tool description for per-kind spec.',
          },
          agentRef: {
            type: 'string',
            description:
              'Subagent name (from `.qwen/agents/<name>.md`) that will be forked when this trigger fires.',
          },
          spec: {
            type: 'object',
            description: 'Kind-specific parameters (see description).',
            additionalProperties: true,
          },
          promptTemplate: {
            type: 'string',
            description:
              'Prompt to send to the forked subagent. Supports ${key} placeholders from the trigger payload.',
          },
          enabled: {
            type: 'boolean',
            description:
              'Defaults to true. Set false to create in disabled state.',
          },
          level: {
            type: 'string',
            enum: ['project', 'user'],
            description: 'Where to persist. Defaults to project.',
          },
        },
        required: ['id', 'kind', 'agentRef', 'spec'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: TriggerCreateParams,
  ): ToolInvocation<TriggerCreateParams, ToolResult> {
    return new TriggerCreateInvocation(this.config, params);
  }
}
