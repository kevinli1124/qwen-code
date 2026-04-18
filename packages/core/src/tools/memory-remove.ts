/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import type { MemoryScope } from '../memory/types.js';

export interface MemoryRemoveParams {
  name: string;
  scope?: MemoryScope;
}

class MemoryRemoveInvocation extends BaseToolInvocation<
  MemoryRemoveParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: MemoryRemoveParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return this.params.scope
      ? `${this.params.scope}:${this.params.name}`
      : this.params.name;
  }

  async execute(): Promise<ToolResult> {
    try {
      const store = this.config.getMemoryStore();
      await store.removeMemory(this.params.name, this.params.scope);
      try {
        await this.config.refreshHierarchicalMemory();
      } catch {
        // Non-fatal.
      }
      const msg = `Removed memory "${this.params.name}".`;
      return { llmContent: msg, returnDisplay: msg };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Error removing memory: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }
  }
}

export class MemoryRemoveTool extends BaseDeclarativeTool<
  MemoryRemoveParams,
  ToolResult
> {
  static readonly Name = ToolNames.MEMORY_REMOVE;

  constructor(private config: Config) {
    super(
      MemoryRemoveTool.Name,
      ToolDisplayNames.MEMORY_REMOVE,
      'Delete a structured memory file written by `memory_write`. Removes both the `.qwen/memory/<name>.md` file and its entry in the MEMORY.md index. If the same name exists at both user and project scope, pass `scope` to disambiguate.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Memory name (the slug).' },
          scope: {
            type: 'string',
            enum: ['user', 'project'],
            description:
              'Optional scope filter. If omitted, removes from whichever scope has the name (project takes precedence).',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: MemoryRemoveParams,
  ): ToolInvocation<MemoryRemoveParams, ToolResult> {
    return new MemoryRemoveInvocation(this.config, params);
  }
}
