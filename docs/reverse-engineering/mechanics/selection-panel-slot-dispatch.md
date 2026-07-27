원본 선택 패널 슬롯 dispatcher FUN_004a84e0 전체가 어떤 입력·전역·slot 상태를 읽고 어떤 분기·좌표·slot 경계·실패 또는 no-op 조건으로 FUN_004a7880·FUN_004a81f0·FUN_004a8410·FUN_004a8480을 호출하는가? 기존 탐색 후보명 progress·production/text·slot draw·clear 중 무엇을 전체 정적 경계로 검증하거나 교정해야 하며, 현재 apps/game-client/src/ui/selectionPanel.ts의 건설·생산·연구 표시와 의미상 호환되는 범위만 원본 기반 compatibility slice로 분류할 수 있는가?

## 판정

- 분석 상태: **정적 확정**. dispatcher, 두 direct caller, visibility gate, 네 slot 분기, progress와
  label helper, 고정 사각형 helper, source surface 생성·해제 범위를 원본 EXE 전체 함수와
  structured reference 집합으로 고정했다.
- 재현 상태: **범위 한정 재현 완료**. raw DWORD gate, 네 slot 순서, progress WORD 갱신과 사각형,
  공급한 synthetic GDI 측정값 아래 label 위치, HDC 실패, source/destination 실패 경계를 10개
  결정론 vector로 재현한다.
- 구현 상태: **분석 전용, production 변경 없음**. 후속
  [slot lifecycle 분석](selection-panel-slot-lifecycle.md)은 이 owner record를 건설·생산·연구가
  아니라 `SPEECH` 화자 portrait/label slot으로 확정했다. 반응형·다중 선택·mana·추가 상태를
  제공하는 `selectionPanel.ts`는 별도 프로젝트 superset으로 유지한다.

후보 이름은 다음처럼 교정한다.

- `FUN_004a8480`은 `(188,100)-(466,280)` RECT initializer다. clear를 수행하지 않는다.
- `FUN_004a8410`은 slot RECT initializer다. 자체 draw 함수가 아니다.
- `FUN_004a81f0`은 table-selected byte string label renderer다. 전체 함수 안에서 생산·연구
  discriminator를 읽지 않는다.
- 따라서 기존 `extract-ui-layout-evidence`의 `progress`, `production/text`, `slot draw`,
  `clear` meaning 문자열은 탐색점일 뿐 이 문서의 의미 증거가 아니다.

## 원본과 provenance

| 입력 | SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `analysis/generated/imjinrok2/functions.json` source | 위 EXE 해시와 일치 |
| `analysis/generated/imjinrok2/references.json` source | 위 EXE 해시와 일치 |

전용 추출기
`tools/imjinrok/extract-selection-panel-slot-dispatch.mjs`는 EXE를 직접 읽고 PE VA를 독립 변환한다.
11개 raw whole-function range, 11개 function catalog 경계·명령어 digest, 20개 exact byte anchor,
8개 complete structured reference projection을 모두 검증한다. stale JSON, 변조 EXE, caller
누락·추가, dispatcher outgoing reference 변조를 거부한다.

주요 전체 범위는 다음과 같다.

| 함수 | inclusive VA 범위 | raw bytes SHA-256 | 역할 |
| --- | --- | --- | --- |
| `FUN_0043fcd0` | `0x0043fcd0-0x0043ffbd` | `f512273a51382a063adcb4f8fdfa0a45b0ea294115cc84133d963a56be4b7023` | source surface 생성 |
| `FUN_0043ffc0` | `0x0043ffc0-0x0044008e` | `afe74089af8b08b1075ecd5e66df5c2072e9bc79e56de010f6178252dfc39283` | source surface 해제 |
| `FUN_004475a0` | `0x004475a0-0x00447bb8` | `81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c` | main destination caller |
| `FUN_0047f300` | `0x0047f300-0x0047f430` | `bc2645a3a95bd67c2cc5e5e0e1ac178704d76485fab2c63527753ed3ea44e715` | alternate destination caller |
| `FUN_004a7880` | `0x004a7880-0x004a79c4` | `3c4b11e74c8c35d2b39bd6dbb3ed64668385e70c9d6791edfe74b37a8e514c70` | progress state와 partial blit |
| `FUN_004a7de0` | `0x004a7de0-0x004a7e2c` | `e93088fd1bc116ab5267ebe8107848359bc425b5a57246ff7ec045b5cdac7702` | visibility gate |
| `FUN_004a8030` | `0x004a8030-0x004a8129` | `a61dae0e8a6916bf6ac02da5198d96edc728d39187c0f20b41c83a4fc533e42f` | 별도 slot owner update/label caller |
| `FUN_004a81f0` | `0x004a81f0-0x004a83f3` | `bff626a9f16d345a3be965c6678e2a3805e53c89794774da181e84fb048f04f1` | label 측정·배치·draw |
| `FUN_004a8410` | `0x004a8410-0x004a846e` | `c7f7fbb967b4bb23893c1b0842d36f8335c137dcd713cefd9578a475d774da1d` | slot RECT |
| `FUN_004a8480` | `0x004a8480-0x004a84a1` | `5e38a4aa22198bbf775b7b53626b2381662defa05ca2f801fc9301bfd681ef66` | base RECT |
| `FUN_004a84e0` | `0x004a84e0-0x004a8606` | `99b27288bd3e851b53f9ab153ce68af73de34675c263f2f8df5fc3883f1bd09e` | ordered dispatcher |

## complete caller와 reference 경계

`references.json`의 canonical projection은 `from`, `to`, `type`, `fromFunctionEntry`만 취해 정렬하고
SHA-256으로 고정한다.

- `FUN_004a84e0` direct caller는 정확히 둘이다
  (`count=2`, digest
  `e9a86971370d64aff3ec02577108bd638b3830ff6f516e16d12d9fbba7782cda`).
  - `0x00447b19`, `FUN_004475a0`, `UNCONDITIONAL_CALL`: owner
    `0x005e3680`, destination `DAT_00549580`
  - `0x0047f394`, `FUN_0047f300`, `UNCONDITIONAL_CALL`: 같은 owner,
    destination `DAT_0055a938`
- 두 caller 모두 `FUN_004a7de0` 반환이 정확히 `1`일 때만 dispatcher를 호출한다.
- dispatcher의 complete structured outgoing set은 16개이고 digest는
  `abcc36278d6b346b6a8386bd8a26b7d773918ca412f171e39f1f05e3a72e0992`다.
- helper direct caller 집합도 각각 고정했다:
  `FUN_004a7880` 1개, `FUN_004a81f0` 2개, `FUN_004a8410` 4개,
  `FUN_004a8480` 1개. surface 생성·해제 함수도 각각 direct caller 1개다.

`FUN_004a84e0`은 ECX owner와 stack의 destination surface pointer 하나를 받고 `RET 4`로
정리한다. 두 caller 밖의 indirect caller가 없다고 일반화하지는 않지만, 현재 complete structured
direct-call 집합에는 위 둘만 존재한다.

## 입력 필드와 순서

| 위치 | 폭·해석 | 소비 |
| --- | --- | --- |
| `owner+0xe8+slot*4` | raw `DWORD`; 재현 입력은 canonical unsigned `0..0xffffffff`, exact `1`만 active | 네 slot 진입 |
| `owner+0xc8+slot*4` | raw `DWORD`; 재현 입력은 canonical unsigned `0..0xffffffff`, exact `1`만 별도 | `1`이면 progress, 나머지는 frame+label |
| `owner+0x13c+slot*2` | signed `WORD` | progress 비교·증가·크기 |
| `owner+0x10+slot*2` | signed `WORD` | `0x00c83e44[index]` label pointer |
| `owner+0xf8` | raw `DWORD`; 재현 입력은 canonical unsigned, nonzero면 visible | dispatcher 자체에는 별도 draw 없음 |
| `owner+0x568`, `owner+0x564` | raw `DWORD`; 재현 입력은 canonical unsigned, nonzero면 visible, exact `1`이면 draw | 후행 optional rectangle |
| `DAT_0054927c` | source surface pointer | base와 optional rectangles |
| `DAT_00549588..0x00549594` | surface pointer 4개 | slot 0..3 |

dispatcher가 호출된 뒤 순서는 고정이다.

1. `FUN_004a8480`으로 base RECT를 만들고 destination vtable `+0x1c`로
   `DAT_0054927c`를 draw한다.
2. slot `0,1,2,3`을 순서대로 방문한다.
3. active가 `1`이 아니면 그 slot은 완전 no-op이다.
4. active `1`, kind `1`이면 `FUN_004a7880(slot,destination)`만 호출한다.
5. active `1`, kind가 `1`이 아니면 `FUN_004a8410` RECT와 해당 slot source를 destination
   vtable `+0x1c`로 draw하고 `FUN_004a81f0(slot,destination)`을 호출한다.
6. `owner+0x568 == 1`이면 `(188,290)-(466,376)`, 이어 `owner+0x564 == 1`이면
   `(188,65)-(466,95)`를 `DAT_0054927c`에서 draw한다.

`+0x568/+0x564`가 `2`처럼 nonzero지만 `1`이 아니면 gate는 dispatcher를 호출하되 optional
draw는 하지 않는다. 따라서 slot도 모두 비활성이면 base 한 번만 그린다.
어떤 gate도 성립하지 않으면 dispatcher가 호출되지 않으므로 destination/source/HDC/measurement
상태와 caller destination은 읽지 않는다. 또한 dispatcher가 호출되어도 `active != 1`인 slot은
kind DWORD를 읽지 않는다. 재현 모델도 이 미도달 caller·inactive kind 입력을 요구하거나
검사하지 않으며, active exact-one slot의 kind만 canonical unsigned DWORD로 검증한다.

## 좌표와 slot 경계

모든 좌표는 원본 640×480 surface 좌표다.

| 대상 | left | top | right | bottom | 크기 |
| --- | ---: | ---: | ---: | ---: | ---: |
| base | 188 | 100 | 466 | 280 | 278×180 |
| slot 0 | 26 | 49 | 156 | 169 | 130×120 |
| slot 1 | 490 | 49 | 620 | 169 | 130×120 |
| slot 2 | 26 | 210 | 156 | 330 | 130×120 |
| slot 3 | 490 | 210 | 620 | 330 | 130×120 |
| field `+0x568` | 188 | 290 | 466 | 376 | 278×86 |
| field `+0x564` | 188 | 65 | 466 | 95 | 278×30 |

`FUN_004a8410`은 slot을 signed WORD로 읽는다. `0..3`이면 위 origin을 쓴 뒤 right=`left+130`,
bottom=`top+120`을 계산한다. 범위 밖이면 switch가 origin을 초기화하지 않지만, caller가 준
left/top에 right/bottom 덧셈은 수행한다. dispatcher loop는 오직 `0..3`만 전달한다.

## progress 경로

`FUN_004a7880`은 slot을 signed WORD로 읽고 `owner+0x13c+slot*2` signed WORD progress를
읽는다.

- 시작 progress `< 100`: `5`를 더해 WORD로 저장한 값을 같은 frame의 계산에 사용한다.
- 시작 progress `>= 100`: kind DWORD를 `0`으로 지우지만 progress는 그대로 사용해 같은 frame에
  draw한다.
- 따라서 `95`는 먼저 `100`이 되어 full 130×120을 그리고 kind는 유지한다. 다음 frame이
  `100`으로 시작할 때 kind를 지우고 full draw를 한 번 더 시도한다.
- `width=trunc(progress*130/100)`, `height=trunc(progress*120/100)`이며 signed x86 division의
  zero 방향 truncation이다.
- 결과 rect는 slot 중심에 배치하고 destination vtable `+0x14`에 indexed slot surface와
  options `0,0x01008000,0`을 전달한다. 반환은 무시한다.

destination null이면 상세 오류를 보고하지만 반환하지 않고 뒤의 vtable dereference로 진행한다.
이 경로의 crash/외부 handler 결과를 deterministic behavior로 꾸미지 않는다.

## label 경로

`FUN_004a81f0`의 의미 확정 범위는 label draw다.

1. destination vtable `+0x44`로 HDC를 얻는다. 반환이 nonzero면 즉시 종료하며 font selection,
   table lookup, measurement, draw, `+0x68` release를 모두 건너뛴다.
2. 성공하면 `SetBkMode`, shadow color, `DAT_00634e38` font 선택을 시도한다. `SelectObject`
   반환은 제어 흐름에서 무시하므로 재현 입력에 성공 여부 필드를 만들지 않는다.
3. signed WORD `owner+0x10+slot*2`를 `0x00c83e44` pointer table index로 사용한다.
4. `GDI32!GetTextExtentPoint32A`(`IAT 0x004b7058`)로 전체 NUL-terminated byte string을
   측정한다. 반환을 무시하므로 실패한 `SIZE` 결과는 미정이며 재현 모델은 이를 거부한다.
5. `x=slot.left+65-trunc(width/2)`, `y=slot.bottom`; 모든 `SIZE`·화면·좌표 add/sub/compare는
   signed x86 32-bit `LONG` wrap으로 재현하고 음수 x/y를 먼저 0으로 clamp한다.
6. **overflow 보정 전에** shadow용 `(x+1,y+1)`과 right=`x+width`,
   bottom=`y+height`를 owner slot storage에 기록한다.
7. 그 뒤 local x/y만 검사한다. wrapped right/bottom이 screen `LONG`보다 크면 각각
   `screenWidth-width`, `screenHeight-height`의 low WORD를 signed 확장해 local x/y를 바꾼다.
8. 첫 `TextOutA`(`IAT 0x004b7050`)는 보정 전 stored shadow 좌표와 색 `0x010101`을 사용하고,
   둘째는 보정 후 local main `(x,y)`와 색 `0xfafafa`를 사용한다. 이후 destination vtable
   `+0x68`로 HDC를 release한다.

fixture의 폭·높이는 **공급한 synthetic GDI 결과**다. label bytes, 실제 Windows font realization,
glyph pixels 또는 원본 측정값을 확정하지 않는다. 사용자는 pixel-identical font parity를 요구하지
않았으므로 font provenance 후속 조사는 중단하고 현재 Noto/Canvas typography를 의도적 프로젝트
적응으로 유지한다.

## surface 생성·실패·해제

`FUN_0043fcd0`은 `DAT_0054927c` screen-sized source와
`DAT_00549588/8c/90/94` 130×120 source 네 개를 만든다. 각 allocation 실패는 오류를 보고한 뒤
계속한다. dispatcher는 source null guard를 두지 않고 indirect draw에 그대로 전달하며 반환도
무시한다. 따라서 vector의 `sourceAvailable=false`는 null pointer 전달까지의 제어 흐름만
재현하고 downstream surface 구현 결과는 미확정으로 남긴다.

`FUN_0043ffc0`은 base와 네 slot surface 각각을 null-check하고 vtable `+0x08`로 release한 뒤
전역을 0으로 지운다. destination surface 생성·수명은 두 caller 바깥 소유 범위이며, dispatcher
진입 시 null이면 첫 vtable dereference가 보호되지 않는다.

## 재현 vector

`analysis/fixtures/selection-panel-slot-dispatch-vectors.json`은 정확한 EXE 해시와 dispatcher
10개, slot RECT 4개 입력을 고정한다. RECT 결과는 full deep equality, dispatcher 결과는 전체
canonical JSON SHA-256을 무조건 비교하고 다음 observable 경계를 별도로 확인한다.

- 아무 gate도 없을 때 dispatcher 미호출
- `+0xf8`만 nonzero일 때 base-only
- progress `0→5`, `95→100`, 시작 `100`의 kind clear와 같은-frame draw
- 네 non-progress slot의 정확한 순서·RECT·synthetic label 배치
- signed slot `0`, `3`, `-1`, `4`의 고정·범위 밖 caller-origin RECT
- HDC 실패 뒤 downstream 입력 독립성과 no-release
- source allocation 실패 뒤 null source 전달과 optional draw 순서
- non-one active/draw fields의 base-only 결과
- alternate destination caller에서 pre-overflow shadow `(486,331)`과 post-overflow main
  `(-40,70)`이 갈리는 경로
- supplied signed `LONG` height의 `0x7fffffff` 덧셈 wrap 경계
- raw DWORD의 canonical unsigned 표현과 음수·`0x100000000` 거부
- reached field 폭 오류, GDI 측정 실패, label pointer 실패, destination 부재의 loud rejection

## 프로젝트 compatibility 판정

현재 `apps/game-client/src/ui/selectionPanel.ts`는 project-owned view data에서 단일 선택의
construction, research, production을 우선순위로 고르고, 다중 선택·mana·체력·추가 상태를 함께
표시한다. 이것은 코드 경로 감사 결과이지 원본 parity 증거가 아니다.

이번 원본 범위는 “네 SPEECH slot 중 active exact-one을 순서대로 그리고, kind exact-one만
portrait transition partial blit로 보낸다”까지 닫혔다. 후속 lifecycle 분석은 kind가 이전
화자 label index와 새 화자 index의 불일치 boolean이고, label table이 17개 화자 이름임을
정적으로 확정했다. 따라서 construction/research/production과의 compatibility 가설은 성립하지
않으며 다음을 하지 않는다.

- kind `1`을 건설·생산·연구 중 하나로 이름 붙이지 않는다.
- 현재 프로젝트의 construction/research/production 우선순위를 원본 분기로 소급하지 않는다.
- 원본 고정 네 slot이나 640×480 좌표가 responsive/multi-selection public contract를 지배하게
  만들지 않는다.
- 의미가 닫히지 않은 벡터를 production UI에 이식하지 않는다.

## 후속에서 닫힌 범위와 남은 질문

[slot lifecycle 분석](selection-panel-slot-lifecycle.md)은
`owner+0xc8/+0xe8/+0x13c/+0x10`의 생성·SPEECH 갱신·reset·clear, kind exact `1`,
`0x00c83e44`의 17개 화자 label pointer/bytes, optional field의 독립 lifecycle을 정적
확정했다. source allocation 실패 뒤 각 indirect surface implementation의 실제 결과와
구조화 분석 밖 arbitrary alias write는 계속 미확정이다.

다음 좁은 질문은 실제 gameplay 선택 UI owner와 건설·생산·연구 progress producer를 별도로
찾아 project selection view data와 의미상 결합 가능한 record인지 검증하는 것이다.
