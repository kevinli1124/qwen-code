import type { ChannelPlugin } from '@qwen-code/channel-base';

const registry = new Map<string, ChannelPlugin>();
let builtinsPromise: Promise<void> | null = null;

function ensureBuiltins(): Promise<void> {
  if (!builtinsPromise) {
    builtinsPromise = (async () => {
      // [DISABLED 2026-04-23 — Telegram integration disabled; see commit msg for how to re-enable]
      // Original 3-way import (telegram + weixin + dingtalk) replaced with a
      // 2-way import that skips @qwen-code/channel-telegram. To re-enable,
      // restore the commented block below and delete the telegram-less version.
      /*
      const [telegram, weixin, dingtalk] = await Promise.all([
        import('@qwen-code/channel-telegram'),
        import('@qwen-code/channel-weixin'),
        import('@qwen-code/channel-dingtalk'),
      ]);

      for (const mod of [telegram, weixin, dingtalk]) {
        registry.set(mod.plugin.channelType, mod.plugin);
      }
      */
      const [weixin, dingtalk] = await Promise.all([
        import('@qwen-code/channel-weixin'),
        import('@qwen-code/channel-dingtalk'),
      ]);

      for (const mod of [weixin, dingtalk]) {
        registry.set(mod.plugin.channelType, mod.plugin);
      }
    })();
  }
  return builtinsPromise;
}

export function registerPlugin(plugin: ChannelPlugin): void {
  if (registry.has(plugin.channelType)) {
    throw new Error(
      `Channel type "${plugin.channelType}" is already registered.`,
    );
  }
  registry.set(plugin.channelType, plugin);
}

export async function getPlugin(
  channelType: string,
): Promise<ChannelPlugin | undefined> {
  await ensureBuiltins();
  return registry.get(channelType);
}

export async function supportedTypes(): Promise<string[]> {
  await ensureBuiltins();
  return [...registry.keys()];
}
