# K01 조선 농부 class 7 creation-default core frames

## 질문과 범위

K01 map loader가 생성한 내부 클래스 7 `조선 농부`에서 initializer-time `WORD +0x47a == 0`일 때,
상태 8 idle·상태 1 move·상태 7 death가 선택하는 slot, frame, 방향 및 mirror를 복원한다.

## 원본 파일과 해시

- `original/imjinrok2/imjinrok2.exe`: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- `original/imjinrok2/stagemap/k01.map`: `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb`
- `original/imjinrok2/char/farmerk.spr`: `98e370f4dec6f147a2556340bf93d293d23c3ee3a5367bc22fd3984e7209e5ca`

## 분석·재현·구현 상태

- 분석 상태: `정적 확정`
- 재현 상태: `재현 완료`
- 구현 상태: creation-default core state와 별도 nonzero-branch `carry`/`carry-idle` frame 범위는
  `부분 이식`이다. `gather`/`build`/`repair`는 계속 `의도적 적응`이다.

## 데이터와 생성 경로

타입 카탈로그의 class 7 record는 `0x00883724`, flags는 `0x000a0801`, slot은 105, sprite pointer
cell은 `0x004bc238`, source는 `char\\farmerk.spr`다. SPR header는 60×60, 248 frames다.

K01 map의 active owner 0 class-7 records는 `(7,6)`, `(8,6)`이다. map loader `0x0048dbe0`은
`0x0048dcca`에서 wrapper `0x00483c50`을 호출하고, wrapper는 `0x00483c95`에서 creator
`0x00437650`을 호출한다. creator는 `0x00437656..0x00437666`에서 `ECX=0x156`, `EAX=0`,
`EDI=record`로 `REP STOSD`하여 0x558 bytes를 zero-fill한다. class write는 `0x00437b86`, class
initializer call은 `0x00437f29`다.

`0x0043792b`의 `LEA ECX,[ESI+0x45c]`와 `0x00437962` call은 `0x004550c0`의 0x38-byte zeroer로
이어진다. `REP STOSD` 뒤부터 initializer call 전까지 `+0x47a` direct write는 없고, 이 subrecord
zeroer도 해당 field를 덮는다. 따라서 이 source-created 범위의 initializer-time `+0x47a`는 0이다.

## class 7 initializer와 helper branch

`0x004291d0` case 7은 `0x0042981d..0x004298e7`이다. `EBX=8`, `EDI=105`로 설정한 뒤 idle helper
`0x00428fb0`, move helper `0x00428e10`을 호출한다. state 4 initializer는 이 범위에 없다. death는
five-facing `0x004390b0` calls로 start 240, phase 8, slot 105를 설치한다.

- `0x00428fb0` case 7 `0x00428fd3`은 `+0x47a`를 비교한다. zero branch `0x00429031`은 state 8,
  phase 8, start 0, slot 105로 `0x00438e50`을 호출한다.
- `0x00428e10` case 7 `0x00428e30`은 같은 field를 비교한다. zero branch `0x00428e4d`는 phase 8,
  start 40, slot 105로 `0x00438ef0`을 호출한다.

## 방향과 frame 식

raw direction `1,5,4,20,16,80,64,65`는 각각 `s,sw,w,nw,n,ne,e,se`다. frame base index는
`0,1,2,3,2,1,0,4`, mirror는 `false,false,false,false,true,true,true,false`다.

`frame = start + frameBaseIndex * stride + phase`이며, core state는 다음과 같다.

| 상태 | start | stride | phase | loop |
| --- | ---: | ---: | ---: | --- |
| 8 idle | 0 | 8 | 0..7 | true |
| 1 move / project walk | 40 | 8 | 0..7 | true |
| 7 death | 240 | 0 | 0..7 | false |

## 재현 벡터

전용 extractor는 모든 8 방향의 phase 0 및 마지막 phase, 총 48 vector를
[`analysis/fixtures/k01-korean-farmer-core-frame-vectors.json`](../../../analysis/fixtures/k01-korean-farmer-core-frame-vectors.json)에
고정한다. 예로 state 8/n/phase 7은 frame 23 mirror, state 1/sw/phase 0은 frame 48 non-mirror,
state 7/e/phase 7은 frame 247 mirror다.

## 현재 구현과의 차이

`packages/shared/src/themes.ts`는 위 세 core state에 recovered direction helper를 적용한다. 별도
[resource-quantity nonzero branch](k01-farmer-resource-branch-frames.md)는 `carriedResource.amount > 0`
adapter로 `carry`/`carry-idle`의 frame·방향·mirror만 연결한다. 이는 원본 `+0x47a`의 의미를 다른
entity나 시스템에 일반화하지 않으며, gather/build/repair는 프로젝트 source-layout adaptation으로 남는다.
FPS와 pivot도 이 분석에서 확정하지 않은 프로젝트 설정이다.

## 미확인 항목과 다음 작업

`+0x478`의 사람용 의미, state 4 attack, 원본 tick→FPS, pivot, stats, behavior, later runtime mutation
및 death lifetime은 미확인이다. gather/build/repair와 full gather lifecycle도 별도 정적 질문과 vector가
생기기 전에는 원작 일치 주장에 포함하지 않는다.
