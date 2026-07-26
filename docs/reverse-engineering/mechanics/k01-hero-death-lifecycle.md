“For K01 Gwon Yul and Ryu Seong-ryong, after signed health reaches zero, what exact original update path enters and advances the death state, when is the entity record deactivated or released, and are other entities’ current-target references eagerly cleared or only made invalid by slot/reference lifecycle?”

기준일: 2026-07-26

## 판정과 범위

| 항목 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | 클래스 76·78의 raw branch 의미와 생성 기본 configuration; 사망 시점 cadence/flags에 따른 수명은 매개변수화 |
| 재현 | 재현 완료 | health `+1/0/-1`, 행동·raw gate 제외, phase·delay 경계, 즉시/지연 분기, stale/full-reference/slot 실패 |
| 프로젝트 이식 | 없음(차단) | 원본 entity-update/phase 단위와 프로젝트 24 Hz·`UnitState` 제거 수명주기의 exact mapping이 없음 |

원본은 체력과 레코드 표시 수명을 같은 순간에 끝내지 않는다. signed health가 `0` 이하가 되면 모든
관련 alive/active 참조 검사는 즉시 실패하지만, 클래스 76·78 레코드는 현재 cadence counter와
runtime flags에 따라 행동 6에서 사망 phase를 진행한다. 행동 7의 현재 `BYTE +0x74`에
`0x80`이 없어서 dispatcher가 `0`을 반환할 때만 outer active-list 순회가 슬롯을 해제한다.
확인한 사망·해제 경로에는 다른 엔티티의 현재 대상 `DWORD +0x122`를 직접 지우는 write가 없다.
그 값은 stale 상태로 남고 health, slot, 이후 generation/full-reference 검사에서 소비자 쪽이
거부한다.

이 문서의 “호출”과 “phase”는 원본이 해당 엔티티를 실제로 갱신한 accepted update 단위다. 초,
FPS, 프로젝트 24 Hz tick 수는 정적으로 확인되지 않았으므로 쓰지 않는다.

## 고정 입력

| 파일 | SHA-256 | 형식 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | PE32 x86 |

canonical Ghidra 12.1.2 산출물은 함수 2,448개, 문자열 1,545개, 내부 참조 57,572개,
간접 분기 268개, 점프 테이블 234개다. 이번 질문의 seed는 129개 주소·128개 함수이며
`pnpm imjinrok:analyze-exe`를 두 번 실행해 동일 checksum을 확인한다.

## 관련 함수와 raw 범위

| 주소 | raw 역할 | 범위·SHA-256 |
| --- | --- | --- |
| `0x00438130` | buffer 우선·signed health 차감 및 0 clamp | 기존 피해 파일럿 참조 |
| `0x0043c9c0` | health gate와 행동 switch, outer 반환 | `0x0043c9c0-0x0043d35f`, `eb1c7c21…` |
| `0x004233f0` | 행동 6 handler | `0x004233f0-0x0042373d`, `0d7a0984…` |
| `0x00423740` | 행동 7 helper | `0x00423740-0x00423753`, `7dc5a825…` |
| `0x00447360` | active-list 순회와 반환 0 슬롯 해제 | `0x00447360-0x00447599`, `8700298d…` |
| `0x00483aa0` | active-list 제거와 두 slot WORD clear | `0x00483aa0-0x00483c2e`, `f9b17284…` |
| `0x00483a60` | inactive slot 선택 | `0x00483a60-0x00483a9c`, `887217dd…` |
| `0x00483c50` | generation 증가 뒤 record 생성 wrapper | `0x00483c50-0x00483c9f`, `d33ed40b…` |
| `0x00437650` | `0x558`-byte record 초기화와 full reference 생산 | `0x00437650-0x00438025`, `46050567…` |
| `0x00441db0` | low-WORD slot nonzero + record positive health | `0x00441db0-0x00441dd8`, `12984df2…` |
| `0x00441de0` | 위 조건 + full DWORD reference 일치 | `0x00441de0-0x00441e36`, `089aff03…` |
| `0x00441e40` | 위 health 조건 + raw `+0x1f0 != 0` | `0x00441e40-0x00441e7a`, `01b3c165…` |
| `0x00441e80` | 위 조건 + full DWORD reference 일치 | `0x00441e80-0x00441ee4`, `b51574cf…` |
| `0x00426bf0` | 별도 command 경로의 현재 대상 full-DWORD clearer | `0x00426bf0-0x00426c1f`, `f3a01381…` |
| `0x004885e0` | K01 owner/class 목록에서 positive record reference 선택 | `0x004885e0-0x0048866f`, `09d7b2ff…` |
| `0x0048a5c0` | K01 클래스 76·78 protected-hero check | `0x0048a5c0-0x0048a878`, `c2a0e73…` |

줄임표 SHA는 extractor report의 전체 `instructionSha256`이 단일 출처다. 함수의 사람이 붙인
이름은 이 질문에서 확인한 raw 역할만 나타내며, 큰 피호출자의 사람용 의미를 확장해 주장하지 않는다.

## 필드와 전역

| 위치 | 폭·해석 | 이 질문의 생산/소비 |
| --- | --- | --- |
| entity `+0x3e` | signed WORD health | `0x00438130`이 `<=0`을 0으로 clamp; health/validity 함수가 signed 비교 |
| entity `+0x1b0` | WORD action | health gate가 6 기록, handler 완료가 7 또는 `0x16` 기록 |
| entity `+0x1b2` | signed WORD phase | 행동 6 진입에서 0, handler가 signed IDIV remainder·low-WORD 증가 |
| entity `+0x6e` | signed BYTE cadence limit | 타입 BYTE `+0x42`; 두 영웅은 1 |
| entity `+0x6f` | signed BYTE cadence counter | 생성 기본값 0; 사망 진입은 보존; `INC AL` 8-bit wrap 뒤 signed 비교 |
| entity `+0x18c` | signed WORD death phase count | class jump table이 76/78을 각각 count 8 store block으로 dispatch |
| entity `+0x84` | WORD raw flags | 생성 기본값 `0x0014`; runtime writer가 있어 사망 시 값은 별도 입력 |
| entity `+0x74` | DWORD raw flags | 생성 기본값 `0x00880805`/`0x00882805`; runtime writer가 있어 사망 시 값은 별도 입력 |
| entity `+0x1f0` | BYTE raw gate | 사망 상태 진입은 정확히 1, active lookup은 nonzero 요구 |
| entity `+0x234/+0x236` | signed WORD delay limit/counter | 생성 기본값 100/0; 행동 `0x16` 전이는 counter를 reset하지 않고 `JL` 비교 |
| entity `+0x122` | DWORD current target reference | 사망/해제 경로는 다른 record의 값을 쓰지 않음 |
| entity `+0x1b6/+0x1b8` | slot/generation WORD로 이룬 full reference | 생성 시 기록, 해제 시 유지, 재생성 시 새 값 |
| `0x007d0ed8[slot]` | WORD active slot table | lookup 선행 조건, 해제 마지막에 0 |
| `0x007d1838[slot]` | WORD inactive reuse-age table | 해제 마지막에 0, free-slot scan이 갱신 |
| `0x00843738` / `0x00842dd8` | signed WORD active count / slot list | outer 순회와 swap-last 제거 |
| `0x007c5f98` | generation WORD | record create 직전에 `INC AX`, 자연 16-bit wrap |
| `0x00c06e34` | WORD raw health-update gate | 0일 때만 dispatcher의 signed health 진입 검사 |

## health 0에서 행동 6 진입

`0x00438130`은 먼저 WORD buffer `+0x90`을 소비하고 남은 subtraction operand를 health
`+0x3e`에서 WORD로 뺀다. 결과를 signed `JG`로 판정하며 `<=0`이면 health를 0으로 clamp하고
0을 반환한다. 이 반환은 피해 호출자에게 즉시 보이지만 action 6 기록은 다음에
`0x0043c9c0`이 해당 record를 처리하는 지점에서 일어난다.

dispatcher의 순서는 다음과 같다.

1. `WORD [0x00c06e34] != 0`이면 이 health gate 전체를 건너뛴다.
2. signed `WORD [entity+0x3e] > 0`이면 살아 있는 update 경로를 돈다.
3. `<=0`이면 action 6, 7, `0x16`을 재진입 대상에서 제외한다.
4. `BYTE +0x1f0`이 정확히 1이 아니면 `0x00423740`을 호출하고 dispatcher가 0을 반환한다.
   outer active-list pass는 이 record를 같은 pass에서 바로 해제한다.
5. 그 외에는 action `+0x1b0=6`, phase `+0x1b2=0`만 기록하고 common update 뒤 같은
   dispatcher 호출에서 행동 6 handler를 실행한다. 이 store 범위에는 cadence counter
   `BYTE +0x6f` write가 없으므로 사망 진입 당시 값을 그대로 사용한다.

따라서 focused vector의 signed health `+1`은 진입하지 않고, `0`과 `-1`은 같은 `JLE`
결과다. raw damage 함수는 실제 subtraction 결과가 `-1`이어도 저장 health는 0으로 clamp하지만,
dispatcher 자체의 signed-WORD 계약은 세 입력을 모두 고정한다.

## 행동 6의 전체 클래스 관련 경로

`0x004233f0`은 `thiscall` 형태로 entity를 `ECX`에서 받는다. 먼저 `BYTE +0x1f1=1`,
`0x00423150`, raw `BYTE +0==1` 조건의 `0x0043a8b0(0,0)`, owner/class index 계산 뒤
`0x0048e3a0`, 그리고 entity `ECX`의 `0x0043a860`을 순서대로 호출한다. 이 호출들의
간접 전역 효과와 사람용 의미는 이 좁은 질문에서 확정하지 않았다.

그 뒤 현재 WORD `+0x84`의 `0x02`, `0x01`, `0x08` bit가 각각 별도 조기 완료/호출 경로를
고른다. 생성 기본값 `0x0014`에는 세 bit가 모두 없으므로 기본 configuration은 phase 경로를
쓴다. 하지만 `0x0042c7a0` 계열은 `+0x74`를 다시 쓰고 `+0x84`의 bit를 clear/set하며,
`0x0043bd1b`의 `MOV EDI,1` 생산 뒤 `0x0043bd26`도 `+0x84`에 DI를 OR한다. 이 writer가
K01 두 mission instance에 도달할 수 없는지는 이번 CFG 범위에서 닫히지 않았다. 따라서 사망
시점의 현재 flags를 생성 기본값과 동일하다고 가정하지 않으며, mutated flags에는 위 raw bit
branch를 그대로 적용한다.

phase 경로의 고정폭 순서는 다음과 같다.

```text
nextCounter = signed8(INC low BYTE(+0x6f))
threshold   = signed8(+0x6e) sign-extended to 32-bit, then + 1
if nextCounter < threshold:
    return 0                         // phase와 action 진행 없음

+0x6f = 0
visual state +0x03 = 7
if signed16(phaseCount +0x18c) > 0:
    phase = signed-IDIV remainder(signed16(+0x1b2), phaseCount)
else:
    phase = 0
store phase to +0x1b2 and +0x34

if signed32(phase) < signed32(phaseCount) - 1:
    store low16(EAX + 1) to +0x1b2 and +0x34
    BYTE +0x04 = 1
    return 0
if (+0x84 & 0x04) != 0:
    return 1
otherwise:
    INC WORD +0x18e
    return signed16(+0x18e) > signed16(+0x190)
```

`0x004291d0`의 canonical jump table `0x004292b3`은 class label 76을 `0x0042a9da`,
78을 `0x0042ab2a`로 dispatch한다. 두 block은 각각 EBX=8을 load하고 `+0x18c`에 WORD 8을
store한다. 타입/생성 기본값은 `+0x6e=1`, `+0x84=0x0014`, 생성 시 `+0x6f=0`이다.
단, 사망 진입은 `+0x6f`를 reset하지 않는다.

기본 flags와 phase 0에서 들어오는 counter에 따른 exact timeline은 다음과 같다.

| 사망 진입 당시 `+0x6f` | visual `BYTE +0x03=7` 첫 write | 행동 6 완료 | 행동 7 처리 |
| --- | --- | --- | --- |
| 0 | 행동-6 invocation 2 | invocation 16 | 다음 accepted update인 invocation 17 |
| 1 | 행동-6 invocation 1 | invocation 15 | 다음 accepted update인 invocation 16 |

phase는 visual write가 일어나는 accepted invocation에서 함께 진행한다. counter 0 경로는
invocation 14에 phase 7, 16에 완료하고, counter 1 경로는 invocation 13에 phase 7, 15에
완료한다. 완료 시 `+0x03=7`, `+0x1b2=7`, `+0x6f=0`이 record에 남는다. 행동 7이 release를
선택하면 이 필드는 release 직전까지 record에 남고, retain bit가 있으면 active record에 계속
남는다. renderer와 entity-update의 제시 순서를 독립적으로 복원하지 않았으므로 이를 화면에
표시된 정확한 frame 수로 바꾸지 않는다. phase 입력 8은 signed remainder 0으로 정규화된 뒤
1로 진행하며, cadence counter 127은 `INC AL`로 -128 wrap되어 signed `JL` no-progress가 된다.

이는 accepted original entity-update invocation 수다. 다른 incoming signed-byte counter에는
동일한 raw increment/wrap/compare 식을 적용해야 하며 단일 고정 lifetime을 주장하지 않는다.
scheduler rejection이나 원본 wall-clock 간격을 초 또는 24 Hz로 바꾸는 규칙도 없다.

## 행동 7과 raw 지연 행동 `0x16`

행동 6이 1을 반환하면 `0x0043ce11`은 현재 `BYTE(+0x84) & 0x19`를 계산한다. 0이면
`0x16`, nonzero면 7이다. 두 영웅의 생성 기본값은 `0x14 & 0x19 = 0x10`이므로 기본
configuration은 바로 7이 된다. runtime mutation 뒤 값에는 이 조건을 다시 적용한다.

공유 `0x16` 경로는 이 두 영웅이 현재 초기 flags로 선택하지 않지만 경계를 완결했다.

- `BYTE(+0x74) & 0x02`가 있고 visual state가 `0x12`가 아니면 state `0x12`와 dirty byte를
  기록한다. 두 영웅 flags의 low byte `0x05`에는 이 bit가 없다.
- `AX=WORD +0x236`과 `WORD +0x234`를 signed `JL`로 비교한다.
- counter `<` limit이면 counter를 1 증가시킨다.
- equality와 counter `>` limit은 증가 없이 action 7을 기록한다.
- 증가가 일어나는 최대 counter는 32766이다. signed WORD limit의 최대가 32767이므로 이
  조건 아래 실제 16-bit overflow 경로는 없다.
- 생성 기본값은 counter/limit 0/100이다. 행동 6 완료에서 `0x16`을 선택하는 store는
  `+0x236`을 reset하지 않는다. counter가 여전히 0인 경우에만 100회의 below update로
  100까지 증가하고, 다음 equality update에서 action 7로 전환한다.

행동 7의 `0x00423740` 자체는 raw `BYTE +0==1`이면 `0x0043a8b0(0,0)`을 호출하고 항상
1을 반환한다. 그러나 `0x0043c9c0`은 이 반환을 검사하지 않는다. 상태 7에서 현재
`BYTE(+0x74) & 0x80 == 0`이면 dispatcher가 0을 반환하고 outer pass가 release를 호출한다.
bit `0x80`이 있으면 dispatcher가 1을 반환해 active record가 유지되며 release를 호출하지
않는다. 두 영웅의 생성 기본 flags에는 이 bit가 없어 기본-initialized, 이후 미변경 상태에서는
행동 6 완료 다음 accepted update가 release 경계다. 그러나 runtime `+0x74` writer의 K01
도달 가능성을 완결하지 못했으므로 모든 사망에 대한 무조건적 next-update release는 주장하지 않는다.

## active-list 해제와 slot 재사용

`0x00447360`은 signed WORD active count `0x00843738`과 slot list `0x00842dd8`을
index 오름차순으로 돈다. slot table WORD가 nonzero인 record에 `0x0043c9c0`을 호출하고,
반환이 0일 때만 같은 list entry의 slot을 `0x00483aa0`에 넘긴다.

release는 이미 slot table이 0이면 조용히 no-op한다. active record이면 관련 cleanup 호출 뒤:

1. record WORD `+0x1ba`가 가리키는 active-list 위치를 마지막 entry로 교체한다.
2. 마지막 list WORD를 0으로 하고 active count WORD를 감소시킨다.
3. 옮겨진 record의 `+0x1ba`를 새 위치로 갱신한다.
4. 마지막에 `0x007d0ed8[slot]=0`, `0x007d1838[slot]=0`을 기록한다.

release는 record health, `+0x1f0`, full reference `+0x1b6/+0x1b8`을 바꾸지 않는다.
active table 0이 이 시점부터 해당 slot을 non-updatable/deactivated 상태로 만든다.

`0x00483a60`은 slot 1부터 1199까지 active table이 0이고 signed reuse-age WORD가 현재
best(초기 0) 이상인 entry를 free 후보로 보며 가장 큰 값을 선택한다. 동률은 뒤 index가
이긴다. release가 age를 0으로 만들므로 방금 해제된 slot은 이 조건에 들어간다. 이후 create
wrapper `0x00483c50`이 global
generation WORD를 `INC AX`로 증가시키고, `0x00437650`이 record 전체 `0x558` bytes를
0으로 만든 뒤 `0x0043782e`에서 slot low WORD를 `+0x1b6`에, `0x00437847`에서 전달받은
generation WORD를 `+0x1b8`에 각각 기록한다. generation은 health zero나
release에서 변하지 않고 이 재생성에서만 새 full reference에 반영된다. global generation
`0xffff`의 다음 값은 `0`으로 wrap한다.

## 참조 무효화와 K01 생존 검사

검사 순서는 다음과 같다.

| 함수 | 순서 |
| --- | --- |
| `0x00441db0` | slot table WORD nonzero → record health signed `>0` |
| `0x00441de0` | 위 두 조건 → record full reference low/high WORD가 공급된 DWORD와 일치 |
| `0x00441e40` | slot nonzero → health `>0` → `BYTE +0x1f0 !=0` |
| `0x00441e80` | 위 세 조건 → full reference low/high WORD 일치 |

따라서 health가 0이 된 순간, record가 아직 행동 6으로 active list에 남아 있어도 네 함수는
모두 실패한다. release 뒤에는 slot table 0에서 실패하고, 같은 slot이 재사용된 뒤에는 positive
health여도 이전 full reference가 generation mismatch로 실패한다. `0x00441db0` 자체는
generation을 검사하지 않는 low-WORD/positive-health 검사라는 점을 구분해야 한다.

K01 `0x0048a812`와 `0x0048a840`은 현재 owner WORD와 클래스 76/78을
`0x004885e0`에 넘긴다. lookup은 owner의 class 목록을 index 오름차순으로 돌며 각 low-WORD
slot을 `0x00441db0`으로 먼저 거르고, class byte가 일치하면 record full reference를 반환한다.
그 결과를 `0x00441de0`에 넘겨 protected hero가 살아 있는지 검사한다. 그러므로 health 0은
사망 visual record가 존재하는 동안에도 K01 alive check에서 즉시 false다.

## 다른 엔티티의 current-target clear 여부

0x558-byte entity record 문맥에서 확인한 current-target 생산·clear instruction은 다음
다섯 곳이다. 이는 whole-binary raw-displacement inventory가 아니다.

| 주소 | write |
| --- | --- |
| `0x004168b5` | `DWORD [ESI+0x122]=EDI`, full reference 기록 |
| `0x00426bf5` | `WORD [ECX+0x122]=AX`, clearer low WORD |
| `0x00426bfc` | `WORD [ECX+0x124]=AX`, clearer high WORD |
| `0x004376fd` | `WORD [ESI+0x122]=BX`, record 생성 clear |
| `0x00437704` | `WORD [ESI+0x124]=BX`, record 생성 clear |

`0x00426bf0` clearer의 canonical direct caller는 `0x00426c20`, `0x0042de00` 두 곳이다.
두 helper의 canonical direct caller도 각각 dispatcher `0x0043c9c0` 한 곳뿐이며 둘 다
`0x00426bf0`을 호출한다.

경로 분리는 다음과 같이 검증한다.

- dispatcher의 signed-positive-health 경로만 `0x0043ccc8 -> 0x00426c20`을 호출한다.
  health `<=0`의 `JLE 0x0043cccf`는 이 live 경로를 건너뛴다.
- canonical action jump table `0x0043cda3`은 action 6을 `0x0043cdfa`, action 7을
  `0x0043ce6e`, action `0x16`을 `0x0043ce2e`로 보낸다.
- 별도 action 15만 `0x0043d289`로 가며 `0x0043d292 -> 0x0042de00`을 호출한다.
- extractor는 행동 6 `0x004233f0`, 행동 7 `0x00423740`, dispatcher `0x0043c9c0`,
  outer updater `0x00447360`, release `0x00483aa0`의 실제 seeded instruction을 각각
  전수 검사하여 memory destination이 `[base+0x122]` 또는 `[base+0x124]`인 direct write가
  있으면 실패한다. 알려진 다섯 함수 주소와의 단순 교집합 검사가 아니다.

동일한 raw displacement만으로 record 의미를 정하면 안 된다. `0x004950f0` 안의
`0x0049523b`은 `DWORD [ESI+0x124]`를 쓰지만 `+0x120/+0x128/+0x134` 등이 연속된 별도
coordinate/layout형 record 문맥이므로 0x558-byte entity current-target write에서 제외한다.
extractor는 byte anchor뿐 아니라 `functions.json`에서 함수 `0x004950f0`의 canonical body
range `0x004950f0-0x00495265`가 `0x0049523b`을 포함하는지도 요구한다.

따라서 확정 결론은 **확인한 health-zero/action-6/action-7/action-`0x16`/release 경로에는
direct eager clear가 없다**는 범위다. 다른 엔티티의 full DWORD current-target 값은 이
경로에서 stale로 남으며 소비자가 health/slot/full-reference validator에서 거부한다. alias를
통한 write 가능성과 unrelated command·다른 record-layout 경로는 이 scoped proof 밖이므로
전역적으로 모든 가능한 writer가 없다고 주장하지 않는다.

## 재현 벡터

```bash
node tools/imjinrok/extract-k01-hero-death-lifecycle.mjs --json
node --test tools/imjinrok/k01-hero-death-lifecycle.test.mjs
```

독립 extractor는 EXE SHA-256, 22개 relevant seeded function, 20개 핵심 call edge, 50개
원본 byte anchor, 타입 writer argument와 canonical class/action jump table을 직접 검증한다.
focused test는 다음을 hard-code한다.

- signed health `+1/0/-1`, global health gate, action 6/7/`0x16`, `+0x1f0` equality
- cadence no-progress와 signed BYTE wrap, phase 6→7, equality completion, phase 8 remainder wrap
- incoming cadence counter 0/1의 visual-state·완료·다음 action-7 timeline
- 생성 기본 `+0x84=0x14`의 action 7과 zero mask의 `0x16`, runtime state-7 retain bit
- delay below/equality, signed WORD 양 극단과 실제 overflow 부재
- health-zero stale reference, active-slot clear 경계, generation mismatch와 generation WORD wrap
- K01 alive 검사와 동일한 positive-health/full-reference 실패 조건
- malformed fixed-width/boolean input, stale analysis SHA, 누락 seed function, tampered EXE와
  누락·변조 class/action jump-table mapping, scoped-root direct target write 삽입, exclusion
  owner 누락/body-range 변조 거부
- scoped-root `[base+0x122/+0x124]`의 `MOV`는 거부하지만 read-only `CMP`·`TEST`는 허용

## 프로젝트 차이와 handoff

현행 generic simulation이 entity를 즉시 제거하는 사실은 원본 증거로 사용하지 않았고, 이번
작업에서 `packages/simulation`, `packages/shared`, `apps`를 수정하지 않았다. 원본 수명주기를
generic architecture에 연결하려면 다음 identity가 별도로 필요하다.

- 원본 accepted entity-update invocation과 프로젝트 24 Hz tick의 exact mapping
- 원본 slot/generation full reference와 프로젝트 `UnitState` identity의 exact mapping
- 사망 visual record 유지·K01 alive false·generic entity removal을 opt-in policy로 분리하는 계약

이 셋 중 하나도 추정 multiplier나 adapter로 채우지 않는다. 따라서 정적 분석과 재현은 완료했지만
runtime integration gate는 닫혀 있다.

## 남은 불확실성과 다음 질문

- 행동 6 prologue의 큰 피호출자들이 바꾸는 전역/외부 연출의 사람용 의미
- `+0x74/+0x84` runtime writer가 K01 두 mission hero instance에 도달하는 전체 producer CFG
- visual field write와 renderer presentation 사이의 ordering 및 실제 표시 횟수
- 원본 accepted entity update 한 단위의 seconds/FPS/24 Hz 대응
- release cleanup callees의 unrelated global side effects; scoped slot/reference mutation 순서는
  완결했지만 그 사람용 의미는 붙이지 않음
- generation WORD가 완전히 한 바퀴 돌아 같은 slot/full reference를 다시 만들 수 있는 장기
  정책과 그 시간 규모

다음 좁은 우선순위는 K01 봉화대 완성 뒤 K0120을 정확히 한 번 실행하는 조건과 상태 전이다.
