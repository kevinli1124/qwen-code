/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 *
 * SEA stub for `yoga-layout`. Not exercised at runtime; only needs to be
 * requirable to satisfy the Ink command modules that the SEA bundle pulls
 * in transitively.
 */

module.exports = new Proxy({}, {
  get: () => () => {},
});
module.exports.default = module.exports;
