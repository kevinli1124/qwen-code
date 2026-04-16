/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
  type OpenDialogActionReturn,
  type MessageActionReturn,
} from './types.js';
import { t } from '../../i18n/index.js';
import { SubagentManager } from '@qwen-code/qwen-code-core';

function formatAgentList(
  agents: Array<{
    name: string;
    level: string;
    tools?: string[];
    model?: string;
    description: string;
  }>,
): string {
  if (agents.length === 0) {
    return 'No subagents registered.';
  }

  // Group by level for readable output
  const byLevel: Record<string, typeof agents> = {};
  for (const a of agents) {
    (byLevel[a.level] ??= []).push(a);
  }

  const levelOrder = ['session', 'project', 'user', 'extension', 'builtin'];
  const lines: string[] = [
    `Registered subagents (${agents.length} total):`,
    '',
  ];

  for (const level of levelOrder) {
    const group = byLevel[level];
    if (!group || group.length === 0) continue;
    lines.push(`[${level}] — ${group.length}`);
    for (const a of group) {
      const toolSummary = a.tools ? `${a.tools.length} tools` : 'all tools';
      const modelTag = a.model && a.model !== 'inherit' ? ` · ${a.model}` : '';
      lines.push(`  ${a.name.padEnd(20)} ${toolSummary.padEnd(10)}${modelTag}`);
      // First sentence of description, max 80 chars
      const firstSentence = a.description.split(/[.。\n]/)[0].trim();
      const desc =
        firstSentence.length > 80
          ? firstSentence.slice(0, 77) + '...'
          : firstSentence;
      if (desc) lines.push(`    ${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export const agentsCommand: SlashCommand = {
  name: 'agents',
  get description() {
    return t('Manage subagents for specialized task delegation.');
  },
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      get description() {
        return t('List all registered subagents inline (no dialog).');
      },
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext): Promise<MessageActionReturn> => {
        const config = context.services.config;
        if (!config) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Config not available.',
          };
        }
        try {
          const mgr = new SubagentManager(config);
          const agents = await mgr.listSubagents();
          return {
            type: 'message',
            messageType: 'info',
            content: formatAgentList(agents),
          };
        } catch (err) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to list subagents: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    },
    {
      name: 'manage',
      get description() {
        return t('Manage existing subagents (view, edit, delete).');
      },
      kind: CommandKind.BUILT_IN,
      action: (): OpenDialogActionReturn => ({
        type: 'dialog',
        dialog: 'subagent_list',
      }),
    },
    {
      name: 'create',
      get description() {
        return t('Create a new subagent with guided setup.');
      },
      kind: CommandKind.BUILT_IN,
      action: (): OpenDialogActionReturn => ({
        type: 'dialog',
        dialog: 'subagent_create',
      }),
    },
  ],
};
