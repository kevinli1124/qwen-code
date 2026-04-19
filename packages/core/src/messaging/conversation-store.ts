/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createDebugLogger } from '../utils/debugLogger.js';
import {
  DEFAULT_HISTORY_WINDOW,
  MessagingError,
  MessagingErrorCode,
  type ConversationSummary,
  type HistoryWindow,
  type MessageRecord,
  type MessagingChannel,
} from './types.js';

const CONVERSATIONS_DIR = path.join('.qwen', 'conversations');
const FILE_EXT = '.jsonl';

const debugLogger = createDebugLogger('MESSAGING_STORE');

/** Sanitizes a chat id into a safe filename segment. */
function sanitizeChatId(chatId: string): string {
  // Telegram ids are integers, Discord snowflakes, Slack C0/U0 prefixes —
  // all safe. This guard is defensive against untrusted channels.
  return chatId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Derives the conversation id used in summaries. */
export function conversationId(
  channel: MessagingChannel,
  chatId: string,
): string {
  return `${channel}:${chatId}`;
}

/**
 * Append-only JSONL store for per-chat conversation history.
 *
 * Each conversation lives at `<projectRoot>/.qwen/conversations/<channel>_<chatId>.jsonl`.
 * One {@link MessageRecord} per line, newest at the bottom. The store is
 * process-safe for single-writer use (the gateway loop appends serially).
 *
 * We deliberately avoid a metadata sidecar: file mtime + first/last line
 * provide everything needed for {@link listConversations}.
 */
export class ConversationStore {
  constructor(private readonly projectRoot: string) {}

  private baseDir(): string {
    return path.join(this.projectRoot, CONVERSATIONS_DIR);
  }

  private filePath(channel: MessagingChannel, chatId: string): string {
    return path.join(
      this.baseDir(),
      `${channel}_${sanitizeChatId(chatId)}${FILE_EXT}`,
    );
  }

  /** Appends a single message, creating the file + directory on demand. */
  async append(
    channel: MessagingChannel,
    chatId: string,
    record: MessageRecord,
  ): Promise<void> {
    const file = this.filePath(channel, chatId);
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, JSON.stringify(record) + '\n', 'utf8');
    } catch (err) {
      throw new MessagingError(
        `Failed to append to ${file}: ${err instanceof Error ? err.message : String(err)}`,
        MessagingErrorCode.STORE,
      );
    }
  }

  /**
   * Reads the whole conversation in order. Corrupted lines are skipped with
   * a warning so a single bad write can't poison the whole history.
   */
  async readAll(
    channel: MessagingChannel,
    chatId: string,
  ): Promise<MessageRecord[]> {
    const file = this.filePath(channel, chatId);
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new MessagingError(
        `Failed to read ${file}: ${err instanceof Error ? err.message : String(err)}`,
        MessagingErrorCode.STORE,
      );
    }
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    const out: MessageRecord[] = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line) as MessageRecord);
      } catch {
        debugLogger.warn(
          `Skipping corrupt line in ${file}: ${line.slice(0, 80)}`,
        );
      }
    }
    return out;
  }

  /**
   * Returns the trailing slice of the conversation under both a message-count
   * cap and a rough char budget. Both defaults are conservative (20 messages,
   * 8k chars) so subagent context doesn't blow up on long-running threads.
   *
   * The slice is taken from the end, then returned in chronological order.
   * Messages are dropped individually — we do not split a single message.
   */
  async readHistory(
    channel: MessagingChannel,
    chatId: string,
    window: HistoryWindow = {},
  ): Promise<MessageRecord[]> {
    const maxMessages =
      window.maxMessages ?? DEFAULT_HISTORY_WINDOW.maxMessages;
    const maxChars = window.maxChars ?? DEFAULT_HISTORY_WINDOW.maxChars;
    if (maxMessages <= 0 || maxChars <= 0) return [];

    const all = await this.readAll(channel, chatId);
    if (all.length === 0) return [];

    const selected: MessageRecord[] = [];
    let usedChars = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      if (selected.length >= maxMessages) break;
      const msg = all[i];
      const cost = msg.text.length;
      if (usedChars + cost > maxChars && selected.length > 0) break;
      selected.push(msg);
      usedChars += cost;
    }
    return selected.reverse();
  }

  /**
   * Lists all known conversations (one per file), cheapest-first: only the
   * first + last line of each file are parsed to build the summary. Suitable
   * for a `/chat list` command.
   */
  async listConversations(): Promise<ConversationSummary[]> {
    const dir = this.baseDir();
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new MessagingError(
        `Failed to list ${dir}: ${err instanceof Error ? err.message : String(err)}`,
        MessagingErrorCode.STORE,
      );
    }

    const out: ConversationSummary[] = [];
    for (const name of entries) {
      if (!name.endsWith(FILE_EXT)) continue;
      const base = name.slice(0, -FILE_EXT.length);
      const sepIdx = base.indexOf('_');
      if (sepIdx < 0) continue;
      const channel = base.slice(0, sepIdx) as MessagingChannel;
      const chatId = base.slice(sepIdx + 1);
      try {
        const summary = await this.summarize(channel, chatId);
        if (summary) out.push(summary);
      } catch (err) {
        debugLogger.warn(
          `Failed to summarize conversation ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    // Newest activity first.
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  private async summarize(
    channel: MessagingChannel,
    chatId: string,
  ): Promise<ConversationSummary | null> {
    const all = await this.readAll(channel, chatId);
    if (all.length === 0) return null;
    const first = all[0];
    const last = all[all.length - 1];
    const lastUser = [...all].reverse().find((m) => m.role === 'user');
    const preview = (lastUser?.text ?? last.text).slice(0, 80);
    return {
      id: conversationId(channel, chatId),
      channel,
      chatId,
      createdAt: first.timestamp,
      updatedAt: last.timestamp,
      messageCount: all.length,
      lastPreview: preview,
    };
  }

  /** Deletes a conversation. Safe to call if it doesn't exist. */
  async deleteConversation(
    channel: MessagingChannel,
    chatId: string,
  ): Promise<void> {
    const file = this.filePath(channel, chatId);
    try {
      await fs.unlink(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new MessagingError(
        `Failed to delete ${file}: ${err instanceof Error ? err.message : String(err)}`,
        MessagingErrorCode.STORE,
      );
    }
  }
}
