/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * memory_write tool — create or update a structured memory file in
 * `.qwen/memory/<name>.md`. Also rebuilds the scope's MEMORY.md index.
 *
 * Complements the legacy `save_memory` tool: use `save_memory` for short
 * one-line bullet facts appended to QWEN.md; use `memory_write` when you
 * have a full topic worth its own file with Why / How-to-apply discipline.
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import type { Config } from '../config/config.js';
import type { MemoryType, MemoryScope } from '../memory/types.js';
import { findSimilarMemories } from '../utils/similarity.js';

export interface MemoryWriteParams {
  name: string;
  type: MemoryType;
  scope: MemoryScope;
  description: string;
  content: string;
  title?: string;
  agent?: string;
  overwrite?: boolean;
}

class MemoryWriteInvocation extends BaseToolInvocation<
  MemoryWriteParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: MemoryWriteParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `${this.params.scope}:${this.params.name} (${this.params.type})`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const store = this.config.getMemoryStore();

      // When overwrite is explicitly false, scan for near-duplicate entries
      // under a DIFFERENT name. An exact-name match is handled by the store's
      // ALREADY_EXISTS error. A semantic near-duplicate would not collide at
      // the file level but would pollute the index — surface it to the agent
      // so it can update the existing memory instead.
      if (this.params.overwrite === false) {
        const draftSlug = this.params.name;
        const all = await store.listMemories({ scope: this.params.scope });
        const candidates = all.filter((m) => m.name !== draftSlug);
        const hits = findSimilarMemories(
          {
            name: this.params.name,
            description: this.params.description,
            type: this.params.type,
          },
          candidates,
        );
        if (hits.length > 0) {
          const top = hits[0];
          const list = hits
            .slice(0, 3)
            .map(
              (h) =>
                `- ${h.item.name} (${h.item.type}, ${h.reason}, score=${h.score.toFixed(2)}): ${h.item.description}`,
            )
            .join('\n');
          const msg =
            `Skipped save: found ${hits.length} similar memor${hits.length === 1 ? 'y' : 'ies'} already in scope "${this.params.scope}". ` +
            `Consider updating "${top.item.name}" instead, or re-run with overwrite=true to force a new entry.\n\n` +
            `Top matches:\n${list}`;
          return {
            llmContent: msg,
            returnDisplay: `Similar memory exists: ${top.item.name}`,
          };
        }
      }

      const cfg = await store.writeMemory(
        {
          name: this.params.name,
          type: this.params.type,
          scope: this.params.scope,
          description: this.params.description,
          content: this.params.content,
          title: this.params.title,
          agent: this.params.agent,
        },
        { overwrite: this.params.overwrite !== false },
      );

      // Refresh the hierarchical memory so the updated index reaches the
      // system prompt on the next turn without a restart.
      try {
        await this.config.refreshHierarchicalMemory();
      } catch {
        // Non-fatal — next session will pick it up regardless.
      }

      const msg =
        `Saved memory "${cfg.name}" (${cfg.type}, ${cfg.scope}) at ${cfg.metadata?.filePath}. ` +
        `Index updated at .qwen/memory/MEMORY.md.`;
      return { llmContent: msg, returnDisplay: `Saved ${cfg.name}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Error saving memory: ${message}`,
        returnDisplay: message,
        error: { message },
      };
    }
  }
}

export class MemoryWriteTool extends BaseDeclarativeTool<
  MemoryWriteParams,
  ToolResult
> {
  static readonly Name = ToolNames.MEMORY_WRITE;

  constructor(private config: Config) {
    super(
      MemoryWriteTool.Name,
      ToolDisplayNames.MEMORY_WRITE,
      'Create or update a structured memory file in `.qwen/memory/<name>.md`. The body of the file is loaded on demand via `read_file`; only a one-line hook appears in the always-loaded `MEMORY.md` index.\n\n' +
        '## When to use this vs `save_memory`\n\n' +
        'Use `save_memory` for short bullet facts ("user likes pineapple on pizza") appended to QWEN.md. Use THIS tool when the fact deserves its own topic file with structured body — a user profile, a recurring feedback rule, a project decision, a reference pointer.\n\n' +
        '## Types\n\n' +
        '- `user`: who the user is, role, domain expertise, working habits\n' +
        '- `feedback`: a rule the user has given you. Body MUST include **Why:** and **How to apply:** lines.\n' +
        '- `project`: non-obvious facts about a specific project\n' +
        '- `decision`: an architectural/design decision and its motivation\n' +
        '- `reference`: pointer to an external system ("INGEST Linear project for pipeline bugs")\n\n' +
        '## Scope\n\n' +
        '- `user`: stored at `~/.qwen/memory/`, active across all projects\n' +
        '- `project`: stored at `<projectRoot>/.qwen/memory/`, only while working inside this repo\n\n' +
        '## Structure\n\n' +
        'Body is Markdown. For feedback/decision memories, follow this pattern:\n\n' +
        '```\n' +
        'The rule/fact itself in one sentence.\n\n' +
        '**Why:** what past incident / user preference drove this.\n' +
        '**How to apply:** when does this guidance actually kick in.\n' +
        '```\n\n' +
        'Prefer updating an existing memory over creating a near-duplicate. If a similar topic is already in the index, update that entry instead.\n\n' +
        '## Agent-scoped memory\n\n' +
        'Set `agent` to the name of a subagent to make this memory auto-loaded whenever that agent is forked. Example: `{ agent: "code-reviewer", ... }`. Leave unset for session-wide memories.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Slug used as the filename (letters, digits, dot, dash, underscore). Example: "user_role", "feedback_workflow".',
          },
          type: {
            type: 'string',
            enum: ['user', 'feedback', 'project', 'decision', 'reference'],
            description: 'Memory category. See tool description.',
          },
          scope: {
            type: 'string',
            enum: ['user', 'project'],
            description:
              '"user" for cross-project personal memory (~/.qwen/memory/); "project" for this-repo-only memory.',
          },
          description: {
            type: 'string',
            description:
              'One-line hook (≤150 chars). This appears in the always-loaded index; make it specific enough that an agent can decide if reading the full file is relevant.',
          },
          content: {
            type: 'string',
            description:
              'The full memory body (Markdown). For feedback/decision types include **Why:** and **How to apply:**.',
          },
          title: {
            type: 'string',
            description:
              'Human-readable title for the index. Defaults to a titlecased name.',
          },
          agent: {
            type: 'string',
            description:
              "Optional subagent name. When set, this memory is auto-injected into that agent's system prompt whenever it is forked.",
          },
          overwrite: {
            type: 'boolean',
            description:
              'Allow overwriting an existing memory with the same name. Defaults to true. ' +
              'Pass `false` to also activate semantic near-duplicate detection: if a ' +
              'similar memory already exists under a different name, the call returns a ' +
              '`similar memory exists` notice instead of writing, letting you update the ' +
              'existing entry rather than creating a parallel one.',
          },
        },
        required: ['name', 'type', 'scope', 'description', 'content'],
        additionalProperties: false,
      },
    );
  }

  protected createInvocation(
    params: MemoryWriteParams,
  ): ToolInvocation<MemoryWriteParams, ToolResult> {
    return new MemoryWriteInvocation(this.config, params);
  }
}
