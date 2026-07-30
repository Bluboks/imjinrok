# 원본 fog resource·mask·six-subframe renderer 경계

## 질문과 상태

질문: `FUN_00467de0`와 `FUN_0046a530`이 원본 fog 자원, 인접 mask lookup, state별 호출과
subframe 합성에 대해 바이트로 확정하는 범위는 어디까지인가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | `fog0..14`/`black` loader record, 16-byte lookup, literal state `4`/`8`의 별도 mask 경로, `map+0x4a0c4+x*180+y` family byte→record, 3×2 six-subframe loop·frame algebra와 두 call path |
| 재현 | 재현 완료 | EXE·SPR hash/header·atlas fields, K01 map hash·family-byte distribution, VA/raw offset/hash, 16 lookup vector, record address·frame vector와 loop bound의 결정론 추출 |
| 구현 | 부분 이식·의도적 적응 | 15×14 `64×48` six-subframe composite와 K01 x-major family stream은 재현했다. 제품 `unseen→4`/`explored→8`, alpha, scheduler, product-grid 방향과 world placement는 명시적 적응이다. |

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
offset으로 변환해 code/data range hash를 기록한다. test는 두 번의 JSON 생성이 committed fixture와
byte-identical인지와 lookup의 16 입력·출력 및 six-subframe frame vector를 확인한다.

## 함수·자료 주소

| 항목 | 주소/범위 | 정적 사실 |
| --- | --- | --- |
| caller | `FUN_00467de0`, `0x00467de0-0x004689ce` (end exclusive) | 각 cell에서 literal state `4`, literal state `8`에 대해 별도의 8-neighbor mask build 경로를 둔다. nonzero·non-`0x0f` mask만 lookup/call에 도달한다. |
| lookup | `0x004bf9c4-0x004bf9d4`, raw `0x000bf9c4` | bytes `[0,9,8,2,10,1,12,5,11,13,3,6,0,4,7,0]`; SHA-256 `9df1139c03ffc0cb749f8cc292d6a07825f95d7cb52fe62c746f7cb3bc747dae`. |
| compositor | `FUN_0046a530`, `0x0046a530-0x0046a8e8` (end exclusive) | `map+0x4a0c4+x*180+y` family byte를 읽고 `0x3c`를 더해 common loader record를 고른 뒤 state별 3×2 path와 proven frame algebra로 합성한다. |
| loader records | base `0x00bcdff8`, stride `0x0bf8` | index `60..74`는 `fog0.spr..fog14.spr`, index `75`는 `black.spr`이다. |

fixture에는 위 두 함수 전체의 byte range SHA-256, 의미 있는 instruction window의 VA/raw offset/bytes,
그리고 fog/black 16개의 resource index·runtime record address·source path·SHA-256·header를 모두
넣는다. 이는 `FUN_00443160`의 common tileset loader contract를 사용한 resource identity이며,
runtime record payload의 사람용 자료구조 이름을 확정하는 주장이 아니다.

## 정적 제어·데이터 흐름

1. `FUN_00467de0`은 state `4`와 state `8`을 같은 mask accumulator로 합치지 않는다. 각 경로는
   해당 literal과 같은 인접 cell만 검사해 byte mask를 만든다.
2. 각 경로는 mask `0`과 `15`를 넘기지 않고, 나머지 `0..15` 값에서 `0x004bf9c4[mask]`를 읽어
   `FUN_0046a530`의 마지막 stack argument로 전달한다. caller는 각각 literal `4`, `8`도 전달한다.
3. `FUN_0046a530`은 검증한 byte address 식 `map + 0x4a0c4 + mapX * 180 + mapY`에서 family byte를
   읽고 `0x3c`를 더한다. 결과는 `0x00bcdff8 + index * 0x0bf8` common record selection으로 이어진다.
4. state `4`는 `FUN_0044e3c0` call path, caller가 전달한 state `8`은 distinct
   `FUN_00452b30` call path를 사용한다. 각 path의 loop bound는 outer `< 3`, inner `< 2`이므로
   full tile은 6 subframe의 3×2 composite이다.

이 문서는 bit의 방향 이름, mask의 사람용 뜻, 또는 두 state의 visibility 뜻을 지정하지 않는다.

K01 hash-bound map의 해당 60×60 x-major byte stream은 SHA-256
`7a9fcc150cf0128af19d57f742a6c160c6b5b8b003a81c069fb3167427208f88`이고, observed domain은
`0..12,14`다. `0:2865`, `1:95`, `2:95`, `3:101`, `4:79`, `5:38`, `6:36`, `7:54`, `8:61`,
`9:52`, `10:33`, `11:35`, `12:55`, `14:1` cell이다. 이는 K01 hash-bound map byte의 범위·분포만
기록한다. runtime producer, lifetime, 다른 map의 file/runtime provenance 또는 사람용 뜻을 주장하지 않는다.

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
- `unseen→literal state 4`, `explored→literal state 8`, explored alpha `0.58`, `64×48` image의
  ground-contact placement와 visibility update scheduler는 **source-backed adaptation**이다. K01에서 tile
  placement evidence가 내보낸 cell별 asset-native y offset은 terrain·explicit base fog·source composite에
  같은 helper로 적용하지만, raw source axis/pivot의 원작 일치는 주장하지 않는다. 원본이 두 literal state에
  부여한 visibility 의미, pixel pivot/alpha와 wall-clock cadence는 여전히 미확인이다.
- source composite의 family/selector/six-frame identity는 보존한다. 현재 web adapter의 dark tint는 밝은
  source palette가 fog gap처럼 보이는 것을 막기 위한 제품 overlay policy이며 original palette/blend parity가 아니다.

## 미확인과 이식 경계

- state `4`/`8`의 visible, explored, unseen 등 사람용 semantics
- family byte의 runtime producer/lifetime 및 K01 밖 generic map-file provenance
- scheduler/wall-clock behavior, pixel placement/pivot
- 현재 제품 visibility/neighbor mask/alpha와 원본 state·bit ordering의 대응

frame algebra는 caller-reachable selector와 normal fog header contract의 정적 범위에만 확정됐다.
제품 renderer parity 또는 asset bridge 변경의 근거는 아니다.
