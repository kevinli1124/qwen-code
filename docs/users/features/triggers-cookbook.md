# Triggers cookbook

> Five copy-pasteable recipes — one per trigger kind — that exercise the full path from `.qwen/triggers/<id>.md` through [`TriggerManager`](triggers.md) into a forked [subagent](sub-agents.md). Use them to validate a fresh install, learn the YAML shape, or as starting points for your own automations.

Before you start:

1. Enable the experimental system: `experimental.cron: true` in [settings](../configuration/settings.md), or `QWEN_CODE_ENABLE_CRON=1` in your environment.
2. Create a test subagent at `.qwen/agents/echo.md` that will be forked by every recipe below:

   ```markdown
   ---
   name: echo
   description: Minimal subagent that echoes what fired it. Useful for trigger smoke tests.
   ---

   You were forked by a trigger. Your only job is to write the trigger payload you received to
   `./trigger-log.txt` (appending, one JSON line per invocation), then stop. Don't interact further.
   ```

3. Each recipe below goes in its own file under `<projectRoot>/.qwen/triggers/`.
4. After adding or changing a file, run `/reload triggers` to reconcile without restarting.

Each recipe lists: the file, what to do to fire it, and how to know it worked (usually "there's a new line in `trigger-log.txt`").

---

## Recipe 1 — cron: say hi every minute

**File** `.qwen/triggers/cron-smoke.md`

```yaml
---
id: cron-smoke
name: Cron smoke test
kind: cron
enabled: true
agentRef: echo
spec:
  cron: '* * * * *'
  recurring: true
---
cron fired at ${cronExpr}
```

**Fire it**: wait up to one minute. Cron runs a local-time 5-field expression.

**Verify**: `trigger-log.txt` grows by one line per minute.

**Notes**: `* * * * *` is deliberate for the smoke test — use more sparing expressions (`*/10 * * * *`, `0 * * * *`) for real work. Recurring cron triggers auto-expire after three days; disable with `/reload` if you want to pause without deleting.

---

## Recipe 2 — file: react to source changes

**File** `.qwen/triggers/file-smoke.md`

```yaml
---
id: file-smoke
name: Src change watcher
kind: file
enabled: true
agentRef: echo
spec:
  paths: ['src/**/*.ts']
  events: [change, add]
  debounceMs: 500
---
file ${event}: ${changedPath}
```

**Fire it**: `touch src/anything.ts` or edit a `.ts` file anywhere under `src/`.

**Verify**: within ~500 ms, one line appears in `trigger-log.txt`. Back-to-back saves within the debounce window coalesce to a single fire.

**Sanity checks**:

- `touch node_modules/x.ts` should **not** fire — `node_modules`, `.git`, `dist`, `.qwen` are in the enforced default ignore list.
- Delete a file → `event: unlink` only appears if `unlink` is in `spec.events`. We excluded it above, so deletions are silent.

---

## Recipe 3 — webhook: external POST fires a subagent

**File** `.qwen/triggers/webhook-smoke.md`

```yaml
---
id: webhook-smoke
name: Local webhook smoke test
kind: webhook
enabled: true
agentRef: echo
spec:
  path: /hooks/echo
  method: POST
---
webhook hit: ${method} ${path}, body: ${body}
```

**Fire it**: in another terminal, send a request to the local webhook server (it listens on `127.0.0.1:9876` by default):

```bash
curl -X POST http://127.0.0.1:9876/hooks/echo \
  -H 'content-type: application/json' \
  -d '{"source":"curl","note":"hello"}'
```

You should get back `202 Accepted` immediately (the subagent runs in the background).

**Verify**: `trigger-log.txt` has a new line.

**Bind to all interfaces** (so another machine can reach you): set `QWEN_TRIGGER_WEBHOOK_BIND=0.0.0.0` _before_ starting Qwen Code. When bound to a non-loopback address, the server refuses to register any webhook trigger that omits `spec.secretEnv` — this is intentional. To test that guard, add `bind: '0.0.0.0'` and register without a secret; `/reload triggers` should surface the refusal.

**With HMAC** (recommended for non-loopback):

```yaml
spec:
  path: /hooks/echo
  method: POST
  secretEnv: ECHO_WEBHOOK_SECRET
```

Then:

```bash
export ECHO_WEBHOOK_SECRET=shh
BODY='{"source":"curl"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$ECHO_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST http://127.0.0.1:9876/hooks/echo \
  -H "x-trigger-signature: sha256=$SIG" \
  -H 'content-type: application/json' \
  -d "$BODY"
```

A missing or wrong signature returns `401`.

---

## Recipe 4 — chat: summon a subagent with a keyword

**File** `.qwen/triggers/chat-smoke.md`

```yaml
---
id: chat-smoke
name: Summon echo via chat keyword
kind: chat
enabled: true
agentRef: echo
spec:
  patterns: ['summon echo']
  matchMode: substring
  cooldownMs: 5000
---
user said: ${matchedText}
```

**Fire it**: in the main Qwen Code REPL, send a message containing `summon echo` (any capitalization).

**Verify**: `trigger-log.txt` grows. The main chat continues normally — the subagent runs concurrently.

**Try the cooldown**: send `summon echo` twice within five seconds. The second should not fire. Wait five seconds, try again, fires once more.

**Regex mode**: replace `matchMode: substring` with `matchMode: regex` and `patterns: ['deploy-\\d+']` to match `deploy-42` style tokens; payload `${matchedText}` becomes the matched substring instead of the whole pattern.

---

## Recipe 5 — system (git): on branch switch, summarize

**File** `.qwen/triggers/git-branch.md`

```yaml
---
id: git-branch
name: Branch change briefer
kind: system
enabled: true
agentRef: echo
spec:
  event: git
  on: branch-change
  pollMs: 2000
---
branch changed ${previous} → ${current}
```

**Fire it** (in the project root, while Qwen Code is running):

```bash
git checkout -b smoke-test-branch
```

**Verify**: within ~2 seconds, `trigger-log.txt` grows.

**Change to `on: commit`** to watch HEAD commit-sha changes instead:

```yaml
spec:
  event: git
  on: commit
  pollMs: 5000
```

Then `git commit --allow-empty -m test`. Within 5 s, fires.

**Sanity check**: the **first** poll after the trigger starts just establishes a baseline — it does _not_ fire. If you see a phantom fire on startup, the baseline logic isn't engaging correctly; restart and re-verify.

---

## After you're done

```
/reload triggers   # confirm count matches expectations
```

Then delete the smoke files (`rm .qwen/triggers/*-smoke.md .qwen/triggers/git-branch.md`) or toggle them off:

```
disable the cron-smoke trigger
disable the file-smoke trigger
# ...
```

(These map to the `TriggerToggle` tool under the hood; the LLM figures it out from natural language.)

## What this cookbook proves

If you ran all five recipes and each produced a line in `trigger-log.txt`, you've verified:

- YAML frontmatter parsing (`.qwen/triggers/*.md`)
- `TriggerManager.startAll` discovers and registers triggers at session start
- `SubagentManager.createAgentHeadless` forks the bound `echo` subagent
- Memory index is injected into the forked subagent (echo sees the discipline block even if it has no memories of its own)
- Each kind's external source (cron scheduler / chokidar / http server / Session chat hook / git poller) wires through to the agent fire path

That's the entire trigger→subagent→memory stack exercised end-to-end. Any failure narrows the investigation to one of those layers.

## See also

- [Triggers overview](triggers.md) — full config reference, safety limits, discipline.
- [Subagents](sub-agents.md) — how `.qwen/agents/*.md` works.
- [Scheduled tasks](scheduled-tasks.md) — the in-session, prompt-queue cousin of cron triggers.
