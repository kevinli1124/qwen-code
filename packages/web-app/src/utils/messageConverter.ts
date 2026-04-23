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

interface StoredAssistantData {
  uuid?: string;
  message?: {
    content?: Array<{ type: string; text?: string; thinking?: string }>;
  };
}

// Convert backend-persisted messages into the ChatMessageData shape the
// ChatViewer expects. User messages become a single user bubble; assistant
// messages may split into one thinking + one assistant bubble (thinking
// blocks are rendered as a separate message in the viewer).
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
