/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createServer } from './WebServer.js';

interface FetchResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

function nodeFetch(
  port: number,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: init.method ?? 'GET',
        headers: init.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') headers[k] = v;
            else if (Array.isArray(v)) headers[k] = v.join(',');
          }
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers,
          });
        });
      },
    );
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

describe('WebServer security gating', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const created = await createServer(0);
    server = created.server;
    port = created.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ── Host header (DNS rebinding defense) ──────────────────────────────────

  it('rejects request with mismatched Host (DNS rebinding)', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: {
        Host: 'evil.attacker.com',
        Origin: `http://localhost:${port}`,
      },
    });
    expect(r.status).toBe(403);
    expect(r.body).toContain('invalid host');
  });

  it('accepts Host = 127.0.0.1:<port>', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: { Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'none' },
    });
    expect(r.status).toBe(200);
  });

  it('accepts Host = localhost:<port>', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: { Host: `localhost:${port}`, 'Sec-Fetch-Site': 'none' },
    });
    expect(r.status).toBe(200);
  });

  it('accepts Host = [::1]:<port> (IPv6)', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: { Host: `[::1]:${port}`, 'Sec-Fetch-Site': 'none' },
    });
    expect(r.status).toBe(200);
  });

  it('accepts Host with uppercase letters (case-insensitive)', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: { Host: `LOCALHOST:${port}`, 'Sec-Fetch-Site': 'none' },
    });
    expect(r.status).toBe(200);
  });

  // ── Origin (cross-origin and cross-port localhost CSRF) ──────────────────

  it('rejects external origin', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: { Host: `127.0.0.1:${port}`, Origin: 'https://evil.com' },
    });
    expect(r.status).toBe(403);
    expect(r.body).toContain('origin');
  });

  it('rejects cross-port localhost Origin (e.g. another dev server)', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://localhost:${port + 1}`,
      },
    });
    expect(r.status).toBe(403);
    expect(r.body).toContain('origin');
  });

  it('accepts same-origin localhost Origin', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://localhost:${port}`,
      },
    });
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe(
      `http://localhost:${port}`,
    );
    expect(r.headers['vary']).toBe('Origin');
  });

  it('does NOT echo wildcard CORS', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: { Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'none' },
    });
    expect(r.headers['access-control-allow-origin']).not.toBe('*');
  });

  // ── State-changing requests must have Origin ─────────────────────────────

  it('rejects POST with no Origin (curl-style local process)', async () => {
    const r = await nodeFetch(port, '/api/sessions', {
      method: 'POST',
      headers: {
        Host: `127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd: process.cwd() }),
    });
    expect(r.status).toBe(403);
    expect(r.body).toContain('origin required');
  });

  it('rejects PATCH /api/settings with no Origin', async () => {
    const r = await nodeFetch(port, '/api/settings', {
      method: 'PATCH',
      headers: {
        Host: `127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tools: { approvalMode: 'yolo' } }),
    });
    expect(r.status).toBe(403);
  });

  it('rejects DELETE with no Origin', async () => {
    const r = await nodeFetch(port, '/api/sessions/xxx', {
      method: 'DELETE',
      headers: { Host: `127.0.0.1:${port}` },
    });
    expect(r.status).toBe(403);
  });

  // ── Simple-GET CSRF (image-tag, no Origin) ───────────────────────────────

  it('rejects GET with no Origin and no Sec-Fetch-Site (image-tag CSRF)', async () => {
    const r = await nodeFetch(port, '/api/read-file?path=foo', {
      headers: { Host: `127.0.0.1:${port}` },
    });
    expect(r.status).toBe(403);
    expect(r.body).toContain('same-origin proof');
  });

  it('rejects GET with Sec-Fetch-Site: cross-site (browser-flagged CSRF)', async () => {
    const r = await nodeFetch(port, '/api/read-file?path=foo', {
      headers: {
        Host: `127.0.0.1:${port}`,
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    expect(r.status).toBe(403);
  });

  it('accepts GET with Sec-Fetch-Site: same-origin (legit SPA fetch without Origin header)', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: {
        Host: `127.0.0.1:${port}`,
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    expect(r.status).toBe(200);
  });

  it('accepts GET with Sec-Fetch-Site: none (direct browser nav)', async () => {
    const r = await nodeFetch(port, '/api/health', {
      headers: { Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'none' },
    });
    expect(r.status).toBe(200);
  });

  // ── POST /api/sessions cwd validation ────────────────────────────────────

  it('rejects POST /api/sessions when cwd is missing', async () => {
    const r = await nodeFetch(port, '/api/sessions', {
      method: 'POST',
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it('rejects POST /api/sessions when cwd is relative', async () => {
    const r = await nodeFetch(port, '/api/sessions', {
      method: 'POST',
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cwd: 'some/relative/path' }),
    });
    expect(r.status).toBe(400);
    expect(r.body).toContain('absolute');
  });

  it('rejects POST /api/sessions when cwd does not exist', async () => {
    const r = await nodeFetch(port, '/api/sessions', {
      method: 'POST',
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cwd:
          process.platform === 'win32'
            ? 'C:\\__definitely_does_not_exist__\\foo'
            : '/__definitely_does_not_exist__/foo',
      }),
    });
    expect(r.status).toBe(400);
  });

  // ── OPTIONS preflight ────────────────────────────────────────────────────

  it('OPTIONS preflight returns 204 with valid Host + same-origin Origin', async () => {
    const r = await nodeFetch(port, '/api/health', {
      method: 'OPTIONS',
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
      },
    });
    expect(r.status).toBe(204);
  });

  it('OPTIONS preflight rejected with bad Host', async () => {
    const r = await nodeFetch(port, '/api/health', {
      method: 'OPTIONS',
      headers: { Host: 'evil.com' },
    });
    expect(r.status).toBe(403);
  });

  it('OPTIONS preflight rejected with cross-origin Origin', async () => {
    const r = await nodeFetch(port, '/api/health', {
      method: 'OPTIONS',
      headers: { Host: `127.0.0.1:${port}`, Origin: 'https://evil.com' },
    });
    expect(r.status).toBe(403);
  });
});
