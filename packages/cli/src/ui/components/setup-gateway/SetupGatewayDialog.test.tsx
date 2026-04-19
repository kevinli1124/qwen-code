/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the pure helpers inside SetupGatewayTelegramDialog.
 *
 * The React component itself wires `useKeypress`, which depends on a
 * KeypressProvider + a mocked ink stdin to render — that's heavier test
 * infrastructure than the value added. Component wiring is covered by the
 * command test (verifies the right dialog action is returned) plus the
 * TypeScript build (verifies the dialog renders in DialogManager).
 *
 * What we check here is the logic the user relies on for correctness:
 *   - the token-shape regex matches only plausible Telegram tokens
 *   - user-id parsing handles comma + whitespace
 *   - getMe wraps the API cleanly (success, HTTP failure, timeout, JSON ok:false)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  looksLikeToken,
  parseUserIds,
  callGetMe,
} from './SetupGatewayDialog.js';

describe('looksLikeToken', () => {
  it('accepts real-looking bot tokens', () => {
    expect(looksLikeToken('7890123456:ABCDEFGHIJKLMNOP_qrs-tuv')).toBe(true);
    expect(looksLikeToken('1:ABCDEFGHIJ0-_')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(looksLikeToken('')).toBe(false);
    expect(looksLikeToken('not a token')).toBe(false);
    expect(looksLikeToken('1234567890')).toBe(false);
    expect(looksLikeToken('abc:deffgghhii')).toBe(false);
    // Too short after the colon.
    expect(looksLikeToken('12345:abc')).toBe(false);
    // Invalid chars after the colon.
    expect(looksLikeToken('12345:ABCDEFGHIJ!')).toBe(false);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(looksLikeToken('  7890:ABCDEFGHIJKLMN  ')).toBe(true);
  });
});

describe('parseUserIds', () => {
  it('splits on commas and whitespace, trims, drops empties', () => {
    expect(parseUserIds('')).toEqual([]);
    expect(parseUserIds('  ')).toEqual([]);
    expect(parseUserIds('123')).toEqual(['123']);
    expect(parseUserIds('123,456')).toEqual(['123', '456']);
    expect(parseUserIds('123, 456,789')).toEqual(['123', '456', '789']);
    expect(parseUserIds('  123   456,,,  789 ')).toEqual(['123', '456', '789']);
  });
});

describe('callGetMe', () => {
  interface FakeRes {
    ok?: boolean;
    status?: number;
    body?: unknown;
  }
  function makeResponse(overrides: FakeRes): Response {
    return {
      ok: overrides.ok ?? true,
      status: overrides.status ?? 200,
      json: async () => overrides.body ?? {},
    } as unknown as Response;
  }

  it('returns the bot username on a successful response', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({
        ok: true,
        body: { ok: true, result: { username: 'sample_bot' } },
      }),
    ) as unknown as typeof fetch;

    const r = await callGetMe('7890:ABCDEFGHIJ', fetchImpl);
    expect(r).toEqual({ ok: true, username: 'sample_bot' });
  });

  it('surfaces HTTP failure codes with a clear reason', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({ ok: false, status: 401 }),
    ) as unknown as typeof fetch;

    const r = await callGetMe('7890:bad', fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('HTTP 401');
    }
  });

  it('surfaces Telegram-level rejections (ok: false in body)', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({
        ok: true,
        body: { ok: false, description: 'Invalid token' },
      }),
    ) as unknown as typeof fetch;

    const r = await callGetMe('7890:whatever', fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('Invalid token');
    }
  });

  it('maps AbortError into a timeout message', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error('aborted');
      (err as Error & { name: string }).name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;

    const r = await callGetMe('7890:whatever', fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/timed out/i);
    }
  });

  it('wraps network errors with a prefix', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const r = await callGetMe('7890:whatever', fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('ECONNREFUSED');
    }
  });
});
