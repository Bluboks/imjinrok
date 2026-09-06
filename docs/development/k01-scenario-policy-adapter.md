# K01 시나리오 source policy adapter

## 범위와 원인

K01의 `build-beacon` objective는 generic building count만으로 완료되지 않는다. 원본 봉화대
handler는 blocker와 trigger flag를 확인한 뒤 qualifying completed beacon을 source record에서
찾아 flag를 쓰고 K0120 script context를 진행한다. 이 bounded source path는
[K01 봉화대 완성·K0120 native trigger](../reverse-engineering/mechanics/k01-beacon-k0120-trigger.md)와
[K01 result clock](../reverse-engineering/mechanics/k01-result-clock.md)에 기록되어 있다.

웹 포트는 이 source boundary를 K01 source runtime profile v5와 연결한다. `triggerFlag === 1`을
`build-beacon` objective completion으로 투영하고, K0120 native effect를 한 번 소비한다. K0120
dialogue가 끝나면 `completeK01MissionScript(world, "script/K0120")`가 running/loaded/running
flag를 검증하고 `+8`, `+4`를 모두 지운다. 이 호출은 scenario victory를 직접 쓰지 않는다. 다음
accepted simulation boundary에서 result policy가 beacon/direct-win 또는 matured loss 우선순위를
평가한다.

## source-backed 경계

`resolveK01SourceObjectiveCompletion(state, objectiveId)`는 다음 경계만 소유한다.

- source profile이 `k01:source-runtime`이고 objective가 `build-beacon`일 때만 동작한다.
- 현재 source runtime envelope는 v5다. `policies.result`는 `policies.beacon`과 함께
  strict clone/validation/save/load를 통과해야 하며, beacon-only legacy policy shape는 migration
  과정에서 result namespace를 주입한다.
- `policies.beacon.triggerFlag === 1`만 `true`다. `0`, `2`, `65535`는 `false`다.
- resolver는 source state, scenario state, trigger latch를 쓰거나 수정하지 않으며 success count,
  loader return, trace 또는 source clock을 읽지 않는다.
- profile이 없거나 다른 profile/objective이면 `undefined`를 반환하고 generic objective 판정이
  계속 적용된다. malformed source state는 owning validation boundary의 예외를 유지한다.
- objective prerequisites가 먼저 평가된다. 이미 `completed`인 objective나 consumed dialogue/event를
  이 adapter가 다시 해석하거나 수정하지 않는다.

K01 source result policy는 generic scenario evaluation보다 accepted tick 시작에서 먼저 실행한다.
general presence, beacon return, class 76, class 78 hero liveness, timer와 distinct raw-tick cache는
bounded source projection으로 연결되며, K01 generic evaluator는 primary defeat, objective failure
defeat, auto-victory를 독립적으로 commit하지 않는다. Manual surrender/force-result는 명시적인
사용자 action으로 유지한다.

## clock와 product adaptation

원본 result clock은 `timeGetTime`이 반환한 DWORD milliseconds다. production은 이를
`policies.result.clockMilliseconds`에 보존하고 initial product epoch `1`에서 시작한다.

- LocalSessionTransport가 frame마다 real elapsed milliseconds를 한 번 sample하고, playback speed와
  무관하게 result clock에 누적한다.
- app pause 동안 clock은 계속 누적하지만 accepted simulation tick과 result commit은 멈춘다. offline
  save duration은 복원하지 않는다.
- headless `advanceWorldTick`는 fractional remainder를 보존하는 deterministic `1000/24` ms
  adapter를 사용한다. 이는 native fixed-Hz claim이 아니다.
- resolver는 zero sentinel을 disabled로 취급하고 unsigned DWORD subtraction 뒤 signed absolute
  idiom을 적용한다. `2000`은 immature, `2001`은 mature이며 win timer를 먼저 평가한다.
- source raw global tick, native accepted-update scheduler, full owner/reference identity와 full
  result presentation/compositor parity는 이 adapter의 근거가 아니다.

## beacon·script lifecycle

Canonical K01 world에서 completed beacon event를 추가하고 opening hostile blocker를 제거한 뒤
accepted update를 진행하면 source flag가 1이 되고 native reinforcement 9개가 생성된다. 기본
successful load는 script busy `+4 = 1`과 post-state `+8 = 1`을 기록한다. loader return `0`도
native start call trace를 남기지만 unloaded context이므로 `+8`은 쓰지 않는다. busy context에서는
load/start mutation을 건너뛰고 native effect trace는 유지한다. 명시적 raw `scriptPostState`
option은 differential-test override로 남긴다.

`+4/+8`이 설정된 동안 dialogue는 running 상태다. Completion은 두 flag를 지우고 scenario
status를 running으로 둔다. save/load round trip은 이 v5 result와 script state를 보존한다. restore된
running K0120 source state에 active dialogue metadata가 없으면 scene은 stale triggered id를 지우고
K0120을 한 번 다시 queue한다. 이는 presentation metadata가 불완전한 save를 위한 controlled
recovery다.

## legacy save boundary

v1/v2/v3/v4 legacy envelope는 각 historical shape에 맞는 migration을 거쳐 v5 result namespace를
받는다. v3 계열 beacon footprint 변환은 기존 owner history를 보존한다. world-aware initializer는 public normalization, transport restore, result-policy entry,
script completion에서 필요한 경우 한 번 실행한다.

- legacy `world.tick`을 초당 24 simulation tick 기준 epoch-1 elapsed milliseconds로 변환하고
  rational remainder를 보존한다.
- 실제 status가 `failed`이고 유효한 `failedAtTick`을 가진 경우에만 첫 K01 protect timer를
  backdate한다.
- post-state가 `0`인 running legacy K0120 trigger는 loaded/running `+4/+8`로 적응해 restore가
  dialogue presentation 전에 승리하지 않도록 한다. terminal save는 terminal status와 flag를
  유지한다.
- current v5 clock, timer, flag와 pending marker는 변경하지 않는다.

이는 saved production state를 위한 compatibility adaptation이며 original save format이나 full
script presentation을 복원했다는 주장이 아니다.

## 재현 벡터와 검증

Canonical vectors는 blocker wait, native record 9개의 trigger success, save/load, K0120 completion
뒤 next-boundary victory, beacon completion보다 먼저 처리되는 timer expiry, zero-disabled/wrapped
timer, signed `INT32_MIN`, fractional elapsed sample, unscaled result clock을 사용하는 local 4x
playback, deferred commit을 포함한 pause accumulation, v4 migration/backdating, malformed legacy
input, terminal-world immutability를 포함한다.

```sh
node --import tsx --test \
  packages/simulation/src/k01MissionResult.test.ts \
  packages/simulation/src/k01MissionResultPolicy.test.ts \
  packages/simulation/src/k01BeaconPolicy.test.ts \
  packages/simulation/src/k01ScenarioPolicy.test.ts \
  packages/simulation/src/k01SourceRuntimeProfile.test.ts \
  apps/game-client/src/session.test.ts \
  tools/imjinrok/campaign-mvp-audit.test.mjs
```

구현은 generic/K02 result behavior, full native scheduler parity, raw owner/player semantics, complete
source death/release lifecycle, native result presentation/compositor parity를 의도적으로 이 adapter
범위 밖에 둔다.
