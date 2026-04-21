/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect } from 'react';
import { ChatView } from './views/ChatView';
import { useSessionStore } from './stores/sessionStore';
import { useMessageStore } from './stores/messageStore';
import { MOCK_SESSIONS } from './mocks/sessions';
import { MOCK_MESSAGES, MOCK_TOOL_CALLS } from './mocks/conversation';
import { MOCK_FILE_OPS } from './mocks/files';
import { MOCK_PLAN_ITEMS } from './mocks/terminal';

const MOCK_SESSION_ID = 'sess-001';
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

export default function App() {
  const { setSessions, setActiveSessionId } = useSessionStore();
  const { setMessages, upsertToolCall, addFileOp, setPlan } = useMessageStore();

  useEffect(() => {
    if (!USE_MOCK) return;

    // Load mock data
    setSessions(MOCK_SESSIONS);
    setActiveSessionId(MOCK_SESSION_ID);

    setMessages(MOCK_SESSION_ID, MOCK_MESSAGES);
    Object.values(MOCK_TOOL_CALLS).forEach((tc) =>
      upsertToolCall(MOCK_SESSION_ID, tc),
    );
    MOCK_FILE_OPS.forEach((op) => addFileOp(MOCK_SESSION_ID, op));
    setPlan(MOCK_SESSION_ID, MOCK_PLAN_ITEMS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <ChatView />;
}
