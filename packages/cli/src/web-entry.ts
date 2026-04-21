/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standalone web server entry point for Node.js SEA packaging.
 * Imports only web server code — no Ink / yoga-layout (which use top-level await
 * and cannot be bundled as CommonJS required by the SEA format).
 */

import { startWebServer } from './web/WebServer.js';

const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1] ?? '7788', 10) : 7788;
const noOpen = process.argv.includes('--no-open');

startWebServer({ port, open: !noOpen }).catch((err: unknown) => {
  process.stderr.write(`Fatal error starting web server: ${String(err)}\n`);
  process.exit(1);
});
