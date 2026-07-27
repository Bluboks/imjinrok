# UI 레이아웃 매핑 지침

## 적용 범위

HUD, 메뉴, 브리핑, 대화, 선택 패널, 입력 영역의 위치·크기·정렬을 분석하거나 구현할 때 적용한다.

## 근거 순서

1. 원본 EXE의 좌표 상수, 사각형 계산, 자원 크기와 호출 데이터 흐름
2. 원본 스크립트·자원 파일의 숫자 인수와 헤더
3. 재현 가능한 정적 추출기와 독립 테스트 벡터
4. 화면 이미지는 이상 탐지용 보조 자료

눈으로 비슷해 보이는 위치, 현재 클라이언트의 반응형 수식, 보관 문서의 과거 판정은 원본 레이아웃의
근거가 아니다.

## 필수 규칙

- 원본 해상도와 좌표 원점을 먼저 확정한다.
- 위치만 떼어 보지 말고 너비·높이·오른쪽·아래쪽 경계 계산까지 추적한다.
- 숫자 슬롯을 `left`, `right`, `center`처럼 의미 이름으로 바꾸지 않는다. 의미가 정적으로 확정되지
  않았다면 원본 숫자를 보존한다.
- 레코드 필드에서 레이아웃 함수와 최종 draw/blit까지 이어지는 경로를 기록한다.
- 범위 밖 슬롯, 숨김, 비활성 표시와 히트 테스트의 실패 경로를 포함한다.
- 포팅 화면 크기가 다르면 원본 캔버스를 균일 배율로 변환한다. 종횡비를 찌그러뜨리거나 좌표별로
  별도 보정하지 않는다.
- 원본에서 확정한 좌표와 접근성·웹 입력을 위한 포팅 전용 요소를 코드와 문서에서 분리한다.

## `SPEECH` 현재 기준선

[대화 레이아웃](../reverse-engineering/mechanics/speech-layout.md)에서 다음 범위를 정적 확정했다.

- 640×480 좌표계
- 숫자 슬롯 0~3의 130×120 초상화 사각형
- 대사 X, 세로 중심과 최대 줄바꿈 폭
- `SPEECH` 레코드 `+0x80`에서 숫자 슬롯을 읽는 경로

제목, 목표, 버튼, 글꼴 종류·크기, 전체 HUD는 아직 같은 상태로 확정되지 않았다. 이 범위를
`SPEECH` 레이아웃과 묶어 원본 일치로 표시하지 않는다.

## 공통 임무 목표 모달과 K01 결합

[목표 패널 레이아웃](../reverse-engineering/mechanics/objective-panel-layout.md)에서 다음 범위를
정적 확정했다.

- 640×480 좌표계의 416×236 frame `(112,81)-(528,317)`과 320×124 내용 영역
  `(158,135)-(478,259)`
- 닫기 컨트롤 `(415,267)-(495,291)`과 네 변을 제외하는 엄격한 hit test
- 이전 프레임 눌림→현재 프레임 해제, 외부 one-shot `1`, 비활성 소유 상태와 DirectDraw 잠금
  실패의 분기
- 종료 시 SPR 조건부 해제 뒤 clear를 반드시 시도하며, clear용 잠금 실패 때 실제 clear·unlock만
  생략하는 순서

후속 [K01 결합 분석](../reverse-engineering/mechanics/objective-modal-k01-binding.md)은
`FUN_004495e0`의 handler 반환이 `0x3f0`을 만들고, 한국 캠페인 1단계가
`DAT_0088afcc=1`을 기록해 `script\k0110`의 목표 텍스트를 선택하는 경로를 정적 확정·재현했다.
공통 모달 기하와 이 K01 결합은 각각 독립된 재현 범위로 관리한다.

후속 [목표 모달 typography 분석](../reverse-engineering/mechanics/objective-modal-typography.md)은
`FUN_004a9010`의 5인자 호출, GDI `Arial`/height 12/HANGEUL_CHARSET 요청, CP949 byte
space-chunk와 내부 유효 폭 300을 정적 확정했다. 실제 Windows font realization과 K0110 glyph
metrics가 보존 입력에 없으므로 유효 폭만 원본 기반으로 이식하고 font family·size와 Korean
line breaks는 계속 의도적 적응으로 분리한다.

후속 [K01 진입 입력·컨트롤 분석](../reverse-engineering/mechanics/application-state-16-objective-control.md)은
Escape 또는 strict gameplay-panel press/release부터 state `0x16`, K01 mode 1의
`buttons201.spr` 컨트롤 strict release와 `0x3f0`까지 정적 확정·재현했다.

후속 [pending action dispatcher 분석](../reverse-engineering/mechanics/objective-pending-action-dispatch.md)은
producer의 마지막 활성 overwrite 뒤 `FUN_00449090`이 살아남은 `0x3f0`을 목표 모달 초기화로
소비하고, 로더 실패에도 `0x3f1`로 전진하며 종료 시 `1000`으로 reset하는 흐름을 정적 확정·재현했다.
클라이언트에는 숫자 상태가 없는 semantic `open-objective-modal` 계약을 추가했다. 후속 프로젝트
구조 감사는 K01 HUD objective button을 staged 프로젝트 적응 trigger로 삼아 `UIScene`의 private
active request까지 연결했다. 후속 [presenter lifecycle 구현](../reverse-engineering/mechanics/objective-modal-presenter-lifecycle.md)은
검증된 frame·content·dismiss 기하와 K0110 문자열을 독립 controller로 표시한다. 후속
typography 분석의 유효 base 폭 300만 추가로 원본 기반이며, font realization·glyph 측정·Korean
wrap·backdrop·Escape·responsive blocker는 의도적 프로젝트 적응이다.

두 텍스트 블록의 X·요청/유효 폭·세로 중심, K01 문자열 입력, logical GDI font 요청과 CP949 byte
wrap 제어는 확정했다. 실제 Windows font realization·K0110 glyph metrics와 gameplay-panel의
화면상 정체는 아직 확정하지 않았다. 원본 SPR 로더 내부 실패 종류·객체 결과와
오디오 자원 parity는 정적-only이고 이식하지 않았다. 후속 dispatcher 벡터는 loader 실패 보고 뒤
계속해 `0x3f1`로 전진하는 제어 효과만 재현한다. 자원·계산·입력 판정과 정상 로드 자원 cleanup
모듈은 클라이언트에서 원본 기반이다. K01 진입 결합은 분석 전용이고 semantic action 계약은 독립
UI-domain 모듈까지만 구현했다. 현재 실행 중인 목표 추적 패널은 이 원본 모달과 다른 프로젝트 전용
구현이다.

## 선택 패널 slot dispatcher 경계

[선택 패널 slot dispatcher](../reverse-engineering/mechanics/selection-panel-slot-dispatch.md)는
`FUN_004a84e0`의 두 direct caller, 네 slot의 exact-one active/kind 분기, progress signed WORD
갱신, 고정 RECT, label HDC 실패와 surface lifecycle을 정적 확정하고 범위 한정 재현했다.
`FUN_004a8480`은 clear가 아니라 base RECT initializer이고, `FUN_004a8410`도 draw가 아니라
slot RECT initializer다. `FUN_004a81f0`은 label renderer이며 생산·연구 discriminator를 읽지
않는다.

원본 slot kind와 현재 `selectionPanel.ts`의 construction/research/production 의미 결합은
[후속 lifecycle 분석](../reverse-engineering/mechanics/selection-panel-slot-lifecycle.md)에서
반증됐다. 이 record는 SPEECH 화자 portrait/label slot이고 kind는 old/new 화자 index 불일치
boolean이다. 따라서 현행 responsive·multi-selection·mana·추가 상태 UI는 별도 프로젝트
superset으로 유지하고, 고정 네 SPEECH slot을 public contract에 이식하지 않는다. 실제 GDI
label metrics도 synthetic 입력 아래 산술만 재현하며 Noto/Canvas typography는 의도적 적응이다.

별도 [transient formatted overlay 분석](../reverse-engineering/mechanics/transient-formatted-overlay.md)은
`FUN_004567c0`을 고정 bottom selection panel로 보던 탐색 후보도 반증했다. 이 함수는
producer 좌표와 supplied 측정값/post-call RECT로 transient surface를 blit한 뒤, 별도 cache
gate가 허용하면 base byte string을 target `(200,350)`에 그린다. 이 고정 text draw까지 포함해도
persistent bottom panel의 resource·rect·lifecycle은 증명되지 않았다.
실제 gameplay selection surface는 다른 owner·draw branch에서 다시 식별해야 한다.

[후속 selection/action 경계 분석](../reverse-engineering/mechanics/persistent-selection-action-boundary.md)은
right release가 zero target-mode action에서 normalized DWORD command payload로 전달되지만
selection 없음의 일곱 slot owner를 쓰지 않음을 확정했다. 그 owner는 update마다 clear된 뒤
faction/scenario-derived predefined table에서 다시 채워진다. 별도 per-entity 열 slot도
contained-object identifier container다. 별도로 action `115`는 internal class `76`
(`조선 권율`) 생산에 결합된다. payload `0`은 `entity+0x266` exact `1`에서만
prerequisite/`FUN_0047e330` reservation을 검사한다. exact-one reservation 성공에서만
entity `+0x3f0` add/assign과 optional action-indexed decrement를 수행하고, non-1은 이를
건너뛰고 common player/type writes에 합류한다. 이후 current state WORD exact `1`에서 state
`0x0f`를 시작하고, 다른 state 값에서는 one-entry queue append를 수행한다. right-release
payload `1`은 matching entry를 caller refund 없이 제거하거나, no-match에서
`FUN_0047e300` refund와 raw bookkeeping을 수행한다. selected action slot은 matching queue
count marker를 그리지만 이것이 사용자 기억의 persistent right-click reservation 표식이라는
결합은 확정되지 않았다. 이 좁은 production action/data-flow만 current `productionQueue` 표시와
호환 가능하며 original raw queue/state를 project contract로 복제하지 않는다.
fixture의 재현 완료 범위는 bounded selection/input transport와 action dispatch뿐이다.
queue pump·queue-count marker·state `0x0f` handoff와 `FUN_0042de00`의
progress/completion/post-dispatch 전체 결과는 static-only다.

## 변경 통과 조건

- 원본 파일 해시와 함수·데이터 주소
- 좌표 계산 전체와 범위 밖 입력
- 원본 해상도의 정확한 테스트 벡터
- 다른 종횡비에서 균일 배율과 여백을 검증하는 포팅 테스트
- `status-matrix.md`, 관련 메커니즘 문서와 구현의 동시 갱신

동적 확인이 필요하면 [동적 검증 예외 지침](dynamic-validation.md)을 먼저 적용한다. 게임을 직접
진행하며 빠른 화면 변화를 따라가는 방식은 기본 절차가 아니다.
