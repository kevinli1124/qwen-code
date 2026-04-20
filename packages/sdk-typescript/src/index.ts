export { query } from './query/createQuery.js';
export { AbortError, isAbortError } from './types/errors.js';
export { Query } from './query/Query.js';
export { SdkLogger } from './utils/logger.js';

// SDK MCP Server exports
export { tool } from './mcp/tool.js';
export { createSdkMcpServer } from './mcp/createSdkMcpServer.js';

export type { SdkMcpToolDefinition } from './mcp/tool.js';

export type {
  CreateSdkMcpServerOptions,
  McpSdkServerConfigWithInstance,
} from './mcp/createSdkMcpServer.js';

export type { QueryOptions } from './query/createQuery.js';
export type { LogLevel, LoggerConfig, ScopedLogger } from './utils/logger.js';

export type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  SDKUserMessage,
  SDKAssistantMessage,
  SDKSystemMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  SDKToolStartMessage,
  SDKToolCompleteMessage,
  SDKToolOutputChunkMessage,
  SDKAgentSpawnMessage,
  SDKMessage,
  SDKMcpServerConfig,
  ControlMessage,
  CLIControlRequest,
  CLIControlResponse,
  ControlCancelRequest,
  SubagentConfig,
  SubagentLevel,
  RunConfig,
} from './types/protocol.js';

export {
  isSDKUserMessage,
  isSDKAssistantMessage,
  isSDKSystemMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
  isSDKToolStartMessage,
  isSDKToolCompleteMessage,
  isSDKToolOutputChunkMessage,
  isSDKAgentSpawnMessage,
  isControlRequest,
  isControlResponse,
  isControlCancel,
} from './types/protocol.js';

export type {
  PermissionMode,
  CanUseTool,
  PermissionResult,
  QuerySystemPrompt,
  QuerySystemPromptPreset,
  CLIMcpServerConfig,
  McpServerConfig,
  McpOAuthConfig,
  McpAuthProviderType,
} from './types/types.js';

export { isSdkMcpServerConfig } from './types/types.js';
