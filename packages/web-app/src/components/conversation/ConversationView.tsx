/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type FC,
  type ComponentType,
  type ForwardedRef,
} from 'react';
import { ChatViewer, PlatformProvider } from '@qwen-code/webui';
import '@qwen-code/webui/styles.css';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';
import type {
  ChatMessageData,
  ChatViewerProps,
  ChatViewerHandle,
} from '@qwen-code/webui';

// Workaround for React 18/19 @types version mismatch between webui and web-app.
// We also need to preserve the ref type so useRef<ChatViewerHandle> works.
const ChatViewerComp = ChatViewer as unknown as ComponentType<
  ChatViewerProps & { ref?: ForwardedRef<ChatViewerHandle> }
>;

interface ConversationViewProps {
  sessionId: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => Promise<void> | void;
}

const SCROLL_TOP_THRESHOLD_PX = 80;

export const ConversationView: FC<ConversationViewProps> = ({
  sessionId,
  hasMore,
  isLoadingMore,
  onLoadMore,
}) => {
  const messagesBySession = useMessageStore((s) => s.messagesBySession);
  const streamingText = useMessageStore((s) => s.streamingText);
  const activeSession = useSessionStore((s) =>
    s.sessions.find((sess) => sess.id === sessionId),
  );

  const chatRef = useRef<ChatViewerHandle>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const loadingTriggeredRef = useRef(false);

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

  // Scroll listener: trigger loadMore when user approaches the top.
  // Capture the current scrollHeight so we can restore scroll position
  // after older messages are prepended.
  useEffect(() => {
    const el = chatRef.current?.getScrollContainer();
    if (!el || !onLoadMore) return;
    const onScroll = () => {
      if (loadingTriggeredRef.current) return;
      if (!hasMore || isLoadingMore) return;
      if (el.scrollTop < SCROLL_TOP_THRESHOLD_PX) {
        loadingTriggeredRef.current = true;
        prevScrollHeightRef.current = el.scrollHeight;
        Promise.resolve(onLoadMore()).catch(() => {
          loadingTriggeredRef.current = false;
          prevScrollHeightRef.current = null;
        });
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onLoadMore, hasMore, isLoadingMore]);

  // After older messages render, adjust scrollTop so the user's viewport
  // stays anchored to the same message (instead of jumping to the top).
  useLayoutEffect(() => {
    if (prevScrollHeightRef.current === null) return;
    const el = chatRef.current?.getScrollContainer();
    if (el) {
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      el.scrollTop = diff;
    }
    prevScrollHeightRef.current = null;
    loadingTriggeredRef.current = false;
  }, [displayMessages.length]);

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
      <div className="relative h-full">
        {isLoadingMore && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-[#2e2e2e] text-xs text-[#8a8a8a] shadow">
            Loading older messages…
          </div>
        )}
        <ChatViewerComp
          ref={chatRef}
          messages={displayMessages}
          theme="dark"
          autoScroll={true}
          className="h-full"
        />
      </div>
    </PlatformProvider>
  );
};
