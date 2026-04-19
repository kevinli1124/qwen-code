# Messaging gateway: talk to Qwen Code from anywhere

> Wire a messaging platform (Telegram in phase 1; Discord / Slack next) to a
> persistent subagent. Send a question from your phone, get a reply in the
> same thread, then pick the conversation up later in the terminal. Built on
> the [trigger system](triggers.md), so it reuses memory injection, the
> concurrency cap, and the `.qwen/` config discipline.

A messaging trigger is a single YAML file at `.qwen/triggers/<id>.md`. When
Qwen Code starts, the gateway connects to the platform and forwards every
incoming message to a [subagent](sub-agents.md) whose reply is routed back to
the same chat. Conversation history lives on disk at
`.qwen/conversations/<channel>_<chatId>.jsonl`, so turns survive restarts and
can be resumed from the CLI.

> **Note:** Messaging triggers share the experimental `experimental.cron` flag
> (or `QWEN_CODE_ENABLE_CRON=1`) with the rest of the trigger system. Phase 1
> supports Telegram only.

## How it compares

| Trigger kind                | Direction            | State              |
| :-------------------------- | :------------------- | :----------------- |
| `chat` (in-session keyword) | Main turn only       | None               |
| `message` (this doc)        | Inbound → reply back | Per-chat JSONL log |
| `webhook`                   | Inbound, no reply    | None               |

Message triggers are the one trigger kind where the subagent's reply is
surfaced back to the user — so use it for assistant-style interaction, not
background audits.

## Prerequisites: get a Telegram bot token

1. Open Telegram, search for **@BotFather**, start a chat.
2. Send `/newbot`. Follow the prompts:
   - **Name**: any human-readable label, e.g. `My Qwen Assistant`.
   - **Username**: must end in `bot`, e.g. `my_qwen_assistant_bot`.
3. BotFather replies with a token like `7890123456:AAE...`. **Keep it
   secret** — anyone with the token can impersonate your bot.
4. Message **@userinfobot** to find your numeric Telegram user id — you'll
   need it for the allowlist.
5. (Optional) send `/setprivacy` to @BotFather → pick your bot → `Disable`.
   This lets the bot see every message in group chats, not just those that
   @-mention it. For personal-assistant use you can leave privacy on.

### Easiest path: interactive setup in Qwen Code

Run Qwen Code, then:

```
> /setup-gateway telegram
```

A dialog opens asking for the token (masked input) and your allowlist
(comma-separated user ids). When you submit, Qwen Code calls
`api.telegram.org/getMe` to validate the token and, on success, saves both
values to `~/.qwen/settings.json` under `messaging.telegram.*`. Nothing you
type flows through the LLM or lands in terminal scrollback — the dialog is
rendered locally, credentials stay on disk.

Restart Qwen Code once after saving so the `MessageTrigger` reads the new
values at boot.

### Alternative: environment variables

Env vars still take precedence over `settings.json` when both are set —
useful for CI, containers, or one-shot testing:

```bash
# macOS / Linux
export TELEGRAM_BOT_TOKEN='7890123456:AAE...'
export TELEGRAM_ALLOWED_USER_IDS='123456789'   # comma-separated for multiple
```

```powershell
# Windows PowerShell
$env:TELEGRAM_BOT_TOKEN = '7890123456:AAE...'
$env:TELEGRAM_ALLOWED_USER_IDS = '123456789'
```

When the allowlist is empty, _every_ sender is accepted — fine for initial
testing, but don't leave it that way. An empty allowlist + a public bot =
anyone on Telegram can drive your agent.

### Credential precedence

At bot startup, the gateway reads credentials in this order:

1. **Trigger spec override** — `spec.token` / `spec.allowedUserIds` in the
   YAML file, for per-trigger overrides (rare; meant for advanced setups).
2. **Environment variable** — `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALLOWED_USER_IDS`.
3. **User settings** — `messaging.telegram.{token,allowedUserIds}` in
   `~/.qwen/settings.json`, written by `/setup-gateway telegram`.

Pick one source; don't split values across two.

## Minimal trigger

`.qwen/triggers/telegram.md`:

```yaml
---
id: telegram
name: Telegram personal assistant
kind: message
enabled: true
spec:
  channel: telegram
---
```

No `agentRef` → Qwen Code uses the built-in default assistant (see
[Default agent](#default-agent) below). Start the CLI with the trigger
system enabled:

```bash
QWEN_CODE_ENABLE_CRON=1 qwen-code
```

Send your bot a message on Telegram. Within a few seconds it should reply.
Conversation history lands in
`.qwen/conversations/telegram_<yourChatId>.jsonl`.

## Pin a specific subagent

Bind the gateway to one of your `.qwen/agents/*.md` personas:

```yaml
---
id: telegram-reviewer
name: Remote code reviewer
kind: message
enabled: true
agentRef: code-reviewer
spec:
  channel: telegram
  promptPrefix: '[via Telegram]'
  historyWindow:
    maxMessages: 15
    maxChars: 6000
---
```

- `agentRef` — name of a subagent file. Omit it to use the default assistant.
- `spec.promptPrefix` — prepended to the user's text so the agent knows the
  channel. Purely cosmetic.
- `spec.historyWindow` — bounds on how much prior conversation is injected
  as `extraHistory` on each turn. Defaults to `{ maxMessages: 20, maxChars:
8000 }` — conservative so long threads don't blow up context.

## Continue a conversation in the terminal

Conversation logs are plain JSONL. Each line is a `MessageRecord`:

```jsonc
{"role":"user","text":"summarize today's commits","timestamp":1735100000000, ...}
{"role":"assistant","text":"You pushed 3 commits...","timestamp":1735100005000, ...}
```

To pick up a Telegram thread at the terminal, read the file and hand the
contents to the model — any approach you like. The structured log also makes
post-hoc auditing trivial: `jq -r '.text' .qwen/conversations/telegram_*.jsonl`.

> Phase 2 will ship `/chat list` and `/chat resume <id>` slash commands for
> first-class CLI attach. The format above is stable — scripts you build now
> will keep working.

## Default agent

When a message trigger omits `agentRef`, the dispatcher forks a synthetic
subagent named `__default_assistant__`. It has:

- A short "you are a personal assistant on a messaging channel" system prompt.
- No tool restrictions — full access to the main tool registry.
- The same [memory injection](../configuration/memory-configuration.md) as
  any other subagent: the memory index is appended to its system prompt, and
  any memories tagged with `agent: __default_assistant__` are loaded in full.

If you want a long-lived personality for the default, write memories tagged
for that agent name, or just create `.qwen/agents/assistant.md` and reference
it explicitly — that's the recommended setup for non-trivial use.

## Spec reference

```yaml
spec:
  channel: telegram # required; only telegram in phase 1
  allowedUserIds: ['1', '2'] # optional; falls back to TELEGRAM_ALLOWED_USER_IDS
  token: '7890:AAE...' # optional; prefer TELEGRAM_BOT_TOKEN env
  promptPrefix: '[telegram]' # optional; prepended to the user turn
  errorReply: 'Hit an error, try again.' # optional; '' suppresses error replies
  historyWindow:
    maxMessages: 20 # default 20
    maxChars: 8000 # default 8000 (~2k tokens)
```

## Safety and limits

- **User allowlist** — configure it. Without one, anyone who finds the bot
  can drive a subagent in your workspace.
- **Concurrency** — message triggers share the global trigger cap (3
  concurrent subagent forks). A fourth message while three are in flight is
  dropped with a warning. In practice Telegram delivers updates serially per
  chat, so this only matters across chats.
- **History window** — keep it tight on shared personas. Long threads can
  push subagent context past its limit; defaults are deliberately
  conservative.
- **Token hygiene** — never commit `TELEGRAM_BOT_TOKEN` to a repo. The `spec.token`
  field exists for testing, but production setups should use the env var.
- **No catch-up** — when Qwen Code is down, the bot is unreachable. Telegram
  will buffer incoming messages briefly but long outages mean lost messages.

## Running in the background

The gateway only runs while Qwen Code is running. In phase 1 that means an
interactive REPL in a terminal somewhere. A dedicated `--daemon` flag that
boots the trigger system without the REPL is on the phase-2 roadmap; until
then, use your OS's standard "keep a terminal alive" pattern.

**Linux / macOS** — keep a REPL alive via `tmux` / `screen`, or wrap it in
a systemd user unit that opens the REPL:

```ini
# ~/.config/systemd/user/qwen-code.service
[Unit]
Description=Qwen Code personal assistant
After=network-online.target

[Service]
Type=simple
Environment=TELEGRAM_BOT_TOKEN=7890:AAE...
Environment=TELEGRAM_ALLOWED_USER_IDS=123456789
Environment=QWEN_CODE_ENABLE_CRON=1
WorkingDirectory=%h/projects/my-workspace
# Phase 1: run under tmux so the REPL has a tty. Replace with `--daemon`
# once phase 2 ships.
ExecStart=/usr/bin/tmux new-session -d -s qwen '/usr/bin/qwen-code'
ExecStop=/usr/bin/tmux kill-session -t qwen
Restart=on-failure

[Install]
WantedBy=default.target
```

`systemctl --user enable --now qwen-code`, then attach with
`tmux attach -t qwen` whenever you want to interact.

**Windows** — simplest is to leave Qwen Code running in a persistent
Windows Terminal tab. For auto-start, use Task Scheduler → _At log on_ →
Action _Start a program_ with Windows Terminal launching `qwen-code` in your
project folder. Ensure the environment variables are set at user scope (not
just in the shell profile) so Task Scheduler picks them up.

> Once the `--daemon` flag ships in phase 2, these steps simplify to a
> single `ExecStart=qwen-code --daemon` line with no tmux indirection.

## See also

- [Triggers overview](triggers.md) — the underlying trigger infrastructure.
- [Subagents](sub-agents.md) — authoring the persona behind the gateway.
- [Memory configuration](../configuration/memory-configuration.md) — how
  agent-scoped memories are surfaced to message triggers.
