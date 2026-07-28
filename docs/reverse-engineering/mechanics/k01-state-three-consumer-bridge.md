# K01 state-3 후속 main-state consumer bridge

질문: **active state-3 scheduler가 직접 쓴 raw state `22/24/26`은 어떤 direct main-state
consumer로 이어지며, 기존 result relay 전에 raw state `5` 또는 mode routine에 직접 도달하는가?**

- 분석 상태: `정적 확정` — 아래 state-minus-one switch, raw `22/23/24..27` consumer와 기존
  final-result relay로 이어지는 direct bridge에 한정한다.
- 재현 상태: `재현 완료` — EXE/artifact provenance, function hash, switch case, call edge,
  raw byte anchor 및 reached-only vector를 extractor/test로 검증한다.
- 구현 상태: 없음 — main state, scheduler mode, clock과 project adapter를 변경하지 않는다.

결론은 source-bound bridge다. 이 direct bridge의 successor는 raw
`23/3/24/25/26/27/0x8c`와 기존 final-result relay/final target으로 한정된다. **raw state `5`,
`FUN_00484130`, `FUN_00485890`으로 가는 direct bridge edge는 없다.** 이는 indirect call,
pointer alias, 전역 session 또는 이후 별도 state writer의 부재를 뜻하지 않는다.

## 입력 고정과 기존 계약 교차 검증

| 입력 | bytes / SHA-256 | 역할 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | x86 state branch와 byte anchor |
| `functions.json` | 1,468,333 / `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` | function range·instruction hash |
| `references.json` | 17,206,569 / `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` | direct call edge |
| `jump-tables.json` | 607,724 / `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` | three canonical switch의 label/destination |

[`extract-k01-state-three-consumer-bridge.mjs`](../../../tools/imjinrok/extract-k01-state-three-consumer-bridge.mjs)는
각 artifact의 exact size/SHA-256와 embedded EXE source hash를 JSON parse 전에 확인한다. 또한
[active state-3 mode 경계](k01-state-three-mode-boundary.md)의 exact closure write set과
[K01 결과 presentation과 post-result 전환](k01-final-result-transition.md)의 poll-wrapper/relay
contract를 API로 교차 검사한다. 결과-state presentation/relay 의미를 이 문서에서 다시 구현하거나
다른 값으로 해석하지 않는다.

```bash
node --test tools/imjinrok/k01-state-three-consumer-bridge.test.mjs
node tools/imjinrok/extract-k01-state-three-consumer-bridge.mjs
```

## switch와 direct consumer

main switch `0x0045fd36`은 current main-state WORD를 decrement한 뒤 table `0x004607b0`을 읽는다.
따라서 canonical jump-table label은 raw state minus one이다.
The extractor separately anchors `0x0045fc83` (`BB 8C 00 00 00`, `BX=0x8c`) and
`0x0045fd1e` (`BE 01 00 00 00`, `SI=1`), so the `0x004603d9` relay stores are fixed-width
register values rather than inferred labels.

| raw state | label | destination | direct result |
| ---: | ---: | --- | --- |
| `22` | 21 | `0x004602be` | `FUN_0046f870(2)` → `FUN_00448ff0` → state `23` |
| `23` | 22 | `0x004602db` | conditional scheduler, poll, raw-result dispatch |
| `24` | 23 | `0x00460164` | `FUN_00493290` → state `25` |
| `25` | 24 | `0x004601b9` | `FUN_004932a0` → existing common result consumer |
| `26` | 25 | `0x004601c3` | `FUN_004932c0` → state `27` |
| `27` | 26 | `0x004601d6` | `FUN_004932d0` → existing common result consumer |

`FUN_00449090` is `0x00449090-0x00449260`, 118 instructions, SHA-256
`7fb4f74394b9f113ca0da3a2fbba16e877572eb06411e733d53cee4c4a30b290`.
Its canonical switch `0x00449242` maps source outcomes only as follows:

| source outcome | returned WORD |
| ---: | ---: |
| `3` | `3` |
| `8` | `8` |
| `10` | `10` |
| `32` | `32` |
| all other/out-of-range | `0` |

This return domain is exactly `{0,3,8,10,32}`; it never returns `5`.

## raw state 23 order and outputs

`0x004602db` first tests `WORD 0x00c06e20 == 1`. Only then does it call
`FUN_00447bc0` at `0x004602e4`. It always calls `FUN_00449090` at `0x004602e9` afterwards.
The following current-state comparison requires raw `23`; if scheduler changed it to `24` or `26`, the
poll completed but its secondary dispatch is skipped. This is the direct bridge by which the previous
state-3 contract can produce committed result states without interpreting a poll output after that change.

If current state remains `23`, secondary switch `0x00460322` only receives the above output domain.

| poll return | direct outcome |
| ---: | --- |
| `0` | keep `23` |
| `3` | call `FUN_00492630`, write returned SI `3` to current state |
| `8` | if `DWORD 0x004cc548 == 1`, `DWORD 0x007c5f80 < 1000` selects route argument `3`, otherwise `2`; then target `0x140`, current `0x8c`. If that DWORD is not 1, it jumps to `0x004603d9`, which stores pre-switch `SI=1` as target and pre-switch `BX=0x8c` as current. |
| `10` | `DWORD 0x00634ac0 == 1` causes its exact write/call prefix. Then `DWORD 0x00c06e38 == 1` selects target `0x1c`, current `0x8c`; otherwise target `0x0a`, current `0x8c`. The `0x00c06e20 == 1` subpath calls `FUN_00474ae0` and clears that mode WORD before the `0x1c` writes. |
| `32` | the same `0x004603d9` path: target `1`, current `0x8c` |

The `8/10/32` paths use the existing shared teardown call before their state relay. This document does not
assign opaque callees or raw target codes human-facing meanings.

## result-state bridge reuses final-result evidence

The wrapper provenance already fixed in the existing final-result unit is:

| wrapper | instructions / SHA-256 | bridge behavior |
| --- | --- | --- |
| `FUN_00493290` | 5 / `1ea8ffe512653b2969ff443fcd05080b27100d289cbb3556cc90c26cb42c2cba` | raw `24` initializes then writes `25` |
| `FUN_004932a0` | 9 / `558b261cb05641704769a9486e726df60760519bfd0cb8941c33612622b97159` | raw `25` helper returns only `0` or `0x1c` |
| `FUN_004932c0` | 5 / `4696a43d2ed7740cbc445e1fa67882a2f24c1676855bcfecc101edee070d72d0` | raw `26` initializes then writes `27` |
| `FUN_004932d0` | 9 / `d19c6d9e3b1783c591a2b4135022ac8c2bac5b182183c4fa91f0d82e23c2dff1` | raw `27` helper returns only `0` or `0x1c` |

For helper `0`, raw `25/27` remains unchanged. For helper `0x1c`, the common consumer writes target
`0x1c` to `0x00c06da0` and current `0x8c`; the existing `0x8c→0x96→0x1c` relay and final routing remain
the single source of truth in the final-result document.

## reached-only vectors and next boundary

The focused test covers raw `22→23`, raw 23 scheduler state change before secondary dispatch, all poll
domain outputs, raw 23 `3/8/10/32` targets, raw `24→25`, raw `26→27`, pending/completed `25/27`
wrapper output, WORD/DWORD malformed inputs, and independently tampered/stale custom artifact paths.

With both direct post-state-3 consumer paths now closed, the next unresolved K01 mode question is
**pre-stage-1/session-entry provenance and persistence of the mode selector/global**, including the separate
`FUN_004a5070` caller of `FUN_00485890`. This is not a claim that no later indirect/alias writer exists;
it only moves the first unclosed direct bridge boundary earlier than stage 1.
