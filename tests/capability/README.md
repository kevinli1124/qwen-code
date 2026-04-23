# Capability Test Suite

Exercises the qwen-code agent across 5 capability layers (推理 / 多語言編碼 / 文件 I/O / 自主性 / 長任務) using stream-json mode and deterministic-ish scoring.

## 前置

1. `npm ci` 裝依賴
2. `npm run build && npm run bundle` （確保 `dist/cli.js` 存在）
3. （可選）`npm run build:exe` 產 `qwen.exe`
4. 必須有已經設定好的 LLM（例如 `/auth` 跑過）

## 執行

```bash
# 走 qwen.exe（若存在）
node tests/capability/runner.mjs --label=baseline

# 指定 CLI（非 SEA 版）
node tests/capability/runner.mjs --label=baseline --cli=qwen.cmd

# 只跑特定題
node tests/capability/runner.mjs --only=T4.1,T4.4 --label=sanity

# 針對 promptProfile 做 A/B — helper 自動備份 / 還原 ~/.qwen/settings.json
node tests/capability/set-profile.mjs fork
node tests/capability/runner.mjs --label=profile-fork

node tests/capability/set-profile.mjs qwen-native
node tests/capability/runner.mjs --label=profile-qwen-native

node tests/capability/set-profile.mjs restore  # 還原原本設定

# 比對兩次結果
node tests/capability/diff-runs.mjs \
  tests/capability/runs/<ts>-profile-fork \
  tests/capability/runs/<ts>-profile-qwen-native \
  --out=tests/capability/runs/ab-report.md
```

## 產出

每次執行會建 `tests/capability/runs/<timestamp>-<label>/`：

- `<T-id>.jsonl` — 每題的完整 stream-json 事件
- `scorecard.json` — 自動評分
- `report.md` — human-readable 表格

## 評分

每題四維各 0-3 分（correctness / initiative / efficiency / learning），總分 ≥ 8/12 算 PASS。

## 加新題

在 `runner.mjs` 的 `TESTS` 陣列加一個 Test 物件：

```js
{
  id: 'T9.9',
  layer: 'L5',
  name: 'Something new',
  toolBudget: 5,
  prompt: '...',
  assert(events, finalText) {
    return {
      correctness: 3, initiative: 3, efficiency: 3, learning: 0,
      notes: '...',
    };
  },
}
```

## Running against Qwen models

Qwen family (qwen3.5 / qwen-max / qwen-plus) responds strongly to
`~/.qwen/QWEN.md` guidance but ignores softly-worded rules in system
context. Copy the validated guidance template before running:

```cmd
copy /y tests\capability\qwen-model-guidance.md %USERPROFILE%\.qwen\QWEN.md
```

Validated against Qwen3.5: **18/18 PASS, avg 9.00/12** (vs 17/18 / 8.89
baseline). See `runs/qwen35-findings.md` for the full experiment log and
why the directives are worded the way they are.

Tip: stick with `promptProfile: fork` on Qwen — `qwen-native` scored
lower (8.78) on Qwen3.5 even though it helped gemma slightly.

## 參考

- 完整計畫：`plan.md`（含所有手動 / 自動題設計）
- Qwen 模型實驗總結：`runs/qwen35-findings.md`
- Qwen 配置模板：`qwen-model-guidance.md`
- gemma 基線：`runs/2026-04-22-final-report.md`
