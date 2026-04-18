/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';

export interface TriggerToggleParams {
  id: string;
  enabled: boolean;
}

class TriggerToggleInvocation extends BaseToolInvocation<
  TriggerToggleParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: TriggerToggleParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `${this.params.id} → ${this.params.enabled ? 'enabled' : 'disabled'}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const manager = this.config.getTriggerManager();
      const updated = await manager.toggleTrigger(
        this.params.id,
        this.params.enabled,
      );
      const msg = `Trigger "${updated.id}" is now ${updated.enabled ? 'enabled' : 'disabled'}.`;
      return { llmContent: msg, returnDisplay: msg };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Error toggling trigger: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }
  }
}

export class TriggerToggleTool extends BaseDeclarativeTool<
  TriggerToggleParams,
  ToolResult
> {
  static readonly Name = ToolNames.TRIGGER_TOGGLE;

  constructor(private config: Config) {
    super(
      TriggerToggleTool.Name,
      ToolDisplayNames.TRIGGER_TOGGLE,
      'Enable or disable a persisted trigger without deleting its config. Disabling stops the running trigger; enabling registers it.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Trigger id.' },
          enabled: {
            type: 'boolean',
            description: 'true to enable, false to disable.',
          },
        },
        required: ['id', 'enabled'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: TriggerToggleParams,
  ): ToolInvocation<TriggerToggleParams, ToolResult> {
    return new TriggerToggleInvocation(this.config, params);
  }
}
