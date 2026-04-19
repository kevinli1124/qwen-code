/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as pathMod from 'node:path';
import * as os from 'node:os';
import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { SubagentManager } from '../subagents/subagent-manager.js';
import { ContextState } from '../agents/runtime/agent-headless.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import type { ConversationStore } from './conversation-store.js';
import { defaultAssistantConfig } from './default-agent.js';
import {
  DEFAULT_HISTORY_WINDOW,
  MessagingError,
  MessagingErrorCode,
  type HistoryWindow,
  type IncomingMessage,
  type MessageRecord,
  type MessagingGateway,
} from './types.js';

const debugLogger = createDebugLogger('MESSAGING_DISPATCHER');

export interface MessageDispatchOptions {
  /** Name of a `.qwen/agents/<name>.md` subagent to fork. If omitted, the
   *  dispatcher falls back to the synthetic default assistant. */
  agentRef?: string;
  /** How much of the conversation to inject as subagent history. */
  historyWindow?: HistoryWindow;
  /** Prepended to the incoming text as the user turn (e.g., "[Telegram]"). */
  promptPrefix?: string;
  /** Generic error message sent to the user when the agent fork throws.
   *  Deliberately vague to avoid leaking internals. Set to empty string to
   *  suppress user-visible errors entirely. */
  errorReply?: string;
  /**
   * Hard ceiling on agent execution per incoming message (ms). Prevents a
   * hung reasoning loop from pinning the gateway indefinitely. Default 90s.
   */
  agentTimeoutMs?: number;
}

const DEFAULT_ERROR_REPLY =
  'Sorry, I hit an error handling that. Please try again.';

/** Telegram's typing indicator auto-expires after ~5 s, so we refresh at a
 *  slightly shorter cadence to keep it on screen continuously while the
 *  agent is thinking. Other channels with different expiry can override by
 *  subclassing — kept as a constant for now to avoid premature parameterization. */
const TYPING_REFRESH_MS = 4000;

export interface DispatcherDeps {
  config: Config;
  subagentManager: SubagentManager;
  store: ConversationStore;
}

/**
 * Glues a {@link MessagingGateway} to a subagent fork.
 *
 * For every incoming message:
 *   1. Persist the user turn to the conversation store.
 *   2. Load a bounded slice of prior turns (default 20 messages, 8k chars).
 *   3. Fork the bound subagent (or a synthetic default) with the prior slice
 *      as `extraHistory`, and the incoming text as the task prompt.
 *   4. On completion, persist the assistant turn and reply through the same
 *      gateway.
 *
 * Failures are isolated per-message: a broken subagent doesn't take down the
 * poll loop. The user sees a single generic "sorry" reply (configurable).
 */
export class MessageDispatcher {
  constructor(
    private readonly deps: DispatcherDeps,
    private readonly gateway: MessagingGateway,
    private readonly options: MessageDispatchOptions = {},
  ) {}

  /** Entry point for gateway.start(). Bound as the onMessage callback. */
  readonly onIncoming = async (msg: IncomingMessage): Promise<void> => {
    writeMessagingLog(
      `[messaging] incoming ${msg.channel}:${msg.chatId} from ${msg.senderName ?? msg.senderId}: ${msg.text.slice(0, 120)}`,
    );
    try {
      await this.handle(msg);
      writeMessagingLog(`[messaging] handled ${msg.channel}:${msg.chatId}`);
    } catch (err) {
      const summary = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      // Ink typically owns stdout and swallows stderr, so we tee to a log
      // file as well — that's the only reliable way the operator gets to
      // see *why* their bot replied "Sorry…" mid-workflow.
      writeMessagingLog(
        `[messaging] dispatcher crashed on ${msg.channel}:${msg.chatId} — ${summary}`,
      );
      if (stack) writeMessagingLog(stack);
      process.stderr.write(
        `[messaging] dispatcher crashed on ${msg.channel}:${msg.chatId} — ${summary}\n`,
      );
      if (stack) {
        process.stderr.write(stack + '\n');
      }
      debugLogger.warn(
        `Dispatcher crashed on ${msg.channel}:${msg.chatId}: ${summary}`,
      );
      await this.sendErrorReply(msg, summary);
    }
  };

  private async handle(msg: IncomingMessage): Promise<void> {
    // Kick off a presence indicator (e.g. Telegram's "typing…") as early as
    // possible so the user has feedback while the subagent spins up. If the
    // gateway doesn't implement it, this is a no-op.
    const stopTyping = this.startTypingIndicator(msg);

    try {
      await this.handleCore(msg);
    } finally {
      stopTyping();
    }
  }

  /**
   * Fires the typing indicator once immediately and again every
   * {@link TYPING_REFRESH_MS} ms until the returned disposer is called. Never
   * throws — indicator failures are cosmetic and must not bubble up.
   */
  private startTypingIndicator(msg: IncomingMessage): () => void {
    const gateway = this.gateway;
    if (typeof gateway.sendTypingIndicator !== 'function') {
      return () => {};
    }
    const send = () =>
      gateway.sendTypingIndicator!(msg.chatId).catch(() => {
        /* swallowed in gateway impl; doubled up here for safety */
      });
    send();
    const timer = setInterval(send, TYPING_REFRESH_MS);
    return () => clearInterval(timer);
  }

  private async handleCore(msg: IncomingMessage): Promise<void> {
    const { store } = this.deps;

    // 1. Load history BEFORE appending the incoming so it isn't duplicated in
    //    both extraHistory and task_prompt.
    const priorHistory = await store.readHistory(
      msg.channel,
      msg.chatId,
      this.options.historyWindow,
    );

    // 2. Persist the user turn — even if the agent later fails, the log
    //    reflects what the user sent.
    const userRecord: MessageRecord = {
      role: 'user',
      text: msg.text,
      timestamp: msg.timestamp,
      senderId: msg.senderId,
      senderName: msg.senderName,
      externalId: msg.externalId,
    };
    await store.append(msg.channel, msg.chatId, userRecord);

    // 3. Resolve the subagent config.
    const subagent = await this.resolveAgent();

    // 4. Build context + history, fork, execute.
    const extraHistory = messagesToContent(priorHistory);
    const taskPrompt = this.options.promptPrefix
      ? `${this.options.promptPrefix} ${msg.text}`
      : msg.text;

    const contextState = new ContextState();
    contextState.set('task_prompt', taskPrompt);
    contextState.set('incoming', {
      channel: msg.channel,
      chatId: msg.chatId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      text: msg.text,
    });

    const agent = await this.deps.subagentManager.createAgentHeadless(
      subagent,
      this.deps.config,
    );
    // Hard ceiling on how long a single incoming message can tie up the
    // dispatcher. Protects against infinite tool-call loops and hung model
    // streams — without this, one stuck reasoning loop pins the whole
    // gateway (see the "7 pending updates, all stuck" regression we hit).
    const TIMEOUT_MS = this.options.agentTimeoutMs ?? 90_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // Messaging context is self-contained: our extraHistory IS the full
      // conversation, and the default agent doesn't need the CLI's env
      // bootstrap (which primes the REPL with tool catalogues + project
      // context). Skipping it keeps the request small and focused.
      //
      // Tools stay ON even for the default agent — the user legitimately
      // wants the bot to read files, grep, etc. from Telegram. Default
      // agent's tight max_turns / max_time_minutes in runConfig are the
      // guardrail against infinite tool-call loops (see default-agent.ts).
      await agent.execute(contextState, controller.signal, {
        extraHistory,
        skipEnvHistory: true,
      });
    } finally {
      clearTimeout(timer);
    }
    if (controller.signal.aborted) {
      throw new Error(
        `agent timed out after ${TIMEOUT_MS}ms — likely a tool-call loop or a hung model stream`,
      );
    }
    const terminateMode = agent.getTerminateMode?.();
    if (terminateMode) {
      writeMessagingLog(
        `[messaging] agent terminated mode=${terminateMode} for ${msg.channel}:${msg.chatId}`,
      );
    }

    const replyText = (agent.getFinalText() ?? '').trim();
    if (!replyText) {
      // Empty final text usually means the reasoning loop hit max_turns /
      // max_time before producing a natural answer. Send a short diagnostic
      // reply rather than falling silent — silence looks like a bug to the
      // user, and the operator needs the terminate mode to tune limits.
      writeMessagingLog(
        `[messaging] agent returned empty text for ${msg.channel}:${msg.chatId} (terminateMode=${terminateMode ?? '?'}) — sending fallback reply`,
      );
      await this.gateway.send({
        channel: msg.channel,
        chatId: msg.chatId,
        text:
          terminateMode === 'MAX_TURNS'
            ? '(I ran out of reasoning turns before composing a reply — try asking more directly, or pin a specific agent via spec.agentRef.)'
            : '(I finished without producing a reply.)',
        replyToExternalId: msg.externalId,
      });
      return;
    }

    // 5. Persist the assistant turn.
    const assistantRecord: MessageRecord = {
      role: 'assistant',
      text: replyText,
      timestamp: Date.now(),
      senderName: subagent.name,
    };
    await store.append(msg.channel, msg.chatId, assistantRecord);

    // 6. Reply through the gateway.
    await this.gateway.send({
      channel: msg.channel,
      chatId: msg.chatId,
      text: replyText,
      replyToExternalId: msg.externalId,
    });
  }

  private async resolveAgent() {
    const ref = this.options.agentRef;
    if (!ref) {
      return defaultAssistantConfig();
    }
    const found = await this.deps.subagentManager.loadSubagent(ref);
    if (!found) {
      throw new MessagingError(
        `MessageDispatcher: agent "${ref}" not found`,
        MessagingErrorCode.INVALID_CONFIG,
      );
    }
    return found;
  }

  private async sendErrorReply(
    msg: IncomingMessage,
    detail?: string,
  ): Promise<void> {
    const base = this.options.errorReply ?? DEFAULT_ERROR_REPLY;
    if (!base) return;
    // Surface a short error detail to the user so they can actually debug from
    // Telegram. The gateway owner is the same person as the message sender in
    // the personal-assistant case — no new info disclosure.
    const text =
      detail && detail.length > 0
        ? `${base}\n\n(${truncate(detail, 300)})`
        : base;
    try {
      await this.gateway.send({
        channel: msg.channel,
        chatId: msg.chatId,
        text,
        replyToExternalId: msg.externalId,
      });
    } catch (err) {
      debugLogger.warn(
        `Failed to send error reply to ${msg.channel}:${msg.chatId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Re-exported so callers can see the defaults. */
export { DEFAULT_HISTORY_WINDOW };

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/**
 * Tees incoming / outgoing / error events to `~/.qwen/logs/messaging.log`.
 * Best-effort: write failures (permission, ENOSPC, …) are swallowed so a
 * broken log can never take down the reply path.
 *
 * Skipped in test environments (NODE_ENV=test or VITEST set) so unit tests
 * don't pollute the operator's real log file — we've been burned by that.
 */
function writeMessagingLog(line: string): void {
  if (process.env['NODE_ENV'] === 'test' || process.env['VITEST']) return;
  try {
    const dir = pathMod.join(os.homedir(), '.qwen', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      pathMod.join(dir, 'messaging.log'),
      `${new Date().toISOString()} ${line}\n`,
    );
  } catch {
    /* best effort */
  }
}

/**
 * Converts conversation history into the `Content[]` shape expected by
 * `AgentHeadless.execute({ extraHistory })`. Only user/assistant turns are
 * included — system records (if any) are filtered out to avoid confusing the
 * model's role classifier.
 */
function messagesToContent(history: MessageRecord[]): Content[] {
  const out: Content[] = [];
  for (const m of history) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    out.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    });
  }
  return out;
}
