# K01 source entity runtime·admission (A02)

## 상태와 경계

- 분석 근거: `정적 확정`인 1,200-slot allocator·generation·handle validity·active-list release와
  owner-grid write/clear의 좁은 범위만 사용한다.
- 재현: production state v3의 allocator age/tie/wrap, generation wrap, stale handle, swap-last
  release, source/adapted footprint, collision/OOB 및 save/load vectors로 고정한다.
- 구현: A01 profile envelope를 v3 `entityRuntime`/`occupancy` 계층으로 확장했다. K01 opening seed와
  명시적 completed-construction adapter는 T01 K0120 policy가 source SSOT로 소비하며, 일반
  entity admission과 native 1×1 overwrite admission의 경계를 분리한다. dialogue/result/UI는
  이 계층에 연결하지 않는다.

`ConstructionCompleted` 시점에 class 52 봉화대를 admission하는 것은 원본에서 source record가 더
일찍 존재했을 가능성을 보존하지 못하므로 `intentional-adaptation` timing classification을 호출자가
명시해야 한다. T01 policy는 이 adapter를 accepted-update event cursor와 함께 호출하며, 이는
원본 trigger timing을 주장하지 않는 명시적 프로젝트 adaptation이다.

## source 근거

| 입력 | SHA-256 | 사용 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | allocator/record/handle/active-list raw 근거 |
| `original/imjinrok2/stagemap/k01.map` | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` | opening source record order·좌표 |
| `analysis/generated/entity-type-catalog.json` | `4cce8fd314848556433c5fd98263893919049b6be6a7a7e75988f628079c54da` | original class identity·footprint 범위 |

핵심 함수와 필드는 [source handle lifecycle](k01-source-handle-lifecycle.md)의 `0x00483a60`,
`0x00483c50`, `0x00483aa0`, `+0x1b6/+0x1b8`, signed `+0x3e`, 그리고
[occupancy owner transition](k01-occupancy-owner-transition.md)의 `0x00ac2da4` WORD owner grid와
action-1 clear/write 순서를 따른다. active table은 WORD slot table(1..1199; slot 0 failure),
reuse age는 signed WORD, generation은 WORD다. owner cell에는 slot WORD만 저장하며 generation을
섞지 않는다.

K01 opening semantic IDs와 source order는 `packages/shared/src/scenarios.ts`의
`k01SourceOpeningAdapter`에서 파생한다. 건물의 source-confirmed footprint는
[opening footprint anchor](k01-opening-footprint-anchor.md)의 범위만 사용한다. mobile/hero의 1×1은
원본 전체 footprint를 확정한 것이 아니라 `project-adaptation`이다.

## v3 profile schema와 실패 경계

`entityRuntime`은 generation counter, 1,200-entry active table, active-list order, 1,200-entry
signed reuse-age table, slot-sorted records를 단일 SSOT로 보존한다. 각 slot에는 현재 record가
최대 하나만 존재하며, release 뒤 retired record를 재사용할 때는 새 generation과 semantic/source
mapping으로 같은 배열 entry를 교체한다. 각 record는 static evidence가
닫은 signed coordinate, owner/relation raw signed byte, class byte, progress byte, signed health,
semantic ID, source-adapter order index, slot/generation handle 및 footprint evidence를 가진다.
`occupancy.ownerSlots`는 map 크기와 일치하는 WORD cell 배열이다. malformed/missing/duplicate/OOB,
slot 0, stale generation, collision, full capacity는 설명적 예외로 실패한다. 일반 admission은
collision-strict를 유지하고, 정적 원본 계약이 닫힌 K0120 native 1×1 admission만 reservation의
reuse-age 결과를 보존한 채 OOB를 건너뛰며, 성공 시 기존 owner cell을 후행 descriptor가 덮어쓴다.
활성 record의 semantic ID/source index만 현재 mapping으로 취급해 각각 전역 유일해야 하며,
inactive retired record의 stale fields는 slot당 하나의 record invariant 아래 보존할 수 있다.

A01 v1은 class/owner/coordinate/semantic mapping이 없으므로 빈 `entities`만 v3로 명시적으로
이동한다. A02 v2는 general `entityRuntime`/`occupancy`를 보존하고 빈 beacon policy namespace를
추가한다. non-empty v1 save는 필드를 추측하지 않고 거부한다.

## 검증

```sh
node --import tsx --test \
  packages/simulation/src/k01SourceRuntimeProfile.test.ts \
  packages/simulation/src/k01SourceEntityRuntime.test.ts
```

전체 simulation/full workspace test와 typecheck/build는 통합 branch의 최종 gate에서 재실행한다.

## T01 K0120 policy contact

`packages/simulation/src/k01BeaconPolicy.ts`는 이 general runtime을 유일한 source SSOT로
재사용한다. accepted world update에서 먼저 `ConstructionCompleted` sequence를 policy cursor로
exactly-once 소비하고, class 52 beacon은 `admitCompletedK01ConstructionRuntime`의 명시적인
`intentional-adaptation` timing으로 admission한다. 그 다음 source record를 slot `1..1199`
오름차순으로 읽으며 active-table/active/positive-health, raw owner-relation, class `52`, progress
`0x64`를 모두 통과한 record만 match한다. blocker가 0이 아니거나 trigger WORD가 정확히 0이 아니면
scan을 건너뛴다.

정적 확정된 K0120 descriptor 9개는 `k01ReinforcementAdapter`의 class/owner/offset 순서를 그대로
사용한다. 일반 allocator의 strict admission과 별도로 `admitK01NativeSourceEntityRuntime`은
selection/reuse-age와 in-bounds activation/generation/mapping/table/list를 분리한다. OOB는
reuse-age만 남기고, slot 0은 즉시 descriptor loop를 중단하며, native 1×1 occupancy는 후행 owner로
overwrite한다. 각 failure는 policy trace에 남고 semantic unit은 만들지 않는다. script busy, loader
`0/1`, void start와 native descriptor effects는 서로 독립된 trace boundary다. loader 결과는
diagnostic outcome이지 trigger authority가 아니다. dialogue, objective, mission result와 source raw
global writes는 이 구현 범위에 없다.

K01의 legacy `k01-reinforcement-wave` scripted event는 K01 source profile에서만 consumed/no-op으로
처리하여 duplicate spawn을 막는다. generic worlds와 profile-absent scenarios는 이 policy 및
namespace를 생성하지 않는다.
