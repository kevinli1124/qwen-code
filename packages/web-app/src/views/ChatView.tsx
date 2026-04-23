/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useCallback, type FC } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Sidebar } from '../components/layout/Sidebar';
import { RightPanel } from '../components/layout/RightPanel';
import { ConversationView } from '../components/conversation/ConversationView';
import { InputBar } from '../components/conversation/InputBar';
import { PermissionModal } from '../components/conversation/PermissionModal';
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
    useSessionStore();
  const {
    isStreaming,
    pendingPermission,
    connectionError,
    setPendingPermission,
    setConnectionError,
    setStreaming,
    appendMessage,
    setMessages,
    messagesBySession,
    clearSession,
    tokenUsage,
    sessionTokens,
  } = useMessageStore();

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

  // On session activation, fetch the most recent slice of persisted
  // history. The backend returns newest-N messages; older ones are paged
  // in via loadMore when the user scrolls to the top.
  useEffect(() => {
    if (!activeSessionId) {
      setHistoryState({ oldest: null, hasMore: false, isLoading: false });
      return;
    }
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
  }, [activeSessionId, setMessages]);

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
  } = useSettingsStore();
  const { collapsed: panelCollapsed, toggleCollapsed: togglePanel } =
    usePanelStore();

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
    const local = handleLocalCommand(text, {
      sessionId: activeSessionId,
      sessionTitle: activeSession?.title,
      sessionCwd: activeSession?.cwd,
      commands: commandList,
      skills: skillList,
      tokenUsage,
      sessionTokens,
      clearSession,
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

  const handlePermissionRespond = async (allowed: boolean) => {
    if (!activeSessionId || !pendingPermission) return;
    try {
      await sessionsApi.respondPermission(
        activeSessionId,
        pendingPermission.requestId,
        allowed,
      );
    } catch {
      // ignore
    }
    setPendingPermission(null);
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

            {/* Input */}
            {activeSessionId && (
              <InputBar onSend={handleSend} onStop={handleStop} />
            )}
          </div>
        }
        rightPanel={<RightPanel />}
      />

      {/* Permission modal */}
      {pendingPermission && (
        <PermissionModal
          request={pendingPermission}
          onRespond={handlePermissionRespond}
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
