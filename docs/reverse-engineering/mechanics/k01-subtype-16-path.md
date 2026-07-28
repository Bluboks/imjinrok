# K01 action 59 subtype `0x10` 고정 레코드·후속 효과 경로

기준일: 2026-07-28

## 질문과 판정

질문은 `FUN_00416600`의 action 59가 `FUN_004111b0`에 넘기는 전체 DWORD와 subtype `0x10`의
고정 레코드 생성, 공통 갱신, 종료 효과, 정리를 subtype `0x0c`와 어디까지 정적으로 구분할 수
있는가이다.

분석 상태는 `static-confirmed-k01-subtype-16-bounded-chain`, 재현 상태는
`부분 재현`(`partial-reproduction-bounded-projections`), 구현 상태는
`analysis-only-no-product-change`다. 생성·분기·선택된 최종 체력 write를 재현했지만
`FUN_00413700`의 모든 다중 대상 callback, 재경로 좌표 결과와 메인 루프 시간 단위는 전체
재현하지 않았다.

## 근거 자산

- 원본: `original/imjinrok2/imjinrok2.exe`
- SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- extractor: `tools/imjinrok/extract-k01-subtype-16-path.mjs`
- fixture: `analysis/fixtures/k01-subtype-16-path-vectors.json`
- focused test: `tools/imjinrok/k01-subtype-16-path.test.mjs`
- fixture projection SHA-256:
  `6a8713716e169ba4ca17018458650a49322e9545aec528896367bbfffb3a5e38`

extractor는 EXE와 `functions.json`, `references.json`, `jump-tables.json`의 고정 해시, 17개 raw
범위, 26개 complete generated function, 레코드 base/registry의 12개 complete direct reference,
subtype final switch와 effect-kind switch를 함께 검증한다. fixture는 payload 5, creation 3,
payload-attempt 3, reset 2, flight 5, endpoint 7, final-damage 13의 총 38개 vector를 가진다.

## action 59 전체 DWORD

`0x00416756-0x00416803`의 실제 register 흐름은 low WORD만으로 끝나지 않는다.

1. `xor edi,edi`는 candidate loop에 들어가기 전 `0x00416627`에서 한 번만 실행된다.
2. 각 후보는 bounds, `FUN_00411160` fixed-slot admission, `FUN_00464cc0` map/geometry
   admission 순으로 검사된다. 두 admission을 모두 통과해 payload construction에 도달한
   attempt의 `0x00416756-0x00416765`가 entity owner BYTE `+0x38`을 signed로 읽고
   `EDX = 705 * i8(owner)`를 full 32-bit로 계산한다.
3. 이어 `mov dx,[entity+0x46]`와 16-bit `imul dx,dx,3`은 이 EDX 상위 16비트를 보존한다.
4. `mov di`와 16-bit `imul di,di,25`는 이전 payload-construction-reached attempt가 만든 EDI
   상위 16비트를 보존한다. fixed-slot admission 또는 map/geometry admission에서 실패해
   payload construction 전에 빠진 attempt는 EDI 전체를 보존한다.
5. `add edi,edx`는 full 32-bit addition이고 low-half carry는 상위 half로 전파된다.
   backedge 뒤 다음 payload-construction-reached attempt는 이 결과의 상위 half를 이어받는다.
6. `push edi`는 전체 DWORD를 전달한다.

따라서 정확한 call-site DWORD는 다음과 같다.

```text
attack3 = u16(u16(entity WORD +0x46) * 3)
class25 = u16(u16(class/player table WORD) * 25)
ownerProduct = u32(705 * i8(entity BYTE +0x38))
ediBeforeAdd = (previousEdiDword & 0xffff0000) | class25
edxDword = (ownerProduct & 0xffff0000) | attack3
payloadDword =
  u32(ediBeforeAdd + edxDword)
```

함수 전체 projection은 임의 초기 EDI를 받지 않는다. 첫 payload-construction-reached attempt의
`previousEdiDword`는 항상 0이고, 이후 도달 attempt만 loop-carried EDI를 이어받는다.
통상적인 valid owner 0..7에서는
`ownerProduct` 상위 half가 0이지만, 명령어 자체는 signed BYTE 전체 범위를 허용한다.
raw `0x80..0xff`에서는 음수 곱의 상위 half가 보존된다. fixture는 단일 attempt의 multiply/carry
경계뿐 아니라 payload 도달 뒤 두 pre-payload gate 중 하나에서 reject된 attempt의 state 보존,
두 연속 도달 attempt의 carry 누적, signed-owner
상위 half와 loop-carried EDI의 full DWORD wrap을 고정한다. 이 결론은 좁은 payload 범위 외에도
`FUN_00416600` complete body `0x00416600-0x00416861`에 결합되어 있다.

다만 생성 초기화 함수는 call argument 13의 low WORD만 레코드 `WORD +0x9e`에 쓴다. 즉
전체 DWORD 전달은 정적으로 확정됐지만 downstream payload 소비는 `u16(payloadDword)`이며,
상위 half는 레코드에 보존되지 않는다.

## 고정 slot admission과 생성

`FUN_00411160`은 registry `0x00842500`의 slot 1부터 99까지만 순서대로 검사한다.

- 첫 zero WORD가 있으면 그 slot index를 반환한다.
- slot 1..99가 모두 nonzero면 WORD 0을 반환한다.
- action 59 caller는 0을 검사해 `FUN_004111b0`을 호출하지 않는다.

slot 0은 fixed-slot admission helper가 반환하지 않는다. `FUN_004111b0`은 supplied slot을
signed WORD로 읽고
다음 주소를 계산한다.

```text
record = 0x00aa85e8 + slot * 0x3a0
```

`FUN_0040c6c0`은 `rep stosd` 232회로 정확히 `0x3a0`바이트를 zero한 뒤 초기화한다.
`FUN_004111b0` 자체에는 성공/실패 branch가 없고 항상 AX 1을 반환한다. 이어
`FUN_0040f0e0`이 `registry[slot] = record.WORD(+0x26)`을 기록한다. subtype 0x10에서 이는
registry 값이 slot 번호가 아니라 subtype 16이라는 뜻이다. 실제 writer는 record `+0x24`를
index로, record `+0x26` subtype을 registry 값으로 쓴다. 따라서 registry nonzero가 active
admission이고 value는 subtype이다.

주요 초기 필드는 다음과 같다.

| offset | 폭 | 생성 시 값·출처 |
| ---: | --- | --- |
| `+0x16` | WORD | tick 3분주 내부 phase |
| `+0x22` | WORD | active state 1 |
| `+0x24` | WORD | slot |
| `+0x26` | WORD | subtype |
| `+0x2e` | BYTE | mode/selection-mode 인자; action 59는 2 |
| `+0x3c` | signed BYTE | `+0x16` phase divisor |
| `+0x9a/+0x9c` | DWORD | context/target reference의 low index/high generation |
| `+0x9e` | WORD | call payload DWORD의 low WORD |
| `+0xa0` | DWORD | source reference |
| `+0xa4` | signed WORD | source가 live면 source entity `BYTE +0x38`의 signed owner, 아니면 `-1` |
| `+0xa6/+0xa8` | WORD | path current/end index, 초기 0 뒤 path initializer가 갱신 |
| `+0x114` | WORD | tracking exact-one gate |
| `+0x116` | WORD | tracking count, bounded projection은 0..15 |
| `+0x11c/+0x25c` | WORD[160] | path X/Y, promoted 정상 read index 0..159 |

`FUN_0040c6c0`은 시작·끝 좌표 범위를 검사하고 path initializer를 호출한다. 범위 밖이면 진단
경로에 도달하지만 생성 자체를 rollback하지 않는다. map admission helper가 실패해 caller가
생성을 건너뛰는 경로와 fixed pool full no-op은 fixture에 분리했다.

## 공통 update·이동·정리

`FUN_00447360`은 100개 registry slot을 순회한다. nonzero slot은
`record = base + slot*0x3a0`으로 `FUN_00410cc0`을 호출한다.

- updater 반환이 nonzero면 registry를 유지한다.
- 반환이 zero면 `FUN_00411180(slot)`이 registry WORD를 0으로 clear한다.
- 레코드 bytes를 다시 zero하는 것은 이 cleanup의 조건이 아니다. 다음 생성이 전체 `0x3a0`을
  zero하므로 stale bytes는 inactive registry 아래 남을 수 있다.
- `FUN_00411190`은 별도로 slot 0..99 전부에 `FUN_00411180`을 호출한다. 이 reset도 registry
  WORD만 clear하며 record bytes와 `+0x9a/+0xa0` reference는 다음 생성까지 stale이다.

`FUN_00410cc0`은 global tick DWORD `0x007c5f80 % 3 == 0`일 때 `WORD +0x16`을 1 증가시킨
뒤 signed `BYTE +0x3c`로 나눈 signed remainder를 다시 `+0x16`에 쓴다. 이 내부 phase의 초
환산은 미확정이다.

tracking은 다음 gate가 모두 성립할 때만 도달한다.

- `WORD +0x114 == 1`
- signed `WORD +0xa6 > 2`
- signed `WORD +0x116 < 15`
- context/target DWORD `+0x9a`의 low WORD index가 live
- active entity reference의 low index와 high generation이 각각 `+0x9a/+0x9c`와 일치

일치하면 `FUN_00438e30`으로 target 좌표를 읽고 `+0x116`을 1 증가시킨 뒤 `+0xa6/+0xa8`을
0으로 reset하고 `FUN_00410ab0`, `FUN_0040f9b0` 순서로 재경로한다. `FUN_0040f9b0`은
`+0xa8` path end를 기록하지만 `+0xa6`은 쓰지 않으므로 tracking 성공 직후 read index는
정확히 0이다. generation이 다르면 좌표를 읽거나 재경로하지 않는다.
공통 updater는 최종 `+0xa6` path index로 `+0x11c/+0x25c` 좌표를 `+0x76/+0x78`에 복사하고,
경로가 끝나지 않은 모든 update에서 subtype별 callback 뒤 `+0xa6`을 1 증가시킨다.
initializer의 promoted 정상 path end는 0..159이며, fixture는 `pathIndex <= pathEnd`와
158→159 상단 non-end 경계를 고정한다. scratch write를 포함한 전체 overflow semantics는
승격하지 않는다. X storage는 `+0x11c..+0x25c`, Y storage는 `+0x25c..+0x39c`의
end-exclusive 160-WORD 범위다.
`FUN_0040fd50`과 `FUN_004107a0`은 공통 위치·표시 field를 갱신한다. 이 문서는 그 렌더 field를
게임 효과로 승격하지 않는다.

## subtype `0x10` 종료 분기

path end에서 subtype 16만 `0x00410e39`의 특수 branch로 들어간다.

1. active entity list `0x007d27d8`, count `0x007d3a98`을 순서대로 돈다.
2. full DWORD reference의 low signed index에 해당하는 registry WORD가 nonzero인지 먼저 검사한다.
3. current record endpoint `+0x82/+0x84`와 candidate 좌표의 Chebyshev distance가 strict `< 5`일
   때만 `FUN_004426f0(source low ref, candidate ref)`을 호출한다.
4. helper는 source `FUN_00441db0`이 false면 즉시 0, candidate 검사가 false여도 즉시 0이며,
   둘 다 live/health-positive일 때만 `FUN_004426a0`의 same-team 결과를 반환한다. 따라서 caller가
   accept하는 helper 0은 다른 team뿐 아니라 source 또는 candidate invalid도 포함한다.
5. helper 0 후보 중 strict하게 더 가까운 것만 교체한다. 같은 거리 tie는 먼저 나온 후보가 유지된다.
   selected local의 full DWORD 초기값은 0이므로 최종 reference가 정확히 0이면 fallback이다.
   low WORD 0이더라도 high generation이 nonzero인 full DWORD는 sentinel을 통과한다.
6. 후보가 없으면 공통 final dispatcher로 간다.
7. 후보가 있으면 각 축을 target 쪽으로 최대 2만큼 이동한 좌표를 만들고 경계 및
   `FUN_00464cc0` geometry admission을 검사한다.
8. geometry가 거부되면 공통 final dispatcher로 간다.
9. 성공하면 fixed-slot admission helper를 다시 호출하지 않는다. current record `WORD +0x24`
   slot을 그대로
   `FUN_004111b0(subtype=1, slot=current)`에 넘겨 같은 `0x3a0`바이트 레코드를 전체 zero·
   재초기화하고 registry value를 1로 다시 쓴다. active-list DWORD EBX 전체를 target/context
   reference로 전달하고 payload low WORD도 전달한다. live/team/distance lookup은 reference의
   low WORD index를 쓰지만 same-slot subtype 1 record는 high generation을 포함한 DWORD를
   보존한다. updater는 common tail에서 1을 반환하므로 같은 registry slot이 subtype 1로 유지된다.

따라서 subtype 16은 원래 action 59 source를 계속 추적하는 branch가 아니다. path 끝에서 현재
active list의 strict-nearest helper-zero 후보를 고르는 별도 분기다. 이를 different-team
후보라고 일반화하지 않는다.

## final effect와 subtype `0x0c` 비교

| 구간 | subtype `0x0c` | subtype `0x10` |
| --- | --- | --- |
| fixed pool·record·path update | 공유 | 공유 |
| path-end 특수 branch | 없음 | registry→distance→helper-zero→strict-nearest 후보 탐색 |
| same-slot subtype 전환 | 없음 | 성공 시 현재 slot을 subtype 1로 전체 재초기화 |
| final dispatcher | `FUN_0040e270` | fallback `FUN_0040ee40`; 전환된 subtype 1은 `FUN_0040eab0` |
| `FUN_00413700` effect kind | 9 | 두 경로 모두 2 |
| updater final return | 0 | fallback 0, same-slot 전환 update는 1 |
| registry clear | final update에 수행 | fallback final update; 전환 성공 때는 value 1로 유지 |

action 59의 kind 2 reached path는 record `BYTE +0x2e == 2`다. 이 mode에서는 loop의 각
candidate가 supplied `DWORD +0x9a` target으로 강제되고 `0x00413a02`의 full-reference 비교가
항상 primary override를 선택하므로 supplied payload 전량을 쓴다. 그 뒤 target owner
`BYTE +0x38`이 source owner `record WORD +0xa4`와 같으면 payload WORD를 signed
`trunc(payload/2)`로 치환한다. generic mode 1의 multi-cell enumeration과 거리 감쇠는 이
action 59 projection에서 도달하지 않으며 미확정 경계로 남긴다.

effect admission과 final consumer의 gate 순서는 구분해야 한다.

- `FUN_00413700`의 `FUN_00441e40` admission은 supplied reference의 low index가 active인지
  검사한다. inactive면 `FUN_00413b30` 전에 끝난다.
- active kind 2에서는 mode 2 primary override와 same-owner half가 먼저 계산된다.
- `FUN_00413b30`은 target `BYTE +0x37 == 95`이면 special callback으로 가며
  `FUN_00413070`/`FUN_00438130`을 호출하지 않는다.
- 그 외에는 `FUN_00413070`의 `0x0041309a-0x004130b7`이 active target의 low/high WORD를
  supplied full reference와 다시 비교한다. generation mismatch면 defense와 kind 9 mode를
  읽지 않고 damage 0을 반환한다. `FUN_00413b30`은 damage 0으로 writer를 호출하며,
  정상 active target health-positive 경계에서는 buffer/health가 보존되고 반환 1 뒤
  `FUN_00439400`으로 간다.

`FUN_00413070`의 kind 2에는 target `DWORD +0x80` payload 보정이 없다. kind 9는 이 DWORD가
4면 30%, 5면 50%를 payload에 더하고 그 외에는 더하지 않는다. 보정 뒤 payload는 CX
signed-WORD로 다시 해석된다. 방어 WORD는 target
`WORD +0x50`과 `WORD +0x44`의 16-bit 합이다. `BYTE +0xba == 1`이면 이 signed 합의
`trunc(defense/2)`를 더한 뒤 signed 90 cap을 적용한다.

`FUN_00438130`의 `WORD +0x90`은 neutral하게 buffer로 부른다. `test ax,ax`에서 zero buffer는
곧바로 health subtraction으로 간다. nonzero buffer는 signed `cmp ax,dx`/`jl`로 비교하며,
signed buffer가 signed damage 이상이면 buffer만 damage만큼 줄이고 1을 반환한다. 그 밖의
nonzero 값은 signed-negative raw WORD를 포함해 buffer를 0으로 만들고, 잔여가 아니라 원 damage
전량을 current health `WORD +0x3e`에서 뺀다. 결과 health가 signed positive면 1, 아니면 0으로
clamp하고 0을 반환한다. 다만 global WORD `0x007c6282 == 1`일 때
target owner `BYTE +0x38`로 선택한 player table gate BYTE가 0이면 buffer/health를 쓰지 않고
1을 반환한다. fixture는 kind 2/9 scaling, same-owner 절반 치환, low-active/class-95/full-generation
분기, writer owner gate, 16-bit defense wrap·signed cap과 두 buffer branch를 재현한다.

`FUN_00413b30`은 writer 반환 0 뒤 `FUN_00442b10`, 반환 1 뒤 `FUN_00439400`을 호출한다.
그 이후 entity death/reference invalidation callback·clear의 whole result는 미재현이다. 이
entity 후속 경계는 fixed effect registry cleanup과 별개다.

kind 2의 complete 주변 target enumeration에 딸린 모든 callback, 상태·bookkeeping은 whole-result로
재현하지 않았다. 따라서 “action 59 전체 효과 재현 완료”라고 부르지 않는다.

## 실패·no-op·남은 경계

- action 59 candidate map admission 실패: 생성 call 없음.
- fixed pool full: 생성 call 없음.
- `FUN_00411190` reset: slot 0..99 registry clear, fixed record bytes/reference 유지.
- `FUN_004111b0`: 내부 failure/rollback 없음.
- subtype 16 target 없음, registry inactive뿐, distance 5 이상, helper-one뿐, full reference 0,
  geometry 실패:
  kind 2 fallback 뒤 updater 0과 registry clear.
- subtype 12 final: kind 9 뒤 updater 0과 registry clear.
- low-index inactive target은 final consumer 전에 끝나며, class 95는 special callback으로
  빠진다. full-generation mismatch는 이 둘과 달리 damage 0으로 writer까지 호출한다.
- signed-negative payload의 최종 피해 산술은 이번 promoted projection 밖이다.

미확정 경계는 `FUN_00464cc0` map byte/table의 사람용 의미, generic mode 1 kind 2 callback 결과,
`FUN_00438e30` 이후 재경로 좌표 결과, `FUN_00442b10`/`FUN_00439400` 이후 death/reference
invalidation, renderer-only field 의미, global tick 초 환산이다. 이 결과로 프로젝트 runtime
또는 public entity architecture를 변경하지 않는다.
