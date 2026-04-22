# Qwen Code Capability Test Plan

> 目的：量化這個 fork 的 agent 在哪些能力維度達標、哪些不達標，並把失敗歸因到可修的位置。
>
> 測試對象：本 repo 的 qwen-code agent（目前走 Google API + `gemma-4-31b-it`，未來換 `qwen3.5`）。
>
> 設計原則：**能自動判斷的就自動**（靠 stream-json 輸出的結構化事件），**需要人類評審的標記 M**（Manual）。

---

## 背景假設

這個 fork 在 [Alibaba `QwenLM/qwen-code`] 基礎上加了：

- `soul.md` 自動注入（~300-1000 tokens）
- `MEMORY.md` 索引 + 記憶管理 discipline 文字
- Claude-style skill 自動轉換（skill body 可能是英文 Claude 指令）
- Agent/Subagent trigger 系統
- Onboarding wizard、auto-memory hooks、episode 層

以上都是**加在 system prompt 前面或注入到 context**，對 Claude 無傷，但 Qwen3.5 context 感受性比 Claude 高，可能拖累推理品質。測試要能把這點**量化**。

---

## Bisect 開關

每組測試要跑兩次（或多次），切換以下設定比較：

| 設定鍵                  | A: 原生最小 | B: 本 fork 全開     |
| ----------------------- | ----------- | ------------------- |
| `~/.qwen/soul.md`       | 不存在      | 存在（預設 soul）   |
| `~/.qwen/memory/`       | 空          | 有累積記憶          |
| project `.qwen/skills/` | 空          | 本 fork 內建 skills |
| `.qwen/agents/`         | 空          | 本 fork 內建 agents |

→ 效能差 = 我們的注入項在拖。效能類似 = 模型本身問題。

---

## 評分維度（每題 0-3 分）

| 維度            | 3                        | 2               | 1                  | 0                   |
| --------------- | ------------------------ | --------------- | ------------------ | ------------------- |
| **Correctness** | 完全正確                 | 主幹對但細節錯  | 方向對但有明顯錯誤 | 錯方向或無回應      |
| **Initiative**  | 主動呼工具/skill/memory  | 被提示才呼      | 遺漏應呼的         | 該呼不呼            |
| **Efficiency**  | 工具呼叫數 ≤ 理想值      | 1-2 個多餘 call | ≥ 3 個多餘         | 無限 loop / timeout |
| **Learning**    | 主動寫 memory / 建 skill | 被提示才寫      | 寫了但內容空       | 不寫                |

**總分 < 8/12 = 需要處理**，記錄歸因。

---

## 失敗歸因矩陣

| 失敗樣態            | 歸因類別         | 修在哪                                      |
| ------------------- | ---------------- | ------------------------------------------- |
| 選錯工具 / 該呼不呼 | 系統 prompt 歧義 | `CLAUDE.md` / `soul.md` / agent description |
| 不知道怎麼做        | 缺知識           | 寫 skill / 掛 MCP server                    |
| 做對但格式亂        | 輸出指令鬆散     | skill body / output spec                    |
| 重複犯同樣錯        | 記憶沒起作用     | memory trigger / distill                    |
| 只有某模型會錯      | 模型能力         | 換模型或降期望                              |
| tool 壞了           | 工具 bug         | 修 `packages/core/src/tools/*`              |

---

## 測試批

### L1 · 基礎推理（鑑別模型能力，不太能透過 skill 補）

**T1.1** `[auto]` — Race condition 判讀  
Prompt:

```
以下 Python 程式在高併發下偶爾算錯結果。告訴我 root cause，以及最小修法（不要把整段重寫）：

counter = 0
def increment():
    global counter
    for _ in range(1000):
        counter += 1

import threading
threads = [threading.Thread(target=increment) for _ in range(10)]
[t.start() for t in threads]
[t.join() for t in threads]
print(counter)
```

Pass 條件：答案必須提到 GIL 不保證 `x += 1` atomic、或 `threading.Lock` / `atomic counter`。不能只說「加 lock 就好」而沒指明什麼操作需要 lock。

**T1.2** `[auto]` — 矛盾需求取捨  
Prompt:

```
團隊有兩條互相衝突的要求：
A. API 回應必須 < 100ms（產品 PM）
B. 每次請求要寫完整 audit log 到遠端 MSSQL（資安）

請指出衝突點、提出最多 2 個折衷方案，並說明各自的取捨。
```

Pass：必須點出 B 的 round-trip 會破 A 的 latency；提的方案要包含「非同步寫 / batching / ring buffer」或類似策略，且明說會犧牲什麼。

**T1.3** `[M]` — Code review 細緻度  
給一段有**三個**不同層級問題的程式（安全、效能、可讀性），評 reviewer 是否都抓到、是否分級。

---

### L2 · 多語言編碼

**T2.1** `[M]` C# — N+1 重構  
給一段 EF Core 程式有 N+1 query，要求改 `Include` 或 projection。Pass：能指出 lazy loading 風險、建議 AsSplitQuery 的時機。

**T2.2** `[M]` Python — 給 bug 報告、修補 + 寫 pytest  
提供含 bug 的 `.py` + 重現步驟，要求修復並補一個測試。Pass：測試應先 fail、修完 pass；不得改 API 簽名。

**T2.3** `[M]` Vue — Options API → Composition API  
給一個 50 行的 Vue 2 Options API 元件，要求轉成 `<script setup>`。Pass：reactive 資料用 `ref/reactive`、computed 保留、watch 不要漏。

**T2.4** `[M]` T-SQL — CTE 遞迴改迴圈  
給一個找組織架構上級的遞迴 CTE，要求改成 `WHILE` + 暫存表。Pass：結果等價、說明何時該 CTE vs 迴圈。

**T2.5** `[auto]` HTML/JS — XSS 偵測  
Prompt：給一段 HTML + JS，其中有 `innerHTML = userInput`。要求指出 XSS 風險並提出修法。

**T2.6** `[M]` MSSQL — 執行計畫判讀  
給一段 query + 執行計畫截圖描述，要求找效能瓶頸並提出索引建議。

---

### L3 · 檔案 / 文件 I/O

> **預期大部分會 fail**，因為目前沒有 Office 讀寫工具。這層的 fail 多半要靠**寫 skill 或接 MCP server**解決。

**T3.1** `[auto]` — 讀 `.docx` 抓 headings  
先在 `tests/capability/fixtures/` 放一個 `.docx`，prompt：「讀這份文件，列出所有 H1/H2 標題成 markdown outline」。Pass：輸出的 outline 跟實際 heading 一致。

**T3.2** `[auto]` — `.xlsx` 樞紐分析  
給一個銷售資料 xlsx，prompt：「依類別加總各月份銷售額，輸出成 csv」。Pass：數值正確。

**T3.3** `[M]` — 產 `.pptx` 大綱  
「根據這個 markdown 專案計畫產出 5 張 slide 的 pptx 檔案」。Pass：檔案能開、5 張 slide、標題和內容對應。

**T3.4** `[auto]` — 讀大 markdown 產摘要  
給 `docs/developers/` 任一長 md（>500 行），要求產 200 字內摘要。Pass：點到文件主幹、無事實錯誤。

**T3.5** `[auto]` — 產 API 文件  
針對 `packages/core/src/permissions/rule-parser.ts`，要求產 markdown 形式的 API 文件。Pass：涵蓋 exported functions、參數、回傳、至少一個範例。

---

### L4 · Agent 自主性（最能看出我們架構是否成功）

**T4.1** `[auto]` — 自主寫 memory  
Prompt：「我不喜歡在 production 程式裡用 print 除錯，請用 logger」。結束後檢查 `~/.qwen/memory/` 是否多了一則 feedback memory。Pass：有寫，type=feedback，description 合理。

**T4.2** `[auto]` — 跨 session 記憶取用  
T4.1 完成後開新 session，Prompt：「幫我加個 debug log 顯示 request 的 headers」。Pass：回答時使用 logger，而非 print。

**T4.3** `[auto]` — skill_propose 觸發  
連續給 3 個類似任務（例：都是「掃 `.ts` 檔裡的 `console.log` 並改成 logger」），看第 3 次是否主動建議建 skill。Pass：有呼 `skill_propose` 或 `memory_distill`。

**T4.4** `[auto]` — 並行工具呼叫  
Prompt：「同時查 `packages/core/package.json`、`packages/cli/package.json`、`package.json` 這三個檔案的 version 欄位」。Pass：JSON 輸出裡三個 `read_file` 在同一 turn（parallel）。

**T4.5** `[auto]` — 工具選擇  
Prompt：「這個 repo 裡有多少個 TypeScript 檔案？」Pass：用 `glob` 或 `run_shell_command`，不是 `list_directory` 遞迴呼多次。

**T4.6** `[M]` — 適時 subagent 分工  
複雜任務：「review `packages/core/src/permissions/rule-parser.ts` 的 Windows path 邏輯，寫一份報告」。Pass：是否呼 code-reviewer subagent。

---

### L5 · 長任務 / 大量資料

**T5.1** `[M]` — 掃 repo TODO  
Prompt：「掃整個 repo 找所有 `TODO:` / `FIXME:`，分類（security / perf / cleanup）、評估優先順序、產 markdown 報告」。Pass：報告有分類、有優先序邏輯、至少找到 10 個。

**T5.2** `[auto]` — 多檔關聯追蹤  
Prompt：「找出 `IdeClient.connect()` 的完整呼叫鏈：從誰呼它、它呼了誰、最終訊息流向哪裡」。Pass：提到至少 3 層 call chain。

**T5.3** `[M]` — 50 log 行尋 pattern  
給一個 500 行 log 檔，要求找出反覆出現的 error pattern 並排序。

---

## 執行步驟

1. `node scripts/capability-test-runner.mjs --suite=auto --label=baseline-full`  
   → 本 fork 全開（B 設定）跑所有 `[auto]` 題，結果存 `docs/testing/runs/<ts>-baseline-full/`
2. （選用）`--label=minimal-no-soul` 暫時把 `~/.qwen/soul.md` 改名備份，重跑一次比對
3. 手動執行所有 `[M]` 題，用 `docs/testing/runs/<ts>-manual.md` 記分
4. 分析，填 `docs/testing/runs/<ts>-report.md`

---

## 成功 / 改善路徑對應

| 結果模式                      | 行動                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| L1 低分（不論 bisect）        | 模型問題，等 Qwen3.5 再跑一次                                  |
| L2 低分但 L1 高               | context/prompt engineering；寫語言專用 skill                   |
| L3 大量 fail                  | 寫 `office-io` skill + 掛 MCP `filesystem` / `docx`-reader     |
| L4 低分                       | trigger / memory discipline 有問題，調 `soul.md` + memory hook |
| L5 低分                       | subagent routing 沒生效，檢查 `agents/*.md` description        |
| **A 版本比 B 版本分數明顯高** | **我們的注入項過重，要瘦身 soul.md / MEMORY.md**               |

---

## 執行後留存資料

- `docs/testing/runs/<ts>-baseline-full/<T-id>.jsonl` — 原始 stream-json 輸出
- `docs/testing/runs/<ts>-baseline-full/scorecard.json` — 自動評分
- `docs/testing/runs/<ts>-report.md` — 結論 + 行動清單
