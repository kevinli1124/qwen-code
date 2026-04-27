/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared layout components for tool call UI
 * Platform-agnostic version using webui components
 */

import type { FC } from 'react';
import { useState } from 'react';
import { FileLink } from '../../layout/FileLink.js';
import { ChevronIcon } from '../../icons/index.js';
import './LayoutComponents.css';

/**
 * Props for ToolCallContainer
 */
export interface ToolCallContainerProps {
  /** Operation label (e.g., "Read", "Write", "Search") */
  label: string;
  /** Status for bullet color: 'success' | 'error' | 'warning' | 'loading' | 'default' */
  status?: 'success' | 'error' | 'warning' | 'loading' | 'default';
  /** Main content to display (optional - some tool calls only show title) */
  children?: React.ReactNode;
  /** Tool call ID for debugging */
  toolCallId?: string;
  /** Optional trailing content rendered next to label (e.g., clickable filename) */
  labelSuffix?: React.ReactNode;
  /** Optional custom class name */
  className?: string;
  /** Whether this is the first item in an AI response sequence (for timeline) */
  isFirst?: boolean;
  /** Whether this is the last item in an AI response sequence (for timeline) */
  isLast?: boolean;
  /**
   * When true, render a chevron toggle next to the label so the user can
   * expand/collapse the body — matching the ThinkingMessage collapse UX.
   * Defaults to false to avoid changing layout of tool calls that don't
   * want it. Initial state: expanded while status is 'loading', else
   * collapsed (common UX: live progress visible, completed calls tucked).
   */
  collapsible?: boolean;
  /** Duration of the tool call in milliseconds, shown after completion */
  durationMs?: number;
}

/**
 * ToolCallContainer - Main container for tool call displays
 * Features timeline connector line and status bullet
 */
export const ToolCallContainer: FC<ToolCallContainerProps> = ({
  label,
  status = 'success',
  children,
  toolCallId: _toolCallId,
  labelSuffix,
  className: _className,
  isFirst = false,
  isLast = false,
  // Default true — users asked for thinking-style collapsibility across
  // tool calls. The chevron only shows when there is actual body content
  // (see showToggle below), so title-only cards stay unaffected.
  collapsible = true,
  durationMs,
}) => {
  const [expanded, setExpanded] = useState(status === 'loading');
  const showToggle = collapsible && !!children;
  const showDuration =
    durationMs != null && durationMs > 0 && status !== 'loading';
  const durationLabel = showDuration
    ? durationMs < 1000
      ? `${durationMs}ms`
      : `${(durationMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div
      className={`qwen-message message-item ${_className || ''} relative pl-[30px] py-2 select-text toolcall-container toolcall-status-${status}`}
      data-first={isFirst}
      data-last={isLast}
    >
      <div className="toolcall-content-wrapper flex flex-col min-w-0 max-w-full">
        <div className="flex items-baseline gap-1.5 relative min-w-0">
          {showToggle ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-baseline gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <span className="text-[14px] leading-none font-bold text-[var(--app-primary-foreground)]">
                {label}
              </span>
              <span className="text-[11px] text-[var(--app-secondary-foreground)]">
                {labelSuffix}
              </span>
              {durationLabel && (
                <span className="text-xs text-[#555] ml-1">
                  {durationLabel}
                </span>
              )}
              <ChevronIcon
                size={10}
                direction={expanded ? 'up' : 'down'}
                className="opacity-60"
              />
            </button>
          ) : (
            <>
              <span className="text-[14px] leading-none font-bold text-[var(--app-primary-foreground)]">
                {label}
              </span>
              <span className="text-[11px] text-[var(--app-secondary-foreground)]">
                {labelSuffix}
              </span>
              {durationLabel && (
                <span className="text-xs text-[#555] ml-1">
                  {durationLabel}
                </span>
              )}
            </>
          )}
        </div>
        {children && (!showToggle || expanded) && (
          <div className="text-[var(--app-secondary-foreground)]">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Props for ToolCallCard
 */
interface ToolCallCardProps {
  icon: string;
  children: React.ReactNode;
}

/**
 * ToolCallCard - Legacy card wrapper for complex layouts like diffs
 */
export const ToolCallCard: FC<ToolCallCardProps> = ({
  icon: _icon,
  children,
}) => (
  <div className="grid grid-cols-[auto_1fr] gap-medium bg-[var(--app-input-background)] border border-[var(--app-input-border)] rounded-medium p-large my-medium items-start animate-[fadeIn_0.2s_ease-in] toolcall-card">
    <div className="flex flex-col gap-medium min-w-0">{children}</div>
  </div>
);

/**
 * Props for ToolCallRow
 */
interface ToolCallRowProps {
  label: string;
  children: React.ReactNode;
}

/**
 * ToolCallRow - A single row in the tool call grid (legacy - for complex layouts)
 */
export const ToolCallRow: FC<ToolCallRowProps> = ({ label, children }) => (
  <div className="grid grid-cols-[80px_1fr] gap-medium min-w-0">
    <div className="text-xs text-[var(--app-secondary-foreground)] font-medium pt-[2px]">
      {label}
    </div>
    <div className="text-[var(--app-primary-foreground)] min-w-0 break-words">
      {children}
    </div>
  </div>
);

/**
 * Props for StatusIndicator
 */
interface StatusIndicatorProps {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  text: string;
}

/**
 * Get status color class for StatusIndicator
 */
const getStatusColorClass = (
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
): string => {
  switch (status) {
    case 'pending':
      return 'bg-[#ffc107]';
    case 'in_progress':
      return 'bg-[#2196f3]';
    case 'completed':
      return 'bg-[#4caf50]';
    case 'failed':
      return 'bg-[#f44336]';
    default:
      return 'bg-gray-500';
  }
};

/**
 * StatusIndicator - Status indicator with colored dot
 */
export const StatusIndicator: FC<StatusIndicatorProps> = ({ status, text }) => (
  <div className="inline-block font-medium relative" title={status}>
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${getStatusColorClass(status)}`}
    />
    {text}
  </div>
);

/**
 * Props for CodeBlock
 */
interface CodeBlockProps {
  children: string;
}

/**
 * CodeBlock - Code block for displaying formatted code or output
 */
export const CodeBlock: FC<CodeBlockProps> = ({ children }) => (
  <pre className="font-mono text-[var(--app-monospace-font-size)] bg-[var(--app-primary-background)] border border-[var(--app-input-border)] rounded-small p-medium overflow-x-auto mt-1 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
    {children}
  </pre>
);

/**
 * Props for LocationsList
 */
interface LocationsListProps {
  locations: Array<{
    path: string;
    line?: number | null;
  }>;
}

/**
 * LocationsList - List of file locations with clickable links
 */
export const LocationsList: FC<LocationsListProps> = ({ locations }) => (
  <div className="toolcall-locations-list flex flex-col gap-1 max-w-full">
    {locations.map((loc, idx) => (
      <FileLink key={idx} path={loc.path} line={loc.line} showFullPath={true} />
    ))}
  </div>
);
