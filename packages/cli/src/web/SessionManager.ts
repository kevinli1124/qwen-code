/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { PersistenceManager } from './PersistenceManager.js';

export interface SseClient {
  res: ServerResponse;
  sessionId: string;
}

interface PendingPermission {
  requestId: string;
  toolName: string;
  toolUseId: string;
  input: unknown;
}

interface ActiveSession {
  id: string;
  cwd: string;
  child: ChildProcess;
  sseClients: Set<SseClient>;
  pendingPermissions: Map<string, PendingPermission>;
  // Track streaming state for tool call reconstruction
  activeToolUseBlocks: Map<
    number,
    { id: string; name: string; started: number }
  >;
  streamingUuid: string | null;
  textChunks: string[];
}

const sessions = new Map<string, ActiveSession>();

function sendSse(client: SseClient, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // client disconnected
  }
}

function broadcast(session: ActiveSession, event: string, data: unknown): void {
  for (const client of session.sseClients) {
    sendSse(client, event, data);
  }
}

function translateAndBroadcast(session: ActiveSession, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const msg = raw as Record<string, unknown>;

  switch (msg['type']) {
    case 'stream_event': {
      const event = msg['event'] as Record<string, unknown>;
      if (!event) break;
      const uuid =
        (msg['uuid'] as string) ?? session.streamingUuid ?? randomUUID();
      session.streamingUuid = uuid;

      if (event['type'] === 'content_block_start') {
        const block = event['content_block'] as Record<string, unknown>;
        const idx = event['index'] as number;
        if (block?.['type'] === 'tool_use') {
          const toolId = block['id'] as string;
          const toolName = block['name'] as string;
          session.activeToolUseBlocks.set(idx, {
            id: toolId,
            name: toolName,
            started: Date.now(),
          });
          broadcast(session, 'message', {
            type: 'tool_start',
            callId: toolId,
            toolName,
            args: block['input'] ?? {},
          });
        } else if (block?.['type'] === 'thinking') {
          // thinking block start — we'll collect via delta
        }
      } else if (event['type'] === 'content_block_delta') {
        const delta = event['delta'] as Record<string, unknown>;
        if (delta?.['type'] === 'text_delta') {
          broadcast(session, 'message', {
            type: 'stream_text',
            uuid,
            delta: delta['text'] as string,
          });
        } else if (delta?.['type'] === 'thinking_delta') {
          broadcast(session, 'message', {
            type: 'stream_text',
            uuid: `thinking-${uuid}`,
            delta: delta['thinking'] as string,
          });
        }
      } else if (event['type'] === 'content_block_stop') {
        const idx = event['index'] as number;
        const tool = session.activeToolUseBlocks.get(idx);
        if (tool) {
          broadcast(session, 'message', {
            type: 'tool_complete',
            callId: tool.id,
            toolName: tool.name,
            success: true,
            durationMs: Date.now() - tool.started,
          });
          session.activeToolUseBlocks.delete(idx);
        }
      } else if (event['type'] === 'tool_progress') {
        const content = event['content'] as Record<string, unknown>;
        if (content?.['type'] === 'output_chunk') {
          broadcast(session, 'message', {
            type: 'tool_output_chunk',
            chunk: content['chunk'],
          });
        }
      }
      break;
    }

    case 'assistant': {
      // Finalize the streaming text as a proper assistant message
      const uuid = (msg['uuid'] as string) ?? randomUUID();
      session.streamingUuid = null;
      broadcast(session, 'message', { type: 'assistant', uuid });
      PersistenceManager.appendMessage(session.id, {
        type: 'assistant',
        timestamp: new Date().toISOString(),
        data: msg,
      });
      break;
    }

    case 'result': {
      const isError = (msg['is_error'] as boolean) ?? false;
      const usage = msg['usage'] as Record<string, unknown> | undefined;
      broadcast(session, 'message', {
        type: 'result',
        success: !isError,
        usage: usage
          ? {
              input_tokens: usage['input_tokens'],
              output_tokens: usage['output_tokens'],
            }
          : undefined,
      });
      PersistenceManager.updateStatus(
        session.id,
        isError ? 'error' : 'completed',
      );
      break;
    }

    case 'control_request': {
      const req = msg['request'] as Record<string, unknown>;
      if (req?.['subtype'] === 'can_use_tool') {
        const requestId = msg['request_id'] as string;
        const perm: PendingPermission = {
          requestId,
          toolName: req['tool_name'] as string,
          toolUseId: req['tool_use_id'] as string,
          input: req['input'],
        };
        session.pendingPermissions.set(requestId, perm);
        broadcast(session, 'message', {
          type: 'permission_request',
          request: {
            requestId,
            toolName: perm.toolName,
            toolUseId: perm.toolUseId,
            input: perm.input,
          },
        });
      }
      break;
    }

    case 'system': {
      // Broadcast system init to let clients know the session is ready
      if (msg['subtype'] === 'init') {
        broadcast(session, 'message', { type: 'system_init', data: msg });
      }
      break;
    }

    default:
      break;
  }
}

export const SessionManager = {
  create(id: string, cwd: string, title: string): void {
    // Spawn CLI in stream-json mode. In a Node SEA build (qwen.exe),
    // process.argv[1] is the first user-facing flag (e.g. "--web") rather
    // than a script path, so we must re-invoke the exe itself with only
    // stream-json flags. In plain Node we still spawn `node dist/cli.js`.
    const nodeExe = process.argv[0];
    const cliScript = process.argv[1];
    const isSea = typeof cliScript === 'string' && cliScript.startsWith('--');

    // yargs enforces that stream-json input pairs with stream-json output.
    const streamJsonFlags = [
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--yolo',
    ];
    const spawnArgs = isSea ? streamJsonFlags : [cliScript, ...streamJsonFlags];

    const child = spawn(nodeExe, spawnArgs, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, QWEN_CODE_NO_RELAUNCH: '1' },
    });

    const session: ActiveSession = {
      id,
      cwd,
      child,
      sseClients: new Set(),
      pendingPermissions: new Map(),
      activeToolUseBlocks: new Map(),
      streamingUuid: null,
      textChunks: [],
    };

    sessions.set(id, session);

    // Save initial record
    PersistenceManager.saveSession({
      id,
      title,
      cwd,
      status: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    });

    // Process stdout line by line
    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          translateAndBroadcast(session, parsed);
        } catch {
          // non-JSON stdout (e.g. logs)
        }
      });
    }

    // Forward stderr to server stderr for debugging
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
      });
    }

    child.on('close', (code) => {
      if (code !== 0) {
        broadcast(session, 'message', {
          type: 'error',
          message: `CLI process exited with code ${code}`,
        });
      }
      sessions.delete(id);
    });
  },

  sendQuery(id: string, text: string): boolean {
    const session = sessions.get(id);
    if (!session?.child?.stdin) return false;

    const msg = {
      type: 'user',
      session_id: id,
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    };

    PersistenceManager.appendMessage(id, {
      type: 'user',
      timestamp: new Date().toISOString(),
      data: msg,
    });
    PersistenceManager.updateStatus(id, 'running');

    session.child.stdin.write(`${JSON.stringify(msg)}\n`);
    return true;
  },

  respondPermission(id: string, requestId: string, allowed: boolean): boolean {
    const session = sessions.get(id);
    if (!session?.child?.stdin) return false;

    session.pendingPermissions.delete(requestId);

    const response = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: { allowed },
      },
    };
    session.child.stdin.write(`${JSON.stringify(response)}\n`);
    return true;
  },

  interrupt(id: string): boolean {
    const session = sessions.get(id);
    if (!session?.child?.stdin) return false;

    const cancel = { type: 'control_cancel_request' };
    session.child.stdin.write(`${JSON.stringify(cancel)}\n`);
    return true;
  },

  addSseClient(client: SseClient): void {
    const session = sessions.get(client.sessionId);
    if (session) session.sseClients.add(client);
  },

  removeSseClient(client: SseClient): void {
    const session = sessions.get(client.sessionId);
    if (session) session.sseClients.delete(client);
  },

  isActive(id: string): boolean {
    return sessions.has(id);
  },
};
