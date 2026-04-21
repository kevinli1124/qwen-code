/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smoke tests for the embedded Web Server.
 * Uses createServer() directly so we control lifecycle without SIGINT hacks.
 *
 * Run:
 *   npx vitest run --config ./scripts/tests/vitest.web.config.ts
 */

import http from 'node:http';
import net from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ─── helpers ─────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

function req(url, method, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        hostname: u.hostname,
        port: Number(u.port),
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// ─── server lifecycle ─────────────────────────────────────────────────────────

let BASE;
let mainServer;

beforeAll(async () => {
  const { createServer } = await import(
    '../../packages/cli/src/web/WebServer.js'
  );
  const port = await freePort();
  const result = await createServer(port);
  mainServer = result.server;
  BASE = `http://127.0.0.1:${result.port}`;
}, 10_000);

afterAll(async () => {
  if (mainServer) await closeServer(mainServer);
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const { status, body } = await get(`${BASE}/api/health`);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ status: 'ok' });
  });
});

describe('GET /api/sessions', () => {
  it('returns an array', async () => {
    const { status, body } = await get(`${BASE}/api/sessions`);
    expect(status).toBe(200);
    expect(Array.isArray(JSON.parse(body))).toBe(true);
  });
});

describe('POST /api/sessions', () => {
  it('creates a session and returns sessionId', async () => {
    const { status, body } = await req(`${BASE}/api/sessions`, 'POST', {
      cwd: process.cwd(),
    });
    expect(status).toBe(201);
    expect(typeof JSON.parse(body).sessionId).toBe('string');
  });

  it('returns 400 when cwd is missing', async () => {
    const { status } = await req(`${BASE}/api/sessions`, 'POST', {});
    expect(status).toBe(400);
  });
});

describe('GET /api/settings', () => {
  it('returns expected shape', async () => {
    const { status, body } = await get(`${BASE}/api/settings`);
    expect(status).toBe(200);
    const json = JSON.parse(body);
    expect(json).toHaveProperty('security.auth.apiKey');
    expect(json).toHaveProperty('model.name');
    expect(json).toHaveProperty('general.setupCompleted');
    expect(json).toHaveProperty('tools.approvalMode');
  });
});

describe('PATCH /api/settings', () => {
  it('deep-merges without overwriting other keys', async () => {
    const unique = `test-agent-${Date.now()}`;
    const { status: patchStatus } = await req(`${BASE}/api/settings`, 'PATCH', {
      general: { agentName: unique },
    });
    expect(patchStatus).toBe(200);

    const { body } = await get(`${BASE}/api/settings`);
    const json = JSON.parse(body);
    expect(json.general.agentName).toBe(unique);
    // Other keys should still exist
    expect(json.model).toBeDefined();
    expect(json.tools).toBeDefined();
  });
});

describe('POST /api/settings/test — http:// protocol', () => {
  it('does not crash with ERR_INVALID_PROTOCOL for http:// base URL', async () => {
    const { status, body } = await req(`${BASE}/api/settings/test`, 'POST', {
      apiKey: 'test-key',
      authType: 'openai',
      baseUrl: 'http://127.0.0.1:19999/v1',
    });
    expect(status).toBe(200);
    const json = JSON.parse(body);
    expect(json.ok).toBe(false);
    // Must NOT be a protocol error — should be a network error (ECONNREFUSED)
    expect(json.error ?? '').not.toMatch(
      /ERR_INVALID_PROTOCOL|Protocol.*not supported/,
    );
  });

  it('returns 400 when apiKey is missing', async () => {
    const { status } = await req(`${BASE}/api/settings/test`, 'POST', {
      authType: 'openai',
      baseUrl: 'http://127.0.0.1:19999/v1',
    });
    expect(status).toBe(400);
  });
});

describe('GET /api/browse', () => {
  it('lists dirs and files for a valid path', async () => {
    const enc = encodeURIComponent(process.cwd());
    const { status, body } = await get(`${BASE}/api/browse?path=${enc}`);
    expect(status).toBe(200);
    const json = JSON.parse(body);
    expect(Array.isArray(json.dirs)).toBe(true);
    expect(Array.isArray(json.files)).toBe(true);
  });

  it('returns 400 for non-existent path', async () => {
    const { status } = await get(
      `${BASE}/api/browse?path=${encodeURIComponent('/this/__does_not_exist__')}`,
    );
    expect(status).toBe(400);
  });
});

describe('GET /api/read-file', () => {
  it('returns 400 when path param is missing', async () => {
    const { status } = await get(`${BASE}/api/read-file`);
    expect(status).toBe(400);
  });
});

describe('EADDRINUSE — auto port fallback', () => {
  // Windows SO_REUSEADDR semantics allow two in-process servers to share a port,
  // so EADDRINUSE is never raised. The feature works correctly on Linux/macOS.
  it.skipIf(process.platform === 'win32')(
    'binds to a different port when preferred is occupied',
    async () => {
      const { createServer } = await import(
        '../../packages/cli/src/web/WebServer.js'
      );

      // Occupy a port by binding a server to it ourselves
      const blocker = net.createServer();
      const occupiedPort = await new Promise((resolve) => {
        blocker.listen(0, '127.0.0.1', () => {
          resolve(blocker.address().port);
        });
      });

      let fallbackServer;
      try {
        const result = await createServer(occupiedPort);
        fallbackServer = result.server;

        // Must have chosen a different port
        expect(result.port).not.toBe(occupiedPort);

        // And that port must actually serve requests
        const { status } = await get(
          `http://127.0.0.1:${result.port}/api/health`,
        );
        expect(status).toBe(200);
      } finally {
        if (fallbackServer) await closeServer(fallbackServer);
        await closeServer(blocker);
      }
    },
  );
});

describe('Static files', () => {
  it('returns 200 for /', async () => {
    const { status } = await get(`${BASE}/`);
    expect(status).toBe(200);
  });

  it('falls back to index.html for unknown SPA routes', async () => {
    const { status } = await get(`${BASE}/some/deep/spa/route`);
    expect(status).toBe(200);
  });
});

describe('Unknown API route', () => {
  it('returns 404', async () => {
    const { status } = await get(`${BASE}/api/does-not-exist`);
    expect(status).toBe(404);
  });
});
