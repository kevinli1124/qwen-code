/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatMessageData } from '@qwen-code/webui';
import type { StoredMessage } from '../types/session';

interface StoredUserData {
  message?: { role?: string; content?: string };
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface StoredAssistantData {
  uuid?: string;
  message?: {
    content?: ContentBlock[];
  };
}

function mapToolNameToKind(toolName: string): string {
  const n = toolName.toLowerCase();
  if (n.includes('read') || n.includes('glob') || n.includes('list'))
    return 'read';
  if (n.includes('write') || n.includes('create')) return 'write';
  if (n.includes('edit') || n.includes('patch')) return 'edit';
  if (n.includes('bash') || n.includes('shell') || n.includes('execute'))
    return 'execute';
  if (n.includes('search') || n.includes('grep')) return 'search';
  if (n.includes('todo') || n.includes('plan')) return 'updated_plan';
  if (n.includes('fetch') || n.includes('web')) return 'web_fetch';
  if (n.includes('agent')) return 'agent_spawn';
  return 'generic';
}

function formatToolTitle(
  toolName: string,
  args: Record<string, unknown> | undefined,
): string {
  if (!args) return toolName;
  const path = args['path'] ?? args['file_path'] ?? args['filePath'];
  const cmd = args['command'] ?? args['cmd'];
  if (path) return `${toolName}: ${String(path)}`;
  if (cmd) return `${String(cmd).slice(0, 60)}`;
  return toolName;
}

// Convert backend-persisted messages into the ChatMessageData shape the
// ChatViewer expects. User messages become a single user bubble; assistant
// messages may split into:
//   - one thinking bubble per thinking block
//   - one tool_call bubble per tool_use block (marked completed since we
//     don't persist tool_complete separately — the fact that the turn
//     was saved means it ran)
//   - one assistant bubble concatenating text blocks
export function convertStoredToChatMessages(
  stored: StoredMessage[],
): ChatMessageData[] {
  const out: ChatMessageData[] = [];
  for (const s of stored) {
    if (s.type === 'user') {
      const d = s.data as StoredUserData;
      out.push({
        uuid: `user-${s.timestamp}`,
        type: 'user',
        timestamp: s.timestamp,
        message: { role: 'user', content: d.message?.content ?? '' },
      });
    } else if (s.type === 'assistant') {
      const d = s.data as StoredAssistantData;
      const baseUuid = d.uuid ?? `asst-${s.timestamp}`;
      const blocks = d.message?.content ?? [];
      let text = '';
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]!;
        if (b.type === 'thinking') {
          out.push({
            uuid: `thinking-${baseUuid}-${i}`,
            type: 'assistant',
            timestamp: s.timestamp,
            message: { role: 'thinking', content: b.thinking ?? '' },
          });
        } else if (b.type === 'text') {
          text += b.text ?? '';
        } else if (b.type === 'tool_use') {
          const toolName = b.name ?? 'tool';
          const kind = mapToolNameToKind(toolName);
          out.push({
            uuid: `tool-${b.id ?? `${baseUuid}-${i}`}`,
            type: 'tool_call',
            timestamp: s.timestamp,
            toolCall: {
              toolCallId: b.id ?? `${baseUuid}-${i}`,
              kind,
              title: formatToolTitle(toolName, b.input),
              status: 'completed',
              rawInput: b.input ?? {},
              content: [],
            },
          });
        }
      }
      if (text) {
        out.push({
          uuid: baseUuid,
          type: 'assistant',
          timestamp: s.timestamp,
          message: { role: 'assistant', content: text },
        });
      }
    }
  }
  return out;
}
