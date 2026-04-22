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

# 針對 promptProfile 做 A/B
# fork 全開（預設）
node tests/capability/runner.mjs --label=profile-fork
# 在 settings.json 裡 general.promptProfile = "qwen-native" 之後重跑
node tests/capability/runner.mjs --label=profile-qwen-native
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

## 參考

- 完整計畫：`plan.md`（含所有手動 / 自動題設計）
- 最新基線：`runs/2026-04-22-final-report.md`
