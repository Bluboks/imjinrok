# K01 유성룡 class 78 자동 마법 경로

## 결론

K01의 internal class 78 `조선 유성룡`이 일반 공격 상태 5에서 실행하는 자동 마법 경로는
다음 범위까지 정적으로 확정됐다.

1. player WORD `+0x254c`가 0이 아니고, DWORD 전역 `0x007c5f8c`의 갱신 결과가 3의 배수일 때만
   class 78 case가 target 검사를 진행한다.
2. `FUN_0041c870`이 exact 1을 반환하면 action 40 기록을 만든다. 이 action의 효과 phase는
   조건을 다시 검사한 뒤 caster의 signed WORD `+0x448`에서 70을 빼고 0으로 clamp하며,
   target status를 `1/0`으로 만들고 target owner를 caster player로 이전한다.
3. 위 검사가 실패하고 현재 target common entity BYTE `+0x68`이 exact 2이면 action 59 기록을 만든다.
   효과 phase에서 player WORD `+0x2542`를 signed-positive로 다시 검사해 1 감소시키고,
   entity signed WORD `+0x448`이 음수이면 0으로 clamp한다. 중심 `(0,0)`을 제외한
   `{-2,0,2} × {-2,0,2}` 8개 위치에서 두 neutral helper gate를 통과한 곳마다 subtype 16
   creation call을 실행한다.
4. 두 delivery wrapper는 source 검증이나 pending-store 성공 여부와 무관하게 1을 반환한다.
   따라서 delivery까지 도달한 업데이트는 실제 기록 저장이 실패해도 일반 공격 준비를 건너뛴다.
5. 자동 기록의 origin BYTE는 1이다. 이미 대기 중인 non-idle 수동 origin BYTE 0 기록은
   자동 기록 저장을 막지만, 수동 기록은 자동 기록을 덮어쓸 수 있다.

이는 자동 마법 toggle, hero-priority toggle, remembered production-button right-click HUD pinning과
서로 다른 경계다. 이 문서는 pinning을 설명하거나 해결하지 않는다.

분석 상태는 `static-confirmed-k01-class-78-auto-magic-issued-effects-and-command-boundary`,
재현 상태는 `부분 재현`(`partial-reproduction-bounded-projections`), 구현 상태는
`analysis-only-no-product-change`다.

## 근거와 재현 자산

- extractor: `tools/imjinrok/extract-k01-ryu-auto-magic-path.mjs`
- fixture: `analysis/fixtures/k01-ryu-auto-magic-path-vectors.json`
- focused test: `tools/imjinrok/k01-ryu-auto-magic-path.test.mjs`
- source EXE SHA-256:
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- generated source SHA-256:
  - `seeds.json`: `10e7104f3eb3f9dabac79b7636b3cd1b2efaa8f68ed1900a18f94a82160f58ba`
  - `functions.json`: `c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3`
  - `references.json`: `df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c`
  - `jump-tables.json`: `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f`

extractor는 19개 complete/raw 범위, 19개 generated function body, 11개 complete structured
call-reference projection, pending action 2..69의 68-case table과 entity state 1..69의 69-case table을
각각 개수와 digest로 검증한다. fixture projection digest는
`208194eedbb0dc6fbb85cf630f47d24cb4f7a327e8de970d64ece726ee0f679c`다.
원본이나 generated evidence 중 하나라도 바뀌면 독립 stale-evidence test가 실패한다.

동적 실행, VM probe, 문자열 의미 추정, 기존 제품 이름으로부터의 역추론은 사용하지 않았다.

## 진입과 cadence

`FUN_00416c70`은 상태 5의 대상 접근·일반 공격 updater다. `0x00416f6e`에서
`FUN_004196e0`을 호출하고 반환값을 exact 1과 비교한다.

class 78 case `0x00419930-0x00419a07`은 다음 순서다.

1. entity signed BYTE `+0x38`을 player index로 사용한다.
2. player WORD `+0x254c`가 0이면 0을 반환한다.
3. `(DWORD(0x007c5f8c) * 65411) mod 2^32`을 계산한 뒤 unsigned remainder modulo 65531을
   새 전역값으로 저장한다.
4. 새 값 modulo 3이 0이 아니면 0을 반환한다.
5. entity DWORD `+0x122` current target reference를 `FUN_0041c870`에 전달한다.

0 반환 시 `FUN_00416c70`은 일반 공격 준비 경로로 가서 entity DWORD `+0x88=3`,
DWORD `+0x12a=0`을 쓰고 target 좌표를 `+0x134/+0x136`에 복사한다. 1 반환 시 class 78은
그 준비를 하지 않고 해당 업데이트를 끝낸다.

## action 40 대상 조건

`FUN_0041c870` complete body `0x0041c870-0x0041c990`은 아래 조건을 모두 요구한다.

- player WORD `+0x23f6`이 0이 아니다.
- target index의 registry WORD slot이 0이 아니다.
- target signed WORD current health `+0x3e`가 0보다 크고 BYTE active gate `+0x1f0`이 0이 아니다.
- caster signed WORD resource `+0x448`이 70 이상이다.
- target internal class BYTE `+0x37`이 81이 아니다.
- player WORD `+0x240a == 1`이고 caster class가 78이면 target flags `+0x74`의 bit 1이 필요하다.
  그 밖의 경우에는 같은 DWORD의 bit `0x80000`이 필요하다.
- target type definition BYTE `+0x20`에 mask `0x08`이 설정되지 않았다. 이는 zero-based bit 3이며
  `0x100`을 뜻하는 “bit 8”이 아니다.
- target owner signed BYTE `+0x38`이 가리키는 player team BYTE `+0x05`가 caster player team과 다르다.
- target signed current health가
  `trunc(signed(entity[+0x3c]) * 2 / 3)`보다 엄격히 작다. `+0x3c`는 field offset이며
  덧셈 상수가 아니다. 예를 들어 maximum health 100의 threshold는 66이고, -5는 -3이다.

즉 이 함수가 확정하는 것은 “조건에 맞는 적 저체력 대상” admission이다. 함수 이름이나 기존 UI
표현만으로 회복 효과라고 부를 근거는 없다.

helper가 exact 1이면 case는 common entity WORD 전달값 `+0x1bc/+0x1be`
(absolute `0x00635414/0x00635416`), target reference,
entity WORD `+0x1b6` source reference, pending auxiliary WORD 값 1을 `FUN_004784c0`에 넘긴다.
wrapper가 고정하는 action WORD는 40이다.

action definition `0x00948130`의 raw 값은 flags 16, target mode 1, DWORD `+0x0c=2`,
WORD `+0x10=4`, DWORD `+0x14=70`, DWORD `+0x08=0`이다. `+0x14`의 범용 의미는 이
경로만으로 정하지 않으며, effect의 소유권 이전은 실행 함수의 write로 확정했다.

## action 59 fallback

`FUN_0041c870`이 exact 1이 아니고 target common entity BYTE `+0x68 == 2`이면
`FUN_004788b0`을 호출한다. 이 wrapper는 action WORD 59, payload 0,
global DWORD `0x00949710` context, source reference, origin 1을 전달한다.

action definition `0x009482ac`의 raw 값은 flags 1, target mode 0, DWORD `+0x0c=2`,
WORD `+0x10=4`, DWORD `+0x14=0`, DWORD `+0x08=0`이다.

pending consumer의 action 59 admission `FUN_004165d0`은 player WORD `+0x2542` nonzero와
caster class 78을 요구한다. 그러나 effect `FUN_00416600`은 그 WORD를 signed로 읽어
strictly positive일 때만 효과를 낸다. 따라서 raw `0x8000..0xffff`는 admission은 통과하지만
effect에서는 취소된다.

positive이면 charge를 한 번 감소시키고 entity signed WORD `+0x448`이 음수일 때 0으로 쓴 뒤,
중심을 건너뛴 8개 주변 후보를 순회한다. 각 성공 후보는
`FUN_004111b0`에 subtype 16을 넘긴다. 이번 재현이 고정하는 subtype payload의 low WORD 계산은
다음과 같다.

action 59 재현 helper도 configured effect branch부터 시작한다. charge가 signed-positive가 아니면
resource·payload·candidate 입력을 읽지 않으며, positive인 경우에만 charge decrement,
negative-resource clamp와 supplied candidate gates를 투영한다.

```text
u16((entity raw WORD +0x46) * 3
    + u16(player/class table WORD) * 25)
```

`FUN_00411160`과 `FUN_00464cc0`의 더 깊은 의미는 이 slice에서 고정하지 않았다. 재현은 각 주변
후보에 supplied synthetic `accepted` gate 하나를 두며, 정확한 표현은 “8개 주변 후보 중
accepted인 후보에서 최대 8개 subtype-16 creation call”이다.
원본은 `push edi`로 DWORD를 전달하지만, 이번 synthetic output은
`subtypePayloadLowWord`만 투영한다. 16-bit IMUL 뒤 EDI의 전체 DWORD 상위 부분과 최종 전달값은
이번 재현에서 고정하지 않는다.
`FUN_004111b0` 이후 subtype 16의 비행·충돌·최종 효과는 이 slice에서 닫히지 않았다.

## delivery와 pending command

`FUN_004784c0`과 `FUN_004788b0`은 공통 core `FUN_00478320`을 호출한다.
core는 `FUN_00441db0`으로 source reference를 검사한다. source index의 registry WORD slot이
0이 아니고 source signed current health `+0x3e`가 0보다 커야 `FUN_00426740` store에 도달한다.
이 helper는 generation equality를 검사하지 않는다. target helper `FUN_00441e40`만 여기에
active gate `+0x1f0` nonzero 검사를 추가한다. `FUN_004426a0`은 두 player record의 team
BYTE `+0x05`가 같은지를 반환한다.

`FUN_00426740`이 저장하는 pending 영역은 `+0x266..+0x273`의 14바이트다. `+0x268` DWORD는
action WORD, origin BYTE, byte3 BYTE를 한 composite로 저장한다.

| offset·field | action 40 | action 59 |
|---|---:|---:|
| `+0x266` pending auxiliary WORD | 1 | 1 |
| `+0x268` action WORD | 40 | 59 |
| `+0x26a` origin BYTE | 1 | 1 |
| `+0x26b` byte3 | 0 | 0 |
| `+0x26c` payload DWORD | packed target x/y | 0 |
| `+0x270` context DWORD | target reference | global `0x00949710` value |

store `FUN_00426740`의 rejection 조건은 다음과 같다.

```text
existing action != 1
and existing origin != 1
and incoming origin == 1
```

조건이 참이면 아무 필드도 쓰지 않고 0을 반환한다. 수동 selected-action transport
`FUN_00477cc0 → FUN_00478250`은 origin 0을 사용하므로, 이미 대기 중인 수동 기록은 자동
기록을 막는다. 반대로 incoming manual origin 0에는 이 guard가 적용되지 않아 자동 기록을
덮어쓸 수 있다.

incoming action 21에는 `FUN_00426740` 내부의 별도 `+0x4b8/+0x4ba`와 callback 경로가 있다.
이번 pending-store 재현은 그 branch를 모델링하지 않으며 action 21 입력을 명시적으로 거부한다.

공통 core는 유효하지 않은 source에서 0을 반환하고, store에 도달하면 store 결과와 무관하게
1을 반환한다. 두 wrapper는 core 결과도 무시하고 항상 1을 반환한다. 그래서 class 78 case는
delivery가 호출됐다는 사실만으로 1을 반환한다. 수동 기록이 보존된 경우에도 그 업데이트의
일반 공격 준비는 생략된다.

## pending 소비와 상태 실행

entity update `FUN_0043c9c0`은 state switch보다 먼저 `FUN_00426c20`을 호출한다.
pending action switch의 complete projection에서:

- action 40 → `0x004272e0`
- action 59 → `0x00426ff1`

action 40은 `FUN_0041c840`에서 target 조건을 다시 검사한다. 성공하면 state WORD `+0x1b0=40`,
payload/context/origin을 실행 필드로 복사한다. action 59는 `FUN_004165d0` 성공 시 state 59로
같이 handoff한다. 두 경로 모두 bounded 성공·실패에서 pending action WORD를 idle 1로 소비한다.

entity state switch의 complete projection은:

- state 5 → `0x0043d153`, `FUN_00416c70`
- state 40 → `0x0043d1da`, `FUN_0041c9a0`
- state 59 → `0x0043cfd7`, `FUN_00416600`

pending consumer가 state updater보다 먼저이므로 상태 5 updater에서 새로 저장한 자동 기록은
일반적으로 이후 entity update에서 소비된다. 그 사이 수동 origin 0 기록이 들어오면 앞서 확인한
store 규칙에 따라 자동 기록을 교체할 수 있다.

## action 40 observable effect

state 40 updater `FUN_0041c9a0`은 target 접근과 phase 진행을 담당한다. effect helper
`FUN_0041cb10`은 configured phase에서 target 조건을 다시 검사한다. 실패하면 caster action 1을
queue하고 소유권·resource를 바꾸지 않는다.

action 40 재현 helper의 입력 경계는 configured effect branch 진입부터다. phase progression 자체를
synthetic boolean으로 재현하지 않고, revalidation 결과와 선택된 네 observable field만 투영한다.

성공하면 다음 write가 관찰된다.

1. caster signed WORD `+0x448 -= 70`, 음수이면 0.
2. `FUN_00420cb0(target, 1)`이 target WORD `+0x252=1`, WORD `+0x254=0`을 쓴다.
3. `FUN_0041c290(target, casterPlayer)`가 old player bookkeeping에서 target을 제거하고
   target BYTE `+0x38`을 caster player로 바꾼 뒤 new player bookkeeping에 추가한다.
4. target DWORD `+0x60`에는 current global tick이 기록된다.

따라서 정적으로 확정된 effect는 적 저체력 target의 player 소유권 이전이다. 재현은 resource,
status, status phase, owner라는 선택된 관찰 필드만 투영한다. tick `+0x60`, 내부 list/count,
resource bookkeeping과 sound/effect callback은 정적으로 도달하지만 재현 projection에는 포함하지
않는다. 이 원본 raw layout을 프로젝트 public architecture로 요구하지 않는다.

## 수동 명령과 일반 공격의 확정 경계

정적으로 확정된 충돌 경계는 pending store까지다.

- toggle off, cadence miss, action 40 admission 실패와 target kind !=2: dispatcher 0,
  같은 업데이트에서 정상 공격 준비.
- delivery reached: dispatcher 1, 정상 공격 준비 생략.
- source invalid: 실제 pending write 없음, 그래도 wrapper 1이므로 정상 공격 준비 생략.
- manual pending이 auto store 거부: manual pending 보존, 그래도 wrapper 1이므로 정상 공격 준비 생략.
- manual origin 0 delivery: 기존 auto pending을 교체 가능.

마우스 입력이 entity update와 어떤 outer scheduler 순서로 같은 tick에 배치되는지는 이 함수 집합만으로
완전히 닫히지 않았다. 다음 정적 질문은 `FUN_00477cc0 → FUN_00478250 → FUN_00426740`의
input-side caller scheduling과 `FUN_0043c9c0` entity-update scheduling의 공통 outer owner다.

## 프로젝트 경계

이번 변경은 분석·문서·fixture·test만 추가한다. product behavior는 이식하지 않는다.
원본 command record, fixed slots, timing, player/team/entity raw layout은 증거를 설명하는 내부 사실이지
public architecture mandate가 아니다. 현재 프로젝트의 responsive/multi-selection/mana/health,
Noto/Canvas adaptation은 의도적 superset으로 유지한다.

global magic toggle, hero-priority toggle, remembered production-button right-click persistent HUD pinning은
계속 독립적이다. 이 결과는 pinning action/owner를 확정하지 않는다.

fixture의 각 항목은 선언한 좁은 projection에 대해 complete expected output을 갖지만, subtype 16
downstream effect, action 40의 bookkeeping/callback 전체, outer scheduling이 빠져 있으므로 slice
전체 재현 상태는 `부분 재현`이다.
