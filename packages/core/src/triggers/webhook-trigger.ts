/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTrigger,
  type OnFireCallback,
  type TriggerDeps,
} from './base-trigger.js';
import {
  TriggerError,
  TriggerErrorCode,
  type TriggerConfig,
  type TriggerKind,
} from './types.js';
import {
  getSharedWebhookServer,
  type WebhookRequestContext,
  type WebhookServer,
} from './webhook-server.js';

export interface WebhookTriggerSpec {
  /** URL path (leading `/` optional). */
  path: string;
  /** HTTP method. Default POST. */
  method?: string;
  /** Name of process env var that holds the HMAC-SHA256 secret. */
  secretEnv?: string;
  /** Exact-match client IP allowlist. Empty = allow any. */
  allowedIPs?: string[];
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * HTTP webhook trigger. Registers a route on the shared WebhookServer and
 * fires the bound subagent with `{ method, path, headers, query, body, json?, ip }`.
 * When `spec.secretEnv` is set, the server verifies an HMAC-SHA256 signature
 * from the `X-Trigger-Signature` header before firing.
 */
export class WebhookTrigger extends BaseTrigger {
  readonly kind: TriggerKind = 'webhook';
  private server: WebhookServer | null = null;

  constructor(cfg: TriggerConfig, deps: TriggerDeps) {
    super(cfg, deps);
  }

  override validate(): void {
    const spec = this.cfg.spec as unknown as Partial<WebhookTriggerSpec>;
    if (!spec || typeof spec.path !== 'string' || !spec.path.trim()) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (webhook) requires spec.path`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
    if (spec.method !== undefined) {
      if (!ALLOWED_METHODS.has(spec.method.toUpperCase())) {
        throw new TriggerError(
          `Trigger "${this.cfg.id}" (webhook) has unsupported method "${spec.method}"`,
          TriggerErrorCode.INVALID_CONFIG,
          this.cfg.id,
        );
      }
    }
    if (spec.allowedIPs !== undefined) {
      if (!Array.isArray(spec.allowedIPs)) {
        throw new TriggerError(
          `Trigger "${this.cfg.id}" (webhook) allowedIPs must be an array`,
          TriggerErrorCode.INVALID_CONFIG,
          this.cfg.id,
        );
      }
    }
  }

  override async start(onFire: OnFireCallback): Promise<void> {
    this.onFire = onFire;
    if (this.server) return; // idempotent

    const spec = this.cfg.spec as unknown as WebhookTriggerSpec;
    const server = getSharedWebhookServer();
    this.server = server;
    await server.register(
      this.cfg.id,
      spec.path,
      (ctx) => this.handleHttp(ctx),
      {
        method: (spec.method ?? 'POST').toUpperCase(),
        secretEnv: spec.secretEnv,
        allowedIPs: spec.allowedIPs,
      },
    );
  }

  override stop(): void {
    if (this.server) {
      this.server.unregister(this.cfg.id);
      this.server = null;
    }
    this.onFire = null;
  }

  private async handleHttp(ctx: WebhookRequestContext): Promise<void> {
    const contentType = (ctx.headers['content-type'] ?? '').toLowerCase();
    const raw = ctx.body.toString('utf8');
    let json: unknown;
    if (contentType.includes('application/json')) {
      try {
        json = JSON.parse(raw);
      } catch {
        // Leave json undefined; body is still available as raw string.
      }
    }
    await this.fireManually({
      method: ctx.method,
      path: ctx.path,
      headers: ctx.headers,
      query: ctx.query,
      ip: ctx.ip,
      body: raw,
      json,
    });
  }
}
