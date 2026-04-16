/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// QwenLogger (Aliyun RUM) and OpenTelemetry logging have been removed.
// uiTelemetry calls are preserved for local UI session metrics.

import type { Config } from '../config/config.js';
import { isInternalPromptId } from '../utils/internalPromptIds.js';
import {
  EVENT_API_ERROR,
  EVENT_API_CANCEL,
  EVENT_API_REQUEST,
  EVENT_API_RESPONSE,
  EVENT_TOOL_CALL,
  EVENT_USER_FEEDBACK,
} from './constants.js';
import type {
  ApiErrorEvent,
  ApiCancelEvent,
  ApiRequestEvent,
  ApiResponseEvent,
  FileOperationEvent,
  IdeConnectionEvent,
  StartSessionEvent,
  ToolCallEvent,
  UserPromptEvent,
  UserRetryEvent,
  FlashFallbackEvent,
  NextSpeakerCheckEvent,
  LoopDetectedEvent,
  LoopDetectionDisabledEvent,
  SlashCommandEvent,
  ConversationFinishedEvent,
  KittySequenceOverflowEvent,
  ChatCompressionEvent,
  ContentRetryEvent,
  ContentRetryFailureEvent,
  RipgrepFallbackEvent,
  ToolOutputTruncatedEvent,
  ExtensionDisableEvent,
  ExtensionEnableEvent,
  ExtensionUninstallEvent,
  ExtensionUpdateEvent,
  ExtensionInstallEvent,
  ModelSlashCommandEvent,
  SubagentExecutionEvent,
  MalformedJsonResponseEvent,
  InvalidChunkEvent,
  AuthEvent,
  SkillLaunchEvent,
  UserFeedbackEvent,
  ArenaSessionStartedEvent,
  ArenaAgentCompletedEvent,
  ArenaSessionEndedEvent,
  PromptSuggestionEvent,
  SpeculationEvent,
} from './types.js';
import type { HookCallEvent } from './types.js';
import type { UiEvent } from './uiTelemetry.js';
import { uiTelemetryService } from './uiTelemetry.js';

 
export function logStartSession(
  _config: Config,
  _event: StartSessionEvent,
): void {}

 
export function logUserPrompt(_config: Config, _event: UserPromptEvent): void {}

 
export function logUserRetry(_config: Config, _event: UserRetryEvent): void {}

export function logToolCall(config: Config, event: ToolCallEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_TOOL_CALL,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  if (!isInternalPromptId(event.prompt_id)) {
    config.getChatRecordingService()?.recordUiTelemetryEvent(uiEvent);
  }
}

 
export function logToolOutputTruncated(
  _config: Config,
  _event: ToolOutputTruncatedEvent,
): void {}

 
export function logFileOperation(
  _config: Config,
  _event: FileOperationEvent,
): void {}

 
export function logApiRequest(_config: Config, _event: ApiRequestEvent): void {
  // Suppress unused-var for destructured event.name constant
  void EVENT_API_REQUEST;
}

 
export function logFlashFallback(
  _config: Config,
  _event: FlashFallbackEvent,
): void {}

 
export function logRipgrepFallback(
  _config: Config,
  _event: RipgrepFallbackEvent,
): void {}

export function logApiError(config: Config, event: ApiErrorEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_API_ERROR,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  if (!isInternalPromptId(event.prompt_id)) {
    config.getChatRecordingService()?.recordUiTelemetryEvent(uiEvent);
  }
}

export function logApiCancel(config: Config, event: ApiCancelEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_API_CANCEL,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
}

export function logApiResponse(config: Config, event: ApiResponseEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_API_RESPONSE,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  if (!isInternalPromptId(event.prompt_id)) {
    config.getChatRecordingService()?.recordUiTelemetryEvent(uiEvent);
  }
}

 
export function logLoopDetected(
  _config: Config,
  _event: LoopDetectedEvent,
): void {}

 
export function logLoopDetectionDisabled(
  _config: Config,
  _event: LoopDetectionDisabledEvent,
): void {}

 
export function logNextSpeakerCheck(
  _config: Config,
  _event: NextSpeakerCheckEvent,
): void {}

 
export function logSlashCommand(
  _config: Config,
  _event: SlashCommandEvent,
): void {}

 
export function logIdeConnection(
  _config: Config,
  _event: IdeConnectionEvent,
): void {}

 
export function logConversationFinishedEvent(
  _config: Config,
  _event: ConversationFinishedEvent,
): void {}

 
export function logChatCompression(
  _config: Config,
  _event: ChatCompressionEvent,
): void {}

 
export function logKittySequenceOverflow(
  _config: Config,
  _event: KittySequenceOverflowEvent,
): void {}

 
export function logMalformedJsonResponse(
  _config: Config,
  _event: MalformedJsonResponseEvent,
): void {}

 
export function logInvalidChunk(
  _config: Config,
  _event: InvalidChunkEvent,
): void {}

 
export function logContentRetry(
  _config: Config,
  _event: ContentRetryEvent,
): void {}

 
export function logContentRetryFailure(
  _config: Config,
  _event: ContentRetryFailureEvent,
): void {}

 
export function logSubagentExecution(
  _config: Config,
  _event: SubagentExecutionEvent,
): void {}

 
export function logModelSlashCommand(
  _config: Config,
  _event: ModelSlashCommandEvent,
): void {}

 
export function logHookCall(_config: Config, _event: HookCallEvent): void {}

 
export function logExtensionInstallEvent(
  _config: Config,
  _event: ExtensionInstallEvent,
): void {}

 
export function logExtensionUninstall(
  _config: Config,
  _event: ExtensionUninstallEvent,
): void {}

export async function logExtensionUpdateEvent(
   
  _config: Config,
   
  _event: ExtensionUpdateEvent,
): Promise<void> {}

 
export function logExtensionEnable(
  _config: Config,
  _event: ExtensionEnableEvent,
): void {}

 
export function logExtensionDisable(
  _config: Config,
  _event: ExtensionDisableEvent,
): void {}

 
export function logAuth(_config: Config, _event: AuthEvent): void {}

 
export function logSkillLaunch(
  _config: Config,
  _event: SkillLaunchEvent,
): void {}

export function logUserFeedback(
  config: Config,
  event: UserFeedbackEvent,
): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_USER_FEEDBACK,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  config.getChatRecordingService()?.recordUiTelemetryEvent(uiEvent);
}

 
export function logArenaSessionStarted(
  _config: Config,
  _event: ArenaSessionStartedEvent,
): void {}

 
export function logArenaAgentCompleted(
  _config: Config,
  _event: ArenaAgentCompletedEvent,
): void {}

 
export function logArenaSessionEnded(
  _config: Config,
  _event: ArenaSessionEndedEvent,
): void {}

 
export function logPromptSuggestion(
  _config: Config,
  _event: PromptSuggestionEvent,
): void {}

 
export function logSpeculation(
  _config: Config,
  _event: SpeculationEvent,
): void {}
