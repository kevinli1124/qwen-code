/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as crypto from 'crypto';
import * as http from 'http';
import { WebhookTrigger } from './webhook-trigger.js';
import {
  _resetSharedWebhookServerForTests,
  getSharedWebhookServer,
  verifyHmac,
} from './webhook-server.js';
import type { TriggerConfig } from './types.js';
import { TriggerError } from './types.js';

function makeConfig(overrides: Partial<TriggerConfig> = {}): TriggerConfig {
  return {
    id: 'deploy',
    name: 'Deploy',
    kind: 'webhook',
    enabled: true,
    agentRef: 'deploy-auditor',
    spec: { path: '/hooks/deploy' },
    ...overrides,
  };
}

/**
 * Fires an HTTP request and returns the response status and body. Uses a
 * per-test port picked by setting QWEN_TRIGGER_WEBHOOK_PORT before the
 * singleton is created.
 */
function request(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          'content-type': 'application/json',
          'content-length': body ? Buffer.byteLength(body) : 0,
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe('verifyHmac', () => {
  it('accepts matching hex digest', () => {
    const body = Buffer.from('{"ok":true}');
    const sig = crypto.createHmac('sha256', 's').update(body).digest('hex');
    expect(verifyHmac('s', body, sig)).toBe(true);
  });

  it('accepts "sha256=" prefixed digest (GitHub style)', () => {
    const body = Buffer.from('hi');
    const sig = crypto.createHmac('sha256', 's').update(body).digest('hex');
    expect(verifyHmac('s', body, `sha256=${sig}`)).toBe(true);
  });

  it('rejects mismatched digest', () => {
    expect(verifyHmac('s', Buffer.from('a'), 'x'.repeat(64))).toBe(false);
  });

  it('rejects wrong-length digest', () => {
    expect(verifyHmac('s', Buffer.from('a'), 'short')).toBe(false);
  });
});

describe('WebhookTrigger validate', () => {
  it('rejects missing path', () => {
    const t = new WebhookTrigger(makeConfig({ spec: {} }), {
      cronScheduler: {} as never,
    });
    expect(() => t.validate()).toThrow(TriggerError);
  });

  it('rejects unsupported method', () => {
    const t = new WebhookTrigger(
      makeConfig({ spec: { path: '/x', method: 'OPTIONS' } }),
      { cronScheduler: {} as never },
    );
    expect(() => t.validate()).toThrow(/unsupported method/);
  });

  it('rejects non-array allowedIPs', () => {
    const t = new WebhookTrigger(
      makeConfig({
        spec: { path: '/x', allowedIPs: 'nope' as unknown as string[] },
      }),
      { cronScheduler: {} as never },
    );
    expect(() => t.validate()).toThrow(/allowedIPs/);
  });
});

describe('WebhookTrigger end-to-end', () => {
  let port: number;

  beforeEach(() => {
    _resetSharedWebhookServerForTests();
    // Let the OS pick a free port by binding a dummy, reading the port, closing it.
    // We cannot do that async inside beforeEach easily — use a high random port.
    port = 40000 + Math.floor(Math.random() * 10000);
    process.env['QWEN_TRIGGER_WEBHOOK_PORT'] = String(port);
    process.env['QWEN_TRIGGER_WEBHOOK_BIND'] = '127.0.0.1';
  });

  afterEach(async () => {
    const server = getSharedWebhookServer();
    await server.stop();
    _resetSharedWebhookServerForTests();
    delete process.env['QWEN_TRIGGER_WEBHOOK_PORT'];
    delete process.env['QWEN_TRIGGER_WEBHOOK_BIND'];
    delete process.env['TEST_WEBHOOK_SECRET'];
  });

  it('fires the handler and returns 202 when no secret is configured', async () => {
    const trigger = new WebhookTrigger(makeConfig(), {
      cronScheduler: {} as never,
    });
    const onFire = vi.fn();
    trigger.validate();
    await trigger.start(onFire);

    const res = await request(port, 'POST', '/hooks/deploy', '{"ok":true}');
    expect(res.status).toBe(202);

    // Handler runs after response; give the event loop a tick.
    await new Promise((r) => setImmediate(r));
    expect(onFire).toHaveBeenCalledTimes(1);
    const payload = onFire.mock.calls[0][0].payload;
    expect(payload.method).toBe('POST');
    expect(payload.path).toBe('/hooks/deploy');
    expect(payload.json).toEqual({ ok: true });
    expect(payload.body).toBe('{"ok":true}');

    await trigger.stop();
  });

  it('returns 404 when path does not match', async () => {
    const trigger = new WebhookTrigger(makeConfig(), {
      cronScheduler: {} as never,
    });
    trigger.validate();
    await trigger.start(vi.fn());
    const res = await request(port, 'POST', '/nope');
    expect(res.status).toBe(404);
    await trigger.stop();
  });

  it('rejects requests lacking a valid HMAC when secret is configured', async () => {
    process.env['TEST_WEBHOOK_SECRET'] = 'shh';
    const trigger = new WebhookTrigger(
      makeConfig({
        spec: { path: '/hooks/deploy', secretEnv: 'TEST_WEBHOOK_SECRET' },
      }),
      { cronScheduler: {} as never },
    );
    const onFire = vi.fn();
    trigger.validate();
    await trigger.start(onFire);

    const bad = await request(port, 'POST', '/hooks/deploy', 'body');
    expect(bad.status).toBe(401);
    expect(onFire).not.toHaveBeenCalled();

    const sig = crypto.createHmac('sha256', 'shh').update('body').digest('hex');
    const good = await request(port, 'POST', '/hooks/deploy', 'body', {
      'x-trigger-signature': `sha256=${sig}`,
      'content-type': 'text/plain',
    });
    expect(good.status).toBe(202);
    await new Promise((r) => setImmediate(r));
    expect(onFire).toHaveBeenCalledTimes(1);

    await trigger.stop();
  });

  it('returns 413 when body exceeds 1 MB', async () => {
    const trigger = new WebhookTrigger(makeConfig(), {
      cronScheduler: {} as never,
    });
    trigger.validate();
    await trigger.start(vi.fn());
    const big = 'x'.repeat(1024 * 1024 + 10);
    const res = await request(port, 'POST', '/hooks/deploy', big, {
      'content-type': 'text/plain',
    });
    expect(res.status).toBe(413);
    await trigger.stop();
  });

  it('rejects public-bind triggers without secretEnv', async () => {
    await (
      await import('./webhook-server.js')
    )._resetSharedWebhookServerForTests();
    process.env['QWEN_TRIGGER_WEBHOOK_BIND'] = '0.0.0.0';
    const trigger = new WebhookTrigger(makeConfig(), {
      cronScheduler: {} as never,
    });
    trigger.validate();
    await expect(trigger.start(vi.fn())).rejects.toThrow(/loopback/);
  });
});
