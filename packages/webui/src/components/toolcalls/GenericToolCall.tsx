/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generic tool call component - handles all tool call types as fallback
 */

import type { FC, ReactNode } from 'react';
import {
  ToolCallContainer,
  ToolCallCard,
  ToolCallRow,
  LocationsList,
  safeTitle,
  groupContent,
} from './shared/index.js';
import type { BaseToolCallProps } from './shared/index.js';
import { getToolDisplayLabel } from './labelUtils.js';

/**
 * Generic tool call component that can display any tool call type
 * Used as fallback for unknown tool call kinds
 * Minimal display: show description and outcome
 */
export const GenericToolCall: FC<BaseToolCallProps> = ({
  toolCall,
  isFirst,
  isLast,
}) => {
  const { kind, title, content, locations, toolCallId, durationMs } = toolCall;
  const operationText = safeTitle(title);
  const displayLabel = getToolDisplayLabel({ kind, title });

  // Detect subagent tool calls: title starts with '[<type>]' pattern.
  // These are tagged in useSession.ts as `[subagentType] baseTitle`.
  const isSubagent = typeof title === 'string' && title.startsWith('[');

  // Group content by type
  const { textOutputs, errors } = groupContent(content);

  // Derive the inner content first, then optionally wrap for subagent indent.
  let inner: ReactNode = null;

  // Error case: show operation + error in card layout
  if (errors.length > 0) {
    inner = (
      <ToolCallCard icon="🔧">
        <ToolCallRow label={displayLabel}>
          <div>{operationText}</div>
        </ToolCallRow>
        <ToolCallRow label="Error">
          <div className="text-[#c74e39] font-medium">{errors.join('\n')}</div>
        </ToolCallRow>
      </ToolCallCard>
    );
  } else if (textOutputs.length > 0) {
    // Success with output: use card for long output, compact for short
    const output = textOutputs.join('\n');
    const isLong = output.length > 150;

    if (isLong) {
      const truncatedOutput =
        output.length > 300 ? output.substring(0, 300) + '...' : output;

      inner = (
        <ToolCallCard icon="🔧">
          <ToolCallRow label={displayLabel}>
            <div>{operationText}</div>
          </ToolCallRow>
          <ToolCallRow label="Output">
            <div className="whitespace-pre-wrap font-mono text-[13px] opacity-90">
              {truncatedOutput}
            </div>
          </ToolCallRow>
        </ToolCallCard>
      );
    } else {
      // Short output - compact format
      const statusFlag:
        | 'success'
        | 'error'
        | 'warning'
        | 'loading'
        | 'default' =
        toolCall.status === 'in_progress' || toolCall.status === 'pending'
          ? 'loading'
          : 'success';
      const hasArgs =
        toolCall.rawInput != null &&
        typeof toolCall.rawInput === 'object' &&
        Object.keys(toolCall.rawInput).length > 0;
      inner = (
        <ToolCallContainer
          label={displayLabel}
          status={statusFlag}
          toolCallId={toolCallId}
          isFirst={isFirst}
          isLast={isLast}
          collapsible
          durationMs={durationMs}
        >
          {operationText || output}
          {hasArgs && (
            <div className="mt-2">
              <div className="text-xs text-[#555] mb-1">Arguments</div>
              <pre className="text-xs text-[#8a8a8a] bg-[#111] rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {JSON.stringify(toolCall.rawInput, null, 2)}
              </pre>
            </div>
          )}
        </ToolCallContainer>
      );
    }
  } else if (locations && locations.length > 0) {
    // Success with files: show operation + file list in compact format
    const statusFlag: 'success' | 'error' | 'warning' | 'loading' | 'default' =
      toolCall.status === 'in_progress' || toolCall.status === 'pending'
        ? 'loading'
        : 'success';
    inner = (
      <ToolCallContainer
        label={displayLabel}
        status={statusFlag}
        toolCallId={toolCallId}
        isFirst={isFirst}
        isLast={isLast}
        collapsible
        durationMs={durationMs}
      >
        <LocationsList locations={locations} />
      </ToolCallContainer>
    );
  } else if (operationText) {
    // No output - show just the operation
    const statusFlag: 'success' | 'error' | 'warning' | 'loading' | 'default' =
      toolCall.status === 'in_progress' || toolCall.status === 'pending'
        ? 'loading'
        : 'success';
    const hasArgs =
      toolCall.rawInput != null &&
      typeof toolCall.rawInput === 'object' &&
      Object.keys(toolCall.rawInput).length > 0;
    inner = (
      <ToolCallContainer
        label={displayLabel}
        status={statusFlag}
        toolCallId={toolCallId}
        isFirst={isFirst}
        isLast={isLast}
        collapsible
        durationMs={durationMs}
      >
        {hasArgs ? (
          <div>
            {operationText && <div>{operationText}</div>}
            <div className="mt-2">
              <div className="text-xs text-[#555] mb-1">Arguments</div>
              <pre className="text-xs text-[#8a8a8a] bg-[#111] rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {JSON.stringify(toolCall.rawInput, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          operationText
        )}
      </ToolCallContainer>
    );
  }

  if (inner === null) return null;

  // Subagent tool calls get a left border + slight indent to indicate nesting.
  if (isSubagent) {
    return <div className="pl-3 border-l-2 border-[#3a3a5c]">{inner}</div>;
  }

  return <>{inner}</>;
};
