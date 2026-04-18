# Triggers: Persistent, Agent-Driven Automations

> Use `.qwen/triggers/` and the `Trigger*` tools to wire a [subagent](sub-agents.md) to a real-world event — a cron schedule, a file change, an HTTP webhook, a chat keyword, or a git state change — and have that agent run in the background when the event fires.

Triggers are the persistent cousin of [scheduled tasks](scheduled-tasks.md). Where `CronCreate` schedules a session-only prompt that feeds back into your main chat, a trigger is a YAML file on disk that **binds an event source to a specific subagent**. When the event fires, Qwen Code forks that subagent in the background without interrupting your current turn.

> **Note:** Triggers are experimental and share a feature flag with scheduled tasks. Enable them with `experimental.cron: true` in your [settings](../configuration/settings.md), or set `QWEN_CODE_ENABLE_CRON=1` in your environment.

## How triggers differ from scheduled tasks

| Scheduled task (`CronCreate`)              | Trigger (`TriggerCreate`)                                        |
| :----------------------------------------- | :--------------------------------------------------------------- |
| Lives in memory for this session only.     | Written to `.qwen/triggers/<id>.md`, survives restarts.          |
| Fires a plain prompt into your main chat.  | Forks a named [subagent](sub-agents.md) that runs in background. |
| Only one kind: cron.                       | Five kinds: `cron`, `file`, `webhook`, `chat`, `system`.         |
| Each fire occupies your main session turn. | Each fire is concurrent — up to 3 trigger agents at once.        |

Triggers and scheduled tasks coexist. You can still use `/loop` or `CronCreate` for quick in-session loops, and reserve triggers for anything you want to keep running across restarts or off the critical path.

## The config file

Every trigger is a Markdown file with YAML frontmatter, stored in one of two places:

- `.qwen/triggers/<id>.md` in your project root — shared with the repo, versioned with the codebase.
- `~/.qwen/triggers/<id>.md` in your home directory — personal, applies across all projects.

Project-level entries take precedence over user-level entries with the same id.

```yaml
---
id: watch-src
name: Src Change Guard
kind: file
enabled: true
agentRef: code-reviewer
spec:
  paths: ['src/**/*.ts']
  events: [change, add]
  debounceMs: 500
---
File ${changedPath} was ${event}d. Review the diff and flag risks.
```

- `id` — stable slug, letters/digits/dot/dash/underscore, becomes the filename.
- `name` — human-readable label.
- `kind` — one of `cron`, `file`, `webhook`, `chat`, `system`.
- `enabled` — defaults to `true`. Disabled triggers stay in the file but don't register at session start.
- `agentRef` — the [subagent](sub-agents.md) name, resolved from `.qwen/agents/<name>.md`.
- `spec` — kind-specific parameters (see each kind below).
- Body — the prompt template sent to the subagent. Supports `${key}` placeholders filled from the trigger payload. If omitted, Qwen Code generates a default descriptive prompt.

## The tools

Triggers are managed through four tools. You can ask Qwen Code in natural language ("create a trigger that…", "list my triggers", "disable the deploy hook") and it will reach for them:

| Tool            | Purpose                                                        |
| :-------------- | :------------------------------------------------------------- |
| `TriggerCreate` | Write a new trigger file at project or user level.             |
| `TriggerList`   | List persisted triggers, optionally filtered by kind or state. |
| `TriggerToggle` | Enable or disable a trigger without deleting its config.       |
| `TriggerDelete` | Remove the file and stop the running trigger.                  |

## The five kinds

### `cron` — time-based

Runs on a 5-field cron expression. Uses the same scheduler as `CronCreate` under the hood, but forks the named subagent instead of feeding the prompt back into the main session.

```yaml
---
id: daily-review
name: Daily Code Review
kind: cron
enabled: true
agentRef: code-reviewer
spec:
  cron: '0 9 * * 1-5'
  recurring: true
---
Review yesterday's commits and post a summary.
```

- `spec.cron` — standard 5-field expression in local time.
- `spec.recurring` — defaults to `true`. Set `false` for one-shot.

See [scheduled tasks](scheduled-tasks.md#cron-expression-reference) for cron syntax details.

### `file` — filesystem changes

Watches paths and fires when files are added, changed, or deleted. Backed by [chokidar](https://github.com/paulmillr/chokidar), so glob patterns work cross-platform.

```yaml
---
id: watch-migrations
name: Flag Schema Drift
kind: file
enabled: true
agentRef: schema-auditor
spec:
  paths: ['migrations/**/*.sql']
  events: [add, change]
  debounceMs: 800
---
Migration ${changedPath} was ${event}d. Check for destructive statements.
```

- `spec.paths` — up to 20 glob entries.
- `spec.events` — any subset of `add`, `change`, `unlink`. Defaults to all three.
- `spec.debounceMs` — minimum 100, default 500. Per-(event,path) debounce prevents a burst from firing the agent multiple times.
- `spec.ignoreInitial` — defaults to `true`. Set `false` to get an `add` for every existing file at startup.
- `spec.ignored` — extra ignore globs appended to the defaults below.

The default ignore list is `node_modules/`, `.git/`, `dist/`, and `.qwen/` — these cannot be un-ignored. Supply `ignored` to add more.

Payload: `{ event, changedPath }`.

### `webhook` — HTTP

Registers a route on a shared HTTP server. The server is a single Node process listening on one port, started lazily when the first webhook trigger loads.

```yaml
---
id: deploy-hook
name: Audit Deploy Webhook
kind: webhook
enabled: true
agentRef: deploy-auditor
spec:
  path: /hooks/deploy
  method: POST
  secretEnv: DEPLOY_WEBHOOK_SECRET
---
Deploy webhook fired: ${json}
```

- `spec.path` — URL path (leading `/` optional).
- `spec.method` — one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. Default `POST`.
- `spec.secretEnv` — name of a process env var holding an HMAC-SHA256 secret. The server rejects requests whose `X-Trigger-Signature` header (optionally `sha256=`-prefixed, GitHub-style) doesn't match.
- `spec.allowedIPs` — exact-match client IP allowlist. Empty means allow all.

The server binds to `127.0.0.1:9876` by default. Override with `QWEN_TRIGGER_WEBHOOK_PORT` and `QWEN_TRIGGER_WEBHOOK_BIND` environment variables. If you set `QWEN_TRIGGER_WEBHOOK_BIND` to anything other than loopback, every webhook trigger must declare `secretEnv` — Qwen Code refuses to register unauthenticated public routes.

Body size is capped at 1 MB. Requests receive `202 Accepted` immediately; the subagent runs in the background.

Payload: `{ method, path, headers, query, body, json?, ip }`. The `json` field is the parsed body when `Content-Type: application/json`.

### `chat` — keyword in a user message

Fires when your next message to Qwen Code matches a pattern. Qwen Code evaluates every user turn against the registered chat triggers.

```yaml
---
id: oncall-help
name: Summon oncall researcher
kind: chat
enabled: true
agentRef: incident-researcher
spec:
  patterns: ['@oncall']
  matchMode: mention
  cooldownMs: 60000
---
User pinged oncall: ${matchedText}. Start pulling recent alerts.
```

- `spec.patterns` — up to 10 entries.
- `spec.matchMode` — one of:
  - `substring` (default): case-insensitive plain-text match.
  - `regex`: each pattern is compiled as a JavaScript regex. Patterns that blow a 50 ms per-match budget are abandoned silently.
  - `mention`: matches `@<pattern>` literally.
- `spec.cooldownMs` — default 10_000. A trigger that fires won't fire again until the cooldown elapses, even if the user types the same keyword repeatedly.

Chat triggers fire concurrently with your main turn — the main session continues normally, and the forked subagent runs on the side.

Payload: `{ matchedPattern, matchedText }`.

### `system` — git state change

Polls git state in the working tree and fires when it changes. The only `event` supported today is `git`; process monitoring is reserved for a future version.

```yaml
---
id: on-branch-switch
name: Announce branch change
kind: system
enabled: true
agentRef: branch-briefer
spec:
  event: git
  on: branch-change
  pollMs: 3000
---
Branch changed from ${previous} to ${current}. Summarize open work on the new branch.
```

- `spec.on` — `commit` (watches `git rev-parse HEAD`) or `branch-change` (watches `git symbolic-ref --short HEAD`).
- `spec.pollMs` — minimum 1000, default 5000.
- `spec.cwd` — where to run git. Defaults to the current working directory.

The first poll after the trigger starts only establishes a baseline; nothing fires until the value actually changes. Transient git errors (not a repo, detached HEAD, etc.) are logged and the next poll retries — a single failure doesn't kill the trigger.

Payload: `{ event, previous, current }` where `previous` and `current` are either commit SHAs or branch names depending on `on`.

## Prompt templates

The body of the Markdown file is the prompt sent to the subagent. Placeholders in `${name}` form are substituted from the payload at fire time:

```markdown
File ${changedPath} was ${event}d at ${trigger.firedAt}.
```

Known namespaces:

- `${key}` — top-level payload fields (`changedPath`, `matchedText`, `cronExpr`, …).
- `${payload.key}` — explicit payload access; same values.
- `${trigger.key}` — the full `TriggerContext` (`triggerId`, `kind`, `firedAt`, `payload`).
- Unknown placeholders are left verbatim — that way a template written for one kind still loads even if a field is missing.

## Safety and limits

Triggers run subagents in the background, so bad configs can chew through API calls. The system includes guard rails:

- **Max 3 concurrent trigger-fired agents across the process.** A fire that arrives while the cap is saturated is dropped and logged, not queued.
- **File triggers cap at 20 watch paths and enforce a minimum 100 ms debounce.** The ignore list (`node_modules/`, `.git/`, `dist/`, `.qwen/`) cannot be turned off.
- **Webhook triggers reject public binds without an HMAC secret** and cap request bodies at 1 MB.
- **Chat triggers cap at 10 patterns per trigger**, apply a 50 ms regex-execution budget, and default to a 10-second cooldown.
- **System triggers enforce `pollMs >= 1000`** and swallow transient git errors.
- **Agent fork failures are caught and logged** — a single trigger can't crash the session.

When you're iterating on a new trigger, start disabled (`enabled: false`), toggle it on with `TriggerToggle`, and watch the subagent events before letting it run unattended.

## Turn triggers on and off

Disable a trigger without losing its config:

```text
disable the deploy webhook
```

Under the hood that calls `TriggerToggle`. The file stays put with `enabled: false`, and the running watcher/route is stopped. Re-enabling it registers the trigger without reloading other triggers.

Delete a trigger for good:

```text
delete the watch-src trigger
```

That calls `TriggerDelete` and removes the file from `.qwen/triggers/`.

## Limitations

- Triggers only run while Qwen Code is running. Closing the session stops every watcher, cron job, webhook server, chat evaluator, and git poller.
- There is no catch-up after restart — an event that happened while Qwen Code was down is never replayed.
- The webhook server binds a single port per process. Running two Qwen Code sessions on the same machine with overlapping trigger sets will fight over that port; set `QWEN_TRIGGER_WEBHOOK_PORT` to split them.
- Process-event `system` triggers are not implemented yet; only git events are supported.
