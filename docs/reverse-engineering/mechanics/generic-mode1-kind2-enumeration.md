# generic selection mode 1 · effect kind 2 다중 셀 열거와 callback 경계

기준일: 2026-07-28

## 질문과 판정

질문은 `FUN_00413700`의 공통 분기 `0x0041388b`에서 selection mode 1, effect kind 2가
어떤 셀과 후보를 어떤 순서로 처리하고 `FUN_00413b30`에 무엇을 넘기는가이다.

분석 상태는 `static-confirmed-generic-mode1-kind2-callback-boundary`, 재현 상태는
`부분 재현`(`partial-reproduction-complete-enumeration-input-projection`), 구현 상태는
`analysis-only-no-product-change`다. 셀 열거, bounds, 후보 선택, live gate, 중복 제거,
거리 감쇠, primary payload override, 소유자 절반 치환, consumer call 인자와 call 뒤 exclusion
append까지 재현했다. consumer 내부의 class 95 특수 callback과 death/reference invalidation
whole result는 이 문서의 재현 범위가 아니다.

## 근거 자산

- 원본: `original/imjinrok2/imjinrok2.exe`
- EXE SHA-256:
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- generated functions SHA-256:
  `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e`
- generated references SHA-256:
  `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5`
- generated jump tables SHA-256:
  `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f`
- extractor: `tools/imjinrok/extract-generic-mode1-kind2-enumeration.mjs`
- fixture: `analysis/fixtures/generic-mode1-kind2-enumeration-vectors.json`
- focused test: `tools/imjinrok/generic-mode1-kind2-enumeration.test.mjs`
- fixture projection SHA-256:
  `8e77e785475a8d0496e5b96226213bfaf2b4aaa3cabe08a09df93c4cc4d67265`

extractor는 위 네 source hash와 source-to-EXE hash를 검증한다. 또한 raw code 8개 범위,
complete generated function 9개, `FUN_00413700` direct call 26개 전체 집합, generic branch
structured call 5개, 관련 structured data reference 14개와 effect-kind jump table을 함께
고정한다.

주요 raw 범위는 다음과 같다.

| 범위 | SHA-256 |
| --- | --- |
| `0x00413700-0x00413b03` dispatcher complete | `9db8d0e66c796932913a99a0b602c50124b02b0a66923082a64afa6251bcdd4f` |
| `0x0041388b-0x00413abd` shared multi-cell branch | `624d6cf5940aceffa60b7540aa0957baacc11fde72158ecb91b2c4427771713c` |
| `0x00412ff0-0x00412ffa` exclusion reset | `e95173f43b2f191d97b75180dc67bc730eea7e5c326b821c128ae8da4f871894` |
| `0x00413000-0x00413032` exclusion contains | `2540d564b87656101000fb1083e174c424f574f269efcefb6aa19240b4ad1d6e` |
| `0x00413040-0x00413065` exclusion append | `5fc1d4027a65b4e23d3b49047744f52691036f16bcb496583ffc0e8e0fac3b63` |
| `0x00441e40-0x00441e7b` candidate live gate | `a43ab36d3a8ffdbe265feaad703c178ba7f3ce4ed4445b891ffd92a2faf69df0` |

## 공통 분기와 promoted 범위

effect-kind jump table에서 `0x0041388b`로 들어오는 kind는
`2, 3, 4, 13, 14, 18, 24, 25, 26, 27`이다. 따라서 이 분기를 kind 2 전용이라고 부르지
않는다. 이 문서의 산식과 callback 인자 projection만 effect kind 2로 제한한다.

`FUN_00413700`의 9개 인자는 다음 순서다.

1. source reference DWORD
2. source owner의 low signed WORD
3. effect kind low WORD
4. radius low signed WORD
5. selection mode low WORD
6. payload low signed WORD
7. supplied target reference DWORD
8. center X low signed WORD
9. center Y low signed WORD

bounded projection은 radius 1..8과 nonnegative candidate index 0..32767을 승격한다. 음수
candidate index가 original pointer 산술에서 만드는 out-of-domain memory 동작은 재현하지 않는다.

## 셀 열거 순서

함수는 먼저 `FUN_00412ff0`으로 exclusion count WORD `0x0052dc38`을 0으로 만든다.
signed radius가 0 이하이면 caller argument slot 자체를 DWORD 1로 바꾸고 radius 1로 처리한다.

이후 ring `k=0..radius`를 순회한다. 각 ring에서 `dy=-k..k`, 그 안에서 `dx=-k..k` 순서이며
`abs(dy)==k || abs(dx)==k`인 perimeter만 처리한다. 결과는 다음 순서다.

```text
k=0: center
k=1: top row left→right, middle row left/right, bottom row left→right
k=2..radius: 같은 방식의 바깥 perimeter
```

따라서 center를 한 번 처리한 뒤 Chebyshev 정사각형의 모든 셀을 정확히 한 번씩,
ring 우선·ring 내부 row-major로 열거한다. 각 좌표는 low-WORD 합산 뒤 signed WORD로
검사되며 `0 <= x < DWORD[0x00ac2d90]`,
`0 <= y < DWORD[0x00ac2d94]`를 벗어나면 후보 table과 callback에 도달하지 않는다.

## 후보 선택과 live·중복 gate

selection mode low WORD가 정확히 1이면 후보 low WORD를 다음 table에서 읽는다.

```text
candidate = WORD[0x00ac2da4 + 2 * (x * 180 + y)]
```

mode가 1이 아니면 각 in-bounds 셀에서 supplied target DWORD의 low WORD를 다시 후보로 쓴다.
그래서 action 59가 만드는 mode 2에서는 첫 성공 후보가 exclusion에 들어간 뒤 같은 target의
나머지 셀은 중복으로 제거된다.

`FUN_00441e40(candidate low)`의 complete gate 순서는 다음과 같다.

1. registry `WORD[0x007d0ed8 + candidate*2] != 0`
2. candidate common entity의 signed `WORD +0x3e > 0`
3. candidate common entity의 `BYTE +0x1f0 != 0`

앞 gate가 실패하면 뒤 field는 읽지 않는다. `FUN_00441e40` 자체도 이 세 field만 판정하며
owner와 current full active reference를 읽지 않는다. live가 아니면 exclusion 검사에도 도달하지
않는다. live이면 `FUN_00413000`이 현재 exclusion WORD list `0x0052dbfc`를 선형 검색한다. 이미
있으면 payload, owner, current full reference와 source reference를 읽지 않고 consumer call도
건너뛴다.

## 거리 감쇠와 low-WORD primary override

중복이 아닌 live 후보의 거리는 `d=max(abs(dx),abs(dy))`, 즉 현재 ring 번호다.
signed division은 0 방향 절단이다.

```text
falloffPercent = trunc(d * 100 / (radius + 1))
reduction = trunc(falloffPercent * i16(payloadWord) / 100)
falloffPayload = i16(payloadWord) - reduction
```

`0x00413a02`는 `cmp di, WORD PTR [esp+0x4c]`다. 여기서 비교하는 값은 candidate low WORD와
supplied target reference의 low WORD다. full DWORD generation 비교가 아니다. low WORD가
같으면 거리 감쇠 결과를 버리고 supplied payload low signed WORD로 되돌린다.

그 뒤 candidate owner `BYTE +0x38`을 signed BYTE로 읽어 source owner signed WORD와
비교한다. 같으면 현재 payload를 `trunc(payload/2)`로 치환한다.

## consumer call과 exclusion append 경계

`0x00413a46`은 candidate low index로 current full active reference DWORD를
`0x0063540e` table에서 새로 읽는다. `FUN_00413b30`에는 다음 순서의 의미를 넘긴다.

```text
FUN_00413b30(
  sourceReferenceDword,
  candidateCurrentActiveReferenceDword,
  sourceOwnerSignedWord,
  effectKindWord,
  computedPayloadSignedWord
)
```

consumer 반환값은 검사하지 않는다. 반환 직후 같은 candidate low WORD로 `FUN_00413040`을
호출한다. exclusion count가 signed 30 미만이면 list에 append하고 count를 1 증가시키며,
30이면 append하지 않는다. 중요한 경계는 consumer가 append보다 먼저라는 점이다. 서로 다른
31번째 live 후보는 consumer call까지 도달하고 list 기록만 실패한다. 기록되지 않은 31번째 후보가
다시 나오면 contains가 계속 false이므로 consumer도 다시 호출되고 append만 다시 실패한다. 함수
전체 반환은 AX 0이다.

generic branch는 방금 읽은 current full active reference를 consumer에 넘긴다. consumer 아래의
`FUN_00413070`은 다시 low/high generation을 비교하지만, 동시 변경이 없다는 정적 단일 실행
가정에서는 generic kind 2의 generation mismatch가 구조적으로 도달하지 않는다. 반면 kind 9
같은 direct dispatcher branch는 raw supplied full reference를 넘길 수 있으므로 그 mismatch
경계가 남는다.

## caller reachability와 비주장

`FUN_00413700`의 complete direct call 26개 중 static call setup에서 effect kind 2를 직접
확정한 곳은 `0x0040ebb4`와 `0x0040ef30` 두 곳이다. 각각
`FUN_0040eab0`, `FUN_0040ee40`에 속하고 radius 1, record `BYTE +0x2e`의 dynamic selection
mode, record `WORD +0x9e` payload, record `DWORD +0x9a` supplied target을 전달한다.

현재 K01 action 59 chain은 이 record mode를 2로 만든다. 이 분석은 generic mode 1 알고리즘을
정적으로 확정하지만 K01에서 mode 1을 생산하는 caller나 original-game K01 mechanic
reachability를 새로 확정하지 않는다. 공통 분기의 다른 effect kind에 kind 2 payload 의미를
전파하지 않으며, consumer 반환 이후 상태 변화나 화면 유사성으로 parity를 주장하지 않는다.

fixture의 reached-only vector는 모든 셀이 bounds 밖이면 selection mode와 모든 후보·payload
입력을 읽지 않는 경로, mode 1 map 후보의 registry WORD가 0이면 health 이후 entity field와
supplied target·payload·owner·source reference를 읽지 않는 경로를 완전 출력으로 고정한다.
