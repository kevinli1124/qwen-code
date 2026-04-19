/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Config } from '../config/config.js';
import type { SubagentManager } from '../subagents/subagent-manager.js';
import {
  parse as parseYaml,
  stringify as stringifyYaml,
} from '../utils/yaml-parser.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { normalizeContent } from '../utils/textUtils.js';
import type { CronJob } from '../services/cronScheduler.js';
import { ContextState } from '../agents/runtime/agent-headless.js';
import type { BaseTrigger } from './base-trigger.js';
import { createTrigger } from './factory.js';
import { CronTrigger, extractTriggerIdFromJobPrompt } from './cron-trigger.js';
import { ChatTrigger } from './chat-trigger.js';
import {
  TriggerError,
  TriggerErrorCode,
  type CreateTriggerOptions,
  type ListTriggersOptions,
  type TriggerConfig,
  type TriggerContext,
  type TriggerLevel,
} from './types.js';

const QWEN_CONFIG_DIR = '.qwen';
const TRIGGER_CONFIG_DIR = 'triggers';
const FILE_EXT = '.md';

const debugLogger = createDebugLogger('TRIGGER_MANAGER');

/**
 * Global concurrency cap across all trigger-fired agents. Triggers that
 * fire while the cap is hit are dropped with a warning (Phase 1 behavior).
 */
const MAX_CONCURRENT_TRIGGER_AGENTS = 3;

/**
 * Loads trigger configs from `.qwen/triggers/*.md`, manages their lifecycle,
 * and forks the bound subagent when a trigger fires.
 *
 * Relationship with CronScheduler:
 *   - TriggerManager shares the Config's single CronScheduler instance.
 *   - When a CronTrigger is registered, it creates a CronJob whose prompt
 *     is tagged with `__trigger__:<triggerId>`.
 *   - The host (Session) installs a scheduler.start(onFire) callback. On
 *     each fire, it asks TriggerManager.tryHandleCronFire(job); if true,
 *     the job was a trigger and was dispatched to its agent. If false, the
 *     job is a legacy CronCreate entry and the host handles it normally.
 */
export class TriggerManager {
  private triggers: Map<string, BaseTrigger> = new Map();
  /** Cache of configs keyed by level — loaded from disk. Session level is ephemeral. */
  private configsCache: Map<TriggerLevel, TriggerConfig[]> | null = null;
  private activeAgentCount = 0;
  private started = false;
  /**
   * Registration errors from the last `startAll()` call. Keyed by trigger id,
   * cleared on the next `startAll()`. Exposed so the host can surface failures
   * to the operator — `debugLogger.warn` alone gets lost inside Ink.
   */
  private lastRegistrationErrors: Map<string, Error> = new Map();

  constructor(
    private readonly config: Config,
    /**
     * Optional explicit override. When undefined, we fetch the current
     * SubagentManager from Config each time we need it — important because
     * Config.initialize() populates `subagentManager` asynchronously, and a
     * TriggerManager built before that would otherwise cache `undefined` and
     * fail every future `register()` with "host is not wired".
     */
    private readonly subagentManagerOverride?: SubagentManager,
  ) {}

  private get subagentManager(): SubagentManager {
    return this.subagentManagerOverride ?? this.config.getSubagentManager();
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  /**
   * Loads all enabled triggers from disk and registers them. Safe to call
   * multiple times — subsequent calls reconcile (unchanged triggers keep
   * running; new ones start; removed ones stop).
   */
  async startAll(): Promise<void> {
    await this.refreshCache();
    const all = await this.listTriggers({ enabled: true });

    // Reconcile: stop removed, start new, leave unchanged alone.
    const wanted = new Set(all.map((t) => t.id));
    for (const id of [...this.triggers.keys()]) {
      if (!wanted.has(id)) {
        await this.unregister(id);
      }
    }
    this.lastRegistrationErrors.clear();
    for (const cfg of all) {
      if (!this.triggers.has(cfg.id)) {
        try {
          await this.register(cfg);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.lastRegistrationErrors.set(cfg.id, error);
          debugLogger.warn(
            `Failed to register trigger "${cfg.id}":`,
            error.message,
          );
        }
      }
    }
    this.started = true;
    debugLogger.debug(`Started ${this.triggers.size} triggers.`);
  }

  /**
   * Errors thrown by trigger.start() or validate() during the last startAll().
   * The host uses this to surface real reasons (e.g. "TELEGRAM_BOT_TOKEN is
   * not set") — bare `debugLogger.warn` is invisible inside Ink's TUI.
   */
  getLastRegistrationErrors(): ReadonlyMap<string, Error> {
    return this.lastRegistrationErrors;
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.triggers.keys()]) {
      await this.unregister(id);
    }
    this.started = false;
  }

  get isStarted(): boolean {
    return this.started;
  }

  async register(cfg: TriggerConfig): Promise<BaseTrigger> {
    if (this.triggers.has(cfg.id)) {
      throw new TriggerError(
        `Trigger "${cfg.id}" is already registered`,
        TriggerErrorCode.ALREADY_EXISTS,
        cfg.id,
      );
    }
    const deps = {
      cronScheduler: this.config.getCronScheduler(),
      config: this.config,
      subagentManager: this.subagentManager,
    };
    const trigger = createTrigger(cfg, deps);
    trigger.validate();
    await trigger.start((ctx) => this.handleFire(cfg, ctx));
    this.triggers.set(cfg.id, trigger);
    return trigger;
  }

  async unregister(id: string): Promise<void> {
    const trigger = this.triggers.get(id);
    if (!trigger) return;
    await trigger.stop();
    this.triggers.delete(id);
  }

  getTrigger(id: string): BaseTrigger | undefined {
    return this.triggers.get(id);
  }

  /**
   * Called by the host (Session) once per user turn. Every registered
   * ChatTrigger evaluates the text; matching triggers fire in sequence.
   * Errors in one trigger do not prevent others from firing.
   */
  async evaluateChatMessage(text: string): Promise<void> {
    if (!text) return;
    for (const trigger of this.triggers.values()) {
      if (!(trigger instanceof ChatTrigger)) continue;
      try {
        const match = trigger.evaluate(text);
        if (match) {
          await trigger.fireManually({ ...match });
        }
      } catch (err) {
        debugLogger.warn(
          `ChatTrigger "${trigger.cfg.id}" evaluation failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  /**
   * Called by the host (Session) from the shared CronScheduler.onFire
   * callback. If the job belongs to a registered CronTrigger, routes it to
   * the trigger's agent fork path and returns true. Otherwise returns false
   * so the host can fall back to the legacy cronQueue path.
   */
  async tryHandleCronFire(job: CronJob): Promise<boolean> {
    const triggerId = extractTriggerIdFromJobPrompt(job.prompt);
    if (!triggerId) return false;
    const trigger = this.triggers.get(triggerId);
    if (!trigger || !(trigger instanceof CronTrigger)) return false;
    try {
      await trigger.handleSchedulerFire();
    } catch (err) {
      debugLogger.warn(
        `CronTrigger "${triggerId}" handler threw:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    return true;
  }

  // ─── Fire → Agent ───────────────────────────────────────────

  private async handleFire(
    cfg: TriggerConfig,
    ctx: TriggerContext,
  ): Promise<void> {
    if (this.activeAgentCount >= MAX_CONCURRENT_TRIGGER_AGENTS) {
      debugLogger.warn(
        `Trigger "${cfg.id}" fired but concurrency cap (${MAX_CONCURRENT_TRIGGER_AGENTS}) reached — dropping.`,
      );
      return;
    }
    this.activeAgentCount++;
    try {
      await this.invokeAgent(cfg, ctx);
    } catch (err) {
      debugLogger.warn(
        `Trigger "${cfg.id}" invocation failed:`,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      this.activeAgentCount--;
    }
  }

  /**
   * Forks the subagent named by `cfg.agentRef` and runs the rendered
   * prompt. Errors are caught by the caller (handleFire).
   */
  async invokeAgent(cfg: TriggerConfig, ctx: TriggerContext): Promise<void> {
    const subagent = await this.subagentManager.loadSubagent(cfg.agentRef);
    if (!subagent) {
      throw new TriggerError(
        `Trigger "${cfg.id}" references unknown agent "${cfg.agentRef}"`,
        TriggerErrorCode.AGENT_NOT_FOUND,
        cfg.id,
      );
    }

    const prompt = renderPromptTemplate(
      cfg.promptTemplate ?? defaultPromptFor(cfg, ctx),
      ctx,
    );

    const contextState = new ContextState();
    contextState.set('task_prompt', prompt);
    contextState.set('trigger', ctx);
    for (const [k, v] of Object.entries(ctx.payload)) {
      contextState.set(k, v);
    }

    const agent = await this.subagentManager.createAgentHeadless(
      subagent,
      this.config,
    );
    await agent.execute(contextState);
  }

  // ─── CRUD ───────────────────────────────────────────────────

  async listTriggers(
    options: ListTriggersOptions = {},
  ): Promise<TriggerConfig[]> {
    const shouldUseCache = !options.force && this.configsCache !== null;
    if (!shouldUseCache) {
      await this.refreshCache();
    }

    const levels: TriggerLevel[] = options.level
      ? [options.level]
      : ['project', 'user'];

    const seen = new Set<string>();
    const out: TriggerConfig[] = [];
    for (const level of levels) {
      const items = this.configsCache?.get(level) ?? [];
      for (const cfg of items) {
        // Precedence: project > user (by id).
        if (seen.has(cfg.id)) continue;
        if (options.kind && cfg.kind !== options.kind) continue;
        if (options.enabled !== undefined && cfg.enabled !== options.enabled) {
          continue;
        }
        seen.add(cfg.id);
        out.push(cfg);
      }
    }
    return out;
  }

  async loadTrigger(
    id: string,
    level?: TriggerLevel,
  ): Promise<TriggerConfig | null> {
    const all = await this.listTriggers({ level });
    return all.find((cfg) => cfg.id === id) ?? null;
  }

  async createTrigger(
    cfg: TriggerConfig,
    options: CreateTriggerOptions,
  ): Promise<void> {
    validateConfigShape(cfg);
    // Pre-validate the trigger kind spec (throws TriggerError on bad spec).
    const deps = {
      cronScheduler: this.config.getCronScheduler(),
      config: this.config,
      subagentManager: this.subagentManager,
    };
    const probe = createTrigger(cfg, deps);
    probe.validate();

    const filePath = this.getTriggerPath(cfg.id, options.level);
    if (!options.overwrite) {
      try {
        await fs.access(filePath);
        throw new TriggerError(
          `Trigger "${cfg.id}" already exists at ${filePath}`,
          TriggerErrorCode.ALREADY_EXISTS,
          cfg.id,
        );
      } catch (err) {
        if (err instanceof TriggerError) throw err;
        // fs.access threw ENOENT — file doesn't exist, which is what we want.
      }
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const finalCfg: TriggerConfig = {
      ...cfg,
      metadata: {
        ...cfg.metadata,
        createdAt: cfg.metadata?.createdAt ?? Date.now(),
        filePath,
        level: options.level,
      },
    };
    const content = serializeTrigger(finalCfg);
    try {
      await fs.writeFile(filePath, content, 'utf8');
    } catch (err) {
      throw new TriggerError(
        `Failed to write trigger file: ${err instanceof Error ? err.message : String(err)}`,
        TriggerErrorCode.FILE_ERROR,
        cfg.id,
      );
    }
    await this.refreshCache();
    if (this.started && finalCfg.enabled) {
      await this.register(finalCfg);
    }
  }

  async deleteTrigger(id: string, level?: TriggerLevel): Promise<void> {
    const cfg = await this.loadTrigger(id, level);
    if (!cfg) {
      throw new TriggerError(
        `Trigger "${id}" not found`,
        TriggerErrorCode.NOT_FOUND,
        id,
      );
    }
    await this.unregister(id);
    const filePath = cfg.metadata?.filePath;
    if (!filePath) {
      throw new TriggerError(
        `Trigger "${id}" has no file path; cannot delete`,
        TriggerErrorCode.FILE_ERROR,
        id,
      );
    }
    try {
      await fs.unlink(filePath);
    } catch (err) {
      throw new TriggerError(
        `Failed to delete trigger file: ${err instanceof Error ? err.message : String(err)}`,
        TriggerErrorCode.FILE_ERROR,
        id,
      );
    }
    await this.refreshCache();
  }

  /**
   * Sets enabled=true/false on an existing trigger and reconciles runtime state.
   */
  async toggleTrigger(id: string, enabled: boolean): Promise<TriggerConfig> {
    const cfg = await this.loadTrigger(id);
    if (!cfg) {
      throw new TriggerError(
        `Trigger "${id}" not found`,
        TriggerErrorCode.NOT_FOUND,
        id,
      );
    }
    if (cfg.enabled === enabled) return cfg;
    const updated: TriggerConfig = { ...cfg, enabled };
    const filePath = cfg.metadata?.filePath;
    if (!filePath) {
      throw new TriggerError(
        `Trigger "${id}" has no file path; cannot toggle`,
        TriggerErrorCode.FILE_ERROR,
        id,
      );
    }
    await fs.writeFile(filePath, serializeTrigger(updated), 'utf8');
    await this.refreshCache();

    if (enabled) {
      if (this.started && !this.triggers.has(id)) {
        await this.register(updated);
      }
    } else {
      await this.unregister(id);
    }
    return updated;
  }

  // ─── Paths & persistence ────────────────────────────────────

  getTriggerPath(id: string, level: Exclude<TriggerLevel, 'session'>): string {
    const baseDir =
      level === 'project'
        ? path.join(
            this.config.getProjectRoot(),
            QWEN_CONFIG_DIR,
            TRIGGER_CONFIG_DIR,
          )
        : path.join(os.homedir(), QWEN_CONFIG_DIR, TRIGGER_CONFIG_DIR);
    return path.join(baseDir, `${id}${FILE_EXT}`);
  }

  private async refreshCache(): Promise<void> {
    const cache = new Map<TriggerLevel, TriggerConfig[]>();
    for (const level of ['project', 'user'] as const) {
      cache.set(level, await this.loadLevel(level));
    }
    this.configsCache = cache;
  }

  private async loadLevel(
    level: Exclude<TriggerLevel, 'session'>,
  ): Promise<TriggerConfig[]> {
    const projectRoot = this.config.getProjectRoot();
    const homeDir = os.homedir();
    const isHomeDirectory = path.resolve(projectRoot) === path.resolve(homeDir);
    if (level === 'project' && isHomeDirectory) return [];

    const baseDir = path.join(
      level === 'project' ? projectRoot : homeDir,
      QWEN_CONFIG_DIR,
      TRIGGER_CONFIG_DIR,
    );

    let entries: string[];
    try {
      entries = await fs.readdir(baseDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    const configs: TriggerConfig[] = [];
    for (const name of entries) {
      if (!name.endsWith(FILE_EXT)) continue;
      const filePath = path.join(baseDir, name);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const cfg = parseTriggerContent(raw, filePath, level);
        configs.push(cfg);
      } catch (err) {
        debugLogger.warn(
          `Skipping invalid trigger file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return configs;
  }
}

// ─── Helpers ──────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function parseTriggerContent(
  content: string,
  filePath: string,
  level: TriggerLevel,
): TriggerConfig {
  const normalized = normalizeContent(content);
  const match = normalized.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error('missing YAML frontmatter');
  }
  const [, yamlBody, promptBody] = match;
  const frontmatter = parseYaml(yamlBody) as Record<string, unknown>;

  const fileBase = path.basename(filePath, FILE_EXT);
  const id = String(frontmatter['id'] ?? fileBase);
  const name = String(frontmatter['name'] ?? id);
  const kindRaw = frontmatter['kind'];
  if (typeof kindRaw !== 'string') {
    throw new Error('missing "kind" in frontmatter');
  }
  const agentRefRaw = frontmatter['agentRef'];
  // Message triggers may omit agentRef and fall back to the default
  // conversational assistant; all other kinds must name a subagent.
  const isMessageKind = kindRaw === 'message';
  let agentRef: string;
  if (typeof agentRefRaw === 'string' && agentRefRaw) {
    agentRef = agentRefRaw;
  } else if (isMessageKind) {
    agentRef = '';
  } else {
    throw new Error('missing "agentRef" in frontmatter');
  }
  const enabled = frontmatter['enabled'] !== false; // default true
  const spec = (frontmatter['spec'] ?? {}) as Record<string, unknown>;

  const promptTemplate = frontmatter['promptTemplate'];
  const bodyPrompt =
    typeof promptTemplate === 'string'
      ? promptTemplate
      : promptBody.trim() || undefined;

  return {
    id,
    name,
    kind: kindRaw as TriggerConfig['kind'],
    enabled,
    agentRef,
    spec,
    promptTemplate: bodyPrompt,
    metadata: {
      createdAt:
        typeof frontmatter['createdAt'] === 'number'
          ? (frontmatter['createdAt'] as number)
          : undefined,
      filePath,
      level,
    },
  };
}

function serializeTrigger(cfg: TriggerConfig): string {
  const frontmatter: Record<string, unknown> = {
    id: cfg.id,
    name: cfg.name,
    kind: cfg.kind,
    enabled: cfg.enabled,
    agentRef: cfg.agentRef,
    spec: cfg.spec,
  };
  if (cfg.metadata?.createdAt) {
    frontmatter['createdAt'] = cfg.metadata.createdAt;
  }
  const yaml = stringifyYaml(frontmatter, {
    lineWidth: 0,
    minContentWidth: 0,
  }).trim();
  const body = cfg.promptTemplate?.trim() ?? '';
  return `---\n${yaml}\n---\n\n${body}\n`;
}

function validateConfigShape(cfg: TriggerConfig): void {
  if (!cfg.id || !/^[a-zA-Z0-9._-]+$/.test(cfg.id)) {
    throw new TriggerError(
      `Invalid trigger id "${cfg.id}" — use letters, numbers, dot, dash, underscore only`,
      TriggerErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (!cfg.name) {
    throw new TriggerError(
      `Trigger "${cfg.id}" is missing name`,
      TriggerErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
  if (!cfg.agentRef && cfg.kind !== 'message') {
    throw new TriggerError(
      `Trigger "${cfg.id}" is missing agentRef`,
      TriggerErrorCode.INVALID_CONFIG,
      cfg.id,
    );
  }
}

function defaultPromptFor(cfg: TriggerConfig, ctx: TriggerContext): string {
  return `Trigger "${cfg.name}" (${ctx.kind}) fired at ${new Date(ctx.firedAt).toISOString()}. Payload: ${safeJson(ctx.payload)}`;
}

function safeJson(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return '[unserializable]';
  }
}

/**
 * Substitutes `${path.to.key}` references in the template with values from
 * the trigger context. Looks up `trigger.<key>` then `payload.<key>` then
 * bare `<key>` in payload. Unknown keys are left as the literal `${...}`.
 */
function renderPromptTemplate(template: string, ctx: TriggerContext): string {
  return template.replace(/\$\{([^}]+)\}/g, (whole, expr: string) => {
    const parts = expr.trim().split('.');
    const value = resolve(parts, ctx);
    if (value === undefined) return whole;
    if (typeof value === 'string') return value;
    return safeJson(value);
  });
}

function resolve(parts: string[], ctx: TriggerContext): unknown {
  if (parts.length === 0) return undefined;
  const [head, ...rest] = parts;
  const root: Record<string, unknown> = {
    trigger: ctx as unknown as Record<string, unknown>,
    payload: ctx.payload,
    ...ctx.payload,
  };
  let cur: unknown = root[head];
  for (const p of rest) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}
