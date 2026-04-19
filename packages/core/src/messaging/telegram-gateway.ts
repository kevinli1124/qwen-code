/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Agent, fetch as undiciFetch } from 'undici';
import { createDebugLogger } from '../utils/debugLogger.js';
import {
  markdownToPlain,
  markdownToTelegramHtml,
  splitForTelegram,
} from './markdown-to-telegram.js';
import {
  MessagingError,
  MessagingErrorCode,
  type IncomingMessage,
  type MessagingGateway,
  type OutgoingMessage,
} from './types.js';

const debugLogger = createDebugLogger('TELEGRAM_GATEWAY');

/** Default long-poll timeout in seconds — Telegram keeps the HTTP connection
 *  open for up to this long waiting for updates. 25 s is well under the 30 s
 *  default proxy timeouts we'll encounter in the wild. */
const DEFAULT_LONG_POLL_SECONDS = 25;

/** Backoff on transient errors; capped to avoid unbounded retry storms. */
const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

export interface TelegramGatewayOptions {
  /** Bot token from @BotFather. If omitted, read from TELEGRAM_BOT_TOKEN. */
  token?: string;
  /**
   * Allowlist of Telegram user ids that may talk to this bot. Any other
   * sender is silently ignored (not even error-logged — bots get spam).
   * If empty, all senders are allowed. Read from TELEGRAM_ALLOWED_USER_IDS
   * (comma-separated) when unset.
   */
  allowedUserIds?: readonly string[];
  /** Long-poll timeout in seconds. Default 25. */
  longPollSeconds?: number;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Injected setTimeout for tests. */
  setTimeoutImpl?: typeof setTimeout;
  /** API base URL — override for mocking. Default `https://api.telegram.org`. */
  apiBase?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
}

interface TelegramGetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
}

/**
 * Telegram Bot API gateway backed by long-polling `getUpdates`.
 *
 * Why long-polling over webhooks: no HTTPS / public URL requirement, works
 * from a dev laptop behind NAT, and fits the single-daemon architecture. The
 * webhook path is reserved for future when the project has a public host.
 */
export class TelegramGateway implements MessagingGateway {
  readonly channel = 'telegram' as const;
  private readonly token: string;
  private readonly allowedUserIds: Set<string>;
  private readonly longPollSeconds: number;
  private readonly fetchImpl: typeof fetch;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly apiBase: string;

  private running = false;
  private abortCtrl?: AbortController;
  private nextOffset = 0;
  /** Tracks the in-flight poll loop so `stop()` can await its exit. */
  private loopPromise?: Promise<void>;
  /**
   * Custom undici Agent used when the caller didn't inject a fetch. Pins
   * keep-alive shorter than Telegram's idle close + prefers IPv4 +
   * explicit connect/headers timeouts. Addresses the near-constant
   * `TypeError: fetch failed` we see on Windows when undici reuses a stale
   * connection that Telegram has already torn down.
   */
  private readonly dispatcher?: Agent;

  constructor(options: TelegramGatewayOptions = {}) {
    const token =
      options.token ?? process.env['TELEGRAM_BOT_TOKEN']?.trim() ?? '';
    if (!token) {
      throw new MessagingError(
        'TelegramGateway: TELEGRAM_BOT_TOKEN is not set',
        MessagingErrorCode.INVALID_CONFIG,
      );
    }
    this.token = token;

    const allowed =
      options.allowedUserIds ??
      parseCsvEnv(process.env['TELEGRAM_ALLOWED_USER_IDS']);
    this.allowedUserIds = new Set(allowed);

    this.longPollSeconds = options.longPollSeconds ?? DEFAULT_LONG_POLL_SECONDS;
    this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
    this.apiBase = options.apiBase ?? 'https://api.telegram.org';

    if (options.fetchImpl) {
      // Tests inject their own fetch — don't build a dispatcher.
      this.fetchImpl = options.fetchImpl;
    } else {
      // Dedicated undici Agent. Settings chosen to survive two environments:
      //   1. Windows, which aggressively closes idle TCP sockets.
      //   2. Long-poll style usage — 25s getUpdates leaves a near-idle
      //      socket sitting for too long for the default pool's taste.
      // The short keepAliveTimeout forces us to open a fresh connection
      // more often instead of reusing a dead one; modest overhead vs.
      // constant `fetch failed` retries.
      // Agent accepts Node's net.createConnection options through
      // `connect`. We set timeout here so a dead upstream (common after
      // a Windows sleep/wake) fails fast instead of hanging for the OS
      // default ~75s. `autoSelectFamily` on Node 20+ races v4/v6 and uses
      // whichever handshakes first — faster AND dodges v6-broken ISPs
      // that give us RSTs minutes later.
      // Cast: undici's declared `connect` type rejects these two options,
      // but they flow through to net.connect at runtime and are supported.
      const connectOpts = {
        timeout: 10_000,
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: 250,
      } as unknown as NonNullable<
        ConstructorParameters<typeof Agent>[0]
      >['connect'];
      this.dispatcher = new Agent({
        keepAliveTimeout: 4_000,
        keepAliveMaxTimeout: 10_000,
        connectTimeout: 10_000,
        headersTimeout: (this.longPollSeconds + 10) * 1_000,
        bodyTimeout: (this.longPollSeconds + 10) * 1_000,
        connect: connectOpts,
      });
      const dispatcher = this.dispatcher;
      this.fetchImpl = (url, init) =>
        undiciFetch(url as string, {
          ...(init as Parameters<typeof undiciFetch>[1]),
          dispatcher,
        }) as unknown as Promise<Response>;
    }

    if (!this.fetchImpl) {
      throw new MessagingError(
        'TelegramGateway: global fetch unavailable (Node < 18?); pass options.fetchImpl',
        MessagingErrorCode.INVALID_CONFIG,
      );
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  async start(
    onMessage: (msg: IncomingMessage) => void | Promise<void>,
  ): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortCtrl = new AbortController();
    this.loopPromise = this.pollLoop(onMessage).catch((err) => {
      debugLogger.warn(
        `Telegram poll loop crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.abortCtrl?.abort();
    this.abortCtrl = undefined;
    const p = this.loopPromise;
    this.loopPromise = undefined;
    if (p) await p;
    // Close the undici Agent so pooled sockets don't keep the event loop
    // alive. Safe to call on an un-started Agent; swallowed just in case.
    if (this.dispatcher) {
      try {
        await this.dispatcher.close();
      } catch {
        /* best effort */
      }
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ─── Sending ────────────────────────────────────────────────

  async send(msg: OutgoingMessage): Promise<void> {
    if (msg.channel !== 'telegram') {
      throw new MessagingError(
        `TelegramGateway cannot send to channel "${msg.channel}"`,
        MessagingErrorCode.GATEWAY,
      );
    }
    // LLM output is Markdown. Convert to the Telegram HTML subset so
    // `**bold**`, `` `code` ``, fenced code, links etc. render instead of
    // showing as literal punctuation. Split on the 4096-char hard cap.
    // Only the first chunk threads to `replyToExternalId`; continuation
    // chunks stand alone so Telegram's 1 kB reply header doesn't blow us
    // past the limit on the second message.
    const htmlChunks = splitForTelegram(markdownToTelegramHtml(msg.text));
    for (let i = 0; i < htmlChunks.length; i++) {
      const chunk = htmlChunks[i];
      const body: Record<string, unknown> = {
        chat_id: msg.chatId,
        text: chunk,
        parse_mode: 'HTML',
      };
      if (i === 0 && msg.replyToExternalId) {
        const parsed = Number.parseInt(msg.replyToExternalId, 10);
        if (Number.isFinite(parsed)) {
          body['reply_parameters'] = { message_id: parsed };
        }
      }
      try {
        await this.apiCall('sendMessage', body);
      } catch (err) {
        // Telegram rejects HTML parses as 400 when our converter slipped a
        // stray tag or bad nesting. Fall back to plain text rather than
        // losing the message entirely. Only retry the failed chunk.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('HTTP 400')) {
          writeTelegramLog(
            `[telegram] sendMessage HTML rejected, retrying as plain text: ${msg}`,
          );
          const plainBody: Record<string, unknown> = {
            chat_id: body['chat_id'],
            text: markdownToPlain(chunk),
          };
          if (body['reply_parameters']) {
            plainBody['reply_parameters'] = body['reply_parameters'];
          }
          await this.apiCall('sendMessage', plainBody);
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Shows "typing…" above the chat input for about 5 seconds. The
   * dispatcher refreshes this on a 4 s interval while the agent runs so the
   * indicator never drops. Errors are swallowed — a missing typing bubble
   * is cosmetic and must never break the reply path.
   */
  async sendTypingIndicator(chatId: string): Promise<void> {
    try {
      await this.apiCall('sendChatAction', {
        chat_id: chatId,
        action: 'typing',
      });
    } catch (err) {
      debugLogger.debug(
        `sendChatAction(typing) for chat=${chatId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Poll loop ──────────────────────────────────────────────

  private async pollLoop(
    onMessage: (msg: IncomingMessage) => void | Promise<void>,
  ): Promise<void> {
    writeTelegramLog('[telegram] poll loop started');
    let backoff = MIN_BACKOFF_MS;
    while (this.running) {
      try {
        const updates = await this.fetchUpdates();
        backoff = MIN_BACKOFF_MS; // reset on success
        if (updates.length > 0) {
          writeTelegramLog(
            `[telegram] getUpdates returned ${updates.length} update(s) (offset was ${this.nextOffset})`,
          );
        }
        for (const upd of updates) {
          // Advance offset to update_id + 1 so the next getUpdates ACKs this one.
          this.nextOffset = Math.max(this.nextOffset, upd.update_id + 1);
          const incoming = this.toIncoming(upd);
          if (!incoming) {
            writeTelegramLog(
              `[telegram] dropped update ${upd.update_id} (not text, or sender not in allowlist): from=${upd.message?.from?.id ?? '?'} chat=${upd.message?.chat?.id ?? '?'} text=${upd.message?.text ? '<set>' : '<none>'}`,
            );
            continue;
          }
          // Fire-and-forget: spawn the handler without awaiting. A stuck
          // dispatcher (runaway tool loop, hung stream) must NOT pin the
          // poll loop — otherwise we can't fetch subsequent updates, can't
          // advance the offset past this batch, and Telegram keeps re-
          // delivering the same stuck message on every restart.
          //
          // The dispatcher has its own per-message timeout + concurrency
          // cap; losing a pending error reply on process exit is a much
          // smaller problem than freezing the gateway.
          void (async () => {
            try {
              await onMessage(incoming);
            } catch (err) {
              writeTelegramLog(
                `[telegram] onMessage handler threw (chat=${incoming.chatId}): ${err instanceof Error ? err.message : String(err)}`,
              );
              debugLogger.warn(
                `onMessage handler threw (chat=${incoming.chatId}): ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          })();
        }
      } catch (err) {
        if (!this.running) return;
        writeTelegramLog(
          `[telegram] getUpdates failed (backoff ${backoff}ms): ${err instanceof Error ? err.message : String(err)}`,
        );
        debugLogger.warn(
          `Telegram getUpdates failed (backoff ${backoff}ms): ${err instanceof Error ? err.message : String(err)}`,
        );
        await this.sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
    writeTelegramLog('[telegram] poll loop exited cleanly');
  }

  private async fetchUpdates(): Promise<TelegramUpdate[]> {
    const body = {
      offset: this.nextOffset,
      timeout: this.longPollSeconds,
      allowed_updates: ['message'],
    };
    const json = (await this.apiCall(
      'getUpdates',
      body,
    )) as TelegramGetUpdatesResponse;
    if (!json.ok) {
      throw new Error(`Telegram API error: ${json.description ?? 'unknown'}`);
    }
    return json.result ?? [];
  }

  private async apiCall(
    method: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `${this.apiBase}/bot${this.token}/${method}`;
    // Retry on network errors and 5xx. `fetch failed` from undici happens
    // when the TCP connection to api.telegram.org blips — common when the
    // bot has been idle through a long-poll and the upstream closes the
    // keep-alive. 4xx (bad token, chat not found) is user error — don't
    // retry those.
    // 4 attempts = 1 initial + 3 retries at 500/1000/2000ms = up to ~3.5s
    // total, which is well under the dispatcher's 90 s timeout but long
    // enough to ride through the typical 1–2 s Windows network blips we
    // see hitting api.telegram.org.
    const MAX_ATTEMPTS = 4;
    const BASE_DELAY_MS = 500;
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let shouldRetry = false;
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: this.abortCtrl?.signal,
        });
        if (res.ok) {
          return (await res.json()) as unknown;
        }
        if (res.status >= 400 && res.status < 500) {
          // Client error — permanent, don't retry. Throw directly (the
          // outer catch below is only for transient network errors).
          throw new Error(`Telegram ${method} HTTP ${res.status}`);
        }
        // 5xx — mark for retry.
        lastErr = new Error(`Telegram ${method} HTTP ${res.status}`);
        shouldRetry = true;
      } catch (err) {
        // Abort — bail immediately.
        if (
          err instanceof Error &&
          (err.name === 'AbortError' || this.abortCtrl?.signal.aborted === true)
        ) {
          throw err;
        }
        // If the error came from our 4xx throw above, it has a very
        // specific message shape — don't retry client errors.
        if (
          err instanceof Error &&
          /^Telegram .+ HTTP 4\d\d$/.test(err.message)
        ) {
          throw err;
        }
        // Otherwise it's a network-level failure — retry.
        lastErr = err;
        shouldRetry = true;
      }
      if (!shouldRetry) break;
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = BASE_DELAY_MS * 2 ** attempt;
        writeTelegramLog(
          `[telegram] ${method} retry ${attempt + 1}/${MAX_ATTEMPTS - 1} after ${delay}ms: ${describeError(lastErr)}`,
        );
        await this.sleep(delay);
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`Telegram ${method} failed after ${MAX_ATTEMPTS} attempts`);
  }

  /** Converts a native Telegram update into our channel-agnostic payload.
   *  Returns null for updates we don't handle (non-text, unauthorized sender). */
  private toIncoming(upd: TelegramUpdate): IncomingMessage | null {
    const m = upd.message;
    if (!m || !m.text || !m.from) return null;
    const senderId = String(m.from.id);
    if (this.allowedUserIds.size > 0 && !this.allowedUserIds.has(senderId)) {
      debugLogger.debug(
        `Telegram message from unauthorized user ${senderId}, dropping.`,
      );
      return null;
    }
    return {
      channel: 'telegram',
      chatId: String(m.chat.id),
      senderId,
      senderName: m.from.username ?? m.from.first_name,
      text: m.text,
      timestamp: m.date * 1000,
      externalId: String(m.message_id),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.setTimeoutImpl(resolve, ms));
  }
}

/**
 * Unwraps undici's generic `TypeError: fetch failed` so the log shows the
 * underlying cause (ECONNRESET, ENOTFOUND, socket hang up, …). Without this
 * every blip looks identical and we can't tell whether the problem is DNS,
 * TCP reset, or a 5xx that slipped past the status check.
 */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code
      ? `${err.message} (cause: ${cause.message} [${code}])`
      : `${err.message} (cause: ${cause.message})`;
  }
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    return `${err.message} (cause code: ${(cause as { code: unknown }).code})`;
  }
  return err.message;
}

function parseCsvEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Tees poll-loop diagnostics to `~/.qwen/logs/messaging.log`. Same file as
 * the dispatcher uses — operator sees one coherent timeline of "update
 * arrived / dispatcher handled it / error happened". Skipped in tests.
 */
function writeTelegramLog(line: string): void {
  if (process.env['NODE_ENV'] === 'test' || process.env['VITEST']) return;
  try {
    const dir = path.join(os.homedir(), '.qwen', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'messaging.log'),
      `${new Date().toISOString()} ${line}\n`,
    );
  } catch {
    /* best effort */
  }
}
