selection-count-zero HUD slot 0의 controls 0x21/0x22와 actions 61/62가 제어하는 인접 player-scoped WORD gate의 전체 writer/read/reset/consumer 경로와 영향 집합을 원본 EXE·generated static evidence에서 복원해, 사용자가 기억한 플레이어 글로벌 마법 자동사용 활성/비활성 UX와 정확히 일치하는지 판정하세요.

# player-scoped 마법 자동사용 gate

## 판정과 범위

판정은 **정적 확정: 사용자가 기억한 player-global 마법 자동사용 enable/disable UX와 일치**다.
이 결론은 기억이나 control 이름에서 가져오지 않았다. 다음 연쇄를 원본 EXE 전체 함수·구조화 참조·
점프 테이블·원본 type 이름으로 교차 확인했다.

1. selection count raw WORD가 정확히 0일 때 `FUN_0045b3a0`이 slot 0을 만든다.
2. player record `+0x254c` WORD가 0이면 control `0x21`/action `61`, nonzero이면
   control `0x22`/action `62`를 고른다.
3. 두 control의 runtime label은 원본 CP949 `자동마법설정`/`자동마법해제`다.
4. `FUN_00477f50`은 action 61에서 그 WORD에 정확히 1, action 62에서 0을 기록하고 command
   record를 소비한다.
5. `FUN_004196e0`은 일반 공격 updater `FUN_00416c70`의 유일한 direct callsite에서 호출되고,
   정확히 9개 internal class에 대해서만 player WORD를 읽는다. 0이면 즉시 0을 반환하고,
   nonzero이면 class별 자동 특수행동 cadence·target·delivery 경로에 진입한다.
6. 그 영향 집합은 원본 카탈로그 이름이 고정된 정확히 9개 internal class이며, 다른
   internal class는 gate를 읽기 전에 0을 반환한다.

따라서 “마법”은 한 인물 이름이나 미리 붙인 bit 의미가 아니다. no-selection global toggle,
player-scoped 저장, 일반 공격 주기 안의 자동 특수행동 dispatcher, 전수 switch 영향 집합이 함께
닫힌 결과다. 다만 각 class의 깊은 target/world side effect 전체는 이번 재현 범위가 아니라
static-only다.

분석 상태는 `static-confirmed-player-global-magic-auto-use-toggle`, 재현 상태는
`partial-reproduction-complete-for-control-writer-reset-and-consumer-case-admission`,
구현 상태는 `analysis-only-no-product-change`다.

- **검토 기록:** Root Codex가 2026-07-28에 read-only review를 수행했다.

## 입력 provenance

- 원본 EXE:
  `original/imjinrok2/imjinrok2.exe`
- EXE SHA-256:
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- `seeds.json` SHA-256:
  `8e7c8821e9c84c5d0877bb977b119b3b878271502b36bf75e7426b570507bfb7`
- `functions.json` SHA-256:
  `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e`
- `references.json` SHA-256:
  `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5`
- `jump-tables.json` SHA-256:
  `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f`

독립 extractor는 이 다섯 입력의 exact SHA와 `sourceSha256`를 먼저 검사한다. EXE raw range,
current whole-function metadata, byte anchor, canonical structured reference projection, 79-case
jump table 중 하나라도 달라지면 report를 만들지 않는다.

## player record와 reset

player record base는 `0x0082c480`, stride는 `0x2c10`, player 수는 8이다. 대상 field는 raw
WORD `+0x254c`, player 0 absolute address는 `0x0082e9cc`다.

- `FUN_00460ba0`, `0x00460bfb`: 8개 player record를 `0x2c10` stride로 순회한다.
- `FUN_0047df30`, `0x0047df35`: record 전체 `0xb04` DWORD, 즉 `0x2c10` byte를 0으로
  초기화하므로 gate 초기/reset 값도 0이다.
- `references.json`에서 `to === 0x0082e9cc`인 complete structured direct-reference
  projection은 12개, SHA-256은
  `c04fcc37281a965043a26220e93723cf0dcb3a988488daf9f2bf71285a1cdea5`다.

12개는 `FUN_004196e0`의 9 reads, `FUN_0045b3a0`의 HUD read 1개,
`FUN_00477f50`의 writes 2개다. 이 완전성은 structured direct refs에 한정한다. whole-record
reset은 별도 caller/range로 닫았지만 save/load나 alias write가 전혀 없다고 확대하지 않는다.

consumer는 WORD를 **nonzero**로 비교한다. writer는 enable에 정확히 1을 쓰지만 synthetic
`0xffff`도 consumer admission에서는 enabled다. 인접 hero-priority gate `+0x254e`의
exact-one 비교와 다르다.

## no-selection HUD control과 actions

`FUN_00459490`은 action slot 9개를 clear하고 selection count raw WORD가 정확히 0일 때만
`FUN_0045b3a0`을 호출한다. 대상은 owner `0x007c5ed8`의 slot 0이다.

| 현재 gate | control ID | action WORD | frame/resource index | 원본 CP949 label |
| ---: | ---: | ---: | ---: | --- |
| 0 | `0x21` | 61 | 27 (`0x1b`) | `자동마법설정` |
| nonzero | `0x22` | 62 | 26 (`0x1a`) | `자동마법해제` |

actions 61/62는 20-byte action table의 `0x009482d4`/`0x009482e8` record다. 두 record의
raw 초기값은 flags WORD 1, target mode WORD 0, DWORD `+0x0c=2`, WORD `+0x10=4`,
produced class 0, DWORD `+0x08=0`으로 같다. 이 raw field에 사람용 의미를 추가하지 않는다.

label과 설명은 `FUN_0048ea90`의 exact copy에서 닫았다. source `0x004c8438`의 CP949 bytes는
`0x00aa4e08`로 복사되어 `자동마법설정`, source `0x004c8428`은 `0x00aa4e28`로 복사되어
`자동마법해제`가 된다. 같은 controls의 둘째 string field는 각각
`캐릭터 스스로 마법을 사용하도록 설정 합니다.`와
`캐릭터 스스로 마법을 사용하지 못하게 설정 합니다.`다. source
`0x004c761c/0x004c764c`가 runtime `0x00aa77e8/0x00aa77a8`로 복사된다.
`FUN_00457700`의 control `0x21/0x22` 초기값이 각각 이 두 runtime pointer를 받는다.
문자열 존재만으로 mechanic을 붙이지 않고 writer·consumer 흐름과 함께 사용했다.

`FUN_00477f50`은 player마다 50개 command record를 검사한다.

- `0x0047804b-0x0047805d`: action 61이면 `[ESI-2]`, 즉 `+0x254c`에 WORD 1을 쓰고
  command action WORD를 0으로 소비한다.
- `0x00478062-0x00478072`: action 62이면 같은 field에 0을 쓰고 command를 소비한다.
- `0x00478209`: 다음 player에서 gate 포인터를 `0x2c10`만큼 전진한다.

control의 frame/resource index 26/27 뒤 실제 파일명·pixel identity는 아직 미확정이다.
synthetic layout vector는 slot 0 RECT와 strict-interior 네 변 hit rule만 재현하며 원본 runtime
좌표나 pixel을 관찰했다고 주장하지 않는다.

## consumer 전체 switch와 영향 집합

`FUN_004196e0`의 raw 범위는 `0x004196e0-0x0041a018`이다. generated body는 jump table
data 때문에 10개 비연속 range, 665 instructions, instruction SHA-256
`7f47169185d935011244d7291327fb4c6e99c76c375fd40ccca284e04a6a192e`다.
raw whole range SHA-256은
`bc055ca6f3b2a6be6ea04f4b08d6e6e817c197fdd90c730b045196cbff83b6ff`다.

sole structured caller는 `0x00416f6e/FUN_00416c70`이고 canonical caller-set SHA-256은
`22c19e337849d706b3c4c69307fda5359895b7912caf4c4946952d5e705256bc`다.
호출자는 대상·range 준비 뒤 dispatcher 반환을 exact 1과 비교한다. dispatcher의 complete
structured outgoing direct-call set은 27개, SHA-256은
`d13736d5c1c820a7737d38fc9a2717b4e3a753c88da78699b1b53bb8fcd9fdae`다.

dispatcher는 entity `BYTE +0x37`에서 11을 빼고 0..78을 검사한다. `0x00419754`의 79-byte
selector와 `0x0041972c`의 10-target table에서 default가 아닌 class는 정확히 다음 9개다.

| class | 원본 카탈로그 이름 | case entry | gate read | nonzero 이후 정적 경계 |
| ---: | --- | --- | --- | --- |
| 11 | 조선 승병 | `0x004197b0` | `0x004197c5` | 전역 `0x007c5f8c` 갱신값 low 2 bits가 0이면 `FUN_00424d80`; 항상 0 반환 |
| 16 | 일본 무녀 | `0x00419810` | `0x00419825` | low 2 bits 0→`FUN_0041c870`, 1→`FUN_00424d80`, 2/3 no-op; 첫 helper exact 1만 1 반환 |
| 20 | 일본 닌자 | `0x00419880` | `0x00419895` | 갱신값 mod 3이 0→`FUN_0042d550`, 1→`FUN_00424d80`, 2→no-op |
| 36 | 명 주술사 | `0x004198f0` | `0x00419905` | cadence 없이 `FUN_0041c3c0`; exact 1만 1로 normalize |
| 78 | 조선 유성룡 | `0x00419930` | `0x00419948` | mod 3이 0일 때 target 검사 뒤 `FUN_004784c0` 또는 `FUN_004788b0` delivery |
| 79 | 조선 사명대사 | `0x00419a10` | `0x00419a25` | mod 3이 0이면 `FUN_00425210`; exact 1만 1 |
| 80 | 조선 곽재우 | `0x00419a80` | `0x00419a95` | mod 3이 0이면 `FUN_0041cf20`; exact 1만 1 |
| 85 | 일본 세이쇼오 | `0x00419af0` | `0x00419b10` | entity `+0x1b6` sign-extension과 `0x007c5f90`의 wrapped DWORD 합을 unsigned mod 3; admitted world/player scan·delivery 분기 |
| 89 | 명 심유경 | `0x00419e90` | `0x00419ea8` | mod 3이 0일 때 두 target validation 경로와 `FUN_00478500`/`FUN_00478540` delivery |

그 밖의 BYTE class 0..255는 모두 player index와 gate를 읽기 전에 0을 반환한다. class 11..89
범위 안의 default selector도 같다. extractor test는 256개 BYTE 값 전체에서 report의 9-class
집합과 reproduction predicate가 일치하는지 검사한다.

위 표는 complete dispatcher CFG에서 확인한 cadence, validation, direct-call, return 경계다.
`FUN_00437400`부터 world scan과 delivery wrapper를 포함한 class 85의 깊은 side effect,
각 helper가 대상에게 적용하는 최종 수치·resource·실패 효과는 별도 whole-function 질문이다.
이를 재현 완료로 올리지 않는다.

## 재현 범위와 실패/no-op

fixture `analysis/fixtures/magic-auto-use-gate-vectors.json`은 exact source hashes에 묶인다.
각 vector는 관찰 가능한 전체 반환 객체와 SHA-256 digest를 가진다.

- selection이 있으면 current player/gate/layout을 읽지 않고 slot clear 결과만 반환
- selection 없음에서 gate 0/nonzero control 선택과 strict-interior hit
- command가 도달하지 않으면 action을 읽지 않음
- actions 61/62의 exact 1/0 write와 consume
- unsupported class는 player/gate를 읽지 않고 return-zero boundary
- affected class의 gate 0은 cadence/helper 입력 전에 return-zero boundary
- gate `0xffff`와 1 모두 nonzero admission
- player BYTE reproduction은 runtime player 0..7, gate는 raw WORD 0..65535로 loud validation

class admission 뒤 cadence·helper·world state를 fixture에 synthetic success boolean으로 꾸며 넣지
않았다. 따라서 이번 slice 전체 재현 상태는 partial이다.

## project superset 경계와 남은 질문

제품 UI·simulation·shared contract는 바꾸지 않았다. 원본 8-player record, raw WORD gate,
control/action 숫자, 9-class switch는 좁은 compatibility evidence일 뿐 project public
architecture가 아니다. 현행 responsive·multi-selection·mana·health와 Noto/Canvas 적응을
그대로 유지한다.

hero-production-priority `+0x254e`와 이번 magic auto-use `+0x254c`는 인접하지만 비교 방식,
actions, consumer가 독립이다. 생산 버튼 right-click persistent HUD reservation/pinning도 계속
별도 미확정 lead다.

K01 유성룡 class 78의 `FUN_0041c870→FUN_004784c0/FUN_004788b0` 후속은
[K01 유성룡 class 78 자동 마법 경로](k01-ryu-auto-magic-path.md)에서 닫았다. 나머지 8개
class effect와 class 78 subtype 16 projectile 이후 효과는 계속 별도 질문이다.
