# K01 원본 맵 데이터 추출 프로토콜 v1

## 질문과 범위

K01의 60×60 셀에서 원본 실행 파일이 실제로 읽는 바이트와, 그 바이트로부터
재현 가능한 selector/placement 입력을 어떻게 추출하는지 고정한다. 이 문서는
사람이 붙인 지형·고도 의미나 웹 렌더러의 원작 일치를 주장하지 않는다.

## 입력과 해시 게이트

`original/imjinrok2/imjinrok2.exe`(843,833 bytes,
`25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`)와
`original/imjinrok2/stagemap/k01.map`(1,097,100 bytes,
`43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb`)를 먼저
검증한다. 크기·SHA-256·헤더 차원(60×60)이 다르면 추출을 중단한다.

## 채널 스키마

SSOT 선언과 생성 스트림은 [`map-data-protocol.mjs`](../../../tools/imjinrok/map-data-protocol.mjs)와
[`k01-map-data-protocol.json`](../../../analysis/generated/k01-map-data-protocol.json)이다.
모든 직접 필드는 `baseOffset + x*180 + y`의 unsigned byte이며 저장 순서는
`x-major: ordinal = x * height + y`이다.

- `field_0x32514_raw`, `field_0x32514_low_nibble`: 원시 바이트와 `& 0x0f` 분기 입력
- `objectIndex`, `frameIndex`: `FUN_00469330/FUN_00469510`의 YTL object/frame 선택
- `fogFamily`: `map + 0x4a0c4` family selector byte
- `placementSelector`, `placementLookup`, `placementHelperResult`: bounded helper 입력/결과
- `rawRasterVerticalShift`: 원본 draw path가 유지하는 0/16 raw shift (물리 elevation 아님)
- `passabilityPrimary`, `passabilityAuxiliary`: bounded passability gate의 primary/auxiliary byte

각 스트림에는 base64, byte count, SHA-256, 값 분포, 차원과 대표 벡터가 포함된다.
사람의 의미가 닫히지 않은 필드는 `field_0xNNNNN` 또는 neutral 이름을 유지한다.
예전 `K01_TERRAIN_RLE`은 project-only/legacy 투영이며 원본 셀 필드로 포함하지 않는다.

## 파이프라인과 실패 게이트

`pnpm imjinrok:map-data-protocol`이 JSON/브라우저 안전 TS를 생성하고,
`pnpm imjinrok:verify-map-data-protocol`이 생성 결과를 다시 추출해 비교한다.

1. 입력 파일의 크기와 해시를 확인한다.
2. MAP 헤더의 `themeId`(0x00), `view`(0x2d98), `width`(0x2da0), `height`(0x2da4)를 파싱하고 프로필과 비교한다. K01은 numeric `themeId=0`을 기록하며 map-codec의 `normal` 이름 해석은 별도의 resolved metadata로 보존한다.
3. 선언된 base offset, x/y stride, element width/signedness, selector stride의
   전체 extent를 확인한다.
4. 직접 스트림을 추출한 뒤 선언된 helper arithmetic만 파생한다.
5. 스트림 digest·분포·대표 벡터를 기록하고 생성 산출물과 비교한다.

생성은 기존 hash-bound source evidence fixture를 함께 검증한다. source-tile selector의
object/frame 쌍 digest, placement의 raw shift와 cell digest, fog family stream,
passability primary/auxiliary stream, gameplay compositor의 MAP/EXE와 channel digest,
cell-projection의 output-Y joint digest를 교차 확인하고 fixture 경로·SHA-256만
`evidenceBindings`에 기록한다. fixture가 stale하거나 source hash·dimensions·digest가
바뀌면 전체 생성이 실패하며, protocol exporter는 이 offset을 다시 해석하지 않는다.

tampered/truncated 입력, 실제 profile/header dimension mismatch, 범위를 벗어난 좌표,
missing/extra channel 또는 schema, altered theme/source metadata, empty/truncated/non-canonical
base64, byte length/digest/distribution/value-range 불일치는 모두 조용한 빈 결과 대신
예외로 종료한다. `0xa2 → 0x02` synthetic vector는 low-nibble mask가 K01의 raw
`0x01/0x02` 분포와 독립적으로 동작함을 고정한다.

대표 벡터에는 `(15,6)`과 네 이웃 `(14,6)`, `(16,6)`, `(15,5)`, `(15,7)`,
네 모서리가 포함된다. `(15,6)`은 기존 row-major footprint index 375 회귀 벡터와
연결되는 좌표이며 protocol 자체의 저장 ordinal은 x-major 906이다.

## 원본과 제품 경계

bounded 원본 compositor에는 native coverage layer가 없으며 index 0/검정으로 target을 지우고 선택된 YTL row span을
복사하므로 black gap이 관찰된다. native-exact source-raster 측정은 uncovered
logical footprint 74,771 pixels(혼합 offset boundary 25,934 pixels)이다.
이 사실은 `정적 확정` 범위로 유지한다.

웹 제품은 별도의 `SourceRasterCoveragePolicy`로만 hole-free coverage를 선택할 수
있다. K01은 map/profile 수준에서 canonical `k01-source:grss1:0000`을 모든 셀에
먼저 그리고, 각 선택 frame의 source offset을 적용한 뒤 전역 y-major/x-major 순서로
선택 frame을 replay한다. 이 coverage는 `의도적 적응`이며 원본 draw-layer나 물리
elevation(모든 `TileCell.elevation=0`)을 뜻하지 않는다. `source-raster-underlay`
legacy profile은 별도의 authored per-cell underlay branch로 보존한다.

## 다른 map/theme 확장 절차

새 프로필은 (1) 원본 입력 해시와 header 위치를 고정하고, (2) 좌표·stride·signedness가
명시된 채널 선언을 추가하고, (3) 정상/경계/실패 벡터와 독립 digest를 만든 뒤,
(4) 동일 protocol core로 JSON/TS를 생성한다. 제품 coverage가 필요하면 map-level
policy와 manifest asset을 별도로 선언하고 native source fact와 `의도적 적응`을
문서와 테스트에서 분리한다.
