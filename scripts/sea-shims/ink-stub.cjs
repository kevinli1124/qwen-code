/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 *
 * SEA-only stub for `ink`. The SEA executable only runs the headless web
 * server and the non-interactive stream-json CLI — the interactive Ink UI
 * never renders, but its command modules are transitively required for type
 * registration. We short-circuit them with no-op components so `require('ink')`
 * succeeds inside the CJS-bundled SEA blob.
 */

const noop = () => null;
const passThrough = (props) => props?.children ?? null;

const render = () => ({
  unmount: () => {},
  waitUntilExit: () => Promise.resolve(),
  rerender: () => {},
  clear: () => {},
});

module.exports = {
  Box: passThrough,
  Text: passThrough,
  Static: passThrough,
  Newline: noop,
  Spacer: noop,
  Transform: passThrough,
  render,
  useApp: () => ({ exit: () => {} }),
  useStdin: () => ({ stdin: process.stdin, setRawMode: () => {}, isRawModeSupported: false }),
  useStdout: () => ({ stdout: process.stdout, write: () => {} }),
  useInput: () => {},
  useFocus: () => ({ isFocused: false }),
  useFocusManager: () => ({ enableFocus: () => {}, disableFocus: () => {}, focusNext: () => {}, focusPrevious: () => {}, focus: () => {} }),
  measureElement: () => ({ width: 0, height: 0 }),
};
