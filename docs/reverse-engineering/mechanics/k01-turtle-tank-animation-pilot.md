# K01 일본 귀갑차 핵심 애니메이션 파일럿

원본 내부 class 14 일본 귀갑차의 상태 8 idle, 상태 1 일반 이동, 상태 4 target-driven 공격이 어느 SPR 슬롯·프레임·8방향·mirror를 선택하는가?

## 상태

- 분석: `정적 확정`
- 재현: `재현 완료`
- 구현: `부분 이식` — grid 8방향과 intermediate 16-ring 이동의 profile-id/raw-direction
  theme contract를 default theme에 이식했고, `SkirmishScene` presentation bridge가 이를 사용한다.

확정 범위는 생성 기본 flags에서 선택되는 class 14 상태 8/1/4의 slot, phase→frame,
grid 8방향과 mirror다. 이동·공격 special consumer가 받는 raw direction `1000..1007`도
수치 계약으로 재현한다. `1000..1007`은 더 이상 불명 raw 값이 아니라 인접 grid 방향 사이의
**intermediate 16-ring turn direction**으로 정적 확정했다. generic 8-way `Facing`으로
손실 없이 표현하지 않도록 `move`/`walk`에 `profileId → raw WORD → clip` theme metadata를
별도로 둔다. creation-default 사망은 `ghosttankj` state 7이
아니라 transient effect pool의 `exp1`/`exp2` 한 번 재생이며, runtime/theme에는 이식하지 않았다.

## 입력과 provenance

| 입력 | SHA-256/계약 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `char/ghosttankj.spr` | `34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec`, 70×60, 88 frames |
| `fnt/exp1.spr` | `51eecc60551b018ffd2729b7d30c69104d8231c89542a833bd0fc9906a613918`, 100×100, 36 frames |
| `fnt/exp2.spr` | `6442030d5fd4a2cd74ee10438ed9cf0a88760e6bbb7b80303f1858acbb248957`, 32×32, 300 frames |
| `analysis/generated/imjinrok2/functions.json` | EXE source hash와 관련 28개 function body/count/hash 일치 |
| `analysis/generated/imjinrok2/jump-tables.json` | class initializer, attack wrapper, 이동·공격 grid/intermediate-turn switch |
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

추출기는 canonical `seeds.json`의 `FUN_004291d0` instruction에서 class-14 범위를 정확히
filter하여 direct write `+0x92/+0xa6/+0x144/+0xd0/+0xec`와 helper call을 구조적으로 열거한다.
`+0x18c/+0x192/+0x194..+0x19c` direct write는 0건이고 helper는 state-7 initializer가 아니라
`0x00438e80`·`0x00438f20`·`0x00439110`·`0x00438ff0`뿐이다. 마지막 helper는 `0x00438fa0`을 통해
ancillary `+0xd1/+0xd2`만 쓴다. 반대로 canonical state-7 renderer `0x0041d700`은 `+0x192`와
`+0x194..+0x19c`를 읽고, standard state-7 branch `0x004236a4`는 `+0x18c`를 읽는다.
그러므로 creation-default class 14는 state-7 renderer table을 구성하지 않으며
`ghosttankj` frames 81..87은 이 사망 경로라는 가설이 **반증됨**이다. 이 결과는 해당 tail이
전역적으로 미사용이거나 다른 의미가 없다는 주장이 아니다.

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

## intermediate 16-ring turn direction

`FUN_004381c0`의 정확한 ring은
`[1,1000,5,1001,4,1002,20,1003,16,1004,80,1005,64,1006,65,1007]`다.
grid 값은 차례로 s, sw, w, nw, n, ne, e, se이고 중간 값은 각 인접 쌍 사이다.
`+0x1e8 WORD`에서 현재 값을 읽어 target까지 원형 forward distance가 `<8`이면 앞으로,
`>=8`이면 뒤로 한 칸 이동하므로 정반대 tie는 뒤로 간다. target과 같으면 `1`을 반환하고
`BYTE +0x1f1`만 clear한다. 다르면 `BYTE +0x70`을 wrap increment해 `+0x71`과 비교하고,
미달이면 no-step이다. cadence step은 counter를 0으로 reset, `+0x1f1`과 dirty `+0x04`를 1로
쓰며 새 `+0x1e8`이 `<1000`일 때만 normal `+0x1e6 WORD`에도 복사한다. class-14 creation
default `+0x71`은 type writer `0x0045c7f0` zero-based arg 35의 `2`가 type `+0x48`을 거쳐
runtime BYTE `+0x71`로 복사된 값이다. 같은 writer zero-based arg 39의 `8`은 type `+0x54`를
거쳐 runtime WORD `+0x84`로 복사된다.

## intermediate raw direction frame consumer

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

## action 6 destruction과 transient effect

creation-default runtime WORD `+0x84=8`의 action 6 `FUN_004233f0`는 `0x0042360d` branch에서
`FUN_00401aa0`로 60개 record 중 slot 0을 건너뛰고 first-free `1..59`를 찾는다. full pool이면
effect와 PRNG write 없이도 action 6은 `1`을 반환한다. slot이 있으면 state를 정확히
`((Math.imul(state, 0xff83) >>> 0) % 0xfffb)`로 갱신한다. odd remainder는 `0x00401b70` kind 2,
even은 `0x00401bb0` kind 4를 unchanged entity x/y WORD와 `+0x68 BYTE`로 materialize한다.

| kind | EXE table | resource | base/range | phase/repeat |
| ---: | --- | --- | --- | --- |
| 2 | index 5, `0x004bc0a8 → 0x004bd900` | `fnt\exp1.spr` | base 0, `0..17` | 18, one pass |
| 4 | index 6, `0x004bc0ac → 0x004bd8f0` | `fnt\exp2.spr` | base 0, `0..2` | 3, one pass |

각 config은 각각 `0x00401056`(slot 5/base 0/count 18/repeat 0), `0x00401082`(slot 6/base 0/
count 3/repeat 0)에 있고, `0x00401b70`/`0x00401bb0`은 config가 아닌 kind 2/4 materializer다.

`FUN_00401440`은 unsigned DWORD `(lastTick-currentTick) mod 2^32 >=2`일 때만 phase와
lastTick을 갱신한다. phase가 count와 같고 repeat counter/limit `0/0`이면 0을 반환해 record를
제거한다. 이를 seconds, FPS 또는 24 Hz로 환산하지 않는다. action 6 뒤 dispatcher는
`+0x84 & 0x19 !=0`로 action 7을 선택한다. action-7 switch destination `0x0043ce6e`은 helper 뒤
`TEST BYTE [entity+0x74],0x80`을 실행하고 default low byte `0x05`는 `0x0043d315` return-0으로
간다. active-list `0x00447499`은 dispatcher 0 반환에서 `0x00483aa0` release를 호출한다.

## 재현 벡터와 이식 경계

focused 테스트는 모든 16-ring entry/인접 step, 양 방향 multi-step, tie, cadence 2,
equality/no-step/conditional copy, first-free/full pool, PRNG 0/1/large와 odd/even, exp1 `0..17`,
exp2 `0..2`, raw tick `<2`/`>=2`/wrap/terminal, action 7/release, initializer state-7 config
부재를 hard-code한다. phase/state/direction/field width/pool/kind 오류와 EXE·세 SPR·function·
jump-table·seed-instruction evidence 변조를 거부한다. class-14 initializer seed 범위는 inclusive
`0x0042bae1-0x0042bb8c`이며 byte/word/dword와 width가 생략된 모든 first-operand ESI memory
destination을 보수적으로 열거한다.

theme은 `idle`, `move`, `walk`, `attack`을 제공한다. `walk`는 generic alias로 `move`와
동일하고 idle/move는 loop, attack은 non-loop다. `move`/`walk`의 raw clip metadata는
`k01-japanese-turtle-tank-raw16` profile에만 opt-in하며, resolver는 profile/raw가 맞을 때만
사용한다. grid landing·unknown raw·unknown profile은 기존 directional clip으로 되돌아간다.
idle/attack은 `+0x1e6`의 마지막 grid direction을 사용한다. `SkirmishScene`은 non-construction
state에서 이 resolver가 반환한 clip/tracker key를 실제 base sprite에 적용한다. source update tick을
FPS로 바꾸는 정책은 여전히 프로젝트 적응이며, FPS 4/8, render size 70×60과 pivot `(35,52)` 역시
원본 확정값이 아닌 잠정 프로젝트 표시 적응이다. death/destruction 상태는 만들지 않았다.

## 미확정

- frames 81..87의 이 creation-default path 밖 의미, hit reaction과 `+0xd0/+0xec` 필드 의미
- intermediate 16-ring `1000..1007`의 generic `Facing` 대응
- 정확한 seconds-per-phase, 원본 update→프로젝트 24 Hz/FPS 및 project-side transient destruction/tick mapping
- pivot/render scale, 이후 flags mutation, 표시 lifetime
- stats, category, collision, 행동, owner 의미와 최종 배치

이 매핑은 generic superset default theme의 source visual 선택일 뿐 원본 combat/simulation의
필수 dependency가 아니다.
