# 원본 fog resource·mask·six-subframe renderer 경계

## 질문과 상태

질문: `FUN_00467de0`, `FUN_0046a530`, `FUN_00452b30`이 원본 fog 자원, low-nibble·center-state dispatch,
인접 mask lookup, caller 투영 좌표·인수 순서, callee의 제한된 draw-rectangle 보정, state별 호출·subframe 합성,
state-8 indexed-pixel palette remap에 대해 바이트로 확정하는 범위는 어디까지인가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | `fog0..14`/`black` loader record, low-nibble·center-state dispatch, 16-byte lookup, literal state `4`/`8`의 별도 mask 경로, caller isometric projection·six stack argument order, `FUN_0046a530`의 `arg1-32`/low-nibble helper vertical adjustment, `map+0x4a0c4+x*180+y` family byte→record, 3×2 six-subframe loop·frame algebra와 두 call path, `FUN_00452b30`의 palette channel/LUT·packed-565 remap |
| 재현 | 재현 완료 | EXE·SPR hash/header·atlas fields, K01 map hash·family/low-nibble stream, dispatch/LUT raw range·anchor·direct call edge, 16 lookup vector, center `0`/`4`/`8`·low-nibble·mask omission vectors, exhaustive 32×32·64×64 LUT replay, corrected projection/draw K01 vectors, record/frame loop bound와 fail-closed inputs |
| 구현 | 부분 이식·의도적 적응 | 15×14 `64×48` six-subframe composite와 K01 x-major family stream은 재현했다. lifecycle evidence가 뒷받침하는 literal `0`=visible, `4`=explored, `8`=unseen과 center-state dispatch를 client가 연결하는 작업은 진행 중이다. source dispatch는 center `0`에서 state `4`→`8` 경계 composite를 허용하고 center `8`에서는 base path를 유지한다. base tile coverage는 유지하며, explored silhouette `0.58`와 unseen edge opacity `sourceAlpha * (1 - max(R,G,B) / 255)`는 product adaptation이다. 이는 native palette remap이나 browser alpha와 동등하다는 주장이 아니다. product grid의 update lifecycle, web chunk scheduling과 broader product placement는 명시적 적응 또는 미확정이다. |

## 고정 입력과 생성 산출물

- EXE: `original/imjinrok2/imjinrok2.exe`, SHA-256
  `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`.
- K01 map: `original/imjinrok2/stagemap/k01.map`, SHA-256
  `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb`.
- extractor: [`extract-source-fog-render-evidence.mjs`](../../../tools/imjinrok/extract-source-fog-render-evidence.mjs)
- fixture: [`source-fog-render-evidence.json`](../../../analysis/fixtures/source-fog-render-evidence.json)
- test: [`source-fog-render-evidence.test.mjs`](../../../tools/imjinrok/source-fog-render-evidence.test.mjs)

`pnpm imjinrok:extract-source-fog-render-evidence`는 fixture를 다시 생성한다. 생성기는 EXE,
각 `tile/normal/fog*.spr`, `black.spr`와 K01 map의 SHA-256과 header를 먼저 검사하고, 고정 VA를 PE raw
offset으로 변환해 code/data range hash와 six direct call edge를 기록한다. test는 두 번의 JSON 생성이 committed
fixture와 byte-identical인지, lookup의 16 입력·출력, center-state/low-nibble dispatch, state-8 LUT의 32×32·64×64
전수 replay, projection/placement synthetic·K01 vector와 six-subframe frame vector를 확인한다. EXE·SPR·K01 map의
단일 byte 변조와 malformed/out-of-contract pure-reference input은 report 발행 전에 거부한다.

## 함수·자료 주소

| 항목 | 주소/범위 | 정적 사실 |
| --- | --- | --- |
| caller | `FUN_00467de0`, `0x00467de0-0x004689ce` (end exclusive) | 각 cell에서 literal state `4`, literal state `8`에 대해 별도의 8-neighbor mask build 경로를 둔다. nonzero·non-`0x0f` mask만 lookup/call에 도달한다. |
| center/low-nibble dispatch window | `0x004686e2-0x00468987` (end exclusive), SHA-256 `7fc7126448394a8f9c93ceba2f5b74a375ce4b47b82f6a24d23c3f2bdc80ddca` | map low nibble `0`은 이 cell pass를 건너뛴다. low nibble이 nonzero이면 center state `8`은 `FUN_00469510` selector `1` base path로 빠지고, center state `0`은 state `4`→`8`, 다른 nonzero center state는 state `8`만 순서대로 조사한다. |
| caller projection window | `FUN_00467de0` 안의 `FUN_00468600` caller range; `0x00468634-0x004686aa` (end exclusive), SHA-256 `5a88c41d80dfd2f871d90266fbf3e9a5c978a6cdaa7575d15b337c94bd0a7849` | stack cell `x/y`, `map+0x2d98/+0x2d9c` camera tile, `DAT_00aa4000/+4/+8/+c` viewport bounds로 projected `x/y`를 만든다. |
| lookup | `0x004bf9c4-0x004bf9d4`, raw `0x000bf9c4` | bytes `[0,9,8,2,10,1,12,5,11,13,3,6,0,4,7,0]`; SHA-256 `9df1139c03ffc0cb749f8cc292d6a07825f95d7cb52fe62c746f7cb3bc747dae`. |
| compositor | `FUN_0046a530`, `0x0046a530-0x0046a8e8` (end exclusive) | `map+0x4a0c4+x*180+y` family byte를 읽고 `0x3c`를 더해 common loader record를 고른다. entry range `0x0046a530-0x0046a5c8` SHA-256 `23bbcbfa9bc0ec79a979e3271a3251b8eab669d4a7767ae0de86054016284813`은 arg1 draw-left와 arg2 vertical adjustment를 먼저 만든다. |
| state-8 indexed-pixel remap | `FUN_00452b30`, `0x00452b30-0x00452c96` (end exclusive), SHA-256 `3dd28a807d474960f9578c724c01523853b404071b9856d7f3c692b9250a3f55` | object `+0x219a0`의 3-byte palette channel을 source/destination indexed pixel에서 읽고, red/blue `+0x864a0` 32×32·green `+0x86ca0` 64×64 LUT, packed 5:6:5, object `+0x19a0` lookup 순서로 destination indexed byte를 쓴다. |
| state-8 LUT initializer | `FUN_0044b680`, `0x0044b680-0x0044b734` (end exclusive), SHA-256 `ed47b21cd562a59214d614d4490cdbd2192382d3e1599498ce00f9cdad885e90` | `44b158` caller가 32×32/64×64 WORD LUT를 초기화한다. 유효 channel 입력에서 `q=trunc((limit-max)/limit)`를 거쳐 결과는 `min(source,destination)`과 같다. |
| loader records | base `0x00bcdff8`, stride `0x0bf8` | index `60..74`는 `fog0.spr..fog14.spr`, index `75`는 `black.spr`이다. |

fixture에는 위 함수들의 전체 byte range SHA-256, 의미 있는 instruction window의 VA/raw offset/bytes,
그리고 fog/black 16개의 resource index·runtime record address·source path·SHA-256·header를 모두
넣는다. 이는 `FUN_00443160`의 common tileset loader contract를 사용한 resource identity이며,
runtime record payload의 사람용 자료구조 이름을 확정하는 주장이 아니다.

## 정적 제어·데이터 흐름

1. `FUN_00467de0`은 먼저 `map+0x32514+x*180+y`의 low nibble을 읽는다. 값이 `0`이면 해당 cell의
   center/base 및 두 edge-mask call을 모두 건너뛰고 cell pass continuation으로 간다.
2. low nibble이 nonzero이면 `0x007d4d5e+x*180+y`의 center state를 읽는다. center state `8`은
   `FUN_00469510`에 literal state `8`, selector `1`을 넘긴 뒤 두 edge-mask path를 건너뛴다. center state가
   `0`이면 state `4` mask를 먼저 만든 뒤 state `8` mask를 만들고, 다른 nonzero center state는 state `4` mask를
   건너뛰고 state `8` mask만 만든다. 각 mask path는 해당 literal과 같은 인접 cell만 검사해 독립 byte mask를 만든다.
3. caller projection window에서 `x=[esp+0x14]`, `y=[esp+0x18]`, `cameraX=map+0x2d98`,
   `cameraY=map+0x2d9c`이며, viewport globals를 `left/top/right/bottom`으로 쓰면 다음과 같다.

   ```text
   projectedX = (x - y + cameraY - cameraX) * 32
              + left + trunc((right - left + 1) / 2)
   projectedY = (x + y - cameraX - cameraY) * 16
              + top + trunc((bottom - top + 1) / 2)
   ```

4. 각 mask 경로는 mask `0`과 `15`를 넘기지 않고, 나머지 `0..15` 값에서 `0x004bf9c4[mask]`를 읽어
   `FUN_0046a530(projectedX, projectedY, cellX, cellY, literalState, lookupSelector)`의 마지막 stack argument로
   전달한다. `0x00468864→0x0046a530`은 literal `4`, `0x00468982→0x0046a530`은 literal `8`이며, 둘 다
   selector/state/y/x/projectedY/projectedX 순서로 push한다.
5. `FUN_0046a530`은 검증한 byte address 식 `map + 0x4a0c4 + mapX * 180 + mapY`에서 family byte를
   읽고 `0x3c`를 더한다. 결과는 `0x00bcdff8 + index * 0x0bf8` common record selection으로 이어진다.
6. entry prologue는 `drawLeft = arg1 - 32`로 만든다. cell의 low nibble이 정확히 `2`인 in-bounds path는
   `0x0046a591→0x0046d650` helper result를 써 `drawTop = arg2 - (int16(helper)<<4)`로 만든다. 나머지 path는
   `0x0046a5a9→0x0046d650`을 거쳐 `drawTop = arg2 - ((abs(int16(helper))+1)<<4)`로 만든다. K01 corrected
   helper/raw-shift arithmetic는 [K01 tile placement boundary](k01-tile-placement-elevation-boundary.md)의
   `0x0046d69d..0x0046d6b4` derivation과 placement fixture를 단일 출처로 삼는다. 이전 all-helper-zero와
   raw `0/16`만의 분류는 주소 산술을 누락한 기존 잘못된 계산의 측정값이다.
7. state `4`는 `FUN_0044e3c0` call path, caller가 전달한 state `8`은 distinct
   `FUN_00452b30` call path를 사용한다. 각 path의 loop bound는 outer `< 3`, inner `< 2`이므로
   full tile은 6 subframe의 3×2 composite이다.

8. `FUN_00452b30`은 state `8` indexed pixel에 대해 object `+0x219a0`의 source/destination palette channel을
   읽고, red/blue의 limit `32` LUT와 green의 limit `64` LUT를 거친다. `FUN_0044b680`의 초기화 식은
   `maximum=max(source,destination)`, `minimum=min(source,destination)`,
   `q=trunc((limit-maximum)/limit)`, `output=minimum+q*minimum`이다. 유효한 `0..limit-1` 입력 전수에서
   공유하는 32×32 table(red/blue)과 하나의 64×64 table(green) 모두 output은 minimum과 같다. 세 channel은 packed 5:6:5 index로
   결합되고 object `+0x19a0`의 two-byte table을 거쳐 destination indexed byte가 된다. 따라서 opaque gray source는
   균일한 어두운 불투명 overlay가 아니라 destination intensity를 source channel minimum으로 제한하는 cap이다.
   이 분석은 palette channel/LUT/packed-index/lookup call path를 기록하지만 source palette lifecycle과 browser alpha/opacity가 native remap과
   같다고 주장하지 않는다.

이 문서는 bit의 방향 이름, mask의 사람용 뜻, 또는 두 state의 visibility 뜻을 지정하지 않는다. state `4`와 `8`의 renderer-side literal distinction은 여기서 유지하되, state `8` initialization·state `4` age·state `0` local-sight recomputation의 bounded producer lifecycle은 [별도 source fog visibility lifecycle evidence](source-fog-visibility-lifecycle.md)에 기록한다.

center/neighbor dispatch의 pure replay는 top state `4`와 right state `8`을 synthetic input으로 사용하면 center `0`에서
state `4` mask `3`→selector `2`, 이어 state `8` mask `10`→selector `3`을 반환한다. center `4`에서는 state `8` 호출만
남고, center `8`에서는 `FUN_00469510` base path만 남으며 edge call은 없다. low nibble `0`은 모든 call을 건너뛴다.
mask `0`과 `15`도 selector lookup/call을 생략해 base distinction을 보존한다. 주소 `0x004686e2-0x00468987`의 raw
range와 이 다섯 vector는 fixture의 `callerContract.dispatch`에 고정한다.

K01 hash-bound map의 해당 60×60 x-major byte stream은 SHA-256
`7a9fcc150cf0128af19d57f742a6c160c6b5b8b003a81c069fb3167427208f88`이고, observed domain은
`0..12,14`다. `0:2865`, `1:95`, `2:95`, `3:101`, `4:79`, `5:38`, `6:36`, `7:54`, `8:61`,
`9:52`, `10:33`, `11:35`, `12:55`, `14:1` cell이다. 이는 K01 hash-bound map byte의 범위·분포만
기록한다. runtime producer, lifetime, 다른 map의 file/runtime provenance 또는 사람용 뜻을 주장하지 않는다.

## caller projection·placement 재현 vector

pure reference는 signed 16-bit cell/camera, ordered signed 32-bit viewport와 signed 32-bit projected input만 받는다.
fraction, 범위 밖 word/int32, reversed viewport bounds, `0..15` 밖 low nibble은 즉시 거부한다. helper result는 명시적
signed 16-bit input이라 K01 밖의 positive/negative branch를 synthetic vector로 분리한다.

| scope | input/result |
| --- | --- |
| synthetic projection | `(x,y,cameraX,cameraY)=(3,5,1,2)`, viewport `(10,20)-(109,79)` → `projected=(28,130)` |
| synthetic low-nibble `2` | `projected=(200,100)`, helper `3` → `drawLeft=168`, `drawTop=52`, shift `48` |
| synthetic other branch | `projected=(200,100)`, helper `-1` → `drawLeft=168`, `drawTop=68`, shift `32` |
| K01 map vector | map camera `(13,8)`, explicit synthetic viewport `(0,0)-(639,479)`, cell `(0,0)` low nibble `1`, selector `2`, lookup `14`, helper `1` → `projected=(160,-96)`, `draw=(128,-128)`, shift `32` |
| K01 map vector | same camera/viewport, cell `(0,1)` low nibble `2`, selector `2`, lookup `15`, helper `2` → `projected=(128,-80)`, `draw=(96,-112)`, shift `32` |

명시적인 `640×480` K01 vector viewport는 산술을 재현 가능하게 만들기 위한 입력이며, 해당 viewport global이
`k01.map`에 저장된다는 주장이 아니다. K01 corrected raw-shift stream과 digest는
[placement evidence fixture](../../../analysis/fixtures/k01-tile-placement-elevation-evidence.json)와 이 문서의
fixture가 교차 고정한다. 이 stream은 placement correction의 canonical raw-shift domain을 소비한다.

`64×48` six-subframe composite에 대해서 이 caller/callee 한정 placement는 **local image anchor**를 `(32,0)`으로 닫는다:
`drawLeft=projectedX-32`, `drawTop=projectedY-rawVerticalShift`. 이는 renderer-wide pivot semantics, viewport ownership,
clipping/mode 또는 web adapter policy의 주장이 아니다.

## six-subframe frame algebra

normal `fog0.spr..fog14.spr` 15개는 source SHA-256에 더해 field bytes `+0x04/+0x08/+0x0c/+0x0bcc/+0x0bd0`
hash를 fixture에 고정한다. 모두 frame width `32`, height `16`, frame count `96`, atlas width `1024`,
atlas height `48`이다. `FUN_0046a530`은 record `+0x0bcc`를 record `+0x04`로 signed `IDIV`하여
`atlasColumns=32`를 얻고, `(atlasColumns - sign(atlasColumns)) >> 1`에서 `halfColumns=16`을 만든다.

caller table에서 nonzero/non-`15` mask가 전달할 selector는 `0..13`만이다. 이 nonnegative domain에서는
signed `IDIV`의 quotient/remainder가 각각 `trunc(selector / halfColumns)`,
`selector % halfColumns`와 같다. outer row `0..2`, inner column `0..1`의 frame index는 다음과 같다.

```text
inner + (outer + 3 * trunc(selector / halfColumns)) * atlasColumns
  + 2 * (selector % halfColumns)
```

따라서 normal fog header contract 아래 outer-major/inner-minor six-frame vector는 selector `s`에 대해
`[2s, 2s+1, 32+2s, 33+2s, 64+2s, 65+2s]`이고, caller domain 전체에서 `0..91`로 `frameCount=96`
안에 있다. 이것은 frame index만 복원하며, frame의 사람용 모양이나 state의 의미를 부여하지 않는다.

state `8` palette remap의 LUT replay는 destination/source channel pair 전수를 독립 계산한다. 공유 limit `32` table(red/blue)은
1,024 entries, limit `64`의 green table은 4,096 entries이고 모두 minimum channel과 일치한다. 대표
입력 source `(8,40,30)`, destination `(24,48,16)`은 remapped `(8,40,16)`, packed `0x4510`을 만든다. 최종
`object+0x19a0` lookup table의 palette contents와 runtime palette lifecycle은 이 fixture가 닫지 않는다.

## 재현 vector

| lookup input | output |
| --- | --- |
| 0, 1, 2, 3 | 0, 9, 8, 2 |
| 4, 5, 6, 7 | 10, 1, 12, 5 |
| 8, 9, 10, 11 | 11, 13, 3, 6 |
| 12, 13, 14, 15 | 0, 4, 7, 0 |

추출 test는 모든 16 vector, fog index `60..74`의 `32×16`/96-frame header, black index `75`의
`64×32`/1-frame header, `3×2=6` subframe contract를 독립적으로 확인한다. selector `0`, `9`, `13`의
frame vector는 각각 `[0,1,32,33,64,65]`, `[18,19,50,51,82,83]`, `[26,27,58,59,90,91]`이다. fixture
test는 fog atlas header byte `+0x0bcc` 변조가 SHA-256 오류로 추출 전에 중단하는지도 확인한다.
table-domain 밖의 mask와 caller-reachable `0..13` 밖의 selector는 helper에서 오류다.

## 제품 통합 경계

- [`export-source-fog-composites.mjs`](../../../tools/imjinrok/export-source-fog-composites.mjs)는 hash-bound
  `fog0..14.spr`의 각 caller selector `0..13`에 대해 2×3, `64×48` 투명 composite을 만든다. 각 결과는
  outer-major/inner-minor 순서로 `[2s, 2s+1, 32+2s, 33+2s, 64+2s, 65+2s]` 여섯 frame을 배치한다.
- 같은 생성기는 K01 `map+0x4a0c4+x*180+y` family byte를 browser-safe artifact으로 내보낸다. map의
  `fogVisualProfileId`와 tile의 `fogVisuals.familyIndex`는 일반 계약이며, K01 외 map은 profile을 생략해
  기존 generic fog를 유지하거나 mod가 별도 profile/family를 제공할 수 있다. source profile을 선택한 map의
  family 누락·범위 밖 값·unknown profile·누락 texture는 오류로 중단한다.
- client는 byte-proven 8-neighbor corner-bit construction(상/하 `0x3`/`0xc`, 좌/우 `0x5`/`0xa`,
  네 diagonal `0x1`/`0x2`/`0x4`/`0x8`)과 lookup table만 쓴다. product grid의 top/bottom/left/right 이름은
  source bit의 사람용 방향 의미 주장이 아니다.
- [visibility lifecycle evidence](source-fog-visibility-lifecycle.md)는 literal `0`=현재 local sight,
  `4`=explored, `8`=unseen을 정적 확정했다. client adapter는 product grid의 center state를 source dispatch에
  전달한다. 따라서 `visible`(literal `0`)도 low nibble이 nonzero이고 이웃 경계가 있으면 state `4` 뒤 state `8`의
  ordered boundary composite를 가질 수 있으며, `explored`(literal `4`)는 state `8` 경계만 가진다. `unseen`
  (literal `8`)은 edge composite 없이 `FUN_00469510` base path를 유지한다. low nibble `0` 또는 edge mask `0/15`는
  해당 call을 생략한다. 이 low-nibble gate와 mask omission은 pure source replay 사실이며, 현재 K01 adapter는
  hash-bound low-nibble 값이 모두 `1`/`2`인 source profile만 소비한다. 이 product-grid conversion은 source state
  의미와 분리된 adapter boundary다.
- base tile coverage/underlay는 fog edge dispatch와 별도로 유지한다. explored silhouette alpha `0.58`와 unseen edge의
  `sourceAlpha * (1 - max(R,G,B) / 255)` opacity는 gradient를 보존하기 위한 product adaptation이며, native
  `FUN_00452b30` palette remap 또는 browser alpha와 동등하다고 주장하지 않는다. `64×48` image의 product
  ground-contact placement와 visibility update scheduler도 **source-backed adaptation**이다. 이번 caller/callee slice의
  projected argument와 local `(32,0)` anchor와 corrected raw vertical-shift domain은 정적 확정했지만, 그것만으로
  full original surface clip/mode, renderer-wide pivot, alpha/blend 또는 web placement policy를 일반화하지 않는다.
- K01 hash-bound low-nibble stream은 값 `1`과 `2`만 관찰되므로 이 source profile의 현재 3,600 cell은 native
  nonzero dispatch admission을 만족한다. 다른 map/mod의 low-nibble producer·lifetime과 zero-gate wiring은 별도
  범위이며, 이 fixture의 pure replay를 arbitrary map runtime parity로 확장하지 않는다.
- source composite의 family/selector/six-frame identity는 보존한다. 현재 web adapter의 dark tint는 밝은
  source palette가 fog gap처럼 보이는 것을 막기 위한 제품 overlay policy이며 original palette/blend parity가 아니다.

## 미확인과 이식 경계

- product visibility lifecycle/grid conversion
- family byte의 runtime producer/lifetime 및 K01 밖 generic map-file provenance
- state-8 final palette-index table contents/runtime palette lifecycle, alpha/tint, scheduler/wall-clock behavior,
  web chunk scheduling, full renderer clip/mode·pixel pivot
- 현재 제품 neighbor mask/alpha와 원본 state·bit ordering의 대응

frame algebra는 caller-reachable selector와 normal fog header contract의 정적 범위에만 확정됐다.
제품 renderer parity 또는 asset bridge 변경의 근거는 아니다.
