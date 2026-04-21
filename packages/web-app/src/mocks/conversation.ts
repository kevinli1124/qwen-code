import type { ChatMessageData } from '@qwen-code/webui';
import type { ToolCallEntry } from '../types/message';

const now = Date.now();
const t = (offsetMs: number) => new Date(now - offsetMs).toISOString();

export const MOCK_MESSAGES: ChatMessageData[] = [
  {
    uuid: 'msg-001',
    type: 'user',
    timestamp: t(5 * 60 * 1000),
    message: {
      role: 'user',
      content:
        'Please read the main entry point and tell me what the CLI bootstrap sequence looks like.',
    },
  },
  {
    uuid: 'msg-002',
    type: 'assistant',
    timestamp: t(4 * 60 * 1000 + 55 * 1000),
    message: {
      role: 'thinking',
      content:
        "The user wants to understand the CLI bootstrap sequence. I'll need to read `packages/cli/src/gemini.tsx` to trace how the app initializes — that file is the entry point. Let me start there.",
    },
  },
  {
    uuid: 'msg-003',
    type: 'tool_call',
    timestamp: t(4 * 60 * 1000 + 30 * 1000),
    toolCall: {
      toolCallId: 'call-001',
      kind: 'read',
      title: 'Read packages/cli/src/gemini.tsx',
      status: 'completed',
      rawInput: { path: 'packages/cli/src/gemini.tsx' },
      content: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: "// CLI entry point\nimport { loadCliConfig } from './config';...",
          },
        },
      ],
      locations: [{ path: 'packages/cli/src/gemini.tsx' }],
    },
  },
  {
    uuid: 'msg-004',
    type: 'tool_call',
    timestamp: t(4 * 60 * 1000),
    toolCall: {
      toolCallId: 'call-002',
      kind: 'execute',
      title: 'grep -n "initializeApp" packages/cli/src/gemini.tsx',
      status: 'completed',
      rawInput: {
        command: 'grep -n "initializeApp" packages/cli/src/gemini.tsx',
      },
      content: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: '42:  await initializeApp(config, settings);\n67:  // initializeApp handles MCP, auth, tools',
          },
        },
      ],
    },
  },
  {
    uuid: 'msg-005',
    type: 'tool_call',
    timestamp: t(3 * 60 * 1000 + 30 * 1000),
    toolCall: {
      toolCallId: 'call-003',
      kind: 'write',
      title: 'Write packages/cli/src/web/WebServer.ts',
      status: 'completed',
      rawInput: { path: 'packages/cli/src/web/WebServer.ts' },
      content: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: 'File written successfully (847 bytes)',
          },
        },
      ],
      locations: [{ path: 'packages/cli/src/web/WebServer.ts' }],
    },
  },
  {
    uuid: 'msg-006',
    type: 'assistant',
    timestamp: t(3 * 60 * 1000),
    message: {
      role: 'assistant',
      content: `## CLI Bootstrap Sequence

The CLI entry point is \`packages/cli/src/gemini.tsx\`. Here's what happens on startup:

1. **Profile initialization** — \`initStartupProfiler()\` starts timing
2. **DNS setup** — sets IPv4-first resolution order
3. **Config loading** — \`loadCliConfig()\` reads \`~/.qwen/\` settings
4. **App initialization** — \`initializeApp(config, settings)\` wires up:
   - MCP server connections
   - Auth provider (Qwen OAuth / OpenAI / Gemini / Anthropic)
   - Tool registry
5. **Mode dispatch**:
   - If \`--print\` or stdin pipe → \`runNonInteractive()\`
   - If \`--web\` → \`startWebServer()\` *(new, not yet implemented)*
   - Otherwise → Ink React TUI via \`render(<App />)\`

The model is determined by \`MAINLINE_CODER_MODEL\` constant (\`qwen3.5-plus\` by default).

\`\`\`typescript
// gemini.tsx simplified flow
await initializeApp(config, settings);
if (isNonInteractive) {
  await runNonInteractive(config, settings, input);
} else {
  render(<App config={config} settings={settings} />);
}
\`\`\``,
    },
  },
];

export const MOCK_TOOL_CALLS: Record<string, ToolCallEntry> = {
  'call-001': {
    callId: 'call-001',
    toolName: 'read_file',
    kind: 'read',
    title: 'Read packages/cli/src/gemini.tsx',
    status: 'completed',
    args: { path: 'packages/cli/src/gemini.tsx' },
    durationMs: 142,
    locations: [{ path: 'packages/cli/src/gemini.tsx' }],
  },
  'call-002': {
    callId: 'call-002',
    toolName: 'bash',
    kind: 'execute',
    title: 'grep -n "initializeApp"',
    status: 'completed',
    args: { command: 'grep -n "initializeApp" packages/cli/src/gemini.tsx' },
    durationMs: 89,
  },
  'call-003': {
    callId: 'call-003',
    toolName: 'write_file',
    kind: 'write',
    title: 'Write packages/cli/src/web/WebServer.ts',
    status: 'completed',
    args: { path: 'packages/cli/src/web/WebServer.ts' },
    durationMs: 31,
    locations: [{ path: 'packages/cli/src/web/WebServer.ts' }],
  },
};
