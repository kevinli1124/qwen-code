# Diff · profile-fork vs profile-qwen-native

- A: `tests/capability/runs/2026-04-23-000334-profile-fork` (2026-04-23-000334)
- B: `tests/capability/runs/2026-04-23-002034-profile-qwen-native` (2026-04-23-002034)

| id   | layer | A (profile-fork) | B (profile-qwen-native) | Δ   | notes (A / B)                                                                                           |
| ---- | ----- | ---------------- | ----------------------- | --- | ------------------------------------------------------------------------------------------------------- |
| T1.1 | L1    | PASS 9/12        | PASS 9/12               | 0   | race=true lock=true tools=0 / race=true lock=true tools=0                                               |
| T1.2 | L1    | PASS 9/12        | PASS 9/12               | 0   | latency=true async=true tradeoff=true / latency=true async=true tradeoff=true                           |
| T1.3 | L1    | PASS 9/12        | PASS 9/12               | 0   | sqli=true n+1=true magic=false tiered=true / sqli=true n+1=true magic=false tiered=true                 |
| T2.1 | L2    | PASS 9/12        | PASS 9/12               | 0   | include=false projection=true n+1=true / include=false projection=true n+1=true                         |
| T2.2 | L2    | PASS 9/12        | PASS 9/12               | 0   | zero=true test=true raise=true / zero=true test=true raise=true                                         |
| T2.3 | L2    | PASS 9/12        | PASS 9/12               | 0   | setup=true ref=true computed=true watch=true / setup=true ref=true computed=true watch=true             |
| T2.4 | L2    | PASS 8/12        | PASS 9/12               | +1  | while=true temp=true tradeoff=false / while=true temp=true tradeoff=true                                |
| T2.5 | L2    | PASS 9/12        | PASS 9/12               | 0   | xss=true innerHTML=true fix=true / xss=true innerHTML=true fix=true                                     |
| T2.6 | L2    | PASS 9/12        | PASS 9/12               | 0   | covering=true orderDate=true scan=true / covering=true orderDate=true scan=true                         |
| T3.4 | L3    | PASS 8/12        | PASS 8/12               | 0   | read=true tools=1 / read=true tools=1                                                                   |
| T3.5 | L3    | PASS 9/12        | PASS 9/12               | 0   | read=true covered=3/4 example=true / read=true covered=3/4 example=true                                 |
| T4.1 | L4    | PASS 12/12       | PASS 12/12              | 0   | memory_write=true / memory_write=true                                                                   |
| T4.4 | L4    | PASS 9/12        | PASS 9/12               | 0   | reads=3 parallelTurn=true versions=3 / reads=3 parallelTurn=true versions=3                             |
| T4.5 | L4    | PASS 9/12        | PASS 9/12               | 0   | glob=true shell=false listDir=0 / glob=true shell=false listDir=0                                       |
| T4.6 | L4    | FAIL 6/12        | FAIL 6/12               | 0   | agent=true read=true mentionsWindows=false tools=5 / agent=true read=true mentionsWindows=false tools=5 |
| T5.1 | L5    | PASS 9/12        | PASS 9/12               | 0   | grep=true table=true categories=4 tools=2 / grep=true table=true categories=4 tools=2                   |
| T5.2 | L5    | FAIL 6/12        | PASS 8/12               | +2  | grep=true reads=1 tools=3 / grep=true reads=1 tools=3                                                   |
| T5.3 | L5    | PASS 9/12        | PASS 9/12               | 0   | read=true pool=true timeout=true suggestion=true / read=true pool=true timeout=true suggestion=false    |

## Summary

- A average: **8.72 / 12** across 18 tests
- B average: **8.89 / 12** across 18 tests
- A pass rate: 16/18
- B pass rate: 17/18

### 🔺 Improved in B (2)

- T2.4 (L2): +1
- T5.2 (L5): +2

### Per-layer averages

| layer | A avg | B avg | Δ    |
| ----- | ----- | ----- | ---- |
| L1    | 9.00  | 9.00  | 0.00 |
| L2    | 8.83  | 9.00  | 0.17 |
| L3    | 8.50  | 8.50  | 0.00 |
| L4    | 9.00  | 9.00  | 0.00 |
| L5    | 8.00  | 8.67  | 0.67 |
