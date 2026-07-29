# K01 source tile object·frame selector

## 질문과 상태

질문: K01 map의 어느 byte가 `FUN_00469330`에서 main tileset loader object와 source sprite frame을 선택하는가?

| 구분 | 상태 | 범위 |
| --- | --- | --- |
| 분석 | 정적 확정 | K01 `60×60`, theme 0 normal, object/frame byte address, loader record object index·frame bounds |
| 재현 | 재현 완료 | 3,600 coordinate pair digest, object별 frame range, bounds/invalid object/invalid frame 및 source 변조 거부 |
| 구현 | 부분 이식 | K01에만 exact object/frame→명시적 flat visual key/PNG를 연결; terrain/passability/elevation은 기존 product scaffold 유지 |

## 원본 입력과 byte 경로

- `original/imjinrok2/imjinrok2.exe`: SHA-256 `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`.
- `original/imjinrok2/stagemap/k01.map`: SHA-256 `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb`.
- [`imjinrok-tileset-loader-boundary.json`](../../../analysis/fixtures/imjinrok-tileset-loader-boundary.json)과
  [`imjinrok-environment-assets.json`](../../../analysis/fixtures/imjinrok-environment-assets.json)을 함께 hash-bound로 다시 검증한다.

`FUN_00469330`은 signed coordinate를 map `+0x2da0` width와 `+0x2da4` height로 먼저 검사한다. 유효 `(x,y)`에서
다음 두 unsigned byte를 읽는다.

```text
objectIndex = uint8(map + 0x3a3a4 + x * 180 + y)
frameIndex  = uint8(map + 0x42234 + x * 180 + y)
```

`objectIndex`는 loader base `0x00bcdff8`, stride `0x0bf8`의 record를 고른다. 그 record의 copied header offset
table(`+0x4c0`)와 payload pointer(`+0x0bf4`)가 source frame draw에 전달된다. `FUN_00469510`도 같은 두 map field와
record scale을 반복한다. `map +0x32514` low nibble은 다른 lift/branch에만 쓰이며 이 selector identity가 아니다.

저장 순서는 **x-major**다: `ordinal = x * height + y`, address stride는 180이다. 이는 기존 제품의 row-major
`K01_TERRAIN_RLE` heuristic serialization과 다르며, 그 RLE을 object/frame selector로 해석하지 않는다.

## K01 결과와 fixture

K01 themeId는 0이므로 normal source catalog와 결합한다. 3,600개 pair는 모두 valid source frame 범위 안에 있다.
사용 object index는 `0..13`, `16..28`, `31..43`이고, 각각 loader table의 `hill0..13`, `diff1..13`,
`grss1..13`에 해당한다. unique object/frame pair는 243개다. 완전 stream은 fixture의 x-major pair-byte SHA-256과
object별 count/frame range로 재현하며, fixture에 중복된 3,600개 목록을 저장하지 않는다.

```sh
node tools/imjinrok/extract-k01-source-tile-selector.mjs \
  --output analysis/fixtures/k01-source-tile-selector.json
node --test tools/imjinrok/k01-source-tile-selector.test.mjs
node tools/imjinrok/export-k01-source-tile-visuals.mjs
node --test tools/imjinrok/export-k01-source-tile-visuals.test.mjs
```

`export-k01-source-tile-visuals.mjs`는 canonical hash-bound selector에서 다시 얻은 3,600개 stream을
검사하고 K01에서 실제로 쓰는 243개 normal `YTL` frame만 PNG로 낸다. 생성된 browser-safe artifact는
source file을 runtime에 읽지 않으며, x-major 원본 stream을 product `TileCell`의 row-major index로
옮겨 `flatAssetKey`를 설정한다. `imjinrok-k01`에만 이 선택을 map terrain/spawn-lane/starter mutation 뒤에
적용한다. K02와 다른 map은 명시적 K01 source tile selection을 받지 않는다.

선택된 `hill`/`diff`/`grss` source filename은 모두 flat visual collection에만 등록한다. 이는 이 분석이
확정한 object/frame identity를 보존하기 위한 계약이며 filename에서 elevation 또는 terrain meaning을
추론하지 않는다. source canvas `64×48`, anchor `(32,16)`과 chunk overhang 계산은 product/mod renderer
adapter다. 원본 pixel pivot·placement parity 주장이 아니다.

## 미확정 경계

이 결과는 source object와 frame index 선택만 확정한다. terrain의 사람용 이름, passability, elevation, world meaning,
원본 pixel pivot/placement, 다른 map/theme, 그리고 현재 웹 renderer 전체의 원작 일치는 포함하지 않는다.
