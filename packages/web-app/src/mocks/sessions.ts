import type { SessionSummary } from '../types/session';

export const MOCK_SESSIONS: SessionSummary[] = [
  {
    id: 'sess-001',
    title: 'Implement Web UI Components',
    cwd: 'D:/SideProject/Qwen-Code',
    status: 'completed',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    model: 'qwen3.5-plus',
  },
  {
    id: 'sess-002',
    title: 'Fix SSE streaming bug in nonInteractiveCli',
    cwd: 'D:/SideProject/Qwen-Code',
    status: 'completed',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    model: 'qwen3.5-plus',
  },
  {
    id: 'sess-003',
    title: 'Add Telegram channel adapter',
    cwd: 'D:/SideProject/Qwen-Code/packages/channels',
    status: 'completed',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
    ).toISOString(),
    model: 'qwen3.5-plus',
  },
];
