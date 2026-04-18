/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { reloadCommand } from './reloadCommand.js';
import { type CommandContext, type SlashCommand } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

interface MockConfigShape {
  refreshHierarchicalMemory: ReturnType<typeof vi.fn>;
  getUserMemory: ReturnType<typeof vi.fn>;
  getGeminiMdFileCount: ReturnType<typeof vi.fn>;
  isCronEnabled: ReturnType<typeof vi.fn>;
  getTriggerManager: ReturnType<typeof vi.fn>;
}

function findSub(name: string): SlashCommand {
  const sub = reloadCommand.subCommands?.find((c) => c.name === name);
  if (!sub) throw new Error(`subcommand ${name} not found`);
  return sub;
}

describe('/reload', () => {
  let mockContext: CommandContext;
  let mockConfig: MockConfigShape;
  let mockTriggerManager: {
    stopAll: ReturnType<typeof vi.fn>;
    startAll: ReturnType<typeof vi.fn>;
    listTriggers: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTriggerManager = {
      stopAll: vi.fn().mockResolvedValue(undefined),
      startAll: vi.fn().mockResolvedValue(undefined),
      listTriggers: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
    };
    mockConfig = {
      refreshHierarchicalMemory: vi.fn().mockResolvedValue(undefined),
      getUserMemory: vi.fn().mockReturnValue('memory content'),
      getGeminiMdFileCount: vi.fn().mockReturnValue(2),
      isCronEnabled: vi.fn().mockReturnValue(true),
      getTriggerManager: vi.fn().mockReturnValue(mockTriggerManager),
    };
    mockContext = createMockCommandContext({
      services: {
        config: mockConfig as unknown as CommandContext['services']['config'],
      },
    });
  });

  describe('root /reload', () => {
    it('reloads both memory and triggers', async () => {
      await reloadCommand.action!(mockContext, '');

      expect(mockConfig.refreshHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockTriggerManager.stopAll).toHaveBeenCalledTimes(1);
      expect(mockTriggerManager.startAll).toHaveBeenCalledTimes(1);

      expect(mockContext.ui.addItem).toHaveBeenCalledTimes(1);
      const call = (
        mockContext.ui.addItem as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0][0] as { type: string; text: string };
      expect(call.type).toBe(MessageType.INFO);
      expect(call.text).toContain('Memory reloaded');
      expect(call.text).toContain(
        'Triggers reloaded: 2 enabled trigger(s) running.',
      );
    });

    it('still reports memory when trigger reload fails', async () => {
      mockTriggerManager.startAll.mockRejectedValueOnce(new Error('boom'));
      await reloadCommand.action!(mockContext, '');

      // Two items: success block (memory) + error block (triggers).
      expect(mockContext.ui.addItem).toHaveBeenCalledTimes(2);
      const calls = (
        mockContext.ui.addItem as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls;
      const infoText = (calls[0][0] as { text: string }).text;
      const errorItem = calls[1][0] as { type: string; text: string };
      expect(infoText).toContain('Memory reloaded');
      expect(errorItem.type).toBe(MessageType.ERROR);
      expect(errorItem.text).toContain('triggers: boom');
    });
  });

  describe('/reload memory', () => {
    it('only touches memory', async () => {
      await findSub('memory').action!(mockContext, '');
      expect(mockConfig.refreshHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockTriggerManager.stopAll).not.toHaveBeenCalled();
      expect(mockTriggerManager.startAll).not.toHaveBeenCalled();
    });
  });

  describe('/reload triggers', () => {
    it('only touches triggers', async () => {
      await findSub('triggers').action!(mockContext, '');
      expect(mockConfig.refreshHierarchicalMemory).not.toHaveBeenCalled();
      expect(mockTriggerManager.stopAll).toHaveBeenCalledTimes(1);
      expect(mockTriggerManager.startAll).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when cron/triggers are disabled', async () => {
      mockConfig.isCronEnabled.mockReturnValue(false);
      await findSub('triggers').action!(mockContext, '');
      expect(mockTriggerManager.stopAll).not.toHaveBeenCalled();
      expect(mockTriggerManager.startAll).not.toHaveBeenCalled();
      const item = (
        mockContext.ui.addItem as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0][0] as { text: string };
      expect(item.text).toContain('experimental cron/triggers disabled');
    });
  });

  describe('/reload all', () => {
    it('matches the root command behavior', async () => {
      await findSub('all').action!(mockContext, '');
      expect(mockConfig.refreshHierarchicalMemory).toHaveBeenCalledTimes(1);
      expect(mockTriggerManager.startAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('no config', () => {
    it('does not throw when config is null', async () => {
      const ctx = createMockCommandContext({ services: { config: null } });
      await reloadCommand.action!(ctx, '');
      // Should still post the skip messages; never throw.
      expect(ctx.ui.addItem).toHaveBeenCalled();
    });
  });
});
