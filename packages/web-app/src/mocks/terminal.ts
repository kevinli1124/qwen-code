// Mock ANSI terminal output for TerminalPanel demo
export const MOCK_TERMINAL_OUTPUT = [
  '\x1b[32m$\x1b[0m grep -n "initializeApp" packages/cli/src/gemini.tsx\r\n',
  '\x1b[33m42\x1b[0m:  await initializeApp(config, settings);\r\n',
  '\x1b[33m67\x1b[0m:  // initializeApp handles MCP, auth, tools\r\n',
  '\x1b[32m$\x1b[0m \r\n',
  '\x1b[32m$\x1b[0m npm run typecheck\r\n',
  '\r\n',
  '> @qwen-code/cli@0.14.5 typecheck\r\n',
  '> tsc --noEmit\r\n',
  '\r\n',
  '\x1b[32m✓ No type errors found.\x1b[0m\r\n',
  '\x1b[32m$\x1b[0m \r\n',
];

export const MOCK_PLAN_ITEMS = [
  '✅ Read CLI entry point (gemini.tsx)',
  '✅ Trace bootstrap sequence',
  '⏳ Implement --web flag detection',
  '⬜ Create WebServer.ts',
  '⬜ Add SSE streaming endpoint',
  '⬜ Bundle web assets into CLI',
];
