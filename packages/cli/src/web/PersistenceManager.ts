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

type SessionMeta = Omit<SessionRecord, 'messages'>;

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

function metaPath(id: string): string {
  if (!SESSION_ID_RE.test(id)) {
    throw new Error(`Invalid session id: ${JSON.stringify(id)}`);
  }
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function msgsPath(id: string): string {
  if (!SESSION_ID_RE.test(id)) {
    throw new Error(`Invalid session id: ${JSON.stringify(id)}`);
  }
  return path.join(SESSIONS_DIR, `${id}.jsonl`);
}

function readMessages(id: string): StoredMessage[] {
  const p = msgsPath(id);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  const messages: StoredMessage[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) {
      try {
        messages.push(JSON.parse(trimmed) as StoredMessage);
      } catch {
        // skip corrupt lines
      }
    }
  }
  return messages;
}

export const PersistenceManager = {
  /**
   * True if a persisted session file already exists for this id. Used
   * by SessionManager to decide whether a child re-spawn should pass
   * `--resume <id>` (session has prior history) vs `--session-id <id>`
   * (fresh session, no history yet).
   */
  exists(id: string): boolean {
    return fs.existsSync(metaPath(id));
  },

  saveSession(session: SessionRecord): void {
    ensureDir();
    const { messages, ...meta } = session;
    fs.writeFileSync(
      metaPath(session.id),
      JSON.stringify(meta, null, 2),
      'utf8',
    );

    const p = msgsPath(session.id);
    if (messages.length > 0) {
      fs.writeFileSync(
        p,
        messages.map((m) => JSON.stringify(m)).join('\n') + '\n',
        'utf8',
      );
    } else {
      if (fs.existsSync(p)) fs.writeFileSync(p, '', 'utf8');
    }
  },

  loadSession(id: string): SessionRecord | null {
    const p = metaPath(id);
    if (!fs.existsSync(p)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as SessionMeta & {
        messages?: StoredMessage[];
      };
      const { messages: embeddedMessages, ...meta } = raw;

      const messages = fs.existsSync(msgsPath(id))
        ? readMessages(id)
        : (embeddedMessages ?? []);

      return { ...meta, messages };
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
        const raw = JSON.parse(
          fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'),
        ) as SessionMeta & { messages?: StoredMessage[] };
        const { messages: _messages, ...meta } = raw;
        sessions.push({ ...meta, messages: [] });
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
    const mp = metaPath(id);
    if (fs.existsSync(mp)) fs.unlinkSync(mp);
    const lp = msgsPath(id);
    if (fs.existsSync(lp)) fs.unlinkSync(lp);
  },

  appendMessage(id: string, msg: StoredMessage): void {
    const mp = metaPath(id);
    if (!fs.existsSync(mp)) return;
    try {
      const meta = JSON.parse(fs.readFileSync(mp, 'utf8')) as SessionMeta & {
        messages?: StoredMessage[];
      };
      const { messages: _messages, ...rest } = meta;
      rest.updatedAt = new Date().toISOString();
      fs.writeFileSync(mp, JSON.stringify(rest, null, 2), 'utf8');
    } catch {
      return;
    }
    ensureDir();
    fs.appendFileSync(msgsPath(id), JSON.stringify(msg) + '\n', 'utf8');
  },

  updateStatus(id: string, status: SessionRecord['status']): void {
    const mp = metaPath(id);
    if (!fs.existsSync(mp)) return;
    try {
      const meta = JSON.parse(fs.readFileSync(mp, 'utf8')) as SessionMeta & {
        messages?: StoredMessage[];
      };
      const { messages: _messages, ...rest } = meta;
      rest.status = status;
      rest.updatedAt = new Date().toISOString();
      fs.writeFileSync(mp, JSON.stringify(rest, null, 2), 'utf8');
    } catch {
      // ignore corrupt metadata
    }
  },
};
