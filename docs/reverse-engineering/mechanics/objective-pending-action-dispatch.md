“목표 컨트롤 릴리스가 생산하는 pending action 0x3f0을 어떤 원본 dispatcher가 어떤 우선순위와 조건으로 소비하며, 그 결과를 K01에서 원본 전역 상태에 결합하지 않는 확장 가능한 UI-domain 계약으로 어떻게 표현할 수 있는가?”

기준일: 2026-07-26

## 판정

- 분석 상태: 아래 함수·참조·상태 전이·실패 경로에 한정해 `정적 확정`
- 재현 상태: ordered producer와 `0x3f0 → 0x3f1 → 1000 → 0x3e9` 목표 모달 생명주기,
  scoped surface/resource 실패는 `재현 완료`
- 구현 상태: 숫자 원본 상태를 노출하지 않는 `UI-domain 계약과 테스트만 구현`, 장면·simulation·
  shared scenario 연결 없음

`FUN_00449090`이 소비 dispatcher다. `FUN_004495e0`은 dispatcher가 읽기 전 같은 frame에서
목표 컨트롤과 뒤의 세 컨트롤을 독립적으로 평가한다. 성공한 마지막 컨트롤이 최종 WORD 반환을
결정하고, 소유자는 그 nonzero 반환 하나만 `DAT_00552998`에 쓴다. 따라서 우선순위는 switch case
사이의 경쟁이 아니라 producer의 정확한 평가 순서
`0x3f0 → 0x3ee → 0x3ec → 0x3ea`에서 결정된다.

최종 `0x3f0`이 남으면 다음 owner frame의 switch는 그 case 하나만 선택하고
`FUN_004a5730`을 호출한 뒤 `DAT_00552998=0x3f1`을 무조건 쓴다. 이 소비 경로가 `0x3f0`의
닫힌 의미를 **공통 임무 목표 모달 열기**로 확정한다. `0x3ee`, `0x3ec`, `0x3ea`의 UI 의미는
이번 질문에서 이름 붙이지 않는다.

분석에는 원본 EXE·SPR와 생성된 정적 산출물만 사용했다. VM, runtime probe, 현재 웹 UI,
meaning 문자열, 화면 유사도와 `docs/archive/**`는 근거로 사용하지 않았다.

## 고정 입력과 provenance

| 입력 | SHA-256 | 확인 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | 함수·CFG·jump table·직접 참조·상태 전이·실패 경로 |
| `original/imjinrok2/yfnt/objectiveborder.spr` | `62552fecc34139e6729b84d4e15dcbe6ea3622eb76b7f443af29fa5322813ea5` | 416×236, 1 frame 목표 모달 자원 |

새 seed는 필요하지 않았다. 현재 `seeds.json`에 포함된 관련 함수가 전체 경계를 제공하므로 기준선은
seed 113개, 포함 함수 111개로 유지된다. 추출기는 관련 seed 함수 11개의 body 범위·CFG·명령어
수·전체 byte SHA-256을 다시 검사한다. seed가 아닌 `FUN_00448ff0`·`FUN_00449030`,
owner jump table `0x00449264-0x004492c0`, 작은 wrapper
`0x0045efd0-0x0045efe8`, resource cleanup `0x00449900-0x00449915`는 원시 범위 전체
해시로 고정했다.

`DAT_00552998`의 structured direct reference는 14개이며 순서가 포함된 digest는
`03f85a3c6b1e963d57c400a9c66f6e89eeb30f9d303c9681ad665f6fa2ace5ef`다.
`FUN_00449090`을 향하는 complete structured direct-call set은 2개이며 canonical projection
`{from,type,fromFunctionEntry}`의 digest는
`eb7ec417de72ada68bc72a20857c3b25ad706768d563365748670be71ba09509`다.

| 주소 | 종류 | 포함 함수 | 역할 |
| ---: | --- | --- | --- |
| `0x0044900e` | WRITE | `FUN_00448ff0` | common UI root `0x3e8` 초기화 |
| `0x00449044` | WRITE | `FUN_00449030` | 별도 초기값 `0x3ed` |
| `0x004490b8` | READ | `FUN_00449090` | signed WORD switch 입력 |
| `0x004490d9` | WRITE | `FUN_00449090` | `0x3e8 → 0x3e9` |
| `0x00449105` | WRITE | `FUN_00449090` | `FUN_004495e0` nonzero 반환 기록 |
| `0x00449116` | WRITE | `FUN_00449090` | `0x3ea → 0x3eb` |
| `0x00449143` | WRITE | `FUN_00449090` | 첫 별도 update 반환 기록 |
| `0x00449160` | WRITE | `FUN_00449090` | `0x3ec → 0x3ed` |
| `0x00449188` | WRITE | `FUN_00449090` | 둘째 별도 update 반환 기록 |
| `0x0044919a` | WRITE | `FUN_00449090` | `0x3ee → 0x3ef` |
| `0x004491af` | WRITE | `FUN_00449090` | 셋째 별도 update 반환 기록 |
| `0x004491c1` | WRITE | `FUN_00449090` | `0x3f0 → 0x3f1` |
| `0x004491e0` | WRITE | `FUN_00449090` | 모달 종료 시 `0x3e8` |
| `0x0044921f` | READ | `FUN_00449090` | owner 결과값 계산 |

이는 complete structured direct-reference 집합이다. structured export 밖의 간접 메모리 쓰기가 전혀
없다고 일반화하지 않는다.

## 완전 함수와 호출 경계

| 함수와 전체 범위 | CFG / 명령어 | 이 질문에서 확인한 역할 |
| --- | ---: | --- |
| `FUN_00449090`, `0x00449090-0x00449260` | 26 / 118 | signed owner-state dispatcher, 목표 모달 소비·reset·공통 post path |
| `FUN_004495e0`, `0x004495e0-0x004498f3` | 31 / 228 | 독립 컨트롤 평가와 마지막 활성 반환 우선순위 |
| `FUN_00449320`, `0x00449320-0x004495dd` | 13 / 184 | common UI 자원·컨트롤 초기화 |
| `FUN_0045f9c0`, `0x0045f9c0-0x004607ac` | 209 / 801 | application state `0x17`에서 owner 호출 |
| `FUN_004a5730`, `0x004a5730-0x004a5977` | 13 / 157 | 목표 모달 초기화; SPR 실패 보고 뒤 계속 |
| `FUN_004a5980`, `0x004a5980-0x004a5ab3` | 6 / 87 | 목표 모달 update, dismiss 조기 반환, surface 실패 |
| `FUN_004a5ac0`, `0x004a5ac0-0x004a5ada` | 3 / 7 | 존재하는 목표 SPR 해제 뒤 무조건 clear tail-call |
| `FUN_004a5ae0`, `0x004a5ae0-0x004a5b29` | 3 / 18 | clear lock 시도와 성공 시 clear·unlock |
| `FUN_004434a0`, `0x004434a0-0x0044357e` | 7 / 77 | SPR loader와 상세 실패 반환 |
| `FUN_0044abb0`, `0x0044abb0-0x0044ad93` | 28 / 159 | producer·modal·clear surface lock |
| `FUN_004492d0`, `0x004492d0-0x004492ec` | 3 / 8 | 외부 one-shot dismiss 소비 |

`references.json`에서 `FUN_00449090`을 향하는 complete structured direct-call set은 다음
두 `UNCONDITIONAL_CALL`뿐이다.

- `0x0045efd1`: 완전한 24바이트 wrapper `FUN_0045efd0`; 반환이 3이면
  `FUN_0045eff0`을 추가 호출하고 같은 WORD를 그대로 반환
- `0x004602e9`: `FUN_0045f9c0`의 application state `0x17`

K01 진입은 앞선 분석에서 확정한 `0x004602e9` caller를 사용한다. `0x0045efd1` wrapper가
존재한다는 사실을 K01 경로로 오인하지 않는다. `FUN_004a5ac0`은 전역 UI 정리
`FUN_004a5070`에서도 호출되지만, 이는
pending `0x3f0` 소비자가 아니라 별도 cleanup caller다.

## producer 순서와 owner write

정상 common UI 분기의 관련 흐름은 다음과 같다.

```text
pending = 0

if update(0x005527b0) == 1: pending = 0x3f0
if update(0x005528f8) == 1: pending = 0x3ee
if update(0x00552ae0) == 1: pending = 0x3ec
if update(0x00552850) == 1: pending = 0x3ea

attempt common-UI surface lock and draw
return low WORD pending

FUN_00449090:
  if return != 0:
    FUN_00449900()  // release common UI resource only if present
    DAT_00552998 = return
```

입력 update는 `0x004496a5-0x00449726`, surface lock은 `0x00449784` 이후다. 따라서 common
UI surface lock 실패는 이미 선택된 반환을 취소하지 않는다. common UI resource 포인터가 null이면
`FUN_00449900`은 해제를 건너뛰지만 owner write는 그대로 실행한다.

`FUN_004495e0`의 alternate overlay 분기는 `0x004495eb`에서 먼저 갈라져 정상 컨트롤들을
평가하지 않는 조기 반환 경로다. 그 경로는 `0x3f0`을 만들지 않는다. 이번 재현 모델은 기존
application-state 분석과 같은 정상 common UI 분기를 시작점으로 하며, alternate overlay의 별도
return 의미는 정적-only 범위로 남긴다.

## dispatcher 소비와 상태 전이

`0x004490b8`은 `DAT_00552998`를 sign-extend하고 `0x3e8`을 뺀 뒤 0..9만 jump table로
보낸다. 한 frame에는 현재 값의 case 하나만 실행된다.

```text
if DAT_00634c90 == 0:
  return 0                         // pending WORD를 읽지 않음

case 0x3f0:
  FUN_004a5730()
  pending = 0x3f1

case 0x3f1:
  result = low WORD FUN_004a5980(presentation_surface)
  if result != 0:
    pending = 1000
    FUN_004a5ac0()

case 1000:
  FUN_00449320()
  pending = 0x3e9

owner-enabled common post path:
  draw shared UI
  present shared UI
  normalize previous primary button
```

따라서 dismiss 후 `1000`은 “비움”이 아니라 common UI root pending 값이다. 다음 owner frame에
common UI를 초기화하고 `0x3e9`로 전진한다.

### 실패·조기 반환

- owner enable DWORD `DAT_00634c90`이 0이면 pending을 읽거나 소비하지 않고 그대로 둔다.
- `FUN_004a5730`의 SPR loader 실패는 오류를 보고한 뒤 닫기 컨트롤·내용 초기화를 계속한다.
  함수가 `void`이므로 dispatcher에는 실패 신호가 없고 `0x3f1` 전이는 그대로 일어난다.
- active 모달에서 pointer release나 external one-shot dismiss가 먼저 확인되면 presentation
  surface lock 전에 `1`을 반환한다.
- display surface lock 실패는 frame·닫기 control draw만 건너뛴다. content present와 이전
  버튼 정규화는 계속되고 owner state는 `0x3f1`이다.
- dismiss 결과를 받으면 owner가 먼저 `1000`을 쓴다. `FUN_004a5ac0`은 SPR 포인터가 null이면
  release만 건너뛰고 반드시 clear lock을 시도한다. clear lock 실패는 clear·unlock만 생략하며
  상태 전이를 되돌리지 않는다.

SPR 런타임 실패 벡터는 이 확인된 제어 흐름만 재현한다. 변조 SPR을 추출기가 거부하는 provenance
테스트와 원본 runtime loader 실패는 서로 다른 검사다.

## 독립 재현 벡터

`analysis/fixtures/objective-pending-action-dispatch-vectors.json`은 EXE·SPR 해시와 structured
reference digest를 고정한다.

producer 벡터는 다음을 전체 결과로 비교한다.

- 무반응, 정상 `0x3f0`
- common UI surface lock 실패와 resource null이어도 유지되는 `0x3f0`
- `0x3ee`, `0x3ec`, `0x3ea`의 순차 overwrite와 마지막 활성 우선순위
- 최종 nonzero일 때만 resource release 시도 뒤 owner write

dispatcher 벡터는 다음을 전체 결과로 비교한다.

- owner disabled 보존과 signed WORD 최소·최대 unmatched 경계
- 정상 `0x3f0` 소비와 `open-objective-modal`
- objective SPR load 실패 후에도 `0x3f1`
- active display 정상·surface lock 실패
- loaded resource 정상 cleanup
- resource null과 clear lock 실패에도 clear 시도·`1000` reset
- 다음 frame `1000 → 0x3e9`
- 경쟁 `0x3ec`가 objective action을 생산하지 않는 분기

`tools/imjinrok/objective-pending-action-dispatch.test.mjs`는 모든 vector를 조건 없이
`deepEqual`하고, 변조 EXE·SPR와 stale seed/reference를 상세 오류로 거부한다. pending-state
참조를 그대로 둔 채 dispatcher caller만 누락·추가·type 변조한 세 입력도 각각 count 또는
canonical digest 불일치로 거부한다.

## UI-domain 계약

정적으로 닫힌 의미 하나만 public semantic action으로 승격했다.

```text
{ type: "open-objective-modal", metadata: { profile: "original-parity" } }
```

`apps/game-client/src/ui/objectiveModalActions.ts`는 원본 전역 주소나 숫자 state를 노출하지 않는다.
다음 세 요소만 제공한다.

- generic `UiDomainAction<Type, Metadata>`
- `open-objective-modal` action factory
- immutable pending action 배열의 append·첫 action consume

generic type과 metadata object 덕분에 원본 parity profile은 확정 action을 생산·소비할 수 있고,
K01 확장 UI는 같은 channel union에 별도 action type과 typed metadata를 추가할 수 있다. 클라이언트
테스트는 dispatcher fixture의 `consumedActions`를 직접 읽어 원본 `0x3f0` 숫자 없이 같은 관찰
결과를 검사하고, K01 확장 action과의 typed superset도 검사한다.

원본 mechanism source에는 연결하지 않았다. 후속
[프로젝트 UI 이벤트 경계 분석](objective-modal-ui-event-boundary.md)은 K01 HUD objective button을
명시적인 staged 프로젝트 적응 trigger로 사용해 같은 semantic action을 `UIScene` private active
request까지 전달한다. 이는 원본 application state `0x17`, control release 또는 뒤 컨트롤
overwrite 결과를 복제한 것이 아니며 숫자 전역을 흉내 낸 fallback adapter도 아니다. 사용자에게
보이는 presentation은 후속
[presenter lifecycle](objective-modal-presenter-lifecycle.md)에서 검증된 raster·기하·K0110 text·
strict release만 원본 기반으로 연결하고 나머지 web lifecycle을 의도적 적응으로 분리했다.

## simulation/mechanism handoff

향후 실제 연결에는 simulation 또는 gameplay mechanism 소유자가 다음 semantic shape를 한 번
발행해야 한다.

```text
type: "open-objective-modal"
metadata:
  profile: "original-parity"
  objectiveId: stable project-owned K01 objective identifier
  trigger: objective control release after competing-action resolution
```

발행 시점은 같은 input frame의 모든 후속 state-producing control을 평가해 objective action이
최종 winner임이 확정된 뒤, UI가 다음 frame을 그리기 전이다. simulation은 원본
`DAT_00552998`, `0x3f0`, `0x3f1`을 shared/public shape에 넣지 않는다. UI consumer는 semantic
action을 한 번 consume하고 자체 modal lifecycle을 소유한다. 이 shape와 발생 시점은 handoff이며
금지된 simulation/shared 파일에는 구현하지 않았다.

## 미확정

- 경쟁 값 `0x3ee`, `0x3ec`, `0x3ea`의 사용자 의미와 해당 semantic action 이름
- `FUN_004495e0` alternate overlay 분기의 별도 UI 의미
- 실패한 원본 SPR loader가 남기는 세부 객체 상태; 이번에 확정한 것은 오류 보고 뒤 계속과
  dispatcher의 `0x3f1` 전이
- 원본 mechanism 결과에서 semantic action을 발행할 구체 simulation/gameplay 모듈
- 목표 문장의 실제 Windows font realization·glyph metrics와 원본 mechanism-owned action source 연결

프로젝트 event 소유 경계는
[후속 문서](objective-modal-ui-event-boundary.md)에서 확인했고,
[presenter lifecycle](objective-modal-presenter-lifecycle.md)도 연결했다. 후속
[typography 분석](objective-modal-typography.md)은 GDI font 요청·CP949 byte wrap을 복원하고
유효 base 폭 300만 이식했다. 다음 좁은 질문은 경쟁 값 중 K01 표시 흐름에 실제로 필요한 하나를
소비 함수까지 추적하거나, 보존 설치 입력에서 실제 Windows font realization의 정적 provenance가
있는지 확인하는 것이다.
