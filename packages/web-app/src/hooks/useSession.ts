import { useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ChatMessageData } from '@qwen-code/webui';
import { useMessageStore } from '../stores/messageStore';
import { useSessionStore } from '../stores/sessionStore';
import type { StreamEvent, ToolCallEntry } from '../types/message';

export function useSessionEvents(sessionId: string | null) {
  // Track subagent metadata so tool calls emitted with a non-'main'
  // agentId can be labelled with the subagent's type (e.g. "code-reviewer").
  // Keyed by subagentId.
  const subagentTypesRef = useRef<Map<string, string>>(new Map());
  const {
    appendMessage,
    updateStreamingText,
    finalizeStreamingText,
    clearStreamingText,
    upsertToolCall,
    appendTerminal,
    addFileOp,
    setPlan,
    setStreaming,
    setPendingPermission,
    setPendingQuestion,
    setPendingPlan,
    setModelLimits,
    recordFileMod,
    markFileReverted,
    patchToolCallMessage,
    setApprovalMode,
    setTokenUsage,
    addSessionTokens,
    setConnectionError,
  } = useMessageStore(
    useShallow((s) => ({
      appendMessage: s.appendMessage,
      updateStreamingText: s.updateStreamingText,
      finalizeStreamingText: s.finalizeStreamingText,
      clearStreamingText: s.clearStreamingText,
      upsertToolCall: s.upsertToolCall,
      appendTerminal: s.appendTerminal,
      addFileOp: s.addFileOp,
      setPlan: s.setPlan,
      setStreaming: s.setStreaming,
      setPendingPermission: s.setPendingPermission,
      setPendingQuestion: s.setPendingQuestion,
      setPendingPlan: s.setPendingPlan,
      setModelLimits: s.setModelLimits,
      recordFileMod: s.recordFileMod,
      markFileReverted: s.markFileReverted,
      patchToolCallMessage: s.patchToolCallMessage,
      setApprovalMode: s.setApprovalMode,
      setTokenUsage: s.setTokenUsage,
      addSessionTokens: s.addSessionTokens,
      setConnectionError: s.setConnectionError,
    })),
  );
  const { updateSession } = useSessionStore(
    useShallow((s) => ({
      updateSession: s.updateSession,
    })),
  );

  const handleEvent = useCallback(
    (event: StreamEvent) => {
      if (!sessionId) return;
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
          // Seed the approval-mode cycle button with the child's current
          // mode (default/plan/auto-edit/yolo). The child reports this
          // on every init so the button stays accurate after re-spawn.
          const pm = event.data?.['permission_mode'];
          if (typeof pm === 'string') {
            setApprovalMode(pm as 'default' | 'plan' | 'auto-edit' | 'yolo');
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
          // thinking-delta stream_text events use uuid=`thinking-${blockUuid}`.
          // They are finalized by this event (not by an assistant event), so
          // clean up the streamingText entry manually.
          clearStreamingText(event.uuid);
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
          // Push the tool output (aggregated by backend) into the
          // corresponding ChatMessage so the card's expanded view shows
          // what the tool returned, not just that it ran.
          const contentBlocks: Array<{
            type: 'content' | 'diff';
            content?: { type: string; text?: string };
          }> = [];
          if (typeof event.output === 'string' && event.output.length > 0) {
            contentBlocks.push({
              type: 'content',
              content: { type: 'text', text: event.output },
            });
          }
          patchToolCallMessage(sessionId, event.callId, {
            status: event.success ? 'completed' : 'failed',
            content: contentBlocks,
          });
          break;
        }

        case 'file_modified': {
          recordFileMod(sessionId, {
            callId: event.callId,
            path: event.path,
            before: event.before,
            after: event.after,
            toolName: event.toolName,
          });
          // Attach the diff to the tool card's content so the card's
          // expanded view shows before/after without a separate panel.
          patchToolCallMessage(sessionId, event.callId, {
            content: [
              {
                type: 'diff',
                path: event.path,
                oldText: event.before,
                newText: event.after ?? '',
              },
            ],
          });
          break;
        }

        case 'file_reverted': {
          markFileReverted(sessionId, event.callId);
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

        case 'plan_request': {
          setStreaming(false);
          setPendingPlan(event.request);
          // Also seed the Plan panel with the plan's bullet / numbered
          // items so the user can glance at it from the side panel even
          // before accepting.
          const items = parsePlanMarkdownToItems(event.request.plan);
          if (items.length > 0) setPlan(sessionId, items);
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
            setTokenUsage(sessionId, event.usage);
            addSessionTokens(sessionId, event.usage);
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
      clearStreamingText,
      upsertToolCall,
      appendTerminal,
      addFileOp,
      setPlan,
      setStreaming,
      setPendingPermission,
      setPendingQuestion,
      setPendingPlan,
      setModelLimits,
      recordFileMod,
      markFileReverted,
      patchToolCallMessage,
      setApprovalMode,
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

// Extract a list of bullet / numbered items from plan markdown for the
// Plan panel. Accepts `- item`, `* item`, `1. item`, `[ ] item`, and
// `[x] item` styles. Returns prefix-coded strings the PlanPanel renders.
function parsePlanMarkdownToItems(plan: string): string[] {
  if (!plan) return [];
  const items: string[] = [];
  for (const rawLine of plan.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    // [x] done / [X] done
    const done = line.match(/^[-*]\s*\[[xX]\]\s*(.+)$/);
    if (done) {
      items.push(`✅ ${done[1]}`);
      continue;
    }
    // [ ] pending / [-] in-progress
    const pending = line.match(/^[-*]\s*\[\s\]\s*(.+)$/);
    if (pending) {
      items.push(`⬜ ${pending[1]}`);
      continue;
    }
    const inProgress = line.match(/^[-*]\s*\[-\]\s*(.+)$/);
    if (inProgress) {
      items.push(`⏳ ${inProgress[1]}`);
      continue;
    }
    // Plain bullet
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      items.push(`⬜ ${bullet[1]}`);
      continue;
    }
    // Numbered list
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      items.push(`⬜ ${numbered[1]}`);
      continue;
    }
  }
  return items;
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
