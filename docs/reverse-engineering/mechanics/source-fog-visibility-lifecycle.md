# 원본 fog visibility state·dirty-grid lifecycle

## 질문과 상태

질문: `FUN_00460ba0`, `FUN_004610e0`, `FUN_00439260`, `FUN_00442ca0`은 source fog state와 dirty grid를 어떤 순서로 초기화·age·local-sight reveal하는가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | 180×180 state/dirty address식, literal `8` initialization, mode WORD 1의 `4→0`/`0→4` branch, entity owner/faction·selector·one-shot gate, selector `0..11` radius-pattern의 in-bounds nonzero→`0`/dirty `1` write |
| 재현 | 재현 완료 | canonical EXE/analysis digest, four whole-function hash, dispatch/pattern-data hash, initialization·두 age branch·matching/one-shot/bounds sparse vectors |
| 구현 | 없음 | 이 문서는 product/runtime code를 변경하지 않는다. |

## 고정 입력과 산출물

- EXE: `original/imjinrok2/imjinrok2.exe`, SHA-256 `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`.
- extractor: [`extract-source-fog-visibility-lifecycle.mjs`](../../../tools/imjinrok/extract-source-fog-visibility-lifecycle.mjs)
- fixture: [`source-fog-visibility-lifecycle.json`](../../../analysis/fixtures/source-fog-visibility-lifecycle.json)
- test: [`source-fog-visibility-lifecycle.test.mjs`](../../../tools/imjinrok/source-fog-visibility-lifecycle.test.mjs)

`pnpm imjinrok:extract-source-fog-visibility-lifecycle`는 fixture를 재생성한다. 생성기는 EXE와 canonical `functions.json`, `references.json`, `seeds.json`의 SHA-256을 먼저 고정하고, 네 함수의 metadata/range/instruction digest와 raw body hash, selector dispatch/data hash, 두 direct call edge를 확인한다. test는 두 번의 extraction이 committed fixture와 byte-identical인지와 모든 lifecycle vector 및 변조 거부를 검사한다.

## 주소·storage

| 항목 | 주소/범위 | 정적 사실 |
| --- | --- | --- |
| main object | `0x007c5ed8` | 이 bounded unit의 main-object base |
| fog state | `object+0x0000ee86 = 0x007d4d5e` | byte address식 `base + x * 180 + y` |
| dirty grid | `fogState+0x00007e90 = 0x007dcbee` | 같은 x-major address식; `FUN_004610e0` 시작에서 `object+0x16d16`에 `0x1fa4` DWORD zero-fill |
| initializer | `FUN_00460ba0`, `0x00460ba0-0x00460e20` | `0x00460d8f`에서 state base, `0x00460da1` literal `8`, inner stride `0xb4`, 두 180 extent loop |
| updater | `FUN_004610e0`, `0x004610e0-0x004611fd` | stack WORD `1`일 때만 raw `+0x1ec` branch로 grid age 후 active entity path |
| entity sight | `FUN_00439260`, `0x00439260-0x004392eb` | coordinates `+0x1bc/+0x1be`, local identity `WORD[0x00bccc44]`, player record byte `+0x5`, selector/latch path |
| reveal | `FUN_00442ca0`, `0x00442ca0-0x00442d95` | selector dispatch `0x00442d98-0x00442dc8`, radius data `0x004bbde8-0x004bc038`, state write `0x00442d6c`, dirty write `0x00442d74` |

## 제어 흐름

1. `FUN_00460ba0` writes `8` to every `fogState + x*180+y` cell. The bounded derived meaning is initial/never-revealed (`unseen`).
2. `FUN_004610e0` first returns with no dirty/state/entity work if `WORD[0x00bcbd84]` equals `1`. Otherwise it clears the 180×180 dirty byte region before later writes. Only when its stack WORD argument equals `1` does it age the state grid (other values still reach the later entity iteration):
   - raw `object+0x1ec == 1`: each state `4` becomes `0`, then dirty becomes `1`;
   - otherwise: each state `0` becomes `4`, then dirty becomes `1`.
3. The updater iterates active records and calls `FUN_00439260`. In that function, in-bounds entity coordinates are read from `+0x1bc/+0x1be`. It obtains local-player identity from `WORD[0x00bccc44]`, indexes the player record, and compares its byte `+0x5` with the caller-supplied owner/faction. A match uses `WORD entity+0x1a8` as selector. A mismatch only continues if `BYTE entity+0x1aa==1`; it clears that latch and substitutes selector `2`.
4. `FUN_00442ca0` selects one of its recovered patterns for selector `0..11` (`0/1/2` share the first; values above `10` use selector-11 default). Each pattern cell is bounds checked; its fog byte changes only if nonzero, then writes `0` and dirty `1`.

Within this bounded producer/recompute sequence, `0` is currently in local sight (`visible`) and `4` is the state aged before current local-sight recomputation (`previously seen/explored`). These labels do not assign palette, alpha, tint, blend, renderer pivot, or scheduler semantics.

## Renderer cross-check and boundary

[Source fog rendering evidence](source-fog-rendering.md) independently proves renderer caller paths distinguish literal `4` and `8`. This document imports only that literal distinction; it does not duplicate resource/mask/compositor facts or infer alpha/tint/palette/blend from them.

The human meaning of raw `object+0x1ec`, full entity-list ownership/type selector provenance and ordering, scheduler cadence, and product visibility policy are unresolved. This is source evidence only, not an original-game parity claim for any current runtime implementation.
