#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Capability test runner for the qwen agent.
 *
 * Drives the CLI via --input-format stream-json, captures every JSON event,
 * and scores each test on four deterministic axes:
 *   - correctness: heuristic keyword check on final text
 *   - initiative: expected tool / skill / memory events fired?
 *   - efficiency: tool-call count vs budget
 *   - learning:   did a memory_write / skill_propose land?
 *
 * Usage:
 *   node tests/capability/runner.mjs --label=baseline
 *   node tests/capability/runner.mjs --label=bisect --only=T4.4,T4.5
 *
 * Output:
 *   tests/capability/runs/<ts>-<label>/<T-id>.jsonl   (raw stream-json)
 *   tests/capability/runs/<ts>-<label>/scorecard.json (aggregated scores)
 *   tests/capability/runs/<ts>-<label>/report.md     (human-readable)
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Runner lives at tests/capability/runner.mjs → repo root is two levels up.
const ROOT = path.resolve(__dirname, '..', '..');
const SUITE_DIR = __dirname;

// ─────────────────────────────────────────────────────────────────────────────
// Test definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Test
 * @property {string} id
 * @property {string} layer   - "L1" | "L2" | "L3" | "L4" | "L5"
 * @property {string} name
 * @property {string} prompt
 * @property {number} [timeoutMs] default 180_000
 * @property {number} [toolBudget] max acceptable tool calls for full initiative/efficiency
 * @property {(events: any[], finalText: string) => TestScore} assert
 */

/**
 * @typedef {Object} TestScore
 * @property {0|1|2|3} correctness
 * @property {0|1|2|3} initiative
 * @property {0|1|2|3} efficiency
 * @property {0|1|2|3} learning
 * @property {string}  notes
 */

/** Heuristic: does the final assistant text contain all the required substrings (case-insensitive)? */
function textHas(text, substrings) {
  const lower = text.toLowerCase();
  return substrings.every((s) => lower.includes(s.toLowerCase()));
}

/** Count tool_use events in the stream. */
function countToolUses(events) {
  return events.filter(
    (e) =>
      e.type === 'assistant' &&
      Array.isArray(e.message?.content) &&
      e.message.content.some((c) => c.type === 'tool_use'),
  ).length;
}

/** All tool_use blocks flattened. */
function allToolUses(events) {
  const uses = [];
  for (const e of events) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const c of e.message.content) {
      if (c.type === 'tool_use') uses.push(c);
    }
  }
  return uses;
}

/** Any tool_use whose name matches the predicate. */
function hasToolUse(events, predicate) {
  return allToolUses(events).some(predicate);
}

/** Return the count of tool uses per assistant turn (assistant message). */
function parallelCounts(events) {
  return events
    .filter(
      (e) => e.type === 'assistant' && Array.isArray(e.message?.content),
    )
    .map(
      (e) => e.message.content.filter((c) => c.type === 'tool_use').length,
    )
    .filter((n) => n > 0);
}

/** @type {Test[]} */
const TESTS = [
  // ── L1 ──────────────────────────────────────────────────────────────────
  {
    id: 'T1.1',
    layer: 'L1',
    name: 'Race condition judgment (Python GIL)',
    toolBudget: 0,
    prompt: `以下 Python 程式在高併發下偶爾算錯結果。告訴我 root cause，以及最小修法（不要把整段重寫）：

counter = 0
def increment():
    global counter
    for _ in range(1000):
        counter += 1

import threading
threads = [threading.Thread(target=increment) for _ in range(10)]
[t.start() for t in threads]
[t.join() for t in threads]
print(counter)`,
    assert(events, finalText) {
      const mentionsRace =
        textHas(finalText, ['gil']) ||
        textHas(finalText, ['not atomic']) ||
        textHas(finalText, ['非原子']) ||
        textHas(finalText, ['race']);
      const mentionsLock =
        finalText.toLowerCase().includes('lock') ||
        finalText.includes('鎖');
      const tools = countToolUses(events);
      return {
        correctness: mentionsRace && mentionsLock ? 3 : mentionsLock ? 2 : 1,
        initiative: 3, // no tools needed
        efficiency: tools === 0 ? 3 : tools === 1 ? 2 : 1,
        learning: 0,
        notes: `race=${mentionsRace} lock=${mentionsLock} tools=${tools}`,
      };
    },
  },

  {
    id: 'T1.2',
    layer: 'L1',
    name: 'Contradictory requirements tradeoff',
    toolBudget: 0,
    prompt: `團隊有兩條互相衝突的要求：
A. API 回應必須 < 100ms（產品 PM）
B. 每次請求要寫完整 audit log 到遠端 MSSQL（資安）

請指出衝突點、提出最多 2 個折衷方案，並說明各自的取捨。`,
    assert(events, finalText) {
      const mentionsLatency =
        textHas(finalText, ['latency']) ||
        textHas(finalText, ['round-trip']) ||
        finalText.includes('延遲');
      const mentionsAsync =
        finalText.toLowerCase().includes('async') ||
        finalText.toLowerCase().includes('batch') ||
        finalText.toLowerCase().includes('queue') ||
        finalText.includes('非同步') ||
        finalText.includes('批次');
      const mentionsTradeoff =
        finalText.includes('取捨') ||
        finalText.toLowerCase().includes('tradeoff') ||
        finalText.includes('犧牲') ||
        finalText.includes('代價');
      const score =
        (mentionsLatency ? 1 : 0) +
        (mentionsAsync ? 1 : 0) +
        (mentionsTradeoff ? 1 : 0);
      return {
        correctness: /** @type {0|1|2|3} */ (score),
        initiative: 3,
        efficiency: 3,
        learning: 0,
        notes: `latency=${mentionsLatency} async=${mentionsAsync} tradeoff=${mentionsTradeoff}`,
      };
    },
  },

  // ── L2 ──────────────────────────────────────────────────────────────────
  {
    id: 'T2.5',
    layer: 'L2',
    name: 'XSS detection in innerHTML usage',
    toolBudget: 0,
    prompt: `這段前端程式有安全問題，請指出是什麼、為何危險、怎麼修：

<input id="q">
<div id="out"></div>
<script>
  const q = document.getElementById('q');
  const out = document.getElementById('out');
  q.addEventListener('change', (e) => {
    out.innerHTML = '你搜尋的是: ' + e.target.value;
  });
</script>`,
    assert(events, finalText) {
      const mentionsXss = finalText.toLowerCase().includes('xss');
      const mentionsInnerHtml =
        finalText.toLowerCase().includes('innerhtml');
      const mentionsFix =
        finalText.toLowerCase().includes('textcontent') ||
        finalText.toLowerCase().includes('innertext') ||
        finalText.toLowerCase().includes('sanitize') ||
        finalText.toLowerCase().includes('escape') ||
        finalText.includes('跳脫');
      const score =
        (mentionsXss ? 1 : 0) +
        (mentionsInnerHtml ? 1 : 0) +
        (mentionsFix ? 1 : 0);
      return {
        correctness: /** @type {0|1|2|3} */ (score),
        initiative: 3,
        efficiency: 3,
        learning: 0,
        notes: `xss=${mentionsXss} innerHTML=${mentionsInnerHtml} fix=${mentionsFix}`,
      };
    },
  },

  // ── L3 ──────────────────────────────────────────────────────────────────
  {
    id: 'T3.4',
    layer: 'L3',
    name: 'Summarize long markdown doc',
    toolBudget: 3,
    prompt: `請讀 docs/users/configuration/settings.md 這個檔，用不超過 200 字的中文摘要寫出檔案主要在講什麼、有哪幾個重要小節。`,
    assert(events, finalText) {
      const readTools = hasToolUse(
        events,
        (u) =>
          u.name === 'read_file' &&
          JSON.stringify(u.input || {}).includes('settings.md'),
      );
      const mentionsPermissions =
        finalText.toLowerCase().includes('permission') ||
        finalText.includes('權限');
      const mentionsSettings =
        finalText.toLowerCase().includes('setting') ||
        finalText.includes('設定');
      const tools = countToolUses(events);
      return {
        correctness:
          mentionsPermissions && mentionsSettings
            ? 3
            : mentionsSettings
              ? 2
              : 1,
        initiative: readTools ? 3 : 1,
        efficiency: tools <= 3 ? 3 : tools <= 5 ? 2 : 1,
        learning: 0,
        notes: `read=${readTools} tools=${tools}`,
      };
    },
  },

  {
    id: 'T3.5',
    layer: 'L3',
    name: 'Generate API doc for rule-parser.ts',
    toolBudget: 4,
    prompt: `請幫 packages/core/src/permissions/rule-parser.ts 這個檔案產出 markdown 格式的 API 文件。至少涵蓋：(1) 檔案用途一行說明 (2) 每個 exported function 的簽名 + 目的 + 至少一個範例。請直接印出 markdown，不要寫檔。`,
    assert(events, finalText) {
      const readTools = hasToolUse(
        events,
        (u) =>
          u.name === 'read_file' &&
          JSON.stringify(u.input || {}).includes('rule-parser'),
      );
      // expected exports
      const expectedExports = [
        'parseRule',
        'buildPermissionRules',
        'resolvePathPattern',
        'matchesPathPattern',
      ];
      const covered = expectedExports.filter((e) => finalText.includes(e));
      // Code-fenced block counts as an example; don't require the literal word.
      const hasExample = (finalText.match(/```/g) || []).length >= 2;
      return {
        correctness:
          covered.length >= 3 ? 3 : covered.length >= 2 ? 2 : covered.length >= 1 ? 1 : 0,
        initiative: readTools ? 3 : 1,
        efficiency: 3,
        learning: hasExample ? 0 : 0, // learning axis not applicable; keep 0
        notes: `read=${readTools} covered=${covered.length}/${expectedExports.length} example=${hasExample}`,
      };
    },
  },

  // ── L4 ──────────────────────────────────────────────────────────────────
  {
    id: 'T4.1',
    layer: 'L4',
    name: 'Autonomous memory_write on stated preference',
    toolBudget: 3,
    prompt: `我要告訴你一個長期偏好，請你記下來，之後 session 也要遵守：
我不喜歡在 production 程式裡用 print 做 debug，請一律用 logger。這個偏好適用於 Python / Node.js 任何語言。`,
    assert(events, finalText) {
      const wroteMemory = hasToolUse(
        events,
        (u) => u.name === 'memory_write' || u.name === 'save_memory',
      );
      return {
        correctness: 3, // can't easily judge the reply itself
        initiative: wroteMemory ? 3 : 0,
        efficiency: 3,
        learning: wroteMemory ? 3 : 0,
        notes: `memory_write=${wroteMemory}`,
      };
    },
  },

  {
    id: 'T4.4',
    layer: 'L4',
    name: 'Parallel independent tool calls',
    toolBudget: 3,
    prompt: `同時查這三個檔案的 "version" 欄位並只印三個版本字串：
- package.json
- packages/core/package.json
- packages/cli/package.json`,
    assert(events, finalText) {
      const reads = allToolUses(events).filter((u) => u.name === 'read_file');
      const counts = parallelCounts(events);
      const hadParallelTurn = counts.some((n) => n >= 3);
      // final text should mention three versions
      const versionMatches = finalText.match(/\d+\.\d+\.\d+/g) || [];
      return {
        correctness: versionMatches.length >= 3 ? 3 : versionMatches.length >= 1 ? 1 : 0,
        initiative: reads.length >= 3 ? 3 : 2,
        efficiency: hadParallelTurn ? 3 : reads.length === 3 ? 1 : 0,
        learning: 0,
        notes: `reads=${reads.length} parallelTurn=${hadParallelTurn} versions=${versionMatches.length}`,
      };
    },
  },

  {
    id: 'T4.5',
    layer: 'L4',
    name: 'Tool choice: glob over recursive list_directory',
    toolBudget: 2,
    prompt: `這個 repo 裡總共有多少個 .ts 檔（排除 node_modules 和 dist）？只需要一個總數。`,
    assert(events, finalText) {
      const uses = allToolUses(events);
      const usedGlob = uses.some(
        (u) => u.name === 'glob' || u.name === 'Glob',
      );
      const usedShell = uses.some((u) => u.name === 'run_shell_command');
      const listDirCount = uses.filter(
        (u) => u.name === 'list_directory',
      ).length;
      const numberMatch = finalText.match(/\b\d{2,5}\b/);
      return {
        correctness: numberMatch ? 3 : 0,
        initiative: usedGlob || usedShell ? 3 : listDirCount > 0 ? 1 : 0,
        efficiency:
          listDirCount >= 5 ? 0 : listDirCount >= 2 ? 1 : 3,
        learning: 0,
        notes: `glob=${usedGlob} shell=${usedShell} listDir=${listDirCount}`,
      };
    },
  },

  // ── L1 extra ────────────────────────────────────────────────────────────
  {
    id: 'T1.3',
    layer: 'L1',
    name: 'Code review with tiered findings',
    toolBudget: 0,
    prompt: `幫我 code review 這段 Python Flask handler，指出你看到的所有問題，並按嚴重性分類（critical / major / minor）：

\`\`\`python
from flask import request

def get_user_posts(user_id, db):
    search = request.args.get('q')
    query = f"SELECT * FROM posts WHERE user_id = {user_id} AND title LIKE '%{search}%'"
    posts = db.execute(query).fetchall()
    results = []
    for post in posts:
        author = db.execute(f"SELECT name FROM users WHERE id = {post.user_id}").fetchone()
        results.append({'post': post, 'author': author.name})
    return results[:20]
\`\`\``,
    assert(events, finalText) {
      const lower = finalText.toLowerCase();
      const catches = {
        sqli: lower.includes('sql') && (lower.includes('注入') || lower.includes('injection')),
        nplus1: lower.includes('n+1') || lower.includes('n +') || lower.includes('每筆') || lower.includes('loop'),
        magic: lower.includes('20') && (lower.includes('magic') || lower.includes('常數') || lower.includes('硬編') || lower.includes('constant')),
        tiered: lower.includes('critical') || lower.includes('major') || lower.includes('minor') || lower.includes('嚴重'),
      };
      const hitCount = Object.values(catches).filter(Boolean).length;
      return {
        correctness: /** @type {0|1|2|3} */ (Math.min(3, hitCount)),
        initiative: 3,
        efficiency: 3,
        learning: 0,
        notes: `sqli=${catches.sqli} n+1=${catches.nplus1} magic=${catches.magic} tiered=${catches.tiered}`,
      };
    },
  },

  // ── L2 extras (MANUAL / captured) ──────────────────────────────────────
  {
    id: 'T2.1',
    layer: 'L2',
    name: 'C# EF Core N+1 refactor',
    toolBudget: 0,
    prompt: `下面這段 C# / EF Core 程式有 N+1 問題，請重構。只印出改好的程式碼 + 一兩句說明，別整段複述原碼：

\`\`\`csharp
public List<OrderDto> GetOrders(int customerId) {
    var orders = _ctx.Orders.Where(o => o.CustomerId == customerId).ToList();
    var dtos = new List<OrderDto>();
    foreach (var o in orders) {
        var items = _ctx.OrderItems.Where(i => i.OrderId == o.Id).ToList();
        dtos.Add(new OrderDto {
            Id = o.Id,
            Total = items.Sum(i => i.Price * i.Qty),
            ItemCount = items.Count,
        });
    }
    return dtos;
}
\`\`\``,
    assert(events, finalText) {
      const lower = finalText.toLowerCase();
      const mentionsInclude = lower.includes('include(') || lower.includes('.include(');
      const mentionsProjection = lower.includes('select(') || lower.includes('projection') || lower.includes('投影');
      const mentionsNplus1 = lower.includes('n+1') || lower.includes('每筆') || lower.includes('迴圈');
      return {
        correctness: /** @type {0|1|2|3} */ (
          mentionsInclude || mentionsProjection ? 3 : mentionsNplus1 ? 2 : 1
        ),
        initiative: 3,
        efficiency: 3,
        learning: 0,
        notes: `include=${mentionsInclude} projection=${mentionsProjection} n+1=${mentionsNplus1}`,
      };
    },
  },

  {
    id: 'T2.2',
    layer: 'L2',
    name: 'Python bug fix + pytest (captured)',
    toolBudget: 0,
    prompt: `下面這個 Python function 有 bug，請幫我：(1) 指出 bug 在哪 (2) 給最小修正 (3) 附一個 pytest 測試可以驗證修復。

\`\`\`python
def chunks(lst, n):
    """Split lst into chunks of size n."""
    result = []
    for i in range(0, len(lst), n):
        result.append(lst[i:i + n])
    return result

# bug report: chunks([1,2,3,4,5], 0) 造成程式當掉
\`\`\``,
    assert(events, finalText) {
      const lower = finalText.toLowerCase();
      const mentionsZero = finalText.includes('0') && (lower.includes('n=0') || lower.includes('零') || lower.includes('zero') || lower.includes('n <='));
      const hasTestBlock = /def test_|pytest\.raises|assert /.test(finalText);
      const mentionsRaise = lower.includes('raise') || lower.includes('valueerror');
      return {
        correctness: /** @type {0|1|2|3} */ (
          mentionsZero && hasTestBlock ? 3 : mentionsZero || hasTestBlock ? 2 : 1
        ),
        initiative: 3,
        efficiency: 3,
        learning: 0,
        notes: `zero=${mentionsZero} test=${hasTestBlock} raise=${mentionsRaise}`,
      };
    },
  },

  {
    id: 'T2.3',
    layer: 'L2',
    name: 'Vue Options API → Composition API',
    toolBudget: 0,
    prompt: `把下面這個 Vue 2 Options API 元件改成 Vue 3 Composition API (\`<script setup>\`)。保留原本 reactivity 語意、computed、watcher：

\`\`\`vue
<template><div>{{ doubled }} — {{ name }}</div></template>
<script>
export default {
  data() { return { count: 0, name: '' }; },
  computed: {
    doubled() { return this.count * 2; },
  },
  watch: {
    count(val) { console.log('count changed', val); },
  },
  methods: {
    increment() { this.count++; },
  },
};
</script>
\`\`\``,
    assert(events, finalText) {
      const hasSetup = /<script\s+setup/.test(finalText);
      const hasRef = /\bref\(/.test(finalText);
      const hasComputed = /computed\(/.test(finalText);
      const hasWatch = /watch\(/.test(finalText);
      const score =
        (hasSetup ? 1 : 0) + (hasRef ? 1 : 0) + ((hasComputed || hasWatch) ? 1 : 0);
      return {
        correctness: /** @type {0|1|2|3} */ (score),
        initiative: 3,
        efficiency: 3,
        learning: 0,
        notes: `setup=${hasSetup} ref=${hasRef} computed=${hasComputed} watch=${hasWatch}`,
      };
    },
  },

  {
    id: 'T2.4',
    layer: 'L2',
    name: 'T-SQL recursive CTE → WHILE (captured)',
    toolBudget: 0,
    prompt: `下面這個 T-SQL 遞迴 CTE 撈組織上級，請改寫成 WHILE 迴圈 + 暫存表版本，並說明兩種寫法各適合什麼情境（效能 / 可讀性 / 深度限制）：

\`\`\`sql
WITH Ancestors AS (
    SELECT EmployeeId, ManagerId, 0 AS Level
    FROM Employees WHERE EmployeeId = @start
    UNION ALL
    SELECT e.EmployeeId, e.ManagerId, a.Level + 1
    FROM Employees e INNER JOIN Ancestors a ON e.EmployeeId = a.ManagerId
)
SELECT * FROM Ancestors OPTION (MAXRECURSION 100);
\`\`\``,
    assert(events, finalText) {
      const lower = finalText.toLowerCase();
      const hasWhile = lower.includes('while');
      const hasTempTable = finalText.includes('#') || lower.includes('temp table') || lower.includes('暫存');
      const mentionsTradeoff = lower.includes('maxrecursion') || lower.includes('遞迴深度') || lower.includes('stack') || lower.includes('效能') || lower.includes('可讀');
      const score =
        (hasWhile ? 1 : 0) + (hasTempTable ? 1 : 0) + (mentionsTradeoff ? 1 : 0);
      return {
        correctness: /** @type {0|1|2|3} */ (score),
        initiative: 3,
        efficiency: 3,
        learning: 0,
        notes: `while=${hasWhile} temp=${hasTempTable} tradeoff=${mentionsTradeoff}`,
      };
    },
  },

  {
    id: 'T2.6',
    layer: 'L2',
    name: 'MSSQL slow query index recommendation (captured)',
    toolBudget: 0,
    prompt: `MSSQL 執行以下 query，執行計畫顯示：Index Scan on Orders (cost 78%)、Hash Match (cost 15%)、Key Lookup on Customers (cost 7%)。資料量 Orders 500 萬筆、Customers 10 萬筆。請診斷瓶頸並提出最多 2 個索引建議（含欄位順序、INCLUDE 策略）：

\`\`\`sql
SELECT o.OrderId, o.OrderDate, c.CustomerName, o.TotalAmount
FROM Orders o
INNER JOIN Customers c ON c.CustomerId = o.CustomerId
WHERE o.OrderDate BETWEEN '2025-01-01' AND '2025-03-31'
  AND o.Status = 'Completed'
ORDER BY o.OrderDate DESC;
\`\`\``,
    assert(events, finalText) {
      const lower = finalText.toLowerCase();
      const mentionsCovering =
        lower.includes('include') || lower.includes('covering') || lower.includes('涵蓋');
      const mentionsOrderDate =
        finalText.includes('OrderDate') || lower.includes('orderdate');
      const mentionsScan =
        lower.includes('scan') || lower.includes('全表') || lower.includes('掃描');
      const score =
        (mentionsCovering ? 1 : 0) +
        (mentionsOrderDate ? 1 : 0) +
        (mentionsScan ? 1 : 0);
      return {
        correctness: /** @type {0|1|2|3} */ (score),
        initiative: 3,
        efficiency: 3,
        learning: 0,
        notes: `covering=${mentionsCovering} orderDate=${mentionsOrderDate} scan=${mentionsScan}`,
      };
    },
  },

  // ── L4 extra ────────────────────────────────────────────────────────────
  {
    id: 'T4.6',
    layer: 'L4',
    name: 'Code review triggers a subagent',
    toolBudget: 8,
    prompt: `請對 packages/core/src/permissions/rule-parser.ts 裡的 Windows path 支援邏輯做一次 code review。針對：(1) 絕對路徑偵測是否完整 (2) backwards compat fallback 是否安全 (3) 還有什麼 edge case 沒處理。給 3-5 點 review comment。`,
    assert(events, finalText) {
      const uses = allToolUses(events);
      const usedAgent = uses.some(
        (u) => u.name === 'agent' || u.name === 'Agent' || u.name === 'Task',
      );
      const readFile = uses.some(
        (u) =>
          u.name === 'read_file' &&
          JSON.stringify(u.input || {}).includes('rule-parser'),
      );
      const mentionsWindows =
        finalText.toLowerCase().includes('windows') ||
        finalText.includes('drive letter');
      const tools = uses.length;
      return {
        correctness: readFile && mentionsWindows ? 3 : mentionsWindows ? 2 : 1,
        initiative: usedAgent ? 3 : readFile ? 2 : 1,
        efficiency: tools <= 4 ? 3 : tools <= 8 ? 2 : 1,
        learning: 0,
        notes: `agent=${usedAgent} read=${readFile} mentionsWindows=${mentionsWindows} tools=${tools}`,
      };
    },
  },

  // ── L5 extras ───────────────────────────────────────────────────────────
  {
    id: 'T5.1',
    layer: 'L5',
    name: 'Scan repo for TODO/FIXME and categorize',
    toolBudget: 10,
    prompt: `掃整個 repo 找 TODO 和 FIXME 註解，挑 5-10 筆出來，依類別（security / perf / cleanup / feature）分類並評估優先順序。只看 packages/ 底下的 .ts / .tsx，排除 node_modules / dist / coverage。輸出 markdown 表格：| 檔案:行 | 類別 | 優先級 | 內容摘要 |`,
    assert(events, finalText) {
      const uses = allToolUses(events);
      const usedGrep = uses.some(
        (u) => u.name === 'grep_search' || u.name === 'grep',
      );
      const hasTable = /\|.*\|.*\|/.test(finalText);
      const categoriesCount = [
        'security',
        'perf',
        'cleanup',
        'feature',
      ].filter((c) => finalText.toLowerCase().includes(c)).length;
      const tools = uses.length;
      return {
        correctness:
          hasTable && categoriesCount >= 2 ? 3 : hasTable ? 2 : 1,
        initiative: usedGrep ? 3 : 1,
        efficiency: tools <= 5 ? 3 : tools <= 10 ? 2 : 1,
        learning: 0,
        notes: `grep=${usedGrep} table=${hasTable} categories=${categoriesCount} tools=${tools}`,
      };
    },
  },

  {
    id: 'T5.3',
    layer: 'L5',
    name: 'Log pattern analysis',
    toolBudget: 4,
    prompt: `讀 tests/capability/fixtures/app.log，找出最頻繁出現的 error pattern（至少一個），指出根本原因假設，然後建議 1-2 個調查方向或修復策略。`,
    assert(events, finalText) {
      const uses = allToolUses(events);
      const readLog = uses.some(
        (u) =>
          u.name === 'read_file' &&
          JSON.stringify(u.input || {}).includes('app.log'),
      );
      const lower = finalText.toLowerCase();
      const mentionsPool =
        lower.includes('pool') || lower.includes('connection') || lower.includes('連線池');
      const mentionsTimeout =
        lower.includes('timeout') || lower.includes('30000');
      const hasSuggestion =
        lower.includes('建議') ||
        lower.includes('suggest') ||
        lower.includes('增加') ||
        lower.includes('擴大') ||
        lower.includes('檢查');
      const tools = uses.length;
      return {
        correctness:
          mentionsPool && mentionsTimeout ? 3 : mentionsPool || mentionsTimeout ? 2 : 1,
        initiative: readLog ? 3 : 1,
        efficiency: tools <= 2 ? 3 : tools <= 4 ? 2 : 1,
        learning: hasSuggestion ? 0 : 0,
        notes: `read=${readLog} pool=${mentionsPool} timeout=${mentionsTimeout} suggestion=${hasSuggestion}`,
      };
    },
  },

  // ── L5 ──────────────────────────────────────────────────────────────────
  {
    id: 'T5.2',
    layer: 'L5',
    name: 'Multi-file call-chain trace',
    toolBudget: 8,
    prompt: `在 packages/cli 或 packages/core 裡找 IdeClient.connect() 這個方法。回答：
1. 哪個檔案定義它
2. 它被哪些檔案呼叫（最多 3 處）
3. 它內部又呼了哪些主要方法（最多 3 個）
盡量用 grep / glob / read_file 查證，不要憑印象。`,
    assert(events, finalText) {
      const uses = allToolUses(events);
      const usedGrep = uses.some(
        (u) => u.name === 'grep_search' || u.name === 'grep',
      );
      const readCount = uses.filter((u) => u.name === 'read_file').length;
      const mentionsIdeClient = finalText.toLowerCase().includes('ideclient');
      const tools = uses.length;
      return {
        correctness: mentionsIdeClient && readCount >= 2 ? 3 : mentionsIdeClient ? 2 : 0,
        initiative: usedGrep ? 3 : 1,
        efficiency: tools <= 8 ? 3 : tools <= 12 ? 2 : 1,
        learning: 0,
        notes: `grep=${usedGrep} reads=${readCount} tools=${tools}`,
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { label: 'baseline', only: null, cli: null };
  for (const a of args) {
    if (a.startsWith('--label=')) out.label = a.slice(8);
    else if (a.startsWith('--only=')) out.only = a.slice(7).split(',');
    else if (a.startsWith('--cli=')) out.cli = a.slice(6);
  }
  return out;
}

function tsFolder() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function pickCli(explicit) {
  if (explicit) return { cmd: explicit, args: [] };
  // Prefer the built SEA exe if present (it exercises the same bundle a
  // portable user would run).
  const exe = path.join(ROOT, 'qwen.exe');
  if (fs.existsSync(exe)) return { cmd: exe, args: [] };
  // Fallback: use the local dist via the npm-linked bin. Windows .cmd
  // shims require shell:true to spawn (CVE-2024-27980 patch blocks the
  // direct execve path for .cmd/.bat on Node ≥ 20.12).
  return {
    cmd: process.platform === 'win32' ? 'qwen.cmd' : 'qwen',
    args: [],
  };
}

/**
 * Node ≥ 20.12 rejects direct spawn of .cmd/.bat files on Windows with
 * EINVAL. Detect the shim case so runTest can opt into shell:true.
 */
function needsShell(cmd) {
  if (process.platform !== 'win32') return false;
  const lower = cmd.toLowerCase();
  return lower.endsWith('.cmd') || lower.endsWith('.bat');
}

/**
 * Run a single test and return { events, finalText, durationMs, exitCode }.
 */
async function runTest(cli, test) {
  const timeoutMs = test.timeoutMs ?? 180_000;
  const start = Date.now();
  const events = [];
  let stderr = '';

  return new Promise((resolve) => {
    const shell = needsShell(cli.cmd);
    // When shelling on Windows, wrap the executable path in double quotes so
    // paths with spaces survive cmd.exe argument parsing.
    const spawnCmd = shell && cli.cmd.includes(' ') ? `"${cli.cmd}"` : cli.cmd;
    const child = spawn(
      spawnCmd,
      [
        ...cli.args,
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--yolo',
      ],
      {
        cwd: ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, QWEN_CODE_NO_RELAUNCH: '1' },
        shell,
      },
    );

    child.on('error', (err) => {
      stderr += `spawn error: ${err?.message ?? err}\n`;
    });

    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          // ignore non-JSON log lines
        }
      }
    });

    child.stderr.on('data', (c) => (stderr += c.toString()));

    const killer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(killer);
      // flush trailing JSON line
      const trimmed = buf.trim();
      if (trimmed) {
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          /* ignore */
        }
      }
      const finalText = extractFinalText(events);
      resolve({
        events,
        finalText,
        durationMs: Date.now() - start,
        exitCode: code,
        stderr,
      });
    });

    // Feed the prompt as one user message and close stdin.
    const userMsg = {
      type: 'user',
      session_id: randomUUID(),
      message: { role: 'user', content: test.prompt },
      parent_tool_use_id: null,
    };
    child.stdin.write(JSON.stringify(userMsg) + '\n');
    child.stdin.end();
  });
}

function extractFinalText(events) {
  // The "result" event carries the final result string on stream-json.
  const result = [...events].reverse().find((e) => e.type === 'result');
  if (result?.result) return String(result.result);
  // Fallback: concat all assistant text blocks.
  const chunks = [];
  for (const e of events) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const c of e.message.content) {
      if (c.type === 'text' && typeof c.text === 'string') chunks.push(c.text);
    }
  }
  return chunks.join('\n');
}

async function main() {
  const args = parseArgs();
  const ts = tsFolder();
  const outDir = path.join(SUITE_DIR, 'runs', `${ts}-${args.label}`);
  fs.mkdirSync(outDir, { recursive: true });
  const cli = pickCli(args.cli);
  const selected = args.only
    ? TESTS.filter((t) => args.only.includes(t.id))
    : TESTS;

  console.log(`[runner] cli = ${cli.cmd}`);
  console.log(`[runner] label = ${args.label}`);
  console.log(`[runner] output = ${outDir}`);
  console.log(`[runner] tests = ${selected.map((t) => t.id).join(', ')}`);

  const results = [];
  for (const test of selected) {
    process.stdout.write(`[${test.id}] ${test.name} ... `);
    let result;
    try {
      result = await runTest(cli, test);
    } catch (err) {
      console.log(`ERROR ${err?.message ?? err}`);
      results.push({
        id: test.id,
        layer: test.layer,
        name: test.name,
        error: String(err?.message ?? err),
      });
      continue;
    }

    // Persist raw events for later inspection.
    const jsonlPath = path.join(outDir, `${test.id}.jsonl`);
    fs.writeFileSync(
      jsonlPath,
      result.events.map((e) => JSON.stringify(e)).join('\n'),
    );

    let score;
    try {
      score = test.assert(result.events, result.finalText);
    } catch (err) {
      score = {
        correctness: 0,
        initiative: 0,
        efficiency: 0,
        learning: 0,
        notes: `assert threw: ${err?.message ?? err}`,
      };
    }
    const total =
      score.correctness + score.initiative + score.efficiency + score.learning;
    const verdict = total >= 8 ? 'PASS' : 'FAIL';
    console.log(
      `${verdict} (${total}/12, ${Math.round(result.durationMs / 100) / 10}s) ${score.notes}`,
    );

    results.push({
      id: test.id,
      layer: test.layer,
      name: test.name,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      finalTextPreview: result.finalText.slice(0, 400),
      stderrPreview: result.stderr?.slice(0, 400),
      eventCount: result.events.length,
      score,
      total,
      verdict,
    });
  }

  // Scorecard
  fs.writeFileSync(
    path.join(outDir, 'scorecard.json'),
    JSON.stringify({ label: args.label, ts, results }, null, 2),
  );

  // Markdown report
  const layers = [...new Set(results.map((r) => r.layer))].sort();
  const lines = [];
  lines.push(`# Run ${ts} · ${args.label}`);
  lines.push('');
  lines.push(`| id | layer | verdict | total | notes |`);
  lines.push(`|----|-------|---------|-------|-------|`);
  for (const r of results) {
    lines.push(
      `| ${r.id} | ${r.layer} | ${r.verdict ?? 'ERR'} | ${r.total ?? '-'}/12 | ${r.score?.notes ?? r.error ?? ''} |`,
    );
  }
  lines.push('');
  for (const layer of layers) {
    const passed = results.filter((r) => r.layer === layer && r.verdict === 'PASS').length;
    const total = results.filter((r) => r.layer === layer).length;
    lines.push(`- ${layer}: ${passed}/${total} passed`);
  }
  fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n'));

  console.log(`\n[runner] Done. See ${outDir}`);
}

main().catch((err) => {
  console.error('[runner] fatal:', err);
  process.exit(1);
});
