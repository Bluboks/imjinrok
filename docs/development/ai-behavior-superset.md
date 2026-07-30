# AI 행동 메커니즘 superset 경계

## 목적

이 문서는 기존 simulation의 유휴 전투, 적 플레이어 운영, player-global 자동 능력을 모드 가능한
정책 경계로 분리한 제품 설계를 기록한다. 원본 일치 주장은 각 원본 분석 문서의 좁은 범위를 넘지
않는다.

## 안정적 확장 계약

- `IdleCombatPolicy`는 unit snapshot의 선택적 `idleCombatPolicyId`로 선택된다. 등록되지 않았거나
  예전 snapshot에 없는 id는 `builtin-mobile-aggro-stationary-guard`로 안전하게 돌아가, 이동 유닛의
  aggro와 고정 유닛의 사거리 guard라는 기존 동작을 유지한다.
- `SkirmishAiStrategy`는 controller options의 `strategyId`로 선택된다. 기본
  `builtin-balanced`는 기존 경제·생산·수리·방어·공격과 난이도 tuning을 그대로 사용한다. 모드는
  `state`, `playerId`, tuning, command boundary를 받는 완전한 `updatePlayer` callback을 등록할 수
  있다. 중복 및 알 수 없는 id는 조용히 대체하지 않고 오류로 중단한다.
- `AutoAbilityPolicy`는 unit kind binding 또는 선택적 `autoAbilityProfileId`로 선택된다. 모드
  callback은 snapshot에 저장되지 않으며, snapshot에는 안정적인 id만 남는다. 등록되지 않은
  auto-ability id는 자동 능력을 실행하지 않는다.

레지스트리 등록 함수는 해제 함수를 반환한다. 테스트와 mod unload는 그 함수를 호출해 전역
등록 누수를 피해야 한다.

## player-global 자동마법

`PlayerState.magicAutoUseEnabled`는 선택과 독립적인 직렬화 가능 설정이다. 값이 없거나 `false`면
비활성이다. `set-magic-auto-use` simulation command만 이 값을 바꾸며, command는 해당 player의
존재와 boolean 입력을 검증한다. built-in AI는 처음 자신을 갱신할 때 값이 **아직 없는 경우에만**
자동사용을 켠다. 따라서 이후의 명시적 해제는 다음 AI update에서 되돌아가지 않는다.

## K01 유성룡 bounded adapter

`k01-ryu-seong-ryong-action-40`만 이번 slice에서 구현한다. 이는
[K01 유성룡 class 78 자동 마법 경로](../reverse-engineering/mechanics/k01-ryu-auto-magic-path.md)의
action-40 owner transfer와 strict HP boundary를 제품에 투영한 **부분 이식**이다.

- player-global setting이 켜져 있고 유성룡이 현재 `attack-unit` 적 target을 가질 때만 고려한다.
- project tick `% 3 === 0`을 cadence로 쓴다. 이는 source의 global LCG cadence와 같다고 주장하지
  않는 명시적 project clock adaptation이다.
- target은 positive HP, 적 소유, 비건물이고 `currentHp < trunc(maxHp * 2 / 3)`여야 한다.
- 70 mana를 소비하고 target 소유자를 caster player로 옮긴 뒤 target의 이동·명령 상태를 지운다.
  그 combat update의 일반 공격은 생략한다.
- 유성룡의 70/70 mana pool은 한 번의 adapter cast를 위한 프로젝트 값이며 원본 stat recovery가
  아니다. source raw flag/registry/team prerequisite에 해당하는 제품 필드가 없어 위의 좁은 gate만
  사용한다.

action 59/subtype 16과 나머지 여덟 class의 효과는 구현하지 않는다. 자동 능력 off, cadence miss,
지원하지 않는 target/profile은 기존 전투를 그대로 실행한다.
