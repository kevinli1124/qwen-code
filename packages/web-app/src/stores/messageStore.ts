import { create } from 'zustand';
import type { ChatMessageData } from '@qwen-code/webui';
import type {
  ToolCallEntry,
  FileOperationEntry,
  PermissionRequest,
  TokenUsage,
} from '../types/message';

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
  // Token usage for the most recent turn
  tokenUsage: TokenUsage | null;
  // Cumulative token usage for the current session (all turns summed)
  sessionTokens: { inputTokens: number; outputTokens: number; turns: number };
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
  // Connection error
  connectionError: string | null;

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
  setTokenUsage: (usage: TokenUsage | null) => void;
  /** Add a turn's usage to the session cumulative total. */
  addSessionTokens: (u: TokenUsage) => void;
  resetSessionTokens: () => void;
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
  setConnectionError: (err: string | null) => void;
}

export const useMessageStore = create<MessageStore>((set) => ({
  messagesBySession: {},
  streamingText: {},
  toolCallsBySession: {},
  fileOpsBySession: {},
  planBySession: {},
  terminalBySession: {},
  isStreaming: false,
  pendingPermission: null,
  pendingQuestion: null,
  tokenUsage: null,
  sessionTokens: { inputTokens: 0, outputTokens: 0, turns: 0 },
  modelLimits: null,
  approvalMode: null,
  fileModsBySession: {},
  connectionError: null,

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
    set((s) => ({
      terminalBySession: {
        ...s.terminalBySession,
        [sessionId]: (s.terminalBySession[sessionId] ?? '') + text,
      },
    })),

  clearSession: (sessionId) =>
    set((s) => {
      const { [sessionId]: _m, ...messages } = s.messagesBySession;
      const { [sessionId]: _t, ...tools } = s.toolCallsBySession;
      const { [sessionId]: _f, ...files } = s.fileOpsBySession;
      const { [sessionId]: _p, ...plan } = s.planBySession;
      const { [sessionId]: _term, ...terminal } = s.terminalBySession;
      return {
        messagesBySession: messages,
        toolCallsBySession: tools,
        fileOpsBySession: files,
        planBySession: plan,
        terminalBySession: terminal,
      };
    }),

  setStreaming: (v) => set({ isStreaming: v }),
  setPendingPermission: (req) => set({ pendingPermission: req }),
  setPendingQuestion: (req) => set({ pendingQuestion: req }),
  setTokenUsage: (usage) => set({ tokenUsage: usage }),
  addSessionTokens: (u) =>
    set((s) => ({
      sessionTokens: {
        inputTokens: s.sessionTokens.inputTokens + (u.inputTokens ?? 0),
        outputTokens: s.sessionTokens.outputTokens + (u.outputTokens ?? 0),
        turns: s.sessionTokens.turns + 1,
      },
    })),
  resetSessionTokens: () =>
    set({ sessionTokens: { inputTokens: 0, outputTokens: 0, turns: 0 } }),
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
  setConnectionError: (err) => set({ connectionError: err }),
}));
