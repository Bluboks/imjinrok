# K01 농부 resource-work 상태 10·11·16 프레임

## 질문과 범위

K01 internal class 7 `조선 농부`와 class 31 `일본 농부`에서 original visual state 10, 11, 16이
선택하는 slot·frame·방향·mirror를 복원한다. 이 문서는 상태를 `resource-work`으로만 부르며,
`build`·`repair` 또는 selector의 사람용 자원 이름을 확정하지 않는다.

## 원본 파일과 상태

- `original/imjinrok2/imjinrok2.exe`: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- `original/imjinrok2/char/farmerk.spr`: `98e370f4dec6f147a2556340bf93d293d23c3ee3a5367bc22fd3984e7209e5ca`
- `original/imjinrok2/char/Farmerj.spr`: `e6cc67849a872f391c977079fc04118bf06d57b99ad8b5137b02398e26d9cdc5`
- 분석 상태: `정적 확정`
- 재현 상태: `재현 완료`
- 구현 상태: `partial-project-adapters` — 두 농부의 generic project `gather`가 original state 10 source
  layout에 의도적으로 적응하고, class 7 project `build`/`repair`가 original state 11 source layout에
  의도적으로 적응한다. 후자는 state 11의 build/repair 의미를 주장하지 않는다. class 31에는 build/repair
  product state를 추가하지 않는다. state 16 product mapping과 state 10/11/16의 사람용 상태명은 여전히 미확정이다.

## dispatcher·initializer·consumer

`FUN_0041d210`은 entity `BYTE +0x03`을 dispatch한다. state 10은 `0x0041ecd0`, state 11은
`0x0041edc0`, state 16은 `0x0041d560`으로 각각 tail jump한다. Extractor는 dispatcher와 세 consumer,
`FUN_004554c0`, `FUN_004562d0`, initializer `FUN_004291d0`의 body range·instruction count·SHA-256와
raw range·anchor를 함께 검증한다.

class 7 initializer는 `(+0x480,+0x482,+0x484)=(8,105,120)`,
`(+0x486,+0x488,+0x48a)=(8,105,160)`,
`(+0x48c,+0x48e,+0x490)=(8,105,200)`을 쓴다. class 31의 같은 triple은 각각
`(8,145,40)`, `(8,145,80)`, `(8,145,120)`이다.

| original visual state | consumer | reads | class 7 frames | class 31 frames |
| ---: | --- | --- | --- | --- |
| 10 | `0x0041ecd0` | slot/start `+0x482/+0x484`, phase `+0x1b2` | 120..127 | 40..47 |
| 11 | `0x0041edc0` | stride/slot/start `+0x480/+0x488/+0x48a`, phase `+0x1b2` | 160..199 | 80..119 |
| 16 | `0x0041d560` | stride/slot/start `+0x48c/+0x48e/+0x490`, phase `+0x1b2` | 200..239 | 120..159 |

state 10은 같은 frame band를 모든 방향에서 사용하며 raw direction `1,5,4,20`은 mirror false,
`16,80,64,65`는 mirror true다. 따라서 `se` raw 65도 state 10에서는 mirror true다.
state 11·16은 raw `1,5,4,20,16,80,64,65` → base index `0,1,2,3,2,1,0,4`, mirror
`false,false,false,false,true,true,true,false`의 별도 normal profile을 사용한다.

## state 16 raw dispatcher·cadence 경계

`FUN_004245d0`은 entity 기준 `ECX`에 `+0x45c`를 더한 뒤 `FUN_004554c0`으로 tail jump한다.
후자의 시작은 entity `DWORD +0x88`에서 1을 빼고 unsigned `0..9`만 jump table
`0x004554ec`으로 보낸다. label 7의 destination은 `0x00455882`이므로, 이 문서에서 복원한
state-16 writer 경로의 raw action substate는 `entity DWORD +0x88 == 8`이다.

`0x00455882`의 fast-start는 다음을 모두 요구한다.

- subrecord `WORD +0x1c == 3`
- subrecord `WORD +0x30 != 0`
- entity `WORD +0x1b2 == 0`
- x86 signed-absolute idiom의 `subrecord +0x0c - global DWORD 0x007c5f80` 결과가 signed 300 초과
  (300은 불통과, 301부터 통과; `INT32_MIN` 차이는 negative로 남아 불통과)
- entity `WORD +0x1e6`이 raw 값 `1, 4, 16, 64` 중 하나
- unsigned global `DWORD 0x007c5f90 % 10 == 0`

하나라도 실패하면 subrecord `WORD +0x08 == 1`일 때만 `0x004558ed` cadence path로 계속한다.
그 외에는 `0x004559ef` regular routine으로 간다. 이 경계는 selector나 방향에 사람용 이름을 붙이지
않는다.

cadence path는 global `0x007c5f80`을 subrecord `DWORD +0x0c`에 기록하고 `WORD +0x08=1`을
쓴 뒤 entity `BYTE +0x6f`를 modulo 256으로 증가시킨다. 증가 뒤 signed `BYTE +0x6f`가 signed
`BYTE +0x6e + 2`보다 작으면 여기서 state 16은 쓰지 않는다. 같거나 크면 counter를 0으로 되돌리고
raw visual state 16을 쓴다. 이어 entity `WORD +0x1b2`를 증가한 뒤 signed `WORD +0x30`으로 signed
remainder를 구해 `+0x1b2`와 entity `WORD +0x34`에 쓴다. 같은 threshold branch는 entity
`BYTE +0x04`와 `BYTE +0x1f1`도 1로 쓴다. remainder가 `period - 1`이면 subrecord `WORD +0x08`을
0으로 clear하고 1을 return한다.

추출 report의 `resourceWorkActionDispatch`와 `resourceWorkCadenceContract`는 wrapper, jump-table
label 7, raw range/evidence point 및 위 fixed-width/signedness를 함께 고정한다.
`replayK01FarmerResourceWorkCadence`는 이 범위의 순수 재현 helper다. `period == 0`은 latch가 없는
fast-start 실패 벡터에서는 regular routine으로 간다. cadence threshold까지 도달한 zero period는 원본의
signed `IDIV`가 zero divisor가 되는 범위라 helper가 거부한다.

## resource flow의 raw state write

`FUN_004562d0`은 selector field `+0x1c`가 1 또는 2인 경로에서 visual state 10을, 3인 경로에서
state 11을 write한 뒤 기존 quantity increment와 helper refresh에 이른다. `FUN_004554c0`에는
`0x00455937` state 16 alternate write가 있다. 이 extractor는 state write와 increment 전 raw range를
함께 고정한다.

이는 state 10/11/16을 사람용 행동명이나 selector 자원명으로 번역하는 근거가 아니다. state 16 write의
위 numeric gate/cadence 범위는 정적 확정이지만, raw visual state 16의 사람용 의미, full resource
lifecycle, timing/FPS, pivot, stats, behavior는 미확인이다.
`+0x47a`의 좁은 carried/gathered quantity 근거와 coordinate-indexed tile WORD storage add는
[resource-quantity 비영 분기](k01-farmer-resource-branch-frames.md)에 분리해 둔다.

## 재현 벡터와 이식 경계

[`extract-k01-farmer-resource-work-frames.mjs`](../../../tools/imjinrok/extract-k01-farmer-resource-work-frames.mjs)와
[`k01-farmer-resource-work-frames.test.mjs`](../../../tools/imjinrok/k01-farmer-resource-work-frames.test.mjs)는
canonical EXE·generated functions/jump-tables/references/seeds·두 SPR hash/header와 raw evidence를 검증한다.
[`k01-farmer-resource-work-frame-vectors.json`](../../../analysis/fixtures/k01-farmer-resource-work-frame-vectors.json)은
두 class × 세 state × 여덟 방향 × phase 0/7, 총 96개 재현 벡터를 고정한다. 이들은 각
direction/frame band의 endpoint 재현이며, intermediate phase 전체를 별도로 재현한 벡터는 아니다.
[`k01-farmer-resource-work-cadence-vectors.json`](../../../analysis/fixtures/k01-farmer-resource-work-cadence-vectors.json)은
normal fast-start, strict elapsed 300/301, `INT32_MIN` signed-absolute overflow, cardinal/diagonal raw
direction, modulo, selector/period/phase gate failure, latched continuation, cadence threshold 미도달/도달과
terminal latch reset을 고정한다.

현재 제품은 두 농부의 generic `gather`를 state 10 source layout에, class 7의 project `build`/`repair`를
state 11 source layout에 의도적으로 연결한다. 이는 project resource name을 selector identity로 매핑하지
않으며 state 11을 build/repair로, state 10/11/16을 어떤 사람용 행동으로도 확정하지 않는다. class 31에는
도달 불가능한 build/repair state를 추가하지 않는다. 따라서 이 문서가 `정적 확정`·`재현 완료`인 범위와
제품의 원작 일치 주장을 혼동하지 않는다. raw action substate 8의 state-16 fast-start/cadence numeric
boundary는 확정됐지만, raw visual state 16·selector 3의 사람용 의미와 state-16 product mapping은 여전히
미확정이다. 다음 작업은 state 10/11/16의 사람용 행동 의미와 caller/consumer 경계를 더 좁히는 것이다.
