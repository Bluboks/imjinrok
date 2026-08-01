# K01 source entity runtime·admission (A02)

## 상태와 경계

- 분석 근거: `정적 확정`인 1,200-slot allocator·generation·handle validity·active-list release와
  owner-grid write/clear의 좁은 범위만 사용한다.
- 재현: production state v2의 allocator age/tie/wrap, generation wrap, stale handle, swap-last
  release, source/adapted footprint, collision/OOB 및 save/load vectors로 고정한다.
- 구현: A01 profile envelope를 v2 `entityRuntime`/`occupancy` 계층으로 확장했다. K01 opening seed와
  명시적 completed-construction adapter만 제공하며 K0120 scan, trigger flag, script/native
  reinforcement/result/UI는 이 계층에 연결하지 않는다.

`ConstructionCompleted` 시점에 class 52 봉화대를 admission하는 것은 원본에서 source record가 더
일찍 존재했을 가능성을 보존하지 못하므로 `intentional-adaptation` timing classification을 호출자가
명시해야 한다. 이 문서는 그 event를 소비하거나 원본 trigger를 주장하지 않는다.

## source 근거

| 입력 | SHA-256 | 사용 범위 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | allocator/record/handle/active-list raw 근거 |
| `original/imjinrok2/stagemap/k01.map` | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` | opening source record order·좌표 |
| `analysis/generated/entity-type-catalog.json` | `485344664b278c97a4ceed0756832abadbf2a71bd4a997b117b85c336d620708` | original class identity·footprint 범위 |

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

## v2 schema와 실패 경계

`entityRuntime`은 generation counter, 1,200-entry active table, active-list order, 1,200-entry
signed reuse-age table, slot-sorted records를 단일 SSOT로 보존한다. 각 record는 static evidence가
닫은 signed coordinate, owner/relation raw signed byte, class byte, progress byte, signed health,
semantic ID, source-adapter order index, slot/generation handle 및 footprint evidence를 가진다.
`occupancy.ownerSlots`는 map 크기와 일치하는 WORD cell 배열이다. malformed/missing/duplicate/OOB,
slot 0, stale generation, collision, full capacity는 설명적 예외로 실패한다.

A01 v1은 class/owner/coordinate/semantic mapping이 없으므로 빈 `entities`만 v2로 명시적으로
이동한다. non-empty v1 save는 필드를 추측하지 않고 거부한다.

## 검증

```sh
node --import tsx --test \
  packages/simulation/src/k01SourceRuntimeProfile.test.ts \
  packages/simulation/src/k01SourceEntityRuntime.test.ts
```

전체 simulation/full workspace test와 typecheck/build는 통합 branch의 최종 gate에서 재실행한다.
