# Imjinrok 2 K01 MVP Audit

> Archived on 2026-07-26. This audit is retained as historical context and is not an authoritative parity report.

## Purpose

This audit tracks whether the current K01 MVP campaign implementation is backed by original executable, script, map,
simulation, and runtime evidence. K02 is no longer an MVP completion target; keep K02 evidence as optional follow-up
only.

Generate the current report with:

```sh
node tools/imjinrok/extract-campaign-mvp-audit.mjs
node tools/imjinrok/extract-campaign-mvp-audit.mjs --json
```

Regression coverage is in `tools/imjinrok/campaign-mvp-audit.test.mjs`.

## Current Summary

- audited requirement groups: `5`
- achieved without original runtime observation: `4`
- partial original runtime observation: `1`
- missing original runtime observation: `0`
- failing evidence items: `0`

| Requirement | Current status | Evidence basis |
| --- | --- | --- |
| original executable K01 asset references | achieved without runtime | `imjinrok2.exe` `.data` refs for K01 scripts and `stagemap\k01.map` |
| source script dialogue coverage | achieved without runtime | original `script/K0110`, `K0115`, and `K0120` speech counts |
| client scenario definition source parity | achieved without runtime | K01 entries in `packages/shared/src/scenarios.ts` and `packages/shared/src/scenarios.test.ts` |
| simulation runtime model coverage | achieved without runtime | K01 beacon/reinforcement behavior in `packages/simulation/src/simulation.test.ts` |
| original executable K01 mission runtime observation | partial runtime observation | VM notes capture K01 mission entry, K01 stage-map dispatch, K0115 opening trigger, condition/control-flow-forced K0120/victory, condition-forced K01 defeat timer, clean K01 defeat overlay, a live stage-select UI resource-binding call-site, live hero-panel lookup/frame-draw call-sites, live game-speed settings draw/update call-sites, and negative objective/progress HUD candidate traces |

## Source Script Coverage

Current expected source speech counts:

| Script | Speech count |
| --- | ---: |
| `K0110` | `11` |
| `K0115` | `3` |
| `K0120` | `3` |

The implementation and tests currently cover:

- K01 executable asset refs, including `script\k0110`, `script\k0115`, `script\k0120`, and `stagemap\k01.map`.
- K01 briefing, K0115 opening dialogue, K0120 beacon-triggered reinforcement/retreat dialogue, source-derived
  starting units, K01 beacon objective, and hero-protection failure objectives.
- Simulation-level behavior for K01 beacon reinforcement and objective completion after beacon construction.
- Static K01 hero-loss defeat derivation: `0x0048a812`-`0x0048a86a` starts the `0x00843740` defeat timer when current
  owner type `0x4c` or `0x4e` is missing, and `0x0048d6f0` returns defeat only after the timer delta exceeds `0x7d0`.
  The local implementation mirrors this with `imjinrokOriginalMissionResultDelayTicks`.
- Condition-forced original-process runtime evidence for the K01 defeat timer: the VM run
  `codex-imjinrok-k01-defeat-20260602-0957` observed current-owner type `0x4c`/`0x4e` hero records before patching,
  patched those two marked-run records missing, and then recorded `observed-k01-defeat-timer-set` with
  `DWORD [0x00843740] == 37839620`, `DWORD [0x00882e04] == 37841666`, and timer delta `2046`. This run produced a
  `delete char`/`overflow` dialog rather than a clean defeat overlay, so it is not overlay evidence.
- Condition-forced original-process runtime evidence for the clean K01 defeat overlay: the VM run
  `codex-imjinrok-k01-defeat-alive-20260602-1010` preserved the current-owner type `0x4c`/`0x4e` records, patched only
  the `0x00441de0` alive-check word at each hero record `+0x07` to `0`, then recorded
  `observed-k01-defeat-timer-set` with `currentOwnerAliveHeroCheckCount == 0` and a timer delta above `0x7d0`. VNC
  showed the original result overlay `패배했습니다`.
- Original runtime evidence for entering the K01 mission map and hitting K01 stage-map/K0115 breakpoint probes.
- Condition/control-flow-forced original-process runtime evidence for K0120: the VM run
  `codex-imjinrok-k01-memory-base-20260602-0924` observed `WORD [0x008438dc] == 1`, expanded reinforcement-like
  unit-type counts, and the original result overlay `승리했습니다!` after forcing full-beacon records.
- Original runtime evidence for a stage-select UI resource-binding call-site: the VM run
  `codex-imjinrok-k01-launchdebug-stage-20260602-1550` hit `select-stage-border-bind-resource` at `0x004aafda`,
  targeting `0x00442dd0` after the binary-derived pre-call context
  `push 0x0094ba60,yfnt\\selectstageborder.spr`.
- Original runtime evidence for a hero-panel lookup call-site in the Joseon K01 menu-to-mission flow: the VM run
  `codex-imjinrok-k01-launchdebug-herodraw-20260602-1533` hit `hero-panel-name-lookup-call` at `0x004a76d0`, targeting
  `0x004a8870`. Static disassembly ties the callee to the `hero.spr` setup-created name table at `0x00c83e00`.
- Original runtime evidence for the hero-panel frame draw path in the same flow: VM run
  `codex-imjinrok-k01-launchdebug-heroframe-20260602-1542` hit the `0x004a7716` frame presence check, VM run
  `codex-imjinrok-k01-launchdebug-herodrawonly-20260602-1546` hit the `0x004a773d` clear/fill call with stack dwords
  starting `0, 0, 0x81, 0x77, 0xfe`, and VM run
  `codex-imjinrok-k01-launchdebug-herofinaldraw-20260602-1551` hit `hero-panel-frame-draw-call` at `0x004a7778`,
  targeting `0x0044dfd0`, with stack dwords starting `0, 0, 0x82, 0x78, 0x04783a86`.
- Original runtime evidence for the game-speed settings draw/update path: VM run
  `codex-imjinrok-k01-normal-nonhero-20260602-1612` reached the original environment/settings dialog, hit
  `game-speed-draw-entry` at `0x004ac4c0` under `hud-game-speed-draw-candidates`, then hit
  `game-speed-state-jump-table` at `0x004ac547` under `hud-game-speed-frame-only-candidates`. The latter capture
  confirmed the static stack word sequence `0..0xe` before dispatch through table `0x004ac5bc`.
- K01 HUD UI tracing is still incomplete. VM run `codex-imjinrok-k01-launchdebug-hud-20260602-1442` reached live K01
  HUD but timed out with `no-hit` for the `mouseinterface.spr` setup call-sites. VM run
  `codex-imjinrok-k01-launchdebug-hudres-20260602-1458` hit `hero-panel-resource` at `0x004a7445` during early startup,
  not K01 mission entry. VM run `codex-imjinrok-k01-launchdebug-hudres-nohero-20260602-1500` reached live K01 HUD but
  timed out with `no-hit` for `objectiveborder.spr`, `ProgressBar_*`, and `gamespeed.spr` setup call-sites; later
  draw/update tracing confirmed the settings-side game-speed path, while objective/progress draw/update paths remain
  unhit. VM run
  `codex-imjinrok-k01-launchdebug-herodraw-20260602-1529` timed out before useful K01 entry and should be treated as a
  navigation/timing failure, not as negative UI evidence. VM run `codex-imjinrok-k01-normal-nonhero-20260602-1612`
  also produced an early broad non-hero attach no-hit before the settings dialog was opened; treat that as a
  timing/surface miss, not as negative evidence against objective/progress candidates.
- Later live-K01 HUD traces narrowed, but did not close, the objective/progress gap. VM run
  `codex-imjinrok-k01-objprog-20260602-1700` timed out with `status: no-hit` for the live objective draw candidates and
  idle `ProgressBar_*` draw candidates. VM run `codex-imjinrok-k01-progress-prod-20260602-1702` selected a training
  building and showed visible bottom-panel production progress, but both `ProgressBar_*` draw candidates and the
  newly identified selected-panel progress candidates at `0x004a7880`/`0x004a78c4`/`0x004a7906`/`0x004a79b8` returned
  `status: no-hit`. Treat this as evidence to search for a different bottom production percentage path, not as proof
  that the UI element does not exist. Follow-up static disassembly now points that search at the selected-panel
  dispatch branch `0x004a8564 -> 0x004a81f0` and the final indirect present call at `0x004a83e7`, exposed through
  helper scope `hud-selected-production-text-candidates`. VM run `codex-imjinrok-k01-prodtext-20260602-1710` then
  selected the Joseon training building and showed visible `56%`/`조선 궁수` production UI while both
  `hud-selected-production-text-candidates` and the broader `hud-selected-slot-dispatch-candidates` returned
  `status: no-hit`, so the next bottom production UI search should move outside that selected-panel slot dispatch
  family. Follow-up static disassembly identified `0x004567c0`-`0x00457445` as a bottom-panel text/numeric candidate:
  this path formats a selected bottom-panel label from `[esi+0x94]` with `%s`/`%s(%c)`, formats numeric fields from
  `[esi+0x294]`..`[esi+0x29a]` with `" %d "`, draws/measures through `[0x004b7050]`/`[0x004b7058]`, then iterates
  three extra text records from `[esi+0x88]`/`[esi+0x114 + n*0x80]` before presenting cached surface `0x00549270` and
  blitting it into main surface/global `0x00549580`. VM run
  `codex-imjinrok-k01-bottomtext-20260602-1801` confirmed the main HUD reaches `0x004567c0`, and a tooltip-state run
  hit `0x00456f9b` with stack bytes containing ASCII `" 400 "`, matching the visible archer action cost tooltip.
  However, when the cursor was moved off the action icon and the bottom panel visibly showed `조선 궁수` production
  progress (`54%`/`50%`), `hud-bottom-panel-value-draw-candidates` returned `status: no-hit`, and
  `hud-bottom-panel-label-draw-candidates` also returned `status: no-hit`. The extra-line loop/final blit candidates
  were identified after that run and still need an arm-before-production runtime trace. Therefore `0x004567c0` is
  reachable and relevant to bottom-info/tooltip state, but it does not yet explain the visible K01 production
  label/percentage.

## Current Gap

The remaining K01 gap is not K02. K02 is outside the current MVP goal.

The remaining K01 gap is later original executable mission-runtime observation:

- capture remaining objective/progress K01 HUD/mechanics needed for parity claims,
- capture or improve the natural, unforced beacon-construction route if parity claims depend on UI construction timing,
- record debugger/QGA evidence under `docs/reverse-engineering/`.

The current static-to-dynamic breakpoint plan for that missing work is in
`docs/reverse-engineering/imjinrok2-campaign-runtime-trace-plan.md` and is generated by
`tools/imjinrok/extract-campaign-runtime-trace-plan.mjs`.

Until that later K01 runtime evidence exists, K01 should be described as source-derived MVP implementation with
simulation coverage, static and condition-forced runtime K01 victory/defeat observations, and partial original runtime
observation, not full original-game runtime parity.
