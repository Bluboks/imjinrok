# Trace-20260730T130801 성능 추적 기반 조치

## 범위

`/home/agent/coding/imjinrok/Trace-20260730T130801.json.gz`의 Chrome renderer-main trace를
대상으로 한 웹 클라이언트 최적화다. 이는 원본 게임의 동작 또는 원작 일치 주장이 아니라, 동일한
프로젝트 렌더 출력과 HUD 계약을 유지하기 위한 웹 제품 적응이다.

## 기준 측정

- trace 길이: 97.13초
- `FireAnimationFrame`: 1,686회, p50 10.13ms, p90 45.57ms, 16.7ms 초과 535회
- 시작 로드 task 하나: 23.889초
- CPU profile: `redrawTerrain`의 RenderTexture 생성 경로 `checkFramebufferStatus` 약 11.635초,
  `redrawAllFogOverlay`/`ensureFogChunkRenderTexture` 약 10.711초
- runtime stack: `redrawDirtyFogOverlay` 약 20.388초. 타일별 `RenderTexture.draw`가 매번
  begin/end와 WebGL bind를 발생시켰으며, 명시 타일 fog 약 10.543초, fallback fog 약 9.528초
- HUD: 매 synced tick의 `publishPlayerEconomy → UIScene.redrawActionGrid` 약 5.443초,
  `emitSelectionChanged → redrawActionGrid` 약 6.410초
- simulation `advanceWorldTick`: 약 0.881초. 이 조치에서는 simulation 정책·규칙을 최적화하지 않는다.

## 적용한 변경

1. terrain chunk bake와 fog chunk redraw는 `clear()` 뒤 한 번의 `beginDraw()`/`endDraw()` batch로
   수행한다. 실제 타일·명시 타일·source fog·fallback fog helper는 모두 `batchDraw()`만 사용한다.
   `finally`로 batch 종료를 보장하여 texture/descriptor 검증 실패 때도 열린 FBO가 남지 않는다.
2. fog visibility dirty mask는 16×16 tile chunk를 유지하고 source fog 경계 확장도 그대로 사용한다.
   정적 terrain RenderTexture만 32×32로 바꾼다. 따라서 60×60 K01 맵의 terrain FBO는 16개에서
   4개가 되지만 fog 갱신 단위는 커지지 않는다.
3. economy, magic-auto-use, selection HUD view를 직렬화 서명으로 비교한다. 최초 publication은 항상
   발생하고, 실제 resources/population/research/selection-order/entity state/queue/portrait/magic 값이
   달라질 때만 registry와 event를 갱신한다. scene create와 shutdown에서 서명을 초기화한다.

## 검증과 한계

- RenderTexture batch의 정상 및 예외 종료, 60×60 chunk 수, HUD 최초 발행·동일값 억제·중첩값 변경을
  순수 테스트로 고정한다. scene 계약 테스트는 `clear → batch`, batch-only helper 사용을 검사한다.
- 이 변경은 trace에서 보인 FBO bind/생성과 HUD 재구성의 구조적 원인을 제거하지만, 변경 후 같은
  환경에서 새 trace를 아직 기록하지 않았다. 그러므로 수치적 개선 폭이나 startup load 시간 개선을
  주장하지 않는다.
- elevation overlay는 기존처럼 별도 game object를 사용한다. 장시간의 최초 asset decode/업로드와
  실제 GPU/driver 특성은 이번 범위 밖이다.
