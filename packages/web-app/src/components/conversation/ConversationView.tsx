/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { type FC, type ComponentType } from 'react';
import { ChatViewer, PlatformProvider } from '@qwen-code/webui';
import '@qwen-code/webui/styles.css';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';
import type { ChatMessageData, ChatViewerProps } from '@qwen-code/webui';

// Workaround for React 18/19 @types version mismatch between webui and web-app
const ChatViewerComp = ChatViewer as unknown as ComponentType<ChatViewerProps>;

interface ConversationViewProps {
  sessionId: string;
}

export const ConversationView: FC<ConversationViewProps> = ({ sessionId }) => {
  const messagesBySession = useMessageStore((s) => s.messagesBySession);
  const streamingText = useMessageStore((s) => s.streamingText);
  const activeSession = useSessionStore((s) =>
    s.sessions.find((sess) => sess.id === sessionId),
  );

  // Merge streaming messages into the list for live display
  const messages = messagesBySession[sessionId] ?? [];
  const displayMessages: ChatMessageData[] = messages.map((msg) => {
    if (msg.type === 'assistant' && msg.uuid && streamingText[msg.uuid]) {
      return {
        ...msg,
        message: { ...msg.message, content: streamingText[msg.uuid] },
      };
    }
    return msg;
  });

  // Add any streaming messages not yet in the list
  Object.entries(streamingText).forEach(([uuid, text]) => {
    if (!displayMessages.find((m) => m.uuid === uuid)) {
      displayMessages.push({
        uuid,
        type: 'assistant',
        timestamp: new Date().toISOString(),
        message: { role: 'assistant', content: text },
      });
    }
  });

  if (displayMessages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#8a8a8a]">
        <div className="w-12 h-12 rounded-full bg-[#2e2e2e] flex items-center justify-center">
          <span className="text-2xl">Q</span>
        </div>
        <div className="text-center">
          <div className="text-sm font-medium text-[#e8e6e3]">
            {activeSession?.title ?? 'New Session'}
          </div>
          <div className="text-xs mt-1">
            {activeSession?.cwd ?? 'Select a project to get started'}
          </div>
        </div>
        <div className="text-xs text-center max-w-xs">
          Ask me anything — I can read files, run commands, write code, and
          more.
        </div>
      </div>
    );
  }

  return (
    <PlatformProvider
      value={{
        platform: 'web',
        postMessage: () => {},
        onMessage: () => () => {},
      }}
    >
      <ChatViewerComp
        messages={displayMessages}
        theme="dark"
        autoScroll={true}
        className="h-full"
      />
    </PlatformProvider>
  );
};
