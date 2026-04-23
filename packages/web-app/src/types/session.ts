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
  hasMore?: boolean;
  total?: number;
}

// Wire-format message as persisted by the backend PersistenceManager.
// `data` is the raw stream-json payload (user = {message:{role,content}},
// assistant = {uuid, message:{content:[text|thinking|...blocks]}}).
export interface StoredMessage {
  type: string;
  timestamp: string;
  data: unknown;
}
