export type SessionStatus = 'idle' | 'running' | 'completed' | 'error';

export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  model?: string;
}

export interface SessionDetail extends SessionSummary {
  messages: StoredMessage[];
}

export interface StoredMessage {
  uuid: string;
  type: 'user' | 'assistant' | 'system' | 'tool_call';
  timestamp: string;
  content?: string;
  role?: string;
  toolCall?: import('./message').ToolCallEntry;
}
