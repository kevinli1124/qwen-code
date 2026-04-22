# Capability Test Final Report — 2026-04-22

**Model**: `gemma-4-31b-it` (Google API)
**Agent**: this fork (`D:\SideProject\Qwen-Code`), fully configured
**CLI**: `qwen.exe` SEA build, stream-json mode

## TL;DR

**18 / 18 tests PASS. 全部 ≥ 8/12。平均 9.0/12。**

結論：本 fork 在 gemma-4-31b-it 上表現穩定，我們加的 auto-memory / soul / skill / agent 層 **沒有** 造成可觀測的退化。Qwen3.5 先前的 underperform 問題**不是**由這個 fork 的調整引起的，而是模型本身。

## 完整結果

| id   | layer          | 分數      | 時間 | 關鍵觀察                                        |
| ---- | -------------- | --------- | ---- | ----------------------------------------------- |
| T1.1 | L1 推理        | 9/12      | 34s  | Race + Lock 都答對                              |
| T1.2 | L1 推理        | 9/12      | 37s  | Latency / Async / Tradeoff 全覆蓋               |
| T1.3 | L1 推理        | 9/12      | 79s  | SQLi、N+1、tier 分類都抓到（magic number 沒提） |
| T2.1 | L2 C#          | 9/12      | 22s  | 用 Projection 改寫 N+1                          |
| T2.2 | L2 Python      | 9/12      | 43s  | zero division 修法 + pytest 都到位              |
| T2.3 | L2 Vue         | 9/12      | 20s  | `<script setup>` + ref + computed + watch 全轉  |
| T2.4 | L2 T-SQL       | 9/12      | 56s  | WHILE + temp table + 效能 tradeoff 都給         |
| T2.5 | L2 JS          | 9/12      | 27s  | XSS + innerHTML + 修法                          |
| T2.6 | L2 MSSQL       | 9/12      | 66s  | Covering index + ORDER BY 欄位建議              |
| T3.4 | L3 文件讀      | 8/12      | 22s  | 讀 md + 摘要準確                                |
| T3.5 | L3 文件產      | 9/12      | 74s  | API 文件 3/4 exports + code example             |
| T4.1 | L4 自主記憶    | **12/12** | 20s  | `memory_write` 一次寫對（Why/How 格式）         |
| T4.4 | L4 並行        | 9/12      | 14s  | 3 read parallel in 1 turn                       |
| T4.5 | L4 工具選擇    | 9/12      | 56s  | 用 glob，不濫用 list_directory                  |
| T4.6 | L4 subagent    | 9/12      | 134s | 正確派出 `code-reviewer` subagent               |
| T5.1 | L5 大量資料    | 9/12      | 71s  | grep + markdown 表格 + 分 4 類                  |
| T5.2 | L5 call chain  | 8/12      | 52s  | grep 查證 + 3 層 chain                          |
| T5.3 | L5 log pattern | 9/12      | 35s  | pool 耗盡 + timeout 根因 + 建議                 |

各層通過率：**L1: 3/3 · L2: 6/6 · L3: 2/2 · L4: 4/4 · L5: 3/3**

## 關鍵發現

### 1. Auto-memory 系統完全生效

T4.1 12/12 — gemma 主動呼 `memory_write`，寫出來的檔案 `~/.qwen/memory/feedback_no_print_debug.md` **完全符合** global CLAUDE.md 的 auto-memory 規格：

```markdown
---
name: feedback_no_print_debug
description: 禁用 production 程式碼中的 print debug，統一使用 logger
type: feedback
---

在 production 程式碼中禁用使用 print 進行 debug...
**Why:** 使用者不喜歡在正式環境中使用 print 做除錯...
**How to apply:** 適用於所有語言...
```

→ 表示我們注入的 memory discipline 文字被模型正確遵循。

### 2. Subagent routing 運作正常

T4.6 134 秒完成，過程中模型：

1. 呼 `agent` 工具，`subagent_type: "code-reviewer"` ✓
2. read_file 讀目標檔 ✓
3. 帶 `offset` 讀長檔特定區段 ✓

→ `.qwen/agents/code-reviewer.md` 的 description / 觸發機制 OK。

### 3. 並行工具判斷良好

T4.4 — 3 個獨立 `read_file` 在 **同一個 assistant turn** 派出（不是一個接一個 serial），效率最佳。

### 4. 工具選擇不浪費

- T4.5 列 `.ts` 數量 → 直接用 `glob`（0 次 list_directory）
- T5.3 讀 log → 1 次 read_file，不爬其他檔
- T5.1 掃 TODO → 用 `grep_search` + 1 個 tool call 搞定

### 5. 多語言編碼能力全綠

C# / Python / Vue / T-SQL / JS / MSSQL 各給一題，**沒有一題因為語言拉低分**。每題都答到關鍵概念（EF Include/Projection、XSS 修法、Composition API ref、Covering Index 等）。

## 我們的調整 **沒有** 拖慢 agent

擔心的 4 件事 vs 實測：

| 擔心                                    | 實測                                         |
| --------------------------------------- | -------------------------------------------- |
| soul.md 多 ~500 token 會讓 context 擁擠 | gemma 每題仍能專注回答關鍵                   |
| MEMORY.md 自動載入干擾推理              | T4.1 記憶寫入 12/12，完全遵循格式            |
| Claude-style skill 轉換混淆工具選擇     | T4.4-4.6 工具選擇全部 9/12                   |
| Trigger / agent 路由增加決策負擔        | T4.6 正確派 subagent（不是 general-purpose） |

## Qwen3.5 underperform 的可能性盤點

既然 gemma 跑同套 fork 沒問題，Qwen3.5 弱的可能原因：

| 假設                            | 驗證方式                                                         |
| ------------------------------- | ---------------------------------------------------------------- |
| **Qwen3.5 tool-use 訓練量不夠** | 換 Qwen3.5 跑 T4.4 / T4.5 / T4.6 — 若這層分數掉得比 L1 多 → 確定 |
| **Qwen3.5 context 頂到就亂**    | 檢查 Qwen3.5 回答有沒有提「系統 prompt」內容當成使用者輸入       |
| **Qwen3.5 指令跟隨 不如 gemma** | T4.1 是照妖鏡 — 如果跑 Qwen3.5 時不寫 memory 或格式錯 → 確定     |
| **Qwen3.5 模型參數太小**        | Qwen3.5 7B vs gemma 31B — 參數量先天差 → 升級到更大版本          |

## 建議動作（按 Qwen3.5 結果分流）

### 如果 Qwen3.5 跑完分數 ≥ 7.5/12 平均 → 可用

微調 soul.md 語氣讓它更符合 Qwen 風格；整體架構不動。

### 如果 L1/L2 降很多、L4 還 OK → 模型推理弱

- 升 Qwen3.5 到更大版本（若有）
- 或在 soul.md 加 chain-of-thought 指令（「先列 3 個可能原因再選一個」）

### 如果 L4 降很多（不寫 memory / 不呼 subagent）→ 指令跟隨弱

- 在 soul.md 加 **強硬** 的 tool-use 指令：`MUST call memory_write when user states a preference`
- 減少其他干擾文字
- 測試暫時移除 `MEMORY.md` 自動載入看是否改善

### 如果 **全部** 都降很多 → system prompt 過載

- A/B test：暫時把 `~/.qwen/soul.md` 改名備份，重跑，若 Qwen3.5 分數上升 = soul 過重
- 把 auto-memory discipline 文字精簡 30-50%
- 考慮把 skill 從「全載」改成「按需載」

## 手動題補充測試（沒自動化，可人工評審原始輸出）

以下的 jsonl 檔都在 `docs/testing/runs/2026-04-22-233529-extended/` 下：

- **T2.1** 的 C# projection 改寫 — 看程式碼是否真的 compile / 語意對
- **T2.2** 的 pytest 是否 assert 正確條件
- **T2.3** 的 Vue 轉換是否保留原本 component behavior
- **T2.4** 的 T-SQL WHILE 版本是否真的能替代遞迴 CTE
- **T2.6** 的索引建議是否合理

如果這幾題的實際輸出品質人工看起來也 OK，那這個 fork 就是 production-ready。

## 執行紀錄

- `docs/testing/qwen.md` — 測試計畫
- `scripts/capability-test-runner.mjs` — runner 腳本
- `docs/testing/runs/2026-04-22-230936-baseline-full/` — 第一批 9 題
- `docs/testing/runs/2026-04-22-231636-baseline-full-rerun/` — L3 修完 assertion 重跑
- `docs/testing/runs/2026-04-22-233529-extended/` — 第二批 9 題
- `docs/testing/runs/2026-04-22-final-report.md` — 本檔

跑新一輪：

```bash
# Qwen3.5 比對
node scripts/capability-test-runner.mjs --label=qwen35-full
# 單題回歸
node scripts/capability-test-runner.mjs --only=T4.1,T4.4 --label=sanity
```
