/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GatewaySetupProvider } from './types.js';
// [DISABLED 2026-04-23 — Telegram integration disabled; see commit msg for how to re-enable]
// import { telegramSetup } from './telegram-setup.js';

/**
 * Registered gateway setup providers. Each entry is either `available: true`
 * (fully wired with a real gateway implementation) or `available: false`
 * (roadmap placeholder — listed so users can see what's coming).
 *
 * To add a new channel: build the gateway under `packages/core/src/messaging/`,
 * write a provider here, and append to the array.
 */
export const gatewaySetupProviders: GatewaySetupProvider[] = [
  // [DISABLED 2026-04-23 — Telegram integration disabled; see commit msg for how to re-enable]
  // telegramSetup,
  // discordSetup — TODO
  // slackSetup    — TODO
];

export function findProvider(
  channel: string,
): GatewaySetupProvider | undefined {
  const target = channel.toLowerCase();
  return gatewaySetupProviders.find((p) => p.channel === target);
}

// [DISABLED 2026-04-23 — Telegram integration disabled; see commit msg for how to re-enable]
// export { telegramSetup };
export type { GatewaySetupProvider } from './types.js';
