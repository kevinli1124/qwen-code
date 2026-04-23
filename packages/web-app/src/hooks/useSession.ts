import { useCallback, useRef } from 'react';
import type { ChatMessageData } from '@qwen-code/webui';
import { useMessageStore } from '../stores/messageStore';
import { useSessionStore } from '../stores/sessionStore';
import type { StreamEvent, ToolCallEntry } from '../types/message';

export function useSessionEvents(sessionId: string) {
  // Track subagent metadata so tool calls emitted with a non-'main'
  // agentId can be labelled with the subagent's type (e.g. "code-reviewer").
  // Keyed by subagentId.
  const subagentTypesRef = useRef<Map<string, string>>(new Map());
  const {
    appendMessage,
    updateStreamingText,
    finalizeStreamingText,
    upsertToolCall,
    appendTerminal,
    addFileOp,
    setPlan,
    setStreaming,
    setPendingPermission,
    setPendingQuestion,
    setModelLimits,
    setTokenUsage,
    addSessionTokens,
    setConnectionError,
  } = useMessageStore();
  const { updateSession } = useSessionStore();

  const handleEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case 'system_init': {
          // Enriched by SessionManager with tokenLimits from core.
          if (event.data?.tokenLimits) {
            setModelLimits({
              input: event.data.tokenLimits.input,
              output: event.data.tokenLimits.output,
              model: event.data.model,
            });
          }
          break;
        }

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
          const baseTitle = formatToolTitle(event.toolName, event.args);
          // If this call came from a subagent, tag the title so the user
          // knows which subagent is acting. agentId === 'main' is the
          // top-level agent; anything else is a spawned subagent.
          const isSubagent = event.agentId && event.agentId !== 'main';
          const subagentType = isSubagent
            ? (subagentTypesRef.current.get(event.agentId) ?? 'subagent')
            : null;
          const title = subagentType
            ? `[${subagentType}] ${baseTitle}`
            : baseTitle;
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

          // Side-feed the right panels: Files for file-touching tools,
          // Plan for todo_write updates. Both panels read from their own
          // store slices, so the main message timeline is unaffected.
          const fileOpType = classifyFileOp(event.toolName);
          if (fileOpType) {
            const path =
              (event.args?.['file_path'] as string | undefined) ??
              (event.args?.['path'] as string | undefined) ??
              (event.args?.['filePath'] as string | undefined);
            if (path) {
              addFileOp(sessionId, {
                type: fileOpType,
                path,
                callId: event.callId,
                timestamp: new Date().toISOString(),
                content:
                  (event.args?.['content'] as string | undefined) ?? undefined,
                diff: formatDiff(event.args),
              });
            }
          }

          if (isTodoWriteTool(event.toolName)) {
            const planItems = parseTodosToPlanItems(event.args);
            if (planItems.length > 0) {
              setPlan(sessionId, planItems);
            }
          }

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

        case 'question_request': {
          // ask_user_question dialog. Suspends streaming exactly like a
          // permission prompt; resolved via /api/.../question/<reqId>.
          setStreaming(false);
          setPendingQuestion(event.request);
          break;
        }

        case 'agent_spawn': {
          const subagentType = event.subagentType || 'subagent';
          // Remember the subagent type so subsequent tool_start events
          // with this subagentId can be labelled (see tool_start above).
          subagentTypesRef.current.set(event.subagentId, subagentType);

          const callId = `agent-${event.subagentId}`;
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
          if (event.usage) {
            setTokenUsage(event.usage);
            addSessionTokens(event.usage);
          }
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
      addFileOp,
      setPlan,
      setStreaming,
      setPendingPermission,
      setPendingQuestion,
      setModelLimits,
      setTokenUsage,
      addSessionTokens,
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

// Classify whether a tool actually mutates / reads file content so the
// Files panel stays meaningful. glob / list_directory / grep don't
// "touch" files in the Files-panel sense.
function classifyFileOp(toolName: string): 'read' | 'write' | 'edit' | null {
  const n = toolName.toLowerCase();
  if (n === 'read_file' || n === 'readfile' || n === 'read_many_files')
    return 'read';
  if (n === 'write_file' || n === 'writefile' || n === 'create_file')
    return 'write';
  if (n === 'edit' || n === 'replace' || n === 'apply_patch') return 'edit';
  return null;
}

function isTodoWriteTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === 'todo_write' || n === 'todowrite' || n === 'update_todos';
}

// Format a rough one-line diff for the Files panel expand view. Doesn't
// try to be a real patch — just show what changed.
function formatDiff(
  args: Record<string, unknown> | undefined,
): string | undefined {
  if (!args) return undefined;
  const oldText = args['old_string'] ?? args['oldText'];
  const newText = args['new_string'] ?? args['newText'];
  if (oldText == null && newText == null) return undefined;
  const oldStr = String(oldText ?? '').slice(0, 200);
  const newStr = String(newText ?? '').slice(0, 200);
  return `- ${oldStr}\n+ ${newStr}`;
}

// todo_write's args.todos is [{ id, content, status }] (see
// packages/core/src/tools/todoWrite.ts). Map to the prefix-emoji format
// the existing PlanPanel renders.
function parseTodosToPlanItems(
  args: Record<string, unknown> | undefined,
): string[] {
  if (!args) return [];
  const todos = args['todos'];
  if (!Array.isArray(todos)) return [];
  return todos
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const obj = t as { content?: unknown; status?: unknown };
      const content = typeof obj.content === 'string' ? obj.content : '';
      if (!content) return null;
      const status = String(obj.status ?? 'pending');
      const prefix =
        status === 'completed' ? '✅' : status === 'in_progress' ? '⏳' : '⬜';
      return `${prefix} ${content}`;
    })
    .filter((s): s is string => s !== null);
}
