/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect } from 'react';
import { ChatView } from './views/ChatView';
import { useSessionStore } from './stores/sessionStore';
import { sessionsApi } from './api/sessions';

export default function App() {
  const { setSessions } = useSessionStore();

  // Load real sessions from server on mount
  useEffect(() => {
    sessionsApi
      .list()
      .then((sessions) => setSessions(sessions))
      .catch(() => {
        // Server not available (dev without backend) — start with empty list
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <ChatView />;
}
