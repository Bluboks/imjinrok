# K0110 briefing outer update cadence

기준일: 2026-08-01

## 1. 질문과 범위

이 문서는 K0110의 `SETDELAYTIME`·`CHANGETITLE` 레코드가 어느 outer loop에서 소비되는지, 한 번의 accepted outer visit에서 `TITLE`·`OBJECTIVE`·`SPEECH`가 어떻게 순서대로 진행되는지만 다룬다. B01의 metadata/`SETDELAYTIME` 의미와 `CHANGETITLE` resource owner는 upstream 근거로 재사용한다. K01 gameplay scheduler (`0x00447bc0`/`0x00447360`)의 cadence를 briefing cadence로 재해석하지 않는다.

## 2. 출처와 상태

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `original/imjinrok2/script/K0110` | `d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8` |
| functions/references/jump-tables/seeds | `7e071f…e16e2`, `f64cfa…af9a5`, `0ae517…3fe2f`, `8e7c88…7bfb7` |
| outer extractor/fixture | `tools/imjinrok/extract-briefing-outer-update-cadence.mjs`, `analysis/fixtures/briefing-outer-update-cadence-vectors.json` |

분석 상태는 `static-confirmed`, 재현 상태는 `scoped-reproduction-complete`, 구현 상태는 `analysis-only-no-production-change`다. 원본 bytes, generated-artifact source hash, call edge, import, jump-table, fixture closure를 extractor/test가 함께 검증한다.

## 3. 닫힌 outer chain

```text
0x004ae539 entry
  -> 0x0045f9c0 main loop
     -> PeekMessageA(remove=0)
        -> message present: GetMessage/Translate/Dispatch, restart before idle clock
        -> message absent: timeGetTime -> signed-WORD state switch 0x14
           -> 0x0045ffb6 -> 0x0047f300 (owner 0x00c5ce78)
              -> 0x004824c0 once
                 -> at most one 0x004830f0 record consumer
              -> caller render/update work
```

The state-0x14 destination is fixed by jump table `functionEntry=0x0045f9c0`, `switchAddress=0x0045fd56`, label `19`, destination `0x0045ffb6`. `0x004824c0` also has direct callers `0x004888b0` and `0x0048b660`, both owner `0x00bcbe08`; they are preserved as mode-specific variants, not generalized into K0110 reachability.

## 4. Queue order and one-record rule

For active owner (`owner+0x08 == 1`), `0x004824c0` performs this order:

1. Sample the separate `GetAsyncKeyState(VK_ESCAPE/VK_RETURN)` key/advance gate (`0x004838b0`); an exact one may run previous-record cleanup (`0x004833f0`).
2. If `nextRecordIndex > 0`, check previous-record readiness (`0x00483500`).
3. If ready and `nextRecordIndex < recordCount`, call current-record consumer (`0x004830f0`) once.
4. The accepted consumer increments `owner+0xc18` exactly once (`0x004833a5`).
5. At end-of-queue, readiness plus `owner+0x0c == 0` permits teardown (`0x004823d0`).

A non-ready previous `SETDELAYTIME` returns before the consumer; there is no same-update loop that consumes multiple records. Thus accepted progression is one record per message-absent state-0x14 visit, not one record per fixed FPS tick.

## 5. Timing semantics

`SETDELAYTIME` stores `timeGetTime()` in `owner+0xc20` and sign-extends the script WORD into DWORD `owner+0xc24`. Duration zero is immediately ready and leaves the prior start value untouched. Otherwise `elapsed = (now - start) mod 2^32`; readiness is strict unsigned `elapsed > duration`. Equality retains both fields, while completion clears both. Vectors cover raw durations `0`, `15`, `100`, `500`, DWORD wrap, `-1` (`0xffffffff`, non-completing in the vector) and `-32768` (`0xffff8000`).

The extractor deliberately reports `exactMillisecondsPerAcceptedOuterUpdate = null` and `exactFps = null`. Windows message availability, key/readiness state, and the briefing caller's schedule do not provide a fixed wall-clock multiplier. Raw script sums such as B01's `665` are not visual milliseconds.

## 6. K0110 transition contract

The focused reproduction uses `CHANGETITLE → SETDELAYTIME(15) → TITLE → OBJECTIVE → SPEECH`:

- `CHANGETITLE` is accepted on one visit and updates the B01 resource owner lifecycle; the actual sprite compositor remains unresolved.
- `SETDELAYTIME(15)` is accepted on the next visit; equality at elapsed `15` retains the index, and elapsed `16` permits the following record.
- `TITLE` sets `owner+0x564=1`; the same caller's subsequent ordered render may include it.
- `OBJECTIVE` sets `owner+0x568=1`; ordered overlay checks objective before title.
- `SPEECH` is accepted only after the preceding readiness boundary. Portrait/resource details remain in the existing B01/SPEECH slices.

Fixture vectors also cover message-present dispatch (no idle visit), zero-delay progression, inactive manager no-op, and key-gate cleanup distinct from record advance.

## 7. Proven, disproven, unresolved

Proven: outer message-vs-idle branch; state-0x14 call chain; queue order; one-record-per-accepted-visit; strict delay and DWORD wrap; ordered TITLE/OBJECTIVE flags; three direct queue callers and their separation.

Disproven: treating the gameplay scheduler as briefing cadence; treating the `GetAsyncKeyState` gate as the Windows message queue; assuming a same-update multi-record drain; equating raw delay sums with wall-clock milliseconds.

Unresolved: exact wall-clock/fps exposure, `CHANGETITLE` sprite compositor/draw consumer, full `SPEECH` resource/portrait lifecycle, and K0110 reachability of the two alternate queue callers.

## 8. Reproduction and next analysis

Run `pnpm imjinrok:extract-briefing-outer-update-cadence` for the hash-bound report and `node --test tools/imjinrok/briefing-outer-update-cadence.test.mjs` for static-tamper and progression vectors. This packet intentionally changes no production code. The next independent slice is the unresolved compositor/draw consumer or a separately justified runtime timing measurement; neither may be filled by assuming 24 Hz.
