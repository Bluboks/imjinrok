For the K01 Gwon Yul and Ryu Seong-ryong ordinary-attack path, how is the current target reference produced and validated, how do missing or out-of-range targets cause automatic acquisition or state transitions, and what exact fixed-width range formula and inclusive/exclusive boundaries does the original use?

# K01 권율·유성룡 대상 선택과 사거리

기준일: 2026-07-26

## 판정과 범위

- 분석 상태: `정적 확정` — 클래스 76 권율과 78 유성룡의 raw 현재 대상 생산·검사,
  자동 탐색 순서, `0x00438c50` 산술, 공격 서브상태의 관찰 가능한 분기에 한정
- 재현 상태: `재현 완료` — 활성 실패, 사거리 정상·경계·DWORD/WORD wrap, 탐색
  제외·tie, 취소·이동·재검사·raw 공격 진입 gate 벡터
- 구현 상태: `이식 보류` — 원본 좌표·footprint·참조 단위와 프로젝트
  `UnitState`/`GridPoint` 사이의 정확한 변환이 정적으로 확정되지 않음

이 문서는 현재 대상 검사와 자동 대상을 구분한다. `0x004168f0`은 이미 저장된 대상의
low WORD 활성 상태와 raw category/flag 조건을 검사한다. `0x00439770`은 별도 주기에서
후보를 순회하고 `0x00439d70`이 command 5를 받아들인 첫 후보를 큐에 넣는다.
`0x00438c50`을 호출한다는 이유만으로 어느 함수도 “대상 획득”이라고 부르지 않는다.

원본 EXE SHA-256은
`25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`다.
현재 `seeds.json` SHA-256은
`f01e8aa183df722b2e5412d98dff6a730d995c8588808b814e7b457e77bf0471`,
`functions.json` SHA-256은
`7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e`다.
독립 추출기는 `tools/imjinrok/extract-k01-hero-targeting-range.mjs`, 재현 테스트는
`tools/imjinrok/k01-hero-targeting-range.test.mjs`다. 추출기는 33개 관련 seed 함수,
35개 direct call edge, 17개 VA/raw-byte anchor를 요구하고 입력 해시·분석 해시·누락
CFG·변조 bytes를 즉시 실패시킨다.

## 타입 입력과 엔티티 필드

`0x0045bf50`의 type writer 호출을 역으로 읽으면 다음 raw 값이 나온다.

| 클래스 | type call | `+0x32` range WORD | `+0x34` scan radius BYTE | flags |
| ---: | --- | ---: | ---: | --- |
| 76 권율 | `0x0045d998` | 1 | 5 | `0x00880805` |
| 78 유성룡 | `0x0045daa1` | 5 | 5 | `0x00882805` |

`0x00437650`의 `0x00437d53`은 range WORD를 엔티티 `+0x126`에 복사하고 radius
BYTE를 zero-extend해 엔티티 WORD `+0x1a6`에 저장한다. 탐색 bounds에서는 이 WORD를
다시 sign-extend한다. 유성룡 flags에는 `0x2000`이 있어 primary cell scan 실패 뒤
`0x007d27d8` raw list를 추가 순회하지만, 권율에는 이 bit가 없다.

## 현재 대상 참조 생산과 검사

자동 탐색이 대상을 받아들이면 다음 순서로 command 5가 전달된다.

`0x00439d70 → 0x00478400 → 0x00478320 → 0x00426740 → 0x00426c20 → 0x00416870`

`0x00426740`은 큐의 `+0x268/+0x26c/+0x270` raw 필드를 기록한다. dispatcher
`0x00426c20`의 command-5 case는 action WORD `+0x1b0=5`, raw 보조 필드
`+0x1f4/+0x1f8/+0x1b4`, substate DWORD `+0x88=1`을 쓰고 `0x00416870`을
호출한다. writer는 인수의 low WORD를 `0x00441db0`에 넘기고, actor 자신의
low/high WORD 쌍과 모두 같으면 거부한다. 그 외에는 full DWORD를 `+0x122`에 그대로
쓰고 raw target category를 `+0x128`에 복사하며 `+0x12a=0`, `+0x12e=1`로 쓴다.

참조는 low WORD index와 high WORD generation의 결합이다. `0x00441e80`은 raw active
table, record의 positive WORD/active BYTE, record의 full reference를 모두 검사한다.
그러나 `0x00416c70` preamble의 이 호출 결과는 뒤의 substate switch를 gate하지 않는다.
substate 1에서 실제로 사용하는 `0x004168f0`은 다음만 검사한다.

1. actor BYTE `+0x1f0`이 0이 아님
2. target low WORD가 `0x00441e40`의 raw active/positive/active-byte 검사를 통과
3. actor flags bit `0x4`가 없을 때 target raw category `+0x30 != 1`
4. actor flags bit `0x2000`이 없을 때 target raw category `+0x30 != 2`

따라서 이 공격 substate 검사를 full-generation validation이나 관계/hostility 검사라고
확대하지 않는다. 관계 검사는 자동 탐색 쪽 `0x00442770`에 별도로 있다. 이 함수는 두 low
WORD의 raw active-table WORD를 확인하고 각 record의 signed BYTE `+0x30`을
`0x004426a0`에 넘긴다. 그 함수가 선택한 table BYTE 둘이 다를 때만 1을 반환한다.
table BYTE의 사람용 의미는 미확정이므로 문서에서는 “raw relation differs”로만 부른다.

## 사거리 함수 `0x00438c50`

함수는 먼저 대상 low WORD를 `0x00441e40`으로 검사한다. 실패하면 즉시 0이다.
클래스 33의 별도 occupancy branch는 공유 함수 계약의 일부지만 K01 두 영웅에는 도달하지
않는다. extractor가 제공하는 이 공유 evaluator는 actor tile X/Y와 occupied/target low
WORD를 signed WORD로 제한하고, map width/height만 원본 DWORD 비교 입력으로 받는다.

### 권율: range WORD 1

range WORD가 정확히 1이면 footprint branch다. 입력은 actor의 signed WORD
`+0x1bc/+0x1be`, signed WORD footprint `+0x1c0/+0x1c2`, target의 signed WORD
좌표 `+0x1bc/+0x1be`와 signed BYTE footprint `+0x1e3/+0x1e4`다. 각 축의 edge
separation을 DWORD 레지스터 산술로 만들고 절댓값을 취한다. 두 축 중 큰 값을 고를 때와
마지막 `1` 비교 때는 계산값의 low WORD만 signed 비교한다.
`attackerEdge < targetTile` 분기도 target signed BYTE footprint를 먼저 절댓값으로
바꾸지 않는다. `CDQ/XOR/SUB/SAR`가 만드는 0 방향 절반, 즉
`truncDiv2(targetFootprint)`를 그대로 쓴다. 따라서 target footprint `-2`, target X `2`
구별 입력은 false다.

즉 원본 판정은 수학적 무한정수 Chebyshev 거리가 아니라
`signed16(max-axis-low-word) <= 1`이다. 경계 1은 포함하고 2는 제외한다. 큰 좌표·footprint
산술이 low WORD로 접힐 수 있으므로 extractor는 이를 그대로 재현하며 “정상 좌표 범위에서만”
조용히 다른 수식을 사용하지 않는다.

### 유성룡: range WORD 5

range WORD가 1이 아니면 target과 actor 양쪽의 signed WORD center
`+0x6a/+0x6c`를 sign-extend한다. 원본 연산은 모두 x86 DWORD wrap이다.

`D = signed32(imul(dx,dx) + imul(dy,dy))`

`T = signed32(imul(imul(range,range), 2025))`

마지막 `CMP`/`SETG`는 `T > D`의 signed 32-bit 비교다. 따라서 정상 범위에서
`D < T`인 strict boundary다. 유성룡 range 5는 `T=50,625`; 한 축 거리 224는 통과하고
225는 `D=T`라 실패한다. `32767 → -32768` 차이처럼 제곱 합이 wrap하는 입력과
range WORD 자체가 threshold를 wrap하는 입력도 재현 벡터에 고정했다.

## 자동 탐색의 조건과 순서

live action dispatcher `0x0043c9c0`은 action-state switch 전에 다음 raw 조건으로
`0x00439770`을 호출한다.

1. WORD `[0x00c06e34] == 0`
2. actor signed WORD `+0x1b6`와 DWORD `[0x007c5f80]`을 32-bit wrap 덧셈
3. `EDX=0`에서 unsigned `DIV 20`한 나머지가 0

이는 “20 simulation tick마다”라는 프로젝트 규칙이 아니다. 앞서 복구한 scheduler의
accepted-step counter와 같은 raw DWORD를 사용하지만 프로젝트 24 Hz로의 phase/mapping은
확정되지 않았다. 호출 뒤에는 `0x00439470`, queued-command dispatcher 순서가 이어진다.

scan 내부 gate `0x0043a410`은 signed BYTE `+0x8c >= 100` 및 BYTE `+0x1f0 != 0`을
요구한다. 이어 actor 주변 3×3 coarse mask와 선택된 raw side mask가 하나라도 맞아야
실제 후보 scan에 들어간다. bounds는 actor signed WORD 좌표 `+0x1bc/+0x1be`에서
signed WORD radius `+0x1a6`을 빼고 더한 뒤 0과 map-size-minus-one로 clamp한다.

primary occupancy scan은 Y 오름차순 바깥 loop, X 오름차순 안쪽 loop다. 각 cell의 한
low-WORD candidate에 대해 inactive, 현재 대상 low WORD와 동일, raw relation이 같음을
차례로 제외한다. direct relation-different candidate는 raw table reset 호출 뒤
`0x00439d70`에 전달된다. command 함수가 정확히 1을 반환한 첫 cell에서 순회를 끝낸다.
동일 거리 계산이나 nearest sort는 없다.

relation이 같은 cell record는 그 record에 저장된 참조를 보조 후보로 사용할 수 있다.
timestamp 절댓값 차가 199 이하이고 full-reference 검사가 성공하며 actor와 raw relation이
달라야 한다. 선택된 raw mode가 1이 아닐 때는 cell Chebyshev separation도 4 이하여야 한다.
DWORD subtraction 뒤 `CDQ/XOR/SUB` 절댓값을 쓰므로 차이가 `0x80000000`이면 그대로 signed
negative가 되어 `<200` 검사를 통과하는 x86 overflow도 재현한다.
이 보조 경로의 사람이 이해하는 “assist” 의미는 확정하지 않는다.

primary scan이 실패하고 flags `0x2000`이 있으면 `0x007d27d8` list를 index 오름차순으로
순회한다. 유성룡만 이 초기 조건을 만족한다. relation-different entry는
현재 target full DWORD reference와 정확히 같으면 제외하며, low WORD만 같고 high WORD가
다른 entry는 허용한다. 남은 entry는 `0x00438c50(actor, entry, +0x1a6)` 뒤 command를
시도한다. relation-same entry는
raw WORD `+0x571a==1`을 요구하고 별도 full reference `+0x5716`을 range/command에
전달하는 분기다. 이 list와 두 raw 필드의 사람용 소유권이나 우선순위 의미는 미확정이다.

`0x00439d70`은 actor raw gate, candidate low-WORD active 검사, relation-different
검사를 다시 수행한다. actor `+0x4a0==1`이면 `+0x126` range도 요구한다. 현재 action
state 1은 `0x004168f0` 통과 시 command 5를 큐에 넣는다. state 5는 선택 raw mode가
1이거나 `+0x1b4==1`이어야 하고, `0x00416970`의 기존 대상 대비 raw 선호 검사를 추가로
통과해야 한다.

## 공격 서브상태 실패와 전이

`0x0043c9c0`의 ordinary attack action 5는 `0x00416c70`으로 간다.

| substate | 조건 | 관찰 가능한 순서/결과 |
| ---: | --- | --- |
| 1 | `0x004168f0 == 0` | `+0x1f1=0`, raw command 2 큐, `0x00439770`, return 0 |
| 1 | 대상 검사 성공, range 실패 | 두 영웅 초기 flags의 bit 0 때문에 substate 4, target 좌표로 movement command |
| 1 | 대상 검사·range 성공 | phase/facing reset 후 `0x004196e0`; 반환 1이면 substate 3을 쓰지 않고 return, 아니면 substate 3과 target 좌표 snapshot |
| 2 | `0x004173a0 != 0` | substate 1, `+0x1f1=0` |
| 3 | `0x00417430` cycle 완료 | substate 1, `+0x1f1=0` |
| 4 | movement 미완료 | 현 substate 유지 |
| 4 | movement 완료 뒤 target missing | raw command 2, 자동 scan |
| 4 | movement 완료 뒤 in range | substate 1 |
| 4 | movement 결과가 positive인 out-of-range retry | WORD `+0x12a` 증가; `+0x12c` 초과 시 cancel, 아니면 substate 1 |
| 5 | movement 완료 뒤 target missing | raw command 2, 자동 scan |
| 5 | movement 완료 뒤 in range | `0x00438bf0(target,1)==0`일 때만 substate 1 |

`0x004196e0`은 큰 class switch이며 여기서는 공격 substate가 관찰하는 반환 branch와
직접 call edge만 범위에 넣었다. 유성룡 관련 case에서 `0x0041c870`을 호출하는 두 site와
그 함수의 전체 seed CFG를 고정했지만, table·RNG·후속 행동의 사람용 의미를 추측하지 않는다.

## 고정 재현 벡터

- 유성룡: 거리 224 `true`, 225 `false`, inactive `false`
- 유성룡: attacker X 32767, target X -32768의 DWORD square wrap `true`
- 유성룡: range WORD 16384의 threshold wrap, 동일 좌표 `false`
- 권율: footprint axis 1 `true`, 2 `false`
- 권율: 32767/-32768 edge 산술이 low WORD 0으로 접히는 입력 `true`
- scan: 현재 대상과 raw relation-same 후보를 건너뛰고 Y-major 첫 accepted 후보 선택
- scan: 모든 command 거부 시 `null`
- scan scheduler: phase `-1` + accepted step `1`의 DWORD wrap/modulo 결과 `true`
- stored candidate age: 199 통과, 200 실패, `0x80000000` absolute overflow 통과
- 유성룡 secondary list direct branch: 앞의 range 실패 후보를 건너뛰고 첫 accepted index 선택
- substate 1 missing: cancel + scan
- substate 1 out of range: substate 4
- in-range raw attack-entry gate 반환 1: substate 3 쓰기 차단
- substate 4 arrival: substate 1
- substate 5 special-footprint 결과 nonzero: substate 5 유지
- boolean·signed-width 위반, stale seed SHA, tampered EXE SHA: loud failure

## integration gate와 남은 불확실성

현재 simulation은 generic superset combat/AI/targeting 구조다. 원본의 active table index,
generation DWORD, tile/center/footprint 필드, occupancy grid, raw relation table과 프로젝트
`UnitState`/`GridPoint`의 단위·수명·변환이 정확히 대응한다는 정적 증거가 없다. 그러므로
기존 구조를 좁히거나 inferred compatibility multiplier를 넣지 않았고
`packages/simulation`은 수정하지 않았다.

남은 불확실성은 다음과 같다.

- 원본 참조/세대 수명과 프로젝트 entity identity의 exact mapping
- actor/target tile·center·footprint 필드와 프로젝트 좌표/크기의 exact mapping
- coarse mask, occupancy grid, raw relation table/list의 사람용 의미
- `0x004196e0` 유성룡 raw alternate 반환 경로의 전투 의미
- accepted-step counter 기반 modulo-20 phase를 프로젝트 24 Hz에 옮길 원본 기반 규칙

공격 이후 signed health 0, 행동 6/7, slot 해제와 stale current-target 수명은
[K01 영웅 사망 수명주기](k01-hero-death-lifecycle.md)에서 후속 복원했다. integration gate는
원본 참조·좌표·entity-update 단위의 프로젝트 exact mapping이 생길 때까지 그대로 유지한다.
