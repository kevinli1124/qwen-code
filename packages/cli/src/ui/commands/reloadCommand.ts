/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * /reload — explicit reconciler for memory indexes and persisted triggers.
 *
 * We deliberately avoid chokidar-style hot-watch on these resources:
 *   - memory writes happen through `memory_write`, so auto-watch would race
 *     with our own file writes;
 *   - trigger reconciliation has real side effects (webhook route churn,
 *     file-watcher reattachment, in-flight events), so a user-visible
 *     reload is safer than silent reattach.
 *
 * This command gives the user a single explicit entry point for both.
 */

import { getErrorMessage } from '@qwen-code/qwen-code-core';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';

type ReloadTarget = 'memory' | 'triggers' | 'all';

async function reloadMemory(
  context: Parameters<NonNullable<SlashCommand['action']>>[0],
): Promise<string> {
  const config = context.services.config;
  if (!config) return 'Memory reload skipped (no config).';
  await config.refreshHierarchicalMemory();
  const charCount = config.getUserMemory()?.length ?? 0;
  const fileCount = config.getGeminiMdFileCount?.() ?? 0;
  return `Memory reloaded: ${charCount} chars from ${fileCount} QWEN.md file(s), plus structured memory index.`;
}

async function reloadTriggers(
  context: Parameters<NonNullable<SlashCommand['action']>>[0],
): Promise<string> {
  const config = context.services.config;
  if (!config) return 'Trigger reload skipped (no config).';
  if (!config.isCronEnabled()) {
    return 'Trigger reload skipped (experimental cron/triggers disabled).';
  }
  const manager = config.getTriggerManager();
  await manager.stopAll();
  await manager.startAll();
  // listTriggers({ enabled: true }) re-reads the filesystem; match that count
  // so the user sees exactly how many are now running.
  const enabled = await manager.listTriggers({ enabled: true, force: true });
  return `Triggers reloaded: ${enabled.length} enabled trigger(s) running.`;
}

async function runTarget(
  target: ReloadTarget,
  context: Parameters<NonNullable<SlashCommand['action']>>[0],
): Promise<void> {
  const lines: string[] = [];
  const errors: string[] = [];

  const run = async (
    name: string,
    fn: () => Promise<string>,
  ): Promise<void> => {
    try {
      lines.push(await fn());
    } catch (err) {
      errors.push(`${name}: ${getErrorMessage(err)}`);
    }
  };

  if (target === 'memory' || target === 'all') {
    await run('memory', () => reloadMemory(context));
  }
  if (target === 'triggers' || target === 'all') {
    await run('triggers', () => reloadTriggers(context));
  }

  if (lines.length > 0) {
    context.ui.addItem(
      { type: MessageType.INFO, text: lines.join('\n') },
      Date.now(),
    );
  }
  if (errors.length > 0) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Reload errors:\n${errors.join('\n')}`,
      },
      Date.now(),
    );
  }
}

export const reloadCommand: SlashCommand = {
  name: 'reload',
  description:
    'Reload memory index and/or triggers from .qwen/ files without restarting. Explicit alternative to file watchers.',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args) => {
    await runTarget('all', context);
  },
  subCommands: [
    {
      name: 'memory',
      description:
        'Reload the memory index (.qwen/memory/MEMORY.md) and QWEN.md hierarchy.',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        await runTarget('memory', context);
      },
    },
    {
      name: 'triggers',
      description:
        'Reconcile persisted triggers (.qwen/triggers/*.md): stop removed, start new.',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        await runTarget('triggers', context);
      },
    },
    {
      name: 'all',
      description:
        'Reload memory + triggers. Same as /reload with no argument.',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        await runTarget('all', context);
      },
    },
  ],
};
