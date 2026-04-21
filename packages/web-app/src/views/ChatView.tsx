/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, type FC } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Sidebar } from '../components/layout/Sidebar';
import { RightPanel } from '../components/layout/RightPanel';
import { ConversationView } from '../components/conversation/ConversationView';
import { InputBar } from '../components/conversation/InputBar';
import { PermissionModal } from '../components/conversation/PermissionModal';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { NewSessionModal } from '../components/session/NewSessionModal';
import { useSessionStore } from '../stores/sessionStore';
import { useMessageStore } from '../stores/messageStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionEvents } from '../hooks/useSession';
import { useSSE } from '../hooks/useSSE';
import { sessionsApi } from '../api/sessions';

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
  } = useMessageStore();
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);

  const { handleEvent } = useSessionEvents(activeSessionId ?? '');

  // Connect SSE for active session
  useSSE(activeSessionId, handleEvent, (err) => setConnectionError(err));

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handleSend = async (text: string) => {
    if (!activeSessionId) return;
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
                <ConversationView sessionId={activeSessionId} />
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
    </>
  );
};
