/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConversationStore, conversationId } from './conversation-store.js';
import type { MessageRecord } from './types.js';

function rec(
  role: MessageRecord['role'],
  text: string,
  timestamp: number,
  extra: Partial<MessageRecord> = {},
): MessageRecord {
  return { role, text, timestamp, ...extra };
}

describe('ConversationStore', () => {
  let tmp: string;
  let store: ConversationStore;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-conv-'));
    store = new ConversationStore(tmp);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  describe('append + readAll', () => {
    it('creates .qwen/conversations/ and persists messages in order', async () => {
      await store.append('telegram', '42', rec('user', 'hi', 1000));
      await store.append('telegram', '42', rec('assistant', 'hello', 1100));
      const all = await store.readAll('telegram', '42');
      expect(all).toHaveLength(2);
      expect(all[0].text).toBe('hi');
      expect(all[1].role).toBe('assistant');
      const file = path.join(
        tmp,
        '.qwen',
        'conversations',
        'telegram_42.jsonl',
      );
      const raw = await fs.readFile(file, 'utf8');
      expect(raw.trim().split('\n')).toHaveLength(2);
    });

    it('readAll returns [] for a never-written chat', async () => {
      expect(await store.readAll('telegram', 'nope')).toEqual([]);
    });

    it('skips corrupt lines without killing the read', async () => {
      await store.append('telegram', '99', rec('user', 'ok', 1));
      const file = path.join(
        tmp,
        '.qwen',
        'conversations',
        'telegram_99.jsonl',
      );
      await fs.appendFile(file, 'not-json-nope\n', 'utf8');
      await store.append('telegram', '99', rec('assistant', 'fine', 2));
      const all = await store.readAll('telegram', '99');
      expect(all.map((m) => m.text)).toEqual(['ok', 'fine']);
    });

    it('sanitizes path separators so the file stays under the conversations dir', async () => {
      await store.append('telegram', '../etc/passwd', rec('user', 'x', 1));
      // Nothing was written outside the conversations/ subtree.
      const qwenEntries = await fs.readdir(path.join(tmp, '.qwen'));
      expect(qwenEntries).toEqual(['conversations']);
      const convEntries = await fs.readdir(
        path.join(tmp, '.qwen', 'conversations'),
      );
      expect(convEntries.every((e) => !e.includes('/'))).toBe(true);
      expect(convEntries.every((e) => !e.includes('\\'))).toBe(true);
      // And the message still round-trips using the same (sanitized) key.
      const all = await store.readAll('telegram', '../etc/passwd');
      expect(all).toHaveLength(1);
    });
  });

  describe('readHistory window', () => {
    beforeEach(async () => {
      for (let i = 0; i < 30; i++) {
        await store.append(
          'telegram',
          'w',
          rec(i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`, 1000 + i),
        );
      }
    });

    it('returns the trailing N messages in chronological order by default', async () => {
      const hist = await store.readHistory('telegram', 'w');
      // default maxMessages = 20
      expect(hist).toHaveLength(20);
      expect(hist[0].text).toBe('msg-10'); // 30 - 20
      expect(hist[hist.length - 1].text).toBe('msg-29');
    });

    it('respects a custom maxMessages cap', async () => {
      const hist = await store.readHistory('telegram', 'w', {
        maxMessages: 5,
      });
      expect(hist).toHaveLength(5);
      expect(hist.map((m) => m.text)).toEqual([
        'msg-25',
        'msg-26',
        'msg-27',
        'msg-28',
        'msg-29',
      ]);
    });

    it('caps by char budget and always keeps at least one message', async () => {
      // Every message is 'msg-N' → 5–6 chars. Budget of 15 chars selects
      // ~2–3 messages.
      const hist = await store.readHistory('telegram', 'w', {
        maxChars: 15,
      });
      expect(hist.length).toBeGreaterThan(0);
      expect(hist.length).toBeLessThan(5);
      // Always trailing slice
      expect(hist[hist.length - 1].text).toBe('msg-29');
    });

    it('returns [] when window is zero', async () => {
      expect(
        await store.readHistory('telegram', 'w', { maxMessages: 0 }),
      ).toEqual([]);
      expect(await store.readHistory('telegram', 'w', { maxChars: 0 })).toEqual(
        [],
      );
    });
  });

  describe('listConversations', () => {
    it('returns [] when the directory is missing', async () => {
      expect(await store.listConversations()).toEqual([]);
    });

    it('summarizes each conversation and sorts newest first', async () => {
      await store.append('telegram', 'old', rec('user', 'first', 100));
      await store.append('telegram', 'old', rec('assistant', 'reply', 200));
      await store.append('telegram', 'new', rec('user', 'hi there', 500));

      const list = await store.listConversations();
      expect(list).toHaveLength(2);
      expect(list[0].chatId).toBe('new');
      expect(list[0].updatedAt).toBe(500);
      expect(list[0].messageCount).toBe(1);
      expect(list[0].lastPreview).toContain('hi there');

      const older = list[1];
      expect(older.chatId).toBe('old');
      expect(older.createdAt).toBe(100);
      expect(older.updatedAt).toBe(200);
      expect(older.messageCount).toBe(2);
      expect(older.id).toBe(conversationId('telegram', 'old'));
    });
  });

  describe('deleteConversation', () => {
    it('removes the file; no-op if already gone', async () => {
      await store.append('telegram', 'gone', rec('user', 'bye', 1));
      await store.deleteConversation('telegram', 'gone');
      expect(await store.readAll('telegram', 'gone')).toEqual([]);
      // Second call should not throw
      await store.deleteConversation('telegram', 'gone');
    });
  });
});
