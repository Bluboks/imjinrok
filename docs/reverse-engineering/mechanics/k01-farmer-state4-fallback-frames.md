# K01 농부 class 7·31 state-4 creation-default visual fallback

## 질문과 범위

source-created internal class 7 `조선 농부`와 class 31 `일본 농부`가 creation-default
`WORD +0x144 == 0`인 상태에서 original visual state 4를 소비하면 어떤 slot, frame, 방향 및 mirror가
선택되는가를 제한해 복원한다. 이 문서는 이를 농부의 사람용 공격 애니메이션이나 전투 규칙으로 부르지
않는다.

## 원본과 상태

- `original/imjinrok2/imjinrok2.exe` SHA-256:
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- 분석 상태: `정적 확정`
- 재현 상태: `재현 완료`
- 제품 구현 상태: `pending audit` — 기존 product visual이 이 제한된 source-created fallback과
  정렬하는지는 아직 감사하지 않았다.

## 생성 기본값과 initializer 범위

creator `FUN_00437650`은 `0x00437656`에서 `ECX=0x156`, `EAX=0`, `EDI=record`를 준비하고
`0x00437666 REP STOSD`로 0x558 bytes를 zero-fill한다. `0x00437f29`에서
`FUN_004291d0` initializer를 호출한다.

`0x004292b3` class switch의 case 7 범위는 `0x0042981d..0x004298e7`, case 31 범위는
`0x00429b90..0x00429c59`다. extractor는 이 두 **정확한 seed instruction 범위**만 대상으로
`WORD +0x144`를 쓰는 instruction이 없음을 검사한다. 이는 이후의 모든 함수·alias·runtime write가
없다는 주장이 아니다. zero-fill과 이 제한된 initializer 범위의 결합으로 source-created entry에서
`+0x144`는 0이다.

type flags는 class 7 `0x000a0801`, class 31 `0x00081001`이고 둘 다 high bit가 clear다.

## state-4 visual selection

`FUN_0041d210`의 state dispatcher는 case 4를 `0x0041d230`에서 `FUN_0041e370`으로 보낸다.
`FUN_0041e370`의 `0x0041e385` class switch는 class 7·31을 모두 `0x0041e3a0`으로 보낸다.
그 gate는 high-bit-clear flags를 요구하고 `WORD +0x144`를 검사한다. 이 creation-default zero 값은
`0x0041e3b3 -> FUN_0041d870` 경로를 선택한다.

`FUN_0041d870`은 normal idle consumer다. `BYTE +0x93`을 방향 selector로 읽고, `WORD +0x94`,
`+0x96`, `+0x98`, `+0x9a`, `+0x9c` frame bases 및 `WORD +0x1b2` phase를 읽는다. 따라서 이
문서의 출력은 기존 각 농부의 state-8 idle configuration과 동일한 slot/frame/mirror다.

| class | state-8 idle slot | frame 범위 | source |
| ---: | ---: | ---: | --- |
| 7 | 105 | 0..39 | `char\\farmerk.spr` |
| 31 | 145 | 0..39 | `char\\farmerj.spr` |

normal direction은 `1,5,4,20,16,80,64,65` = `s,sw,w,nw,n,ne,e,se`다. base index는
`0,1,2,3,2,1,0,4`, mirror는 `false,false,false,false,true,true,true,false`이며,
`frame = baseIndex * 8 + phase` (`phase 0..7`)다.

## 재현과 변조 거부

[`extract-k01-farmer-state4-fallback-frames.mjs`](../../../tools/imjinrok/extract-k01-farmer-state4-fallback-frames.mjs)는
canonical EXE, functions, jump-tables, references, seeds, function/raw-range hash, evidence point와
call edge를 함께 고정한다. two existing farmer core selectors를 이용해 state-8 idle endpoint와
동일한 결과를 만든다.

fixture [`k01-farmer-state4-fallback-frame-vectors.json`](../../../analysis/fixtures/k01-farmer-state4-fallback-frame-vectors.json)은
class 7/31 × 8 directions × phase 0/7의 32 endpoint에서 slot/frame/mirror를 고정한다. focused test는
state-4 class switch, creator zero-fill, exact initializer range에 주입한 `+0x144` write, references 및
EXE 변조를 거부한다.

## 미확인 경계

- state 4를 실제로 생산하는 path의 K01 도달 가능성
- 생성 뒤 `+0x144`의 runtime mutation, alias 또는 다른 writer
- 전투 의미, stats, 사람용 `attack` 명칭
- tick/FPS, pivot, behavior와 소유 정책

따라서 확정 범위는 source-created creation-default visual selection뿐이며, 이 결과를 농부의 전용
attack clip 또는 전체 state-4 의미로 일반화하지 않는다.
