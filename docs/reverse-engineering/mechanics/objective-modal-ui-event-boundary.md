“현재 프로젝트에서 목표 모달 열기 요청을 소유할 기존 UI 이벤트 경계는 무엇이며, K01의 open-objective-modal semantic action을 원본 숫자 상태 없이 정확히 한 번 발행·소비하도록 어떻게 연결할 수 있는가?”

기준일: 2026-07-26

## 판정

- 원본 분석 상태: 앞선 dispatcher 질문의 `open-objective-modal` 의미만 `정적 확정`; 새 원본
  의미·상태·자원 주장은 없음
- 원본 재현 상태: 기존
  `analysis/fixtures/objective-pending-action-dispatch-vectors.json`의 action 결과를 그대로 사용
- 프로젝트 구조 확인: producer→event→queue→consumer와 scene shutdown/recreation은 코드 경로와
  독립 테스트로 확인
- 구현 상태: 이 문서 범위는 K01 HUD objective button에서 UI-owned active request까지의
  `프로젝트 전용 staged 연결`; 후속 presenter lifecycle은 별도 문서에서 구현

기존 `ACTION_TRIGGERED_EVENT` 자체는 이 요청의 소유 경계가 아니다. 이 이벤트는 `UIScene`의
entity command button·hotkey가 shared `ActionDefinitionId`와 선택 엔티티를 발행하고
`SkirmishScene`가 simulation 명령으로 소비한다. 목표 모달을 여기에 넣으면 UI 표현 요청을 gameplay
명령 계약에 섞고 shared action 정의를 확장해야 한다.

적합한 기존 패턴은 같은 `game.events`를 사용하는 반대 방향의 HUD view 경계다.
`SkirmishScene`는 selection·minimap·economy·playback view를 event와 registry에 발행하고,
`UIScene`가 이를 구독한다. 양쪽 scene은 `SHUTDOWN`에서 자신이 등록한 listener를 정확한
event·function pair로 제거한다. 이번 연결은 이 프로젝트 소유 패턴을 확장한 별도
`UI_DOMAIN_ACTION_REQUESTED_EVENT`를 사용한다.

## 조사한 기존 경계

### gameplay command 경계

```text
UIScene action-grid button / hotkey
  -> ACTION_TRIGGERED_EVENT
  -> ActionTriggeredView {
       actionId: ActionDefinitionId,
       selectedEntityIds,
       source: "button" | "hotkey"
     }
  -> SkirmishScene.handleActionTriggered()
  -> simulation command
```

등록은 `SkirmishScene.setupPointerLockLifecycle()`에서, 제거는
`SkirmishScene.handleShutdown()`에서 이뤄진다. 이 shape는 entity gameplay command 전용이므로
목표 모달 semantic action을 추가하지 않았다.

### HUD view 경계와 scene 생명주기

`SkirmishScene`가 `SELECTED_ENTITY_CHANGED_EVENT`, minimap 계열, economy·battlefield·playback
이벤트를 발행하고 `UIScene.create()`가 구독한다. `UIScene.handleShutdown()`은 해당 listener와
input·resize listener를 모두 제거한다.

미션 재시작은 `SkirmishScene.launchMissionContext()`에서 기존 `ui` scene을 먼저 stop한 뒤
`skirmish`를 새 context로 start하고 `ui`를 다시 launch한다. 메인 메뉴 진입도 `ui`를 stop한다.
따라서 새 bridge도 `UIScene` create/shutdown에 맞춰 등록·해제해야 이전 scene listener가 남지
않는다.

### objective view 소유

실행 중 objective tracker는 `SkirmishScene`가
`worldState.scenario.objectives`에서 required 또는 defeat-on-failure 항목을 골라 만든다.
signature가 바뀌면 기존 container 전체를 destroy하고 다시 생성하며, row 입력은 카메라 focus를
소유한다. 이 tracker는 dynamic status·progress·world focus를 함께 소유하므로 semantic modal
producer까지 추가하면 이미 큰 scene의 UI 책임을 더 늘린다.

`UIScene`는 같은 K01 launch context의 scenario ID와 안정적인 프로젝트 objective ID
`build-beacon`을 이미 가지고, session strip의 전역 HUD controls와 pointer input을 소유한다.
따라서 현재 실제 producer는 session strip의 별도 `목표` button이다.
`gamePlayback.controllable && !gamePlayback.paused`일 때만 표시·발행하며, HUD resize/redraw는
이전 container와 button zone을 함께 destroy한 뒤 하나를 다시 만든다. 별도 simulation 상태나
shared scenario 변경은 필요 없다.

`originalObjectivePanelLayout.ts`는 원본 frame·content·dismiss geometry와 제한된 lifecycle
모델만 소유한다. 이벤트·scene 또는 objective data 소유자가 아니므로 이 모듈에 event bus를
결합하지 않았다.

## 프로젝트 상위 계약

발행 shape는 다음과 같다.

```text
{
  type: "open-objective-modal",
  metadata: {
    profile: "original-parity",
    objectiveId: "build-beacon",
    trigger: "hud-objective-button"
  }
}
```

- `profile: "original-parity"`는 원본 dispatcher fixture에서 닫힌 `open-objective-modal`
  semantic action에만 적용되는 검증된 subset 표지다. 아래 project trigger나 event·request
  lifecycle까지 원본 parity라는 뜻이 아니다.
- `objectiveId`는 기존 scenario가 소유한 안정 ID `build-beacon`이다. 그 description은 정적으로
  복원한 K0110 목표 텍스트의 프로젝트 표현이며, 별도 source ID와 modal ID를 만들지 않는다.
  이 ID는 원본 레코드 인덱스나 state 번호가 아니다.
- `trigger`는 현재 프로젝트 HUD objective button이라는 명시적 적응이다. 원본
  `0x005527b0` control release와 같다고 주장하지 않는다.
- runtime/public shape에는 `0x3f0`, `0x3f1`, `DAT_00552998`이 없다.

`UiDomainActionRequestedView`는 `UiDomainAction<string, object>`인 generic event view다.
`ObjectiveModalActionBridge`는 `open-objective-modal` discriminant만 feature 경계에서 엄격히
검증·소비하고, 같은 channel의 다른 유효한 domain action은 throw하거나 소비하지 않는다.
따라서 향후 프로젝트 전용 action과 metadata를 union으로 확장할 수 있다.

## 발행·큐·소비

```text
K01 HUD objective button pointerup
  -> resolve candidate:
       scenarioId == canonical imjinrokK01Scenario.id ("imjinrok-k01-opening")
       gameplay interaction is enabled
       scenario objective IDs contain "build-beacon"
  -> create K01 open-objective-modal action
  -> UI_DOMAIN_ACTION_REQUESTED_EVENT emit
  -> UIScene-owned ObjectiveModalActionBridge listener
  -> validate exact type/profile/objectiveId/trigger
  -> append immutable pending queue
  -> FIFO consume callback
  -> ObjectiveModalRequestState.open(action)
```

bridge의 `start()`는 idempotent라 같은 instance에서 두 번 불러도 listener가 하나다. event 하나는
queue에 한 번 들어가고 callback에서 한 번 제거된다. callback 도중 새 event가 재진입해도 현재
drain을 재귀 호출하지 않고 뒤에 append한 뒤 FIFO로 한 번씩 소비한다.

playback이 제어 불가능하거나 paused인 briefing·result·pause 상태에는 producer control을 만들지
않으며 event 시점에도 후보를 다시 계산한다. 반복 pointer input은 각각 event 한 개를 발행하고
bridge에서 각각 한 번 소비된다. 다만 같은
`objectiveId`가 이미 active이면 `ObjectiveModalRequestState.open()`은 두 번째 open activation을
거부한다. 후속 presenter가 dismiss callback에서 `close()`를 호출한 뒤에는 새 request가 다시
active가 될 수 있다.

`stop()`은 정확한 listener를 제거하고 아직 남은 queue를 비운다. `UIScene.handleShutdown()`은
bridge를 stop하고 active request도 지운다. 재생성된 `UIScene`는 새 bridge 하나만 등록하므로 이전
scene은 후속 event를 소비하지 않는다.

## 실패 경계와 테스트

K01 emitter는 object·type과 아래 metadata 전체를 엄격히 검증한다. bridge는 unrelated domain
action을 무시하지만, `open-objective-modal` discriminant를 가진 payload에는 같은 metadata
검증을 적용해 field-specific `TypeError`로 거부한다.

- object가 아닌 metadata
- `original-parity`가 아닌 profile
- `build-beacon`이 아닌 objective ID
- `hud-objective-button`이 아닌 trigger

object가 아니거나 다른 type인 값을 K01 emitter에 직접 넘겨도 구체적인 object/type 오류로
거부한다.

`apps/game-client/src/ui/objectiveModalActionBridge.test.ts`는 다음 observable behavior를 검사한다.

- interaction-enabled K01 + `build-beacon` objective만 producer 후보가 됨
- dispatcher fixture에서 실제 `open-objective-modal`을 소비한 vector와 semantic type 연결
- idempotent start와 listener count 1
- 정상·반복·재진입 event의 FIFO one-consume
- active objective의 중복 open 억제와 close 뒤 재활성
- shutdown의 queue 폐기, old listener 제거, recreation의 새 listener 단독 소유
- 같은 generic channel의 유효한 non-objective extension action은 throw·consume하지 않음
- 잘못된 objective ID와 trigger의 구체적 실패

## 구현 경계와 미확정

이 문서의 작업은 event 전달과 UI-owned active-request 상태까지만 만든 staged project
adaptation이다. 후속
[presenter lifecycle 문서](objective-modal-presenter-lifecycle.md)는 검증된 raster·기하·K0110
text·strict pointer release를 실제 Phaser presentation에 연결했다. font·wrap·backdrop·Escape·
responsive blocker와 HUD trigger는 원본 동작이 아니라 명시적 프로젝트 적응이다.

원본 fixture·추출기·generated analysis는 변경하지 않았다. 경쟁 값 `0x3ee`, `0x3ec`,
`0x3ea`에는 의미 이름을 추가하지 않았다. `packages/simulation/src/**`와
`packages/shared/src/scenarios.ts`도 변경하지 않았다.

## 다음 좁은 질문

후속 질문의 판정과 구현은
[objective modal presenter lifecycle](objective-modal-presenter-lifecycle.md)에 기록했다.
