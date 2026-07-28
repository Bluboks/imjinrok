# K01 scheduler mode direct writer 집합

질문: **scheduler mode `WORD 0x00c06e20`의 complete canonical direct `WRITE` set은 무엇이며,
source-bound `FUN_0045f250 → FUN_004a5070 → FUN_00485890` path가 mode-writing argument를
실제로 전달하는가?**

- 분석 상태: `정적 확정` — six direct writer sites, 고정폭 register source, `FUN_00485890`
  argument `1/2`, 그리고 명시한 `FUN_004a5070` call closure에 한정한다.
- 재현 상태: `재현 완료` — EXE/artifact provenance, function hash, call edge, raw anchor,
  complete write-set digest와 reached-only output vector를 독립 검사한다.
- 구현 상태: 없음 — mode, clock 또는 project runtime을 변경하지 않는다.

이 문서의 negative boundary는 좁다. canonical direct reference가 여섯 writer를 보인다는 사실은
pointer alias, indirect writer, global ordering이나 전체 session reachability의 부재를 증명하지 않는다.

## 고정 입력과 extractor

| 입력 | bytes / SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `functions.json` | 1,467,804 / `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3` |
| `references.json` | 17,206,553 / `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c` |
| `jump-tables.json` | 607,724 / `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` |

[`extract-k01-mode-direct-writers.mjs`](../../../tools/imjinrok/extract-k01-mode-direct-writers.mjs)는
parse 전에 위 hash와 embedded source hash를 확인한다. 이후 7개 relevant whole-function
instruction hash, 6 call edge, 10 raw byte anchor, complete direct write set와 `FUN_004a5070`
closure count/digest를 검증한다.

```bash
node --test tools/imjinrok/k01-mode-direct-writers.test.mjs
node tools/imjinrok/extract-k01-mode-direct-writers.mjs
```

## complete canonical direct WRITE set

target `0x00c06e20`, type `WRITE`로 canonical `references.json` 전체를 filter하면 정확히 다음
여섯 entry다. normalized `(site, caller, target, type)` array SHA-256은
`ed5440303ed3a488de53bbc998f83bb67e1154c91f3f618269557de11574eb62`다.

| site | caller | reached direct mode output |
| --- | --- | --- |
| `0x00446483` | `FUN_00446420` | mode WORD가 정확히 `1`이면 `FUN_00474ae0` 뒤 WORD `0` |
| `0x00460377` | `FUN_0045f9c0` | raw-23 source-result-10 path의 exact-one mode branch에서 WORD `0` |
| `0x0047331c` | `FUN_004732a0` | reached timeout branch의 exact-one mode branch에서 WORD `0` |
| `0x00481e89` | `FUN_00481c50` | reached cleanup branch의 exact-one mode branch에서 WORD `0` |
| `0x0048591a` | `FUN_00485890` | argument WORD `1`, guard zero: WORD `1` |
| `0x00485942` | `FUN_00485890` | argument WORD `1`, guard nonzero: WORD `0` |

The four zero writers use proven register/dataflow rather than name-based assumptions.

- `0x0045fa40: XOR EBP,EBP` makes `BP=0` before the main state switch; raw-23
  `0x00460377: MOV WORD [0x00c06e20],BP` therefore writes zero.
- `FUN_004732a0:0x004732b5: XOR EDI,EDI` makes `DI=0`; the reached timeout writer
  `0x0047331c: MOV WORD [0x00c06e20],DI` writes zero.
- `FUN_00481c50:0x00481dcd: XOR EBP,EBP` makes `BP=0`; the cleanup writer
  `0x00481e89: MOV WORD [0x00c06e20],BP` writes zero.
- `FUN_00446420` uses immediate `MOV WORD [...],0` at `0x00446483`.

The extractor binds each source initialization and write with exact byte anchors. It does not elevate a
reached-branch condition into an assertion that the branch occurs in every K01 session.

## `FUN_00485890` argument boundary

`FUN_00485890` receives a stack WORD argument. For argument `1`, guard `WORD 0x004bdfF4 == 0` writes
mode `1` then copies `WORD 0x007c6614` to `0x00bccc44`; a nonzero guard writes mode `0`. For argument
`2`, there is no mode store:

| guard | argument WORD `2` outcome |
| --- | --- |
| zero | ECX `0x00a9b068`, tail jump `FUN_00474ae0`, mode unchanged |
| nonzero | return, mode unchanged |

The focused replay exposes the call/tail-jump and each observable mode/auxiliary write; malformed WORD
inputs fail loudly.

## source-bound `FUN_004a5070` path

`FUN_0045f250` has a direct call at `0x0045f26b` to `FUN_004a5070`. This document deliberately does
not call the caller “session entry”: its broader reachability and human-facing role are not proven here.
Within `FUN_004a5070`, bytes at `0x004a508e` push `2` and `0x004a5090` calls `FUN_00485890`.

The canonical call closure rooted at `FUN_004a5070` has 133 function entries with sorted-entry SHA-256
`7404706e0ac5459e9b0ba112ab3bd238d77c1bb25696d239306335769916938b`. Its only mode direct writes are
`0x0048591a` and `0x00485942`, both in `FUN_00485890`; the fixed argument `2` reaches neither store.
Thus this path is not evidence that it writes mode `0` or `1`.

## next boundary

The next narrow question is a concrete pre-stage-1 call path that reaches `FUN_00485890` with argument
`1`, or the persistence/order of the other four direct writers. Until that is closed, no global mode
value, fixed scheduler cadence, or project 24 Hz mapping follows from this complete direct-reference set.
