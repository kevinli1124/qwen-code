/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared HTTP server for webhook triggers. One instance per process, lazily
 * started when the first webhook trigger registers. Uses Node's native `http`
 * module — no express / koa dependency. Routes are keyed by (method, path);
 * trigger handlers are looked up on each request.
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('WEBHOOK_SERVER');

export interface WebhookRequestContext {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  ip: string;
  body: Buffer;
}

export interface WebhookHandlerOptions {
  method: string;
  /** Env var name holding the HMAC secret. Required when bind != 127.0.0.1. */
  secretEnv?: string;
  /** Allowed client IPs (cidr-less, exact match). Empty = allow all. */
  allowedIPs?: string[];
}

export type WebhookHandler = (
  ctx: WebhookRequestContext,
) => void | Promise<void>;

interface Route {
  method: string;
  path: string;
  triggerId: string;
  handler: WebhookHandler;
  options: WebhookHandlerOptions;
}

const DEFAULT_PORT = 9876;
const DEFAULT_BIND = '127.0.0.1';
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const HMAC_HEADER = 'x-trigger-signature';

/**
 * Reads configuration from env:
 *   QWEN_TRIGGER_WEBHOOK_PORT — integer, defaults to 9876
 *   QWEN_TRIGGER_WEBHOOK_BIND — address, defaults to 127.0.0.1
 * These are read once per server lifetime.
 */
function readServerConfig(): { port: number; bind: string } {
  const port = Number.parseInt(
    process.env['QWEN_TRIGGER_WEBHOOK_PORT'] ?? '',
    10,
  );
  const bind = process.env['QWEN_TRIGGER_WEBHOOK_BIND'] ?? DEFAULT_BIND;
  return {
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    bind,
  };
}

export class WebhookServer {
  private server: http.Server | null = null;
  private routes: Map<string, Route> = new Map();
  private startPromise: Promise<void> | null = null;
  private readonly config = readServerConfig();

  /** "METHOD path" key used internally. */
  static routeKey(method: string, path: string): string {
    return `${method.toUpperCase()} ${normalizePath(path)}`;
  }

  get isPublicBind(): boolean {
    return this.config.bind !== '127.0.0.1' && this.config.bind !== 'localhost';
  }

  get boundPort(): number {
    return this.config.port;
  }

  get boundAddress(): string {
    return this.config.bind;
  }

  async register(
    triggerId: string,
    path: string,
    handler: WebhookHandler,
    options: WebhookHandlerOptions,
  ): Promise<void> {
    // Security rule: if the server is bound to a non-loopback address, every
    // trigger must carry an HMAC secret. We refuse to register otherwise so
    // the misconfiguration surfaces immediately at trigger load time.
    if (this.isPublicBind && !options.secretEnv) {
      throw new Error(
        `Webhook trigger "${triggerId}" must set spec.secretEnv because the webhook server is bound to a non-loopback address (${this.config.bind}).`,
      );
    }

    const key = WebhookServer.routeKey(options.method, path);
    if (this.routes.has(key)) {
      const existing = this.routes.get(key)!;
      if (existing.triggerId !== triggerId) {
        throw new Error(
          `Webhook route conflict: ${key} is already claimed by trigger "${existing.triggerId}".`,
        );
      }
    }
    this.routes.set(key, {
      method: options.method.toUpperCase(),
      path: normalizePath(path),
      triggerId,
      handler,
      options,
    });
    await this.ensureStarted();
  }

  unregister(triggerId: string): void {
    for (const [key, r] of this.routes) {
      if (r.triggerId === triggerId) this.routes.delete(key);
    }
    if (this.routes.size === 0) {
      void this.stop();
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.server) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = new Promise<void>((resolve, reject) => {
      const server = http.createServer((req, res) =>
        this.handleRequest(req, res),
      );
      server.on('error', (err) => {
        debugLogger.warn('WebhookServer error:', err);
        reject(err);
        this.startPromise = null;
      });
      server.listen(this.config.port, this.config.bind, () => {
        this.server = server;
        debugLogger.debug(
          `WebhookServer listening on ${this.config.bind}:${this.config.port}`,
        );
        resolve();
      });
    });
    return this.startPromise;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    this.startPromise = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', 'http://internal');
    const key = WebhookServer.routeKey(method, url.pathname);
    const route = this.routes.get(key);
    if (!route) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    // IP allowlist check (exact match, no CIDR).
    if (route.options.allowedIPs && route.options.allowedIPs.length > 0) {
      const clientIp = req.socket.remoteAddress ?? '';
      if (!route.options.allowedIPs.includes(clientIp)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
    }

    // Collect body with size cap.
    let body: Buffer;
    try {
      body = await readBody(req, MAX_BODY_BYTES);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bad Request';
      res.statusCode = msg.includes('too large') ? 413 : 400;
      res.end(msg);
      return;
    }

    // HMAC verification when secretEnv is set.
    if (route.options.secretEnv) {
      const secret = process.env[route.options.secretEnv];
      if (!secret) {
        res.statusCode = 500;
        res.end('Webhook secret env not set');
        return;
      }
      const given = (req.headers[HMAC_HEADER] as string | undefined) ?? '';
      if (!verifyHmac(secret, body, given)) {
        res.statusCode = 401;
        res.end('Bad signature');
        return;
      }
    }

    // Build context for the handler.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(',');
    }
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, k) => {
      query[k] = value;
    });
    const ctx: WebhookRequestContext = {
      method,
      path: url.pathname,
      headers,
      query,
      ip: req.socket.remoteAddress ?? '',
      body,
    };

    // Respond before waiting for the handler — the agent runs in the
    // background; we don't want the caller to time out.
    res.statusCode = 202;
    res.end('Accepted');

    try {
      await route.handler(ctx);
    } catch (err) {
      debugLogger.warn(
        `Webhook handler for trigger "${route.triggerId}" threw:`,
        err,
      );
    }
  }
}

function normalizePath(p: string): string {
  if (!p.startsWith('/')) p = '/' + p;
  // Trim trailing slash except for root.
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

async function readBody(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let overflowed = false;
    req.on('data', (chunk: Buffer) => {
      if (overflowed) return;
      total += chunk.length;
      if (total > maxBytes) {
        overflowed = true;
        // Keep the socket alive so the caller can send a 413 response.
        // Stop buffering further chunks — they're just drained.
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (overflowed) {
        reject(new Error(`Request body too large (> ${maxBytes} bytes)`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Timing-safe HMAC-SHA256 comparison. Accepts either a bare hex digest or
 * a `sha256=<hex>` prefix (GitHub style) in the provided signature.
 */
export function verifyHmac(
  secret: string,
  body: Buffer,
  provided: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  const normalized = provided.startsWith('sha256=')
    ? provided.slice('sha256='.length)
    : provided;
  if (normalized.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(normalized, 'hex'),
    );
  } catch {
    return false;
  }
}

/** Lazy process-wide singleton. Created on first access. */
let sharedServer: WebhookServer | null = null;
export function getSharedWebhookServer(): WebhookServer {
  if (!sharedServer) sharedServer = new WebhookServer();
  return sharedServer;
}

/** Test helper: reset the singleton between tests. */
export function _resetSharedWebhookServerForTests(): void {
  sharedServer = null;
}
