Archived sprite and animation mapping guidance:
  - This file preserves pre-2026-07-26 guidance and is not current project policy.

Sprite and animation mapping:
  - Do not finalize source SPR frame mappings from visual inspection alone.
  - Use visual sprite sheets only as a quick anomaly detector or sanity check.
  - Treat frame/state/direction mappings as proven only when backed by static or dynamic evidence from the
  original binary/runtime, such as string xrefs, unit animation tables, draw-call frame indices, or debugger
  traces.
  - When changing `packages/shared/src/themes.ts` animation clips, add or update a rule/fixture/test that records
  the binary/runtime evidence used for the mapping.
  - If a mapping is still inferred by visual inspection, label it as provisional and avoid presenting it as
  original-game parity.
