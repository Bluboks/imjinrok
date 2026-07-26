Archived UI layout parity guidance:
  - This file preserves pre-2026-07-26 guidance and is not current project policy.

UI layout parity guidance:
  - Treat original binary/runtime evidence as the source of truth for UI layout, HUD placement, menu structure,
  panel geometry, hit areas, minimap/camera framing, fonts, spacing, and draw order.
  - If existing implementation appears to have been tuned by screenshots, eyeballing, or surface-level visual
  similarity, treat that implementation as unproven. Re-audit the layout against original binary/runtime evidence
  before calling it parity.
  - Prefer static and dynamic evidence from the original executable and assets: resource tables, disassembly,
  string/xref trails, layout constants, DirectDraw/GDI call sites, input hit-test code, window mode behavior,
  runtime memory fields, debugger traces, and captured draw-call coordinates.
  - Use screenshots and visual comparison only as anomaly detectors, sanity checks, or a last resort when the
  relevant binary/runtime path cannot be recovered in reasonable time.
  - Do not tune UI dimensions, offsets, or spacing by superficial visual matching and then present them as
  original-game parity. If a value is visually inferred, label it provisional and document the missing evidence.
  - When replacing provisional visual values, prefer recovered formulas and constants over one-off pixel nudges.
  Accept visual alignment only after it is tied back to a recovered coordinate system, resource anchor, call-site
  argument, memory field, or runtime trace.
  - For any UI parity claim, record the evidence trail: original file/version, function or virtual address,
  resource name/id, memory field, capture method, runtime condition, and the derived constant or rule.
  - Implement recovered layout values as named constants or data records where practical, with nearby source
  references to the reverse-engineering note that justifies them.
  - Current executable UI/campaign reference evidence is tracked in
  `docs/reverse-engineering/imjinrok2-ui-layout-evidence.md`.
  - Current client-side layout values that must not be treated as original parity are audited in
  `docs/reverse-engineering/imjinrok2-client-ui-layout-audit.md`.
  - Keep UI layout evidence under `docs/reverse-engineering/` when it grows beyond a short note. If this guide
  becomes hard to scan, split it into narrower guides and leave only routing notes here.
