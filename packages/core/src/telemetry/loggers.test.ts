/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenTelemetry and QwenLogger (Aliyun RUM) have been removed.
 * This file tests the remaining uiTelemetry behavior for the logger functions
 * that still emit local session metrics.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import {
  logToolCall,
  logApiError,
  logApiCancel,
  logApiResponse,
} from './loggers.js';
import {
  ToolCallEvent,
  ApiErrorEvent,
  ApiCancelEvent,
  ApiResponseEvent,
} from './types.js';
import * as uiTelemetry from './uiTelemetry.js';
import {
  EVENT_TOOL_CALL,
  EVENT_API_ERROR,
  EVENT_API_CANCEL,
  EVENT_API_RESPONSE,
} from './constants.js';
import type { CompletedToolCall } from '../index.js';
import { ToolConfirmationOutcome } from '../index.js';

const makeFakeConfig = (): Config => ({
    getSessionId: () => 'test-session-id',
    getChatRecordingService: () => undefined,
    getTelemetryLogPromptsEnabled: () => false,
  } as unknown as Config);

const makeFakeCompletedToolCall = (): CompletedToolCall =>
  ({
    request: {
      name: 'ReadFile',
      args: {},
      prompt_id: 'test-prompt-id',
      response_id: 'test-response-id',
    },
    response: {
      resultDisplay: 'file content',
    },
    outcome: ToolConfirmationOutcome.ProceedAlways,
    tool: undefined,
    durationMs: 100,
    status: 'success',
  }) as unknown as CompletedToolCall;

describe('loggers (uiTelemetry behavior)', () => {
  let addEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    addEventSpy = vi.spyOn(uiTelemetry.uiTelemetryService, 'addEvent');
  });

  describe('logToolCall', () => {
    it('emits a tool call event to uiTelemetryService', () => {
      const config = makeFakeConfig();
      const event = new ToolCallEvent(makeFakeCompletedToolCall());

      logToolCall(config, event);

      expect(addEventSpy).toHaveBeenCalledOnce();
      expect(addEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'event.name': EVENT_TOOL_CALL,
          function_name: 'ReadFile',
        }),
      );
    });
  });

  describe('logApiError', () => {
    it('emits an api error event to uiTelemetryService', () => {
      const config = makeFakeConfig();
      const event = new ApiErrorEvent({
        model: 'test-model',
        durationMs: 50,
        promptId: 'test-prompt-id',
        errorMessage: 'something went wrong',
      });

      logApiError(config, event);

      expect(addEventSpy).toHaveBeenCalledOnce();
      expect(addEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'event.name': EVENT_API_ERROR,
          model: 'test-model',
        }),
      );
    });
  });

  describe('logApiCancel', () => {
    it('emits an api cancel event to uiTelemetryService', () => {
      const config = makeFakeConfig();
      const event = new ApiCancelEvent('test-model', 'test-prompt-id');

      logApiCancel(config, event);

      expect(addEventSpy).toHaveBeenCalledOnce();
      expect(addEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'event.name': EVENT_API_CANCEL,
          model: 'test-model',
        }),
      );
    });
  });

  describe('logApiResponse', () => {
    it('emits an api response event to uiTelemetryService', () => {
      const config = makeFakeConfig();
      const event = new ApiResponseEvent(
        'response-id',
        'test-model',
        200,
        'test-prompt-id',
      );

      logApiResponse(config, event);

      expect(addEventSpy).toHaveBeenCalledOnce();
      expect(addEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'event.name': EVENT_API_RESPONSE,
          model: 'test-model',
        }),
      );
    });
  });
});
