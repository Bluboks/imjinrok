# K01 제한 검증 기록 (2026-09-06)

> 이 기록은 2026-09-06 historical checkpoint다. K01 result clock·latch·v5 migration과 최신
> controlled browser QA는 [2026-09-07 검증 기록](k01-verification-2026-09-07.md)을 기준으로 한다.

이 기록은 현재 draft의 K01 source trigger·save migration·이동 대기 수정에 대한 범위 한정
검증을 기록한다. **K01 전체 원작 일치와 전체 브라우저 검증은 통과하지 않았다.** 원본 raw
근거의 단일 출처는 [K0120 trigger 분석](../reverse-engineering/mechanics/k01-beacon-k0120-trigger.md)과
[source entity admission 분석](../reverse-engineering/mechanics/k01-source-entity-runtime-admission.md)이다.

## 원본 근거와 차분 재현

정적 입력은 `original/imjinrok2/imjinrok2.exe`
(`25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`)와
`original/imjinrok2/script/K0120`
(`6d9b8043f4634c8b8f1696e6d9b49b17dff99b53280b9934c1dfbd998be6054d`)다. 핵심 CFG는
`FUN_0048a5c0` (`0x0048a5c0-0x0048a878`, 181 instructions/32 blocks), raw-relation blocker
`FUN_00487fa0` (`0x00487fa0-0x0048800f`), descriptor creator `FUN_00488420`
(`0x00488420-0x004884b5`)와 selector-5 writer `FUN_00442ca0`
(`0x00442ca0-0x00442d95`)다. source는 blocker가 0이고 flag `WORD 0x008438dc`가 0일
때만 1,200개 record를 검사하며, class `0x34`·progress `0x64`·owner/relation·active/health
조건을 통과한 match마다 아홉 descriptor를 `(55,53)` 주변에 생성한다.

`tools/imjinrok/k01-runtime-parity.test.mjs`는 실행 전에 위 두 입력의 SHA-256과 extractor의
정적 evidence/reproduction 상태를 다시 검사한다. 이어서 `runK01BeaconTrigger`와
`advanceK01BeaconPolicy`를 다음 다섯 벡터에서 비교한다.

| 벡터 | 비교한 결과 | 상태 |
| --- | --- | --- |
| blocker nonzero | flag, return, match count, no native creation | 통과 |
| idle + loader `0` | flag, return, match count, native 9개 identity·순서·좌표 | 통과 |
| idle + loader `1` | flag, return, match count, native 9개 identity·순서·좌표 | 통과 |
| script busy + post-state `4` | flag, return, match count, native 9개 identity·순서·좌표 | 통과 |
| initial flag `1` | scan 생략, flag/return, no native creation | 통과 |

이 비교는 source slot identity, raw clock 단위, `ownerSignedByte=-1`와 제품 relation `0`의
의미를 투영에서 제외한 bounded adapter 검증이다. 따라서 이 표를 전체 원작 일치 판정으로
사용하지 않는다. 이동 대기 회귀는 두 제품 pathfinder를 각각 감싼 registry provider로
검증하며, mobile obstruction 상태에서 40 tick 동안 추가 path search가 없고 JSON snapshot
round-trip 뒤 blocker 제거 시 목적지에 도달하는지 확인한다.

## 현재 제품 검증

- `pnpm test`: 1,463/1,463 통과, fail/cancelled/skipped 0.
- `pnpm typecheck`: 통과.
- `pnpm imjinrok:verify-static-analysis`: 통과.
- `node --import tsx --test tools/imjinrok/k01-runtime-parity.test.mjs`: 통과.
- legacy v3 beacon save를 공개 session normalizer로 읽어 state v4와 static-confirmed 3×3으로
  변환하고, foreign owner·policy/cursor·allocator state를 보존한 뒤 release 시 새 footprint만
  정리하는 focused tests가 통과했다. 이미 v4인 state는 재변환하지 않는다.
- controlled product QA에서 K01 opening→completion→hostile building removal→아홉 증원→save/load→
  dialogue victory callback 순서를 확인했다. 이는 자연 플레이나 원본 화면 pixel parity가 아니다.
  fresh opening과 save/load 뒤 화면의 제한 자료는 `/tmp/k01-fresh-visual.png`와
  `/tmp/k01-fresh-after-load.png`에 있다. paused victory screenshot은 pixel 근거로 사용하지 않는다.

## 남은 차이와 다음 통과 조건

- 원본 공통 result timer resolver에 정적으로 보이는 `0x7d0` strict timer는 제품에서
  `2000` simulation ticks로 사용되며 `2001` tick에서 defeat가 된다. 이를 보호 영웅 전용
  raw gate나 초 단위 mapping으로 해석할 근거는 없다.
- 원본 K0120 match의 direct `AX=1` return과 제품의 dialogue-driven `forceScenarioResult` 승리
  callback은 연결 경계가 다르다. 이 차이를 원작 일치로 표시하지 않는다.
- source scheduler/update 단위, raw owner/player 의미, full movement/death/result lifecycle,
  맵·타일·스프라이트 전체 mapping과 자연 브라우저 K01 시나리오는 아직 미해결이다.
- 다음 통과 조건은 raw clock/identity projection을 별도 근거로 닫고, source trigger와 result
  presentation의 연결을 독립 재현한 뒤 브라우저 자연 플레이를 재검증하는 것이다.
