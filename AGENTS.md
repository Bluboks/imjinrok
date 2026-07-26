North star:
  - Treat exact static analysis of the original game binaries and data as the primary source of truth.
  - Treat dynamic analysis as an exception for a narrow unresolved question, not as the default discovery workflow.
  - Never use superficial visual similarity as the main basis for an original-game parity claim.

Required reading:
  - Documentation entry point: `docs/README.md`.
  - Reverse-engineering workflow: `docs/reverse-engineering/methodology.md`.
  - Evidence and status vocabulary: `docs/reverse-engineering/evidence-levels.md`.
  - Current analysis coverage: `docs/reverse-engineering/status-matrix.md`.

Project agent routing:
  - Static binary or data analysis: read `docs/agent-guides/reverse-engineering.md`.
  - Sprite, animation, building-state image, or briefing portrait mapping: read
    `docs/agent-guides/sprite-animation-mapping.md`.
  - Any proposed VM or runtime probe: read `docs/agent-guides/dynamic-validation.md`.
  - Documentation changes: read `docs/development/documentation.md`.
  - Do not treat files under `docs/archive/` as current instructions or authoritative parity evidence.

Implementation gate:
  - Do not implement or alter a mechanic as an original-game parity change until its evidence is classified according
    to `docs/reverse-engineering/evidence-levels.md` and the derived behavior has a reproducible test vector.
