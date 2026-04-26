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
import { getLocalizedCommandMetadata } from './commandMetadata.js';

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
      // Pass the API key via header rather than query string so it can't
      // leak into URL logs, HTTP referer, or error messages that echo the
      // request URL. Gemini API accepts both forms.
      url = 'https://generativelanguage.googleapis.com/v1beta/models';
      headers = { 'x-goog-api-key': apiKey };
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

interface SkillMeta {
  name: string;
  description: string;
  category: string;
  scope: 'user' | 'project' | 'bundled';
}

/**
 * Scan the well-known skill directories for SKILL.md files and return
 * {name, description} for each. Tries, in order:
 *   - ~/.qwen/skills/               (user-level)
 *   - <cwd>/.qwen/skills/           (project-level — uses process.cwd())
 *   - <bundle>/bundled/skills/      (bundled with the CLI)
 * The parser extracts `name:` and `description:` from YAML frontmatter
 * without pulling a full YAML dep.
 */
function listSkills(): SkillMeta[] {
  const dirs: Array<{ dir: string; scope: SkillMeta['scope'] }> = [
    { dir: path.join(os.homedir(), '.qwen', 'skills'), scope: 'user' },
    { dir: path.join(process.cwd(), '.qwen', 'skills'), scope: 'project' },
    {
      dir: path.join(__dirname, '..', '..', 'bundled', 'skills'),
      scope: 'bundled',
    },
  ];
  const out: SkillMeta[] = [];
  const seen = new Set<string>();
  for (const { dir, scope } of dirs) {
    if (!fs.existsSync(dir)) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      try {
        const raw = fs.readFileSync(skillPath, 'utf8');
        const front = raw.match(/^---\s*\n([\s\S]*?)\n---/);
        const name =
          (front && front[1]?.match(/^name:\s*(.+)$/m)?.[1]?.trim()) ||
          entry.name;
        const description =
          (front && front[1]?.match(/^description:\s*(.+)$/m)?.[1]?.trim()) ||
          '';
        if (seen.has(name)) continue;
        seen.add(name);
        out.push({
          name,
          description: description.replace(/^['"]|['"]$/g, ''),
          category: 'skill',
          scope,
        });
      } catch {
        // skip unreadable
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Build the strict allowlists for Host and Origin headers. Both must include
// the bound port — the localhost address can be reached as 127.0.0.1, ::1, or
// the bare name "localhost" depending on browser DNS resolution.
function expectedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
}
function expectedOrigins(port: number): string[] {
  return [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];
}

// Verify the request is genuinely same-origin to the SPA we serve.
//
// Defense layers:
//   1. Host header must match the bound port (rejects DNS rebinding — the
//      attacker domain is still in Host even after rebind).
//   2. If Origin is present, it must equal one of expectedOrigins (rejects
//      cross-origin pages and cross-port localhost CSRF — e.g. another local
//      dev server on a different port cannot drive this API).
//   3. State-changing methods (POST/PUT/PATCH/DELETE) must carry Origin —
//      blocks curl-style requests from local processes that omit Origin.
//   4. Simple GETs without Origin must carry `Sec-Fetch-Site: same-origin`
//      or `none` (direct navigation). This blocks `<img src="...">` /
//      `<link>` CSRF from external pages on browsers that omit Origin on
//      simple GETs but always set Sec-Fetch-Site.
function verifySameOrigin(
  req: http.IncomingMessage,
  port: number,
): { ok: true } | { ok: false; reason: string } {
  const host = req.headers.host;
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  const method = (req.method ?? 'GET').toUpperCase();

  if (!host || !expectedHosts(port).includes(host.toLowerCase())) {
    return { ok: false, reason: 'invalid host' };
  }

  if (origin) {
    if (!expectedOrigins(port).includes(origin)) {
      return { ok: false, reason: 'origin mismatch' };
    }
    return { ok: true };
  }

  const stateChanging =
    method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (stateChanging) {
    return { ok: false, reason: 'origin required for state-changing requests' };
  }

  // GET / HEAD without Origin → require browser-set Sec-Fetch-Site proof
  if (fetchSite === 'same-origin' || fetchSite === 'none') {
    return { ok: true };
  }
  return { ok: false, reason: 'request lacks same-origin proof' };
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  search: URLSearchParams,
  port: number,
): Promise<void> {
  const method = req.method?.toUpperCase() ?? 'GET';
  const origin = req.headers.origin;

  const verdict = verifySameOrigin(req, port);
  if (!verdict.ok) {
    sendError(res, 403, verdict.reason);
    return;
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,DELETE,PATCH,OPTIONS',
  );
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

  // GET /api/commands?lang=<code> — static list of built-in slash commands
  // so the web UI can offer autocomplete when the user types '/'. Keeps
  // the web server free of CLI command dependencies. The lang query
  // selects zh-TW / zh / en; other locales fall back to English.
  if (pathname === '/api/commands' && method === 'GET') {
    const lang = search.get('lang');
    sendJson(res, 200, getLocalizedCommandMetadata(lang));
    return;
  }

  // GET /api/skills — list skill packs discoverable under known paths so
  // the web UI can surface them alongside slash commands. Skills are
  // directories containing a SKILL.md with YAML frontmatter (name +
  // description). We scan user-level + project-level + bundled dirs.
  if (pathname === '/api/skills' && method === 'GET') {
    sendJson(res, 200, listSkills());
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
    if (!path.isAbsolute(parsed.cwd)) {
      sendError(res, 400, 'cwd must be an absolute path');
      return;
    }
    try {
      if (!fs.statSync(parsed.cwd).isDirectory()) {
        sendError(res, 400, 'cwd must be a directory');
        return;
      }
    } catch {
      sendError(res, 400, 'cwd does not exist');
      return;
    }

    const cwd = path.resolve(parsed.cwd);
    const title = parsed.title ?? path.basename(cwd);
    const sessionId = randomUUID();

    SessionManager.create(sessionId, cwd, title);
    sendJson(res, 201, { sessionId });
    return;
  }

  // GET /api/sessions/:id?limit=N&before=<ISO timestamp>
  // Returns the latest N messages; pass `before` to page backwards through
  // history. `hasMore` indicates whether older messages exist beyond the
  // returned slice.
  const sessionDetailMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionDetailMatch && method === 'GET') {
    const id = sessionDetailMatch[1]!;
    const session = PersistenceManager.loadSession(id);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }
    const limitParam = search.get('limit');
    const beforeParam = search.get('before');
    const limit = limitParam
      ? Math.max(1, Math.min(500, parseInt(limitParam, 10) || 50))
      : 50;

    let msgs = session.messages;
    if (beforeParam) {
      msgs = msgs.filter((m) => m.timestamp < beforeParam);
    }
    const hasMore = msgs.length > limit;
    const slice = msgs.slice(-limit);

    sendJson(res, 200, {
      ...session,
      messages: slice,
      hasMore,
      total: session.messages.length,
    });
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

  // DELETE /api/sessions/:id/messages — clear the conversation but keep
  // the session record. Wipes persisted messages on disk + interrupts
  // the running child so its in-memory history is dropped. Next /query
  // lazy-respawns a fresh child with no context.
  const clearMsgMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (clearMsgMatch && method === 'DELETE') {
    const id = clearMsgMatch[1]!;
    const existing = PersistenceManager.loadSession(id);
    if (existing) {
      PersistenceManager.saveSession({
        ...existing,
        messages: [],
        status: 'idle',
        updatedAt: new Date().toISOString(),
      });
    }
    SessionManager.interrupt(id);
    sendJson(res, 200, { ok: true });
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

  // POST /api/sessions/:id/approval-mode — swap the child's approval
  // mode mid-session. Body: { mode: 'default' | 'plan' | 'auto-edit' }.
  const approvalMatch = pathname.match(
    /^\/api\/sessions\/([^/]+)\/approval-mode$/,
  );
  if (approvalMatch && method === 'POST') {
    const id = approvalMatch[1]!;
    const body = await readBody(req);
    let parsed: { mode?: string } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      /* empty */
    }
    const mode = parsed.mode ?? 'default';
    const validModes = ['default', 'plan', 'auto-edit', 'yolo'];
    if (!validModes.includes(mode)) {
      sendError(res, 400, `Invalid mode: ${mode}`);
      return;
    }
    const ok = SessionManager.setApprovalMode(id, mode);
    sendJson(res, ok ? 200 : 404, { ok });
    return;
  }

  // POST /api/sessions/:id/revert/:callId — restore the file snapshot
  // captured before the tool ran.
  const revertMatch = pathname.match(
    /^\/api\/sessions\/([^/]+)\/revert\/([^/]+)$/,
  );
  if (revertMatch && method === 'POST') {
    const [, id, callId] = revertMatch;
    const result = SessionManager.revertFile(id!, callId!);
    if (result.ok) {
      sendJson(res, 200, { ok: true });
    } else {
      sendJson(res, 400, { ok: false, reason: result.reason });
    }
    return;
  }

  // POST /api/sessions/:id/permission/:reqId
  const permMatch = pathname.match(
    /^\/api\/sessions\/([^/]+)\/permission\/([^/]+)$/,
  );
  if (permMatch && method === 'POST') {
    const [, id, reqId] = permMatch;
    const body = await readBody(req);
    let parsed: {
      allowed?: boolean;
      outcome?:
        | 'ProceedOnce'
        | 'ProceedAlways'
        | 'ProceedAlwaysProject'
        | 'ProceedAlwaysUser';
    } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      /* empty */
    }

    SessionManager.respondPermission(
      id!,
      reqId!,
      parsed.allowed ?? false,
      undefined,
      parsed.outcome,
    );
    sendJson(res, 200, { ok: true });
    return;
  }

  // POST /api/sessions/:id/plan/:reqId — decision for an
  // exit_plan_mode prompt. Body: { action: 'accept-ask'|'accept-auto'|
  // 'reject', feedback?: string }.
  const planMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/plan\/([^/]+)$/);
  if (planMatch && method === 'POST') {
    const [, id, reqId] = planMatch;
    const body = await readBody(req);
    let parsed: {
      action?: 'accept-ask' | 'accept-auto' | 'reject';
      feedback?: string;
    } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      /* empty */
    }
    const action = parsed.action ?? 'reject';
    if (!['accept-ask', 'accept-auto', 'reject'].includes(action)) {
      sendError(res, 400, `Invalid action: ${action}`);
      return;
    }
    SessionManager.respondPlan(id!, reqId!, action, parsed.feedback);
    sendJson(res, 200, { ok: true });
    return;
  }

  // POST /api/sessions/:id/question/:reqId — submit answers to an
  // ask_user_question prompt. Cancelled: { cancelled: true }; submitted:
  // { answers: { <header>: <value>, ... } }.
  const questionMatch = pathname.match(
    /^\/api\/sessions\/([^/]+)\/question\/([^/]+)$/,
  );
  if (questionMatch && method === 'POST') {
    const [, id, reqId] = questionMatch;
    const body = await readBody(req);
    let parsed: { cancelled?: boolean; answers?: Record<string, string> } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      /* empty */
    }
    const cancelled = parsed.cancelled === true;
    SessionManager.respondPermission(
      id!,
      reqId!,
      !cancelled,
      cancelled ? undefined : { answers: parsed.answers ?? {} },
    );
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
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });
}

/** Creates and starts the HTTP server. Returns server + actual bound port. */
export async function createServer(
  preferredPort: number,
): Promise<{ server: http.Server; port: number }> {
  const staticDir = resolveStaticDir();

  let boundPort = preferredPort;
  const server = http.createServer(async (req, res) => {
    const { pathname, search } = parsePathname(req);

    if (pathname.startsWith('/api/')) {
      try {
        await handleApi(req, res, pathname, search, boundPort);
      } catch (err) {
        sendError(res, 500, String(err));
      }
      return;
    }

    serveStatic(staticDir, res, pathname);
  });

  const port = await tryListen(server, preferredPort);
  boundPort = port;
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
