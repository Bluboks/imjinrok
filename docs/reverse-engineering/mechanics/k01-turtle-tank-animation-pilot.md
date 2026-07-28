# K01 일본 귀갑차 핵심 애니메이션 파일럿

원본 내부 class 14 일본 귀갑차의 상태 8 idle, 상태 1 일반 이동, 상태 4 target-driven 공격이 어느 SPR 슬롯·프레임·8방향·mirror를 선택하는가?

## 상태

- 분석: `정적 확정`
- 재현: `재현 완료`
- 구현: `이식 완료` — generic superset의 default theme `japanese-turtle-tank` visual에만 반영했다.

확정 범위는 생성 기본 flags에서 선택되는 class 14 상태 8/1/4의 slot, phase→frame,
grid 8방향과 mirror다. 이동·공격 special consumer가 받는 raw direction `1000..1007`도
수치 계약으로 재현하지만 사람용 방향 의미가 없어 generic `Facing`에는 넣지 않았다. simulation,
stats, 행동과 생성 정책은 변경하지 않았다.

## 입력과 provenance

| 입력 | SHA-256/계약 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `char/ghosttankj.spr` | `34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec`, 70×60, 88 frames |
| `analysis/generated/imjinrok2/functions.json` | EXE source hash와 관련 8개 function body/count/hash 일치 |
| `analysis/generated/imjinrok2/jump-tables.json` | class initializer, attack wrapper, 이동·공격 grid/opaque switch |
| `analysis/generated/imjinrok2/seeds.json` | canonical EXE source hash 일치; 새 seed 없음 |

독립 추출기는
[`extract-k01-turtle-tank-animation-pilot.mjs`](../../../tools/imjinrok/extract-k01-turtle-tank-animation-pilot.mjs),
focused 테스트는
[`k01-turtle-tank-animation-pilot.test.mjs`](../../../tools/imjinrok/k01-turtle-tank-animation-pilot.test.mjs)다.
EXE, SPR, canonical function 또는 jump-table evidence가 stale·tampered이면 실패한다.

## 정체, initializer와 상태 경로

type record `0x00884038`은 class 14 `일본 귀갑차`, 생성 flags `0x80143205`다.
primary resource는 slot 104, sprite table index 4, pointer cell `0x004bc234`의
`char\ghosttankj.spr`다. class switch `0x004292b3` case 14는
`0x0042bae1`로 가며, 이 파일럿의 initializer 범위는 `0x0042bae1..0x0042bb8c`다.

| 상태 | initializer | helper/필드 | phase | configured bases |
| ---: | --- | --- | ---: | --- |
| 8 idle | `0x0042bae1` | `0x00438e80`, slot BYTE `+0x93`, bases `+0x94` | 1 | `16,32,48,64,0` |
| 1 일반 이동 | `0x0042bb33` | `0x00438f20`, slot BYTE `+0xa7`, bases `+0xa8..+0xb8` | 8 | `0,8,…,64` |
| 4 target-driven 공격 | `0x0042bb4a` | `0x00439110`, slot WORD `+0x146`, bases `+0x148..+0x158` | 1 | `72,73,…,80` |

`0x0042bb60..0x0042bb83`의 `+0xd0/+0xec` 설정과 state 7은 범위 밖이다.
따라서 이 initializer가 class 14 death table을 설정한다고 주장하지 않으며 frames 81..87의
의미도 미확정이다.

- idle: `0x0043c344`가 상태 8을 만들고 flags bit `0x08` clear라
  `0x0041d870 → 0x0041d880` normal consumer를 탄다.
- 이동: `0x00425b20` 계열이 상태 1을 만든다. 생성 flags와
  mask `0x80000008`의 결과가 `0x80000000`이므로 `0x0041efa0` special path가
  direction WORD `+0x1e8`을 읽는다. alternate eligibility `0x04000000`은 clear다.
- 공격: `0x00423837`이 상태 4를 만든다. switch `0x0041e385` case 14는
  `0x0041e38c`이며 WORD `+0x144 != 0`이면 `0x0041e3f0` special consumer가
  direction WORD `+0x1e6`을 읽는다. class 13의 flags high-bit gate는 적용되지 않는다.
- `0x004381a0`은 normal direction WORD를 `+0x1e6`과 `+0x1e8`에 함께 쓴다.

## grid 8방향 frame과 mirror

| facing | raw | `(dx,dy)` | base index | mirror | idle | movement | attack |
| --- | ---: | --- | ---: | --- | ---: | --- | ---: |
| s | 1 | `(0,1)` | 2 | 아니오 | 16 | 16..23 | 74 |
| sw | 5 | `(-1,1)` | 4 | 아니오 | 32 | 32..39 | 76 |
| w | 4 | `(-1,0)` | 6 | 아니오 | 48 | 48..55 | 78 |
| nw | 20 | `(-1,-1)` | 8 | 아니오 | 64 | 64..71 | 80 |
| n | 16 | `(0,-1)` | 6 | 예 | 48 | 48..55 | 78 |
| ne | 80 | `(1,-1)` | 4 | 예 | 32 | 32..39 | 76 |
| e | 64 | `(1,0)` | 2 | 예 | 16 | 16..23 | 74 |
| se | 65 | `(1,1)` | 0 | 아니오 | 0 | 0..7 | 72 |

## opaque raw direction

이동 frame은 `index×8+phase`, 공격 frame은 `72+index`다.

| raw | index | mirror | 이동 frame | 공격 frame |
| ---: | ---: | --- | --- | ---: |
| 1000 | 3 | 아니오 | 24..31 | 75 |
| 1001 | 5 | 아니오 | 40..47 | 77 |
| 1002 | 7 | 아니오 | 56..63 | 79 |
| 1003 | 7 | 예 | 56..63 | 79 |
| 1004 | 5 | 예 | 40..47 | 77 |
| 1005 | 3 | 예 | 24..31 | 75 |
| 1006 | 1 | 예 | 8..15 | 73 |
| 1007 | 1 | 아니오 | 8..15 | 73 |

## 재현 벡터와 이식 경계

focused 테스트는 세 initializer, class/attack switch, helper 필드, producer/consumer,
grid 8방향의 모든 phase와 opaque 8개를 hard-code한다. phase/state/direction 오류,
DWORD/WORD 폭 위반, state 1 creation-default gate를 벗어난 flags, attack phase count 0,
EXE/SPR/function/jump-table tamper를 거부한다.

theme은 `idle`, `move`, `walk`, `attack`만 제공한다. `walk`는 generic alias로 `move`와
동일하고 idle/move는 loop, attack은 non-loop다. FPS 4/8, render size 70×60과 pivot
`(35,52)`는 원본 확정값이 아니라 잠정 프로젝트 표시 적응이다. opaque raw direction은
theme에 넣지 않았고 death/destruction 상태도 만들지 않았다.

## 미확정

- frames 81..87, hit/death/destruction과 `+0xd0/+0xec` 필드 의미
- raw `1000..1007`의 사람용 방향 의미와 프로젝트 `Facing` 대응
- 정확한 seconds-per-phase, 원본 update→프로젝트 24 Hz/FPS
- pivot/render scale, 이후 flags mutation, 표시 lifetime
- stats, category, collision, 행동, owner 의미와 최종 배치

이 매핑은 generic superset default theme의 source visual 선택일 뿐 원본 combat/simulation의
필수 dependency가 아니다.
