# K01 시나리오 목표 source policy adapter

## 범위와 원인

K01의 `build-beacon` 목표는 일반 목표 판정의 건물 수만으로 완료되지 않는다. 원본 봉화대
handler는 blocker가 없고 beacon trigger flag가 0인 accepted source update에서 qualifying
active completed beacon을 찾아 flag를 먼저 1로 기록한 뒤 K0120을 요청한다. 이 source 조건은
[K01 봉화대 완성·K0120 native trigger](../reverse-engineering/mechanics/k01-beacon-k0120-trigger.md)에
기록된 범위다.

웹 시나리오의 K0120 mission dialogue는 `build-beacon` objective-status trigger를 소비하고,
대화 종료 시 scripted victory를 요청한다. 따라서 hostile opening buildings가 남아 source
scan이 막힌 동안에는 semantic `beacon`이 있어도 목표와 후속 event를 pending으로 유지해야
한다. source policy가 flag를 1로 만든 뒤에만 목표 contract에 완료를 투영한다.

## 계약

`resolveK01SourceObjectiveCompletion(state, objectiveId)`는 다음 경계만 소유한다.

- source profile이 `k01:source-runtime`이고 objective가 `build-beacon`일 때만 동작한다.
- current K01 source envelope version 3을 기존 envelope validation boundary로 검증하고,
  `validateK01SourceRuntimeState`로 policy state를 좁힌다. malformed envelope/state는 예외를
  그대로 전달한다.
- `policies.beacon.triggerFlag === 1`만 `true`다. `0`, `2`, `65535`는 `false`다.
- resolver는 source state, scenario state, trigger latch를 쓰지 않으며 success count,
  loader result, trace 또는 source clock을 읽지 않는다.
- profile이 없거나 다른 profile/objective이면 `undefined`를 반환한다. 이때 generic objective
  판정이 계속 적용된다.
- objective completion prerequisites가 먼저 평가된다. 이미 `completed`인 objective나
  이미 기록된 dialogue/event를 이 adapter가 다시 해석하거나 수정하지 않는다.

## 재현 벡터와 저장

canonical K01 world에서 completed beacon event를 추가한 뒤 한 tick을 진행하면 hostile
building blocker 때문에 flag가 0이고 `build-beacon`과 legacy reinforcement event가
pending이다. hostile structures를 `removeUnitFromWorld`로 제거하고 다음 tick을 진행하면
flag가 1, native reinforcement가 9개, objective가 completed, legacy event가 executed가
된다. mission dialogue의 선언된 objective-status trigger는 이 actual objective state로
만족하며, scripted scenario는 dialogue가 끝날 때까지 running이다. JSON save/load 뒤 두
번째 tick에도 native unit 중복은 없다.

source state와 objective가 서로 일치하는 save는 이 경계를 그대로 round-trip한다. 과거 save가
이미 objective를 completed로 기록했지만 source trigger나 dialogue event는 기록하지 않은
불일치 상태라면, bounded adapter는 이를 자동 migration하지 않는다.

source profile이 없는 `build-building` 목표와 K01의 다른 objective는 기존 generic 판정을
사용한다. source flag가 1이어도 completion prerequisites가 충족되지 않으면 목표는 pending이다.

## 상태와 남은 범위

source trigger의 objective projection은 원본 trigger evidence에 근거한 의도적 웹 adaptation이다.
전체 source scheduler/clock, loader의 실제 script 결과, client presentation과 result timing은
이 문서와 adapter의 범위가 아니다.

Focused validation:

```text
node --import tsx --test packages/simulation/src/k01ScenarioPolicy.test.ts packages/simulation/src/simulation.test.ts
```
