# K01 일본 사무라이 핵심 애니메이션 파일럿

원본 내부 class 13 일본 사무라이의 상태 8 idle, 상태 1 일반 이동, 상태 4 target-driven 공격, 상태 7 health-zero 사망이 어느 SPR 슬롯·프레임·8방향·mirror를 선택하는가?

## 상태

- 분석: `정적 확정`
- 재현: `재현 완료`
- 구현: `이식 완료` — generic theme의 `japanese-samurai` visual에만 반영했다.

확정 범위는 class 13의 생성 기본 flags에서 선택되는 네 normal animation path의 SPR slot,
phase→frame, 8방향과 mirror다. 프로젝트 FPS와 pivot은 잠정 표시 적응이며 원본 시간·좌표
계약이 아니다. simulation 행동·전투 수치·사망 수명은 변경하지 않았다.

## 입력과 독립 검증

| 입력 | SHA-256 | 정적 계약 |
| --- | --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` | class/state dispatch, initializer, producer/consumer bytes |
| `char/horseswordj1.spr` | `f08dba883a1e5686383d05882d2c0f21c2bb52b6b2c2bb00e4d806f41ac9fdfa` | slot 117, pointer cell `0x004bc268`, 80×80, 90 frames |
| `char/horseswordj2.spr` | `d3d3ec5f0ef9d4b3237182f8dd34baf532437a4f17622b6995877702d3576a62` | slot 118, pointer cell `0x004bc26c`, 80×80, 70 frames |
| `analysis/generated/imjinrok2/functions.json` | EXE source hash 일치 | 세 관련 canonical function body와 instruction count |
| `analysis/generated/imjinrok2/jump-tables.json` | EXE source hash 일치 | class 13 initializer와 attack wrapper case |

독립 추출기는
[`extract-k01-samurai-animation-pilot.mjs`](../../../tools/imjinrok/extract-k01-samurai-animation-pilot.mjs),
focused 테스트는
[`k01-samurai-animation-pilot.test.mjs`](../../../tools/imjinrok/k01-samurai-animation-pilot.test.mjs)다.
원본 SPR와 canonical analysis가 stale·missing·tampered이면 크게 실패한다. 새 seed는 필요하지
않았다.

## class 13 설정과 상태 경로

타입 레코드 `0x00883eec`는 class 13 `일본 사무라이`, 생성 flags
`0x00089005`다. `0x004292b3`의 class switch는 case 13을 `0x0042a492`로 보낸다.
initializer는 다음 값을 쓴다.

| 원본 상태 | 의미 | slot/source | start | stride | phase 수 | 전체 사용 범위 |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 8 | idle | 118 / `horseswordj2.spr` | 0 | 8 | 8 | 0..39 |
| 1 | 일반 이동 | 117 / `horseswordj1.spr` | 0 | 8 | 8 | 0..39 |
| 4 | target-driven 공격 | 117 / `horseswordj1.spr` | 50 | 8 | 8 | 50..89 |
| 7 | health-zero 사망 | 117 / `horseswordj1.spr` | 40 | 0 | 8 | 40..47 |

주요 byte anchor는 `0x0042a492`의 idle/move 설정, `0x0042a4bb`와
`0x0042a4fa`의 death 첫·마지막 facing, `0x0042a508`의 attack 설정이다.

- idle: `0x0043c344`가 상태 8과 phase를 만들고, flags bit `0x08`이 clear일 때
  `0x0041d870 → 0x0041d880` normal consumer를 탄다.
- 이동: `0x00425b20`이 상태 1을 만들며, `0x0041efa0`에서 mask
  `0x80000008`이 clear인 normal path가 slot/direction을 소비한다.
- 공격: `0x00423837`이 상태 4 phase를 만든다. `0x0041e385` attack wrapper switch의
  case 13은 `0x0041e3a0`이며, flags `0x80000000` clear와 WORD `+0x144 != 0`을
  모두 만족해야 `0x0041e200` normal consumer로 간다. 영웅 전용 class shortcut을
  재사용한 결론이 아니다.
- 사망: signed health-zero 경로 `0x0043ccf6` 뒤 action 6 handler의
  `0x004236a4`가 상태 7을 만들고 `0x0041d700`이 configured slot을 소비한다.

생성 flags에서는 상태 1 mask `0x80000008`, alternate movement eligibility
`0x04000000`, idle `0x08`, attack `0x80000000`이 모두 clear다. replay helper는 scoped
normal consumer 대신 다른 consumer를 고르는 gate-bit 패턴만 거부한다. 그 밖의 runtime flag
mutation과 class 13 도달 조건은 이 단위에서 닫지 않았다.

## 8방향, phase와 mirror

phase는 모든 상태에서 `0..7`이다. 표의 frame은 각 방향의 phase 0..7 범위다.

| facing | raw direction | `(dx,dy)` | mirror | idle/move | attack | death |
| --- | ---: | --- | --- | --- | --- | --- |
| s | `1` | `(0,1)` | 아니오 | 0..7 | 50..57 | 40..47 |
| sw | `5` | `(-1,1)` | 아니오 | 8..15 | 58..65 | 40..47 |
| w | `4` | `(-1,0)` | 아니오 | 16..23 | 66..73 | 40..47 |
| nw | `20` | `(-1,-1)` | 아니오 | 24..31 | 74..81 | 40..47 |
| n | `16` | `(0,-1)` | 예 | 16..23 | 66..73 | 40..47 |
| ne | `80` | `(1,-1)` | 예 | 8..15 | 58..65 | 40..47 |
| e | `64` | `(1,0)` | 예 | 0..7 | 50..57 | 40..47 |
| se | `65` | `(1,1)` | 아니오 | 32..39 | 82..89 | 40..47 |

death는 stride 0이라 모든 facing이 같은 40..47 frames를 쓰되 n/ne/e의 mirror 계약은
같이 유지된다.

## 재현 벡터와 theme 이식

focused 테스트는 다음을 hard-code한다.

- 정상: class/type record/flags, 두 SPR slot·pointer cell·path·hash·header, 두 jump-table case,
  네 initializer와 producer/consumer anchor
- 방향·경계: 네 상태 × 8방향 × phase 0..7 전체 frame과 mirror
- 실패: phase `-1/8`, 알 수 없는 direction, WORD 폭 위반, out-of-scope consumer를 고르는
  flag gate, attack phase count 0, 두 SPR 및 canonical function/jump-table tamper

`horseswordj2.spr` 70 frames를
`apps/game-client/public/assets/themes/default/entities/japanese-samurai`에 전부 변환했다.
manifest SHA-256은
`8dc00db2fd44406db9d03817d5c76bf0ff29fd90d88c8282c795bd809e55cb46`다.
theme은 idle에 `horseswordj2`, move/walk·attack·death에 `horseswordj1`을 사용한다.
`staticallyRecoveredDirectionalClips`로 원본 frame/direction/mirror를 옮겼지만, FPS 4/8과
80×80 render size·pivot `(40,72)`은 표시를 위한 잠정 프로젝트 적응이다.

sprite audit는 `japanese-samurai`의 identity와 이 다섯 generic state의 frame/direction만
`static-proven-core-state-frames`로 승격한다. `japanese-turtle-tank`와
`japanese-konishi`는 계속 identity/source base-frame still만 확정이다.

## 남은 불확실성

- 원본 phase/update 빈도의 초 단위 환산과 프로젝트 24 Hz/FPS exact mapping
- 원본 pivot·render scale
- hit reaction과 scoped 밖 animation states
- 생성 뒤 flags mutation이 class 13에 도달하는 전체 조건
- 사망 표시 lifetime과 프로젝트 entity removal 정책의 exact mapping
- 전투 stats, 행동, owner 의미, 증원 최종 배치

따라서 이 구현은 generic theme의 재사용 가능한 visual mapping이며, 원본 전투나 simulation
정책의 필수 dependency가 아니다.
