/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugLogger } from '../utils/debugLogger.js';
import { ConversationStore } from '../messaging/conversation-store.js';
import { MessageDispatcher } from '../messaging/dispatcher.js';
import { TelegramGateway } from '../messaging/telegram-gateway.js';
import type {
  HistoryWindow,
  MessagingChannel,
  MessagingGateway,
} from '../messaging/types.js';
import { BaseTrigger, type OnFireCallback } from './base-trigger.js';

function parseCsvEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
import { TriggerError, TriggerErrorCode, type TriggerKind } from './types.js';

const debugLogger = createDebugLogger('MESSAGE_TRIGGER');

/**
 * Shape of `spec` for a `kind: message` trigger. Read from YAML frontmatter.
 */
interface MessageTriggerSpec {
  channel: MessagingChannel;
  allowedUserIds?: readonly string[];
  historyWindow?: HistoryWindow;
  promptPrefix?: string;
  errorReply?: string;
  /** Telegram-specific: bot token override (else TELEGRAM_BOT_TOKEN env). */
  token?: string;
}

/**
 * Context passed to the gateway factory. Includes credentials resolved by
 * MessageTrigger from trigger spec → env var → user settings (in that
 * precedence order). The factory itself should NOT re-read env / settings.
 */
export interface MessageGatewayFactoryContext {
  spec: MessageTriggerSpec;
  resolvedToken?: string;
  resolvedAllowedUserIds: readonly string[];
}

/** Injection seam for unit tests — swap the real gateway out. */
export interface MessageTriggerGatewayFactory {
  create(ctx: MessageGatewayFactoryContext): MessagingGateway;
}

const defaultGatewayFactory: MessageTriggerGatewayFactory = {
  create(ctx: MessageGatewayFactoryContext): MessagingGateway {
    switch (ctx.spec.channel) {
      case 'telegram':
        return new TelegramGateway({
          token: ctx.resolvedToken,
          allowedUserIds: ctx.resolvedAllowedUserIds,
        });
      default:
        throw new TriggerError(
          `MessageTrigger: channel "${ctx.spec.channel}" not yet supported (phase 1 is Telegram only)`,
          TriggerErrorCode.INVALID_CONFIG,
        );
    }
  },
};

/**
 * Bridges a messaging gateway (Telegram today; Discord / Slack later) to the
 * subagent fork path.
 *
 * Unlike the other trigger kinds, MessageTrigger owns the full request /
 * response cycle rather than emitting a single `onFire` event and letting
 * TriggerManager invoke the agent. That's because a message exchange is
 * inherently two-way — the gateway needs the agent's reply to send back —
 * and the surrounding conversation state needs to persist across turns.
 *
 * The stored onFire callback is invoked with an empty payload for
 * observability only (telemetry, a future audit tool) so the manager's
 * global counters still reflect message activity.
 */
export class MessageTrigger extends BaseTrigger {
  readonly kind: TriggerKind = 'message';

  private gateway?: MessagingGateway;
  private dispatcher?: MessageDispatcher;
  private started = false;
  private readonly gatewayFactory: MessageTriggerGatewayFactory;

  constructor(
    cfg: ConstructorParameters<typeof BaseTrigger>[0],
    deps: ConstructorParameters<typeof BaseTrigger>[1],
    gatewayFactory: MessageTriggerGatewayFactory = defaultGatewayFactory,
  ) {
    super(cfg, deps);
    this.gatewayFactory = gatewayFactory;
  }

  override validate(): void {
    const spec = this.cfg.spec as Record<string, unknown>;
    const channel = spec['channel'];
    if (typeof channel !== 'string') {
      throw new TriggerError(
        `MessageTrigger "${this.cfg.id}": spec.channel is required`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    if (channel !== 'telegram') {
      throw new TriggerError(
        `MessageTrigger "${this.cfg.id}": only channel="telegram" is supported in phase 1`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    const allowedUserIds = spec['allowedUserIds'];
    if (allowedUserIds !== undefined) {
      if (
        !Array.isArray(allowedUserIds) ||
        !allowedUserIds.every((v) => typeof v === 'string')
      ) {
        throw new TriggerError(
          `MessageTrigger "${this.cfg.id}": spec.allowedUserIds must be string[]`,
          TriggerErrorCode.INVALID_CONFIG,
          this.cfg.id,
        );
      }
    }
    const window = spec['historyWindow'];
    if (window !== undefined) {
      if (typeof window !== 'object' || window === null) {
        throw new TriggerError(
          `MessageTrigger "${this.cfg.id}": spec.historyWindow must be an object`,
          TriggerErrorCode.INVALID_CONFIG,
          this.cfg.id,
        );
      }
      const w = window as Record<string, unknown>;
      for (const key of ['maxMessages', 'maxChars']) {
        const v = w[key];
        if (v !== undefined && (typeof v !== 'number' || v <= 0)) {
          throw new TriggerError(
            `MessageTrigger "${this.cfg.id}": spec.historyWindow.${key} must be a positive number`,
            TriggerErrorCode.INVALID_CONFIG,
            this.cfg.id,
          );
        }
      }
    }
    if (!this.deps.config || !this.deps.subagentManager) {
      throw new TriggerError(
        `MessageTrigger "${this.cfg.id}": requires Config + SubagentManager in deps (host is not wired)`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
  }

  async start(onFire: OnFireCallback): Promise<void> {
    if (this.started) return;
    this.onFire = onFire;

    const spec = this.cfg.spec as unknown as MessageTriggerSpec;
    const config = this.deps.config!;
    const subagentManager = this.deps.subagentManager!;

    const store = new ConversationStore(config.getProjectRoot());

    // Resolve credentials with a stable precedence: trigger spec override →
    // env var → user-scope settings. env wins over settings because env is
    // transient (process-only) and least likely to leak to a repo.
    const creds = config.getTelegramCredentials?.() ?? {};
    const resolvedToken =
      spec.token ?? process.env['TELEGRAM_BOT_TOKEN']?.trim() ?? creds.token;
    const envAllowList = parseCsvEnv(process.env['TELEGRAM_ALLOWED_USER_IDS']);
    const resolvedAllowedUserIds =
      spec.allowedUserIds ??
      (envAllowList.length > 0 ? envAllowList : (creds.allowedUserIds ?? []));

    this.gateway = this.gatewayFactory.create({
      spec,
      resolvedToken,
      resolvedAllowedUserIds,
    });
    this.dispatcher = new MessageDispatcher(
      { config, subagentManager, store },
      this.gateway,
      {
        agentRef: this.cfg.agentRef || undefined,
        historyWindow: spec.historyWindow,
        promptPrefix: spec.promptPrefix,
        errorReply: spec.errorReply,
      },
    );

    await this.gateway.start(async (msg) => {
      // Fire onFire for observability only — dispatcher owns the real work.
      try {
        await this.fireManually({
          channel: msg.channel,
          chatId: msg.chatId,
          senderId: msg.senderId,
        });
      } catch (err) {
        debugLogger.debug(
          `MessageTrigger "${this.cfg.id}" onFire notify threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await this.dispatcher!.onIncoming(msg);
    });

    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    try {
      await this.gateway?.stop();
    } finally {
      this.gateway = undefined;
      this.dispatcher = undefined;
      this.started = false;
    }
  }
}
