`UIScene`가 active request를 실제 presenter에 넘길 때, 이미 확정된 원본 frame/content/dismiss geometry와 K01 objective text를 사용하면서 미확정 글꼴·줄바꿈을 프로젝트 적응으로 분리하고, pointer·Escape dismiss와 blocking input·resize·shutdown을 어떤 독립 UI controller가 소유해야 하는가?

기준일: 2026-07-27

## 판정

- 원본 분석 상태: 기존 공통 목표 모달과 K01 결합 범위만 `정적 확정`; 새 원본 의미 주장은 없음
- 원본 재현 상태: 기존 objective panel·K01 binding·pending dispatcher 벡터를 유지
- 구현 상태:
  - 원본 frame/content/dismiss 기하, K0110 첫 문자열, 빈 둘째 문자열, strict pointer-release는
    `원본 기반`
  - uniform centered scaling은 기존 `의도적 적응` 유지
  - 글꼴·한국어 wrap·backdrop·`닫기 ESC` 표식·Escape·viewport blocker는 `의도적 적응`
  - K01 HUD button과 UI-domain event는 `프로젝트 전용`

독립 `ObjectiveModalPresenterController`가 presentation lifecycle과 modal input ownership을
가진다. `UIScene`는 action과 launch context를 전달하고 preload/create/shutdown을 연결하며,
`SkirmishScene`나 simulation state를 modal lifecycle에 맞추지 않는다.

## 고정 원본과 변환 자원

| 입력 | SHA-256 | 사용 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | modal 기하·strict release·텍스트 배치 제어 흐름 |
| `original/imjinrok2/yfnt/objectiveborder.spr` | `62552fecc34139e6729b84d4e15dcbe6ea3622eb76b7f443af29fa5322813ea5` | frame 0, 416×236 |
| `original/imjinrok2/script/K0110` | `d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8` | 두 `OBJECTIVE` 입력 |
| `objectiveborder_0000.png` | `e098c64d2c50d4010cdc5117080a07ee1a8c6afcfd0d13380a4aca20672e37ce` | 검증된 SPR frame의 웹 변환본 |

`UIScene.preload()`은
`assets/themes/default/ui/objective-panel/objectiveborder_0000.png`를 전용 texture key로
로드한다. open 시 texture가 없으면 controller는 기대 key와 asset 경로를 포함한 오류를 던진다.
다른 frame을 그리거나 fallback panel을 만들지 않는다.

## 원본 기반 presentation 입력

640×480 원본 좌표는 기존 resolver의 다음 값을 그대로 사용한다.

| 요소 | X | Y | 너비 | 높이 |
| --- | ---: | ---: | ---: | ---: |
| frame | 112 | 81 | 416 | 236 |
| content | 158 | 135 | 320 | 124 |
| dismiss hit geometry | 415 | 267 | 80 | 24 |

텍스트 caller 요청 폭은 320, renderer 유효 폭은 300, 첫 세로 중심은 166, 둘째 세로 중심은
228이다. viewport 변환은
`min(viewportWidth / 640, viewportHeight / 480)`의 단일 배율과 중앙 여백만 사용한다.

K01 action을 presentation content로 바꿀 때 다음을 모두 검증한다.

1. action이 strict K01 `open-objective-modal` shape다.
2. launch context scenario ID가 canonical `imjinrokK01Scenario.id`
   (`imjinrok-k01-opening`)이다. 별도 map ID `imjinrok-k01`과 혼동하지 않는다.
3. `scenario.briefing.objective`가 존재한다.
4. 그 값이 `@shared`의 canonical `imjinrokK01Scenario.briefing.objective`, 즉 K0110의 정확한 첫 입력
   `1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)`와 같다.

화면 문자열은 canonical 값을 복제한 별도 production 상수를 대신 표시하지 않고, 검증을 통과한
launch context 값을 사용한다. 둘째 원본
입력은 빈 문자열로 content model에 보존하며 glyph를 만들지 않는다. project objective ID
`build-beacon`은 request identity이고 원본 숫자 state나 레코드 인덱스를 runtime shape에 넣지
않는다.

## controller와 scene 경계

```text
K01 open-objective-modal action
  -> UIScene.handleObjectiveModalAction
  -> exact launch-context content resolution
  -> ObjectiveModalRequestState.open
  -> ObjectiveModalPresenterController.open
  -> one Phaser presentation view

pointer release / Escape
  -> controller destroys view
  -> UIScene callback clears ObjectiveModalRequestState
```

controller의 natural boundary는 objective ID, 첫 문자열, 둘째 문자열뿐이다. Phaser host는
texture 존재 확인, exclusive input ownership lease, view 생성, Escape·resize listener 등록을
제공한다. controller는 active content, primary-button 이전 상태, 단일 view·lease·listener
lifecycle을 소유한다.

이미 active이면 같은 request를 다시 presentation하지 않는다. request state와 presenter가
불일치해 한쪽만 열리면 조용히 보정하지 않고 오류로 실패한다. content·texture·viewport가
잘못돼 open이 실패하면 request state를 다시 닫고 원인을 그대로 전파한다. input lease 취득 뒤
view 생성이 실패해도 lease를 즉시 release해 다른 scene의 기존 입력 enabled 상태를 복원한다.

## modal input

presentation view에는 depth 10000의 full-viewport interactive zone이 하나 있다. 이 zone은
pointer down/move/up과 wheel propagation을 중단한다. 로컬 Phaser `InputManager`의 pointer
분배는 active scene stack을 역순으로 처리하지만 keyboard manager queue는 각 scene
`KeyboardPlugin`의 manager listener 등록 순서로 처리된다. 실제 browser trace에서는
`SkirmishScene` keyboard plugin이 `UIScene`보다 먼저 Escape를 받아 `event.cancelled = -1`로
만들었으므로, UI-local listener와 Zone만으로는 cross-scene modal isolation이 닫히지 않았다.

따라서 Phaser host는 open 직전에 active scene 목록을 snapshot하고 `UIScene` 자신을 제외한 각
scene의 `InputPlugin.enabled`와 `KeyboardPlugin.enabled`를 false로 만드는 exclusive lease를
취득한다. 이 상태에서는 등록 순서가 앞선 gameplay keyboard plugin도 Escape를 처리하지 않고,
pointer·wheel plugin도 실행되지 않는다. `UIScene` Escape handler는 `preventDefault()`와
`stopPropagation()`을 먼저 호출해 현재 event를 취소한 뒤 modal을 닫으므로, lease 복원 후에도
같은 Escape가 다른 scene으로 내려가지 않는다. Zone은 UI scene 내부의 HUD objects에도
pointer event가 내려가지 않도록 계속 propagation을 중단한다.

`UIScene`의 minimap pointer, action hotkey, action emit, playback control과 battlefield summary
handler도 controller active 동안 조기 반환한다. playback pause는 입력 차단 수단으로 사용하지
않는다.

pointer dismiss는 원본 규칙을 유지한다.

1. primary pointer down을 이전 상태로 기록한다.
2. held 상태에서는 닫지 않는다.
3. primary release가 있고 이전 down이 기록돼 있어야 한다.
4. release 좌표는 dismiss rectangle 네 변을 제외한 엄격한 내부여야 한다.
5. edge나 밖에서 release하면 active를 유지하고 이전 down을 지운다.

press 시작 위치는 제한하지 않는다. 이는 원본이 이전 global button state와 release 위치만
검사하는 범위와 같다. Escape dismiss, cross-scene input lease, wheel blocking, backdrop과
`닫기 ESC` 표식은 원본 규칙이 아니라 웹 K01의 명시적 적응이다.

## presentation 적응

원본 `objectiveborder` raster의 parchment·metal 표현을 그대로 중심에 둔다. 추가 presentation은
다음으로 제한한다.

- 화면 전체 입력을 차단하는 비시각적 Phaser Zone blocker
- 원본 raster 아래의 반투명 흑갈색 Phaser Graphics backdrop
- 원본 dismiss hit rectangle 위로 합성되는 얇은 갈색 fill·금속색 stroke와 `닫기 ESC` label
- 본문용 `"Noto Serif KR", Batang, serif` fallback과 가독성 stroke
- dismiss label용 `"Noto Sans KR", "Malgun Gothic", sans-serif` fallback
- 원본 renderer의 유효 base 폭 300을 사용하는 Phaser advanced word wrap과 uniform scale에
  맞춘 font size

후속 [typography 분석](objective-modal-typography.md)은 logical `Arial`, height 12,
`HANGEUL_CHARSET` 요청과 CP949 ASCII-space chunk 제어를 정적 확정했다. 그러나 실제 Windows
font mapper가 실현한 Korean face·glyph metrics와 K0110 line breaks는 미재현이므로 font
family/size와 Phaser 측정·wrap은 원본 기반으로 표기하지 않는다. 유효 base 폭 300만 원본 기반이다.
검증되지 않은 원본 버튼 sprite나 label이 있다고 주장하지 않는다.

## resize와 shutdown

resize listener는 현재 view를 새로 만들지 않고 기존 frame·text·blocker를 같은 resolver 결과로
relayout한다. blocker hit area도 새 viewport 전체로 갱신한다. listener와 view 개수는 각각 하나를
유지한다.

shutdown은 Escape·resize listener를 제거하고 active view를 destroy하며 button state와 content를
비운다. close와 shutdown은 lease를 한 번만 release해 snapshot한 scene별 pointer·keyboard
enabled 값을 그대로 복원한다. resize는 lease를 교체하지 않고 duplicate open도 새 lease를
취득하지 않는다. shutdown 자체를 user dismiss로 보고하지 않는다. `UIScene`는 bridge를 stop한
뒤 controller를 shutdown하고 request state를 닫는다.

## 테스트

`apps/game-client/src/ui/objectiveModalPresenter.test.ts`는 fake presentation host를 통해 다음
관찰 가능 동작을 검사한다.

- launch context의 정확한 K0110 문자열과 빈 둘째 문자열
- 640×480과 1280×720의 frame/content/dismiss/text/blocker layout
- pointer held, 네 strict edge, outside release, prior-down 없는 release, non-primary release
- strict 내부 primary release와 Escape dismiss
- 등록 순서가 앞선 gameplay keyboard/pointer plugin의 비활성화와 Escape event propagation 중단
- close·failed view creation·shutdown의 기존 scene별 input/keyboard enabled 상태 복원
- duplicate open의 view 비증가
- duplicate open·resize의 lease 비증가와 resize relayout의 view·listener 비증가
- shutdown의 view·listener·lease cleanup
- missing scenario/briefing, altered text, missing texture와 빈 primary text의 상세 실패
- texture open 실패 후 request state rollback

기존 `originalObjectivePanelLayout.test.ts`에도 responsive dismiss edge 회귀 검사를 추가했다.
기존 원본 입력 extractor와 fixture는 변경하지 않았다.

## 남은 미확정과 다음 질문

- 원본 목표 본문 font face·size와 Windows-949 한국어 wrap 규칙
- 원본 dismiss control의 frame·label·sound/latch presentation
- 원본 gameplay-panel의 화면상 정체와 mechanism-owned action 발행 연결
- accessibility font가 실제 배포 환경에서 선택되는지에 대한 브라우저별 font availability

다음 좁은 질문은 원본 목표 text renderer의 font 생성·측정·줄바꿈 호출과 자원 선택을 전체 함수
경계로 복원해, 현재 project-adapted typography 중 어떤 범위를 원본 기반으로 교체할 수 있는가이다.
