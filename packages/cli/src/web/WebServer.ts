/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import https from 'node:https';
import { type RequestOptions } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SessionManager } from './SessionManager.js';
import { PersistenceManager } from './PersistenceManager.js';
import { staticFiles } from './staticFiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USE_EMBEDDED = Object.keys(staticFiles).length > 0;

// Resolve the dev-mode static directory (web-app dist/).
function resolveStaticDir(): string {
  const devPath = path.resolve(__dirname, '../../../../packages/web-app/dist');
  if (fs.existsSync(devPath)) return devPath;
  return path.resolve(__dirname, 'web-dist');
}

function mimeType(ext: string): string {
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.png': 'image/png',
  };
  return map[ext] ?? 'application/octet-stream';
}

const QWEN_SETTINGS_PATH = path.join(os.homedir(), '.qwen', 'settings.json');

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(QWEN_SETTINGS_PATH, 'utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

function writeSettings(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(QWEN_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(QWEN_SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function httpGet(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const transport = isHttps ? https : http;
    const opts: RequestOptions = { headers };
    const req = transport.get(url, opts, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error('Request timeout'));
    });
  });
}

async function testConnection(
  authType: string,
  apiKey: string,
  baseUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    let url: string;
    let headers: Record<string, string>;

    if (authType === 'anthropic') {
      url = 'https://api.anthropic.com/v1/models';
      headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
    } else if (authType === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      headers = {};
    } else {
      // openai-compatible (Qwen DashScope, OpenAI, custom)
      const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      url = `${base}/models`;
      headers = { Authorization: `Bearer ${apiKey}` };
    }

    const { status } = await httpGet(url, headers);
    if (status === 200 || status === 204) {
      return { ok: true };
    }
    return { ok: false, error: `HTTP ${status}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  data: unknown,
): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(
  res: http.ServerResponse,
  status: number,
  message: string,
): void {
  sendJson(res, status, { error: message });
}

function parsePathname(req: http.IncomingMessage): {
  pathname: string;
  search: URLSearchParams;
} {
  const base = `http://localhost`;
  const url = new URL(req.url ?? '/', base);
  return { pathname: url.pathname, search: url.searchParams };
}

function serveEmbedded(res: http.ServerResponse, reqPath: string): void {
  const lookup = staticFiles[reqPath] ?? staticFiles['/index.html'];
  if (!lookup) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const data = Buffer.from(lookup.data, 'base64');
  res.writeHead(200, {
    'Content-Type': lookup.mime,
    'Content-Length': data.length,
  });
  res.end(data);
}

function serveStatic(
  staticDir: string,
  res: http.ServerResponse,
  reqPath: string,
): void {
  if (USE_EMBEDDED) {
    serveEmbedded(res, reqPath);
    return;
  }

  // Dev mode: serve from disk (web-app dist/)
  const ext = path.extname(reqPath);
  const filePath = ext
    ? path.join(staticDir, reqPath)
    : path.join(staticDir, 'index.html');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const indexPath = path.join(staticDir, 'index.html');
      fs.readFile(indexPath, (err2, indexData) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType(path.extname(filePath)) });
    res.end(data);
  });
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  search: URLSearchParams,
): Promise<void> {
  const method = req.method?.toUpperCase() ?? 'GET';

  // CORS for dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /api/health
  if (pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  // GET /api/sessions
  if (pathname === '/api/sessions' && method === 'GET') {
    const sessions = PersistenceManager.listSessions().map(
      ({ id, title, cwd, status, createdAt, updatedAt }) => ({
        id,
        title,
        cwd,
        status,
        createdAt,
        updatedAt,
      }),
    );
    sendJson(res, 200, sessions);
    return;
  }

  // POST /api/sessions
  if (pathname === '/api/sessions' && method === 'POST') {
    const body = await readBody(req);
    let parsed: { cwd?: string; title?: string } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      /* empty */
    }

    if (!parsed.cwd) {
      sendError(res, 400, 'cwd required');
      return;
    }

    const cwd = parsed.cwd;
    const title = parsed.title ?? path.basename(cwd);
    const sessionId = randomUUID();

    SessionManager.create(sessionId, cwd, title);
    sendJson(res, 201, { sessionId });
    return;
  }

  // GET /api/sessions/:id
  const sessionDetailMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionDetailMatch && method === 'GET') {
    const id = sessionDetailMatch[1]!;
    const session = PersistenceManager.loadSession(id);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }
    sendJson(res, 200, session);
    return;
  }

  // DELETE /api/sessions/:id
  if (sessionDetailMatch && method === 'DELETE') {
    const id = sessionDetailMatch[1]!;
    PersistenceManager.deleteSession(id);
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /api/sessions/:id/query
  const queryMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/query$/);
  if (queryMatch && method === 'POST') {
    const id = queryMatch[1]!;
    const body = await readBody(req);
    let parsed: { message?: string } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      /* empty */
    }

    if (!parsed.message) {
      sendError(res, 400, 'message required');
      return;
    }

    // Lazily start the session process if it was persisted but not active
    if (!SessionManager.isActive(id)) {
      const stored = PersistenceManager.loadSession(id);
      if (!stored) {
        sendError(res, 404, 'Session not found');
        return;
      }
      SessionManager.create(id, stored.cwd, stored.title);
    }

    SessionManager.sendQuery(id, parsed.message);
    sendJson(res, 202, { ok: true });
    return;
  }

  // POST /api/sessions/:id/interrupt
  const interruptMatch = pathname.match(
    /^\/api\/sessions\/([^/]+)\/interrupt$/,
  );
  if (interruptMatch && method === 'POST') {
    const id = interruptMatch[1]!;
    SessionManager.interrupt(id);
    sendJson(res, 200, { ok: true });
    return;
  }

  // POST /api/sessions/:id/permission/:reqId
  const permMatch = pathname.match(
    /^\/api\/sessions\/([^/]+)\/permission\/([^/]+)$/,
  );
  if (permMatch && method === 'POST') {
    const [, id, reqId] = permMatch;
    const body = await readBody(req);
    let parsed: { allowed?: boolean } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      /* empty */
    }

    SessionManager.respondPermission(id!, reqId!, parsed.allowed ?? false);
    sendJson(res, 200, { ok: true });
    return;
  }

  // GET /api/stream/:id  (SSE)
  const streamMatch = pathname.match(/^\/api\/stream\/([^/]+)$/);
  if (streamMatch && method === 'GET') {
    const id = streamMatch[1]!;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Keep-alive ping every 20 s
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(ping);
      }
    }, 20_000);

    const client = { res, sessionId: id };
    SessionManager.addSseClient(client);

    req.on('close', () => {
      clearInterval(ping);
      SessionManager.removeSseClient(client);
    });

    return;
  }

  // GET /api/browse?path=...
  if (pathname === '/api/browse' && method === 'GET') {
    const dirPath = search.get('path') ?? os.homedir();
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort();
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .sort();
      sendJson(res, 200, { path: dirPath, dirs, files });
    } catch (err) {
      sendError(res, 400, String(err));
    }
    return;
  }

  // GET /api/read-file?path=...
  if (pathname === '/api/read-file' && method === 'GET') {
    const filePath = search.get('path');
    if (!filePath) {
      sendError(res, 400, 'path required');
      return;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      sendJson(res, 200, { content, size: Buffer.byteLength(content, 'utf8') });
    } catch (err) {
      sendError(res, 400, String(err));
    }
    return;
  }

  // GET /api/settings
  if (pathname === '/api/settings' && method === 'GET') {
    const raw = readSettings();
    const security = (raw['security'] as Record<string, unknown>) ?? {};
    const auth = (security['auth'] as Record<string, unknown>) ?? {};
    const model = (raw['model'] as Record<string, unknown>) ?? {};
    const general = (raw['general'] as Record<string, unknown>) ?? {};
    const tools = (raw['tools'] as Record<string, unknown>) ?? {};
    sendJson(res, 200, {
      security: {
        auth: {
          selectedType: auth['selectedType'] ?? 'openai',
          apiKey: auth['apiKey'] ?? '',
          baseUrl: auth['baseUrl'] ?? '',
        },
      },
      model: { name: model['name'] ?? '' },
      general: {
        agentName: general['agentName'] ?? '',
        language: general['language'] ?? 'auto',
        outputLanguage: general['outputLanguage'] ?? 'auto',
        setupCompleted: general['setupCompleted'] ?? false,
      },
      tools: { approvalMode: tools['approvalMode'] ?? 'default' },
    });
    return;
  }

  // PATCH /api/settings
  if (pathname === '/api/settings' && method === 'PATCH') {
    const body = await readBody(req);
    let patch: Record<string, unknown> = {};
    try {
      patch = JSON.parse(body) as Record<string, unknown>;
    } catch {
      /* empty */
    }
    const merged = deepMerge(readSettings(), patch);
    writeSettings(merged);
    sendJson(res, 200, { ok: true });
    return;
  }

  // POST /api/settings/test
  if (pathname === '/api/settings/test' && method === 'POST') {
    const body = await readBody(req);
    let config: { apiKey?: string; baseUrl?: string; authType?: string } = {};
    try {
      config = JSON.parse(body) as typeof config;
    } catch {
      /* empty */
    }
    if (!config.apiKey) {
      sendError(res, 400, 'apiKey required');
      return;
    }
    const result = await testConnection(
      config.authType ?? 'openai',
      config.apiKey,
      config.baseUrl ?? '',
    );
    sendJson(res, 200, result);
    return;
  }

  sendError(res, 404, 'Not found');
}

export interface WebServerOptions {
  port?: number;
  open?: boolean;
}

function tryListen(
  server: http.Server,
  port: number,
  maxRetries = 10,
): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && maxRetries > 0) {
        server.removeAllListeners('error');
        tryListen(server, port + 1, maxRetries - 1).then(resolve, reject);
      } else {
        reject(err);
      }
    });
    server.listen(port, '127.0.0.1', () => resolve(port));
  });
}

/** Creates and starts the HTTP server. Returns server + actual bound port. */
export async function createServer(
  preferredPort: number,
): Promise<{ server: http.Server; port: number }> {
  const staticDir = resolveStaticDir();

  const server = http.createServer(async (req, res) => {
    const { pathname, search } = parsePathname(req);

    if (pathname.startsWith('/api/')) {
      try {
        await handleApi(req, res, pathname, search);
      } catch (err) {
        sendError(res, 500, String(err));
      }
      return;
    }

    serveStatic(staticDir, res, pathname);
  });

  const port = await tryListen(server, preferredPort);
  return { server, port };
}

export async function startWebServer(
  options: WebServerOptions = {},
): Promise<void> {
  const preferredPort = options.port ?? 7788;

  const { server, port } = await createServer(preferredPort);
  const url = `http://localhost:${port}`;

  if (port !== preferredPort) {
    process.stderr.write(
      `[web] Port ${preferredPort} in use, using ${port} instead\n`,
    );
  }

  process.stderr.write(`Qwen Code Web UI running at ${url}\n`);

  if (options.open) {
    const opener =
      process.platform === 'win32'
        ? 'start'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open';
    import('node:child_process')
      .then(({ exec }) => exec(`${opener} ${url}`))
      .catch(() => {
        /* ignore open errors */
      });
  }

  // Keep alive until SIGTERM / SIGINT
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      server.close();
      resolve();
    });
    process.on('SIGTERM', () => {
      server.close();
      resolve();
    });
  });
}
