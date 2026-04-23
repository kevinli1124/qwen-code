import { useCallback } from 'react';
import type { ChatMessageData } from '@qwen-code/webui';
import { useMessageStore } from '../stores/messageStore';
import { useSessionStore } from '../stores/sessionStore';
import type { StreamEvent, ToolCallEntry } from '../types/message';

export function useSessionEvents(sessionId: string) {
  const {
    appendMessage,
    updateStreamingText,
    finalizeStreamingText,
    upsertToolCall,
    appendTerminal,
    setStreaming,
    setPendingPermission,
    setTokenUsage,
    setConnectionError,
  } = useMessageStore();
  const { updateSession } = useSessionStore();

  const handleEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case 'stream_text': {
          updateStreamingText(event.uuid, event.delta);
          break;
        }

        case 'assistant': {
          finalizeStreamingText(sessionId, event.uuid);
          break;
        }

        case 'thinking': {
          const msg: ChatMessageData = {
            uuid: event.uuid,
            type: 'assistant',
            timestamp: new Date().toISOString(),
            message: { role: 'thinking', content: event.content },
          };
          appendMessage(sessionId, msg);
          break;
        }

        case 'tool_start': {
          const kind = mapToolNameToKind(event.toolName);
          const title = formatToolTitle(event.toolName, event.args);
          const entry: ToolCallEntry = {
            callId: event.callId,
            toolName: event.toolName,
            kind,
            title,
            status: 'in_progress',
            args: event.args,
            rawInput: event.args,
          };
          upsertToolCall(sessionId, entry);
          // Add as ChatMessage for ChatViewer (webui uses toolCallId)
          const msg: ChatMessageData = {
            uuid: `tool-${event.callId}`,
            type: 'tool_call',
            timestamp: new Date().toISOString(),
            toolCall: {
              toolCallId: event.callId,
              kind,
              title,
              status: 'in_progress',
              rawInput: event.args,
              content: [],
            },
          };
          appendMessage(sessionId, msg);
          setStreaming(true);
          break;
        }

        case 'tool_complete': {
          const patch: ToolCallEntry = {
            callId: event.callId,
            toolName: event.toolName,
            kind: mapToolNameToKind(event.toolName),
            status: event.success ? 'completed' : 'failed',
            durationMs: event.durationMs,
          };
          upsertToolCall(sessionId, patch);
          break;
        }

        case 'tool_output_chunk': {
          if (typeof event.chunk === 'string') {
            appendTerminal(sessionId, event.chunk);
          }
          break;
        }

        case 'permission_request': {
          // Pause streaming animation while waiting for the user — the
          // child CLI has suspended the turn and no further SSE arrives
          // until respondPermission runs.
          setStreaming(false);
          setPendingPermission(event.request);
          break;
        }

        case 'agent_spawn': {
          // Render a sub-agent spawn as its own tool-call-shaped bubble
          // so the existing ChatViewer collapse/expand UI reuses.
          const callId = `agent-${event.subagentId}`;
          const subagentType = event.subagentType || 'subagent';
          const entry: ToolCallEntry = {
            callId,
            toolName: 'agent_spawn',
            kind: 'agent_spawn',
            title: `Spawning subagent: ${subagentType}`,
            status: 'in_progress',
            args: {
              subagentId: event.subagentId,
              parentAgentId: event.parentAgentId,
              parentToolCallId: event.parentToolCallId,
              subagentType,
            },
          };
          upsertToolCall(sessionId, entry);
          const msg: ChatMessageData = {
            uuid: `agent-spawn-${event.subagentId}`,
            type: 'tool_call',
            timestamp: new Date().toISOString(),
            toolCall: {
              toolCallId: callId,
              kind: 'agent_spawn',
              title: `Subagent: ${subagentType}`,
              status: 'in_progress',
              rawInput: entry.args,
              content: [],
            },
          };
          appendMessage(sessionId, msg);
          break;
        }

        case 'result': {
          setStreaming(false);
          if (event.usage) setTokenUsage(event.usage);
          updateSession(sessionId, {
            status: event.success ? 'completed' : 'error',
          });
          break;
        }

        case 'error': {
          setStreaming(false);
          setConnectionError(event.message);
          break;
        }

        default:
          break;
      }
    },
    [
      sessionId,
      appendMessage,
      updateStreamingText,
      finalizeStreamingText,
      upsertToolCall,
      appendTerminal,
      setStreaming,
      setPendingPermission,
      setTokenUsage,
      setConnectionError,
      updateSession,
    ],
  );

  return { handleEvent };
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
  return 'generic';
}

function formatToolTitle(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const path = args['path'] ?? args['file_path'] ?? args['filePath'];
  const cmd = args['command'] ?? args['cmd'];
  if (path) return `${toolName}: ${String(path)}`;
  if (cmd) return `${String(cmd).slice(0, 60)}`;
  return toolName;
}
