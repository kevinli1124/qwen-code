/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  useState,
  useRef,
  useCallback,
  type FC,
  type KeyboardEvent,
} from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { TokenUsageDisplay } from '../shared/TokenUsage';

interface InputBarProps {
  onSend: (text: string) => void;
  onStop: () => void;
}

export const InputBar: FC<InputBarProps> = ({ onSend, onStop }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useMessageStore((s) => s.isStreaming);
  const tokenUsage = useMessageStore((s) => s.tokenUsage);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && isStreaming) {
      onStop();
    }
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isStreaming, onSend]);

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-[#2e2e2e] bg-[#1a1a1a] px-4 py-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-3 bg-[#242424] border border-[#2e2e2e] rounded-lg px-3 py-2 focus-within:border-[#3e3e3e] transition-colors">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={
              isStreaming
                ? 'Waiting for response...'
                : 'Ask anything... (Enter to send, Shift+Enter for newline)'
            }
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-[#e8e6e3] placeholder:text-[#8a8a8a] focus:outline-none leading-relaxed disabled:opacity-50 min-h-[24px] max-h-[200px]"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          />

          {/* Send / Stop button */}
          <button
            onClick={isStreaming ? onStop : handleSend}
            disabled={!isStreaming && !text.trim()}
            className={[
              'flex-shrink-0 w-7 h-7 rounded flex items-center justify-center transition-colors',
              isStreaming
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : text.trim()
                  ? 'bg-accent text-white hover:bg-accent-hover'
                  : 'bg-[#2e2e2e] text-[#8a8a8a] cursor-not-allowed',
            ].join(' ')}
            title={isStreaming ? 'Stop (Esc)' : 'Send (Enter)'}
          >
            {isStreaming ? (
              // Stop icon
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect
                  x="1"
                  y="1"
                  width="8"
                  height="8"
                  rx="1"
                  fill="currentColor"
                />
              </svg>
            ) : (
              // Send icon
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 11L11 6 1 1v4l7 1-7 1v4z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        {/* Footer: token usage */}
        <div className="flex items-center justify-between px-1">
          <div className="text-[10px] text-[#8a8a8a]">
            Enter to send · Shift+Enter for newline
            {isStreaming && ' · Esc to stop'}
          </div>
          {tokenUsage && <TokenUsageDisplay usage={tokenUsage} />}
        </div>
      </div>
    </div>
  );
};
