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
  setConnectionError: (err) => set({ connectionError: err }),
}));
