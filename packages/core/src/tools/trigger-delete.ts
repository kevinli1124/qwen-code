/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';

export interface TriggerDeleteParams {
  id: string;
}

class TriggerDeleteInvocation extends BaseToolInvocation<
  TriggerDeleteParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: TriggerDeleteParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return this.params.id;
  }

  async execute(): Promise<ToolResult> {
    try {
      const manager = this.config.getTriggerManager();
      await manager.deleteTrigger(this.params.id);
      const msg = `Deleted trigger "${this.params.id}".`;
      return { llmContent: msg, returnDisplay: msg };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Error deleting trigger: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }
  }
}

export class TriggerDeleteTool extends BaseDeclarativeTool<
  TriggerDeleteParams,
  ToolResult
> {
  static readonly Name = ToolNames.TRIGGER_DELETE;

  constructor(private config: Config) {
    super(
      TriggerDeleteTool.Name,
      ToolDisplayNames.TRIGGER_DELETE,
      'Delete a persisted trigger by id. Removes the file from `.qwen/triggers/` and stops the running trigger if any.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Trigger id to delete.' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: TriggerDeleteParams,
  ): ToolInvocation<TriggerDeleteParams, ToolResult> {
    return new TriggerDeleteInvocation(this.config, params);
  }
}
