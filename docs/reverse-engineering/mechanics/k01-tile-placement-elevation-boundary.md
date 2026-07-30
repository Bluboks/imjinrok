# K01 tile placement-level·object/frame boundary

## 질문과 상태

질문: **해시를 고정한 K01 map cell에서 `FUN_00469330`·`FUN_00469510`은 어떤 byte와 `FUN_0046d650` 반환으로 두 번째 raw placement argument를 보정하고, 어떤 object/frame byte를 loader payload 경계까지 전달하는가?**

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | `정적 확정` | 두 caller의 signed-word x/y guard, `lowNibble == 2`/other 수식, direct helper의 전체 return 분기, K01 `60×60` cell의 selector/lookup·object/frame fields |
| 재현 | `재현 완료` | 3,600-cell x-major stream/digest·분포, low-nibble two/other, 네 map corner, helper의 synthetic positive/negative branch와 malformed/tampered input 거부 |
| 구현 | `부분 이식·source-backed product adaptation` | hash-bound K01의 `0/-16` second-argument 결과를 셀별 asset-native `sourcePixelOffset.y`로 내보내고, terrain·explicit fog base·source fog composite가 같은 web ground-contact helper로 소비한다. raw argument 축·pivot은 여전히 미확정이다. |

이것은 기존 [K01 source tile object·frame selector](k01-source-tile-selector.md)의 **다음 placement 경계**다.
기존 문서의 object/frame source identity와 3,600 pair frame-bound proof를 그대로 hash-bound로 재검증하지만,
그 문서의 selector identity 또는 제품 adapter를 다시 정의하지 않는다.

## 고정 입력과 정적 provenance

| 입력 | 크기 / SHA-256 |
| --- | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 / `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `original/imjinrok2/stagemap/k01.map` | 1,097,100 / `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` |
| `analysis/generated/imjinrok2/functions.json` | 1,468,333 / `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` |
| `analysis/generated/imjinrok2/references.json` | 17,206,569 / `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` |

생성기는 generated JSON의 전체 hash와 `sourceSha256`, 다음 함수의 Ghidra body/instruction digest, raw body digest,
그리고 helper call edge `0x00469391`, `0x004693a9`, `0x00469575`, `0x0046958b`를 검사한다.

| 함수 | raw byte range (끝 제외) | 역할을 확정한 범위 |
| --- | --- | --- |
| `FUN_00469330` | `0x00469330-0x0046950c` | `argument1 - 0x1f`, low-nibble branch, argument 2 vertical adjustment, object/frame loader path |
| `FUN_00469510` | `0x00469510-0x00469917` | `argument1 - 0x20`, 같은 low-nibble/helper adjustment, object/frame loader path와 local mode/clip gate |
| `FUN_0046d650` | `0x0046d650-0x0046d6d8` | signed-word bounds, selector/lookup와 모든 return branch |

`FUN_00469510` entry stack에서 x/y는 `argument3`/`argument4`의 low signed word다. `argument1`의 fixed
subtract와 `argument2`의 helper-derived subtract는 별도이다. 이 evidence는 raw argument가 screen/world의 어느 축인지
정하지 않는다.

## field layout과 정확한 수식

유효 cell은 `0 <= x < map+0x2da0`, `0 <= y < map+0x2da4`이며 K01은 `60×60`이다. 모든 식은 x-major
`x * 180 + y`를 사용한다.

```text
lowNibble = uint8(map + 0x32514 + x*180 + y) & 0x0f
selector  = uint8(map + 0x79824 + x*180 + y)
lookup    = uint8(map + 0x147d5 + selector*0x1fa4 + x*180 + y)

FUN_0046d650(map, x, y):
  if x/y outside the signed bounds: return int16(-1)
  if lookup == 15: return selector
  if lookup != 0: return selector - 1
  return 0

if inBounds && lowNibble == 2:
  adjustedArgument2 = argument2 - (helperReturn << 4)
else:
  adjustedArgument2 = argument2 - ((abs(int16(helperReturn)) + 1) << 4)
```

`FUN_00469330` uses the same branch but first forms `argument1 - 31`; `FUN_00469510` first forms `argument1 - 32`.
Neither fixed subtract supplies enough evidence to name a screen axis or pixel anchor.

source byte는 정확히 다음과 같다.

```text
objectIndex = uint8(map + 0x3a3a4 + x*180 + y)
frameIndex  = uint8(map + 0x42234 + x*180 + y)
```

`FUN_00469510`은 `objectIndex`를 main loader record로 scale하고 downstream clip/mode draw selection 전에
`frameIndex`를 읽는다. 기존 selector fixture도 이 extractor가 다시 생성해 모든 K01 object/frame pair가
검증된 normal-source header 범위 안임을 확인한다. downstream mode/clip call에 terrain 또는 web-renderer
의미를 부여하지 않는다.

## K01 complete result

compact fixture는 low nibble, helper selector/lookup/return, branch, shift, object, frame을 담은 cell당 8-byte
x-major stream SHA-256 `78d0d96e0157e60cf9d2e2e4325941510f8911dbc9a57422ad00220874ad406c`를 고정한다. 전체 분포는 다음과 같다.

| field/result | counts |
| --- | --- |
| helper selector | `0:1331`, `1:617`, `2:1335`, `3:128`, `4:189` |
| helper lookup | `0:3600` |
| helper return | `0:3600` |
| low nibble | `1:735`, `2:2865` |
| vertical subtract | `0:2865`, `16:735` |

따라서 helper의 양수·음수 branch는 byte에서 synthetic selector/lookup vector로 재현했지만, **해시를 고정한 K01
cell에는 나타나지 않는다**. K01 결과를 elevation, height, terrain 또는 world coordinate라고 부를 근거는 없으며,
이 문서는 중립어 **placement-level selector**를 사용한다.

fixture의 map-corner vector도 source value를 고정한다. `(0,0)`은 low nibble 1/object 0/frame 39/shift 16,
`(0,1)`은 low nibble 2/object 0/frame 4/shift 0, `(59,59)`은 low nibble 2/object 31/frame 18/shift 0이다.

## 제품 adapter 경계

`export-k01-source-tile-visuals.mjs`는 canonical placement-evidence fixture를 다시 검증한 뒤, 각 cell의
`verticalShift`를 `0` 또는 asset-native `-16` pixel `sourcePixelOffset.y` stream으로 생성한다. `0`은 2,865,
`-16`은 735개이며, 이 부호와 web y축 해석은 **source-backed product adaptation**이다. 이 선택은 source의
두 번째 raw argument에 실제로 뺀 값을 web renderer의 y translation으로 소비하기 위한 일관된 제품 계약일
뿐, raw argument가 screen-y/world-y이거나 source pivot이 `(32,16)`이라는 원작 일치 주장이 아니다.

explicit terrain placement와 world/chunk bounds, explicit fog base, source fog composite는 이 offset을 같은
ground-contact helper로 적용한다. source fog의 64×48 composite는 frame family/selector identity를 유지하되,
흰색·회색 원본 팔레트가 fog gap처럼 보이지 않도록 product fog tint `0x020608`을 적용한다. tint, alpha,
visibility semantics와 pixel pivot은 원작에서 확정된 범위가 아니다.

## Reproduction and failure boundary

```sh
pnpm imjinrok:extract-k01-tile-placement-elevation-evidence
node --test tools/imjinrok/k01-tile-placement-elevation-evidence.test.mjs
```

pure reference reproducer는 signed 16-bit x/y와 signed 32-bit raw argument만 받는다. out-of-bounds direct-helper
query에는 `-1`을 반환하지만, `FUN_00469510`의 뒤쪽 object/frame memory access를 map bounds 밖에서 재현하려 하기
전 fail closed 한다. test는 malformed buffer, fraction/out-of-range argument와 EXE/map/functions JSON/references JSON의
한 byte 변조를 report 발행 전에 거부한다.

## 미확정 경계

- `FUN_0046d650` result의 사람용 height/elevation/terrain 의미와 writer/lifecycle은 미확정이다.
- raw argument 1/2의 screen/world axis, exact pixel anchor/pivot, clipping/mode callee semantics은 미확정이다.
- 다른 map/theme의 table contents와 original renderer 전체, product renderer parity는 이 범위 밖이다.
- `field_0x00032514`의 direct writer set과 alias/computed writer boundary는
  [별도 low-nibble writer 분석](k01-map-low-nibble-writers.md)을 따른다.
