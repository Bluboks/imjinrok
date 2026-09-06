# 원본 엔티티 전수 시각 프로필

기준일: 2026-08-02

이 문서는 원본 실행 파일의 canonical entity type record 1~95를 제품이 소비할 수 있는 정적
시각 프로필로 연결한다. 생성기는
[`extract-original-entity-visual-profiles.mjs`](../../../tools/imjinrok/extract-original-entity-visual-profiles.mjs)이고,
결정론 산출물은
[`original-entity-visual-profiles.json`](../../../analysis/generated/original-entity-visual-profiles.json),
TypeScript 소비 표면은
[`originalEntityTypeProfiles.generated.ts`](../../../packages/shared/src/originalEntityTypeProfiles.generated.ts)다.

## 범위와 증거

- 입력 EXE SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`
- 타입 수: 95 (`1..95`), building flag bit `0x2` 프로필: 35
- 각 타입은 numeric flags, source SPR path/hash/header dimensions/frame count, signed type-record
  `+0x0c` vertical offset, low-byte flags bit `0x08` pivot split을 가진다.
- `FUN_0045bd20`의 writer argument 5를 `FUN_0045bd2e`가 signed WORD type-record `+0x0c`에 저장한다.
- `FUN_00438930`/`FUN_00438aa0`의 runtime footprint reads, SPR slot pixel-dimension loads, and bit `0x08` branch에 따라 static representative
  pivot은 다음으로 계산한다.

  ```text
  bit 0x08 clear: (current SPR width/2, current SPR height - signed +0x0c)
  bit 0x08 set:   (current SPR width/2, current SPR height/2)
  ```

Runtime entity fields, elevation, clipping, and current frame dimensions are deliberately not folded into
the static representative pivot; the generated profile exposes `verticalOffset`, `pivotMode`, and the
dimension provenance for that runtime calculation. The `+0x1e3/+0x1e4` bytes are signed occupied-cell
extents used to derive the far cell. They are not SPR pixel dimensions. Native pixel width/height are
signed WORDs at runtime `entity +0x1da/+0x1dc`, copied from the SPR slot table with stride `0xbf8` at
globals `+0x88c0bc/+0x88c0c0`. The existing local pivot formula remains valid for those pixel dimensions.

The bounded source placement replay and its explicit vectors are documented in
[`source-building-placement.md`](source-building-placement.md); its cached projection words are kept
separate from the K01 cell-projection evidence.

## Building selector

`FUN_00421c50` normalizes the runtime class byte by `class - 0x29`, loads a selector byte from
`0x00423064`, then dispatches through the 15-entry destination table at `0x00423028` using
`JMP [selector*4+0x00423028]`. The extractor reads both tables from the PE instead of maintaining a
hand-written class map.

| table | entries | SHA-256 of raw table bytes |
| --- | ---: | --- |
| destination `0x00423028` | 15 DWORDs | `8add6e9681c751bad7478b85da6886c993ac705891091d7dcc2fef921668404b` |
| selector `0x00423064` | 55 bytes, classes 41..95 | `95ea741d97bd53a0538619dd706118106e48b7fd66d41b671e8196f7565007a6` |

The generated `buildingRenderer.switchTables.selectorTable` preserves every class-to-selector-to-
destination edge. Representative continuous ranges use the source global tick shifted right by two
bits, then a branch divisor of four:

- class 50: frames `9..15`, divisor `4`;
- class 57 (and table aliases 61/73): frames `9..18`, divisor `4`;
- class 44: `16..26`; class 45: `14..20`; class 46: `9..27`;
- class 54: `10..19`; class 56: `21..28`; class 69: `11..20`; class 71: `10..19`.

Class 41 has a continuous body range `12..27` and a second conditional/stateful effect draw. That draw is
retained in `overlays` and `conditionalEffects`, with proven gate fields `entity+0x08c`/`entity+0x02c`,
shared effect state fields `entity+0x550`/`+0x552`/`+0x554`, and secondary renderer entries. It is
quarantined from continuous runtime frame selection. Special branches are likewise not flattened.

Construction profiles retain the static generic rules: phase thresholds
`[0,10,20,30,40,50,70,100]`, construction frame `phase + (typeBaseFrame - 7)`, healthy body
`typeBaseFrame`, and damaged body `typeBaseFrame + 1` under the documented effective-health threshold.

## Reproduction

```bash
pnpm imjinrok:extract-original-entity-visual-profiles
node --test tools/imjinrok/original-entity-visual-profiles.test.mjs
```

The vector fixture fixes class 76 (`128×108`, signed offset `23`, pivot `(64,85)`) and the class 50/57
overlay ranges. Source paths are resolved case-insensitively against the canonical source tree (with
ambiguous case collisions rejected), so all 95 checked profiles currently have source headers, hashes,
dimensions, and frame counts.
