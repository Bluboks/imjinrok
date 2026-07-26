# Archived project agent instructions

> 2026-07-26 이전 지침을 보존한다. 현행 에이전트 지침으로 사용하지 않는다.

North star:
  - Treat exact, precise static/dynamic analysis of the original game binaries as the primary source of truth.
  - Use superficial visual cue matching only as a last resort, and never as the main basis for parity claims.

Project agent routing:
  - Keep this file lightweight. Put detailed, topic-specific guidance under `docs/agent-guides/`.
  - If a local guide grows too long to scan quickly, split it into narrower guides and leave only routing notes in
  the parent guide.
  - VM/QGA control: read `docs/agent-guides/vm-qga-control.md`.
  - Sprite and animation mapping: read `docs/agent-guides/sprite-animation-mapping.md`.
  - UI layout parity: read `docs/agent-guides/ui-layout-mapping.md`.
