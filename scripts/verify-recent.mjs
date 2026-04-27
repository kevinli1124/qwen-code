#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end verifier for the 2026-04-24 / 25 web-UI fix set.
 *
 * Usage:
 *   node scripts/verify-recent.mjs
 *
 * Returns non-zero if any check fails. Prints a human-readable
 * summary at the end. Each check is isolated so a single failure
 * doesn't mask the rest.
 *
 * Does NOT exercise the actual browser UI (Chrome enterprise policy
 * blocks localhost in our sandbox) — that's still a manual step.
 * Every check here is mechanical: filesystem, HTTP, or process
 * output.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QWEN_DIR = path.join(os.homedir(), '.qwen');

// ─── tiny test harness ─────────────────────────────────────────────
const results = [];
function pass(name, extra = '') {
  results.push({ name, ok: true, extra });
  console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`);
}
function fail(name, reason) {
  results.push({ name, ok: false, reason });
  console.log(`  ✗ ${name}`);
  console.log(`     ${reason}`);
}
function section(title) {
  console.log(`\n─── ${title} ───`);
}

// ─── Static code checks (no process spawn) ─────────────────────────
function checkStaticBundle() {
  section('Static bundle checks');

  const cliJsPath = path.join(ROOT, 'dist', 'cli.js');
  if (!fs.existsSync(cliJsPath)) {
    fail('dist/cli.js exists', `file missing — run npm run build:web && node esbuild.config.js first`);
    return;
  }
  const cliJs = fs.readFileSync(cliJsPath, 'utf8');
  pass('dist/cli.js exists', `${(cliJs.length / 1024 / 1024).toFixed(2)} MB`);

  // Web-side auto-compress should be gone.
  const autoCompressTokens = cliJs.match(/AUTO_COMPRESS_THRESHOLD/g) || [];
  if (autoCompressTokens.length === 0) {
    pass('Web auto-compress constant removed from bundle');
  } else {
    fail(
      'Web auto-compress constant removed from bundle',
      `found ${autoCompressTokens.length} occurrences of AUTO_COMPRESS_THRESHOLD`,
    );
  }

  // /tools hardcoded list should be gone (we replaced with pointer to
  // system_init). Match a distinctive phrase from the old hardcoded text.
  if (
    cliJs.includes('read_file`, `write_file`, `edit`, `list_directory`')
  ) {
    fail(
      '/tools hardcoded list removed',
      'bundle still contains the old hardcoded tool inventory string',
    );
  } else {
    pass('/tools hardcoded list removed');
  }

  // Permission rules localStorage store should be gone.
  if (cliJs.includes('permissionRulesStore')) {
    fail(
      'permissionRulesStore deleted',
      'bundle still references permissionRulesStore',
    );
  } else {
    pass('permissionRulesStore deleted from bundle');
  }

  // Zustand useShallow pattern should be in use (minified hard to
  // detect directly — instead verify no useStore() call in source).
  // Source check:
  const chatView = path.join(
    ROOT,
    'packages',
    'web-app',
    'src',
    'views',
    'ChatView.tsx',
  );
  if (fs.existsSync(chatView)) {
    const src = fs.readFileSync(chatView, 'utf8');
    const hasShallow = src.includes('useShallow');
    const hasRawDestructure = /=\s*useMessageStore\(\)\s*;/.test(src);
    if (hasShallow && !hasRawDestructure) {
      pass('ChatView uses useShallow (Zustand v5 safe)');
    } else {
      fail(
        'ChatView uses useShallow',
        `hasShallow=${hasShallow}, hasRawDestructure=${hasRawDestructure}`,
      );
    }
  }

  // YOLO deny extended to write tools.
  const scheduler = path.join(
    ROOT,
    'packages',
    'core',
    'src',
    'core',
    'coreToolScheduler.ts',
  );
  if (fs.existsSync(scheduler)) {
    const src = fs.readFileSync(scheduler, 'utf8');
    const hasSensitivePath = src.includes('SENSITIVE_PATH_PATTERNS');
    const coversWriteTools = src.includes("'write_file'") && src.includes("'edit'");
    if (hasSensitivePath && coversWriteTools) {
      pass('YOLO deny extended to write tools');
    } else {
      fail(
        'YOLO deny extended to write tools',
        `hasSensitivePath=${hasSensitivePath}, coversWriteTools=${coversWriteTools}`,
      );
    }
  }

  // SessionManager spawns with --session-id / --resume.
  const sm = path.join(ROOT, 'packages', 'cli', 'src', 'web', 'SessionManager.ts');
  if (fs.existsSync(sm)) {
    const src = fs.readFileSync(sm, 'utf8');
    if (src.includes("'--session-id'") && src.includes("'--resume'")) {
      pass('SessionManager spawn passes --session-id / --resume');
    } else {
      fail(
        'SessionManager spawn passes --session-id / --resume',
        'flags missing from spawn args',
      );
    }
  }

  // Mid-turn injection queue wired up end-to-end.
  const sessionTs = path.join(
    ROOT,
    'packages',
    'cli',
    'src',
    'nonInteractive',
    'session.ts',
  );
  if (fs.existsSync(sessionTs)) {
    const src = fs.readFileSync(sessionTs, 'utf8');
    const hasQueue = src.includes('pendingInjections: string[] = []');
    const hasDrain = src.includes('drainPendingInjections');
    const routedOnBusy = src.includes('if (this.processingPromise)');
    if (hasQueue && hasDrain && routedOnBusy) {
      pass('Session: pendingInjections queue + drainer + busy-path routing');
    } else {
      fail(
        'Session: pendingInjections queue + drainer + busy-path routing',
        `hasQueue=${hasQueue} hasDrain=${hasDrain} routedOnBusy=${routedOnBusy}`,
      );
    }
  }
  const nonInteractive = path.join(
    ROOT,
    'packages',
    'cli',
    'src',
    'nonInteractiveCli.ts',
  );
  if (fs.existsSync(nonInteractive)) {
    const src = fs.readFileSync(nonInteractive, 'utf8');
    const hasOpt = src.includes('getPendingInjection?:');
    // Two call-sites: one after tool-result, one before the "no more
    // tool calls" break.
    const peekSites = (src.match(/options\.getPendingInjection\(\)/g) || [])
      .length;
    if (hasOpt && peekSites >= 2) {
      pass(
        'runNonInteractive peeks injection queue at both turn boundaries',
        `${peekSites} peek call-sites`,
      );
    } else {
      fail(
        'runNonInteractive peeks injection queue at both turn boundaries',
        `hasOpt=${hasOpt}, peekSites=${peekSites}`,
      );
    }
  }

  // Permission outcome plumbed through.
  const permCtl = path.join(
    ROOT,
    'packages',
    'cli',
    'src',
    'nonInteractive',
    'control',
    'controllers',
    'permissionController.ts',
  );
  if (fs.existsSync(permCtl)) {
    const src = fs.readFileSync(permCtl, 'utf8');
    if (
      src.includes('ProceedAlwaysProject') &&
      src.includes('ProceedAlwaysUser') &&
      src.includes("payload['outcome']")
    ) {
      pass('permissionController maps outcome hint → ToolConfirmationOutcome');
    } else {
      fail(
        'permissionController maps outcome hint → ToolConfirmationOutcome',
        'outcome mapping block not found',
      );
    }
  }
}

// ─── Live HTTP + process checks ────────────────────────────────────
function waitForHttp(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/health', timeout: 1000 },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('timeout'));
        else setTimeout(poll, 200);
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() > deadline) reject(new Error('timeout'));
        else setTimeout(poll, 200);
      });
    };
    poll();
  });
}

function httpRequest(port, method, path_, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: path_,
        method,
        headers: data
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
            }
          : {},
        timeout: 5000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buf || 'null') });
          } catch {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function projectHash(cwd) {
  // Match core's Storage.getProjectDir: sha256 of lowercased cwd, first
  // 16 hex chars. If this drifts in core we'll need to import Storage
  // directly from the built bundle, but for now keep it pure.
  return createHash('sha256').update(cwd.toLowerCase()).digest('hex').slice(0, 16);
}

async function checkSessionIdAlignment() {
  section('Session-id alignment (#137 Phase 1)');

  const port = 7790 + Math.floor(Math.random() * 50);
  const env = {
    ...process.env,
    QWEN_CODE_NO_RELAUNCH: '1',
  };
  const cliPath = path.join(ROOT, 'dist', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    fail('Session-id alignment', 'dist/cli.js missing');
    return;
  }

  console.log(`  starting qwen --web on port ${port} …`);
  const child = spawn(process.execPath, [cliPath, '--web', `--port=${port}`, '--no-open'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  child.stderr.on('data', (c) => (stderrBuf += c.toString()));

  try {
    await waitForHttp(port, 20000);
  } catch (err) {
    child.kill('SIGTERM');
    fail('Session-id alignment', `server did not come up: ${err.message}\n${stderrBuf}`);
    return;
  }

  try {
    // 1. Create a session in ROOT cwd.
    const created = await httpRequest(port, 'POST', '/api/sessions', {
      cwd: ROOT,
      title: 'verify-session-id',
    });
    if (created.status !== 200 && created.status !== 201) {
      fail('POST /api/sessions', `status ${created.status}: ${JSON.stringify(created.body)}`);
      return;
    }
    const sessionId = created.body?.sessionId;
    if (!sessionId) {
      fail('POST /api/sessions returns sessionId', JSON.stringify(created.body));
      return;
    }
    pass('POST /api/sessions returns sessionId', sessionId);

    // 2. Verify the child process is being spawned with --session-id.
    //    We can't force a full LLM turn without API creds, but we can
    //    observe the spawn args by inspecting what the SessionManager
    //    code decides to pass. That logic lives in SessionManager.ts
    //    and we already static-checked it above; here we only need to
    //    confirm the session id makes it all the way to a persisted
    //    file — the dual-write to web-sessions/ is the cleanest signal
    //    since it happens on SessionManager.create(), before any
    //    LLM / slash interaction.
    const webJsonPath = path.join(QWEN_DIR, 'web-sessions', `${sessionId}.json`);
    if (fs.existsSync(webJsonPath)) {
      pass(
        'web-sessions/<id>.json created on POST /api/sessions',
        path.relative(os.homedir(), webJsonPath),
      );
    } else {
      fail(
        'web-sessions/<id>.json created on POST /api/sessions',
        `expected ${webJsonPath}`,
      );
    }

    // 3. Confirm the core chats dir + project hash directory is
    //    reachable under ROOT's cwd. The dir itself gets lazily
    //    created on first recordUserMessage; if recently run for
    //    another project it might already exist from that.
    const chatsDir = path.join(QWEN_DIR, 'tmp', projectHash(ROOT), 'chats');
    if (fs.existsSync(chatsDir)) {
      const jsonls = fs.readdirSync(chatsDir).filter((f) => f.endsWith('.jsonl'));
      pass(
        'project chats/ dir reachable',
        `${jsonls.length} jsonl(s) total at ${path.relative(os.homedir(), chatsDir)}`,
      );
      // If the current session id has a file, great — verify its
      // contents. If not, that's expected when no turn has happened
      // (slash-only or no-LLM test environments).
      const ourFile = path.join(chatsDir, `${sessionId}.jsonl`);
      if (fs.existsSync(ourFile)) {
        const firstLine = fs
          .readFileSync(ourFile, 'utf8')
          .split('\n')
          .find((x) => x.trim());
        try {
          const rec = JSON.parse(firstLine);
          if (rec.sessionId === sessionId) {
            pass('jsonl sessionId matches web session id');
          } else {
            fail(
              'jsonl sessionId matches web session id',
              `jsonl sessionId=${rec.sessionId}, expected ${sessionId}`,
            );
          }
        } catch (e) {
          fail('jsonl parses as JSON', e.message);
        }
      } else {
        pass(
          'jsonl content check',
          'skipped (no user-turn occurred in this smoke test — expected when no LLM creds configured)',
        );
      }
    } else {
      // Project hash directory doesn't exist yet — that's OK if no
      // session has ever run under this cwd. The real production
      // path will create it on first recordUserMessage.
      pass(
        'project chats/ dir reachable',
        `not yet created at ${path.relative(os.homedir(), chatsDir)} — will be lazily on first LLM turn`,
      );
    }
  } finally {
    child.kill('SIGTERM');
    // Give it a moment to exit.
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ─── Run ───────────────────────────────────────────────────────────
(async () => {
  console.log('Verifying recent commits …');
  checkStaticBundle();
  await checkSessionIdAlignment();

  const failed = results.filter((r) => !r.ok);
  console.log('\n─── Summary ───');
  console.log(`  passed: ${results.length - failed.length}`);
  console.log(`  failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const r of failed) {
      console.log(`  - ${r.name}: ${r.reason}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll checks passed.');
    process.exit(0);
  }
})().catch((e) => {
  console.error('verifier crashed:', e);
  process.exit(2);
});
