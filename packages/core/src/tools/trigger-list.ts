/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * trigger_list tool — lists persisted triggers from `.qwen/triggers/`.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import type { TriggerKind } from '../triggers/types.js';

export interface TriggerListParams {
  kind?: TriggerKind;
  enabled?: boolean;
}

class TriggerListInvocation extends BaseToolInvocation<
  TriggerListParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: TriggerListParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const parts: string[] = [];
    if (this.params.kind) parts.push(`kind=${this.params.kind}`);
    if (this.params.enabled !== undefined) {
      parts.push(`enabled=${this.params.enabled}`);
    }
    return parts.join(' ') || 'all';
  }

  async execute(): Promise<ToolResult> {
    const manager = this.config.getTriggerManager();
    const triggers = await manager.listTriggers({
      kind: this.params.kind,
      enabled: this.params.enabled,
      force: true,
    });
    if (triggers.length === 0) {
      const msg = 'No triggers found.';
      return { llmContent: msg, returnDisplay: msg };
    }
    const lines = triggers.map((t) => {
      const state = t.enabled ? 'enabled' : 'disabled';
      const level = t.metadata?.level ?? 'project';
      return `${t.id} [${t.kind}] → ${t.agentRef} (${state}, ${level})`;
    });
    return {
      llmContent: lines.join('\n'),
      returnDisplay: lines.join('\n'),
    };
  }
}

export class TriggerListTool extends BaseDeclarativeTool<
  TriggerListParams,
  ToolResult
> {
  static readonly Name = ToolNames.TRIGGER_LIST;

  constructor(private config: Config) {
    super(
      TriggerListTool.Name,
      ToolDisplayNames.TRIGGER_LIST,
      'List persisted triggers from `.qwen/triggers/` (project and user levels). Optional filters: kind, enabled.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['cron', 'file', 'webhook', 'chat', 'system'],
            description: 'Filter by trigger kind.',
          },
          enabled: {
            type: 'boolean',
            description: 'Filter by enabled state.',
          },
        },
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: TriggerListParams,
  ): ToolInvocation<TriggerListParams, ToolResult> {
    return new TriggerListInvocation(this.config, params);
  }
}
