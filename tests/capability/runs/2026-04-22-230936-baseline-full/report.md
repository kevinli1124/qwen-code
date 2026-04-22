# Run 2026-04-22-230936 · baseline-full

| id   | layer | verdict | total | notes                                 |
| ---- | ----- | ------- | ----- | ------------------------------------- |
| T1.1 | L1    | PASS    | 9/12  | race=true lock=true tools=0           |
| T1.2 | L1    | PASS    | 9/12  | latency=true async=true tradeoff=true |
| T2.5 | L2    | PASS    | 9/12  | xss=true innerHTML=true fix=true      |
| T3.4 | L3    | FAIL    | 6/12  | read=false tools=1                    |
| T3.5 | L3    | FAIL    | 7/12  | read=false covered=3/4 example=false  |
| T4.1 | L4    | PASS    | 12/12 | memory_write=true                     |
| T4.4 | L4    | PASS    | 9/12  | reads=3 parallelTurn=true versions=3  |
| T4.5 | L4    | PASS    | 9/12  | glob=true shell=false listDir=0       |
| T5.2 | L5    | PASS    | 8/12  | grep=true reads=1 tools=3             |

- L1: 2/2 passed
- L2: 1/1 passed
- L3: 0/2 passed
- L4: 3/3 passed
- L5: 1/1 passed
