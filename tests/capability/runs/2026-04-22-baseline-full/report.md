# Capability Test Run — 2026-04-22 baseline-full

**Model**: `gemma-4-31b-it` (Google API)
**Agent**: this fork, fully configured (soul.md + memory + skills + agents all active)
**CLI**: `qwen.exe` (SEA build, 86.6 MB, stream-json mode)

## Score summary

| id   | layer | verdict | total | duration | notes                                                 |
| ---- | ----- | ------- | ----- | -------- | ----------------------------------------------------- |
| T1.1 | L1    | ✅ PASS | 9/12  | 34s      | race+lock identified; no tools                        |
| T1.2 | L1    | ✅ PASS | 9/12  | 37s      | latency/async/tradeoff all covered                    |
| T2.5 | L2    | ✅ PASS | 9/12  | 27s      | XSS + innerHTML + fix identified                      |
| T3.4 | L3    | ✅ PASS | 8/12  | 22s      | read_file used; summary accurate                      |
| T3.5 | L3    | ✅ PASS | 9/12  | 74s      | 3/4 expected exports documented, examples ok          |
| T4.1 | L4    | ✅ PASS | 12/12 | 20s      | memory_write with correct format (feedback + Why/How) |
| T4.4 | L4    | ✅ PASS | 9/12  | 14s      | 3 parallel reads in one turn                          |
| T4.5 | L4    | ✅ PASS | 9/12  | 56s      | chose glob over list_directory                        |
| T5.2 | L5    | ✅ PASS | 8/12  | 52s      | grep used; call-chain traced                          |

**All 9 auto-testable tests passed** (average 9.1 / 12).

Layer pass rate (auto subset):

- L1: 2/2
- L2: 1/1
- L3: 2/2
- L4: 3/3
- L5: 1/1

## 重要觀察

### 1. 我們的注入層 **沒有拖累** gemma-4-31b-it

擔心的「soul.md + MEMORY.md + skill 轉換 + trigger 系統」會干擾推理 — 在這個模型上 **看不到負面訊號**。T4.1 寫出來的 memory 完全符合 global CLAUDE.md 規格（Why/How/type/scope），代表 discipline 文字被正確遵循。

### 2. Agent 自主行為看起來很健康

- **記憶寫入**：使用者說一次「我討厭用 print debug」→ 立即寫成 `feedback_no_print_debug.md`，格式對 (T4.1, 12/12)
- **並行工具**：3 個獨立 read 丟在同一個 turn (T4.4)
- **工具選擇**：該 grep 就 grep、該 glob 就 glob，沒有 list_directory 爆量 (T4.5)

### 3. 模型推理也夠用

T1.1 race condition 答對 GIL + lock，T1.2 取捨題架構清楚，T2.5 XSS 三要素（風險 + innerHTML + 修法）全到位。

### 4. Qwen3.5 underperform 的可能原因（**不是**我們的注入層）

既然 gemma 跑這套 fork 沒問題，Qwen3.5 underperform 要從別的地方找：

| 可能原因                               | 驗證方式                                 |
| -------------------------------------- | ---------------------------------------- |
| **Qwen3.5 本身在這些任務上輸 gemma**   | 換 Qwen3.5 跑同 suite 比對分數           |
| **Qwen3.5 context 容量 / 指令跟隨 弱** | 比對是否較常忽略 discipline              |
| **Tool use 訓練不足**                  | 看 Qwen3.5 是否更少呼叫工具（L4 分數掉） |
| **中文/英文混合 prompt 敏感**          | 測試語言一致性影響                       |

## 建議動作

1. **換 Qwen3.5 後重跑 `--label=qwen35-full`**，拿同一支腳本、同一組 9 題，scorecard 比對。差距會直接指出模型弱點位置。
2. **如果差距在 L4**（自主呼工具 / 寫記憶變少）→ 需要在 `soul.md` 加更強的 "MUST use tool X for Y" 指令。
3. **如果差距在 L1/L2**（推理 / 編碼品質）→ 模型本身能力問題，考慮升 Qwen3.5 的更大參數版本或加 chain-of-thought prompt。
4. **全部都差** → 先瘦身 system prompt（暫時停用 soul / 部分 skill）再試，做 A/B。
5. **擴充 suite**：目前 9 題偏 happy-path；建議補 manual 題（T1.3 / T2.1-2.4 / T2.6 / T3.1-3.3 / T4.6 / T5.1 / T5.3）做完整評估。

## 執行方式備忘

```bash
# 重跑全部
node scripts/capability-test-runner.mjs --label=<labelname>

# 只跑特定題
node scripts/capability-test-runner.mjs --only=T4.1,T4.4

# 跑其他 CLI 而非 qwen.exe
node scripts/capability-test-runner.mjs --cli=qwen.cmd
```

原始 stream-json 輸出 + scorecard.json 在同目錄下。
