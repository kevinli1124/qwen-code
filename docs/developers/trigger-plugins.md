# Writing a new trigger kind

> Audience: contributors and advanced users who need an event source that doesn't fit `cron`, `file`, `webhook`, `chat`, or `system`. End users extending via the five built-in kinds should read the [triggers guide](../users/features/triggers.md) instead.

New trigger kinds are **core changes**, not pluggable. The `TriggerManager` / `factory.ts` switch is intentionally closed — adding a kind is roughly 150 lines plus tests, but it does require a build. The system is designed so that **almost every real need is expressible in the five existing kinds** (a polled HTTP endpoint is a `system` trigger; a listener on a log file is a `file` trigger). Before adding a kind, confirm you can't reuse one of those.

If you're certain, here's the contract.

## 1. The BaseTrigger contract

`packages/core/src/triggers/base-trigger.ts` defines the base class every kind inherits:

```ts
export abstract class BaseTrigger {
  abstract readonly kind: TriggerKind;
  protected onFire: OnFireCallback | null = null;

  constructor(
    public readonly cfg: TriggerConfig,
    protected readonly deps: TriggerDeps,
  ) {}

  abstract start(onFire: OnFireCallback): void | Promise<void>;
  abstract stop(): void | Promise<void>;
  validate(): void {} // override to reject bad spec

  async fireManually(payload: Record<string, unknown> = {}): Promise<void> {
    // builds a TriggerContext and invokes this.onFire
  }
}
```

Three required abstract methods:

- **`validate()`** — throw `TriggerError` with code `INVALID_CONFIG` if `cfg.spec` is malformed. Called before `start`. Your only chance to reject bad configs early.
- **`start(onFire)`** — attach to your external event source. **Must be idempotent** — `TriggerManager.startAll()` may be called again via `/reload triggers`, so a second call must not double-register watchers/routes/intervals.
- **`stop()`** — release every resource allocated in `start`. Also idempotent. Must tolerate being called before `start` (newly-constructed trigger) and after `stop` (already stopped).

When your external source fires, build a payload object and call `this.fireManually(payload)`. That routes through the single `onFire` callback `TriggerManager` passed to `start`, which forks the bound subagent.

### The `TriggerConfig` shape

```ts
interface TriggerConfig {
  id: string; // filename slug
  name: string; // human-readable
  kind: TriggerKind; // your new kind
  enabled: boolean;
  agentRef: string; // .qwen/agents/<name>.md
  spec: Record<string, unknown>; // kind-specific — this is your surface
  promptTemplate?: string; // ${payload.xxx} placeholders
  metadata?: { createdAt?; filePath?; level? };
}
```

`spec` is free-form JSON. Cast it inside your trigger to a typed shape. Example:

```ts
export interface MqttTriggerSpec {
  broker: string;
  topic: string;
  qos?: 0 | 1 | 2;
}

override start(onFire: OnFireCallback): void {
  this.onFire = onFire;
  const spec = this.cfg.spec as unknown as MqttTriggerSpec;
  // ...
}
```

### The `TriggerDeps` injection

`BaseTrigger` receives a `TriggerDeps` object the manager builds once:

```ts
interface TriggerDeps {
  cronScheduler: CronScheduler;
}
```

Add fields here if your kind needs a new cross-cutting resource. Keep this list small — most kinds need nothing beyond their own bootstrapping.

## 2. File layout

Put your new kind in `packages/core/src/triggers/<kind>-trigger.ts`. Mirror existing kinds' shape:

```
packages/core/src/triggers/
├── base-trigger.ts       (don't touch)
├── types.ts              (add to TriggerKind union)
├── factory.ts            (add a case)
├── cron-trigger.ts
├── file-trigger.ts
├── webhook-trigger.ts
├── chat-trigger.ts
├── system-trigger.ts
├── mqtt-trigger.ts       ← your new kind
├── mqtt-trigger.test.ts  ← colocated test
└── trigger-manager.ts    (don't touch unless your kind needs a new dispatch path)
```

Three edits to shared files:

1. **`types.ts`**: add your kind to the `TriggerKind` union.
   ```ts
   export type TriggerKind =
     | 'cron'
     | 'file'
     | 'webhook'
     | 'chat'
     | 'system'
     | 'mqtt';
   ```
2. **`factory.ts`**: add a `case`.
   ```ts
   case 'mqtt':
     return new MqttTrigger(cfg, deps);
   ```
3. **`tools/trigger-create.ts`**: extend the tool description so the LLM knows the new `spec` shape. If you add a new required dependency to `TriggerDeps`, also thread it in `TriggerManager.register`.

That's the full core surface.

## 3. A minimal worked example

Suppose you want `kind: interval` — a simpler cron that fires every N milliseconds, without all the cron-expression machinery. (Contrived, but illustrates the pattern.)

```ts
// packages/core/src/triggers/interval-trigger.ts
import {
  BaseTrigger,
  type OnFireCallback,
  type TriggerDeps,
} from './base-trigger.js';
import {
  TriggerError,
  TriggerErrorCode,
  type TriggerConfig,
  type TriggerKind,
} from './types.js';

export interface IntervalTriggerSpec {
  intervalMs: number; // minimum 1000
}

const MIN_INTERVAL_MS = 1000;

export class IntervalTrigger extends BaseTrigger {
  readonly kind: TriggerKind = 'interval'; // after adding to types.ts
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(cfg: TriggerConfig, deps: TriggerDeps) {
    super(cfg, deps);
  }

  override validate(): void {
    const spec = this.cfg.spec as unknown as Partial<IntervalTriggerSpec>;
    if (
      typeof spec?.intervalMs !== 'number' ||
      spec.intervalMs < MIN_INTERVAL_MS
    ) {
      throw new TriggerError(
        `Trigger "${this.cfg.id}" (interval) requires spec.intervalMs >= ${MIN_INTERVAL_MS}`,
        TriggerErrorCode.INVALID_CONFIG,
        this.cfg.id,
      );
    }
  }

  override start(onFire: OnFireCallback): void {
    this.onFire = onFire;
    if (this.timer) return; // idempotent
    const { intervalMs } = this.cfg.spec as unknown as IntervalTriggerSpec;
    this.timer = setInterval(() => {
      void this.fireManually({ intervalMs, firedAt: Date.now() });
    }, intervalMs);
  }

  override stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.onFire = null;
  }
}
```

Add the factory case and the `types.ts` union entry. Done. ~50 lines of production code.

## 4. Testing conventions

Colocate as `<kind>-trigger.test.ts`. Required coverage per kind:

**`validate`**

- Every invalid-spec branch in your validate throws `TriggerError`
- A minimal valid spec passes

**`start` / `stop`**

- `start` attaches the expected listener (use test doubles or fakes — see below)
- `start` is **idempotent** (calling twice doesn't double-register)
- `stop` detaches cleanly and is **idempotent** (calling twice doesn't throw)
- After `stop`, external events no longer trigger `onFire`

**Fire flow**

- External event → `onFire` is called exactly once with the expected payload
- Payload shape matches what your `promptTemplate` examples claim (so `${changedPath}` etc. actually resolve)

**Testing without real side-effects** (patterns already used by existing kinds):

| Technique                                              | Used by                                        | When to reach for it                                       |
| ------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------- |
| `vi.mock('chokidar')` with a fake `EventEmitter`       | `file-trigger.test.ts`                         | External library with callback API                         |
| Constructor-inject a fake interface (e.g. `GitRunner`) | `system-trigger.test.ts`                       | Shell commands or network calls                            |
| Real Node `http` server on a random port               | `webhook-trigger.test.ts`                      | Protocols worth exercising end-to-end                      |
| `vi.useFakeTimers()` + `vi.advanceTimersByTime(n)`     | `file-trigger.test.ts`, `chat-trigger.test.ts` | Debounce, cooldown, polling                                |
| Pass `now` as a parameter                              | `chat-trigger.test.ts` `evaluate(text, now)`   | Prefer this over fake timers when the API can take a clock |

See [the testing guide](../users/features/triggers.md#how-we-do-testing) for the broader project conventions.

## 5. Docs updates

When you ship a new kind:

1. Add a `### kind=<your-kind>` block to [`triggers.md`](../users/features/triggers.md) — fields in `spec`, payload shape, limits and guard rails.
2. Add a recipe to [`triggers-cookbook.md`](../users/features/triggers-cookbook.md) that exercises it end-to-end.
3. Update `TriggerCreateTool`'s `description` field (in `packages/core/src/tools/trigger-create.ts`) so the LLM knows your kind exists.

Users shouldn't need to read this file to use your kind. If they do, the description or docs aren't clear enough.

## 6. When to _not_ add a kind

Check these before deciding:

- **Can an MCP server expose it?** MCP tools hot-plug without a rebuild. A "new data source" is almost always better as an MCP server plus a trigger of an existing kind.
- **Can `system` poll it?** `kind: system` will eventually grow beyond git (see the `process` TODO). If you only need periodic polling of a state, extend `system` rather than forking.
- **Is it a one-off?** Shelling out from a subagent with a `cron` trigger running shell commands covers many one-off automations without any new code.

Adding a kind is a permanent maintenance commitment. The five existing kinds have been intentionally kept — grow reluctantly.

## 7. Checklist before opening a PR

- [ ] `packages/core/src/triggers/<kind>-trigger.ts` — the class
- [ ] `packages/core/src/triggers/<kind>-trigger.test.ts` — validate, start, stop, fire, idempotency
- [ ] `packages/core/src/triggers/types.ts` — `TriggerKind` union extended
- [ ] `packages/core/src/triggers/factory.ts` — new `case`
- [ ] `packages/core/src/index.ts` — re-export the class
- [ ] `packages/core/src/tools/trigger-create.ts` — description updated with the new `spec` shape
- [ ] `docs/users/features/triggers.md` — new `### kind=<name>` section
- [ ] `docs/users/features/triggers-cookbook.md` — working recipe
- [ ] `npx tsc -b packages/core` — clean
- [ ] `npx vitest run packages/core/src/triggers` — all green, including regression on the other four kinds

If any of those boxes is unchecked, don't ship.
