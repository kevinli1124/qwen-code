/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TriggerManager } from './trigger-manager.js';
import { CronScheduler } from '../services/cronScheduler.js';
import { TriggerError } from './types.js';
import type { Config } from '../config/config.js';
import type { SubagentManager } from '../subagents/subagent-manager.js';
import type { SubagentConfig } from '../subagents/types.js';

vi.mock('fs/promises');
vi.mock('os');

function fakeSubagentConfig(name: string): SubagentConfig {
  return {
    name,
    description: 'test',
    systemPrompt: 'you are a test agent',
    level: 'project',
    filePath: `/test/project/.qwen/agents/${name}.md`,
  } as SubagentConfig;
}

describe('TriggerManager', () => {
  let scheduler: CronScheduler;
  let mockConfig: Config;
  let mockSubagentManager: SubagentManager;
  let agentExecute: ReturnType<typeof vi.fn>;
  let manager: TriggerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    scheduler = new CronScheduler();
    agentExecute = vi.fn().mockResolvedValue(undefined);
    mockConfig = {
      getProjectRoot: () => '/test/project',
      getCronScheduler: () => scheduler,
    } as unknown as Config;
    mockSubagentManager = {
      loadSubagent: vi.fn(async (name: string) => fakeSubagentConfig(name)),
      createAgentHeadless: vi.fn(async () => ({ execute: agentExecute })),
    } as unknown as SubagentManager;
    manager = new TriggerManager(mockConfig, mockSubagentManager);
  });

  afterEach(() => {
    scheduler.destroy();
  });

  describe('listTriggers / startAll', () => {
    it('returns empty list when directory missing', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      const list = await manager.listTriggers();
      expect(list).toEqual([]);
    });

    it('parses YAML frontmatter triggers', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('project')) return ['daily.md'] as never;
        return [] as never;
      });
      vi.mocked(fs.readFile).mockResolvedValue(
        [
          '---',
          'id: daily',
          'name: Daily Task',
          'kind: cron',
          'enabled: true',
          'agentRef: reviewer',
          'spec:',
          '  cron: "0 9 * * *"',
          '---',
          'review the day',
        ].join('\n'),
      );

      const list = await manager.listTriggers({ force: true });
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('daily');
      expect(list[0].kind).toBe('cron');
      expect(list[0].agentRef).toBe('reviewer');
      expect(list[0].promptTemplate).toBe('review the day');
      expect(list[0].metadata?.level).toBe('project');
    });

    it('skips invalid trigger files', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('project')) {
          return ['bad.md', 'good.md'] as never;
        }
        return [] as never;
      });
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        if (String(p).endsWith('bad.md')) return 'not yaml frontmatter';
        return [
          '---',
          'id: good',
          'name: Good',
          'kind: cron',
          'enabled: true',
          'agentRef: reviewer',
          'spec:',
          '  cron: "*/5 * * * *"',
          '---',
        ].join('\n');
      });
      const list = await manager.listTriggers({ force: true });
      expect(list.map((t) => t.id)).toEqual(['good']);
    });

    it('startAll registers enabled triggers with the scheduler', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('project')) return ['a.md', 'b.md'] as never;
        return [] as never;
      });
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const id = path.basename(String(p), '.md');
        return [
          '---',
          `id: ${id}`,
          `name: ${id}`,
          'kind: cron',
          `enabled: ${id === 'a'}`,
          'agentRef: reviewer',
          'spec:',
          '  cron: "*/5 * * * *"',
          '---',
        ].join('\n');
      });
      await manager.startAll();
      expect(manager.isStarted).toBe(true);
      expect(scheduler.size).toBe(1); // only 'a' is enabled
      expect(manager.getTrigger('a')).toBeDefined();
      expect(manager.getTrigger('b')).toBeUndefined();
    });
  });

  describe('tryHandleCronFire', () => {
    it('invokes the bound agent for trigger-owned jobs', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('project')) return ['a.md'] as never;
        return [] as never;
      });
      vi.mocked(fs.readFile).mockResolvedValue(
        [
          '---',
          'id: a',
          'name: A',
          'kind: cron',
          'enabled: true',
          'agentRef: reviewer',
          'spec:',
          '  cron: "*/5 * * * *"',
          '---',
          'Hello ${cronExpr}',
        ].join('\n'),
      );
      await manager.startAll();
      const [job] = scheduler.list();
      const handled = await manager.tryHandleCronFire(job);
      expect(handled).toBe(true);
      expect(mockSubagentManager.loadSubagent).toHaveBeenCalledWith('reviewer');
      expect(mockSubagentManager.createAgentHeadless).toHaveBeenCalled();
      expect(agentExecute).toHaveBeenCalled();
    });

    it('returns false for legacy cron jobs', async () => {
      const job = scheduler.create('*/5 * * * *', 'plain prompt', true);
      const handled = await manager.tryHandleCronFire(job);
      expect(handled).toBe(false);
      expect(agentExecute).not.toHaveBeenCalled();
    });

    it('returns false for trigger jobs with unknown trigger id', async () => {
      const job = scheduler.create('*/5 * * * *', '__trigger__:ghost', true);
      const handled = await manager.tryHandleCronFire(job);
      expect(handled).toBe(false);
    });
  });

  describe('invokeAgent', () => {
    it('throws when the agent is not found', async () => {
      vi.mocked(mockSubagentManager.loadSubagent).mockResolvedValue(null);
      const cfg = {
        id: 'x',
        name: 'X',
        kind: 'cron' as const,
        enabled: true,
        agentRef: 'missing',
        spec: { cron: '*/5 * * * *' },
      };
      await expect(
        manager.invokeAgent(cfg, {
          triggerId: 'x',
          kind: 'cron',
          firedAt: 0,
          payload: {},
        }),
      ).rejects.toBeInstanceOf(TriggerError);
    });

    it('renders ${...} placeholders from payload', async () => {
      vi.mocked(mockSubagentManager.loadSubagent).mockResolvedValue(
        fakeSubagentConfig('reviewer'),
      );
      const cfg = {
        id: 'x',
        name: 'X',
        kind: 'cron' as const,
        enabled: true,
        agentRef: 'reviewer',
        spec: { cron: '*/5 * * * *' },
        promptTemplate: 'cron=${cronExpr}, kind=${trigger.kind}',
      };
      await manager.invokeAgent(cfg, {
        triggerId: 'x',
        kind: 'cron',
        firedAt: 123,
        payload: { cronExpr: '*/5 * * * *' },
      });
      // Inspect the ContextState passed to execute.
      const contextArg = agentExecute.mock.calls[0][0];
      expect(contextArg.get('task_prompt')).toBe('cron=*/5 * * * *, kind=cron');
      expect(contextArg.get('trigger')).toBeDefined();
    });
  });
});
