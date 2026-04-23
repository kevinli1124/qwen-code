/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef, type FC } from 'react';

export interface MenuItem {
  /** Primary identifier, e.g. command name ("help") or file path. */
  value: string;
  /** Shown as the main label. */
  label: string;
  /** Secondary description shown dim to the right / below. */
  description?: string;
  /** Optional small badge (e.g. "dir" for @-file directories). */
  badge?: string;
}

interface CommandMenuProps {
  items: MenuItem[];
  activeIndex: number;
  onSelect: (item: MenuItem) => void;
  onHoverIndex: (index: number) => void;
  emptyLabel?: string;
}

/**
 * Dropdown used for both `/` slash-command autocomplete and `@` file
 * autocomplete in the InputBar. Stateless — the host owns the active
 * index and handles keyboard nav via the textarea onKeyDown.
 */
export const CommandMenu: FC<CommandMenuProps> = ({
  items,
  activeIndex,
  onSelect,
  onHoverIndex,
  emptyLabel,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll the active item into view as the user navigates with arrow keys.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLDivElement>(
      `[data-idx="${activeIndex}"]`,
    );
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (items.length === 0) {
    return (
      <div className="bg-[#242424] border border-[#2e2e2e] rounded-lg shadow-lg px-3 py-2 text-xs text-[#8a8a8a]">
        {emptyLabel ?? 'No matches'}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="bg-[#242424] border border-[#2e2e2e] rounded-lg shadow-lg max-h-[280px] overflow-y-auto"
    >
      {items.map((item, idx) => {
        const isActive = idx === activeIndex;
        return (
          <div
            key={`${item.value}-${idx}`}
            data-idx={idx}
            onMouseEnter={() => onHoverIndex(idx)}
            onMouseDown={(e) => {
              // onMouseDown not onClick, so textarea doesn't blur first.
              e.preventDefault();
              onSelect(item);
            }}
            className={[
              'px-3 py-1.5 flex items-center gap-2 cursor-pointer',
              isActive ? 'bg-[#3e3e3e]' : 'hover:bg-[#2e2e2e]',
            ].join(' ')}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-[#e8e6e3] truncate font-mono">
                  {item.label}
                </span>
                {item.badge && (
                  <span className="px-1 py-0.5 text-[9px] rounded bg-[#3e3e3e] text-[#8a8a8a] uppercase tracking-wide">
                    {item.badge}
                  </span>
                )}
              </div>
              {item.description && (
                <div className="text-[11px] text-[#8a8a8a] truncate">
                  {item.description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
