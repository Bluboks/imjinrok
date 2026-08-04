# 문서 안내

이 디렉터리는 프로젝트 현황, 원본 분석, 구현 경계와 작업 계획의 단일 진입점이다.

## 처음 읽는 순서

1. [프로젝트 상태](project-status.md)
2. [원본과 포팅 구현의 경계](architecture/original-vs-port.md)
3. [정적 분석 중심 로드맵](roadmap.md)
4. [역공학 문서 안내](reverse-engineering/README.md)
5. [정적 분석 방법론](reverse-engineering/methodology.md)
6. [증거 및 상태 기준](reverse-engineering/evidence-levels.md)

## 문서 구역

### 프로젝트

- [프로젝트 상태](project-status.md): 구현과 원작 검증 상태의 요약
- [로드맵](roadmap.md): 정적 분석부터 이식까지의 단계와 통과 조건
- [원본과 포팅 구현의 경계](architecture/original-vs-port.md): 무엇이 원본 사실이고 무엇이 프로젝트 설계인지 구분
- [지형·환경·자원 시각 계약](architecture/terrain-environment-resource-contract.md): 모딩 registry와 원본 source catalog의 경계
- [K01 게임플레이 음성 source adapter](development/k01-gameplay-audio-adapter.md): source-backed 제품 cue와 미확정 identity의 coverage 경계
- [유닛 생산 완료 음성 자원 경계](reverse-engineering/mechanics/unit-production-audio-policy.md): common/train 리소스와 미확정 장수 완료 음성의 분리

### 역공학

- [역공학 안내](reverse-engineering/README.md)
- [방법론](reverse-engineering/methodology.md)
- [증거 등급](reverse-engineering/evidence-levels.md)
- [원본 바이너리 기준 정보](reverse-engineering/binary-manifest.md)
- [분석 도구 인벤토리](reverse-engineering/tool-inventory.md)
- [분석 상태표](reverse-engineering/status-matrix.md)
- [함수 지도](reverse-engineering/function-map.md)
- [원본 엔티티 타입 카탈로그](reverse-engineering/data-structures/entity-type-catalog.md)
- [원본 엔티티 전수 시각 프로필](reverse-engineering/mechanics/original-entity-visual-profiles.md)
- [스프라이트 매핑 감사](reverse-engineering/sprite-mapping-audit.md)
- [브리핑 `SPEECH` 초상화 매핑](reverse-engineering/mechanics/briefing-portraits.md)
- [`SPEECH` 대화 레이아웃](reverse-engineering/mechanics/speech-layout.md)
- [K0110 briefing `TITLE`·`OBJECTIVE` overlay와 `SETDELAYTIME`](reverse-engineering/mechanics/briefing-metadata-setdelay.md)
- [K0110 `CHANGETITLE` resource owner와 consumer](reverse-engineering/mechanics/k0110-changetitle-consumer.md)
- [K0110 briefing outer update cadence](reverse-engineering/mechanics/k0110-outer-update-cadence.md)
- [공통 임무 목표 모달 기하·입력 파일럿](reverse-engineering/mechanics/objective-panel-layout.md)
- [공통 임무 목표 모달의 K01 결합](reverse-engineering/mechanics/objective-modal-k01-binding.md)
- [K01 공통 임무 목표 모달 진입 입력·컨트롤](reverse-engineering/mechanics/application-state-16-objective-control.md)
- [목표 pending action dispatcher와 UI-domain 계약](reverse-engineering/mechanics/objective-pending-action-dispatch.md)
- [K01 목표 모달 UI 이벤트 소유 경계](reverse-engineering/mechanics/objective-modal-ui-event-boundary.md)
- [K01 목표 모달 presenter·input lifecycle](reverse-engineering/mechanics/objective-modal-presenter-lifecycle.md)
- [공통 임무 목표 모달 font·측정·줄바꿈](reverse-engineering/mechanics/objective-modal-typography.md)
- [gameplay selection/command grid](reverse-engineering/mechanics/gameplay-selection-command-panel.md)
- [게임 속도·마우스 인터페이스 상태 경계](reverse-engineering/mechanics/gameplay-speed-mouse-settings.md)
- [command-grid cell-size common-loader 결합](reverse-engineering/mechanics/command-grid-cell-size-binding.md)
- [원본 command control의 `button.spr` pixel-frame 결합](reverse-engineering/mechanics/command-icon-frame-binding.md)
- [K01 source fog 자산·command icon 추출 경계](reverse-engineering/mechanics/source-fog-command-icons.md)
- [원본 fog resource·mask·six-subframe renderer 경계](reverse-engineering/mechanics/source-fog-rendering.md)
- [원본 fog visibility state·dirty-grid lifecycle](reverse-engineering/mechanics/source-fog-visibility-lifecycle.md)
- [임진록 tileset 컨테이너 인벤토리](reverse-engineering/mechanics/imjinrok-tileset-container-inventory.md)
- [임진록 main tileset loader 경계](reverse-engineering/mechanics/imjinrok-tileset-loader-boundary.md)
- [K01 source tile object·frame selector](reverse-engineering/mechanics/k01-source-tile-selector.md)
- [K01 원본 맵 데이터 추출 프로토콜 v1](reverse-engineering/mechanics/k01-map-data-extraction-protocol.md)
- [K01 tile placement-level·object/frame boundary](reverse-engineering/mechanics/k01-tile-placement-elevation-boundary.md)
- [K01 cell projection output-table boundary](reverse-engineering/mechanics/k01-cell-projection-output-tables.md)
- [K01 scheduler mode·selector producer boundary](reverse-engineering/mechanics/k01-clock-mode-producers.md)
- [K01 cold-start interval selector initialization·persisted config 경계](reverse-engineering/mechanics/k01-clock-selector-initialization.md)
- [K01 accepted source-update scheduler·producer chain](reverse-engineering/mechanics/k01-accepted-update-scheduler.md)
- [source pathfinding boundary](reverse-engineering/mechanics/source-pathfinding-boundary.md)
- [임진록 낮·밤 팔레트 schedule](reverse-engineering/mechanics/imjinrok-day-night-palette-schedule.md)
- [원본 `clock.spr` 정체와 웹 HUD 시계 경계](reverse-engineering/mechanics/source-clock-hud.md)
- [`pannel.spr` HUD blit 결합](reverse-engineering/mechanics/pannel-spr-hud-blit.md)
- [단일 선택 renderer dispatch의 lock·호출 순서](reverse-engineering/mechanics/single-selection-renderer-dispatch.md)
- [K01 단일 선택 `portrait.spr` 결합](reverse-engineering/mechanics/k01-selection-portraits.md)
- [선택 패널 slot dispatcher](reverse-engineering/mechanics/selection-panel-slot-dispatch.md)
- [선택 패널로 탐색한 SPEECH slot lifecycle](reverse-engineering/mechanics/selection-panel-slot-lifecycle.md)
- [고정 선택 패널 후보를 반증한 transient formatted overlay](reverse-engineering/mechanics/transient-formatted-overlay.md)
- [selection action·생산 queue dispatch·조건부 seven-slot owner 경계](reverse-engineering/mechanics/persistent-selection-action-boundary.md)
- [player-scoped 영웅 생산 queue 우선순위 toggle](reverse-engineering/mechanics/hero-priority-queue-gate.md)
- [전비 capacity·reservation·completion transfer](reverse-engineering/mechanics/war-expense-capacity.md)
- [player-scoped 마법 자동사용 toggle](reverse-engineering/mechanics/magic-auto-use-gate.md)
- [K01 유성룡 class 78 자동 마법 경로](reverse-engineering/mechanics/k01-ryu-auto-magic-path.md)
- [K01 action 59 subtype 0x10 고정 레코드·후속 효과](reverse-engineering/mechanics/k01-subtype-16-path.md)
- [generic selection mode 1 · effect kind 2 다중 셀 열거와 callback 경계](reverse-engineering/mechanics/generic-mode1-kind2-enumeration.md)
- [조선 창병·내부 클래스 2 애니메이션 파일럿](reverse-engineering/mechanics/unit-animation-pilot.md)
- [K01 조선 창병 locomotion raw field·walk cadence](reverse-engineering/mechanics/k01-class2-locomotion-cadence.md)
- [K01 조선 창병 locomotion writer·accumulator coordinate bridge](reverse-engineering/mechanics/k01-class2-locomotion-bridge.md)
- [K01 source coordinate bridge](reverse-engineering/mechanics/k01-source-coordinate-bridge.md)
- [K01 권율·유성룡 핵심 애니메이션 파일럿](reverse-engineering/mechanics/k01-hero-animation-pilot.md)
- [K01 일본 사무라이 핵심 애니메이션 파일럿](reverse-engineering/mechanics/k01-samurai-animation-pilot.md)
- [K01 일본 농부 핵심 프레임](reverse-engineering/mechanics/k01-japanese-farmer-frames.md)
- [K01 농부 resource-quantity 비영 분기 프레임](reverse-engineering/mechanics/k01-farmer-resource-branch-frames.md)
- [K01 농부 resource-work 상태 10·11·16 프레임](reverse-engineering/mechanics/k01-farmer-resource-work-frames.md)
- [K01 시작 유닛 class 12·13 binding](reverse-engineering/mechanics/k01-opening-unit-bindings.md)
- [K01 시작 건물 source binding](reverse-engineering/mechanics/k01-opening-building-bindings.md)
- [K01 opening building footprint anchor](reverse-engineering/mechanics/k01-opening-footprint-anchor.md)
- [K01 조선 농부 class 7 creation-default core frames](reverse-engineering/mechanics/k01-korean-farmer-core-frames.md)
- [K01 normal reinforcement animation batch](reverse-engineering/mechanics/k01-normal-reinforcement-animation-batch.md)
- [K01 일본 귀갑차 핵심 애니메이션 파일럿](reverse-engineering/mechanics/k01-turtle-tank-animation-pilot.md)
- [K01 일본 고니시 핵심 애니메이션 파일럿](reverse-engineering/mechanics/k01-konishi-animation-pilot.md)
- [K01 권율·유성룡 일반 공격 phase 파일럿](reverse-engineering/mechanics/k01-hero-basic-attack-pilot.md)
- [K01 유성룡 투사체 subtype 0x0c 파일럿](reverse-engineering/mechanics/k01-ryu-projectile-pilot.md)
- [K01 투사체 풀 갱신 cadence](reverse-engineering/mechanics/k01-projectile-pool-cadence.md)
- [K01 권율·유성룡 대상 선택과 사거리](reverse-engineering/mechanics/k01-hero-targeting-range.md)
- [K01 권율·유성룡 nearby aura 조사](reverse-engineering/mechanics/k01-hero-aura.md)
- [K01 권율·유성룡 사망·슬롯·대상 참조 수명주기](reverse-engineering/mechanics/k01-hero-death-lifecycle.md)
- [K01 source handle 할당·generation·release 수명주기](reverse-engineering/mechanics/k01-source-handle-lifecycle.md)
- [K01 봉화대 완성·K0120 native trigger](reverse-engineering/mechanics/k01-beacon-k0120-trigger.md)
- [K01 native 증원 정체·요청 좌표 매핑](reverse-engineering/mechanics/k01-reinforcement-identity-map.md)
- [K01 native 증원 슬롯·정확 배치 정책](reverse-engineering/mechanics/k01-reinforcement-placement-policy.md)
- [K01 mobile occupancy update boundary](reverse-engineering/mechanics/k01-mobile-occupancy-boundary.md)
- [K01 occupancy-owner create·movement·death/release transition](reverse-engineering/mechanics/k01-occupancy-owner-transition.md)
- [K01 미션 결과 latch·timer·commit 수명주기](reverse-engineering/mechanics/k01-mission-result-lifecycle.md)
- [K01 결과 presentation·post-result 전환](reverse-engineering/mechanics/k01-final-result-transition.md)
- [K01 표준 미션 진입 timer reset](reverse-engineering/mechanics/k01-mission-timer-reset.md)
- [조선 본영 건설·체력 프레임 파일럿](reverse-engineering/mechanics/building-state-pilot.md)
- [조선 봉화대 건설·체력 프레임 파일럿](reverse-engineering/mechanics/beacon-state-pilot.md)
- [K01 조선 훈련소 completed-idle 오버레이 경계](reverse-engineering/mechanics/k01-korean-barracks-idle-overlay.md)
- [엔티티 자료구조](reverse-engineering/data-structures/entity-record.md)
- [K01 팬 리마스터 MVP 정적 분석 계획](reverse-engineering/mechanics/campaign/k01.md)
- [캠페인 국가 선택 화면](reverse-engineering/mechanics/campaign/country-selection.md)
- [K01 map low-nibble 표준 주소형 직접 writer](reverse-engineering/mechanics/k01-map-low-nibble-writers.md)
- [K01 global mask source/copy boundary](reverse-engineering/mechanics/k01-global-mask-boundary.md)

### 의사결정과 작업 규칙

- [정적 분석 우선 결정](decisions/0001-static-first-reverse-engineering.md)
- [문서 작성 규칙](development/documentation.md)
- [정적 분석 에이전트 지침](agent-guides/reverse-engineering.md)
- [스프라이트·애니메이션 매핑 지침](agent-guides/sprite-animation-mapping.md)
- [UI 레이아웃 매핑 지침](agent-guides/ui-layout-mapping.md)
- [동적 검증 예외 지침](agent-guides/dynamic-validation.md)

## 현재 문서와 보관 문서

현행 문서는 `docs/` 아래의 위 링크들이다. `docs/archive/` 아래의 파일은 과거 상태와 실험 과정을
보존하기 위한 자료이며, 현재 절차나 원작 일치 판정의 단일 출처가 아니다.

보관 문서의 주소와 실험 기록을 재사용할 때는 원본 실행 파일 해시를 확인하고, 현행 방법론으로 다시
분석한 뒤 새 문서에 출처를 기록한다.
