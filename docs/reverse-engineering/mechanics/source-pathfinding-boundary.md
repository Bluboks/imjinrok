# Source pathfinding boundary

## 질문과 상태

질문: **`FUN_00425b20`의 `0x00425c59 → FUN_00445290` 호출에서 wrapper, search, candidate state machine,
footprint predicate, fallback과 waypoint postprocess는 어떤 좁은 범위까지 정적으로 확인되는가?**

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | `정적 확정` | 아래 함수의 전체 raw body, generated function/reference metadata, call edge와 명시한 control/data-flow 범위 |
| 재현 | `재현 완료` | cap 경계, 정확한 candidate vector/strict tie, goal·partial fallback, footprint block/OOB, frontier-capacity와 wrapper failure synthetic vector |
| 구현 | `의도적 적응` | `imjinrok:source-greedy-local-adapter`는 아래의 bounded kernel을 product full-path contract에 연결한다. 이는 `source-backed-adaptation`이며 원작 전체 pathfinding parity 주장이 아니다. |

이는 전체 이동 시스템 또는 원작 일치 주장이 아니다. `0x00ae27e4` terrain producer/의미, global workspace lifecycle,
scheduler serialization, product coordinate mapping과 caller 이후 이동 lifecycle은 미확인이다.

## 고정 입력과 provenance

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/functions.json` | `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` |
| `analysis/generated/imjinrok2/references.json` | `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` |

생성기 [`extract-source-pathfinding-evidence.mjs`](../../../tools/imjinrok/extract-source-pathfinding-evidence.mjs)는 세 입력의
전체 hash와 `sourceSha256`, 함수 metadata/instruction digest, 각 raw 함수 본문 SHA-256, 다음 direct call edge를 모두
검사한다. 어느 하나라도 변조되거나 malformed이면 실패한다.

| 함수 | body range (끝 제외) | 확인한 역할 범위 |
| --- | --- | --- |
| `FUN_00445290` | `0x00445290-0x0044532e` | accepted-node gate, Chebyshev→frontier capacity, core wrapper |
| `FUN_00444770` | `0x00444770-0x00444ce5` | visit grid/frontier, strict score, candidate/search/fallback control flow |
| `FUN_00444570` | `0x00444570-0x0044466b` | eight-call candidate coordinate state machine |
| `FUN_004446a0` | `0x004446a0-0x00444764` | short next-waypoint postprocess **call boundary only** |
| `FUN_0043ab70` | `0x0043ab70-0x0043ac4f` | entity footprint mask/OOB blocked predicate |
| `FUN_00425b20` | `0x00425b20-0x004262e0` | `0x00425c59` caller edge only |

## 확인된 제어 흐름

`WORD 0x007c6624 > 6000`이면 wrapper는 `-1`을 즉시 반환한다. 그 외에는 start/goal Chebyshev distance가
`0..2 → 26`, `3..4 → 40`, `5+ → 80`인 `WORD 0x0054a8a0` **open-frontier capacity**를 선택한다. 이는 expansion budget가 아니다.
core는 candidate 삽입 뒤 open frontier count를 증가시키고 capacity와 비교하여 stop flag를 세운다.

core는 `0x0054a8a4`에서 `0x1fa4` DWORD를 zero-fill한다. 이는 `180×180` byte visit/depth grid다. global array-backed
frontier에서 requested goal까지의 squared Euclidean score가 가장 작은 항목을 꺼내며, 동점에서는 strict-less compare 때문에
먼저 있던 entry가 유지된다. accumulated `g` cost는 이 범위에서 더하지 않는다. 후보는 start x/y 각각 `±25` inclusive 안에서만
받고, parent depth에서 byte depth를 하나 증가시킨다. actual goal, frontier capacity 또는 frontier exhaustion에서 멈추며,
strictly closest reachable score를 fallback으로 기억한다.

candidate helper는 guessed compass order로 정규화하지 않는다. helper 자체의 시작 state 2 호출 순서는
`2→4→8→1→3→6→12→9→2`이다. 이 helper-only vector는 helper origin `(x,y)`에 대해 다음처럼 누적된다.

| state | next | candidate coordinate |
| ---: | ---: | --- |
| 2 | 4 | `(x+1, y+1)` |
| 4 | 8 | `(x, y+2)` |
| 8 | 1 | `(x-1, y+1)` |
| 1 | 3 | `(x-1, y)` |
| 3 | 6 | `(x+1, y)` |
| 6 | 12 | `(x+1, y+2)` |
| 12 | 9 | `(x-1, y+2)` |
| 9 | 2 | `(x, y)` |

이는 곧 core search candidate vector가 아니다. `FUN_00444770`은 helper call 전 `0x004448ac..0x004448d8`에서 globals를
selected `(x, y-1)`로 초기화한다. 따라서 actual search의 selected/current `(x,y)` 기준 eight candidates는 아래 순서다.

| call state | actual search candidate |
| ---: | --- |
| 2 | `(x+1, y)` |
| 4 | `(x, y+1)` |
| 8 | `(x-1, y)` |
| 1 | `(x-1, y-1)` |
| 3 | `(x+1, y-1)` |
| 6 | `(x+1, y+1)` |
| 12 | `(x-1, y+1)` |
| 9 | `(x, y-1)` |

decreasing visit-depth neighbor backtrack은 `FUN_00444770`의 `0x00444afc..0x00444c32`에 있으며 같은 y-1 helper anchor를 쓴다. 그 뒤의
`FUN_004446a0`은 저장된 initial-depth coordinate의 step-vector 비교로 short waypoint를 선택하지만, 현재 extractor의
byte anchor는 이 callee의 세부 output rule까지 고정하지 않는다. 따라서 `FUN_004446a0`에 대해 주장하는 범위는
**postprocess call boundary**뿐이다. raw output coordinate를 product world/screen coordinate로 이름 붙이거나 full path
product output으로 이식하지 않는다.

## Footprint predicate

`FUN_0043ab70`은 entity `+0x1e3/+0x1e4` signed byte dimensions로 candidate anchor에서 끝나는 rectangle을 순회한다.
각 cell이 map bounds 밖이거나 `WORD 0x00ae27e4`와 entity `+0x1ee` mask가 overlap하면 `1`(blocked), 모두 clear면 `0`을 반환한다.
mask table의 terrain/ownership/other human meaning은 아직 확정하지 않았다.

## 재현과 실패 경계

생성 fixture는 [`analysis/fixtures/source-pathfinding-evidence.json`](../../../analysis/fixtures/source-pathfinding-evidence.json)이다.
pure reproducer는 wrapper capacity boundaries, exact state vector, strict-score tie, goal success, blocked goal closest fallback,
mask/OOB, frontier-capacity and accepted-node failure를 검증한다. `insertionParentTrace`는 reference model이 candidate insertion에
붙인 trace일 뿐, 원본이 저장한 parent path나 original waypoint output이 아니다. fixture/source EXE/functions/references 한 byte
변조와 malformed pure input도 fail closed한다.

```sh
pnpm imjinrok:extract-source-pathfinding-evidence
node --test tools/imjinrok/source-pathfinding-evidence.test.mjs
```

## 제품 어댑터 경계

`imjinrok:source-greedy-local-adapter`는 stable Pathfinder registry로 등록되며, K01 scaffold metadata가 이 id를
선택한다. `core:a-star`는 계속 기본 profile이고 scenario profile은 기존 우선순위로 map selection을 덮어쓴다.

어댑터는 source kernel의 actual candidate 순서, `±25` local window, strict squared-goal score/tie, frontier capacity,
goal insertion stop, closest fallback과 insertion-parent trace만 사용한다. 최신 endpoint에서 bounded local search를 반복해
trace에서 start를 제외하고 이어 붙이며, cycle/no-progress와 보수적인 전체 `6000` accepted-node budget에서 멈춘다.

다음은 product policy이며 원본 동작으로 주장하지 않는다.

- `isTilePassableForUnit`와 `getEntityBlockingTiles`를 이용한 terrain/resource/mobile collision callback
- 기존 `resolveWalkableGoals`의 blocked-goal resolution 및 `allowPartial` full-path contract
- local trace chaining, product goal-set adaptation, accepted-node budget과 snapshot/profile lifecycle

이 adapter는 `FUN_004446a0`의 short waypoint postprocess를 구현하지 않는다. 또한 source kernel에는 `core:a-star`의
diagonal corner-cut rejection을 추가하지 않는다. source mask producer/meaning, global workspace lifecycle/serialization,
raw-to-product coordinate와 caller 이후 movement lifecycle은 계속 미확인이다.

## 다음 분석 작업

- `0x00ae27e4` producer, terrain table semantics와 update lifetime을 독립적으로 닫는다.
- global pathfinding workspace owner/reset and scheduler serialization을 좁은 static question으로 분석한다.
- `FUN_004446a0` output coordinate와 product coordinate mapping을 독립 evidence로 검증한다.
