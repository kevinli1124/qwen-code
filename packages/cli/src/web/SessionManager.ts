/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import { tokenLimit } from '@qwen-code/qwen-code-core';
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

// Snapshot of a file taken BEFORE a destructive tool (write_file / edit)
// runs, keyed by the tool's call id. Exists so the UI can offer a
// "revert" button once the change is applied.
interface FileSnapshot {
  path: string;
  /** Content before the change. null = file did not exist before. */
  before: string | null;
  toolName: string;
  takenAt: number;
  reverted?: boolean;
}

interface ActiveSession {
  id: string;
  cwd: string;
  child: ChildProcess;
  sseClients: Set<SseClient>;
  pendingPermissions: Map<string, PendingPermission>;
  /** Aggregated tool output chunks keyed by callId, flushed on tool_complete. */
  toolOutputs: Map<string, string[]>;
  // Track streaming state for tool call reconstruction
  activeToolUseBlocks: Map<
    number,
    { id: string; name: string; started: number }
  >;
  streamingUuid: string | null;
  textChunks: string[];
}

/**
 * Read a file for snapshotting. Returns null if the file doesn't exist
 * (e.g. write_file creating a new file) or can't be read for any reason.
 */
function snapshotFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractFilePath(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const rec = input as Record<string, unknown>;
  if (
    toolName === 'write_file' ||
    toolName === 'edit' ||
    toolName === 'replace'
  ) {
    return (
      (rec['file_path'] as string | undefined) ??
      (rec['path'] as string | undefined) ??
      (rec['filePath'] as string | undefined)
    );
  }
  return undefined;
}

const sessions = new Map<string, ActiveSession>();

// File snapshots survive child re-spawns (the child process exits after
// interrupt; snapshots must still be available so the user can revert).
// Keyed by sessionId → Map<toolUseId, FileSnapshot>.
const persistentSnapshots = new Map<string, Map<string, FileSnapshot>>();

// SSE clients that connect BEFORE the session has been lazily created
// (the common case: user clicks an old session in the sidebar → SSE
// connects → later types a prompt → session finally spawned). Without
// this pending queue the frontend would open an EventSource that
// receives nothing, and the UI would silently appear to hang.
const pendingSseClients = new Map<string, Set<SseClient>>();

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
      // The child CLI's stream-json output emits a single `assistant`
      // message per turn carrying the full `message.content[]` (text +
      // thinking blocks), NOT per-token `stream_event` deltas. Synthesize
      // stream_text / thinking events from the content so the frontend's
      // existing handlers (finalizeStreamingText / thinking case) work.
      const uuid = (msg['uuid'] as string) ?? randomUUID();
      const innerMsg = msg['message'] as Record<string, unknown> | undefined;
      const blocks = Array.isArray(innerMsg?.['content'])
        ? (innerMsg!['content'] as Array<Record<string, unknown>>)
        : [];

      let assistantText = '';
      for (const block of blocks) {
        const blockType = block['type'];
        if (blockType === 'text') {
          assistantText += (block['text'] as string) ?? '';
        } else if (blockType === 'thinking') {
          broadcast(session, 'message', {
            type: 'thinking',
            uuid: `thinking-${uuid}`,
            content: (block['thinking'] as string) ?? '',
          });
        }
      }

      if (assistantText.length > 0) {
        // Seed the frontend's streamingText buffer with the full text as a
        // single delta, then the assistant event finalizes it into the
        // persisted message list.
        broadcast(session, 'message', {
          type: 'stream_text',
          uuid,
          delta: assistantText,
        });
      }

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
      const durationMs = (msg['duration_ms'] as number) ?? 0;
      // The child CLI emits snake_case (input_tokens / output_tokens); the
      // frontend TokenUsage type expects camelCase plus durationMs, so the
      // transform happens here. Without it the footer showed NaN.
      broadcast(session, 'message', {
        type: 'result',
        success: !isError,
        usage: usage
          ? {
              inputTokens: (usage['input_tokens'] as number) ?? 0,
              outputTokens: (usage['output_tokens'] as number) ?? 0,
              durationMs,
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
        const toolName = req['tool_name'] as string;
        const toolUseId = req['tool_use_id'] as string;
        const perm: PendingPermission = {
          requestId,
          toolName,
          toolUseId,
          input: req['input'],
        };
        session.pendingPermissions.set(requestId, perm);

        // Snapshot the target file BEFORE asking the user — whether they
        // approve manually or via an auto-allow rule, we want the old
        // content captured so "Revert" works later. Stored in
        // persistentSnapshots so it survives a child re-spawn (e.g. from
        // an interrupt).
        const filePath = extractFilePath(toolName, req['input']);
        const snapshots = persistentSnapshots.get(session.id);
        if (filePath && snapshots && !snapshots.has(toolUseId)) {
          snapshots.set(toolUseId, {
            path: filePath,
            before: snapshotFile(filePath),
            toolName,
            takenAt: Date.now(),
          });
        }

        // ask_user_question piggybacks on the can_use_tool channel but
        // carries a structured questions[] payload that deserves its own
        // UI. Route it to a dedicated event so the frontend renders the
        // AskUserQuestionDialog instead of a generic allow/deny modal.
        if (toolName === 'ask_user_question') {
          const input = (req['input'] ?? {}) as Record<string, unknown>;
          const questions = Array.isArray(input['questions'])
            ? (input['questions'] as Array<Record<string, unknown>>)
            : [];
          broadcast(session, 'message', {
            type: 'question_request',
            request: {
              requestId,
              toolUseId: perm.toolUseId,
              questions,
            },
          });
          break;
        }

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
      // Broadcast system init to let clients know the session is ready.
      // Enrich with the model's known context-window size so the web UI
      // can render a "context usage" indicator without duplicating the
      // model→limit table that already lives in core/tokenLimits.
      if (msg['subtype'] === 'init') {
        const modelName = (msg['model'] as string) ?? '';
        const inputLimit = modelName
          ? tokenLimit(modelName, 'input')
          : undefined;
        const outputLimit = modelName
          ? tokenLimit(modelName, 'output')
          : undefined;
        broadcast(session, 'message', {
          type: 'system_init',
          data: {
            ...msg,
            tokenLimits: {
              input: inputLimit,
              output: outputLimit,
            },
          },
        });
      }
      break;
    }

    case 'agent_spawn': {
      // CLIAgentSpawnMessage from the child CLI (nonInteractiveCli.ts:389):
      // { type:'agent_spawn', subagent_id, parent_agent_id,
      //   parent_tool_call_id, subagent_type, timestamp }
      // Forward as a discoverable SSE event so the UI can render a
      // collapsible card for "spawning <code-reviewer> subagent..."
      broadcast(session, 'message', {
        type: 'agent_spawn',
        subagentId: msg['subagent_id'] as string,
        parentAgentId: msg['parent_agent_id'] as string,
        parentToolCallId: msg['parent_tool_call_id'] as string,
        subagentType: msg['subagent_type'] as string,
      });
      break;
    }

    // Top-level tool events emitted by stream-json mode (see
    // nonInteractiveCli.ts onToolStart / onToolComplete at line ~357 for
    // main agent, and the AgentEventType subscribers at line ~401 for
    // subagents). Both pipelines emit identical shapes — only agent_id
    // differs ('main' vs subagent UUID).
    case 'tool_start': {
      const callId = (msg['call_id'] as string) ?? '';
      const toolName = (msg['tool_name'] as string) ?? '';
      session.activeToolUseBlocks.set(callId.length, {
        id: callId,
        name: toolName,
        started: Date.now(),
      });
      broadcast(session, 'message', {
        type: 'tool_start',
        callId,
        toolName,
        args: (msg['args'] as Record<string, unknown>) ?? {},
        agentId: (msg['agent_id'] as string) ?? 'main',
      });
      break;
    }

    case 'tool_complete': {
      const callId = (msg['call_id'] as string) ?? '';
      const toolName = (msg['tool_name'] as string) ?? '';
      const success = (msg['success'] as boolean) ?? true;

      // Flush accumulated output chunks so the frontend can render them
      // inside the tool-call card when expanded.
      const outputChunks = session.toolOutputs.get(callId) ?? [];
      const output = outputChunks.join('');
      session.toolOutputs.delete(callId);

      broadcast(session, 'message', {
        type: 'tool_complete',
        callId,
        toolName,
        success,
        durationMs: (msg['duration_ms'] as number) ?? 0,
        output: output.length > 0 ? output : undefined,
        ...(msg['error'] ? { error: msg['error'] as string } : {}),
      });

      // For file-modifying tools: on successful completion, emit a
      // dedicated file_modified event carrying the before/after text
      // plus the callId so the UI can surface a "Revert" button. The
      // tool uses call_id equal to the tool_use_id from the permission
      // request, so snapshots keyed by tool_use_id are reachable here.
      const snapshots = persistentSnapshots.get(session.id);
      const snapshot = snapshots?.get(callId);
      if (success && snapshot && !snapshot.reverted) {
        const afterContent = snapshotFile(snapshot.path);
        broadcast(session, 'message', {
          type: 'file_modified',
          callId,
          path: snapshot.path,
          before: snapshot.before,
          after: afterContent,
          toolName: snapshot.toolName,
        });
      }
      break;
    }

    case 'tool_output_chunk': {
      const callId = (msg['call_id'] as string) ?? '';
      const chunk = msg['chunk'];
      if (callId && typeof chunk === 'string') {
        const arr = session.toolOutputs.get(callId) ?? [];
        arr.push(chunk);
        session.toolOutputs.set(callId, arr);
      }
      broadcast(session, 'message', {
        type: 'tool_output_chunk',
        callId,
        chunk,
      });
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
    // NB: --yolo is intentionally NOT set. With YOLO, each tool's
    // getDefaultPermission() returns 'allow' and the child skips the
    // confirmation round-trip entirely, so destructive tools (write_file,
    // edit, run_shell_command) never surface a permission prompt to the
    // web UI. Default approval mode lets the permissionController send
    // can_use_tool requests back to us, which we render as PermissionModal.
    const streamJsonFlags = [
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
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
      toolOutputs: new Map(),
      activeToolUseBlocks: new Map(),
      streamingUuid: null,
      textChunks: [],
    };
    if (!persistentSnapshots.has(id)) persistentSnapshots.set(id, new Map());

    sessions.set(id, session);

    // Activate the child's control system by sending an 'initialize'
    // control_request as the very first stdin message. Without this, the
    // child's session (packages/cli/src/nonInteractive/session.ts) leaves
    // controlSystemEnabled=false, which means the permissionController is
    // never wired up and destructive tools run without a permission
    // round-trip. The initialize request is a no-op in terms of hooks /
    // MCP — we only need to flip the switch.
    if (child.stdin) {
      const initMsg = {
        type: 'control_request',
        request_id: randomUUID(),
        request: { subtype: 'initialize' },
      };
      child.stdin.write(`${JSON.stringify(initMsg)}\n`);
    }

    // Drain any SSE clients that connected before this session existed.
    // See pendingSseClients — they've been waiting for broadcast without
    // receiving anything because there was no session to attach to.
    const pending = pendingSseClients.get(id);
    if (pending) {
      for (const c of pending) session.sseClients.add(c);
      pendingSseClients.delete(id);
    }

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

  respondPermission(
    id: string,
    requestId: string,
    allowed: boolean,
    extra?: Record<string, unknown>,
  ): boolean {
    const session = sessions.get(id);
    if (!session?.child?.stdin) return false;

    session.pendingPermissions.delete(requestId);

    // The CLI's permissionController reads `payload.behavior` ('allow' |
    // 'deny'), NOT the legacy `allowed` boolean. Sending `{ allowed }`
    // silently produced an undefined behavior → every tool interpreted
    // as denied. We merge any extra payload (e.g. answers from the
    // ask_user_question dialog) so the core can forward it to onConfirm.
    const response = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: allowed ? 'allow' : 'deny',
          ...(extra ?? {}),
        },
      },
    };
    session.child.stdin.write(`${JSON.stringify(response)}\n`);
    return true;
  },

  /**
   * Restore a file from the snapshot captured at permission time. Writes
   * the `before` content back to disk. Returns whether the revert
   * succeeded; broadcasts a `file_reverted` SSE event so the UI can
   * gray-out the Revert button.
   */
  revertFile(
    id: string,
    callId: string,
  ): { ok: true } | { ok: false; reason: string } {
    const snapshots = persistentSnapshots.get(id);
    const snap = snapshots?.get(callId);
    if (!snap) return { ok: false, reason: 'No snapshot for this call' };
    if (snap.reverted) return { ok: false, reason: 'Already reverted' };
    try {
      if (snap.before === null) {
        // File didn't exist before → revert means deleting.
        if (fs.existsSync(snap.path)) fs.unlinkSync(snap.path);
      } else {
        fs.writeFileSync(snap.path, snap.before, 'utf8');
      }
      snap.reverted = true;
      const session = sessions.get(id);
      if (session) {
        broadcast(session, 'message', {
          type: 'file_reverted',
          callId,
          path: snap.path,
        });
      }
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  },

  interrupt(id: string): boolean {
    const session = sessions.get(id);
    if (!session?.child?.stdin) return false;

    // control_cancel_request only aborts the dispatcher's pending
    // control requests — it does NOT abort the main LLM streaming loop.
    // What actually stops the turn is systemController's interrupt
    // handler, which fires onInterrupt → session.abortController.abort()
    // → the `for await` loop in nonInteractiveCli.ts trips its
    // `if (signal.aborted)` check and process.exit()s. The child's close
    // handler then drops the session from the in-memory map; the next
    // /query re-spawns a fresh child.
    const interruptMsg = {
      type: 'control_request',
      request_id: randomUUID(),
      request: { subtype: 'interrupt' },
    };
    session.child.stdin.write(`${JSON.stringify(interruptMsg)}\n`);
    return true;
  },

  addSseClient(client: SseClient): void {
    const session = sessions.get(client.sessionId);
    if (session) {
      session.sseClients.add(client);
      return;
    }
    // Session not active yet (will be lazily created on first /query).
    // Park the client in pendingSseClients; create() will drain it.
    let pending = pendingSseClients.get(client.sessionId);
    if (!pending) {
      pending = new Set();
      pendingSseClients.set(client.sessionId, pending);
    }
    pending.add(client);
  },

  removeSseClient(client: SseClient): void {
    const session = sessions.get(client.sessionId);
    if (session) session.sseClients.delete(client);
    const pending = pendingSseClients.get(client.sessionId);
    if (pending) {
      pending.delete(client);
      if (pending.size === 0) pendingSseClients.delete(client.sessionId);
    }
  },

  isActive(id: string): boolean {
    return sessions.has(id);
  },
};
