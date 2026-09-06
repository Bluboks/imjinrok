# K01 source coordinate bridge 분석 패킷

## 질문과 범위

질문: **K01 map cell, exact placement, entity current/raw locomotion, movement accumulator/commit,
projectile start/end/route가 각각 어떤 폭·부호·단위·anchor를 가지며, 증거가 닫힌 subset에서 semantic
`GridPoint`로 어떤 명시적 양방향 변환 계약을 제공할 수 있는가?**

이 문서는 분석 전용이다. 화면 pixel, `iso.ts`, renderer matching, product clamping 또는 `Math.round`를
원본 좌표 근거로 사용하지 않는다. 다섯 좌표 domain을 하나의 universal scale로 합치지 않으며,
locomotion/projectile source unit이 닫히지 않은 상태에서 `GridPoint` 별칭을 만들지 않는다.

| 구분 | 상태 | 의미 |
| --- | --- | --- |
| 분석 | `정적 확정` (닫힌 subset) | 아래 함수·데이터 범위, signed/unsigned WORD 연산, K01 map/descriptor/route 범위 |
| 재현 | `재현 완료` | 정상·경계·실패 vector, corrected placement lookup replay와 provenance/fixture 변조 거부 |
| 구현 | `없음` | production package/app과 runtime adapter는 변경하지 않음 |

재현 산출물은 [`k01-source-coordinate-bridge-evidence.json`](../../../analysis/fixtures/k01-source-coordinate-bridge-evidence.json)이며,
입력 vector fixture는 [`k01-source-coordinate-bridge-vectors.json`](../../../analysis/fixtures/k01-source-coordinate-bridge-vectors.json)이다.

## Provenance

| 입력 | 크기 | SHA-256 |
| --- | ---: | --- |
| `original/imjinrok2/imjinrok2.exe` | 843,833 | `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e` |
| `original/imjinrok2/stagemap/k01.map` | 1,097,100 | `43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb` |
| `analysis/generated/imjinrok2/functions.json` | 1,468,333 | `7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e` |
| `analysis/generated/imjinrok2/references.json` | 17,206,569 | `f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5` |
| `analysis/generated/imjinrok2/seeds.json` | 9,436,451 | `386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2` |
| `analysis/generated/imjinrok2/jump-tables.json` | 607,724 | `0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f` |

입력·산출물은 EXE `sourceSha256`와 전체 파일 hash를 해석 전에 확인한다. fixture는 source hash,
schema, 각 vector의 실제 replay 결과를 다시 비교하므로 한 필드가 변조되어도 실패한다. 보고서의 모든
경로는 canonical repository-relative identifier를 사용한다.

## Coordinate-domain inventory

| domain | storage / width / sign | unit·scale·anchor | producer → consumer | proven range / conversion |
| --- | --- | --- | --- | --- |
| `k01-map-cell` | map byte fields at `map+field+x*180+y`; x/y stack arguments are signed WORD | discrete source cell; 1 integer cell index; logical anchor only, geometric/pixel anchor 미확정 | `FUN_00466f20` → `FUN_00469510`; `FUN_00464cc0`/`FUN_0046d650` readers | K01 `x,y=0..59`, first OOB `(60,0)` 또는 negative; exact identity ↔ semantic `GridPoint`만 허용 |
| `k01-exact-placement-coordinate` | signed WORD origin + signed WORD offset, signed-WORD wrapped sum | exact source cell coordinate; scale 1; no rounding; record x/y anchor; classes 12/13/14/82만 1×1 footprint 정적 확정 | `FUN_00488420` → `FUN_00483a60`/`FUN_00483c50` → `FUN_00437650`; create-return `FUN_0043c300`/occupancy `FUN_0043ad30` | allocation/age update precedes bounds; OOB create skip/continue; in-bounds exact identity ↔ `GridPoint`; slot failure aborts remaining descriptors |
| `k01-entity-current-and-raw-locomotion` | entity WORD `+0x1bc/+0x1be` current, `+0x4ee` raw, `+0x4ea` limit, `+0x4f2` accumulator; signed compares/division where shown | source locomotion fields; unit, displacement scale, interpolation and ground-contact anchor unknown | `FUN_00437650` → `FUN_00425af0` → `FUN_00425b20`; later consumers outside scope | storage `0..65535`, signed `-32768..32767`; no GridPoint conversion |
| `k01-movement-accumulator-commit` | entity WORD `+0x4f2`; raw WORD `+0x4ee`, selector BYTE `+0xba` | selector 1 uses `raw-trunc(raw/3)`; other selector keeps raw; threshold units, not cells/pixels; commit snapshots current and copies next | `FUN_00425b20` reads/writes accumulator and commits fields | signed threshold `<50` holds; `>=50` commits and stores accumulator−100; no GridPoint conversion |
| `k01-projectile-start-end-route` | record signed WORD start/current/end and signed WORD[160] route arrays; route index WORD | integer Bresenham-style source route, sample interval 14, route index 0=start; endpoint copied from target `+0x32/+0x34`; no rounding | Ryu callsite `0x00417b84/0x00417bfb` → `FUN_004111b0` → `FUN_0040f9b0` → `FUN_00410cc0` | conservative independent port accepts each coordinate `0..32767`; `-32768/-1/32768/65535` rejected; source scale/anchor unknown, no GridPoint conversion |

Map field offsets are independently separated: low nibble `+0x32514`, fog-family/table index `+0x4a0c4`,
object `+0x3a3a4`, frame `+0x42234`, placement selector `+0x79824`, placement lookup
`+0x51f54 + selector*0x7e90`. The x-major ordinal is `x*180+y`; it is not a product row-major alias.
The prior `+0x147d5 + selector*0x1fa4` lookup omitted the final `LEA ... *4` in
`FUN_0046d650:0x0046d69d..0x0046d6b4` and is retracted; the complete derivation is canonicalized in the
[K01 tile placement boundary](k01-tile-placement-elevation-boundary.md).

## Exact transforms and non-transforms

확정한 source arithmetic은 다음뿐이다.

1. Map storage: `ordinal = x*180+y`; no rounding.
2. Placement: `source = signedWord(origin + signedWord(offset))`; allocator and reuse-age mutation occur
   before bounds; only in-bounds source coordinates are created.
3. Locomotion selector-1: `raw - trunc(raw/3)` toward zero; sum and storage are signed-WORD; a negative
   accumulator crossing above zero clamps to zero.
4. Locomotion commit: signed `+0x4f2 >= 50` snapshots current `+0x1bc/+0x1be`, copies next
   `+0x4d8/+0x4da`, writes next to current, then stores `+0x4f2-100`.
5. Projectile route: integer Bresenham-style steps; start is route index 0; every 14th point is retained;
   current index is compared with final index for arrival. The 160-point alias boundary is preserved by the
   existing projectile reproducer.
6. Semantic conversion: map cell and exact placement only use `GridPoint={x,y}` identity after integer
   in-bounds admission. Both directions are explicit and finite; no interpolation or rounding is hidden.

다음은 변환으로 취급하지 않는다.

- map, placement, locomotion, accumulator, projectile에 공통 scale을 적용하지 않는다.
- source WORD `0x8000`은 signed `-32768`, `0xffff`는 `-1`이며 unsigned `32768`을 양수 좌표로 alias하지 않는다.
- source locomotion/current pair와 projectile route를 `GridPoint`로 이름만 바꾸지 않는다.
- product clamp, visual anchor, pixel offset, `Math.round`, fixed 24 Hz/FPS를 원본 규칙으로 승격하지 않는다.

## Required vectors and boundaries

`k01-source-coordinate-bridge-vectors.json`와 report의 `vectors`가 다음을 고정한다.

- zero/origin, map max `(59,59)`, first OOB `(60,0)`, negative signed OOB, `-1`, `-32768`, `32767`,
  unsigned `32768` interpretation;
- native reinforcement origin `(55,53)`의 정확한 9개 pair `(53,51)` … `(57,55)`와 OOB/slot-failure
  policy, K01 opening unit/building source records;
- locomotion raw/accumulator just-below `49`, threshold `50`, post-commit `-50`, selector-1
  truncation of signed `-4`, negative-to-positive clamp, current/next pair snapshot;
- projectile origin/endpoint, short route (`finalRouteIndex=0`), accepted positive boundary `32767`,
  route index and update count; rejected negative and `32768` inputs;
- source→semantic and semantic→source directions separately; unresolved domains return an explicit
  rejection contract instead of a guessed transform.
- corrected placement vectors: `(0,0)` has selector `2`, lookup `14`, helper `1`, raw shift `32`; `(0,1)` has
  selector `2`, lookup `15`, helper `2`, raw shift `32`.

## Function/data flow and exact ranges

Report `evidence.functionRanges`, `rawCodeRanges`, `codeAnchors`, `callEdges` preserve the exact VA and
byte ranges. Representative edges include:

```text
FUN_00466f20 --0x00467160--> FUN_00469510
FUN_00464cc0 --0x00464d00--> FUN_0046d650
FUN_00488420 --0x00488440--> FUN_00483a60
FUN_00488420 --0x00488494--> FUN_00483c50 --0x00483c95--> FUN_00437650
FUN_004111b0 --0x00411218--> FUN_0040c6c0 --0x0040c830/0x0040c95c--> route init/builder
FUN_00447360 --0x004474d0--> FUN_00410cc0
FUN_0045f9c0 --0x0045fd5d--> FUN_00447bc0 --0x00447cb8--> FUN_00447360
```

`FUN_0043782e`는 source entity slot/generation/signed x/y fields를 쓰며, map entity arrays는 type
`+0xa4`, x `+0x6e4`, y `+0xd24`, owner `+0x1364`의 signed WORD 배열이다. Projectile route fields are
`+0x11c`/`+0x25c` signed WORD[160], start/current/end record fields are documented separately in the
subtype-0x0c pilot.

## C01/E01 linkage boundary

C01 accepted scheduler witness는 `FUN_00447bc0 → FUN_004464c0 → FUN_004481d0 → FUN_0048ddb0 →
FUN_0048a5c0 → FUN_00447360`의 순서와 accepted entity/projectile pass count만 연결한다. raw scheduler
clock→project tick, mode producer, identity mapping은 연결하지 않는다.

E01 source-handle witness는 allocator slots `1..1199`, WORD generation increment/wrap, positive
active/health/reference validity, `FUN_00437650` signed x/y initialization을 연결한다. Projectile pool
(`1..99`)과 1,200-slot source entity pool은 서로 다른 identity/storage domain으로 유지한다.

## Proposed adapter contract (analysis only)

```text
input:  { domain, direction: sourceToSemantic | semanticToSource, coordinate, mapBounds }
output: { accepted: true, gridPoint, rounding: "none", scale: 1 }
        | { accepted: false, reason: "out-of-bounds" | "reject-unresolved-scale" }
```

`domain=map-cell`과 `domain=exact-placement`만 signed-WORD 검증→in-bounds→identity를 통과한다.
`locomotion`, `movement-accumulator`, `projectile`은 source unit/anchor가 닫힐 때까지 양방향 모두
`reject-unresolved-scale`이다. 이 계약은 production implementation이 아니며 어떠한 alias,
ground-contact, fractional rounding 또는 universal scale도 추가하지 않는다.

## Rejected hypotheses and unresolved work

- `+0x4a0c4` runtime WORD adjustment, corrected helper return, raw shift branch를 terrain height/elevation
  또는 pixel pivot으로 부르지 않는다. 이전 all-zero helper replay는 lookup 주소 산술 누락으로 반증됐으며,
  corrected helper/raw-shift evidence와 diagnostic은 [K01 tile placement boundary](k01-tile-placement-elevation-boundary.md)를 따른다.
- Exact placement의 raw owner, project coordinate/visual adapter, create-return 이후 movement/pathfinding은 닫히지 않았다. Source opening footprint 자체는 [K01 opening footprint anchor](k01-opening-footprint-anchor.md)에서 닫혔다.
- Locomotion `+0x1bc/+0x1be`의 source unit, `+0x4ee/+0x4ea` producer range, interpolation/occupancy,
  source update→24 Hz/FPS는 미확정이다.
- Projectile caller가 전달 가능한 전체 signed-WORD 범위, endpoint producer와 source→GridPoint scale/anchor,
  route alias beyond accepted port subset은 미확정이다.
- Dynamic/visual evidence로 static gap을 보완하지 않았다.

## Reproduction commands

```bash
pnpm imjinrok:extract-k01-source-coordinate-bridge
node --test tools/imjinrok/k01-source-coordinate-bridge.test.mjs
```

해당 extractor는 canonical provenance를 두 번 실행해 동일 JSON을 만들 수 있고, alternate symlink root,
EXE/functions/references/seeds/fixture 변조를 fail-closed로 거부한다. 이 패킷은 `pnpm
imjinrok:verify-static-analysis`, `pnpm typecheck`, `pnpm test`, `pnpm build` 전체 gate와 함께 검증해야 한다.
