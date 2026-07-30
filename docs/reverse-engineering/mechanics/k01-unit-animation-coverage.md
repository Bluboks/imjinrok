# K01 mission unit animation coverage guard

이 문서는 K01에서 실제로 initial map 또는 `K0120` scripted spawn으로 등장하는 **mobile** project kind를
한 번에 점검하는 회귀 guard의 범위를 설명한다. 개별 frame 의미, 원본 해시, 함수 주소와 재현 vector는
각 항목이 링크하는 기존 focused analysis가 유일한 출처다. 이 문서는 새 원작 동작을 주장하지 않는다.

## 범위와 상태

- 분석 상태: 기존 개별 focused analysis의 상태를 재사용한다. coverage guard 자체는 증거 등급을 올리지 않는다.
- 재현 상태: `packages/shared/src/k01UnitAnimationCoverage.test.ts`와
  `apps/game-client/src/render/k01UnitAnimationCoverage.test.ts`가 scenario-derived inventory, theme clip 존재와
  normal runtime idle/move/attack 선택을 확인한다.
- 구현 상태: source-proven state clip의 drift를 막는 project guard. 원본 tick, pivot, collision 또는 death
  lifecycle를 새로 이식하지 않는다.

`collectScenarioSpawnKinds(imjinrokK01Scenario)`는 initial `playerStarts`와 every `spawn-units` scripted
action을 읽는다. 그 결과 중 building category를 제외한 mobile kind는 다음 13개이며,
`K01_UNIT_ANIMATION_EVIDENCE`가 정확히 같은 집합이어야 한다.

| source class | project kind | source states guarded | focused source |
| ---: | --- | --- | --- |
| 7 | `villager` | idle, move, death | [Korean farmer core](k01-korean-farmer-core-frames.md) |
| 2 | `swordsman` | idle, move, attack, death | [classes 2/3/4 core](k01-core-unit-animation-states.md) |
| 4 | `archer` | idle, move, attack, death | [classes 2/3/4 core](k01-core-unit-animation-states.md) |
| 11 | `korean-monk` | idle, move, attack, death | [opening binding](k01-opening-unit-bindings.md) |
| 3 | `japanese-swordsman` | idle, move, attack, death | [classes 2/3/4 core](k01-core-unit-animation-states.md) |
| 12 | `japanese-gunner` | idle, move, attack, death | [normal reinforcement batch](k01-normal-reinforcement-animation-batch.md) |
| 13 | `japanese-samurai` | idle, move, attack, death | [samurai pilot](k01-samurai-animation-pilot.md) |
| 16 | `japanese-shrine-maiden` | idle, move, attack, death | [opening binding](k01-opening-unit-bindings.md) |
| 31 | `japanese-farmer` | idle, move, death | [Japanese farmer core](k01-japanese-farmer-frames.md) |
| 76 | `gwon-yul` | idle, move, attack, death | [hero pilot](k01-hero-animation-pilot.md) |
| 78 | `ryu-seong-ryong` | idle, move, attack, death | [hero pilot](k01-hero-animation-pilot.md) |
| 14 | `japanese-turtle-tank` | idle, move, attack; raw16 turn ring | [turtle pilot](k01-turtle-tank-animation-pilot.md) |
| 82 | `japanese-konishi` | idle, move, attack, death | [Konishi pilot](k01-konishi-animation-pilot.md) |

## 명시적 격리

이 guard는 source frame block이 존재한다는 이유만으로 product state를 늘리지 않는다.

- class 2/3/4와 class 12 state 2는 environment meaning/project policy가 아직 없다.
- class 7 state 4는 source-created default에서 idle fallback일 뿐 attack clip이 아니다. class 31 state 4는
  frame mapping 자체가 미확정이다.
- class 14의 creation-default destruction은 transient effect contract이며 generic death clip이 아니다.
- source-proven death clips는 현 simulation의 terminal visual lifecycle이 아직 없으므로 normal runtime
  idle/move/attack selector에서 제외한다.

이러한 격리는 이미지 순서나 화면 인상으로 해제하지 않는다. 새 static evidence와 independent vector가
생긴 뒤에만 matrix를 변경한다.

## 실행

```bash
node --import tsx --test packages/shared/src/k01UnitAnimationCoverage.test.ts apps/game-client/src/render/k01UnitAnimationCoverage.test.ts
```

이 작업은 `themes.ts` 또는 generated sprite audit의 provenance를 바꾸지 않는다. 따라서 final
`analysis/generated/sprite-mapping-audit.json` 재생성은 이 branch에서 수행하지 않는다.
