import type { CommandModule, Argv } from 'yargs';
import { startCommand } from './channel/start.js';
import { stopCommand } from './channel/stop.js';
import { statusCommand } from './channel/status.js';
import {
  pairingListCommand,
  pairingApproveCommand,
} from './channel/pairing.js';
// [DISABLED 2026-04-23 — WeChat integration disabled; see commit msg for how to re-enable]
// import { configureWeixinCommand } from './channel/configure.js';

const pairingCommand: CommandModule = {
  command: 'pairing',
  describe: 'Manage DM pairing requests',
  builder: (yargs: Argv) =>
    yargs
      .command(pairingListCommand)
      .command(pairingApproveCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {},
};

export const channelCommand: CommandModule = {
  command: 'channel',
  describe: 'Manage messaging channels (Telegram, Discord, etc.)',
  builder: (yargs: Argv) =>
    yargs
      .command(startCommand)
      .command(stopCommand)
      .command(statusCommand)
      .command(pairingCommand)
      // [DISABLED 2026-04-23 — WeChat integration disabled; see commit msg for how to re-enable]
      // .command(configureWeixinCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {},
};
