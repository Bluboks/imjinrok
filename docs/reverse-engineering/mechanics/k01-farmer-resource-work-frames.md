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
- 구현 상태: `부분 이식` — 두 농부의 generic project `gather`가 original state 10 source layout에만
  의도적으로 적응한다. state 11/16 product mapping과 state 10/11/16의 사람용 상태명은 여전히 미확정이다.

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

## resource flow의 raw state write

`FUN_004562d0`은 selector field `+0x1c`가 1 또는 2인 경로에서 visual state 10을, 3인 경로에서
state 11을 write한 뒤 기존 quantity increment와 helper refresh에 이른다. `FUN_004554c0`에는
`0x00455937` state 16 alternate write가 있다. 이 extractor는 state write와 increment 전 raw range를
함께 고정한다.

이는 state 10/11/16을 사람용 행동명이나 selector 자원명으로 번역하는 근거가 아니다. state 16 write를
도달시키는 내부 조건, full resource lifecycle, timing/FPS, pivot, stats, behavior는 미확인이다.
`+0x47a`의 좁은 carried/gathered quantity 근거와 coordinate-indexed tile WORD storage add는
[resource-quantity 비영 분기](k01-farmer-resource-branch-frames.md)에 분리해 둔다.

## 재현 벡터와 이식 경계

[`extract-k01-farmer-resource-work-frames.mjs`](../../../tools/imjinrok/extract-k01-farmer-resource-work-frames.mjs)와
[`k01-farmer-resource-work-frames.test.mjs`](../../../tools/imjinrok/k01-farmer-resource-work-frames.test.mjs)는
canonical EXE·generated functions/references/seeds·두 SPR hash/header와 raw evidence를 검증한다.
[`k01-farmer-resource-work-frame-vectors.json`](../../../analysis/fixtures/k01-farmer-resource-work-frame-vectors.json)은
두 class × 세 state × 여덟 방향 × phase 0/7, 총 96개 재현 벡터를 고정한다. 이들은 각
direction/frame band의 endpoint 재현이며, intermediate phase 전체를 별도로 재현한 벡터는 아니다.

현재 제품은 두 농부의 generic `gather`만 state 10 source layout에 의도적으로 연결한다. 이는 project
resource name을 selector identity로 매핑하지 않으며 state 11/16 product mapping 또는 state 10/11/16의
사람용 행동 의미를 주장하지 않는다. 따라서 이 문서가 `정적 확정`·`재현 완료`인 범위와 제품의 원작
일치 주장을 혼동하지 않는다. 다음 작업은 state 10/11/16의 사람용 행동 의미와 caller/consumer 경계를
더 좁히는 것이다.
