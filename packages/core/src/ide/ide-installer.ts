/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'node:child_process';
import * as process from 'node:process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { IDE_DEFINITIONS, type IdeInfo } from './detect-ide.js';
import { QWEN_CODE_COMPANION_EXTENSION_NAME } from './constants.js';

const BUNDLED_VSIX_BASENAME = 'vscode-ide-companion.vsix';

/**
 * Find the locally packaged companion .vsix produced by
 * scripts/copy_bundle_assets.js at bundle time. Returns null if not found —
 * callers should surface a clear error rather than silently falling back to
 * the upstream marketplace extension.
 */
function findBundledCompanionVsix(): string | null {
  // 1. Bundled layout: dist/bundled/vscode-ide-companion.vsix, where this
  //    file lives inside the esbuild-produced dist/cli.js.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, 'bundled', BUNDLED_VSIX_BASENAME),
    path.join(here, '..', 'bundled', BUNDLED_VSIX_BASENAME),
    path.join(here, '..', '..', 'bundled', BUNDLED_VSIX_BASENAME),
  ];

  // 2. Dev layout: walk up looking for packages/vscode-ide-companion/*.vsix
  //    so `npm run dev` + manual `npm run package` works.
  let cursor = here;
  for (let i = 0; i < 6; i++) {
    const companionDir = path.join(cursor, 'packages', 'vscode-ide-companion');
    if (fs.existsSync(companionDir)) {
      try {
        const vsix = fs
          .readdirSync(companionDir)
          .find((f) => f.endsWith('.vsix'));
        if (vsix) {
          candidates.push(path.join(companionDir, vsix));
        }
      } catch {
        // ignore read errors
      }
      break;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getVsCodeCommand(platform: NodeJS.Platform = process.platform) {
  return platform === 'win32' ? 'code.cmd' : 'code';
}

export interface IdeInstaller {
  install(): Promise<InstallResult>;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

async function findVsCodeCommand(
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  // 1. Check PATH first.
  const vscodeCommand = getVsCodeCommand(platform);
  try {
    if (platform === 'win32') {
      const result = child_process
        .execSync(`where.exe ${vscodeCommand}`)
        .toString()
        .trim();
      // `where.exe` can return multiple paths. Return the first one.
      const firstPath = result.split(/\r?\n/)[0];
      if (firstPath) {
        return firstPath;
      }
    } else {
      child_process.execSync(`command -v ${vscodeCommand}`, {
        stdio: 'ignore',
      });
      return vscodeCommand;
    }
  } catch {
    // Not in PATH, continue to check common locations.
  }

  // 2. Check common installation locations.
  const locations: string[] = [];
  const homeDir = os.homedir();

  if (platform === 'darwin') {
    // macOS
    locations.push(
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      path.join(homeDir, 'Library/Application Support/Code/bin/code'),
    );
  } else if (platform === 'linux') {
    // Linux
    locations.push(
      '/usr/share/code/bin/code',
      '/snap/bin/code',
      path.join(homeDir, '.local/share/code/bin/code'),
    );
  } else if (platform === 'win32') {
    // Windows
    locations.push(
      path.join(
        process.env['ProgramFiles'] || 'C:\\Program Files',
        'Microsoft VS Code',
        'bin',
        'code.cmd',
      ),
      path.join(
        homeDir,
        'AppData',
        'Local',
        'Programs',
        'Microsoft VS Code',
        'bin',
        'code.cmd',
      ),
    );
  }

  for (const location of locations) {
    if (fs.existsSync(location)) {
      return location;
    }
  }

  return null;
}

class VsCodeInstaller implements IdeInstaller {
  private vsCodeCommand: Promise<string | null>;

  constructor(
    readonly ideInfo: IdeInfo,
    readonly platform = process.platform,
  ) {
    this.vsCodeCommand = findVsCodeCommand(platform);
  }

  async install(): Promise<InstallResult> {
    const commandPath = await this.vsCodeCommand;
    if (!commandPath) {
      return {
        success: false,
        message: `${this.ideInfo.displayName} CLI not found. Please ensure 'code' is in your system's PATH. For help, see https://code.visualstudio.com/docs/configure/command-line#_code-is-not-recognized-as-an-internal-or-external-command.`,
      };
    }

    // We deliberately install the .vsix packaged from this repo instead of
    // the upstream marketplace extension, so the companion version always
    // matches the CLI build the user is running.
    const vsixPath = findBundledCompanionVsix();
    if (!vsixPath) {
      return {
        success: false,
        message: `Bundled ${QWEN_CODE_COMPANION_EXTENSION_NAME} (.vsix) was not found alongside this CLI build. Rebuild with 'npm run bundle' to regenerate it, then re-run /ide install.`,
      };
    }

    const isWindows = process.platform === 'win32';
    try {
      const result = child_process.spawnSync(
        isWindows ? `"${commandPath}"` : commandPath,
        ['--install-extension', vsixPath, '--force'],
        { stdio: 'pipe', shell: isWindows },
      );

      if (result.status !== 0) {
        throw new Error(
          `Failed to install extension: ${result.stderr?.toString()}`,
        );
      }

      return {
        success: true,
        message: `${this.ideInfo.displayName} companion extension was installed successfully from the local build.`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to install ${this.ideInfo.displayName} companion extension from ${vsixPath}. ${detail}`,
      };
    }
  }
}

export function getIdeInstaller(
  ide: IdeInfo,
  platform = process.platform,
): IdeInstaller | null {
  switch (ide.name) {
    case IDE_DEFINITIONS.vscode.name:
    case IDE_DEFINITIONS.firebasestudio.name:
      return new VsCodeInstaller(ide, platform);
    default:
      return null;
  }
}
