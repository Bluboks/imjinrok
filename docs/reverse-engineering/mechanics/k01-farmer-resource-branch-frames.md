# K01 농부 resource-quantity 비영 분기 프레임

## 질문과 범위

K01 internal class 7 `조선 농부`와 class 31 `일본 농부`에서 entity `WORD +0x47a != 0`일 때 상태 8
idle과 상태 1 move가 선택하는 slot·frame·방향·mirror를 복원한다. 이 문서는 `+0x47a`를 이 흐름 안의
carried/gathered resource quantity로 좁게 뒷받침하는 selector·increment·capacity·coordinate-indexed tile WORD storage add
경로도 함께 다룬다.

## 원본 파일과 해시

- `original/imjinrok2/imjinrok2.exe`: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- `original/imjinrok2/char/farmerk.spr`: `98e370f4dec6f147a2556340bf93d293d23c3ee3a5367bc22fd3984e7209e5ca`
- `original/imjinrok2/char/Farmerj.spr`: `e6cc67849a872f391c977079fc04118bf06d57b99ad8b5137b02398e26d9cdc5`

## 분석·재현·구현 상태

- 분석 상태: `정적 확정`
- 재현 상태: `재현 완료`
- 구현 상태: `부분 이식` — class 7 `villager`와 class 31 `japanese-farmer`의 `carry`/`carry-idle`은
  이 nonzero branch의 frame·방향·mirror를 사용한다. 선택 조건은 port의 `carriedResource.amount > 0`
  adapter이며, 원본 `+0x47a`의 의미를 다른 entity나 모든 시스템으로 일반화하지 않는다.

## 함수·데이터 주소와 field 흐름

`0x004550c0`은 entity `+0x45c` subrecord 0x38 bytes를 초기화한다. 이 base에서 `+0x1c/+0x1e/+0x20`은
각각 entity `+0x478/+0x47a/+0x47c`다. `0x004550ea`, `0x004550ee`는 앞의 두 WORD를 0으로 쓰고,
`0x004550f2`는 마지막 WORD를 10으로 쓴다. class 7 (`0x00429823..0x0042982a`)과 class 31
(`0x00429b97..0x00429b9d`) initializer는 모두 이 subrecord를 `0x004550c0`에 전달한다.

`0x004557a3`은 nonzero input WORD를 subrecord `+0x1c`에 쓴다. `0x004564c7..0x004564e0`은 그 selector를
1/2/3과 비교한 뒤 `+0x1e`에 selector 3이면 12 (`0x004564d4`), 그 밖의 관찰된 경로면 9
(`0x004564db`)를 더한다.

`FUN_0043c9c0`의 `0x0043ca1e`는 `XOR EBP,EBP`로 `BP=0`을 만들며, raw range
`0x0043ca1e..0x0043cea3`에서 `0x0043ce7c CMP AX,BP`까지 그 comparator register를 다시 쓰지 않는다.
따라서 `0x0043ce75..0x0043ce9e`는 quantity `+0x47a`, selector `+0x478`, capacity `+0x47c`를 읽고
quantity와 selector가 모두 0이 아니며 observed signed `JGE` 비교에서 quantity가 capacity보다 작을 때
`0x0043ce9a`에서 `FUN_00424510`을 호출한다. 인수는 selector와 quantity다.
`FUN_00424510`은 entity `+0x1bc/+0x1be` 좌표를 읽어 `x*45+y` index를 만들고 `0x00bb41cc`의
coordinate-indexed tile WORD storage에 selector 1/2는 quantity raw WORD, selector 3은 quantity를 8 bit
shift한 값을 더한다. 따라서 이 write/increment/gate/storage-add chain은 `+0x47a`가 이 흐름의
carried/gathered resource quantity임을 `정적 확정`한다. selector의 사람용 자원 이름이나 다른 호출자의
`+0x47a` 의미, 그리고 이 tile storage add의 return/deposit 의미까지는 확정하지 않는다.

`0x004564d4/0x004564db` increment 뒤 `0x0045650c`은 move helper `0x00428e10`, `0x00456524`는 idle
helper `0x00428fb0`을 직접 호출한다. generated reference의 둘 다 containing function은
`0x004562d0`이다. 따라서 quantity mutation이 같은 invocation에서 class 7/31의 `+0x47a!=0` move/idle
configuration refresh로 직접 이어짐을 정적 확정한다.

## class dispatch와 비영 branch

`0x004292b3` class jump table은 class 7을 `0x0042981d`, class 31을 `0x00429b90`으로 보낸다. 두
initializer는 idle helper `0x00428fb0`, move helper `0x00428e10`을 호출한다. helper switch와 nonzero
branch의 raw range는 extractor가 EXE SHA-256, function/jump-table/reference/seed/catalog/SPR evidence와 함께
검증한다.

| class | 상태 | 비영 branch | phase | slot | frame setup |
| ---: | --- | --- | ---: | ---: | --- |
| 7 | 8 idle | `0x00428fdd..0x0042902f` | 1 | 105 | stored bases `82,90,98,106,114` |
| 7 | 1 move | `0x00428e43..0x00428e4c` | 8 | 105 | start 80, stride 8, frames 80..119 |
| 31 | 8 idle | `0x0042911b..0x00429183` | 8 | 145 | stored bases `200,208,216,224,232`, frames 200..239 |
| 31 | 1 move | `0x00428f2d..0x00428f3c` | 8 | 145 | start 200, stride 8, frames 200..239 |

Normal direction profile은 raw `1,5,4,20,16,80,64,65` → `s,sw,w,nw,n,ne,e,se`, base index
`0,1,2,3,2,1,0,4`, mirror `false,false,false,false,true,true,true,false`다. stored-base state는
`frame = storedBase[baseIndex] + phase`, start/stride state는 `frame = start + baseIndex * 8 + phase`다.

## 재현 테스트 벡터

[`extract-k01-farmer-resource-branch-frames.mjs`](../../../tools/imjinrok/extract-k01-farmer-resource-branch-frames.mjs)는
canonical EXE, generated functions/jump tables/references/seeds, catalog, sprite table과 양쪽 SPR header/hash,
raw ranges, evidence points, call edges를 검증한다.
[`k01-farmer-resource-branch-frames.test.mjs`](../../../tools/imjinrok/k01-farmer-resource-branch-frames.test.mjs)는
[`k01-farmer-resource-branch-frame-vectors.json`](../../../analysis/fixtures/k01-farmer-resource-branch-frame-vectors.json)의
56 direction/phase vectors, zero rejection, class/state/direction/phase bound rejection과 function/jump-table/reference/
seed/SPR/EXE tamper rejection을 검사한다.

## 현재 구현과의 차이

현행 port는 `carriedResource.amount > 0`일 때만 class 7·31의 `carry`/`carry-idle`로 이 정적 frame
mapping을 선택한다. 이는 원본의 quantity mutation, selector, capacity, coordinate-indexed tile storage add, gather 명령 또는
full gather lifecycle을 구현했다는 뜻이 아니다. 기존 creation-default mapping의 `+0x47a==0` core 범위와
이 문서의 `+0x47a!=0` 범위는 분리하며, FPS와 pivot은 프로젝트 적응으로 남는다.

## 미확인 항목과 다음 작업

state 4, original tick→FPS, pivot, stats, behavior, death lifetime, full gather lifecycle, selector의 사람용 자원명,
그리고 이 field를 모든 entity에 일반화하는 해석은 `미확인`이다.
