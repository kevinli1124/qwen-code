/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface StoredMessage {
  type: string;
  timestamp: string;
  data: unknown;
}

export interface SessionRecord {
  id: string;
  title: string;
  cwd: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

const SESSIONS_DIR = path.join(os.homedir(), '.qwen', 'web-sessions');

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// Session IDs are random UUIDs generated server-side; reject anything that
// doesn't look like an alphanumeric slug so path.join can't be used to
// traverse outside SESSIONS_DIR via ids like `../../etc/passwd`.
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

function sessionPath(id: string): string {
  if (!SESSION_ID_RE.test(id)) {
    throw new Error(`Invalid session id: ${JSON.stringify(id)}`);
  }
  return path.join(SESSIONS_DIR, `${id}.json`);
}

export const PersistenceManager = {
  /**
   * True if a persisted session file already exists for this id. Used
   * by SessionManager to decide whether a child re-spawn should pass
   * `--resume <id>` (session has prior history) vs `--session-id <id>`
   * (fresh session, no history yet).
   */
  exists(id: string): boolean {
    return fs.existsSync(sessionPath(id));
  },

  saveSession(session: SessionRecord): void {
    ensureDir();
    fs.writeFileSync(
      sessionPath(session.id),
      JSON.stringify(session, null, 2),
      'utf8',
    );
  },

  loadSession(id: string): SessionRecord | null {
    const p = sessionPath(id);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as SessionRecord;
    } catch {
      return null;
    }
  },

  listSessions(): SessionRecord[] {
    ensureDir();
    const files = fs
      .readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.json'));
    const sessions: SessionRecord[] = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8');
        sessions.push(JSON.parse(raw) as SessionRecord);
      } catch {
        // skip corrupt files
      }
    }
    return sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },

  deleteSession(id: string): void {
    const p = sessionPath(id);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  },

  appendMessage(id: string, msg: StoredMessage): void {
    const session = PersistenceManager.loadSession(id);
    if (!session) return;
    session.messages.push(msg);
    session.updatedAt = new Date().toISOString();
    PersistenceManager.saveSession(session);
  },

  updateStatus(id: string, status: SessionRecord['status']): void {
    const session = PersistenceManager.loadSession(id);
    if (!session) return;
    session.status = status;
    session.updatedAt = new Date().toISOString();
    PersistenceManager.saveSession(session);
  },
};
