# Run 2026-04-23-002034 · profile-qwen-native

| id   | layer | verdict | total | notes                                              |
| ---- | ----- | ------- | ----- | -------------------------------------------------- |
| T1.1 | L1    | PASS    | 9/12  | race=true lock=true tools=0                        |
| T1.2 | L1    | PASS    | 9/12  | latency=true async=true tradeoff=true              |
| T2.5 | L2    | PASS    | 9/12  | xss=true innerHTML=true fix=true                   |
| T3.4 | L3    | PASS    | 8/12  | read=true tools=1                                  |
| T3.5 | L3    | PASS    | 9/12  | read=true covered=3/4 example=true                 |
| T4.1 | L4    | PASS    | 12/12 | memory_write=true                                  |
| T4.4 | L4    | PASS    | 9/12  | reads=3 parallelTurn=true versions=3               |
| T4.5 | L4    | PASS    | 9/12  | glob=true shell=false listDir=0                    |
| T1.3 | L1    | PASS    | 9/12  | sqli=true n+1=true magic=false tiered=true         |
| T2.1 | L2    | PASS    | 9/12  | include=false projection=true n+1=true             |
| T2.2 | L2    | PASS    | 9/12  | zero=true test=true raise=true                     |
| T2.3 | L2    | PASS    | 9/12  | setup=true ref=true computed=true watch=true       |
| T2.4 | L2    | PASS    | 9/12  | while=true temp=true tradeoff=true                 |
| T2.6 | L2    | PASS    | 9/12  | covering=true orderDate=true scan=true             |
| T4.6 | L4    | FAIL    | 6/12  | agent=true read=true mentionsWindows=false tools=5 |
| T5.1 | L5    | PASS    | 9/12  | grep=true table=true categories=4 tools=2          |
| T5.3 | L5    | PASS    | 9/12  | read=true pool=true timeout=true suggestion=false  |
| T5.2 | L5    | PASS    | 8/12  | grep=true reads=1 tools=3                          |

- L1: 3/3 passed
- L2: 6/6 passed
- L3: 2/2 passed
- L4: 3/4 passed
- L5: 3/3 passed
