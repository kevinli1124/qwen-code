/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MessageTrigger } from './message-trigger.js';
import type {
  IncomingMessage,
  MessagingGateway,
  OutgoingMessage,
} from '../messaging/types.js';
import type { TriggerConfig } from './types.js';
import { TriggerError } from './types.js';

function makeConfig(overrides: Partial<TriggerConfig> = {}): TriggerConfig {
  return {
    id: 'tg-smoke',
    name: 'Telegram smoke',
    kind: 'message',
    enabled: true,
    agentRef: '',
    spec: { channel: 'telegram' },
    ...overrides,
  };
}

function makeFakeGateway() {
  let onMsg: ((m: IncomingMessage) => Promise<void> | void) | null = null;
  const sent: OutgoingMessage[] = [];
  const gateway: MessagingGateway = {
    channel: 'telegram',
    start: vi.fn(async (cb) => {
      onMsg = cb;
    }),
    stop: vi.fn(async () => {
      onMsg = null;
    }),
    send: vi.fn(async (m) => {
      sent.push(m);
    }),
  };
  return {
    gateway,
    sent,
    emit: (m: IncomingMessage) => onMsg?.(m),
  };
}

/** Minimal subagent manager stub that hands back a fake AgentHeadless. */
function makeSubagentManager(replyText = 'pong') {
  return {
    loadSubagent: vi.fn(async () => null),
    createAgentHeadless: vi.fn(async () => {
      let finalText = '';
      return {
        execute: vi.fn(async () => {
          finalText = replyText;
        }),
        getFinalText: () => finalText,
      } as unknown as import('../agents/runtime/agent-headless.js').AgentHeadless;
    }),
  };
}

describe('MessageTrigger', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-msg-trig-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  function buildDeps(subagentManager?: ReturnType<typeof makeSubagentManager>) {
    return {
      cronScheduler: {} as never,
      config: { getProjectRoot: () => tmp } as never,
      subagentManager: (subagentManager ?? makeSubagentManager()) as never,
    };
  }

  describe('validate', () => {
    it('rejects missing channel', () => {
      const t = new MessageTrigger(makeConfig({ spec: {} }), buildDeps());
      expect(() => t.validate()).toThrow(TriggerError);
    });

    it('rejects unsupported channels (phase 1 is telegram-only)', () => {
      const t = new MessageTrigger(
        makeConfig({ spec: { channel: 'discord' } }),
        buildDeps(),
      );
      expect(() => t.validate()).toThrow(/telegram/);
    });

    it('rejects non-string-array allowedUserIds', () => {
      const t = new MessageTrigger(
        makeConfig({
          spec: { channel: 'telegram', allowedUserIds: [1 as never] },
        }),
        buildDeps(),
      );
      expect(() => t.validate()).toThrow(TriggerError);
    });

    it('rejects non-positive historyWindow bounds', () => {
      const t = new MessageTrigger(
        makeConfig({
          spec: { channel: 'telegram', historyWindow: { maxMessages: -1 } },
        }),
        buildDeps(),
      );
      expect(() => t.validate()).toThrow(TriggerError);
    });

    it('rejects when host deps are missing', () => {
      const t = new MessageTrigger(makeConfig(), {
        cronScheduler: {} as never,
      });
      expect(() => t.validate()).toThrow(/Config \+ SubagentManager/);
    });

    it('accepts a minimal valid spec', () => {
      const t = new MessageTrigger(makeConfig(), buildDeps());
      expect(() => t.validate()).not.toThrow();
    });
  });

  describe('start → dispatch → stop', () => {
    it('wires gateway to dispatcher: incoming → agent → reply', async () => {
      const subMgr = makeSubagentManager('echo-reply');
      const fake = makeFakeGateway();
      const trigger = new MessageTrigger(makeConfig(), buildDeps(subMgr), {
        create: () => fake.gateway,
      });
      trigger.validate();
      await trigger.start(() => {});

      await fake.emit({
        channel: 'telegram',
        chatId: '99',
        senderId: '1',
        text: 'hi',
        timestamp: 1,
        externalId: 'x',
      });

      expect(subMgr.createAgentHeadless).toHaveBeenCalledTimes(1);
      expect(fake.sent).toHaveLength(1);
      expect(fake.sent[0].text).toBe('echo-reply');

      // Conversation JSONL got created under the temp project root
      const convFile = path.join(
        tmp,
        '.qwen',
        'conversations',
        'telegram_99.jsonl',
      );
      const raw = await fs.readFile(convFile, 'utf8');
      expect(raw.trim().split('\n')).toHaveLength(2);

      await trigger.stop();
      expect(fake.gateway.stop).toHaveBeenCalled();
    });

    it('start is idempotent', async () => {
      const fake = makeFakeGateway();
      const trigger = new MessageTrigger(makeConfig(), buildDeps(), {
        create: () => fake.gateway,
      });
      trigger.validate();
      await trigger.start(() => {});
      await trigger.start(() => {});
      expect(fake.gateway.start).toHaveBeenCalledTimes(1);
      await trigger.stop();
    });

    it('fireManually is invoked for observability on each incoming', async () => {
      const fake = makeFakeGateway();
      const trigger = new MessageTrigger(makeConfig(), buildDeps(), {
        create: () => fake.gateway,
      });
      trigger.validate();
      const onFire = vi.fn();
      await trigger.start(onFire);
      await fake.emit({
        channel: 'telegram',
        chatId: '1',
        senderId: '1',
        text: 'x',
        timestamp: 0,
      });
      expect(onFire).toHaveBeenCalledTimes(1);
      const ctx = onFire.mock.calls[0][0];
      expect(ctx.payload.chatId).toBe('1');
      expect(ctx.kind).toBe('message');
      await trigger.stop();
    });
  });
});
