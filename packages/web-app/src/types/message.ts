export type MessageRole = 'user' | 'assistant' | 'thinking';
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface FileOperationEntry {
  type: 'read' | 'write' | 'edit';
  path: string;
  content?: string;
  diff?: string;
  timestamp: string;
  callId: string;
}

export interface ToolCallEntry {
  callId: string;
  toolName: string;
  kind: string;
  title?: string;
  status: ToolCallStatus;
  args?: Record<string, unknown>;
  output?: string;
  durationMs?: number;
  locations?: Array<{ path: string; line?: number }>;
  rawInput?: Record<string, unknown>;
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  suggestions: Array<{
    type: 'allow' | 'deny';
    label: string;
    description?: string;
  }> | null;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export type StreamEvent =
  | { type: 'system'; data: Record<string, unknown> }
  | { type: 'assistant'; uuid: string; content: string; model: string }
  | { type: 'stream_text'; uuid: string; delta: string }
  | { type: 'thinking'; uuid: string; content: string }
  | {
      type: 'tool_start';
      callId: string;
      toolName: string;
      args: Record<string, unknown>;
      agentId: string;
    }
  | {
      type: 'tool_complete';
      callId: string;
      toolName: string;
      success: boolean;
      durationMs: number;
      error?: string;
    }
  | { type: 'tool_output_chunk'; callId: string; chunk: unknown }
  | {
      type: 'agent_spawn';
      subagentId: string;
      parentAgentId: string;
      parentToolCallId: string;
      subagentType: string;
    }
  | { type: 'permission_request'; request: PermissionRequest }
  | { type: 'result'; success: boolean; usage?: TokenUsage; error?: string }
  | { type: 'error'; message: string };
