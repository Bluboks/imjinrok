# K01 봉화대 완성·K0120 native trigger

분석 질문: For K01, what exact gates cause FUN_0048a5c0 to scan entity slots for a completed beacon, when is WORD 0x008438dc written, how do script busy/load/start and same-scan multiple matches behave, what direct native post-trigger effects run and in what order, and when does the post-trigger script-state gate return 1?

## 범위와 상태

- 분석 상태: `정적 확정` — 아래에 한정한 `FUN_0048a5c0` 봉화대 scan·K0120·native effect·
  post-state 반환 경로와 직접 피호출자의 raw 계약
- 재현 상태: `재현 완료` — blocker, scan의 세 active gate, flag, busy, loader `0/1`·void start, 같은 scan의 복수 match,
  descriptor 생성 실패·좌표 경계, selector 5, post-state 정상·경계·실패
- 구현 상태: `없음` — 원본 클래스와 현재 scenario identity가 정확히 일치하지 않아 integration gate를
  통과하지 못했다.

승리 timer/result와 영웅 손실의 사람용 해석은 이 질문 밖이다. 이 문서가 확정하는 마지막 반환
관계는 `0x0048de12`가 `FUN_0048a5c0`을 호출한 뒤 `AX`를 바꾸지 않고 caller로 돌려준다는
것까지다.

## 원본 입력

| 입력 | SHA-256 | 크기·형식 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 843,833 bytes, PE32 x86 |
| `original/imjinrok2/script/K0120` | `6d9b8043f4634c8b8f1696e6d9b49b17dff99b53280b9934c1dfbd998be6054d` | 519 bytes, CP949/EUC-KR |

독립 추출기는
[`extract-k01-beacon-k0120-trigger.mjs`](../../../tools/imjinrok/extract-k01-beacon-k0120-trigger.mjs),
재현 테스트는
[`k01-beacon-k0120-trigger.test.mjs`](../../../tools/imjinrok/k01-beacon-k0120-trigger.test.mjs)다.
EXE와 K0120 해시, canonical JSON의 source hash, 함수 instruction hash, call edge, 원본 byte
anchor, selector jump table과 data table을 모두 검사하며 stale·tampered 입력은 오류로 중단한다.

## 함수와 raw 주소

| 주소·범위 | CFG / 명령어 | instruction SHA-256 | 이 질문에서 확정한 raw 역할 |
| --- | ---: | --- | --- |
| `0x0048ddb0-0x0048deca` | 36 / 105 | `276da99513996baa45d73bd4c09da0fe231fb10e65b762b4bbf3bfb144908981` | mission dispatcher caller; 직접 반환 전달 |
| `0x0048a5c0-0x0048a878` | 32 / 181 | `c2a0e73fb0e208846f77187fa11310cdd4177f62c6fbd61732d822f513115791` | K01 scan, match block, post-state 반환 |
| `0x00487fa0-0x0048800f` | 7 / 37 | `319555c1ab68da1f8fd1474869386b56cc58318d61e1a55908f18d143c526094` | scan 전 raw-relation blocker |
| `0x00488420-0x004884b5` | 11 / 59 | `4b4841d6b3756b3d2dd3f3c6621ab98a413ce4608ea3d5c9c737ee1618c3ee8b` | signed-WORD descriptor 생성 |
| `0x00442ca0-0x00442d95` | 25 / 82 | `e3edb412a4a3ab9bb72fb4285c9e07ab0417de52bb692e047548457b02fa1f67` | selector별 raw byte-grid 변경 |
| `0x004648d0-0x004648d9` | 1 / 3 | `b0efc5dec9ace61129d9d0aa242cac65ece9db87c517be3c8e6e04b9df9adfba` | stack BYTE를 `ECX+2`에 기록 |
| `0x00461570-0x00461590` | 1 / 6 | `09b777daad87f401fcf60713c43b1ac9664759682315407c27a84211e3cef3b9` | raw enable·좌표 DWORD 세 개 기록 |
| `0x00482390-0x00482393` | 1 / 2 | `0f019498e796041d4448ab24729aef7f664c3ce9d648fa54ddbe4eefc6a502ab` | script context `+8` 반환 |
| `0x004823a0-0x004823a3` | 1 / 2 | `89917ca0f56c10aa67814cd5318e7dc1c9f1dd3e7b94e915eda062024850563e` | script context `+4` 반환 |
| `0x00482180-0x004822f4` | 16 / 114 | `acf831ee8a608862cb7c64595f3a90b7799a967b1c9b7b38b0da9fe6e1b20f8c` | `0/1`을 반환하는 script loader; caller는 EAX를 검사하지 않음 |
| `0x00482340-0x0048238c` | 4 / 22 | `0f33a0727962c95b37e0fc232b1b921a85fe450b61dc295f73e316bc9cbdc35d` | void script start |
| `0x00441db0-0x00441dd8` | 3 / 12 | `12984df20c7bb82eb364b29180f75185fe17ac268bffb3d3c782a7fa6c5adf8e` | low-WORD slot table nonzero·record positive-WORD 검사 |
| `0x00441e40-0x00441e7a` | 5 / 19 | `01b3c1652d8edf30a6c0dc948215f734475111fc734338603d847545c43e7cda` | scan index active lookup |
| `0x004426a0-0x004426e1` | 1 / 23 | `992c88ef4558ec0ce71340db71f7aa5dea19be134eeae9d64c62cd40e16e1ac1` | 두 raw relation-table byte equality 반환 |
| `0x00483a60-0x00483a9c` | 7 / 25 | `887217ddc12a9bc4dd90c38b9365be9bcaf65f14e1d0c709de86c62479cbd917` | descriptor별 inactive slot 선택 |
| `0x00483c50-0x00483c9f` | 1 / 26 | `d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e` | accepted descriptor record create wrapper |

관련 direct call edge 15개를 seed 명령어와 `functions.json`에서 함께 검증한다. 핵심 match
순서는 `0x0048a781 → 0x004823a0`, 조건부 `0x0048a794 → 0x00482180`,
`0x0048a79e → 0x00482340`, 이어서 `0x0048a7ae → 0x00488420`,
`0x0048a7b9 → 0x00442ca0`, `0x0048a7c7 → 0x004648d0`,
`0x0048a7d5 → 0x00461570`이다.

## scan 진입 gate

`0x0048a724` 이후의 순서는 다음과 같다.

1. `0x00487fa0`을 호출한다. 반환이 nonzero이면 `0x0048a7f2`로 가 scan을 건너뛴다.
2. blocker가 0일 때 `WORD [0x008438dc]`를 0과 비교한다. nonzero면 역시 scan을 건너뛴다.
3. 둘 다 0일 때만 index `0`, runtime field pointer `0x0063528f`, 반복 수 `0x4b0`으로
   시작한다. 각 반복은 index를 1, pointer를 `0x558` 증가시킨다.

`0x00487fa0`은 signed `WORD [0x00843738]` active count와
`WORD [0x00842dd8 + index*2]` list entry를 사용한다. 각 positive entry는
`0x00441db0`의 slot-table nonzero·signed `WORD record+0x3e > 0` 검사를 통과해야 한다. 이어 record
`+0x74`에 `0x00020002` 중 하나가 설정된 경우에만 signed `BYTE +0x38`과 signed current-player
`WORD 0x00bccc44`를 `0x004426a0`에 전달한다. 이 함수가 읽은 두 raw relation-table byte가
다르면 blocker가 첫 항목에서 1을 반환한다. 관계값의 사람용 의미는 확정하지 않았으므로
`적`, `동맹` 같은 이름을 붙이지 않는다.

## completed record 검사와 flag write

scan의 index마다 `0x00441e40(index)`이 0이면 건너뛴다. 이 lookup은 slot-table WORD
nonzero, signed `WORD record+0x3e > 0`, `BYTE record+0x1f0 != 0`을 순서대로 요구한다.
nonzero일 때 runtime entity base `0x00635258 + index*0x558`에서 다음을 모두 요구한다.

| 필드 | x86 폭 | 조건 |
| --- | --- | --- |
| `+0x38` | signed byte, `MOVSX AX` | `WORD 0x00bccc44`와 같음 |
| `+0x37` | byte | `0x34`(class 52) |
| `+0x8c` | byte | `0x64` |

따라서 `+0x38`은 이 경로에서 owner/relation index raw 입력이다. 같은 오프셋을 subtype
`0x0c` health-application table 선택에도 사용하지만, 두 소비 경로의 사람용 의미를 하나로
일반화하지 않는다.

match이면 `0x0048a77a`가 가장 먼저 `WORD [0x008438dc] = 1`을 쓴다. canonical direct
reference는 `0x0048a731` read, `0x0048a77a` write, `0x0048a7f2` read 세 개뿐이다. reset
producer는 이 범위에서 발견되지 않았으므로 reset lifecycle을 주장하지 않는다.

## script busy, loader 반환과 void start

flag를 쓴 뒤 `ECX=0x00bcbe08`로 `0x004823a0`을 호출한다. 이 accessor는
`DWORD [ECX+4]`를 그대로 반환한다.

- nonzero: load와 start만 건너뛴다.
- zero: `script\k0120`을 `0x00482180`에 전달한다. loader의 실제 반환 계약은 `0/1`이며
  caller는 EAX를 검사하지 않고 두 값 모두에서 void `0x00482340`을 호출한다.
- busy 여부와 loader 반환값은 뒤의 native effect 실행을 막지 않는다. void start에는
  성공·실패 반환값이 없다.

K0120 자체에는 다음 `SPEECH` 세 개만 이 순서로 있다.

1. `K1`, slot `0`, `K01120`
2. `K3`, slot `1`, `K01130`
3. `K1`, slot `0`, `K01140`

spawn command는 없다. 아래 증원 생성은 script가 아니라 native match block에 있다.

## direct native post-effect 순서

각 match는 다음 direct call을 항상 순서대로 실행한다.

1. `0x00488420(55, 53, 0x10, descriptor array)`
2. `0x00442ca0(55, 53, 5)`
3. `ECX=0x00abfff0; 0x004648d0(1)`
4. `ECX=0x007c5ed8; 0x00461570(55, 53)`

마지막 두 호출의 직접 결과는 각각 `BYTE 0x00abfff2=1`과
`DWORD 0x00843674=1`, `DWORD 0x00843678=55`, `DWORD 0x0084367c=53`이다.
이 전역과 두 grid의 사람용 의미는 consumer가 완결되지 않았으므로 raw state로 둔다.

### signed-WORD descriptor helper

배열은 다음 아홉 record 뒤 class `0` terminator다.

```text
(13,1,-2,-2) (82,1,0,-2) (13,1,2,-2)
(14,1,-2, 0) (14,1,0, 0) (14,1,2, 0)
(12,1,-2, 2) (12,1,0, 2) (12,1,2, 2)
class 0
```

필드는 class, owner, dx, dy signed WORD다. class마다 먼저 `0x00483a60`으로 slot을 얻는다.
반환 slot 계약은 실패 `0` 또는 성공 `1..1199`다. slot `0`이면 즉시 0을 반환하며 앞서
생성한 record는 되돌리지 않는다. 성공 slot 뒤
low-WORD absolute `(originX+dx, originY+dy)`가 signed 음수이거나 map width/height 이상이면
그 descriptor만 건너뛰고 계속한다. 허용되면
`0x00483c50(type, slot, x, y, raw 0x10, 100, owner)`를 호출한다. terminator까지 가면 1을
반환한다. K01 caller는 이 반환값도 검사하지 않는다.

타입 카탈로그의 class 정체는 12 일본 조총병, 13 일본 사무라이, 14 일본 귀갑차,
52 조선 봉화대, 82 일본 고니시다.

### selector 5 raw pattern

canonical jump table은 selector 5를 `0x00442cc7`로 보내며, 여기서 DWORD table
`0x004bbe54`를 고른다. table의 중심 행 값은 5, 행 `-5..5`의 반폭은 다음과 같다.

```text
row offset: -5 -4 -3 -2 -1  0  1  2  3  4  5
half width:  1  2  3  4  4  4  4  4  3  2  1
```

각 행은 중심 X±반폭을 포함한다. signed low-WORD X/Y가 음수이거나 map DWORD width/height
이상이면 셀을 건너뛴다. 첫 raw grid byte가 nonzero일 때만 이를 0으로 쓴 다음 같은 index의
두 번째 raw grid byte를 1로 쓴다. table은 DWORD 100에서 끝난다.

## 같은 scan의 복수 match와 후속 return gate

match block 끝은 break하지 않는다. `0x0048a7da`에서 index 증가, pointer `+0x558`, count
감소 후 남았으면 `0x0048a74f`로 돌아간다. 따라서 처음 scan을 시작한 뒤 qualifying record가
여러 개면 각각 flag write, busy/load/start 판단과 네 native effect를 전부 반복한다. flag는
다음 `FUN_0048a5c0` 호출의 scan은 막지만 이미 진행 중인 loop를 중단하지 않는다.

scan 또는 skip 뒤 `0x0048a7f2`는 flag를 1과 정확히 비교한다.

- flag가 정확히 1이면 `0x00482390`이 반환한 `DWORD [script context+8]`을 검사한다.
- 그 값이 0일 때만 `AX=1`로 즉시 반환한다.
- 값이 nonzero이면 이 early return을 타지 않는다.
- flag가 1이 아닌 nonzero 값은 scan을 막지만 이 early return도 타지 않는다.

따라서 post-state accessor는 모든 경로의 입력이 아니다. scan 뒤 최종 flag가 정확히 1인
경우에만, 모든 match의 native block이 끝난 다음 한 번 읽는다. flag `0`, `2`, `0xffff`에서는
그 값을 읽지 않는다.

`0x0048de12`의 caller는 호출 직후 `POP ESI; RET`하므로 이 반환을 그대로 상위 caller에
전달한다. 그 뒤 승리 결과의 의미와 시간은 이 단위에서 해석하지 않는다.

## 재현 벡터

- blocker: signed active count `0/1`, inactive slot, non-positive record, `+0x74` mask
  없음/있음, raw relation byte 같음/다름
- scan: slot-table WORD `0/1`, signed health `-1/0/1`, active BYTE `0/1`을 각각 독립
  gate로 재현하고, signed owner `-1` 일치·불일치, class `52/51`, progress `100/99`,
  마지막 index `1199`
- flag: initial `0`, exact `1`, other nonzero `2/0xffff`
- script: busy이면 load/start 모두 생략; idle이면 loader `0/1` 모두 void start와 native
  effect 실행
- 복수 match: 같은 scan에서 match block 두 번과 순서 고정
- descriptor: 정상 9개, 세 번째 slot `0` exhaustion 시 앞선 두 생성 유지, slot `-1/1200`
  입력 거부, 음수·상한 좌표 skip
- selector 5: 총 75개 unclipped 셀, 첫/중심/마지막 행 span, source zero, map clipping
- post-state: final flag exact 1일 때만 accessor 호출; context `+8 == 0`만 return 1
- stale/tampered: EXE, K0120, source hash, call edge, selector jump-table 변경 거부

## 현재 프로젝트와 integration gate

현재 `scenarios.ts`는 class 13을 `japanese-swordsman`, class 82를 `japanese-gunner`,
class 14와 12를 `japanese-swordsman`으로 대신한다. 이는 각각 원본 일본 사무라이·고니시·
귀갑차·조총병 identity의 exact mapping이 아니다. 원본 slot/reference·owner/relation·map
coordinate와 프로젝트 identity/grid의 exact mapping도 이 질문에서 증명하지 않았다. 따라서
generic superset architecture를 바꾸거나 기존 K01 runtime에 추정 adapter를 넣지 않았다.
향후 이 규칙은 모든 mapping이 정적 확정·재현된 뒤에만 isolated opt-in original-K01 policy로
연결할 수 있다.

## 남은 불확실성과 다음 질문

- `WORD 0x008438dc`의 reset producer와 lifecycle
- raw relation-table 값, selector 5 grids, 세 direct global write의 사람용 의미
- class 12·13·14·82의 프로젝트 identity/visual/behavior exact mapping
- result timer의 진입·reset과 final result call 이후 상태 전환

이 문서의 return 뒤 K01 loss latch, fixed-width timer와 final commit은
[K01 미션 결과 수명주기](k01-mission-result-lifecycle.md)에서 별도 정적 확정·재현했다.
그 다음 좁은 질문은 timer 진입·reset과 final result call 이후 상태 전환이다.
