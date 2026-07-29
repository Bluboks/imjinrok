# K01 일본 귀갑차 action-state→16-ring turn-wrapper 도달성

원본 K01 class 14 일본 귀갑차가 entity action `WORD +0x1b0=5` 안에서 어느 local action selector와 분기를 통해 이미 확정된 16-ring turn wrapper `FUN_0043d450` 및 `FUN_004381c0`에 도달하며, 어떤 guard·no-op·return이 그 도달을 막는가?

## 상태와 범위

- 분석 상태: `정적 확정` — 아래에 열거한 action 5의 local selector, 모든 wrapper direct-call site,
  wrapper mask를 범위로 한다.
- 재현 상태: `재현 완료` — reaching, selector/no-op, fallback failure, zero steering, wrapper return,
  special-mask-cleared vector를 독립 replay로 고정했다.
- 구현 상태: `없음` — 이 문서는 원본 정적 분석 전용이며 product/runtime은 변경하지 않았다.

이것은 [accepted-update turn clock](k01-turtle-tank-runtime-clock.md)의 scheduler/cadence 결론을
전제로 하지 않고, 그 문서가 남긴 “어떤 action path가 wrapper로 들어가는가” 경계만 닫는다.
`+0x37`, `+0x88`, helper 반환값에는 원본이 보장하는 역할 이름보다 강한 게임플레이 이름을 붙이지
않는다. 일반 이동·전체 전투·clock port policy도 범위 밖이다.

## 입력 고정과 검증 도구

| 입력 | 값 |
| --- | --- |
| 원본 EXE | `original/imjinrok2/imjinrok2.exe` |
| EXE SHA-256 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| class 14 type record | `0x00884038`, raw flags `0x80143205` |
| canonical artifacts | `functions.json`, `references.json`, `jump-tables.json`, `seeds.json`; 모두 위 EXE source hash 요구 |
| extractor | [`extract-k01-turtle-tank-action-reachability.mjs`](../../../tools/imjinrok/extract-k01-turtle-tank-action-reachability.mjs) |
| focused test | [`k01-turtle-tank-action-reachability.test.mjs`](../../../tools/imjinrok/k01-turtle-tank-action-reachability.test.mjs) |

추출기는 EXE hash, 9개 function body instruction count/SHA-256, 14개 direct-call edge, 11개 raw
byte anchor, `+0x37` mode-table bytes를 함께 확인한다. 따라서 단순 주소 문자열이나 현재 port
동작이 이 결론의 근거가 아니다.

## 함수·데이터 증거

| 항목 | body/data range | 이 질문에서 확인한 역할 |
| --- | --- | --- |
| entity dispatcher `FUN_0043c9c0` | `0x0043c9c0-0x0043d35f`; action switch bytes `0x0043cd88-0x0043cda7`; case-5 bytes `0x0043d153-0x0043d16c` | `WORD +0x1b0=5`만 `FUN_00416c70`에 진입; `FUN_00416c60`의 constant `1` gate도 통과해야 한다. |
| action-5 updater `FUN_00416c70` | `0x00416c70-0x0041737e`; selector switch bytes `0x00416d23-0x00416d39`; table `0x00417380-0x00417393` | `DWORD +0x88` selector `1..5` 중 wrapper가 가능한 case를 정한다. |
| precheck `FUN_00416ad0` | split body `0x00416ad0-0x00416c53`; dispatch bytes `0x00416ad0-0x00416ae9`; mode data `0x00416b68-0x00416b88` | selector 1의 target `WORD +0x1ea`를 wrapper에 넘기는 다섯 call site를 제어한다. |
| movement split | dispatcher `0x00425af0-0x00425b0e`; normal `0x00425b20-0x004262df`; bit-`0x08` `0x004262e0-0x0042662d` | selector 4/5가 flag bit `0x08`에 따라 두 wrapper call site 중 하나를 택한다. |
| wrapper/ring | wrapper `0x0043d450-0x0043d472`; ring `0x004381c0-0x00438300` | wrapper의 `DWORD +0x74 & 0x80000008` guard가 nonzero일 때만 16-ring helper를 부른다. |

모든 direct call은 다음과 같이 source-bound로 확인했다.

```text
0x0043d168: action 5 -> 0x00416c70
0x00416f5f: selector 1 precheck route -> 0x00416ad0
0x004171ef, 0x004172a3: selectors 4,5 -> 0x00425af0
0x00425b01, 0x00425b09: bit 0x08 -> 0x004262e0 / 0x00425b20
0x00416b1c, 0x00416b44, 0x00416bc8, 0x00416beb, 0x00416c48,
0x00425ec9, 0x0042649f: seven sites -> 0x0043d450
0x0043d45e: special wrapper branch -> 0x004381c0
```

## 도달 가능한 action-state 경로

상위 action 값은 `WORD entity+0x1b0`이다. 이 범위에서 wrapper가 가능한 상위 action은 정확히
`5`다. action switch의 다른 destination은 `FUN_00416c70`로 들어가지 않으며, 이 문서는 action 5
밖에서 wrapper로 가는 별도 전역 caller를 주장하지 않는다.

`FUN_00416c70`은 `DWORD +0x88`에서 1을 빼고 unsigned `0..4`만 jump table로 보낸다. 따라서
`+0x88<1` 또는 `+0x88>5`는 `0x00417378` return으로 끝난다.

| local selector `+0x88` | destination | wrapper 결과 |
| ---: | --- | --- |
| 1 | `0x00416d3a` | 조건부 precheck path를 통해 가능 |
| 2 | `0x00417359` | wrapper direct call 없음 |
| 3 | `0x00417333` | wrapper direct call 없음 |
| 4 | `0x004171e3` | movement split을 통해 가능 |
| 5 | `0x0041729c` | movement split을 통해 가능 |

### Selector 1: precheck route

case 1은 target/reference helper가 통과한 뒤 `0x00416ee8-0x00416f5f`로 들어갈 수 있다. 이 block은
target `WORD +0x1ea`를 쓴 후 `FUN_00416ad0`을 호출한다. 그 helper는 `BYTE +0x37`을 읽어
`5..37` 범위를 33-byte table로 dispatch한다. 테이블의 비-default mapping은 정확히 다음 네 개다.

| `+0x37` | table mode | destination | wrapper |
| ---: | ---: | --- | --- |
| 5 | 0 | `0x00416b90` | 없음 |
| 15 | 1 | `0x00416be0` | `0x00416beb` |
| 24 | 2 | `0x00416c40` | `0x00416c48` |
| 37 | 3 | `0x00416bc0` | `0x00416bc8` |
| 그 밖의 `5..37`, 또는 range 밖 | 4/default | `0x00416b00` | 아래 fallback guard가 통과할 때만 |

fallback은 `DWORD +0x74`의 high bit를 먼저 검사한다.

- high bit set: `BYTE +0xe8==0`이면 `0x00416b1c`가 wrapper를 호출한다. `+0xe8!=0`이면
  `WORD +0x11a == WORD +0x1ea`일 때 return 1로 끝나고, 다르면 `FUN_00438310` 호출 뒤 return 0으로
  끝난다. 두 경우 모두 wrapper는 호출하지 않는다.
- high bit clear: flag bit `0x02` set이면 return 1로 끝난다. clear일 때만 `0x00416b44`가 wrapper를
  호출한다.

creation-default class 14 flags는 `0x80143205`이므로 high-bit branch다. 즉 default record에서
fallback ring 도달의 추가 guard는 `+0xe8==0`이다. 이는 이후 runtime `+0x74` mutation까지 없다는
주장이 아니다.

### Selectors 4와 5: movement split route

selector 4의 `0x004171ef`와 selector 5의 `0x004172a3`은 모두 인수 `2`와 각각 `WORD +0x126` 또는
zero를 넣어 `FUN_00425af0`을 호출한다. shared splitter는 `BYTE +0x74 & 0x08`로 variant를 고른다.

| variant | wrapper site | reaching guard | no-op/failure exit |
| --- | --- | --- | --- |
| bit `0x08` clear, `FUN_00425b20` | `0x00425ec9` | flag bit `+0x74&1` set, `FUN_00426680` nonzero, and the computed steering register `EDI != 0` | flag bit clear는 return 1; readiness helper zero는 `FUN_004266d0` 뒤 return 0; `EDI==0`은 wrapper를 건너뜀 |
| bit `0x08` set, `FUN_004262e0` | `0x0042649f` | same flag-bit/readiness gates; target calculation 뒤 wrapper call | flag bit clear는 return 1; readiness helper zero는 `FUN_004266d0` 뒤 return 0. 이 variant의 call site 자체에는 `EDI!=0` guard가 없다. |

두 variant 모두 wrapper 반환 `EAX==0`이면 해당 routine의 후속 성공/이동 처리 전에 return path를 탄다.
이는 ring helper의 unequal-target/cadence path를 “wrapper를 호출하지 못함”으로 재분류하지 않는다.
wrapper call은 이미 발생했으며, `FUN_004381c0`의 equality/no-step/step 결과는 기존 runtime-clock
문서의 별도 field cadence 계약이다.

## 16-ring 선택과 한계

`FUN_0043d450`의 bytes `0x0043d450-0x0043d466`은 `DWORD +0x74 & 0x80000008`을 검사한다.

- nonzero: target argument를 `FUN_004381c0`에 전달한다. class 14 creation-default
  `0x80143205 & 0x80000008 = 0x80000000`이므로 위 seven wrapper sites를 실제로 통과한 default
  class-14 record는 16-ring helper로 간다.
- zero: `FUN_004381a0` normal-direction branch다. wrapper에는 도달했지만 16-ring cadence에는
  도달하지 않는다.

따라서 **accepted update나 action 5 자체는 ring invocation의 충분조건이 아니다.** 해당 selector의
reaching guard와 wrapper special mask가 모두 필요하다. 반대로 selector 2/3, invalid selector,
precheck fallback failure, normal movement zero steering은 wrapper call count 0이다.

## 재현 vector

focused test는 source-bound extractor report 외에 아래 synthetic input/output을 고정한다.

| vector | 관찰값 |
| --- | --- |
| action `4` | action-5 boundary에서 wrapper 0회 |
| selector 1, `+0x37=15` | dedicated precheck call 1회, default flags에서 ring 1회 |
| selector 1 fallback, `+0xe8=1`, target mismatch | wrapper 0회, fallback failure return |
| selector 4 normal variant, steering `0` | wrapper 0회 |
| selector 4 bit-`0x08` variant | wrapper/ring 1회, return-0 continuation 경계 |
| selector 5 normal variant | wrapper/ring 1회, return-1 continuation 경계 |
| selector 2 | wrapper 0회 |
| selector 5 with special mask clear | wrapper 1회, ring 0회 (`FUN_004381a0`) |

테스트는 `FUN_00416ad0` body hash와 selector-5 shared movement call edge 변조도 거부한다. 실행:

```bash
node --test tools/imjinrok/k01-turtle-tank-action-reachability.test.mjs
node tools/imjinrok/extract-k01-turtle-tank-action-reachability.mjs
pnpm imjinrok:verify-static-analysis
```

## 미확정 경계와 이식

`+0x37`, `+0x88`, `+0xe8`, `+0x11a` 및 helper return의 사람용 gameplay 의미와 그 값을 쓰는 모든
producer는 이 작은 reachability 단위에서 확정하지 않았다. 또한 runtime `+0x74`의 creation 이후
writer/alias를 닫지 않았으므로 “모든 살아 있는 class 14는 항상 special mask”라고 주장할 수 없다.
이 문서는 원본-based product mechanic을 추가하지 않으며, 그 gate는 별도 구현 범위에서 다시 평가해야
한다.
