# A/B Test · `promptProfile` fork vs qwen-native

**Model**: gemma-4-31b-it (Google API)
**Suite**: 18 auto-testable tasks across L1-L5
**Date**: 2026-04-23

## TL;DR

**qwen-native 微勝** fork（8.89 vs 8.72 /12）。16/18 題 **分數完全一樣**；差異只在 2 題（T2.4 / T5.2），都是 **qwen-native 好一點**。關鍵自主性題（T4.1 memory_write、T4.4 parallel、T4.5 glob、T4.6 subagent）兩邊行為完全一致 → 我們的 discipline 文字對基本工具使用**不是 load-bearing**。

## 結果對照

| Layer       | Fork avg | Qwen-native avg | Δ         |
| ----------- | -------- | --------------- | --------- |
| L1 推理     | 9.00     | 9.00            | 0         |
| L2 多語言   | 8.83     | 9.00            | +0.17     |
| L3 文件 I/O | 8.50     | 8.50            | 0         |
| L4 自主性   | 9.00     | 9.00            | 0         |
| L5 長任務   | 8.00     | 8.67            | **+0.67** |
| **總平均**  | **8.72** | **8.89**        | **+0.17** |

### 有差異的題目

| id   | layer         | fork     | qwen-native | 差異原因                                            |
| ---- | ------------- | -------- | ----------- | --------------------------------------------------- |
| T2.4 | L2 T-SQL      | 8        | 9           | qwen-native 有提到 maxrecursion / 遞迴深度 tradeoff |
| T5.2 | L5 call chain | 6 (FAIL) | 8 (PASS)    | fork 沒提到 IdeClient 關鍵字（correctness 掉 3 分） |

（LLM 非 deterministic，單一 run 會有 ±1-2 分噪音）

## 為什麼 qwen-native 小贏

拔掉的注入：

- `soul.md`（~300-1000 token）
- `MEMORY.md` user/project index
- **`MEMORY_DISCIPLINE`** 文字（auto-memory 行為指令）
- Onboarding hint（如果 user_profile 不存在）

**效應**：context 短了幾百到一兩千 token。對模型來說注意力更集中在使用者當前任務，長任務（L5）特別受益 — avg +0.67。

**沒變的事**（驗證我們的擔憂是多餘的）：

- T4.1 memory 照樣 12/12 寫出 — 即使沒 discipline 文字，`memory_write` 工具本身描述 + 使用者明說「記下來」已足夠
- T4.4 並行工具照樣 3 個在一個 turn
- T4.5 照樣選 glob 不選 list_directory
- T4.6 subagent 照樣被正確派出（雖然 final text 沒提 Windows → 兩邊都 FAIL）

## 對 Qwen3.5 使用者的建議

**預設切 qwen-native**，特別是：

- 遇到 L5 長任務
- Qwen3.5 表現差（本 fork 的注入層可能是 context 壓力來源之一）
- 想先排除 fork 變項、確定是不是模型本身問題

切換：

```bash
node tests/capability/set-profile.mjs qwen-native
# 重啟 qwen
```

或直接編輯 `~/.qwen/settings.json`：

```json
{
  "general": {
    "promptProfile": "qwen-native"
  }
}
```

## 功能保留狀況

| 功能                                | fork | qwen-native                       |
| ----------------------------------- | ---- | --------------------------------- |
| `memory_write` / `save_memory` 工具 | ✅   | ✅（只是沒 auto discipline 文字） |
| `~/.qwen/memory/` 寫入              | ✅   | ✅                                |
| MEMORY.md 索引自動注入              | ✅   | ❌                                |
| soul.md 個性注入                    | ✅   | ❌                                |
| Onboarding hint                     | ✅   | ❌                                |
| Subagent 系統                       | ✅   | ✅                                |
| Skills 自動載入                     | ✅   | ✅                                |

**qwen-native 只是關閉「注入到 system context 的額外文字」**，工具本身全部都還在。使用者還是可以手動用 `/memory` 命令或直接呼叫工具。

## 結論

1. **我們的 fork 擴充不會傷害 gemma 表現** — 18 題平均差 0.17 分，完全在噪音範圍內
2. **長任務場景 (L5) qwen-native 微勝** — 少 ~1000 token 的上下文負擔有感
3. **基本自主性（寫 memory、並行工具、選對工具、派 subagent）在兩種 profile 下都一樣** — 不靠注入文字，靠工具描述本身
4. **Qwen3.5 如果 underperform，先試 qwen-native** — 至少排除 fork 變項，等你測完能給我具體數字

## 再現步驟

```bash
node tests/capability/set-profile.mjs fork
node tests/capability/runner.mjs --label=profile-fork

node tests/capability/set-profile.mjs qwen-native
node tests/capability/runner.mjs --label=profile-qwen-native

node tests/capability/set-profile.mjs restore

node tests/capability/diff-runs.mjs \
  tests/capability/runs/<ts>-profile-fork \
  tests/capability/runs/<ts>-profile-qwen-native \
  --out=tests/capability/runs/ab-report.md
```

## 檔案清單

- `tests/capability/plan.md` — 測試計畫
- `tests/capability/runner.mjs` — runner
- `tests/capability/set-profile.mjs` — profile 切換 helper
- `tests/capability/diff-runs.mjs` — diff 報告產生器
- `tests/capability/runs/2026-04-23-000334-profile-fork/` — fork run raw data
- `tests/capability/runs/2026-04-23-002034-profile-qwen-native/` — qwen-native run raw data
- `tests/capability/runs/profile-ab-report.md` — diff 原始 markdown
- `tests/capability/runs/2026-04-23-ab-summary.md` — 本檔
