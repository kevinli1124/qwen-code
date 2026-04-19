/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramGateway } from './telegram-gateway.js';
import { MessagingError, type IncomingMessage } from './types.js';

interface MockResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
}

function okResponse(body: MockResponse): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function httpErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

/**
 * Builds a fetch mock that returns a queue of canned responses per method.
 * When the queue for `getUpdates` is exhausted, the mock blocks on the abort
 * signal rather than hot-spinning — mimicking the real Telegram long-poll
 * behaviour and keeping tests from burning CPU waiting for `stop()`.
 */
function buildFetch(
  queues: Partial<Record<string, Array<() => Response | Promise<Response>>>>,
) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = url.split('/').pop() ?? '';
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url, body });
    const q = queues[method];
    if (q && q.length > 0) {
      return q.shift()!();
    }
    if (method === 'getUpdates') {
      // Block until the gateway aborts this fetch via stop().
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
    return okResponse({ ok: true, result: {} });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

/** Waits until `predicate` is true or a budget elapses; uses real timers. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (!predicate()) {
    throw new Error(`waitFor timed out after ${timeoutMs}ms`);
  }
}

describe('TelegramGateway', () => {
  beforeEach(() => {
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['TELEGRAM_ALLOWED_USER_IDS'];
  });

  describe('construction', () => {
    it('throws when no token is provided', () => {
      expect(() => new TelegramGateway()).toThrow(MessagingError);
    });

    it('reads token and allowlist from env', () => {
      process.env['TELEGRAM_BOT_TOKEN'] = 'env-tok';
      process.env['TELEGRAM_ALLOWED_USER_IDS'] = '1,2,3';
      const gw = new TelegramGateway({
        fetchImpl: buildFetch({}).fn,
      });
      expect(gw.channel).toBe('telegram');
      expect(gw.isRunning).toBe(false);
    });
  });

  describe('poll loop → onMessage', () => {
    it('converts a native update into IncomingMessage and advances offset', async () => {
      const received: IncomingMessage[] = [];
      const fetchMock = buildFetch({
        getUpdates: [
          () =>
            okResponse({
              ok: true,
              result: [
                {
                  update_id: 10,
                  message: {
                    message_id: 77,
                    date: 1700000000,
                    chat: { id: 42, type: 'private' },
                    from: { id: 999, username: 'sky' },
                    text: 'hello',
                  },
                },
              ],
            }),
          // Subsequent poll returns empty to keep the loop quiet.
        ],
      });
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock.fn,
      });
      await gw.start(async (m) => {
        received.push(m);
      });
      await waitFor(() => received.length > 0);
      await gw.stop();

      expect(received).toHaveLength(1);
      expect(received[0].chatId).toBe('42');
      expect(received[0].senderId).toBe('999');
      expect(received[0].senderName).toBe('sky');
      expect(received[0].text).toBe('hello');
      expect(received[0].externalId).toBe('77');
      expect(received[0].timestamp).toBe(1700000000 * 1000);

      // Second getUpdates must have advanced offset to 11.
      const getUpdatesCalls = fetchMock.calls.filter((c) =>
        c.url.endsWith('/getUpdates'),
      );
      expect(getUpdatesCalls.length).toBeGreaterThanOrEqual(2);
      expect(getUpdatesCalls[1].body['offset']).toBe(11);
    });

    it('drops messages from senders outside the allowlist', async () => {
      const received: IncomingMessage[] = [];
      const fetchMock = buildFetch({
        getUpdates: [
          () =>
            okResponse({
              ok: true,
              result: [
                {
                  update_id: 5,
                  message: {
                    message_id: 1,
                    date: 1,
                    chat: { id: 1, type: 'private' },
                    from: { id: 666 },
                    text: 'blocked',
                  },
                },
                {
                  update_id: 6,
                  message: {
                    message_id: 2,
                    date: 1,
                    chat: { id: 1, type: 'private' },
                    from: { id: 123 },
                    text: 'allowed',
                  },
                },
              ],
            }),
        ],
      });
      const gw = new TelegramGateway({
        token: 't',
        allowedUserIds: ['123'],
        fetchImpl: fetchMock.fn,
      });
      await gw.start(async (m) => {
        received.push(m);
      });
      await waitFor(() => received.length > 0);
      await gw.stop();

      expect(received).toHaveLength(1);
      expect(received[0].text).toBe('allowed');
    });

    it('ignores non-text updates (stickers, photos, etc.)', async () => {
      const received: IncomingMessage[] = [];
      const fetchMock = buildFetch({
        getUpdates: [
          () =>
            okResponse({
              ok: true,
              result: [
                {
                  update_id: 1,
                  message: {
                    message_id: 1,
                    date: 1,
                    chat: { id: 1, type: 'private' },
                    from: { id: 1 },
                    // no text
                  },
                },
              ],
            }),
        ],
      });
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock.fn,
      });
      await gw.start(async (m) => {
        received.push(m);
      });
      // Give it a tick to poll + process
      await new Promise((r) => setTimeout(r, 30));
      await gw.stop();
      expect(received).toHaveLength(0);
    });

    it('backs off on transient HTTP errors and keeps going', async () => {
      const received: IncomingMessage[] = [];
      let errorsServed = 0;
      const fetchMock = buildFetch({
        getUpdates: [
          () => {
            errorsServed++;
            return httpErrorResponse(502);
          },
          () =>
            okResponse({
              ok: true,
              result: [
                {
                  update_id: 1,
                  message: {
                    message_id: 1,
                    date: 1,
                    chat: { id: 1, type: 'private' },
                    from: { id: 1 },
                    text: 'after-error',
                  },
                },
              ],
            }),
        ],
      });
      const setTimeoutImpl = ((fn: () => void, _ms: number) => setTimeout(fn, 0)) as unknown as typeof setTimeout;
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock.fn,
        setTimeoutImpl,
      });
      await gw.start(async (m) => {
        received.push(m);
      });
      await waitFor(() => received.length > 0, 1000);
      await gw.stop();
      expect(errorsServed).toBeGreaterThanOrEqual(1);
      expect(received[0].text).toBe('after-error');
    });
  });

  describe('send', () => {
    it('posts sendMessage with chat_id + text + parse_mode HTML', async () => {
      const fetchMock = buildFetch({});
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock.fn,
      });
      await gw.send({ channel: 'telegram', chatId: '55', text: 'ack' });
      const call = fetchMock.calls.find((c) => c.url.endsWith('/sendMessage'));
      expect(call).toBeDefined();
      expect(call!.body['chat_id']).toBe('55');
      expect(call!.body['text']).toBe('ack');
      // HTML parse mode is set so **bold** and `code` in LLM output render.
      expect(call!.body['parse_mode']).toBe('HTML');
    });

    it('converts markdown into Telegram HTML before sending', async () => {
      const fetchMock = buildFetch({});
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock.fn,
      });
      await gw.send({
        channel: 'telegram',
        chatId: '1',
        text: 'look: **bold** and `x = 1`',
      });
      const call = fetchMock.calls.find((c) => c.url.endsWith('/sendMessage'));
      expect(call!.body['text']).toBe(
        'look: <b>bold</b> and <code>x = 1</code>',
      );
    });

    it('falls back to plain text when Telegram returns 400 on HTML', async () => {
      let attempts = 0;
      const fetchMock = vi.fn(async () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 400,
            json: async () => ({ description: 'parse error' }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: {} }),
        } as unknown as Response;
      });
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      await gw.send({
        channel: 'telegram',
        chatId: '1',
        text: '**bold**',
      });
      // Second call is the plain-text fallback (no parse_mode).
      expect(attempts).toBe(2);
    });

    it('threads replies when replyToExternalId is numeric', async () => {
      const fetchMock = buildFetch({});
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock.fn,
      });
      await gw.send({
        channel: 'telegram',
        chatId: '1',
        text: 'r',
        replyToExternalId: '42',
      });
      const call = fetchMock.calls[0];
      expect(call.body['reply_parameters']).toEqual({ message_id: 42 });
    });

    it('retries transient fetch failures and eventually succeeds', async () => {
      // Simulate two `fetch failed`s then a success — matches the real
      // undici blip pattern we see during idle long-polls.
      let calls = 0;
      const fetchMock = vi.fn(async () => {
        calls++;
        if (calls < 3) {
          throw new TypeError('fetch failed');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: {} }),
        } as unknown as Response;
      });
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock as unknown as typeof fetch,
        // Fake timers-free; BASE_DELAY_MS is small enough (400/800ms) that
        // two waits won't blow the 5s test timeout by much.
        setTimeoutImpl: ((fn: () => void) =>
          setTimeout(fn, 0)) as unknown as typeof setTimeout,
      });
      await gw.send({ channel: 'telegram', chatId: '1', text: 'x' });
      expect(calls).toBe(3);
    });

    it('does not retry on 4xx (client error)', async () => {
      let calls = 0;
      const fetchMock = vi.fn(async () => {
        calls++;
        return {
          ok: false,
          status: 401,
          json: async () => ({}),
        } as unknown as Response;
      });
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      await expect(
        gw.send({ channel: 'telegram', chatId: '1', text: 'x' }),
      ).rejects.toThrow(/HTTP 401/);
      expect(calls).toBe(1);
    });

    it('refuses to send on the wrong channel', async () => {
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: buildFetch({}).fn,
      });
      await expect(
        gw.send({
          channel: 'discord' as never,
          chatId: '1',
          text: 'x',
        }),
      ).rejects.toBeInstanceOf(MessagingError);
    });
  });

  describe('lifecycle', () => {
    it('start is idempotent', async () => {
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: buildFetch({}).fn,
      });
      await gw.start(async () => {});
      await gw.start(async () => {});
      expect(gw.isRunning).toBe(true);
      await gw.stop();
    });

    it('stop on an unstarted gateway is a no-op', async () => {
      const gw = new TelegramGateway({
        token: 't',
        fetchImpl: buildFetch({}).fn,
      });
      await expect(gw.stop()).resolves.toBeUndefined();
    });
  });
});
