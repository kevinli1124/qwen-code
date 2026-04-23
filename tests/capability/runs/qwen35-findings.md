# Qwen3.5 Capability Findings

**Model**: `qwen3.5-*`（正式跑的是 user 那台另一台電腦）
**Fork**: this repo (kevinli1124/qwen-code)
**Date**: 2026-04-23
**Final score**: **18/18 PASS · avg 9.00 / 12** — highest across all configurations tested.

## TL;DR

1. **Qwen3.5 + 本 fork + QWEN.md 指令**（見 `tests/capability/qwen-model-guidance.md`）= **18/18 PASS**，比 gemma-4-31b-it + 同 fork 的 17/18 還高。
2. **我們 fork 的注入層（soul.md / MEMORY.md / discipline）不是瓶頸** — 原本擔心 Qwen3.5 被注入文字拖累，實測完全沒有，反而在 Qwen3.5 上 `fork` profile > `qwen-native`。
3. 真正的弱點在**模型行為偏好**（不派 subagent、scan 時 tool 過度呼叫），用 `~/.qwen/QWEN.md` 兩條指令即可修復。

## 實驗軌跡

### 基線（4 組）

| 配置                                       | Avg  | Pass  |
| ------------------------------------------ | ---- | ----- |
| gemma `fork`                               | 8.72 | 16/18 |
| gemma `qwen-native`                        | 8.89 | 17/18 |
| Qwen3.5 `fork`（沒加 QWEN.md 指令）        | 8.89 | 17/18 |
| Qwen3.5 `qwen-native`（沒加 QWEN.md 指令） | 8.78 | 16/18 |

→ **在 Qwen3.5 上，`fork` profile 略勝 `qwen-native`**（跟 gemma 相反）。Fork profile 從此定案。

### Qwen3.5 的兩個主要弱點

| 題               | 現象                  | 根因                                                   |
| ---------------- | --------------------- | ------------------------------------------------------ |
| T4.6 code review | `agent=false` tools=2 | 不派 code-reviewer subagent，自己硬做                  |
| T5.1 TODO 掃描   | tools=11-41 FAIL 7/12 | Trust-but-verify：grep 後對每個 match `read_file` 一次 |

### 逐步修復

| 嘗試                                             | T4.6                | T5.1                  | 備註                                  |
| ------------------------------------------------ | ------------------- | --------------------- | ------------------------------------- |
| baseline (no QWEN.md directives)                 | agent=false 8/12    | tools=11 FAIL 7/12    | —                                     |
| 加 Subagent Delegation 表格到 QWEN.md            | **agent=true 9/12** | tools=41 變更糟       | subagent 指令生效，但 scan 沒約束更亂 |
| 加 Tool Economy 「budget 5」                     | —                   | tools=29 still FAIL   | 「budget」字眼對 Qwen3.5 太軟         |
| 改「budget 2」+「BANNED after grep_search」      | —                   | **tools=5 PASS 9/12** | 硬性禁令才壓得住                      |
| 完整 18 題重跑（含 exception 條款）              | **agent=true 9/12** | **tools=3 PASS 9/12** | T5.2 因 BANNED 波及掉 1 分            |
| 加 exception: 「call-chain tracing 可讀 5 個檔」 | 9/12                | 9/12                  | **T5.2 補回 9/12，全部 18/18 PASS**   |

最終 QWEN.md template 在 `tests/capability/qwen-model-guidance.md`。

## 關鍵教訓（對未來 Qwen 模型調教有用）

1. **QWEN.md 比 soul.md 對 Qwen 更直接** — Qwen 訓練時應該特別關注 QWEN.md，系統提示詞的 soul.md 影響力弱。
2. **Qwen 需要硬性語言**：
   - ❌ `prefer` / `consider` / `try to` — 被忽略
   - ✅ `MUST` / `BANNED` / `Hard budget: N` / `Violation = task failure` — 生效
3. **表格化規則 > 文字敘述** — 「User says → Spawn subagent」對照表比散文長段有用。
4. **Qwen3.5 有 trust-but-verify 傾向** — 工具回傳後會再 double-check，要明說「工具輸出就是證據」。
5. **硬規則要留 Exception** — 太廣的禁令會誤傷合法用途（T5.2 call-chain tracing 被 scan 禁令誤中）。

## 剩下 1 題沒 full score 的原因（T2.2 8/12）

T2.2 Python bug fix + pytest — `test=false`。Qwen3.5 寫出修法但沒附 pytest 測試。這不是 context/指令問題，是模型對「unless asked」的預設不寫測試。如果要修，可以在 QWEN.md 加「when fixing a bug, always include a pytest regression test」— 但這不在本次實驗範圍。

## 其他觀察

- **Qwen3.5 比 gemma 強的點**：
  - T1.3: 抓到 magic number `[:20]`（gemma 漏了）
  - T3.5: API 文件 4/4 exports 全覆蓋（gemma 3/4）
- **一樣的點**：
  - T4.1 memory_write 12/12（兩個模型都完美遵循我們 fork 的 memory discipline）
  - T4.4 parallel tool call 9/12（都能同 turn 並行）
- **Qwen3.5 比 gemma 弱的點**：
  - T4.6 subagent delegation（需要 QWEN.md 強化才會派）
  - T5.1 掃描 tool economy（需要硬性禁令才會收斂）

## 複現命令

```cmd
REM 切 fork profile（Qwen3.5 最佳）
node tests/capability/set-profile.mjs fork

REM 安裝 QWEN.md 指令
copy /y tests\capability\qwen-model-guidance.md %USERPROFILE%\.qwen\QWEN.md

REM 跑 18 題
node tests/capability/runner.mjs --label=qwen35-validated
```

預期：18/18 PASS、avg 9.00/12、T4.6 `agent=true`、T5.1 tools ≤ 5。

## 原始 run 資料

- `tests/capability/runs/2026-04-23-075357-qwen35-fork/` — Qwen3.5 baseline (無 QWEN.md 指令)
- `tests/capability/runs/2026-04-23-080201-qwen35-native/` — Qwen3.5 qwen-native profile
- `tests/capability/runs/2026-04-23-085137-qwen35-qwenmd/` — 加 Subagent Delegation 後的 T4.6+T5.1
- `tests/capability/runs/2026-04-23-085713-qwen35-tool-economy/` — 加 Tool Economy budget 5
- `tests/capability/runs/2026-04-23-091027-qwen35-hard-rules/` — 改成 budget 2 + BANNED
- `tests/capability/runs/2026-04-23-091816-qwen35-fork-with-qwenmd/` — 完整 18 題
- `tests/capability/runs/2026-04-23-093801-qwen35-exception/` — T5.2 exception 驗證
