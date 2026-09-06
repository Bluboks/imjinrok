# Source building placement evidence

The original renderer derives a building's far occupied cell from the runtime entity center and the runtime footprint bytes. In `FUN_00438930` (`0x00438930-0x00438a90`) and `FUN_00438aa0` (`0x00438aa0-0x00438be8`), the signed fields are:

```text
farX = centerX - trunc(footprintWidth / 2) + footprintWidth - 1
farY = centerY - trunc(footprintHeight / 2) + footprintHeight - 1
```

The center is runtime `entity +0x1bc/+0x1be`, and the footprint is runtime `entity +0x1e3/+0x1e4`. These byte fields describe occupied cells. They are not SPR pixel dimensions. The bounded replay in [`extract-source-building-placement-evidence.mjs`](../../../tools/imjinrok/extract-source-building-placement-evidence.mjs) validates positive signed-byte extents, signed-word centers, signed runtime offsets, and signed-word output wrapping against the source stores. Its replay domain rejects far-cell arithmetic that would leave the signed WORD range; native intermediate WORD arithmetic can wrap outside this bounded vector domain.

The native pixel dimensions are loaded separately from the SPR slot table with stride `0xbf8`, using globals `+0x88c0bc/+0x88c0c0`, and copied to runtime `entity +0x1da/+0x1dc`. The renderer writes screen placement to `entity +0x1d6/+0x1d8`. The existing source-frame local pivot remains valid: flag `0x08` uses half the pixel height, while the clear branch uses pixel height minus the signed type record offset at `+0x0c`, with the signed `entity +0x16` and runtime `+0x1e0` adjustments.

`FUN_00438930` obtains projected coordinates through `FUN_00465010`; the replay fixture supplies the resulting signed projected pair explicitly. `FUN_00438aa0` directly reads the cached words at `0x843984/0x8633c4 + 4 * (farX * 180 + farY)`, represented by a separate explicit cached projected pair in the fixture. This evidence packet does not reproduce the camera transform, infer table lifetime, or claim that the raw isometric words are a native cell projection implementation outside those bounded consumers.

The source conclusion is static-confirmed and reproduced for the fixture vectors, including 3x3 center `(5,4)` to far `(6,5)`, 3x2 to `(+1,0)`, 2x2 and 1x1 to `(+0,+0)`, both pivot flag branches, nonzero signed runtime offsets, and the cached direct path. Representative SPR bytes for source classes 48, 49, 57, and 63 are independently hash-checked through the existing original-entity visual profile artifact.

The product renderer adapts this source anchor principle to the product interaction footprint. It keeps the unit container at the semantic center and applies a local sprite offset from the actual product footprint's far cell. Product HQ uses its configured 4x4 interaction tiles even though the native source example is 3x3. The native cell-cache addition and native footprint extents are not implemented in the product runtime, and no claim of occupancy parity follows from this visual adapter.
