/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Multi-channel messaging gateway — shared types.
 *
 * A {@link Conversation} is an append-only thread of {@link MessageRecord}s
 * scoped to a single `(channel, chatId)` pair. Each channel gateway (Telegram,
 * Discord, …) converts its native payload into an {@link IncomingMessage} and
 * hands it to the dispatcher. The dispatcher loads the matching conversation,
 * forks a subagent, and sends the response back through the same gateway.
 */

export type MessagingChannel = 'telegram' | 'discord' | 'slack' | 'cli';

export type MessageRole = 'user' | 'assistant' | 'system';

/** One line in a conversation JSONL file. */
export interface MessageRecord {
  role: MessageRole;
  text: string;
  /** Unix ms. */
  timestamp: number;
  /** Channel-native sender id (e.g., Telegram user id). Absent for `assistant`. */
  senderId?: string;
  /** Sender display name, if the channel provides one. */
  senderName?: string;
  /** Channel-native message id, useful for threading / reply-to. */
  externalId?: string;
  /** Arbitrary channel-specific metadata — not read by core logic. */
  meta?: Record<string, unknown>;
}

/**
 * Payload produced by a gateway when a user sends a message. The dispatcher
 * uses this to upsert a conversation and invoke an agent.
 */
export interface IncomingMessage {
  channel: MessagingChannel;
  /** Channel-native chat / room id — unique within the channel. */
  chatId: string;
  /** Sender identity — used for authorization and attribution. */
  senderId: string;
  senderName?: string;
  text: string;
  /** Unix ms when the channel received it (not when we processed it). */
  timestamp: number;
  externalId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Response produced by the dispatcher, handed back to the originating gateway
 * so it can send it to the user. `replyToExternalId` is optional — gateways
 * that support threading (Telegram reply-to, Slack thread_ts) should honor it.
 */
export interface OutgoingMessage {
  channel: MessagingChannel;
  chatId: string;
  text: string;
  replyToExternalId?: string;
}

/**
 * Conversation summary returned by the store for listing. The actual message
 * log is read lazily via {@link ConversationStore.readHistory}.
 */
export interface ConversationSummary {
  id: string;
  channel: MessagingChannel;
  chatId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  /** First ~80 chars of the last user message — lightweight preview. */
  lastPreview?: string;
}

/**
 * Options for loading a slice of a conversation for agent injection.
 * Defaults (message limit 20, char budget 8000) are deliberately conservative
 * to avoid exploding subagent context on long threads.
 */
export interface HistoryWindow {
  /** Hard cap on message count. Default 20. */
  maxMessages?: number;
  /** Rough char budget (≈ 4 chars/token). Default 8000. */
  maxChars?: number;
}

export const DEFAULT_HISTORY_WINDOW: Required<HistoryWindow> = {
  maxMessages: 20,
  maxChars: 8000,
};

/**
 * Channel gateway contract. Each concrete gateway (Telegram, Discord, …)
 * implements this so the dispatcher can treat them uniformly.
 */
export interface MessagingGateway {
  readonly channel: MessagingChannel;
  /** Start listening for incoming messages. Idempotent. */
  start(
    onMessage: (msg: IncomingMessage) => void | Promise<void>,
  ): Promise<void>;
  /** Stop listening. Idempotent; safe to call on an unstarted gateway. */
  stop(): Promise<void>;
  /** Deliver a reply back to the user. */
  send(msg: OutgoingMessage): Promise<void>;
  /**
   * Show a "typing…"-style presence indicator in the user's chat window
   * while the agent is thinking. Optional because some channels don't have a
   * usable equivalent. The gateway decides the concrete semantics
   * (Telegram → `sendChatAction: typing`, Discord → `triggerTyping`, …).
   *
   * Callers expect this to be cheap and safe to invoke repeatedly on a
   * timer — failures should be swallowed internally, not thrown.
   */
  sendTypingIndicator?(chatId: string): Promise<void>;
}

export enum MessagingErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NETWORK = 'NETWORK',
  GATEWAY = 'GATEWAY',
  STORE = 'STORE',
}

export class MessagingError extends Error {
  constructor(
    message: string,
    readonly code: MessagingErrorCode,
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}
