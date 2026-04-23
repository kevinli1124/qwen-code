/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItemCompression } from '../types.js';
import { MessageType } from '../types.js';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { CompressionStatus } from '@qwen-code/qwen-code-core';

// Produce a user-facing message for the compression result. Core returns
// the inflated token count when compression was rejected (because the
// summary would add more tokens than it saves), so "Context compressed
// (20037 -> 20580)" was technically informative but read like a bug.
// Branch on compressionStatus to explain what actually happened.
function compressionMessage(result: {
  originalTokenCount: number;
  newTokenCount: number;
  compressionStatus: CompressionStatus;
}): string {
  const { originalTokenCount, newTokenCount, compressionStatus } = result;
  switch (compressionStatus) {
    case CompressionStatus.COMPRESSED:
      return `Context compressed (${originalTokenCount} → ${newTokenCount}).`;
    case CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT:
      return `Compression skipped — the summary would use ${newTokenCount} tokens vs. the current ${originalTokenCount}, so the context was left unchanged. This is normal for short conversations.`;
    case CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY:
      return `Compression skipped — the model returned an empty summary. Context unchanged (${originalTokenCount} tokens).`;
    case CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR:
      return `Compression skipped — token count unavailable. Context unchanged (${originalTokenCount} tokens).`;
    case CompressionStatus.NOOP:
      return `No compression needed — context is already small (${originalTokenCount} tokens).`;
    default:
      return `Context compression: ${originalTokenCount} → ${newTokenCount}.`;
  }
}

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize'],
  get description() {
    return t('Compresses the context by replacing it with a summary.');
  },
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const { ui } = context;
    const executionMode = context.executionMode ?? 'interactive';
    const abortSignal = context.abortSignal;

    if (executionMode === 'interactive' && ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: t('Already compressing, wait for previous request to complete'),
        },
        Date.now(),
      );
      return;
    }

    const pendingMessage: HistoryItemCompression = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        originalTokenCount: null,
        newTokenCount: null,
        compressionStatus: null,
      },
    };

    const config = context.services.config;
    const geminiClient = config?.getGeminiClient();
    if (!config || !geminiClient) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Config not loaded.'),
      };
    }

    const doCompress = async () => {
      const promptId = `compress-${Date.now()}`;
      return await geminiClient.tryCompressChat(promptId, true);
    };

    if (executionMode === 'acp') {
      const messages = async function* () {
        try {
          yield {
            messageType: 'info' as const,
            content: 'Compressing context...',
          };
          const compressed = await doCompress();
          if (!compressed) {
            yield {
              messageType: 'error' as const,
              content: t('Failed to compress chat history.'),
            };
            return;
          }
          yield {
            messageType: 'info' as const,
            content: compressionMessage(compressed),
          };
        } catch (e) {
          yield {
            messageType: 'error' as const,
            content: t('Failed to compress chat history: {{error}}', {
              error: e instanceof Error ? e.message : String(e),
            }),
          };
        }
      };

      return { type: 'stream_messages', messages: messages() };
    }

    try {
      if (executionMode === 'interactive') {
        ui.setPendingItem(pendingMessage);
      }

      const compressed = await doCompress();

      if (abortSignal?.aborted) {
        return;
      }

      if (!compressed) {
        if (executionMode === 'interactive') {
          ui.addItem(
            {
              type: MessageType.ERROR,
              text: t('Failed to compress chat history.'),
            },
            Date.now(),
          );
          return;
        }

        return {
          type: 'message',
          messageType: 'error',
          content: t('Failed to compress chat history.'),
        };
      }

      if (executionMode === 'interactive') {
        ui.addItem(
          {
            type: MessageType.COMPRESSION,
            compression: {
              isPending: false,
              originalTokenCount: compressed.originalTokenCount,
              newTokenCount: compressed.newTokenCount,
              compressionStatus: compressed.compressionStatus,
            },
          } as HistoryItemCompression,
          Date.now(),
        );
        return;
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `Context compressed (${compressed.originalTokenCount} -> ${compressed.newTokenCount}).`,
      };
    } catch (e) {
      // If cancelled via ESC, don't show error — cancelSlashCommand already handled UI
      if (abortSignal?.aborted) {
        return;
      }
      if (executionMode === 'interactive') {
        ui.addItem(
          {
            type: MessageType.ERROR,
            text: t('Failed to compress chat history: {{error}}', {
              error: e instanceof Error ? e.message : String(e),
            }),
          },
          Date.now(),
        );
        return;
      }

      return {
        type: 'message',
        messageType: 'error',
        content: t('Failed to compress chat history: {{error}}', {
          error: e instanceof Error ? e.message : String(e),
        }),
      };
    } finally {
      if (executionMode === 'interactive') {
        ui.setPendingItem(null);
      }
    }
  },
};
