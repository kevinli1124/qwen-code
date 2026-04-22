/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 *
 * SEA stub for `react-devtools-core`. Only used by interactive DEV mode
 * which never runs in the SEA build.
 */

const stub = () => {};
module.exports = new Proxy(
  { connectToDevTools: stub, initialize: stub },
  { get: () => stub },
);
module.exports.default = module.exports;
