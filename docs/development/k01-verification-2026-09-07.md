# K01 제한 검증 기록 (2026-09-07)

이 기록은 K01 source result clock·latch·script completion과 v5 save compatibility의 제한 검증을
기록한다. **전체 원작 scheduler, source owner/death lifecycle, compositor parity와 자연
브라우저 full-playthrough를 주장하지 않는다.** 정적 source 근거는
[K01 result clock](../reverse-engineering/mechanics/k01-result-clock.md)과
[K01 mission result lifecycle](../reverse-engineering/mechanics/k01-mission-result-lifecycle.md)에
있고, product boundary는 [K01 scenario policy adapter](k01-scenario-policy-adapter.md)에 있다.

## 현재 구현 경계

- source runtime envelope는 v5다. v1/v2/v3 legacy shape와 v4 result shape는 version-specific
  migration으로 기존 footprint·occupancy history를 보존하면서 result namespace를 주입한다.
- policies.result.clockMilliseconds는 DWORD millisecond sample을 보존한다. local transport는
  real elapsed를 playback speed와 무관하게 누적하고 pause 중에도 clock을 진행하지만 accepted
  tick과 result commit은 보류한다. headless 24 Hz sample은 deterministic product adaptation이다.
- pure result kernel은 unsigned wrap, signed absolute INT32_MIN, zero-disabled timers, strict
  2000/2001 boundary, win-first order, beacon hero bypass와 distinct raw-tick cache를 검증한다.
- K0120 completion은 loaded/running flags +4/+8를 clear하고 scenario status는 running으로
  유지한다. 다음 accepted boundary가 result policy를 실행한다.
- source presence/hero checks는 generated flags와 ordered semantic liveness를 결합한 bounded
  projection이다. full native identity and scheduler semantics는 범위 밖이다.

## focused tests

    node --import tsx --test \
      packages/simulation/src/k01MissionResult.test.ts \
      packages/simulation/src/k01MissionResultPolicy.test.ts \
      packages/simulation/src/k01BeaconPolicy.test.ts \
      packages/simulation/src/k01ScenarioPolicy.test.ts \
      packages/simulation/src/k01SourceRuntimeProfile.test.ts \
      apps/game-client/src/session.test.ts \
      tools/imjinrok/campaign-mvp-audit.test.mjs

위 파일들은 전체 1,487개 테스트 게이트에 포함되어 통과했다. 독립 source parity/lifecycle vectors는
tools/imjinrok/k01-mission-result-parity.test.mjs와
tools/imjinrok/k01-mission-result-lifecycle.test.mjs에서 12/12를 통과한다.

## 전체 게이트

- pnpm test: 1,487/1,487, fail/cancelled/skipped 0
- pnpm typecheck: exit 0
- pnpm imjinrok:verify-static-analysis: exit 0
- git diff --check: 통과

## 제한 브라우저·transport QA

Root가 실제 browser-loaded production modules로 다음 controlled vectors를 확인했다.

1. class 76을 제거한 K01 world에서 LocalSessionTransport 4x update 50ms가 result clock 51ms를
   latch한다. pause를 wall-clock 2050ms까지 진행하면 clock은 2051ms가 되고, accepted step
   2051에서는 running을 유지하며 2052에서 defeat를 commit한다. 이 strict boundary는
   playback speed와 독립이다.
2. completed beacon은 native reinforcement 9개와 K0120 line 0을 열고, dialogue를 line 1로 수동
   진행한 뒤 quick-save/load해도 line 1을 보존한다. dialogue completion은 status를 running으로
   유지하고, 다음 simulation tick에서 victory를 한 번 commit하며 entity tick은 먼저 진행되지 않는다.
3. saved running K0120에 active-dialogue metadata가 없을 때 restore는 stale triggered id를
   지우고 K0120 line 0을 다시 queue한다. status와 source trigger는 running/1로 유지된다.
   이 경로는 incomplete presentation metadata recovery를 검증하는 controlled probe다.
4. 실제 v4 legacy save를 public normalizer로 읽으면 tick 101이 v5 clock 4209와 remainder
   1/3ms, failed K01 protect timer 2126, pending marker false로 변환된다. 다음 deterministic
   headless tick은 clock 4251로 만들고 tick을 101에서 증가시키지 않은 채 defeat를 commit하며,
   scenario-defeat event는 정확히 한 번이다.

/tmp/k01-result-v5-victory.png에는 victory overlay가 보이지만 background terrain이 noisy하고
UI가 겹쳐 있다. controlled module/UI state probe가 result behavior를 확인했고, 이 screenshot은
overlay와 visual limitation을 기록하는 자료로만 보관한다. visual correctness나 full browser parity의
근거로 사용하지 않는다. 자연스러운 전체 K01 플레이와 원본 presentation/compositor parity는 별도
미해결 범위다.
