/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { create } from 'zustand';
import type { ChatMessageData } from '@qwen-code/webui';
import type {
  ToolCallEntry,
  FileOperationEntry,
  PermissionRequest,
  TokenUsage,
} from '../types/message';

/** Maximum number of sessions whose data is kept in memory at once. */
const MAX_SESSIONS_IN_MEMORY = 10;

interface MessageStore {
  // Messages per session (sessionId → ChatMessageData[])
  messagesBySession: Record<string, ChatMessageData[]>;
  // Streaming assistant text (uuid → accumulated text)
  streamingText: Record<string, string>;
  // Tool calls by callId
  toolCallsBySession: Record<string, Record<string, ToolCallEntry>>;
  // File operations (for Files panel)
  fileOpsBySession: Record<string, FileOperationEntry[]>;
  // Plan entries (for Plan panel)
  planBySession: Record<string, string[]>;
  // Terminal output (for Terminal panel)
  terminalBySession: Record<string, string>;
  // Streaming state
  isStreaming: boolean;
  // Active permission request
  pendingPermission: PermissionRequest | null;
  // Active ask_user_question dialog
  pendingQuestion: {
    requestId: string;
    toolUseId: string;
    questions: Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description: string }>;
      multiSelect: boolean;
    }>;
  } | null;
  // Active exit_plan_mode prompt
  pendingPlan: {
    requestId: string;
    toolUseId: string;
    plan: string;
  } | null;
  // Token usage for the most recent turn, keyed per session so
  // switching sessions shows the right conversation's usage.
  tokenUsageBySession: Record<string, TokenUsage | null>;
  // Cumulative token usage per session.
  sessionTokensBySession: Record<
    string,
    { inputTokens: number; outputTokens: number; turns: number }
  >;
  // Active model's context window (input/output token limits). Populated
  // from system_init so the UI can render a "context used" %
  modelLimits: { input?: number; output?: number; model?: string } | null;
  // Current approval mode reported by the child (system_init) and
  // updated optimistically when the user clicks the cycle button.
  approvalMode: 'default' | 'plan' | 'auto-edit' | 'yolo' | null;
  // File modifications by the current session, keyed by callId so a
  // tool-call card can reveal the diff + offer Revert.
  fileModsBySession: Record<
    string,
    Record<
      string,
      {
        callId: string;
        path: string;
        before: string | null;
        after: string | null;
        toolName: string;
        reverted?: boolean;
      }
    >
  >;
  // LRU access order — session ids ordered oldest→newest (most recent at END).
  // When length exceeds MAX_SESSIONS_IN_MEMORY the first (LRU) entry is evicted.
  sessionAccessOrder: string[];
  // Connection error
  connectionError: string | null;
  // Currently active tool name (for live status display in LoadingIndicator)
  currentToolName: string | null;
  // Turn counter per session (incremented on each 'result' event)
  turnCountBySession: Record<string, number>;

  // Actions
  setMessages: (sessionId: string, messages: ChatMessageData[]) => void;
  appendMessage: (sessionId: string, msg: ChatMessageData) => void;
  updateStreamingText: (uuid: string, delta: string) => void;
  finalizeStreamingText: (sessionId: string, uuid: string) => void;
  upsertToolCall: (sessionId: string, entry: ToolCallEntry) => void;
  addFileOp: (sessionId: string, op: FileOperationEntry) => void;
  setPlan: (sessionId: string, items: string[]) => void;
  appendTerminal: (sessionId: string, text: string) => void;
  clearSession: (sessionId: string) => void;
  setStreaming: (v: boolean) => void;
  setPendingPermission: (req: PermissionRequest | null) => void;
  setPendingQuestion: (req: MessageStore['pendingQuestion']) => void;
  setPendingPlan: (req: MessageStore['pendingPlan']) => void;
  setTokenUsage: (sessionId: string, usage: TokenUsage | null) => void;
  /** Add a turn's usage to the session cumulative total. */
  addSessionTokens: (sessionId: string, u: TokenUsage) => void;
  resetSessionTokens: (sessionId: string) => void;
  setModelLimits: (
    limits: { input?: number; output?: number; model?: string } | null,
  ) => void;
  setApprovalMode: (
    mode: 'default' | 'plan' | 'auto-edit' | 'yolo' | null,
  ) => void;
  recordFileMod: (
    sessionId: string,
    mod: {
      callId: string;
      path: string;
      before: string | null;
      after: string | null;
      toolName: string;
    },
  ) => void;
  markFileReverted: (sessionId: string, callId: string) => void;
  /** Merge fields into the tool_call ChatMessageData with uuid `tool-<callId>`. */
  patchToolCallMessage: (
    sessionId: string,
    callId: string,
    patch: Partial<{
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      durationMs: number;
      content: Array<{
        type: 'content' | 'diff';
        content?: { type: string; text?: string };
        path?: string;
        oldText?: string | null;
        newText?: string;
      }>;
    }>,
  ) => void;
  clearStreamingText: (uuid: string) => void;
  setConnectionError: (err: string | null) => void;
  /**
   * Mark a session as most-recently-used. Evicts the least-recently-used
   * session(s) from memory when the in-memory count exceeds
   * MAX_SESSIONS_IN_MEMORY. Safe to call on the currently active session —
   * it moves it to the end of the access order so it is never the eviction
   * candidate.
   */
  touchSession: (sessionId: string) => void;
  setCurrentToolName: (name: string | null) => void;
  incrementTurnCount: (sessionId: string) => void;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messagesBySession: {},
  streamingText: {},
  toolCallsBySession: {},
  fileOpsBySession: {},
  planBySession: {},
  terminalBySession: {},
  isStreaming: false,
  pendingPermission: null,
  pendingQuestion: null,
  pendingPlan: null,
  tokenUsageBySession: {},
  sessionTokensBySession: {},
  modelLimits: null,
  approvalMode: null,
  fileModsBySession: {},
  sessionAccessOrder: [],
  connectionError: null,
  currentToolName: null,
  turnCountBySession: {},

  setMessages: (sessionId, messages) =>
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: messages },
    })),

  appendMessage: (sessionId, msg) =>
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), msg],
      },
    })),

  updateStreamingText: (uuid, delta) =>
    set((s) => ({
      streamingText: {
        ...s.streamingText,
        [uuid]: (s.streamingText[uuid] ?? '') + delta,
      },
    })),

  finalizeStreamingText: (sessionId, uuid) =>
    set((s) => {
      const text = s.streamingText[uuid] ?? '';
      const existing = s.messagesBySession[sessionId] ?? [];
      const idx = existing.findIndex((m) => m.uuid === uuid);
      const updated =
        idx >= 0
          ? existing.map((m) =>
              m.uuid === uuid
                ? { ...m, message: { ...m.message, content: text } }
                : m,
            )
          : [
              ...existing,
              {
                uuid,
                type: 'assistant' as const,
                timestamp: new Date().toISOString(),
                message: { role: 'assistant', content: text },
              },
            ];
      const { [uuid]: _removed, ...rest } = s.streamingText;
      return {
        messagesBySession: { ...s.messagesBySession, [sessionId]: updated },
        streamingText: rest,
      };
    }),

  upsertToolCall: (sessionId, entry) =>
    set((s) => ({
      toolCallsBySession: {
        ...s.toolCallsBySession,
        [sessionId]: {
          ...(s.toolCallsBySession[sessionId] ?? {}),
          [entry.callId]: entry,
        },
      },
    })),

  addFileOp: (sessionId, op) =>
    set((s) => ({
      fileOpsBySession: {
        ...s.fileOpsBySession,
        [sessionId]: [...(s.fileOpsBySession[sessionId] ?? []), op],
      },
    })),

  setPlan: (sessionId, items) =>
    set((s) => ({
      planBySession: { ...s.planBySession, [sessionId]: items },
    })),

  appendTerminal: (sessionId, text) =>
    set((s) => {
      const TERMINAL_CAP = 200 * 1024; // 200 KB — prevents unbounded growth on long shell runs
      const current = s.terminalBySession[sessionId] ?? '';
      const appended = current + text;
      const trimmed =
        appended.length > TERMINAL_CAP
          ? appended.slice(appended.length - TERMINAL_CAP)
          : appended;
      return {
        terminalBySession: { ...s.terminalBySession, [sessionId]: trimmed },
      };
    }),

  clearSession: (sessionId) =>
    set((s) => {
      const { [sessionId]: _m, ...messages } = s.messagesBySession;
      const { [sessionId]: _t, ...tools } = s.toolCallsBySession;
      const { [sessionId]: _f, ...files } = s.fileOpsBySession;
      const { [sessionId]: _p, ...plan } = s.planBySession;
      const { [sessionId]: _term, ...terminal } = s.terminalBySession;
      const { [sessionId]: _tu, ...tokenUsage } = s.tokenUsageBySession;
      const { [sessionId]: _st, ...sessionTokens } = s.sessionTokensBySession;
      const { [sessionId]: _fm, ...fileMods } = s.fileModsBySession;
      return {
        messagesBySession: messages,
        toolCallsBySession: tools,
        fileOpsBySession: files,
        planBySession: plan,
        terminalBySession: terminal,
        tokenUsageBySession: tokenUsage,
        sessionTokensBySession: sessionTokens,
        fileModsBySession: fileMods,
        sessionAccessOrder: s.sessionAccessOrder.filter(
          (id) => id !== sessionId,
        ),
      };
    }),

  setStreaming: (v) => set({ isStreaming: v }),
  setPendingPermission: (req) => set({ pendingPermission: req }),
  setPendingQuestion: (req) => set({ pendingQuestion: req }),
  setPendingPlan: (req) => set({ pendingPlan: req }),
  setTokenUsage: (sessionId, usage) =>
    set((s) => ({
      tokenUsageBySession: {
        ...s.tokenUsageBySession,
        [sessionId]: usage,
      },
    })),
  addSessionTokens: (sessionId, u) =>
    set((s) => {
      const current = s.sessionTokensBySession[sessionId] ?? {
        inputTokens: 0,
        outputTokens: 0,
        turns: 0,
      };
      return {
        sessionTokensBySession: {
          ...s.sessionTokensBySession,
          [sessionId]: {
            inputTokens: current.inputTokens + (u.inputTokens ?? 0),
            outputTokens: current.outputTokens + (u.outputTokens ?? 0),
            turns: current.turns + 1,
          },
        },
      };
    }),
  resetSessionTokens: (sessionId) =>
    set((s) => ({
      sessionTokensBySession: {
        ...s.sessionTokensBySession,
        [sessionId]: { inputTokens: 0, outputTokens: 0, turns: 0 },
      },
      tokenUsageBySession: {
        ...s.tokenUsageBySession,
        [sessionId]: null,
      },
    })),
  setModelLimits: (limits) => set({ modelLimits: limits }),
  setApprovalMode: (mode) => set({ approvalMode: mode }),
  recordFileMod: (sessionId, mod) =>
    set((s) => ({
      fileModsBySession: {
        ...s.fileModsBySession,
        [sessionId]: {
          ...(s.fileModsBySession[sessionId] ?? {}),
          [mod.callId]: mod,
        },
      },
    })),
  markFileReverted: (sessionId, callId) =>
    set((s) => {
      const sessionMods = s.fileModsBySession[sessionId];
      const current = sessionMods?.[callId];
      if (!current) return s;
      return {
        fileModsBySession: {
          ...s.fileModsBySession,
          [sessionId]: {
            ...sessionMods,
            [callId]: { ...current, reverted: true },
          },
        },
      };
    }),
  patchToolCallMessage: (sessionId, callId, patch) =>
    set((s) => {
      const existing = s.messagesBySession[sessionId];
      if (!existing) return s;
      const uuid = `tool-${callId}`;
      let changed = false;
      const next = existing.map((m) => {
        if (m.uuid !== uuid || m.type !== 'tool_call' || !m.toolCall) return m;
        changed = true;
        return {
          ...m,
          toolCall: {
            ...m.toolCall,
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.content ? { content: patch.content } : {}),
            ...(patch.durationMs != null
              ? { durationMs: patch.durationMs }
              : {}),
          },
        };
      });
      if (!changed) return s;
      return {
        messagesBySession: {
          ...s.messagesBySession,
          [sessionId]: next,
        },
      };
    }),
  clearStreamingText: (uuid) =>
    set((s) => {
      const { [uuid]: _removed, ...rest } = s.streamingText;
      return { streamingText: rest };
    }),

  setConnectionError: (err) => set({ connectionError: err }),
  setCurrentToolName: (name) => set({ currentToolName: name }),
  incrementTurnCount: (sessionId) =>
    set((s) => ({
      turnCountBySession: {
        ...s.turnCountBySession,
        [sessionId]: (s.turnCountBySession[sessionId] ?? 0) + 1,
      },
    })),

  touchSession: (sessionId) => {
    // Move sessionId to the end (most-recently-used position).
    const order = get().sessionAccessOrder.filter((id) => id !== sessionId);
    order.push(sessionId);

    // Evict all entries beyond the cap, calling clearSession for each.
    // We call clearSession via get() to reuse its logic (which also updates
    // sessionAccessOrder), then write the remaining order in one final set().
    while (order.length > MAX_SESSIONS_IN_MEMORY) {
      const lru = order.shift()!; // oldest is at position 0
      get().clearSession(lru);
    }

    // Persist the updated (and already-eviction-adjusted) order.
    set({ sessionAccessOrder: order });
  },
}));
