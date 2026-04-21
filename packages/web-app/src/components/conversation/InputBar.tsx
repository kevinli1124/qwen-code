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
import { FolderBrowser } from '../shared/FolderBrowser';
import { filesystemApi } from '../../api/filesystem';

interface InputBarProps {
  onSend: (text: string) => void;
  onStop: () => void;
}

export const InputBar: FC<InputBarProps> = ({ onSend, onStop }) => {
  const [text, setText] = useState('');
  const [showFilePicker, setShowFilePicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useMessageStore((s) => s.isStreaming);
  const tokenUsage = useMessageStore((s) => s.tokenUsage);

  const handleFileSelect = useCallback(async (filePath: string) => {
    setShowFilePicker(false);
    try {
      const { content } = await filesystemApi.readFile(filePath);
      const block = `<file path="${filePath}">\n${content}\n</file>\n\n`;
      setText((prev) => block + prev);
      textareaRef.current?.focus();
    } catch {
      // ignore read errors
    }
  }, []);

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
    <>
      <div className="border-t border-[#2e2e2e] bg-[#1a1a1a] px-4 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-3 bg-[#242424] border border-[#2e2e2e] rounded-lg px-3 py-2 focus-within:border-[#3e3e3e] transition-colors">
            {/* Attach file button */}
            <button
              onClick={() => setShowFilePicker(true)}
              disabled={isStreaming}
              className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[#8a8a8a] hover:text-[#e8e6e3] hover:bg-[#3e3e3e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Attach file"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path
                  d="M11.5 6.5L6 12a3.5 3.5 0 01-4.95-4.95l5.5-5.5a2 2 0 012.83 2.83L4 9.83A.5.5 0 013.3 9.1l4.5-4.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

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

      {/* File picker modal */}
      {showFilePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-[#2e2e2e] rounded-lg w-[560px] max-h-[70vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e2e2e]">
              <h2 className="text-sm font-semibold text-[#e8e6e3]">
                Attach File
              </h2>
              <button
                onClick={() => setShowFilePicker(false)}
                className="w-6 h-6 rounded hover:bg-[#2e2e2e] flex items-center justify-center text-[#8a8a8a] hover:text-[#e8e6e3]"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              <p className="text-xs text-[#8a8a8a] mb-3">
                Select a file to attach its content to your message.
              </p>
              <FolderBrowser
                mode="file"
                onSelect={() => {}}
                onFileSelect={handleFileSelect}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
