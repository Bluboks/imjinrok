# K01 mobile occupancy update boundary

## 질문과 범위

K01 mobile 1×1 entity가 생성 뒤 action 1 update에서 이전 점유를 어떻게 해제하고, 목적지를 검사·기록하며,
이미 점유된 목적지에서 어느 분기를 타는지 확인한다. 이 문서는 create-return 이후의 첫 dispatcher edge만 다룬다.

## 분석·재현·구현 상태

- 분석 상태: `부분 범위 superseded` — action 1·movement commit·death/release의 bounded 결과는
  [K01 occupancy-owner transition](k01-occupancy-owner-transition.md)에서 정적 확정했다.
- 재현 상태: `후속 문서에서 완료`
- 구현 상태: `analysis-only-no-production-change`

생성 경로의 `FUN_0043ad30` mobile 1×1 write는 별도
[K01 증원 슬롯·정확 배치 정책](k01-reinforcement-placement-policy.md)에서 정적 확정·재현 완료다.
그 사실은 movement destination selection 또는 collision response를 확정하지 않는다.

이 문서의 기존 미확인 결론을 인용하지 말고 후속 문서의 source-bound vector와 unresolved 목록을
사용한다. scheduler 전체 순서와 generic/non-mobile alias는 여전히 미확정이다.

## 입력과 근거

- EXE: `original/imjinrok2/imjinrok2.exe`
- SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- 재현 추출기: `tools/imjinrok/extract-k01-mobile-occupancy-boundary.mjs`
- fixture: `analysis/fixtures/k01-mobile-occupancy-boundary.json`
- test: `tools/imjinrok/k01-mobile-occupancy-boundary.test.mjs`

검증한 함수 본체는 다음과 같다.

| 함수 | 범위 | 역할 범위 |
| --- | --- | --- |
| `FUN_0043c9c0` | `0x0043c9c0-0x0043d35f` | `WORD +0x1b0` action switch를 포함한 entity update dispatcher |
| `FUN_0043b2d0` | `0x0043b2d0-0x0043b4cd` | mobile mode predecessor의 prior-grid zero-store 후보 |
| `FUN_0043c300` | `0x0043c300-0x0043c9b1` | action 1 사이의 movement helper |
| `FUN_0043ad30` | `0x0043ad30-0x0043b2c0` | mobile mode occupancy writer |
| `FUN_00425b20` | `0x00425b20-0x004262df` | normal movement next-tile candidate·blocked branch |
| `FUN_0043ac50` | `0x0043ac50-0x0043ad21` | next-tile collision mask consumer |
| `FUN_004651b0` | `0x004651b0-0x00465206` | occupancy mask cell high-nibble clear helper |

관련 record field는 `BYTE +0x68` (mobile occupancy branch), `WORD +0x1b0` (action),
`WORD +0x1b6` (stored slot), `WORD +0x1ec/+0x1ee` (mask producer/consumer raw input), `BYTE +0x1ed`
(constructor high-byte bit `0x10` → `+0x1ec` bit `0x1000` in the flag-bit-0x08-clear path),
`WORD +0x4d8/+0x4da` (normal movement next tile), `BYTE +0x1e3/+0x1e4` (footprint width/height)다.

## 확인된 제한 범위

`FUN_0043c9c0` action 1 case는 다음 순서의 call을 가진다.

1. `0x0043cdac → FUN_0043b2d0`
2. `0x0043cdb3 → FUN_0043c300`
3. `0x0043cdba → FUN_0043ad30`

`FUN_0043b2d0`의 mobile branch에는 signed footprint extent와 bounds check 뒤 prior occupancy grid에
`WORD 0`을 쓰는 loop가 있다. 이후 `FUN_0043ad30` mode-1 writer는 bounds check 뒤 `WORD +0x1b6`을
grid에 store하며, 그 store 경로에는 기존 occupant를 load/test하는 명령이 없다. 따라서 writer 자체는
existing slot rejection을 제공하지 않는 범위까지 확인했다.

같은 release loop는 `FUN_004651b0`을 호출하며, helper cell operation은 `WORD &= 0x0fff`다. 즉 entity
high-nibble occupancy mask를 prior footprint에서 제거한다. 이로써 action 1의 정적 순서는
`release owner/mask → move/check → re-add owner/mask`까지 닫혔다.

normal movement `FUN_00425b20`은 `+0x4d8/+0x4da` next tile과 `WORD(+0x1ee)|0x2000`를
`FUN_0043ac50`에 전달한다. `FUN_0043ac50`은 `0x00ae27e4` WORD footprint mask cell을 load해 supplied
mask와 AND하고 any-nonzero면 blocked를 반환한다. `FUN_0043ad30` mode-1 path는 같은 grid에
`WORD +0x1ec`을 OR한 뒤 slot grid `0x00ac2da4`에 `WORD +0x1b6`을 쓴다.

## 미확인 edge와 금지된 이식

첫 미확인 edge는 per-tick occupancy-grid clear와 scheduler ordering이다. next-tile mask producer/consumer는
보이지만, grid clear lifecycle, entity 간 update order, 그리고 class별 `+0x1ec/+0x1ee` 값의 의미가
닫히지 않았다. 그러므로 occupied destination에서 action/state failure·overlap·retry가 전체적으로 어떤
순서가 되는지는 아직 확정할 수 없다.

그러므로 현재 simulation의 collision/occupancy 정책은 원작 adapter가 아니다. 기본
`core:strict-footprint-reservation`은 모든 `blocksMovement` footprint를 simulation ground-contact
position에서 결정적으로 점유시키고, 같은 tick의 empty waypoint에는 stable entity order로 reservation을
부여하는 프로젝트 전용 정책이다. map의 stable `movementCollisionProfileId`는 이 admission/reservation
정책만 독립적으로 교체한다. K01-specific ID나 원작 slot grid를 simulation core에 넣지 않는다.

## 재현 벡터

- action 1 / mobile mode 1: `clear helper → movement helper → writer` call order
- in-bounds mode-1 occupied destination: writer store path에는 previous-slot reject branch가 없음
- action 1 / mobile mode 1: destination-coordinate update 및 failure branch는 `FUN_0043c300`부터 미확인

이 벡터는 source-bound byte anchor와 function artifact hash를 검사한다. 마지막 벡터는 재현된 원작
동작이 아니라, 현재 원작 일치 주장을 막는 경계다.

## 현재 구현과 다음 분석

현재 웹 simulation은 source parity가 아닌 generic policy를 `packages/simulation/src/collision.ts`에 둔다.
이를 원작 기반으로 승격하려면 grid clear lifecycle·scheduler order·class mask values와 blocked branch의
후속 state changes를 독립 fixture에서 재현해야 한다.
