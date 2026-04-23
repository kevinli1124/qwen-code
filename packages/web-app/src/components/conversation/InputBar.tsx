/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type FC,
  type KeyboardEvent,
} from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useSessionStore } from '../../stores/sessionStore';
import { TokenUsageDisplay } from '../shared/TokenUsage';
import { FolderBrowser } from '../shared/FolderBrowser';
import { filesystemApi } from '../../api/filesystem';
import { commandsApi, type CommandMetadata } from '../../api/commands';
import { CommandMenu, type MenuItem } from './CommandMenu';

interface InputBarProps {
  onSend: (text: string) => void;
  onStop: () => void;
}

type MenuMode = 'slash' | 'at' | null;

interface ActiveTrigger {
  mode: MenuMode;
  /** Character index in text where the trigger (/ or @) starts. */
  startIndex: number;
  /** The text typed after the trigger, e.g. 'he' for "/he". */
  query: string;
}

/**
 * Detect whether the caret is inside a slash-command or @-mention trigger.
 * Slash: only when '/' is the first char of the text (first-line first-char,
 * matching the CLI's isSlashCommand check).
 * At: anywhere, when '@' is preceded by start-of-line or whitespace.
 */
function detectTrigger(text: string, caret: number): ActiveTrigger | null {
  if (text.startsWith('/') && caret > 0) {
    const upToCaret = text.slice(0, caret);
    // Only trigger while the first line still begins with / and has no spaces yet
    const firstLine = upToCaret.split('\n')[0];
    if (firstLine.startsWith('/') && !firstLine.includes(' ')) {
      return { mode: 'slash', startIndex: 0, query: firstLine.slice(1) };
    }
  }
  // Look backward from caret for an @ bounded by whitespace or start.
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '@') {
      if (i === 0 || /\s/.test(text[i - 1] ?? '')) {
        return { mode: 'at', startIndex: i, query: text.slice(i + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(ch ?? '')) break;
  }
  return null;
}

const MAX_MENU_RESULTS = 12;

export const InputBar: FC<InputBarProps> = ({ onSend, onStop }) => {
  const [text, setText] = useState('');
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [commands, setCommands] = useState<CommandMetadata[]>([]);
  const [fileMatches, setFileMatches] = useState<
    Array<{ path: string; isDir: boolean }>
  >([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [trigger, setTrigger] = useState<ActiveTrigger | null>(null);
  // Prompt history: local array of user-sent prompts for Arrow-up recall.
  // historyIndex: -1 = not navigating, 0 = most recent, larger = older.
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileLookupSeqRef = useRef(0);
  const isStreaming = useMessageStore((s) => s.isStreaming);
  const tokenUsage = useMessageStore((s) => s.tokenUsage);
  const sessionTokens = useMessageStore((s) => s.sessionTokens);
  const activeSession = useSessionStore((s) =>
    s.sessions.find((sess) => sess.id === s.activeSessionId),
  );
  const cwd = activeSession?.cwd ?? '.';

  // Load slash-command metadata + discoverable skills once on mount. The
  // lang param comes from the browser so descriptions come back in the
  // user's language (zh-TW / zh / en currently supported server-side).
  useEffect(() => {
    const lang = navigator.language;
    Promise.all([
      commandsApi.list(lang).catch(() => [] as CommandMetadata[]),
      commandsApi.listSkills().catch(() => []),
    ]).then(([cmds, skills]) => {
      const merged: CommandMetadata[] = [
        ...cmds,
        ...skills.map((s) => ({
          name: s.name,
          description: s.description || `skill (${s.scope})`,
          category: 'skill',
          runner: 'cli' as const,
        })),
      ];
      setCommands(merged);
    });
  }, []);

  // When the @ trigger's query changes, fetch matching files from the
  // session's cwd. Debounce-ish via a monotonic seq: drop stale responses.
  useEffect(() => {
    if (trigger?.mode !== 'at') {
      setFileMatches([]);
      return;
    }
    const seq = ++fileLookupSeqRef.current;
    const q = trigger.query;
    // If the user has typed a path segment, browse that subdir; else cwd.
    const lastSlash = q.lastIndexOf('/');
    const subdir = lastSlash >= 0 ? q.slice(0, lastSlash) : '';
    const fragment = lastSlash >= 0 ? q.slice(lastSlash + 1) : q;
    const browsePath =
      subdir.length > 0 ? `${cwd.replace(/[/\\]+$/, '')}/${subdir}` : cwd;
    filesystemApi
      .browse(browsePath)
      .then((result) => {
        if (seq !== fileLookupSeqRef.current) return;
        const lower = fragment.toLowerCase();
        const dirs = result.dirs
          .filter((d) => d.toLowerCase().includes(lower))
          .map((d) => ({
            path: subdir ? `${subdir}/${d}` : d,
            isDir: true,
          }));
        const files = result.files
          .filter((f) => f.toLowerCase().includes(lower))
          .map((f) => ({
            path: subdir ? `${subdir}/${f}` : f,
            isDir: false,
          }));
        setFileMatches([...dirs, ...files].slice(0, 50));
      })
      .catch(() => {
        if (seq !== fileLookupSeqRef.current) return;
        setFileMatches([]);
      });
  }, [trigger, cwd]);

  // Compute menu items based on current trigger mode.
  const menuItems = useMemo<MenuItem[]>(() => {
    if (!trigger) return [];
    if (trigger.mode === 'slash') {
      const q = trigger.query.toLowerCase();
      const filtered = commands.filter(
        (c) =>
          c.name.toLowerCase().startsWith(q) ||
          c.name.toLowerCase().includes(q),
      );
      return filtered.slice(0, MAX_MENU_RESULTS).map((c) => ({
        value: c.name,
        label: `/${c.name}`,
        description: c.description,
        badge: c.category,
      }));
    }
    return fileMatches.slice(0, MAX_MENU_RESULTS).map((f) => ({
      value: f.path,
      label: `@${f.path}${f.isDir ? '/' : ''}`,
      description: f.isDir ? 'directory' : undefined,
      badge: f.isDir ? 'dir' : undefined,
    }));
  }, [trigger, commands, fileMatches]);

  // Clamp activeIndex when menu items change so arrow-nav stays in range.
  useEffect(() => {
    if (activeIndex >= menuItems.length) setActiveIndex(0);
  }, [menuItems.length, activeIndex]);

  const recomputeTrigger = useCallback((value: string, caret: number) => {
    setTrigger(detectTrigger(value, caret));
  }, []);

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

  const applyMenuSelection = useCallback(
    (item: MenuItem) => {
      if (!trigger || !textareaRef.current) return;
      const el = textareaRef.current;
      const endIndex = trigger.startIndex + 1 + trigger.query.length; // trigger char + query
      const insertion =
        trigger.mode === 'slash'
          ? `/${item.value}${item.value.includes(':') ? '' : ' '}`
          : `@${item.value}${item.value.endsWith('/') ? '' : ' '}`;
      const next =
        text.slice(0, trigger.startIndex) + insertion + text.slice(endIndex);
      setText(next);
      setTrigger(null);
      setActiveIndex(0);
      // Restore caret to just after inserted text.
      requestAnimationFrame(() => {
        const pos = trigger.startIndex + insertion.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [trigger, text],
  );

  const textareaIsEmpty = text.length === 0;

  const navigateHistory = useCallback(
    (direction: 'up' | 'down') => {
      if (history.length === 0) return;
      if (direction === 'up') {
        const nextIdx = historyIndex === -1 ? 0 : historyIndex + 1;
        if (nextIdx >= history.length) return;
        if (historyIndex === -1) draftRef.current = text;
        setHistoryIndex(nextIdx);
        setText(history[history.length - 1 - nextIdx] ?? '');
      } else {
        if (historyIndex === -1) return;
        const nextIdx = historyIndex - 1;
        if (nextIdx < 0) {
          setHistoryIndex(-1);
          setText(draftRef.current);
          draftRef.current = '';
        } else {
          setHistoryIndex(nextIdx);
          setText(history[history.length - 1 - nextIdx] ?? '');
        }
      }
    },
    [history, historyIndex, text],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Menu navigation takes priority when the menu is open.
    if (trigger && menuItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % menuItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const picked = menuItems[activeIndex];
        if (picked) applyMenuSelection(picked);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTrigger(null);
        return;
      }
    }

    // Prompt history recall (Arrow Up/Down) — only when not already
    // walking a multi-line text field; trigger on caret at start, or
    // when already navigating history.
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      const el = e.currentTarget;
      const caret = el.selectionStart ?? 0;
      if (textareaIsEmpty || historyIndex !== -1 || caret === 0) {
        e.preventDefault();
        navigateHistory('up');
        return;
      }
    }
    if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (historyIndex !== -1) {
        e.preventDefault();
        navigateHistory('down');
        return;
      }
    }

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
    if (!trimmed) return;
    // Sending mid-turn is allowed — the child CLI's stream-json reader
    // queues user messages and processes them after the current turn
    // (packages/core/src/nonInteractive/session.ts userMessageQueue).
    onSend(trimmed);
    setHistory((h) => {
      // Push to history unless identical to most recent entry.
      if (h[h.length - 1] === trimmed) return h;
      return [...h, trimmed].slice(-100);
    });
    setHistoryIndex(-1);
    draftRef.current = '';
    setText('');
    setTrigger(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend]);

  const handleChange = (value: string) => {
    setText(value);
    // Any manual edit cancels history navigation — the draft is lost
    // once the user diverges from a recalled entry.
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      draftRef.current = '';
    }
    const el = textareaRef.current;
    if (el) {
      recomputeTrigger(value, el.selectionStart ?? value.length);
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    recomputeTrigger(el.value, el.selectionStart ?? el.value.length);
  };

  return (
    <>
      <div className="border-t border-[#2e2e2e] bg-[#1a1a1a] px-4 py-3 relative">
        {/* Autocomplete menu — positioned above the input row. */}
        {trigger && (
          <div className="absolute left-4 right-4 bottom-full mb-1 z-20">
            <CommandMenu
              items={menuItems}
              activeIndex={activeIndex}
              onSelect={applyMenuSelection}
              onHoverIndex={setActiveIndex}
              emptyLabel={
                trigger.mode === 'slash'
                  ? 'No matching commands'
                  : 'No matching files in cwd'
              }
            />
          </div>
        )}

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

            {/* Textarea — always enabled; mid-turn typing is allowed and
                queues on the backend. Placeholder shifts when running. */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onKeyUp={handleInput}
              onClick={handleInput}
              onInput={handleInput}
              placeholder={
                isStreaming
                  ? 'Type a follow-up… (will queue after current turn)'
                  : 'Ask anything... ("/" for commands, "@" for files)'
              }
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-[#e8e6e3] placeholder:text-[#8a8a8a] focus:outline-none leading-relaxed min-h-[24px] max-h-[200px]"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            />

            {/* Stop button while running, plus separate Send */}
            {isStreaming && (
              <button
                onClick={onStop}
                className="flex-shrink-0 w-7 h-7 rounded flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                title="Stop current turn (Esc)"
              >
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
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className={[
                'flex-shrink-0 w-7 h-7 rounded flex items-center justify-center transition-colors',
                text.trim()
                  ? 'bg-accent text-white hover:bg-accent-hover'
                  : 'bg-[#2e2e2e] text-[#8a8a8a] cursor-not-allowed',
              ].join(' ')}
              title="Send (Enter)"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 11L11 6 1 1v4l7 1-7 1v4z" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* Footer: token usage */}
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] text-[#8a8a8a]">
              Enter to send · Shift+Enter for newline
              {isStreaming && ' · Esc to stop'}
            </div>
            {tokenUsage && (
              <TokenUsageDisplay
                usage={tokenUsage}
                sessionTotal={sessionTokens}
              />
            )}
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
