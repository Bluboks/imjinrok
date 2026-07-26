# Imjinrok 2 Sprite Evidence Notes

> Archived on 2026-07-26. Candidate addresses remain useful, but this VM-oriented note is not the current workflow.

## Current Evidence

- Source executable: `original/imjinrok2/imjinrok2.exe`.
- PE32 image base: `0x00400000`.
- Main `char\*.spr` pointer table:
  - VA: `0x004bc224`
  - raw file offset: `0x000bc224`
  - entries: `126`
  - extracted by `tools/imjinrok/extract-sprite-table.mjs`
- Animation draw/setter static evidence:
  - extracted by `tools/imjinrok/extract-animation-evidence.mjs`
  - guarded by `tools/imjinrok/animation-evidence.test.mjs`
  - current verified evidence points: `22`

K01 MVP theme bindings currently backed by the executable table:

| Table index | Source path |
| ---: | --- |
| 0 | `char\swordk.spr` |
| 1 | `char\swordj.spr` |
| 2 | `char\archerk.spr` |
| 5 | `char\farmerk.spr` |
| 8 | `char\barrackk.spr` |
| 10 | `char\barrackj.spr` |
| 14 | `char\gunj1.spr` |
| 23 | `char\millj.spr` |
| 28 | `char\towerk.spr` |
| 41 | `char\hqk.spr` |
| 46 | `char\millk.spr` |
| 60 | `char\generalk4.spr` |
| 119 | `char\towerj.spr` |
| 120 | `char\advtowerj.spr` |
| 121 | `char\firehousej.spr` |
| 124 | `char\koreanking.spr` |

## Draw-Path Findings

Static disassembly around `0x00401710` shows the runtime entity draw path indexing a unit-type record and a per-unit
frame field:

- Unit type is read from `WORD [unit + 0x08]`.
- The unit type record stride is `3064` bytes:
  `(((type * 3) << 7) - type) << 3`.
- Runtime dimensions are read from the unit type record at `0x88c0bc` and `0x88c0c0`.
- The per-unit sprite frame index is read from `WORD [unit + 0x0a]`.
- Frame pointer lookup uses `DWORD [0x88c578 + computedFrameIndex * 4]`.
- Sprite/base object pointer is read from the unit type record at `0x88ccac`.
- The looked-up frame pointer is added to the sprite/base object pointer before the draw call.

Representative instructions:

- `0x0040174c`: `movsx ecx, WORD PTR [esi+0x8]`
- `0x0040179f`: `movsx edx, WORD PTR [esi+0xa]`
- `0x004017b6`: `mov edi, DWORD PTR [eax+0x88ccac]`
- `0x004017bc`: `mov edx, DWORD PTR [ecx*4+0x88c578]`
- `0x004017ca`: `add edx, edi`
- `0x004017e5`: draw call through `0x4517a0`

The same lookup shape repeats for other draw branches around `0x00401808`, `0x00401864`, `0x00401962`, and
`0x00401a10`.

These addresses are now machine-checked against the executable bytes by
`tools/imjinrok/extract-animation-evidence.mjs`. This makes the draw-path evidence stable enough to use as the
starting point for runtime frame-index logging.

## Frame Index Setter Candidates

The following static sites write or help derive `WORD [entity + 0x0a]`. They are not yet final action-to-frame mappings;
they are runtime breakpoint candidates for identifying which state and command transitions select each source frame.

### State Switch Selectors

- `0x0041d470`: reads `WORD [entity+0x1e6]`, dispatches through selector table `0x0041d504`.
- `0x0041d4b1`: writes `WORD [entity+0x0a]` from `WORD [entity+0x456]`.
- `0x0041d4df`: writes `WORD [entity+0x0a]` from `WORD [entity+0x456]`.
- `0x0041d560`: reads `WORD [entity+0x1e6]`, dispatches through selector table `0x0041d6a4`.
- `0x0041d5be`: writes `WORD [entity+0x0a]` from `WORD [entity+0x48e]`.
- `0x0041d5ed`: writes `WORD [entity+0x0a]` from `WORD [entity+0x48e]`.
- `0x0041d619`: writes `WORD [entity+0x0a]` from `WORD [entity+0x48e]`.

The same paths update `WORD [entity+0x0c]` using offsets such as `[entity+0x458]`, `[entity+0x454]`,
`[entity+0x48c]`, `[entity+0x490]`, and `[entity+0x1b2]`. Treat `[entity+0x0a]` as the frame base/index and
`[entity+0x0c]` as adjacent animation timing/offset evidence until runtime traces prove the exact semantics.

### Literal Frame Seeds

- `0x0042c80a`: writes literal frame index `0x006a` to `WORD [entity+0x0a]`.
- `0x0042c89b`: writes literal frame index `0x00cc` to `WORD [entity+0x0a]`.
- `0x0042c91a`: writes literal frame index `0x006e` to `WORD [entity+0x0a]`.
- `0x0042c981`: writes literal frame index `0x00cc` to `WORD [entity+0x0a]`.

These literals likely correspond to mode/state initializers rather than the common idle/move/attack loops. Keep them as
candidate evidence until a scenario/action context trace identifies the caller and affected unit type.

### Action Slot Registration

- `0x0043a430`: action/command slot registration helper entry.
- `0x0043a711`: writes `WORD [entity + slot*2 + 0x40e]`.

This helper explains command/action availability and is useful for command parity, but it is not direct sprite frame
evidence by itself. Do not use it to justify frame ranges without a runtime trace connecting a registered action to a
specific `[entity+0x0a]` value.

### Built-In Frame Debug Candidate

- `0x004c22b0`: ASCII format string `type:%d frame:%d`.
- `0x004733ee`: pushes `0x004c22b0` before an imported formatting call.
- `0x0047340a`: pushes adjacent output tag string `com:fdsf8ejfd` after formatting the type/frame string.

The surrounding function copies records from `0xc5b8ec` into `0xc5c818`, then formats two DWORD values as type/frame.
This looks like a built-in runtime diagnostics path for frame records. It is promising for dynamic analysis, but it is
not yet proven to be the same field as draw-path `WORD [unit+0x0a]`; verify with a breakpoint before using it as parity
evidence.

## Interpretation

The executable table now proves source sprite asset identity/order for the MVP bindings. It does not yet prove action
state to source-frame ranges.

The draw-path finding gives a concrete dynamic-analysis route: log the unit type and `[unit + 0x0a]` while the original
game renders idle, move, gather/build, and attack states. That directly yields source frame indices without relying on
visual sprite-sheet comparison.

The setter candidates narrow the dynamic-analysis search: break on the write sites above while forcing K01 units
through idle, move, attack, gather, build, repair, and enemy pressure behavior. Escort-cart movement is K02 follow-up,
not a K01 MVP completion requirement. A source frame range is not final parity until this runtime evidence is recorded.

## Next Runtime Breakpoints

Use the VM wrapper only, then x32dbg/Ghidra as needed inside the VM.

Recommended x32dbg breakpoints:

- `0x004017bc`
- `0x0040180e`
- `0x0040186a`
- `0x00401968`
- `0x00401a16`

Recommended setter breakpoints:

- `0x0041d4b1`
- `0x0041d4df`
- `0x0041d5be`
- `0x0041d5ed`
- `0x0041d619`
- `0x0042c80a`
- `0x0042c89b`
- `0x0042c91a`
- `0x0042c981`

Recommended debug-output breakpoints:

- `0x004733ee`
- `0x004733f4`
- `0x00473410`

For each hit, record:

- `esi` as the unit object pointer.
- `WORD [esi+0x08]` as unit type.
- `WORD [esi+0x0a]` as source frame index.
- `WORD [esi+0x1e]` and `WORD [esi+0x20]` as draw position.
- `BYTE [esi+0x19]` as draw branch selector.
- The current scenario/action context: idle, move, attack, gather, build, repair, or escort-cart movement.

These logs should become the binary/runtime fixture for finalizing `packages/shared/src/themes.ts` animation clip starts.
