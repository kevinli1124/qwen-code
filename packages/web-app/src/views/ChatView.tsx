/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useCallback, useRef, type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AppLayout } from '../components/layout/AppLayout';
import { Sidebar } from '../components/layout/Sidebar';
import { RightPanel } from '../components/layout/RightPanel';
import { ConversationView } from '../components/conversation/ConversationView';
import { InputBar } from '../components/conversation/InputBar';
import { LoadingIndicator } from '../components/conversation/LoadingIndicator';
import { ContextUsage } from '../components/shared/ContextUsage';
import { ApprovalModeToggle } from '../components/shared/ApprovalModeToggle';
import {
  PermissionCard,
  type PermissionDecision,
} from '../components/conversation/PermissionCard';
import { QuestionModal } from '../components/conversation/QuestionModal';
import {
  PlanConfirmationModal,
  type PlanAction,
} from '../components/conversation/PlanConfirmationModal';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { NewSessionModal } from '../components/session/NewSessionModal';
import { SettingsModal } from '../components/shared/SettingsModal';
import { useSessionStore } from '../stores/sessionStore';
import { useMessageStore } from '../stores/messageStore';
import { useSettingsStore } from '../stores/settingsStore';
import { usePanelStore } from '../stores/panelStore';
import { useSessionEvents } from '../hooks/useSession';
import { useSSE } from '../hooks/useSSE';
import { sessionsApi } from '../api/sessions';
import { settingsApi } from '../api/settings';
import { convertStoredToChatMessages } from '../utils/messageConverter';
import { handleLocalCommand } from '../utils/localCommands';
import {
  commandsApi,
  type CommandMetadata,
  type SkillMetadata,
} from '../api/commands';

export const ChatView: FC = () => {
  const [showNewSession, setShowNewSession] = useState(false);
  const { activeSessionId, addSession, setActiveSessionId, sessions } =
    useSessionStore(
      useShallow((s) => ({
        activeSessionId: s.activeSessionId,
        addSession: s.addSession,
        setActiveSessionId: s.setActiveSessionId,
        sessions: s.sessions,
      })),
    );
  const {
    isStreaming,
    pendingPermission,
    pendingQuestion,
    pendingPlan,
    connectionError,
    setPendingPermission,
    setPendingQuestion,
    setPendingPlan,
    setConnectionError,
    setStreaming,
    appendMessage,
    setMessages,
    messagesBySession,
    clearSession,
    tokenUsageBySession,
    sessionTokensBySession,
    resetSessionTokens,
    modelLimits,
  } = useMessageStore(
    useShallow((s) => ({
      isStreaming: s.isStreaming,
      pendingPermission: s.pendingPermission,
      pendingQuestion: s.pendingQuestion,
      pendingPlan: s.pendingPlan,
      connectionError: s.connectionError,
      setPendingPermission: s.setPendingPermission,
      setPendingQuestion: s.setPendingQuestion,
      setPendingPlan: s.setPendingPlan,
      setConnectionError: s.setConnectionError,
      setStreaming: s.setStreaming,
      appendMessage: s.appendMessage,
      setMessages: s.setMessages,
      messagesBySession: s.messagesBySession,
      clearSession: s.clearSession,
      tokenUsageBySession: s.tokenUsageBySession,
      sessionTokensBySession: s.sessionTokensBySession,
      resetSessionTokens: s.resetSessionTokens,
      modelLimits: s.modelLimits,
    })),
  );

  // Auto-compress at 90%: fire exactly once per high-water turn, reset
  // once the usage drops back below the threshold (i.e. compression
  // worked) so we don't spam /compress in a loop if the model keeps the
  // context high.
  const autoCompressSentRef = useRef(false);
  const AUTO_COMPRESS_THRESHOLD = 0.9;

  const [commandList, setCommandList] = useState<CommandMetadata[]>([]);
  const [skillList, setSkillList] = useState<SkillMetadata[]>([]);

  useEffect(() => {
    const lang = navigator.language;
    Promise.all([
      commandsApi.list(lang).catch(() => [] as CommandMetadata[]),
      commandsApi.listSkills().catch(() => [] as SkillMetadata[]),
    ]).then(([cmds, skills]) => {
      setCommandList(cmds);
      setSkillList(skills);
    });
  }, []);

  const [historyState, setHistoryState] = useState<{
    oldest: string | null;
    hasMore: boolean;
    isLoading: boolean;
  }>({ oldest: null, hasMore: false, isLoading: false });

  // On session activation, clear stale per-session panel state (Files /
  // Plan / Terminal) from whichever session was active before, then fetch
  // the most recent slice of persisted history. The backend returns
  // newest-N messages; older ones are paged in via loadMore when the
  // user scrolls to the top.
  useEffect(() => {
    if (!activeSessionId) {
      setHistoryState({ oldest: null, hasMore: false, isLoading: false });
      return;
    }
    clearSession(activeSessionId);
    sessionsApi
      .getHistory(activeSessionId, 50)
      .then((data) => {
        const msgs = convertStoredToChatMessages(data.messages);
        setMessages(activeSessionId, msgs);
        setHistoryState({
          oldest: data.messages[0]?.timestamp ?? null,
          hasMore: !!data.hasMore,
          isLoading: false,
        });
      })
      .catch(() => {
        // Mock mode / no server — leave whatever is in the store.
        setHistoryState({ oldest: null, hasMore: false, isLoading: false });
      });
  }, [activeSessionId, setMessages, clearSession]);

  const loadMore = useCallback(async () => {
    if (!activeSessionId) return;
    if (
      !historyState.hasMore ||
      historyState.isLoading ||
      !historyState.oldest
    ) {
      return;
    }
    setHistoryState((s) => ({ ...s, isLoading: true }));
    try {
      const data = await sessionsApi.getHistory(
        activeSessionId,
        50,
        historyState.oldest,
      );
      const older = convertStoredToChatMessages(data.messages);
      const existing = messagesBySession[activeSessionId] ?? [];
      setMessages(activeSessionId, [...older, ...existing]);
      setHistoryState({
        oldest: data.messages[0]?.timestamp ?? null,
        hasMore: !!data.hasMore,
        isLoading: false,
      });
    } catch {
      setHistoryState((s) => ({ ...s, isLoading: false }));
    }
  }, [activeSessionId, historyState, messagesBySession, setMessages]);
  const {
    toggleSidebar,
    showSettingsModal,
    setShowSettingsModal,
    setServerSettings,
    serverSettings,
  } = useSettingsStore(
    useShallow((s) => ({
      toggleSidebar: s.toggleSidebar,
      showSettingsModal: s.showSettingsModal,
      setShowSettingsModal: s.setShowSettingsModal,
      setServerSettings: s.setServerSettings,
      serverSettings: s.serverSettings,
    })),
  );
  const { collapsed: panelCollapsed, toggleCollapsed: togglePanel } =
    usePanelStore(
      useShallow((s) => ({
        collapsed: s.collapsed,
        toggleCollapsed: s.toggleCollapsed,
      })),
    );
  // Load settings on mount; auto-open modal if no API key configured
  useEffect(() => {
    settingsApi
      .get()
      .then((s) => {
        setServerSettings(s);
        if (!s.security.auth.apiKey && !s.general.setupCompleted) {
          setShowSettingsModal(true);
        }
      })
      .catch(() => {
        // Server not reachable (dev mode without backend) — skip
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { handleEvent } = useSessionEvents(activeSessionId ?? '');

  // Connect SSE for active session
  useSSE(activeSessionId, handleEvent, (err) => setConnectionError(err));

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Watch token usage for the active session; when it crosses the
  // AUTO_COMPRESS_THRESHOLD fire /compress once. Flag resets when
  // usage drops back under, so repeated high-usage turns after a
  // compress that didn't help won't spam.
  useEffect(() => {
    if (!activeSessionId) return;
    const usage = tokenUsageBySession[activeSessionId];
    const limit = modelLimits?.input;
    if (!usage || !limit || limit <= 0) return;
    // Compare *fresh* tokens (total minus cached) to the limit — cached
    // prefixes are served from the provider's cache and don't fill the
    // effective context, so counting them would trigger /compress
    // prematurely once a long stable conversation starts hitting cache.
    const fresh = Math.max(
      0,
      usage.inputTokens - (usage.cacheReadInputTokens ?? 0),
    );
    const pct = fresh / limit;
    if (pct < AUTO_COMPRESS_THRESHOLD) {
      autoCompressSentRef.current = false;
      return;
    }
    if (autoCompressSentRef.current) return;
    autoCompressSentRef.current = true;
    // Fire as a user message so it flows through the same channel as a
    // manual /compress click.
    appendMessage(activeSessionId, {
      uuid: `auto-compress-${Date.now()}`,
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: `ℹ️ Context is at ${(pct * 100).toFixed(0)}% — auto-running /compress.`,
      },
    });
    void sessionsApi.sendQuery(activeSessionId, '/compress').catch(() => {
      autoCompressSentRef.current = false;
    });
  }, [activeSessionId, tokenUsageBySession, modelLimits, appendMessage]);

  const handleSend = async (text: string) => {
    if (!activeSessionId) return;
    // Echo the user message locally — the backend SSE stream does not
    // re-broadcast user input, so without this the prompt never appears.
    appendMessage(activeSessionId, {
      uuid: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'user',
      timestamp: new Date().toISOString(),
      message: { role: 'user', content: text },
    });

    // Intercept info-style slash commands locally — the child CLI rejects
    // them with "not supported in non-interactive mode" otherwise.
    const local = await handleLocalCommand(text, {
      sessionId: activeSessionId,
      sessionTitle: activeSession?.title,
      sessionCwd: activeSession?.cwd,
      commands: commandList,
      skills: skillList,
      tokenUsage: tokenUsageBySession[activeSessionId] ?? null,
      sessionTokens: sessionTokensBySession[activeSessionId] ?? {
        inputTokens: 0,
        outputTokens: 0,
        turns: 0,
      },
      clearSession,
      resetSessionTokens,
      appendMessage,
    });
    if (local.handled) return;

    setStreaming(true);
    try {
      await sessionsApi.sendQuery(activeSessionId, text);
    } catch (_e) {
      setConnectionError(
        _e instanceof Error ? _e.message : 'Failed to send message',
      );
      setStreaming(false);
    }
  };

  const handleStop = async () => {
    if (!activeSessionId) return;
    try {
      await sessionsApi.interrupt(activeSessionId);
    } catch {
      // ignore
    }
    setStreaming(false);
  };

  const handleNewSession = async (cwd: string, title?: string) => {
    try {
      const { sessionId } = await sessionsApi.create(cwd, title);
      const newSession = {
        id: sessionId,
        title: title ?? cwd.split('/').pop() ?? cwd,
        cwd,
        status: 'idle' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addSession(newSession);
      setActiveSessionId(sessionId);
      setShowNewSession(false);
    } catch {
      // In mock mode, create local session
      const mockId = `sess-${Date.now()}`;
      addSession({
        id: mockId,
        title: title ?? cwd.split('/').pop() ?? cwd,
        cwd,
        status: 'idle',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setActiveSessionId(mockId);
      setShowNewSession(false);
    }
  };

  const handlePermissionDecision = async (decision: PermissionDecision) => {
    if (!activeSessionId || !pendingPermission) return;
    // Map the card's decision to core's ToolConfirmationOutcome. Core then
    // runs persistPermissionOutcome, which writes the matching rule to
    // `.qwen/settings.json` (project) or `~/.qwen/settings.json` (user)
    // and updates the in-memory PermissionManager so the *next* identical
    // tool call is auto-approved at the L4 pipeline stage — the backend
    // never emits a permission_request, so there is no UI flash.
    const outcome = (() => {
      switch (decision) {
        case 'allow_once':
          return 'ProceedOnce' as const;
        case 'allow_project':
          return 'ProceedAlwaysProject' as const;
        case 'allow_user':
          return 'ProceedAlwaysUser' as const;
        case 'deny':
        default:
          return undefined;
      }
    })();
    const allowed = decision !== 'deny';
    try {
      await sessionsApi.respondPermission(
        activeSessionId,
        pendingPermission.requestId,
        allowed,
        outcome,
      );
    } catch {
      // ignore
    }
    setPendingPermission(null);
  };

  const handleQuestionSubmit = async (answers: Record<string, string>) => {
    if (!activeSessionId || !pendingQuestion) return;
    try {
      await sessionsApi.respondQuestion(
        activeSessionId,
        pendingQuestion.requestId,
        { answers },
      );
    } catch {
      // ignore
    }
    setPendingQuestion(null);
  };

  const handlePlanDecide = async (action: PlanAction, feedback?: string) => {
    if (!activeSessionId || !pendingPlan) return;
    try {
      await sessionsApi.respondPlan(
        activeSessionId,
        pendingPlan.requestId,
        action,
        feedback,
      );
    } catch {
      // ignore
    }
    setPendingPlan(null);
  };

  const handleQuestionCancel = async () => {
    if (!activeSessionId || !pendingQuestion) return;
    try {
      await sessionsApi.respondQuestion(
        activeSessionId,
        pendingQuestion.requestId,
        { cancelled: true },
      );
    } catch {
      // ignore
    }
    setPendingQuestion(null);
  };

  return (
    <>
      <AppLayout
        sidebar={<Sidebar onNewSession={() => setShowNewSession(true)} />}
        main={
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 h-10 border-b border-[#2e2e2e] flex-shrink-0">
              <button
                onClick={toggleSidebar}
                className="w-6 h-6 rounded hover:bg-[#2e2e2e] flex items-center justify-center text-[#8a8a8a] hover:text-[#e8e6e3] transition-colors"
                title="Toggle sidebar"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M1 3h12M1 7h12M1 11h12"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                {activeSession ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#e8e6e3] truncate">
                      {activeSession.title}
                    </span>
                    <span className="text-xs text-[#8a8a8a] truncate hidden sm:block font-mono">
                      {activeSession.cwd}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-[#8a8a8a]">Qwen Code</span>
                )}
              </div>
              {isStreaming && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                  <span>Running</span>
                </div>
              )}
              <ContextUsage />
              <ApprovalModeToggle sessionId={activeSessionId} />
              {/* Right panel toggle — useful for Terminal / Files / Plan
                  panes. Stays reachable even after the panel is closed. */}
              <button
                onClick={togglePanel}
                className="w-6 h-6 rounded hover:bg-[#2e2e2e] flex items-center justify-center text-[#8a8a8a] hover:text-[#e8e6e3] transition-colors"
                title={
                  panelCollapsed ? 'Open tools panel' : 'Close tools panel'
                }
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  {panelCollapsed ? (
                    <path
                      d="M9 3v8M3 3h10M3 11h10M3 3v8"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  ) : (
                    <path
                      d="M9 3v8M3 3h10M3 11h10M3 3v8"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      opacity="0.4"
                    />
                  )}
                </svg>
              </button>
            </div>

            {/* Error banner */}
            {connectionError && (
              <ErrorBanner
                message={connectionError}
                onDismiss={() => setConnectionError(null)}
              />
            )}

            {/* Conversation */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeSessionId ? (
                <ConversationView
                  sessionId={activeSessionId}
                  hasMore={historyState.hasMore}
                  isLoadingMore={historyState.isLoading}
                  onLoadMore={loadMore}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-[#8a8a8a]">
                  <div className="w-16 h-16 rounded-full bg-[#2e2e2e] flex items-center justify-center">
                    <span className="text-3xl font-bold text-accent">Q</span>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-semibold text-[#e8e6e3]">
                      Welcome to Qwen Code
                    </div>
                    <div className="text-sm mt-1">
                      Start a new session to begin
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNewSession(true)}
                    className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover transition-colors"
                  >
                    New Session
                  </button>
                </div>
              )}
            </div>

            {/* LoadingIndicator stays above the input bar so it's visible
                during streaming. We no longer hide it while a permission
                prompt is active — the prompt overlays on top instead. */}
            {activeSessionId && <LoadingIndicator visible={isStreaming} />}

            {/* InputBar is always mounted while a session is active so
                the user's in-flight draft text survives
                permission / question / plan prompts (they now overlay
                instead of replacing the input area). */}
            {activeSessionId && (
              <InputBar onSend={handleSend} onStop={handleStop} />
            )}
          </div>
        }
        rightPanel={<RightPanel />}
      />

      {/* Permission prompt — overlay (was inline replacement of
          InputBar). Same modal pattern as QuestionModal for visual
          consistency; InputBar stays mounted underneath so draft text
          isn't lost when a permission_request arrives mid-typing. */}
      {pendingPermission && (
        <PermissionCard
          request={pendingPermission}
          projectCwd={activeSession?.cwd}
          onDecide={handlePermissionDecision}
        />
      )}

      {/* ask_user_question dialog */}
      {pendingQuestion && (
        <QuestionModal
          questions={pendingQuestion.questions}
          onSubmit={handleQuestionSubmit}
          onCancel={handleQuestionCancel}
        />
      )}

      {/* exit_plan_mode plan review dialog */}
      {pendingPlan && (
        <PlanConfirmationModal
          plan={pendingPlan.plan}
          onDecide={handlePlanDecide}
        />
      )}

      {/* New session modal */}
      {showNewSession && (
        <NewSessionModal
          onConfirm={handleNewSession}
          onClose={() => setShowNewSession(false)}
        />
      )}

      {/* Settings modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          isFirstRun={!serverSettings?.general.setupCompleted}
        />
      )}
    </>
  );
};
