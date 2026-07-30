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

## 병합 후 통제 측정

동일 조건의 cold-start 재측정을 수행했다. 두 번의 독립된 `agent-browser` session을 각각 새로 열고,
viewport를 1440×900으로 고정했다. 각 session에서 menu가 완전히 로드된 뒤 15초를 기다렸고, 같은
K01 진입 경로에서 `사전 브리핑 게임 시작` click부터 20초 대기 구간까지 trace를 기록했다.

| 측정 | commit / trace | `RunTask` | `GLES2 CheckFramebufferStatus` | `FireAnimationFrame` |
| --- | --- | --- | --- | --- |
| 기준 | `8d0fd7e`, `/tmp/k01-cold2-baseline-trace.json` | max 44,831.957ms, sum 65,560.6ms | 51회, sum 44,243.2ms, max 2,321.75ms | 70회, p50 6.99ms, p90 18.491ms, p95 20.792ms, p99 103.615ms, >16.7ms 9회, >50ms 2회 |
| 최적화 | 병합된 `dev`, `/tmp/k01-cold2-optimized-trace.json` | max 631.876ms, sum 20,289.9ms | 36회, sum 114.6ms, max 11.711ms | 172회, p50 7.539ms, p90 14.747ms, p95 18.417ms, p99 30.936ms, >16.7ms 13회, >50ms 0회 |

cache warm 효과를 통제하기 위해 최적화 측정 뒤 기준 commit도 같은 절차로 다시 실행했다. 이 순서 통제
기준 측정에서도 framebuffer는 51회, sum 32,724.2ms, max 1,835.694ms였고 `RunTask` max는
33,173.39ms였다. 따라서 최초 기준 run의 매우 큰 FBO 비용은 단순 cache warm 차이만으로 설명되기보다,
terrain/fog RenderTexture 생성·개별 draw 구조와 결합된 병목이라는 강한 구조적 증거다.

## 검증과 한계

- RenderTexture batch의 정상 및 예외 종료, 60×60 chunk 수, HUD 최초 발행·동일값 억제·중첩값 변경을
  순수 테스트로 고정한다. scene 계약 테스트는 `clear → batch`, batch-only helper 사용을 검사한다.
- 기준 trace는 main-thread click이 trace-stop workflow 자체를 막아 wall-time sample 수가 최적화 run과
  다르다. 그러므로 `RunTask` 합계나 animation-frame 분포를 직접 FPS 비율로 환산하지 않는다. 대신
  startup max와 framebuffer 비용의 반복·순서통제 결과를 이 변경이 겨냥한 구조적 원인에 대한 근거로
  사용한다.
- 위 절대 수치는 headless SwiftShader 환경의 값이며, 특정 사용자 GPU·driver·브라우저에서의 FPS 또는
  load time을 보장하거나 주장하지 않는다.
- elevation overlay는 기존처럼 별도 game object를 사용한다. 장시간의 최초 asset decode/업로드와
  실제 GPU/driver 특성은 이번 범위 밖이다.
