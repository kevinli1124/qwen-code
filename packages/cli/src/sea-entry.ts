/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SEA-friendly entry point that dispatches between two modes:
 *   - default / --web  → HTTP web server (packages/cli/src/web)
 *   - --input-format stream-json → headless CLI session consumed over stdio
 *
 * The web server in turn spawns this same executable in stream-json mode for
 * each chat session, which only works if stream-json mode is bundled here.
 *
 * No Ink / yoga-layout imports are allowed in this graph — both would pull
 * top-level await into the CJS bundle required by Node's SEA packaging.
 */

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function getFlagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) return undefined;
  return args[idx + 1];
}

async function runStreamJsonMode(): Promise<void> {
  const { runSeaStreamJson } = await import('./sea/streamJsonEntry.js');
  await runSeaStreamJson();
}

async function runWebMode(): Promise<void> {
  const { startWebServer } = await import('./web/WebServer.js');
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1] ?? '7788', 10) : 7788;
  const noOpen = process.argv.includes('--no-open');
  await startWebServer({ port, open: !noOpen });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputFormat = getFlagValue(args, '--input-format');
  const isStreamJson = inputFormat === 'stream-json';

  if (isStreamJson) {
    await runStreamJsonMode();
    return;
  }

  // --web or no dispatch flag at all: run the embedded web UI server.
  void hasFlag; // suppress unused-import lint if flag helper stays unused
  await runWebMode();
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal SEA entry error: ${String(err)}\n`);
  process.exit(1);
});
