# K01 accepted source-update scheduler 경계

질문: K01 stage 1 진입 뒤 scheduler mode·selector·guard·persisted config의 source-bound
producer chain은 무엇이며, 승인된 원본 update 한 번에서 K01 updater, entity update, projectile
pool, result resolver가 어떤 순서와 횟수로 호출되는가?

## 상태와 범위

- 분석 상태: `정적 확정` — stage 1→state 3→scheduler, cold-start selector transfer/default,
  pre-update result wrapper→K01 dispatcher, entity/projectile outer call과 direct mode/guard
  writer 경계에 한정한다.
- 재현 상태: `재현 완료` — config failure/success, selector `0..4`, mode `1`/non-`1`, guard
  zero/nonzero, same/distinct raw tick, dispatcher pre-gates/timers/updater boundary, accepted/
  rejected gate, wrap, cross-invocation cache/counter/state, result-before-pool과 pool count를
  독립 fixture로 재현한다.
- 구현 상태: `없음` — production simulation/app과 runtime clock adapter는 변경하지 않았다.

독립 추출기 [`extract-k01-accepted-update-scheduler.mjs`](../../../tools/imjinrok/extract-k01-accepted-update-scheduler.mjs)와
테스트 [`k01-accepted-update-scheduler.test.mjs`](../../../tools/imjinrok/k01-accepted-update-scheduler.test.mjs)는
EXE·generated `functions/references/jump-tables/seeds`의 canonical hash를 parse 전에 검사하고,
이 문서의 direct edge와 byte anchor를 다시 확인한다. fixture는 다음 명령으로 생성한다.

```bash
node tools/imjinrok/extract-k01-accepted-update-scheduler.mjs \
  --output analysis/fixtures/k01-accepted-update-scheduler.json
```

## 원본과 provenance

| 입력 | 크기 | SHA-256 |
| --- | ---: | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/functions.json` | 1,468,333 | `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` |
| `analysis/generated/imjinrok2/references.json` | 17,206,569 | `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` |
| `analysis/generated/imjinrok2/jump-tables.json` | 607,724 | `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` |
| `analysis/generated/imjinrok2/seeds.json` | 9,436,451 | `386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2` |

`config.hq` 문자열은 EXE `0x004bb980`의 NUL 포함 bytes이며 SHA-256은
`449c3469bb28cf424c82acaadb56b4f977d0b4aba5fa4d3824ebe4079fd2e836`다. generated artifact의
정확한 byte length는 extractor output과 기존 cold-start/projectile evidence가 단일 출처다.

핵심 함수의 source byte range와 instruction digest는 다음과 같다.

| 함수 | byte range | 명령어 수 | instruction SHA-256 |
| --- | --- | ---: | --- |
| `FUN_0045f190` | `0x0045f190-0x0045f243` | 42 | `a69bbff3a7935d129f2786c5e0d56db59441fe460b7951b40e2b8ca637456b8b` |
| `FUN_0043f4f0` | `0x0043f4f0-0x0043f55a` | 37 | `eeee18b6012892ee3e108fadc425827e06bbb185ba583aeb6f514c16fbb74802` |
| `FUN_0043f6e0` | `0x0043f6e0-0x0043f74f` | 38 | `c2066429a049d75f33dd69b1bf75d590af1684d824b2aed345d08a1e798f4c24` |
| `FUN_00447bc0` | `0x00447bc0-0x00447cfa` | 75 | `c5166177633b255028ae02aa6f7a60350f7e93f09ce5fcf101ac92ba066eefde` |
| `FUN_004464c0` | `0x004464c0-0x0044735e` | 988 | `07f105738a43b7411865e1d6d08791c2768e2a89fb28e289b0eb349fb7354904` |
| `FUN_004481d0` | `0x004481d0-0x00448225` | 21 | `3c4ad59801dd66dcb03339fb810c187160b58ccdc18848f6e80ee39bd77b4d91` |
| `FUN_0048ddb0` | `0x0048ddb0-0x0048deca` | 105 | `276da99513996baa45d73bd4c09da0fe231fb10e65b762b4bbf3bfb144908981` |
| `FUN_0048a5c0` | `0x0048a5c0-0x0048a878` | 181 | `c2a0e73fb0e208846f77187fa11310cdd4177f62c6fbd61732d822f513115791` |
| `FUN_00447360` | `0x00447360-0x00447599` | 156 | `8700298d4e2900a0f2833b1f9e1143c47d324478ef5fa419170e7945de7dd772` |

## producer chain

1. Main raw state `1` at `0x004600cb` calls `FUN_0045f190`. Its `FUN_0048d410` signed stage
   switch sends stage `1` to `FUN_0048d740`, which copies `stagemap\k01.map`; the continuation
   register writes raw main state `3`.
2. Raw state `3` calls `FUN_00447bc0` at `0x0045fd5d`. Raw state `23` calls the same scheduler
   only when `WORD 0x00c06e20 == 1`; this is a separate main-loop gate.
3. Cold start passes settings object `0x00634ab8` to `FUN_0043f6e0`. Open failure returns zero and
   `FUN_0043f4f0` writes selector `DWORD object+0x14 = 0x00634acc` to `2`. Success transfers
   `0x1d4` bytes into the object, so persisted bytes covering `+0x14` are retained. The transfer
   callee is kept neutral; config validity is not inferred.
4. `FUN_00447bc0` first checks the transition branch at `0x00447be0`. When the transition guard
   WORD is exactly `1` while main state is `3`, it writes main state `0x16` and returns before
   `FUN_004464c0`; this is an early transition rejection with no result dispatcher or entity/
   projectile pass. Only the other path calls `FUN_004464c0`. Its first relevant call is
   `FUN_004481d0`, which compares raw tick `0x007c5f80` with cache `0x00552780`; equal ticks skip
   every dispatcher input, while a distinct tick writes the cache before calling `FUN_0048ddb0`.
5. `FUN_0048ddb0` checks its three WORD pre-gates (`0x00c06e34`, `0x007c627c`, and
   `0x007c627e`). Any taken pre-gate returns immediately with `AX=0`, `1`, or `0xffff`; only
   returned `AX=1/0xffff` reaches the wrapper's result commit. When no pre-gate is taken, the
   function calls `FUN_0048d6f0` (win-first/loss timer resolver). Only a zero timer result then
   reaches signed selector `1` and `FUN_0048a5c0`. `dispatcherResultAx`는 K01 handler 호출
   경계에 공급하는 AX 값이다. 실제 K01 updater의 확인된 반환은 `0/1`이며, `0xffff`·`0x1234`
   같은 주입값은 wrapper 분기 검증용으로만 사용하고 K01 자연 반환으로 주장하지 않는다.
6. When the distinct wrapper returns zero, the remaining pre-update projection uses exact DWORD
   `preUpdateResult == 1` only when the command gate WORD is not exactly `1`; the source
   `0x00446506` branch ignores that projection in exact mode `1`. The scheduler then reaches
   `FUN_00447e10`. Only an accepted wall-clock/command-gate path increments raw tick and calls
   `FUN_00447360` once.
7. `FUN_00447360` performs its active entity loop (`FUN_0043c9c0`) and then its raw projectile
   passes: pool A checks 100 slots and calls `FUN_00410cc0` for active records; pool B checks 60
   slots and calls `FUN_00401440`. Cleanup calls are conditional on each updater returning zero.

핵심 direct callsite는 `0x0045fa3b` (main→startup), `0x0045f20c` (startup→config load),
`0x0045f21a` (load failure→default), `0x0045fd5d` (state 3→scheduler), `0x00447c18`
(scheduler→pre-update), `0x004464f5` (pre-update→tick wrapper), `0x004481e4` (wrapper→mission
dispatcher), `0x0048dde5` (dispatcher→timer resolver), `0x0048de12` (dispatcher→K01 updater),
`0x00447c65` (scheduler→wall-clock gate), `0x00447cb8` (scheduler→outer entity/projectile pass),
`0x00447499` (entity pass→entity dispatcher), `0x004474d0`/`0x00447505` (pool A/B updater)다.
Extractor는 cleanup edge `0x004474da`/`0x0044750f`도 함께 검사한다.

The resulting accepted-step order is:

```text
FUN_00447bc0
  → early transition guard (state 3 + guard 1: write 0x16 and return)
  → FUN_004464c0 (otherwise)
    → FUN_004481d0 (same-tick skip OR cache-write → FUN_0048ddb0)
      → pre-gate/timer result commit OR FUN_0048a5c0 (K01 stage 1, distinct raw tick only)
  → FUN_00447e10 (accepted gate)
  → FUN_00447360 (exactly once)
    → entity updates
    → projectile pool A (100 slots)
    → projectile pool B (60 slots)
```

When a dispatcher pre-gate, timer resolution, or K01 updater returns `AX=1/0xffff`,
`FUN_004481d0` commits result state and calls `FUN_00446420`; `FUN_004464c0` returns `1`, so that
scheduler attempt has zero entity and projectile passes. A same raw tick can still proceed to the
wall-clock gate, but does not invoke the mission resolver or consume any injected dispatcher values
again. The replay carries four bounded post-state fields across invocations: raw tick
`0x007c5f80`, cached tick `0x00552780`, accepted-step counter `0x007c5f84`, and the next result/
main-state WORD. The wrapper cache survives clock or command rejection; raw tick and counter advance
only on an accepted pass, with DWORD wrap.

## mode·guard boundary

`FUN_00485890` reads an argument WORD and guard `WORD 0x004bdff4`. Argument `1` writes mode
`WORD 0x00c06e20`: guard zero writes `1`, every nonzero guard writes `0`; argument `2` and all
other values do not write mode. The canonical direct mode-write set is six sites, while the guard
direct-write set is five sites. The `FUN_0045f250 → FUN_004a5070` source path passes argument `2`,
so it does not prove a K01 mode write.

Therefore stage-one reachability is closed through state `3` and the scheduler, but **the concrete
mode value for a K01 run remains unresolved**. The guard direct-reference inventory is not an
alias-free writer-completeness claim: two serialization paths receive the guard address and indirect
or pointer-alias writers remain possible.

## reproduction vectors

The fixture and test cover:

- config open failure→selector `2`; successful transfer→retained selector;
- selector `0,1,2,3,4`→base `64,60,50,40,30 ms`, mode `1` bypass and non-`1` table selection;
- guard zero/nonzero with argument `1`, argument `2` no-write;
- same raw tick skip and next distinct tick dispatch;
- raw tick `0xffffffff→0` wrap as a distinct value;
- three dispatcher pre-gates, win-first/loss timer, early transition, mode-conditioned pre-update,
  wall-clock and command-readiness rejection;
- accepted entity count, exactly one outer projectile call, 100/60 slot pass counts;
- result resolver/updater before entity/projectile order and result-path pool count `0`;
- literal input/output event traces for forced-gate precedence, mature timer precedence, same-tick
  suppression, cache retention across invocations, DWORD wrap, updater AX boundary, and the exact
  `preUpdateResult` comparison.

Tamper tests mutate only a target EXE or generated artifact while preserving all other inputs. The
canonical source/artifact hash check fails first, so upstream provenance is not silently replaced by
a target mutation.

## proposed adapter contract and residual risk

The extractor and fixture remain analysis-only. They accept raw mode/selector/tick fields,
dispatcher gate/timer values, scheduler gate outcomes, and boundary counts, then emit an ordered
source-update trace and bounded post-state. They do not alter gameplay integration, invent a fixed-Hz
multiplier, map raw clock units to project time, or assign project identity to original slot/reference
values until those boundaries receive separate static evidence. The accepted-step counter and result
state fields are tracked only at the exact source writes named above; helper side effects outside this
bounded contract remain unresolved.

관련 세부 근거는 [clock mode producers](k01-clock-mode-producers.md), [cold-start selector](k01-clock-selector-initialization.md),
[projectile cadence](k01-projectile-pool-cadence.md), [mission result lifecycle](k01-mission-result-lifecycle.md),
[state-three bridge](k01-state-three-consumer-bridge.md)에 둔다.
