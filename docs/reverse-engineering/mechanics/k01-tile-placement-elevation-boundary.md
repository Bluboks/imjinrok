# K01 tile placement-level·object/frame boundary

## 질문과 상태

질문: **해시를 고정한 K01 map cell에서 `FUN_00464cc0`·`FUN_00464ea0`은 runtime WORD adjustment table과 `FUN_0046d650` 반환으로 output Y를 어떻게 보정하고, `FUN_00469330`·`FUN_00469510`은 어떤 byte로 두 번째 raw placement argument와 object/frame payload를 만드는가?**

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | `정적 확정` | `FUN_00462b80` 8-byte-stride WORD initializer, `FUN_00464cc0`/`FUN_00464ea0` table reader의 두 branch, signed-word x/y guard와 `(x-y)<<5`/`(x+y)<<4`, 두 caller의 low-nibble branch, direct helper의 전체 return 분기, K01 `60×60` cell의 selector/lookup·object/frame fields |
| 재현 | `재현 완료` | corrected 3,600-cell map replay, placement/projection/compositor fixture·digest, corner/synthetic vectors와 malformed/tampered input 거부 |
| 구현 | `source-backed-adaptation` + `의도적 적응` | hash-bound K01의 corrected raw second-argument delta stream을 `TileCell.elevation`과 분리해 source placement offset으로만 소비한다. K01 authored/product physical surface는 의도적으로 neutral하여 3,600개 모두 `TileCell.elevation=0`이며, 이는 원본 physical elevation을 복원한 주장이 아니다. bounded source raster는 `(32,0)` top-edge anchor와 opaque black clear 뒤 selected frame global y→x replay를 사용한다. 별도의 map-level `sourceRasterCoverage` policy가 canonical `grss1_0000`을 먼저 replay하는 것은 의도적 적응이다. |

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
그리고 helper call edge `0x00464d00`, `0x00464d6e`, `0x00464dab`, `0x00469391`, `0x004693a9`, `0x00469575`, `0x0046958b`와 raster caller edge `0x00467160→FUN_00469510`을 검사한다.

| 함수 | raw byte range (끝 제외) | 역할을 확정한 범위 |
| --- | --- | --- |
| `FUN_00464cc0` | `0x00464cc0-0x00464dde` | signed x/y admission, `(x-y)<<5`/`(x+y)<<4` base output, `+0x4a0c4` byte-indexed runtime WORD-table addition과 low-nibble/helper relative branch |
| `FUN_00462b80` | `0x00462b80-0x00462bab` | `DAT_00c06e86`에서 시작하는 8-byte-stride runtime WORD adjustment table의 15-entry init loop와 adjacent zero-WORD write |
| `FUN_00464ea0` | `0x00464ea0-0x00465002` | 같은 family-indexed table WORD와 low-nibble/helper branch를 output WORD에 더하는 second reader |
| `FUN_00466f20` | `0x00466f20-0x004676e0` | full-map surface dimensions, y-outer/x-inner raster order, screen point formation과 `FUN_00469510` dispatch |
| `FUN_00469330` | `0x00469330-0x0046950c` | `argument1 - 0x1f`, low-nibble branch, argument 2 vertical adjustment, object/frame loader path |
| `FUN_00469510` | `0x00469510-0x00469917` | `argument1 - 0x20`, 같은 low-nibble/helper adjustment, object/frame loader path와 local mode/clip gate |
| `FUN_0046d650` | `0x0046d650-0x0046d6d8` | signed-word bounds, selector/lookup와 모든 return branch |

`FUN_00469510` entry stack에서 x/y는 `argument3`/`argument4`의 low signed word다. `argument1`의 fixed
subtract와 `argument2`의 helper-derived subtract는 별도이다. 이 evidence는 raw argument가 screen/world의 어느 축인지
정하지 않는다.

## 2026-09 lookup arithmetic correction

초기 문서의 `FUN_0046d650` lookup 식은 `0x0046d69d..0x0046d6b4`의 마지막 `LEA` 네 배를 반영하지
않았다. 그 식으로 byte hash와 수식을 함께 재생하면 lookup이 K01 전수에서 0으로 고정되어 helper와
raw shift가 모두 낮게 보인다. 이는 map 또는 PNG 손상이 아니라 주소 산술을 덜 복원한 **반증된 이전
해석**이다.

원본 명령어는 다음 순서로 selector, x, y와 map base를 합친다.

| VA | 명령어가 고정하는 값 |
| --- | --- |
| `0x0046d69d` | `ESI = selector + selector*4` → selector `×5` |
| `0x0046d6a0` | `ESI = ESI + ESI*8` → selector `×45` |
| `0x0046d6a3` | `EDX = x + selector*180 + 0x749` |
| `0x0046d6ab` | `EDX = EDX + EDX*4` → 중간 식 `×5` |
| `0x0046d6ae` | `EDX = EDX + EDX*8` → 중간 식 `×45` |
| `0x0046d6b1` | `EDX = y + EDX*4` → selector `×0x7e90`, x `×180`, base `0x51f54` |
| `0x0046d6b4` | `BYTE [map + EDX]` 최종 lookup read |

따라서 corrected lookup은 다음이다.

```text
lookup = uint8(map + 0x51f54 + selector*0x7e90 + x*180 + y)
```

이 correction의 분석 상태는 `정적 확정`이고, 이전 `0x147d5 + selector*0x1fa4` 식은 `반증됨`이다.
독립 raw-map replay와 hash-bound fixture는 다음을 고정한다.

| vector | selector | corrected lookup | helper return | raw shift |
| --- | ---: | ---: | ---: | ---: |
| `(x,y)=(0,0)` | `2` | `14` | `1` | `32` |
| `(x,y)=(0,1)` | `2` | `15` | `2` | `32` |

K01 3,600-cell corrected raw-shift histogram은 `0:1331, 16:617, 32:1335, 48:128, 64:189`이며,
기존 baseline과 raw shift가 다른 cell은 `1,961`개다. selected-source logical-footprint diagnostic은
uncovered `5,139`, mixed-boundary `3,918`, nonzero `2,269`, mixed-edge `717`을 독립 산출했지만, 이
값들은 CPU alpha-vs-logical-diamond 측정이며 원본 runtime 증거나 full visual/browser parity가 아니다.
재현 산출물은 [placement evidence fixture](../../../analysis/fixtures/k01-tile-placement-elevation-evidence.json),
[cell projection fixture](../../../analysis/fixtures/k01-cell-projection-evidence.json),
[fog render fixture](../../../analysis/fixtures/source-fog-render-evidence.json),
[gameplay compositor fixture](../../../analysis/fixtures/k01-gameplay-terrain-compositor.json),
[terrain diagnostic](../../../analysis/fixtures/k01-terrain-diagnostic.json)이다.

`FUN_00464cc0`도 같은 signed bounds 뒤 output pair에 먼저 다음 값을 쓴다.

```text
outputX = (int32(x) - int32(y)) << 5
outputY = (int32(x) + int32(y)) << 4
fogFamily = uint8(map + 0x4a0c4 + x*180 + y)
tableWord = int16(DAT_00c06e86 + fogFamily*8)

if lowNibble == 2:
  outputY += tableWord + 16 - (helperReturn << 4)
else:
  outputY += tableWord - (abs(helperReturn) << 4)
```

`map+0x4a0c4`는 별도 `FUN_0046a530` 범위에서 fog-family byte로 정적 확정됐다. 이 문서는 table을 사람용
height/elevation이 아닌 중립어 **runtime WORD adjustment table**로 부른다. 따라서 이 식만으로 original terrain
height 또는 web pixel pivot을 주장하지 않는다.

## runtime WORD adjustment table의 initializer·reader 계약

`FUN_00462b80`의 hash-bound byte range SHA-256은
`16eccbef8061d2dee5635288d64af3c85535cfb5d96c67347ae1d59ad4b0dc1c`다. `EAX=0x00c06e86`,
`ECX=EDX=0`에서 시작해 각 loop가 `WORD [EAX-2]=0`, `EAX+=8`, `EDX+=9` 뒤 `WORD [EAX-8]=DX`를 수행한다.
`CMP EAX,0x00c06efe`는 table write **전에** 실행되지만, 그 write 뒤의 `JL`만 다음 iteration을 결정한다.
따라서 exact byte replay 결과 indexed family `0..14`의 15 entries가 쓰인다.

byte anchor `0x00462b80`은 base/zero/first-family decision을, `0x00462b92`는 adjacent write·`+8`·`+9`·terminal compare·indexed write를 고정한다. reader body hash는 `FUN_00464cc0`이 `40b41b7ce95c3e7516c0bf2f6d01f1e86bf2848ed0ec5256f63d7858f55a1d10`, `FUN_00464ea0`이 `c80b1952885965178d3093b88d8963de89f43c2c49a6ba414d46847d9e1fba0d`다. `0x00464d6a`/`0x00464da7`와 `0x00464f99`/`0x00464fcb` byte anchor는 각각 두 reader의 low-nibble-two/other formula를 고정한다.

| family | indexed WORD offset from `DAT_00c06e86` | written value |
| --- | --- | --- |
| `0` | `0` | `0` |
| `1..14` | `family * 8` (`8..112`) | `9` |

인접 zero-WORD write도 15회이며 offset `-2..110` (8-byte stride), 값은 모두 `0`이다. 이는 indexed table entry와
혼동하지 않는다. 해당 15-entry initializer replayer는 이 exact count·offset·value를 fixture와 test vector로 고정한다.

`references.json`에서 `DAT_00c06e86`의 hash-bound **direct** reference는 정확히 여섯 개다.

| function | VA | type |
| --- | --- | --- |
| `FUN_00462b80` | `0x00462b80` | `DATA` |
| `FUN_00462b80` | `0x00462ba4` | `WRITE` |
| `FUN_00464cc0` | `0x00464d7d`, `0x00464dbc` | `DATA` |
| `FUN_00464ea0` | `0x00464fae`, `0x00464fe6` | `DATA` |

두 reader는 family byte를 `family*8` stride로 signed WORD로 읽고 같은 output-Y contract를 적용한다.

```text
tableWord = int16(DAT_00c06e86 + family * 8)
if lowNibble == 2:
  outputY += tableWord + 16 - (int16(helperReturn) << 4)
else:
  outputY += tableWord - (abs(int16(helperReturn)) << 4)
```

K01의 family byte는 `0:2865, 1:95, 2:95, 3:101, 4:79, 5:38, 6:36, 7:54, 8:61, 9:52, 10:33, 11:35, 12:55, 14:1`이며,
initializer의 `0..14` domain 안에 있다. 이 direct-reference inventory는 alias/computed writer가 없다는 주장도,
table의 lifetime·ordering 또는 사람용 의미를 확정하는 주장도 아니다.

## field layout과 정확한 수식

유효 cell은 `0 <= x < map+0x2da0`, `0 <= y < map+0x2da4`이며 K01은 `60×60`이다. 모든 식은 x-major
`x * 180 + y`를 사용한다.

```text
lowNibble = uint8(map + 0x32514 + x*180 + y) & 0x0f
selector  = uint8(map + 0x79824 + x*180 + y)
lookup    = uint8(map + 0x51f54 + selector*0x7e90 + x*180 + y)

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
`FUN_00466f20` caller 범위에서는 `FUN_00469510`의 first/second arguments가 아래 `screenX/screenY`로 고정되며,
draw rectangle도 제한적으로 복원된다. 이 사실은 다른 caller의 axis/pivot 일반화가 아니다.

source byte는 정확히 다음과 같다.

```text
objectIndex = uint8(map + 0x3a3a4 + x*180 + y)
frameIndex  = uint8(map + 0x42234 + x*180 + y)
```

`FUN_00469510`은 `objectIndex`를 main loader record로 scale하고 downstream clip/mode draw selection 전에
`frameIndex`를 읽는다. 기존 selector fixture도 이 extractor가 다시 생성해 모든 K01 object/frame pair가
검증된 normal-source header 범위 안임을 확인한다. downstream mode/clip call에 terrain 또는 web-renderer
의미를 부여하지 않는다.

## K01 full-map raster caller

`FUN_00466f20`의 hash-bound complete body와 `0x00467160→FUN_00469510` call edge는 K01 main raster의
제한된 caller 범위를 고정한다. surface buffer는 `map.width*64` by `map.height*32+200`이고, loop는 **y outer,
x inner**다. 각 cell은 다음을 만들어 `FUN_00469510(argument1, argument2, x, y)`로 넘긴다.

```text
screenX = (x-y)*32 + map.width*32
screenY = (x+y)*16 + 200
drawLeft = screenX - 32
drawTop  = screenY - verticalShift
```

K01에서 corrected `rawShift`는 `0:1331, 16:617, 32:1335, 48:128, 64:189`이다. low-nibble/family
분포는 유지되지만 이전 `0/16`만의 vertical-shift 주장은 폐기한다. 이 범위는 selected frame의
full-raster order와 bounded draw rectangle만 확정한다. default gameplay compositor의
target `640×384`, clip `0..639/0..383`, mode-0 direct YTL blit, index-0 base clear와 `imjin2`/`night1`~`night4`
palette entry-0 RGB(0,0,0)은 gameplay compositor fixture에서 정적 확정됐다. auxiliary/nondefault callee path, general frame
pivot/axis, payload alpha semantics와 full renderer parity는 아직 미확정이다.

## K01 complete result

compact fixture는 low nibble, helper selector/lookup/return, branch, shift, object, frame을 담은 cell당 8-byte
x-major stream SHA-256 `510f65ea32bf993466e31126b0528dbd127175f3c6bb91ab42e20f3e6ed3c496`를 고정한다.
전체 분포는 다음과 같다.

| field/result | counts |
| --- | --- |
| helper selector | `0:1331`, `1:617`, `2:1335`, `3:128`, `4:189` |
| helper lookup | `1:61, 2:38, 3:95, 4:54, 5:79, 6:1, 7:55, 8:36, 10:95, 11:35, 12:101, 13:52, 14:33, 15:2865`; stream SHA-256 `e7331ac9f6c848074249f9b44c2fa4da3b372afff01b8a34efa6695aa66d9260` |
| helper return | `0:1639`, `1:616`, `2:1115`, `3:74`, `4:156` |
| low nibble | `1:735`, `2:2865` |
| raw shift | `0:1331`, `16:617`, `32:1335`, `48:128`, `64:189`; stream SHA-256 `4b58471674a5e89bb553cb995474a3847458eb9e295d68aef057439093b0fb52` |

따라서 helper의 양수·음수 branch와 corrected K01 lookup은 분리해 기록한다. corrected K01 결과를
elevation, height, terrain 또는 world coordinate라고 부를 근거는 없으며, 이 문서는 중립어
**placement-level selector**를 사용한다. 이전 `helper return 0:3600` 및 그에 따른 `raw shift 0/16`은
기존 잘못된 계산의 측정값이다.

제품 K01 adapter가 소비하는 별도 raw relative stream은 corrected `FUN_00469510` second-argument adjustment를
source image placement offset으로만 보존한다. 이 값은 physical surface height나
full-original elevation parity가 아니라 **source-backed adaptation**이다.

fixture의 map-corner vector도 source value를 고정한다. corrected `(0,0)`은 low nibble 1/object 0/frame 39,
selector 2/lookup 14/helper 1/raw shift 32이고, `(0,1)`은 low nibble 2/object 0/frame 4,
selector 2/lookup 15/helper 2/raw shift 32이다. `(59,59)`는 low nibble 2/object 31/frame 18,
selector 4/lookup 15/helper 4/raw shift 64이다.

## 제품 adapter 경계

`export-k01-source-tile-visuals.mjs`는 canonical placement-evidence fixture를 다시 검증한 뒤 corrected raw
second-argument delta를 source placement metadata로 보존해야 한다. corrected domain은 `0`, `16`, `32`, `48`,
`64`이며, 이 값은 `TileCell.elevation`이나
bilinear ground contact로 변환하지 않는다. K01 scaffold의 authored/product physical surface는 의도적으로
neutral하여 3,600개 모두 `TileCell.elevation=0`이다. 이는 원본 physical elevation을 복원했다는 뜻이 아니며,
selected flat artwork의 visual metadata와 product physical surface는 별도 채널이다.

`FUN_00466f20` 범위의 raster arithmetic에 맞춘 product source-image adapter는 `64×48`, anchor `(32,0)`을 쓴다.
cell의 corrected raw shift에 signed source offset을 부여한다. source raster
plan은 tile chunk order를 사용하지 않고 output world rectangle을 non-overlapping pixel regions으로만 나눈 뒤, 각 region을
먼저 opaque `sourceRasterClearColor=0x000000`으로 채우고 full selected stream을 global **y→x** order로 replay한다. 이
bounded order는 original caller에서 정적 확정됐지만 product region partition 자체는 scalable web adaptation이다.

K01 제품 모드는 map-level `sourceRasterCoverage`에서 canonical `k01-source:grss1:0000`을 선언하고 모든 셀에
selected frame의 source offset을 적용해 coverage pass를 먼저 replay한다. 이는 원본 draw-layer가 아니라 의도적 적응이며,
native-exact 모드는 selected frame payload의 내부 빈칸을 검은 clear 영역으로 그대로 유지한다. generic/mod map은 필요할
때만 별도의 coverage policy를 선택할 수 있다. explicit fog base 역시 source offset을 별도 placement metadata로만
소비한다. fog tint, alpha, visibility semantics와 source fog composite의 pivot은
원작에서 확정된 범위가 아니다.

## Reproduction and failure boundary

```sh
pnpm imjinrok:extract-k01-tile-placement-elevation-evidence
node --test tools/imjinrok/k01-tile-placement-elevation-evidence.test.mjs
node --test tools/imjinrok/k01-terrain-composition-coverage.test.mjs
pnpm imjinrok:extract-k01-gameplay-terrain-compositor
node --test tools/imjinrok/k01-gameplay-terrain-compositor.test.mjs
```

pure reference reproducer는 signed 16-bit x/y와 signed 32-bit raw argument를 받으며, `FUN_00464cc0` projection은
table WORD를 explicit signed WORD input으로 받는다. 별도 initializer replayer와 shared reader vector는 exact 15-entry
domain과 low-nibble two/other formula를 재현하고 malformed table/domain을 fail closed 한다. out-of-bounds direct-helper query에는 `-1`을 반환하지만,
`FUN_00469510`의 뒤쪽 object/frame memory access를 map bounds 밖에서 재현하려 하기 전 fail closed 한다. test는
fog-family offset까지 닿지 못하는 malformed buffer, fraction/out-of-range argument와 EXE/map/functions JSON/references JSON의
한 byte 변조를 report 발행 전에 거부한다.

## 미확정 경계

- `FUN_0046d650` result의 사람용 height/elevation/terrain 의미와 writer/lifecycle은 미확정이다.
- `DAT_00c06e86`의 `FUN_00462b80` direct init values는 복원했지만, alias/computed writer, complete lifetime/order와 human semantics은 미확정이다.
- auxiliary/nondefault caller의 raw argument 1/2 screen/world axis, general pixel anchor/pivot, non-default
  clipping/mode callee semantics은 미확정이다. 위의 default gameplay target/clip/mode-0 path는 별도 fixture로
  제한적으로 확정했다.
- 다른 map/theme의 table contents와 original renderer 전체, product renderer parity는 이 범위 밖이다.
- `field_0x00032514`의 direct writer set과 alias/computed writer boundary는
  [별도 low-nibble writer 분석](k01-map-low-nibble-writers.md)을 따른다.
