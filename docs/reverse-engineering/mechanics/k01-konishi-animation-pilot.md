# K01 일본 고니시 핵심 애니메이션 파일럿

원본 내부 class 82 일본 고니시의 상태 8 idle, 상태 1 일반 이동, 상태 4 target-driven 공격, 상태 7 health-zero 사망이 어느 SPR 슬롯·프레임·8방향·mirror를 선택하는가?

## 상태

- 분석: `정적 확정`
- 재현: `재현 완료`
- 구현: `이식 완료` — generic superset default theme의 `japanese-konishi` visual에만 반영했다.

확정 범위는 생성 기본 flags에서 선택되는 class 82 상태 8/1/4/7의 SPR slot,
phase→frame, grid 8방향과 mirror다. simulation, stats, 행동, owner와 생성·최종 배치
정책은 변경하지 않았다.

## 입력과 provenance

| 입력 | SHA-256/계약 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `char/generalj11.spr` | `eff3f8eb3a60c50ea6ac534d90e568bac415526a00f6ca2e287e00bfdf4bb03f`, 140×108, 49 frames |
| `char/generalj12.spr` | `914ea581e7ba8ad7d972e19f5089478de0391be1c79288a2f711a238dc28b44f`, 140×108, 36 frames |
| `char/generalj13.spr` | `43322afcb8f5c90e63925efc2de647a36c5d3663d8a8638bc814a05c241a8b91`, 140×108, 54 frames |
| `generalj11.manifest.json` | `a71d9b7392a4bc366a7346c90f174c5a7e2d919296ae26d892788c0f43ac7b54`, 49 exports |
| `generalj12.manifest.json` | `ca12c083547126db0342d6bb5d0e4a4c0cdc9b0241e5d4b54f623c4927e83b48`, 36 exports |
| `generalj13.manifest.json` | `831e5894dc43beeaf85c14c364be57be146f1a492d667a8c405856c20b79121a`, 54 exports |
| canonical static output | 관련 11개 function body/count/hash, class/state/direction jump table, seed source hash |

독립 추출기는
[`extract-k01-konishi-animation-pilot.mjs`](../../../tools/imjinrok/extract-k01-konishi-animation-pilot.mjs),
focused 테스트는
[`k01-konishi-animation-pilot.test.mjs`](../../../tools/imjinrok/k01-konishi-animation-pilot.test.mjs)다.
EXE, 세 SPR, canonical function 또는 jump-table evidence가 stale·tampered이면 실패한다.

## 정체, initializer와 상태 경로

type record `0x00889868`은 class 82 `일본 고니시`, 생성 flags `0x00880805`다.
`0x0045dd2a`가 이 type initializer를 호출한다. primary slot 165/table index 65/cell
`0x004bc328`은 `generalj11.spr`, idle slot 166/cell `0x004bc32c`은
`generalj12.spr`, attack slot 167/cell `0x004bc330`은 `generalj13.spr`를 고른다.

class switch `0x004292b3` case 82는 `0x0042ae03`으로 간다.

| 상태 | initializer helper | slot/source | phase | configured bases |
| ---: | --- | --- | ---: | --- |
| 8 idle | `0x00438e50` | 166 / `generalj12` | 6 | `0,6,12,18,24` |
| 1 일반 이동 | `0x00438ef0` | 165 / `generalj11` | 8 | `0,8,16,24,32` |
| 7 health-zero 사망 | `0x004390b0` ×5 | 165 / `generalj11` | 8 | 모두 `40` |
| 4 target-driven 공격 | `0x004390e0`, `0x00439140` | 167 / `generalj13` | 10 | `0,10,20,30,40` |

상태 dispatch `0x0041d210`은 8→`0x0041d870`, 1→`0x0041efa0`,
4→`0x0041e370`, 7→`0x0041d700`으로 보낸다. 생성 flags에서 idle bit
`0x08`, 이동 mask `0x80000008`/alternate `0x04000000`, 공격 high bit
`0x80000000`이 모두 clear라 normal consumer가 선택된다. 공격 switch에는 class 82
case가 없다. `(82-5)=77`이 unsigned 32보다 커 `JA 0x0041e3a0` default gate를
타고, phase count 10이 nonzero라 common `0x0041e200`으로 간다.

## 8방향 frame과 mirror

| facing | raw | source index | mirror | idle (`generalj12`) | move/walk (`generalj11`) | attack (`generalj13`) | death (`generalj11`) |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| s | 1 | 0 | 아니오 | 0..5 | 0..7 | 0..9 | 40..47 |
| sw | 5 | 1 | 아니오 | 6..11 | 8..15 | 10..19 | 40..47 |
| w | 4 | 2 | 아니오 | 12..17 | 16..23 | 20..29 | 40..47 |
| nw | 20 | 3 | 아니오 | 18..23 | 24..31 | 30..39 | 40..47 |
| n | 16 | 2 | 예 | 12..17 | 16..23 | 20..29 | 40..47 |
| ne | 80 | 1 | 예 | 6..11 | 8..15 | 10..19 | 40..47 |
| e | 64 | 0 | 예 | 0..5 | 0..7 | 0..9 | 40..47 |
| se | 65 | 4 | 아니오 | 24..29 | 32..39 | 40..49 | 40..47 |

## 재현 벡터와 이식 경계

focused 테스트는 네 상태×8방향의 모든 phase, slot/source/mirror, 생성 flags gate,
class/state/direction switch와 class 82 공격 default route를 hard-code한다. 잘못된
state/direction/phase/폭/flags, phase count 0, invented class 82 attack case,
EXE·세 SPR·function·jump-table tamper를 거부한다.

theme은 `idle`, `move`, `walk`, `attack`, `death`를 제공한다. `walk`는 generic
alias로 `move`와 동일하다. idle/move/walk는 loop, attack/death는 non-loop다.
FPS 4/8, render size 140×108과 pivot `(70,100)`은 원본 확정값이 아니라 잠정
프로젝트 표시 적응이다.

## 미확정

- `generalj11` frame 48, `generalj12` frames 30..35, `generalj13` frames 50..53
- `generalj14.spr`, hit reaction과 그 밖의 상태
- 정확한 seconds-per-phase, 원본 update→프로젝트 24 Hz/FPS
- pivot/render scale, 이후 flags mutation, death display lifetime
- stats, category, collision, 행동, owner 의미와 최종 배치

이 매핑은 generic superset default theme의 opt-in source visual 선택이며 원본
combat/simulation의 필수 dependency가 아니다.
