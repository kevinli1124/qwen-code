/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Content } from '@google/genai';
import { ConversationStore } from './conversation-store.js';
import { MessageDispatcher } from './dispatcher.js';
import { DEFAULT_AGENT_NAME } from './default-agent.js';
import type {
  IncomingMessage,
  MessagingGateway,
  OutgoingMessage,
} from './types.js';
import type { SubagentConfig } from '../subagents/types.js';

interface CapturedExecute {
  taskPrompt: string;
  extraHistory: Content[];
  incoming: unknown;
}

/**
 * Test fixture — a stand-in for SubagentManager + AgentHeadless that captures
 * what the dispatcher passed and lets tests program the reply.
 */
function makeSubagentManagerMock(
  options: {
    replyText?: string | ((captured: CapturedExecute) => string);
    throwOnExecute?: boolean;
    knownAgents?: string[];
  } = {},
) {
  const captured: CapturedExecute[] = [];
  const createAgentHeadless = vi.fn(
    async (_subagent: SubagentConfig, _config: unknown) => {
      let finalText = '';
      return {
        execute: vi.fn(
          async (
            contextState: { get: (k: string) => unknown },
            _signal: unknown,
            opts?: { extraHistory?: Content[] },
          ) => {
            const entry: CapturedExecute = {
              taskPrompt: String(contextState.get('task_prompt')),
              extraHistory: (opts?.extraHistory ?? []) as Content[],
              incoming: contextState.get('incoming'),
            };
            captured.push(entry);
            if (options.throwOnExecute) {
              throw new Error('boom');
            }
            finalText =
              typeof options.replyText === 'function'
                ? options.replyText(entry)
                : (options.replyText ?? 'default-reply');
          },
        ),
        getFinalText: () => finalText,
      } as unknown as import('../agents/runtime/agent-headless.js').AgentHeadless;
    },
  );
  const loadSubagent = vi.fn(async (name: string) => {
    const known = options.knownAgents ?? [];
    if (!known.includes(name)) return null;
    return {
      name,
      description: 'mock',
      systemPrompt: 'mock prompt',
      level: 'project',
    } as SubagentConfig;
  });
  return {
    captured,
    subagentManager: { createAgentHeadless, loadSubagent },
    createAgentHeadless,
    loadSubagent,
  };
}

function makeGatewayMock(options: { withTyping?: boolean } = {}) {
  const sent: OutgoingMessage[] = [];
  const typingCalls: string[] = [];
  const gateway: MessagingGateway = {
    channel: 'telegram',
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    send: vi.fn(async (msg: OutgoingMessage) => {
      sent.push(msg);
    }),
    ...(options.withTyping
      ? {
          sendTypingIndicator: vi.fn(async (chatId: string) => {
            typingCalls.push(chatId);
          }),
        }
      : {}),
  };
  return { gateway, sent, typingCalls };
}

function makeIncoming(
  overrides: Partial<IncomingMessage> = {},
): IncomingMessage {
  return {
    channel: 'telegram',
    chatId: '42',
    senderId: '1',
    senderName: 'sky',
    text: 'hello',
    timestamp: 1700000000000,
    externalId: '77',
    ...overrides,
  };
}

describe('MessageDispatcher', () => {
  let tmp: string;
  let store: ConversationStore;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-disp-'));
    store = new ConversationStore(tmp);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  describe('typing indicator', () => {
    it('calls sendTypingIndicator immediately when the gateway supports it', async () => {
      const { subagentManager } = makeSubagentManagerMock({ replyText: 'ok' });
      const { gateway, typingCalls } = makeGatewayMock({ withTyping: true });
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
      );

      await dispatcher.onIncoming(makeIncoming({ chatId: '42' }));

      expect(typingCalls.length).toBeGreaterThanOrEqual(1);
      expect(typingCalls[0]).toBe('42');
    });

    it('is a no-op for gateways without typing support', async () => {
      const { subagentManager } = makeSubagentManagerMock({ replyText: 'ok' });
      // makeGatewayMock() with no args omits sendTypingIndicator.
      const { gateway, sent } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
      );

      // Must not throw despite the missing capability.
      await dispatcher.onIncoming(makeIncoming());
      expect(sent).toHaveLength(1);
    });

    it('stops the refresh loop when the dispatch finishes', async () => {
      const { subagentManager } = makeSubagentManagerMock({ replyText: 'ok' });
      const { gateway, typingCalls } = makeGatewayMock({ withTyping: true });
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
      );

      await dispatcher.onIncoming(makeIncoming());
      const callsAfterDispatch = typingCalls.length;
      // Give the old interval a full refresh window to misbehave; clearInterval
      // should have killed it, so the count must not grow.
      await new Promise((r) => setTimeout(r, 50));
      expect(typingCalls.length).toBe(callsAfterDispatch);
    });
  });

  describe('happy path', () => {
    it('persists user turn, forks agent, captures reply, persists + sends it', async () => {
      const { subagentManager, createAgentHeadless, captured } =
        makeSubagentManagerMock({
          replyText: 'hi from agent',
        });
      const { gateway, sent } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
      );

      await dispatcher.onIncoming(makeIncoming({ text: 'first' }));

      // Agent received correct task_prompt
      expect(captured).toHaveLength(1);
      expect(captured[0].taskPrompt).toBe('first');
      expect(captured[0].extraHistory).toEqual([]);

      // Agent was created once with the default (synthetic) config
      expect(createAgentHeadless).toHaveBeenCalledTimes(1);
      const [subagentArg] = createAgentHeadless.mock.calls[0];
      expect((subagentArg as SubagentConfig).name).toBe(DEFAULT_AGENT_NAME);

      // User + assistant rows landed in the store
      const all = await store.readAll('telegram', '42');
      expect(all.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(all[0].text).toBe('first');
      expect(all[1].text).toBe('hi from agent');

      // Reply was threaded back via the gateway
      expect(sent).toHaveLength(1);
      expect(sent[0].chatId).toBe('42');
      expect(sent[0].text).toBe('hi from agent');
      expect(sent[0].replyToExternalId).toBe('77');
    });
  });

  describe('history injection', () => {
    it('passes prior turns as extraHistory and does NOT duplicate the current turn', async () => {
      // Pre-populate three prior turns.
      await store.append('telegram', '42', {
        role: 'user',
        text: 'older-q',
        timestamp: 1,
      });
      await store.append('telegram', '42', {
        role: 'assistant',
        text: 'older-a',
        timestamp: 2,
      });
      await store.append('telegram', '42', {
        role: 'user',
        text: 'mid-q',
        timestamp: 3,
      });

      const { subagentManager, captured } = makeSubagentManagerMock({
        replyText: 'ok',
      });
      const { gateway } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
      );

      await dispatcher.onIncoming(makeIncoming({ text: 'new-q' }));

      const extra = captured[0].extraHistory;
      // The three prior turns, correctly mapped — assistant → 'model' role.
      expect(extra).toEqual([
        { role: 'user', parts: [{ text: 'older-q' }] },
        { role: 'model', parts: [{ text: 'older-a' }] },
        { role: 'user', parts: [{ text: 'mid-q' }] },
      ]);
      // Current user text is task_prompt, not part of extraHistory.
      expect(captured[0].taskPrompt).toBe('new-q');
      expect(extra.some((c) => c.parts?.[0].text === 'new-q')).toBe(false);
    });

    it('respects historyWindow.maxMessages', async () => {
      for (let i = 0; i < 10; i++) {
        await store.append('telegram', '42', {
          role: i % 2 === 0 ? 'user' : 'assistant',
          text: `m${i}`,
          timestamp: i + 1,
        });
      }

      const { subagentManager, captured } = makeSubagentManagerMock({
        replyText: 'ok',
      });
      const { gateway } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
        { historyWindow: { maxMessages: 3 } },
      );

      await dispatcher.onIncoming(makeIncoming({ text: 'now' }));

      expect(captured[0].extraHistory).toHaveLength(3);
      expect(captured[0].extraHistory[2].parts?.[0].text).toBe('m9');
    });

    it('prompt prefix is applied to task_prompt', async () => {
      const { subagentManager, captured } = makeSubagentManagerMock({
        replyText: 'ok',
      });
      const { gateway } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
        { promptPrefix: '[Telegram]' },
      );

      await dispatcher.onIncoming(makeIncoming({ text: 'do the thing' }));
      expect(captured[0].taskPrompt).toBe('[Telegram] do the thing');
    });
  });

  describe('agent resolution', () => {
    it('uses the named subagent when agentRef is set', async () => {
      const { subagentManager, createAgentHeadless, loadSubagent } =
        makeSubagentManagerMock({
          replyText: 'from-persona',
          knownAgents: ['persona'],
        });
      const { gateway } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
        { agentRef: 'persona' },
      );

      await dispatcher.onIncoming(makeIncoming());
      expect(loadSubagent).toHaveBeenCalledWith('persona');
      expect(
        (createAgentHeadless.mock.calls[0][0] as SubagentConfig).name,
      ).toBe('persona');
    });

    it('sends an error reply when agentRef points to a missing agent', async () => {
      const { subagentManager } = makeSubagentManagerMock({
        knownAgents: [],
      });
      const { gateway, sent } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
        { agentRef: 'ghost' },
      );

      await dispatcher.onIncoming(makeIncoming());
      // Error reply was sent through the same gateway.
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toMatch(/error/i);
    });
  });

  describe('error handling', () => {
    it('sends the errorReply when agent execution throws', async () => {
      const { subagentManager } = makeSubagentManagerMock({
        throwOnExecute: true,
      });
      const { gateway, sent } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
        { errorReply: 'try again' },
      );

      await dispatcher.onIncoming(makeIncoming());
      expect(sent).toHaveLength(1);
      // Error text is now: "try again\n\n(<short detail>)" — the bracketed
      // detail helps the owner debug from Telegram. The configured base
      // message is still the lead.
      expect(sent[0].text.startsWith('try again')).toBe(true);
      expect(sent[0].text).toContain('boom');
    });

    it('suppresses the error reply when errorReply is empty string', async () => {
      const { subagentManager } = makeSubagentManagerMock({
        throwOnExecute: true,
      });
      const { gateway, sent } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
        { errorReply: '' },
      );

      await dispatcher.onIncoming(makeIncoming());
      expect(sent).toHaveLength(0);
    });

    it('preserves the user turn in the store even on agent failure', async () => {
      const { subagentManager } = makeSubagentManagerMock({
        throwOnExecute: true,
      });
      const { gateway } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
      );

      await dispatcher.onIncoming(makeIncoming({ text: 'remember me' }));
      const all = await store.readAll('telegram', '42');
      expect(all.map((m) => m.role)).toEqual(['user']);
      expect(all[0].text).toBe('remember me');
    });

    it('sends a diagnostic fallback when the agent produces empty text', async () => {
      // Rationale: silent failure confuses users ("did the bot die?"). We
      // changed the contract to surface a short message explaining why there
      // was no reply. The assistant turn is still NOT persisted (no real
      // content to save), so readAll remains a single user turn.
      const { subagentManager } = makeSubagentManagerMock({ replyText: '   ' });
      const { gateway, sent } = makeGatewayMock();
      const dispatcher = new MessageDispatcher(
        {
          config: {} as never,
          subagentManager: subagentManager as never,
          store,
        },
        gateway,
      );

      await dispatcher.onIncoming(makeIncoming());
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toMatch(/finished|reasoning turns/i);
      const all = await store.readAll('telegram', '42');
      expect(all.map((m) => m.role)).toEqual(['user']);
    });
  });
});
