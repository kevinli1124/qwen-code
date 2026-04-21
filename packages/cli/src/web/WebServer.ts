/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SessionManager } from './SessionManager.js';
import { PersistenceManager } from './PersistenceManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Static files are served from the web-app dist/ relative to this file.
// In the bundled .exe the dist/ is inlined via staticFiles.ts; for dev we use the real path.
function resolveStaticDir(): string {
  // Look relative to packages/cli/src/web/ → ../../../../packages/web-app/dist
  const devPath = path.resolve(__dirname, '../../../../packages/web-app/dist');
  if (fs.existsSync(devPath)) return devPath;
  // Fallback: same directory as the bundle
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

function serveStatic(
  staticDir: string,
  res: http.ServerResponse,
  reqPath: string,
): void {
  // Serve index.html for all non-asset paths (SPA fallback)
  const ext = path.extname(reqPath);
  const filePath = ext
    ? path.join(staticDir, reqPath)
    : path.join(staticDir, 'index.html');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
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

    const cwd = parsed.cwd ?? process.cwd();
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

  sendError(res, 404, 'Not found');
}

export interface WebServerOptions {
  port?: number;
  open?: boolean;
}

export async function startWebServer(
  options: WebServerOptions = {},
): Promise<void> {
  const port = options.port ?? 7788;
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

  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    process.stderr.write(`Qwen Code Web UI running at ${url}\n`);

    if (options.open) {
      // Open browser
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
  });

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
