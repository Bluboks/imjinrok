# K01 source handle allocation·generation·release lifecycle

분석 질문: K01 source entity의 `slot + generation` handle은 언제 할당·생성·검증·무효화·해제되며,
같은 slot 재사용 뒤 이전 참조를 어떻게 거부하는가?

기준일: 2026-08-01

## 판정과 범위

| 항목 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정(범위 한정) | 원본 1,200-slot source pool의 allocator, generation write, active-list release, 확인된 reader predicate와 K01/native/projectile 소비자 |
| 재현 | 재현 완료 | allocator age/tie/wrap, generation wrap, validity gates, swap-last release, same-slot stale/new handle, native failure/OOB/terminator, death retain/release |
| 프로젝트 이식 | 없음(분석 전용) | production package/app에는 변경하지 않음. 전체 entity mega-struct, 모든 runtime writer와 identity policy는 닫지 않음 |

이 문서는 [`k01-hero-death-lifecycle.md`](k01-hero-death-lifecycle.md)의 health→death→release 결과와
[`k01-reinforcement-placement-policy.md`](k01-reinforcement-placement-policy.md)의 descriptor 정책을
slot/reference lifecycle로 연결한다. 재현기는
[`extract-k01-source-handle-lifecycle.mjs`](../../../tools/imjinrok/extract-k01-source-handle-lifecycle.mjs),
fixture는 [`k01-source-handle-lifecycle-vectors.json`](../../../analysis/fixtures/k01-source-handle-lifecycle-vectors.json),
테스트는 [`k01-source-handle-lifecycle.test.mjs`](../../../tools/imjinrok/k01-source-handle-lifecycle.test.mjs)다.

## 고정 입력과 증거 경계

| 입력 | SHA-256 | 용도 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 원본 PE32 x86 |
| `analysis/generated/imjinrok2/seeds.json` | 같은 EXE source SHA | seed 함수·byte anchor |
| `analysis/generated/imjinrok2/functions.json` | 같은 EXE source SHA | 함수 경계·instruction count/range |
| `analysis/generated/imjinrok2/references.json` | 같은 EXE source SHA | call edge |

추출기는 위 네 산출물의 source hash, 17개 함수 contract, 11개 call edge, 19개 raw byte anchor를
검증한 뒤 19개 fixture vector를 replay한다. vector 결과와 expected object 및 결과 SHA-256이 모두
일치하지 않으면 실패한다. 이는 원본 실행을 주장하는 동적 replay가 아니라, 고정 raw evidence와
순수 lifecycle model의 분석 재현이다.

## pool·record·handle

```text
record base       0x00635258
record stride     0x558 bytes
slot count        1200 (allocator scans 1..1199; slot 0 is the failure result)
active table      0x007d0ed8 + slot*2, WORD
reuse-age table   0x007d1838 + slot*2, signed WORD
active list       0x00842dd8[] WORD; count 0x00843738
generation global 0x007c5f98, WORD
record slot       entity +0x1b6, WORD
record generation entity +0x1b8, WORD
health            entity +0x3e, signed WORD
active gate       entity +0x1f0, BYTE (only +0x1f0-gated readers)
```

최소 generation-aware reader predicate는 다음 순서다.

```text
slot ∈ 1..1199
and activeTable[slot] != 0
and signed(entity +0x3e) > 0
and (entity +0x1b6, entity +0x1b8) == supplied(slot, generation)
```

`0x00441db0`은 active-table→positive-health만 검사하고 generation을 비교하지 않는다.
`0x00441de0`은 여기에 full reference를 더한다. `0x00441e40`은 active-table→positive-health→
`BYTE +0x1f0 != 0`, `0x00441e80`은 그 뒤 full reference를 더한다. generation `0`은 sentinel이
아니며, record와 supplied 값이 모두 0이면 유효하다.

## allocation과 generation

`0x00483a60`은 slot 1부터 1199까지 순서대로 본다.

1. active table WORD가 0인 후보만 검사한다.
2. signed reuse-age가 현재 best(초기 0) 이상이면 선택하고, `>=`이므로 동률은 더 뒤 slot이 이긴다.
3. 방문한 모든 inactive age를 선택 여부와 무관하게 1 증가시키며 signed WORD wrap을 적용한다.
4. 모든 slot이 active이거나 모든 inactive age가 음수면 best가 갱신되지 않아 slot 0을 반환한다.

`0x00483c50`은 global generation을 `INC AX`한 뒤 `0x00437650`을 호출한다. initializer는
`0x558` bytes를 zero-fill하고 slot을 `+0x1b6`, generation을 `+0x1b8`에 쓴다. 따라서
`0xffff → 0`은 확인된 16-bit 연산이며, generation의 장기 wrap 정책은 미확정이다.

## release와 stale reference

`0x00483aa0`은 active table이 이미 0이면 list·record mutation 없이 early return한다. active slot이면
확인된 순서는 다음과 같다.

1. record cleanup을 수행한다.
2. record의 active-list position을 마지막 list entry로 교체하고 마지막 WORD를 0으로 만든다.
3. active count를 감소시키고 이동한 record의 position을 다시 쓴다.
4. category cleanup 뒤 `activeTable[slot]=0`, `reuseAge[slot]=0`을 쓴다.

release는 health, `+0x1f0`, `+0x1b6/+0x1b8`을 eager-clear하지 않는다. 그러므로 health가 0이 된
retained record 또는 release 후 record에 남은 old full reference는 table/health/generation reader에서
실패한다. release 뒤 allocator가 같은 slot을 고르고 generation을 다시 증가시키면 old handle은
generation mismatch로 실패하고 새 handle만 통과한다.

## death, native create, projectile consumer

- 기존 death dispatcher는 state 7에서 `BYTE +0x74 & 0x80`이 있으면 return 1로 slot을 retain하고,
  없으면 return 0으로 같은 outer pass에서 release한다. `+0x74` writer의 모든 mission-instance 도달
  CFG는 아직 닫히지 않았다.
- `0x00488420` native descriptor helper는 allocator를 signed coordinate bounds보다 먼저 호출한다.
  slot 0이면 즉시 0을 반환하고 앞선 record는 유지한다. allocator 성공 후 OOB coordinate는 해당 create만
  건너뛰고 다음 descriptor를 계속한다. class 0 terminator는 allocate 없이 1을 반환한다.
- `0x004885e0` K01 owner/class lookup은 `0x00441db0`으로 positive record를 고른 뒤 full reference를
  반환하고, K01 protected check가 `0x00441de0`으로 이를 검증한다.
- `0x00410cc0` projectile update는 `0x00441e40`을 호출하지만 projectile allocator/active table은
  source 1,200-slot pool과 별도다. 이를 source pool identity로 합치지 않는다.

## 재현 벡터와 남은 질문

fixture는 all-free/later-tie/full-pool/slot-1199, signed age wrap, generation zero/wrap, positive-health/
active-gate/full-reference validity, release/double-free, same-slot stale/new, native failure/OOB,
death retain/release를 독립 vector로 고정한다. 테스트는 EXE, seeds, functions, references, fixture를
각각 tamper한 입력이 거부되는지도 확인한다.

남은 질문은 (1) runtime `+0x74`·`+0x1f0` writer 전체 CFG와 mission reachability, (2) 원본 update unit과
project 24 Hz/FPS 및 identity policy, (3) alias/computed writes와 전체 entity mega-struct, (4) 16-bit
generation 장기 wrap 정책이다. 이 packet은 위 항목을 추정해 production model로 승격하지 않는다.

검증 명령:

```bash
pnpm imjinrok:extract-k01-source-handle-lifecycle
node --test tools/imjinrok/k01-source-handle-lifecycle.test.mjs
```
