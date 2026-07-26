# Imjinrok 2 VM Runtime Analysis Notes

> Archived on 2026-07-26. This experiment log is retained for provenance and is not the default analysis procedure.

## Current VM Access State

- QGA access check succeeded through `/home/bluboks/.local/bin/win10-qga ping`.
- VM control must continue to use `/home/bluboks/.local/bin/win10-qga` directly; do not use raw `virsh`, raw QGA, or
  shell-wrapped VM commands.
- Current marker check for `codex-imjinrok` returned no process output.
- Do not clean up other agents' processes. Only use marker-based cleanup for processes launched by this agent.

## VM Inventory

Observed `C:\rev` layout:

- `C:\rev\dumps`
- `C:\rev\incoming`
- `C:\rev\logs`
- `C:\rev\notes`
- `C:\rev\target`
- `C:\rev\tools`
- `C:\rev\work`

Observed analysis tools under `C:\rev\tools`:

- `7-Zip`
- `cnc-ddraw-v7.1.0.0`
- `Dependencies`
- `Detect-It-Easy`
- `ghidra`
- `HxD`
- `jdk`
- `pe-bear`
- `Sysinternals`
- `x64dbg`

Verified runtime/debug paths:

- `C:\rev\tools\x64dbg\release\x32\x32dbg.exe` exists.
- `C:\rev\tools\x64dbg\release\x32\headless.exe` exists.
- `C:\rev\work\run-x32dbg-gui-smoke.cmd` exists for marker-launched x32dbg GUI smoke checks.
- `C:\rev\work\run-campaign-x32dbg-target.cmd` exists for opening the working-copy executable in x32dbg.
- `C:\rev\work\run-campaign-x32dbg-target-launch.ps1` exists for marker-recorded x32dbg/debuggee target launches.
- `C:\rev\work\send-x32dbg-command-sequence.ps1` exists for sending command-box sequences to an interactive x32dbg
  session by marker PID.
- `C:\rev\work\cleanup-codex-marker-processes.ps1` exists for marker-recorded multi-process cleanup.
- `C:\rev\work\codex-imjinrok-campaign-setup.xdbg` exists as the generated campaign breakpoint setup script
  for interactive x32dbg `scriptexec` loading.
- `C:\rev\work\imjinrok2-ascii\run-imjinrok2.cmd` exists.
- Target working-copy executable for runtime tracing: `C:\rev\work\imjinrok2-ascii\imjinrok2.exe`.
- Read-only evidence root: `C:\rev\target`.

The local source executable `original/imjinrok2/imjinrok2.exe` matches the VM triage hash:

- size: `843833` bytes
- SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`

## Existing Runtime Notes

Relevant VM notes:

- `C:\rev\notes\runtime-baseline-report.md`
- `C:\rev\notes\codex-runtime-menu-input-report.md`
- `C:\rev\notes\target-static-triage-report.md`
- `C:\rev\notes\dynamic-first-run-report.md`
- `C:\rev\notes\dynamic-preflight-plan.md`
- `C:\rev\notes\tool-installation-report.md`

Current established runtime facts:

- The ASCII working-copy launcher reaches the HQ splash, main menu, user registration dialog, and scenario
  country-selection screen.
- Mouse hover works in the game window.
- Synthetic click activation from QGA was not reliable in the latest Codex menu/input run.
- K01 mission runtime was entered under the original working-copy executable with x32dbg attached. Stage-map dispatch,
  K01 stage-map copy, and K0115 opening-trigger call-sites produced durable stack snapshots. K02 runtime was not
  pursued because it is no longer an MVP completion target.
- K02 is no longer an MVP completion target. A later direct-process-memory run captured condition/control-flow-forced
  K01 K0120 and victory behavior. Static disassembly now identifies K01 hero-loss defeat as the `0x00843740`
  result timer with a `0x7d0` tick delay through `0x0048d6f0`; later condition-forced runs observed that timer being
  set in the live process and captured the clean `패배했습니다` result overlay. Hardware breakpoint runs also captured
  a live stage-select resource-binding call-site hit, live hero-panel lookup/draw call-sites, and live game-speed
  settings draw/update call-sites. Remaining objective/progress K01 HUD/mechanics and natural beacon-construction
  timing still need observation before claiming full K01 parity.
- Previous controlled cleanup removed only the marked `imjinrok2` process for marker
  `codex-imjinrok-runtime-20260531-2312`.
- K01 MVP implementation coverage is audited in `docs/reverse-engineering/imjinrok2-k01-mvp-audit.md`;
  the current remaining gap is remaining objective/progress K01 HUD/mechanics and natural construction-path
  observation.
- A no-argument `headless.exe` preflight initialized the x64dbg runtime and entered a command loop, then exited without
  leaving `headless`, `x32dbg`, or `imjinrok` processes behind.
- `headless.exe -cf` can run x64dbg SimpleScript files from a controlled working directory. The smoke script
  `tools/imjinrok/x64dbg-headless-smoke.xdbg` was copied to `C:\rev\work\x64dbg-headless-smoke.xdbg` and verified to
  print a log line and finish with `ret`.
- Avoid passing unquoted guest paths to `/home/bluboks/.local/bin/win10-qga write`; otherwise the local shell can
  consume backslashes before the wrapper receives the Windows path.
- x64dbg/headless `-cf` path resolution is sensitive to the process working directory. A QGA default launch from
  `C:\Windows\system32` failed to open an absolute-looking `C:\rev\work\...` script path; setting the working directory
  to `C:\rev\work` and passing the relative script name succeeded.
- Marker `codex-imjinrok-campaign-init-smoke-20260602-0201` launched
  `C:\rev\work\run-campaign-headless-init-smoke.cmd` with `headless` PID `1420`; marker cleanup stopped that PID and
  left no `headless`, `imjinrok`, or `x32dbg` process.
- Marker `codex-imjinrok-campaign-init-capture-20260602-0203` ran the generated `scriptcmd init ...` smoke. x64dbg
  loaded `imjinrok2.exe` and began module/PDB probing, but `scriptcmd init` did not return to the following script
  lines within the 20 second helper timeout. Marker cleanup stopped `headless` PID `1580` and `imjinrok2` PID `4372`.
- Marker `codex-imjinrok-campaign-target-smoke-20260602-0204` showed that a relative target executable argument
  (`imjinrok2.exe`) is not resolved from the requested working directory by headless command-line handling; stdout
  reported `File does not exist!`.
- Marker `codex-imjinrok-campaign-target-smoke-20260602-0205` used the absolute target path
  `C:\rev\work\imjinrok2-ascii\imjinrok2.exe`. x64dbg loaded `imjinrok2.exe` and system DLLs, but the `-cf` script body
  did not reach `IMJINROK_TRACE_TARGET_SCRIPT_STARTED` within the 20 second helper timeout. Marker cleanup stopped
  `headless` PID `4800` and `imjinrok2` PID `6172`, leaving no matching process.
- Marker `codex-imjinrok-headless-c-before-target-20260602-0206` showed that `headless.exe -c <command>` with a target
  executable still loads the target before the command body reaches stdout. The command did not print an
  `IMJINROK_TRACE_*` log line before timeout; marker cleanup stopped the marked `headless` and `imjinrok2` processes.
- Marker `codex-imjinrok-headless-target-extended-20260602-0207` used the absolute target path and a 60 second helper
  timeout. The host-side wrapper call returned after its 30 second guest-command wait, but the VM helper continued and
  wrote cleanup status `timeout-killed` at `2026-06-02T02:36:40.2092432+09:00`. Cleanup stopped `headless` PID `8068`
  and `imjinrok2` PID `3096`; a follow-up wrapper `ps` for `headless|imjinrok|x32dbg` returned no output.
- Marker `codex-imjinrok-x32dbg-gui-smoke-20260602-0800` showed why Windows paths passed to the wrapper must be quoted:
  unquoted `C:\rev\work` arrived as `C:revwork`, so no x32dbg process was launched. Cleanup found no process to stop.
- Marker `codex-imjinrok-x32dbg-gui-smoke-20260602-0801` used quoted paths and launched x32dbg GUI PID `5032` in the
  interactive desktop. VNC showed x32dbg with its first-run Release Notes dialog. Wrapper marker cleanup stopped PID
  `5032`, leaving no matching process.
- Marker `codex-imjinrok-x32dbg-target-smoke-20260602-0802` launched x32dbg with
  `C:\rev\work\imjinrok2-ascii\imjinrok2.exe` from non-interactive QGA PowerShell. It created x32dbg PID `7772` and
  debuggee PID `5632`, but no GUI appeared on the desktop. The recorded PIDs were explicitly cleaned; a follow-up
  wrapper `ps` returned no `headless|imjinrok|x32dbg` output.
- Marker `codex-imjinrok-x32dbg-target-interactive-20260602-0803` launched the same target through
  `exec-powershell-interactive`. Marker JSON recorded x32dbg PID `5500` and debuggee `imjinrok2` PID `2976`; x32dbg's
  main window title was `imjinrok2.exe - PID: 2976 - 모듈: ntdll.dll - 스레드: 주 스레드 6148 - x32dbg [Elevated]`.
  VNC confirmed the GUI session reached the initial debugger break behind the Release Notes dialog. The corrected
  marker cleanup helper stopped both recorded PIDs and left no matching process.
- Marker `codex-imjinrok-x32dbg-scriptexec-smoke-20260602-0830` proved the interactive x32dbg command-box path. The
  first command attempt failed because the Release Notes dialog held focus. After VNC closed that dialog, the updated
  PID-based command helper sent `scriptexec C:\rev\work\x32dbg-gui-script-smoke.xdbg`; that script wrote
  `C:\rev\logs\codex-imjinrok-x32dbg-scriptexec-smoke-20260602-0830-peheader.bin`. The file is 64 bytes and starts
  with `4D-5A-90-00`, proving `savedata` read the loaded `imjinrok2.exe` PE header at `0x00400000`.
- Marker `codex-imjinrok-x32dbg-campaign-setup-smoke-20260602-0832` loaded the generated campaign breakpoint setup
  through `scriptexec C:\rev\work\codex-imjinrok-campaign-setup.xdbg`, then sent a second command
  `savedata C:\rev\logs\codex-imjinrok-x32dbg-campaign-setup-smoke-20260602-0832-after-setup-peheader.bin, 0x00400000,
  0x40`. The proof file is 64 bytes and starts with `4D-5A-90-00`. Marker cleanup stopped x32dbg PID `2700` and
  `imjinrok2` PID `7984`, leaving no matching process.

## Campaign Runtime Trace Plan

Use `tools/imjinrok/extract-campaign-runtime-trace-plan.mjs` to regenerate the K01 mission trace target list from
current executable references. The default mission scope is K01; use `--mission all` only for optional K02 follow-up:

```sh
node tools/imjinrok/extract-campaign-runtime-trace-plan.mjs
node tools/imjinrok/extract-campaign-runtime-trace-plan.mjs --json
node tools/imjinrok/extract-campaign-runtime-trace-plan.mjs --mission all
```

The plan is documented in `docs/reverse-engineering/imjinrok2-campaign-runtime-trace-plan.md`. It covers:

- K01 initial script and stage map path copy call-sites.
- K01 script trigger call-sites for `script\k0115` and `script\k0120`.
- Optional K02 script trigger and weather call-sites when generated with `--mission all`.
- Candidate watched globals for mission tick/phase, one-shot flags, script engine object state, unit-table scans, and
  map bounds.

Use `tools/imjinrok/generate-campaign-x64dbg-script.mjs` to generate x64dbg logging breakpoint scripts from that plan.
The generated script sets silent software breakpoints with `SetBreakpointLog` and `SetBreakpointCondition ..., 0` so
hits are logged without stopping at each probe.
Use `--mode capture-file --capture-prefix <marker>` when a run must leave durable breakpoint-hit proof files. In that
mode, every selected probe also gets a `SetBreakpointCommand` that writes a 64-byte stack snapshot with `savedata` into
`C:\rev\logs`.

Current debugger automation implication:

- Use absolute executable paths when headless is expected to load `imjinrok2.exe`.
- Do not assume `scriptcmd init` will return promptly in headless mode for this DirectDraw game.
- Do not wrap long debugger captures inside a synchronous QGA helper that must outlive the wrapper's current
  guest-command wait. For runs that need more than roughly 30 seconds, use a marker launcher that records PID/log paths,
  returns promptly, and then poll/cleanup by marker with explicit wrapper calls.
- The current headless target-loading path can load the game but has not yet reached the command-file body quickly
  enough to install or log the campaign breakpoints. Treat x64dbg GUI automation or a shorter async headless setup step
  as the next runtime-analysis route.
- The current GUI x32dbg path can open `imjinrok2.exe` under debugger control in the interactive desktop. The next
  runtime-analysis route should use the verified command helper to load the generated K01 breakpoint setup script with
  `scriptexec`, then continue from the initial `ntdll.dll` break into the single-player Joseon K01 flow.
- If the Release Notes dialog appears again, close it before command automation. Once closed, PID-based activation of
  x32dbg and command-box input through `send-x32dbg-command-sequence.ps1` has been verified.
- Marker `codex-imjinrok-x32dbg-capture-run-smoke-20260602-0845` loaded the capture-file breakpoint script, wrote an
  after-setup PE header proof file, and sent `erun` three times. x32dbg then continued the debuggee far enough to show
  the game window, but the window remained black during this smoke. The run still proved breakpoint-command file
  capture: `k01-initial-script-copy-k0110-0x0048d049-stack.bin` and
  `k02-initial-script-copy-k0210-0x0048d071-stack.bin` were created under `C:\rev\logs`, each 64 bytes. Both stack
  snapshots began with
  `39-E5-4A-00-01-00-00-00-00-90-36-00-DA-F1-45-00-40-FA-45-00-39-E5-4A-00-00-00-00-00-70-FF-19-00`.
  Marker cleanup stopped x32dbg PID `3304` and `imjinrok2` PID `2076`, leaving no matching game/debugger process.
- Marker `codex-imjinrok-normal-attach-base-20260602-0910` launched the normal working-copy game first, preserving
  normal DirectDraw rendering through the intro. Marker `codex-imjinrok-x32dbg-attach-smoke-20260602-0911` then
  attached `C:\rev\tools\x64dbg\release\x32\x32dbg.exe` to the live game PID `3240`, recording x32dbg PID `7420`.
  This avoided the black-window behavior seen when x32dbg started the game directly.
- The attached run loaded a fresh capture-file script
  `C:\rev\work\codex-imjinrok-x32dbg-attach-capture-20260602-0912.xdbg` with capture prefix
  `codex-imjinrok-x32dbg-attach-capture-20260602-0912`, wrote
  `codex-imjinrok-x32dbg-attach-capture-20260602-0912-after-setup-peheader.bin`, and continued through the menu by
  VNC input. VNC reached the main menu, user-registration dialog, scenario country selection, Joseon mission list, K01
  briefing `1. 불안한 전운`, and finally the live K01 mission map.
- K01 mission entry produced these new runtime files under `C:\rev\logs`:
  - `codex-imjinrok-x32dbg-attach-capture-20260602-0912-campaign-stage-map-dispatcher-0x0048d410-stack.bin`
  - `codex-imjinrok-x32dbg-attach-capture-20260602-0912-campaign-stage-map-dispatch-k01-0x0048d429-stack.bin`
  - `codex-imjinrok-x32dbg-attach-capture-20260602-0912-k01-stage-map-copy-0x0048d740-stack.bin`
  - `codex-imjinrok-x32dbg-attach-capture-20260602-0912-k01-opening-dialogue-k0115_0x0048a6bd-0x0048a6bd-stack.bin`
  - `codex-imjinrok-x32dbg-attach-capture-20260602-0912-k01-opening-dialogue-k0115_0x0048a6c6-0x0048a6c6-stack.bin`
  - `codex-imjinrok-x32dbg-attach-capture-20260602-0912-k01-opening-dialogue-k0115_0x0048a6cf-0x0048a6cf-stack.bin`
  - `codex-imjinrok-x32dbg-attach-capture-20260602-0912-k01-opening-dialogue-k0115_0x0048a6d9-0x0048a6d9-stack.bin`
  - `codex-imjinrok-x32dbg-attach-capture-20260602-0912-k01-opening-dialogue-k0115_0x0048a6e3-0x0048a6e3-stack.bin`
- Representative K01 stack snapshots from that run:
  - `0x0048d410`: `72-DC-48-00-01-00-00-00-03-00-00-00-01-00-00-00-00-00-00-00-8C-00-00-00-D5-00-46-00-39-E5-4A-00`
  - `0x0048d429`: `A3-4B-63-00-72-DC-48-00-01-00-00-00-03-00-00-00-01-00-00-00-00-00-00-00-8C-00-00-00-D5-00-46-00`
  - `0x0048d740`: `30-D4-48-00-A3-4B-63-00-72-DC-48-00-01-00-00-00-03-00-00-00-01-00-00-00-00-00-00-00-8C-00-00-00`
  - `0x0048a6d9`: `48-2F-4C-00-00-00-00-00-00-00-00-00-F4-F1-19-00-0D-00-01-00-FE-FF-FE-FF-52-00-01-00-00-00-FE-FF`
- Marker `codex-imjinrok-k01-memory-base-20260602-0924` launched the normal working-copy game without x32dbg, then
  entered single-player Joseon K01 by VNC input. This run used direct `ReadProcessMemory`/`WriteProcessMemory` helpers
  from QGA rather than x32dbg command-box automation because the current attach session stopped accepting reliable
  command input.
- The pre-patch K0120 state probe wrote
  `codex-imjinrok-k01-memory-base-20260602-0924-k01-k0120-state-before-patch.json`. It proved the live process held
  K0120 code bytes at `0x0048a731`, `script\k0120` at `0x004c2f38`, owner `WORD [0x00bccc44] == 0`, one-shot
  `WORD [0x008438dc] == 0`, 36 active records, and no current-owner full beacon records.
- The first condition-forcing attempt patched one current-owner record to type `0x34`/progress `0x64`, then
  `codex-imjinrok-k01-memory-base-20260602-0924-k01-k0120-state-after-patch-watch.json` showed the beacon record
  stayed present but one-shot stayed `0`. A later control-flow patch recorded
  `codex-imjinrok-k01-memory-base-20260602-0924-k01-k0120-control-flow-patch.json`, NOPing the pre-scan
  `JNE 0x0048a7f2` at `0x0048a72b`; that still did not set the flag with only one forced candidate.
- The successful forced K0120 observation patched nine current-owner candidates to type `0x34`/progress `0x64`, then
  `codex-imjinrok-k01-memory-base-20260602-0924-k01-k0120-state-after-many-candidates-watch.json` recorded
  `observed-k0120-one-shot-set`: sample 0 had `WORD [0x008438dc] == 1`, 120 active records, 10 current-owner full
  beacon records, and newly expanded unit-type counts including `0x0c`, `0x0d`, `0x0e`, and `0x52`. VNC simultaneously
  showed the K01 result overlay `승리했습니다!`.
- Static host disassembly of the original executable now narrows K01 hero-loss defeat: `0x0048a812`-`0x0048a83b`
  checks current-owner type `0x4c` and starts `DWORD [0x00843740]` from `DWORD [0x00882e04]` when missing, while
  `0x0048a840`-`0x0048a86a` repeats the same pattern for type `0x4e`. The common result gate at `0x0048d6f0`
  returns defeat only after `abs(DWORD [0x00882e04] - DWORD [0x00843740]) > 0x7d0`.
- Marker `codex-imjinrok-k01-defeat-20260602-0957` entered K01 and wrote defeat timer logs:
  `codex-imjinrok-k01-defeat-20260602-0957-k01-defeat-state-before-hero-patch.json`,
  `codex-imjinrok-k01-defeat-20260602-0957-k01-defeat-heroes-patch.json`, and
  `codex-imjinrok-k01-defeat-20260602-0957-k01-defeat-state-after-hero-patch-watch.json`. Pre-patch state had
  owner `0`, defeat timer `0`, type `0x4c` hero record index `19`, and type `0x4e` hero record index `30`. After
  patching only those records to type `0x00`/owner `0xff`, the watch probe recorded
  `observed-k01-defeat-timer-set` with `DWORD [0x00843740] == 37839620`, `DWORD [0x00882e04] == 37841666`, delta
  `2046`, and zero current-owner hero records. VNC showed a `delete char`/`overflow` dialog rather than a clean
  defeat overlay, so treat this as timer evidence only.
- Marker `codex-imjinrok-k01-defeat-alive-20260602-1010` preserved type/owner records and patched only the
  `0x00441de0` alive-check word at each K01 protected hero record `+0x07`. Pre-patch probe
  `codex-imjinrok-k01-defeat-alive-20260602-1010-k01-defeat-state-before-alive-word-patch.json` observed owner `0`,
  defeat timer `0`, type `0x4c` record index `19` with alive-check word `1000`, and type `0x4e` record index `30`
  with alive-check word `600`. Patch log
  `codex-imjinrok-k01-defeat-alive-20260602-1010-k01-defeat-alive-word-patch.json` changed only those alive-check
  words to `0`; the watch probe recorded `observed-k01-defeat-timer-set`, current-owner protected hero records still
  present, `currentOwnerAliveHeroCheckCount == 0`, and defeat timer delta above `0x7d0`. VNC showed the clean
  original `패배했습니다` overlay.
- Treat the 20260602-0924 K0120/victory result as condition/control-flow-forced original-process dynamic evidence,
  not a natural UI beacon-construction capture. K01 still needs key UI/mechanics and ideally natural
  beacon-construction runtime captures before full parity is claimed.
- The Korean instant-win cheat `이보다더좋을수는없다` was attempted during K01 through the wrapper key path, but no
  victory transition was observed. Treat that input route as unproven for Hangul cheat automation.
- Cleanup for marker `codex-imjinrok-x32dbg-attach-smoke-20260602-0911` stopped only x32dbg PID `7420` and imjinrok2
  PID `3240`. Follow-up wrapper `ps` checks for `imjinrok`, `x32dbg`, and `headless` returned no output.
- Cleanup for marker `codex-imjinrok-k01-memory-base-20260602-0924` stopped only `imjinrok2` PID `7220`; follow-up
  wrapper `ps` checks for `imjinrok`, `x32dbg`, and `headless` returned no output.
- Cleanup for marker `codex-imjinrok-k01-defeat-20260602-0957` stopped only `imjinrok2` PID `6752`; follow-up wrapper
  `ps` checks for `codex-imjinrok-k01-defeat-20260602-0957`, `imjinrok`, `x32dbg`, and `headless` returned no output.
- Cleanup for marker `codex-imjinrok-k01-defeat-alive-20260602-1010` stopped only `imjinrok2` PID `6276`; follow-up
  wrapper `ps` checks for `codex-imjinrok-k01-defeat-alive-20260602-1010`, `imjinrok`, `x32dbg`, and `headless`
  returned no output.

## UI Runtime Trace Plan

Use `tools/imjinrok/extract-ui-runtime-trace-plan.mjs` to regenerate the trace target list from current static
evidence:

```sh
node tools/imjinrok/extract-ui-runtime-trace-plan.mjs
node tools/imjinrok/extract-ui-runtime-trace-plan.mjs --json
node tools/imjinrok/generate-ui-x64dbg-script.mjs --mode capture-file --capture-prefix codex-imjinrok-ui-trace-<timestamp>
node tools/imjinrok/generate-ui-x64dbg-script.mjs --mode capture-file --category hud-mouse-interface --capture-prefix codex-imjinrok-ui-trace-<timestamp>
```

Prepared VM script:

- `C:\rev\work\codex-imjinrok-ui-hud-20260602-prep.xdbg` is a generated HUD-focused capture-file script for
  `hud-mouse-interface` probes. It captures stack snapshots under `C:\rev\logs\codex-imjinrok-ui-hud-20260602-prep-*`
  when `0x004a51de`, `0x004a5210`, `0x004aaae3`, or `0x004aab15` hit during a normal-launch-then-attach x32dbg run.
  The script is preparation only; it is not runtime proof until executed against the original process and documented.
  After preparing it, wrapper `ps` checks for `codex-imjinrok-ui-hud-20260602-prep`, `imjinrok`, `x32dbg`, and
  `headless` returned no output.
- `C:\rev\work\codex-imjinrok-ui-all-20260602-prep.xdbg` is the all-category capture-file script for stage-select,
  map-control, modal OK/cancel, and HUD mouse-interface probes. Its stack snapshots use the prefix
  `C:\rev\logs\codex-imjinrok-ui-all-20260602-prep-*`.

Observed UI trace attempts:

- Marker `codex-imjinrok-ui-hud-20260602-1044` launched the normal working-copy game, attached x32dbg interactively,
  loaded the HUD-focused script, and proved command-box execution with
  `codex-imjinrok-ui-hud-20260602-1044-after-setup-peheader.bin`. VNC reached the live K01 mission HUD, but no
  `codex-imjinrok-ui-hud-20260602-prep-*` stack snapshots were produced. This narrows the missing evidence to either
  call-sites that ran before script installation or HUD paths that do not re-enter during that late K01 state.
- Marker `codex-imjinrok-ui-all-20260602-1053` attached too early after game launch. x32dbg stayed in early
  system-DLL/TLS breakpoints, so menu and UI probes were not reached. This is a timing failure, not UI runtime
  evidence.
- Marker `codex-imjinrok-ui-menuattach-20260602-1110-game` launched the same working-copy path but remained on a
  black initial window during this short attempt. Marker cleanup stopped only the recorded `imjinrok2` PID `960`.
- Marker `codex-imjinrok-ui-menuprobe-20260602-1114-game` reached the intro, title splash, main menu, and user
  registration modal before attach. Marker `codex-imjinrok-ui-menuprobe-20260602-1114-attach` then attached x32dbg to
  target PID `4164`, recording x32dbg PID `6988` with a live main window. The command helper reported
  `commands-sent` for `scriptexec C:\rev\work\codex-imjinrok-ui-all-20260602-prep.xdbg`, an after-setup `savedata`,
  and three `erun` commands, but no `codex-imjinrok-ui-menuprobe-20260602-1114-after-setup-peheader.bin` or
  `codex-imjinrok-ui-all-20260602-prep-*` stack snapshots appeared. A manual proof-only `savedata` command through
  the same command bar also produced no file. Treat this as command-box automation failure after menu-time attach,
  not as evidence that the UI call-sites did not execute.
- Cleanup for `codex-imjinrok-ui-menuprobe-20260602-1114-game` stopped `imjinrok2` PID `4164`. Wrapper cleanup for
  `codex-imjinrok-ui-menuprobe-20260602-1114-attach` did not stop x32dbg PID `6988`, so the PID recorded in the attach
  marker JSON was terminated explicitly with the wrapper `exec-cmd "taskkill /PID 6988 /T /F"`. Follow-up wrapper
  `ps` checks for `x32dbg`, `imjinrok`, and `headless` returned no output.

Current UI tracing implication:

- For the next UI pass, do not rely solely on late-attach x32dbg command-box automation unless the after-setup PE
  header proof file appears first.
- Prefer either a direct-process-memory helper that writes the UI breakpoint/tracing state without x32dbg command-box
  input, or an x32dbg launch path where `scriptexec` proof is confirmed before menu navigation. The latter may need a
  rendering workaround because x32dbg-started runs have shown black-window behavior.
- The static plan now carries callsite-specific pre-call context, so the next successful runtime capture should compare
  live registers/stack against the exact binary-derived pushes, stack writes, and field refs documented in
  `docs/reverse-engineering/imjinrok2-ui-layout-evidence.md`. For example, `0x004a51de` must be checked against the
  preceding `0x2` push, `[esp+0x0c] = 0x119`, `[esp+0x24] = 0x185`, `0x0094ba60`, and
  `yfnt\mouseinterface.spr`, while `0x00494bca` must be checked against the `[esi+0x0110]` destination-field context.
- `C:\rev\work\trace-ui-callsite-debugger.ps1` is the current x32dbg-command-box bypass helper. It attaches to the
  marked `imjinrok2` process with Windows Debug API, installs temporary `INT3` bytes at selected UI call-sites, captures
  WOW64 registers plus 128 bytes of stack on a hit, restores original bytes, and writes JSON under
  `C:\rev\logs\<marker>-ui-callsite-debug-<label>.json`.
- Marker `codex-imjinrok-ui-debugapi-20260602-1131-game` validated the helper's no-hit lifecycle against the live
  original process. The fixed helper run `hud-timeout-smoke-fixed` armed HUD mouse-interface call-sites
  `0x004a51de`, `0x004a5210`, `0x004aaae3`, and `0x004aab15`; each original byte was `E8`; the final JSON recorded
  `status: no-hit`, `method: direct-windows-debug-api-int3-runtime-probe`, `eventCount: 91`, and all four breakpoints
  `restored: true`.
- The first `stage-select` Debug API attempt exposed a helper bug: non-breakpoint exceptions used a signed
  `DBG_EXCEPTION_NOT_HANDLED` value, so PowerShell failed to convert the continue status to `UInt32` after the armed
  file was written. The helper now uses explicit unsigned constants.
- The fixed `stage-select-fixed` run armed `0x004aafda`, `0x004aafeb`, `0x004ab043`, and `0x004ab054` with original
  byte `E8` and later wrote `status: no-hit` with all breakpoints restored. That run timed out before useful stage
  re-entry input, so it is only lifecycle evidence.
- The later `stage-select-reopen` run armed the same stage-select call-sites, then the game process exited during
  country/stage re-entry before the old helper wrote a final JSON. The helper has since been updated to record
  `target-exited` and restore errors instead of losing the record. Treat this run as instability evidence for `INT3`
  stage-select tracing, not as a UI call-site hit.
- The updated helper also supports `-Mode hardware`, using WOW64 debug registers instead of patching `INT3` bytes.
  Marker `codex-imjinrok-k01-ui-hw-smoke-20260602-1215` launched the working-copy game, attached to PID `7108`, armed
  HUD mouse-interface call-sites `0x004a51de`, `0x004a5210`, `0x004aaae3`, and `0x004aab15` in DR0-DR3 with
  `DR7 = 0x00000055`, timed out with `status: no-hit`, and cleared the debug registers. This proves the non-mutating
  helper lifecycle in the VM; it is not K01 UI parity evidence because no call-site was hit.
- Cleanup for `codex-imjinrok-k01-ui-hw-smoke-20260602-1215` stopped only the recorded `imjinrok2` PID `7108`.
  Follow-up wrapper `ps imjinrok2` returned no output.
- Marker `codex-imjinrok-k01-stage-ui-hw-20260602-1228` reached the main menu, Joseon mission list, K01 briefing, and
  live K01 HUD while using hardware breakpoints against the already-running process. Both `stage-select-hw-capture`
  and `hud-hw-k01-entry` wrote final JSON with `status: no-hit` after arming and clearing their DR0-DR3 call-site
  sets. Treat these as failed late-attach attempts, not as evidence that the call-sites are irrelevant; the target UI
  construction paths may run before attach.
- The helper now supports launch-under-debug mode with `-LaunchExecutable`, creating `imjinrok2.exe` under
  `DEBUG_ONLY_THIS_PROCESS` before UI initialization. Early bugs in that route were fixed: `CreateProcess` now receives
  the application path directly, launch metadata avoids the `threadId` key collision, and hardware breakpoint result
  lists are forced to arrays before appending thread-create results.
- Marker `codex-imjinrok-k01-launchdebug-short-20260602-1438` validated launch-under-debug lifecycle. It created PID
  `4680`, recorded `launchMode: direct-createprocess-debug`, armed HUD call-sites in hardware debug registers from
  process start, timed out after `3` seconds with `status: no-hit`, cleared the registers, and stopped the target via
  `-StopTargetOnExit`. This is tool lifecycle evidence only; the short timeout was not intended to reach K01.
- Markers `codex-imjinrok-k01-launchdebug-stage-20260602-1518` and
  `codex-imjinrok-k01-launchdebug-stage-20260602-1542` launched the working-copy game under
  `DEBUG_ONLY_THIS_PROCESS`, navigated to the stage-select flow, and showed the stage-select breakpoint exception at
  `0x004aafda` with exception code `0x4000001e`. Before the helper recognized that WOW64 hardware-breakpoint code,
  both runs ended as `target-exited`/diagnostic evidence rather than durable hit records.
- Marker `codex-imjinrok-k01-launchdebug-stage-20260602-1550` is the first successful direct Debug API UI call-site
  hit. It launched `imjinrok2.exe` under debug, armed stage-select hardware breakpoints at `0x004aafda`,
  `0x004aafeb`, `0x004ab043`, and `0x004ab054` with `DR7 = 0x00000055`, reached the scenario/stage-select path by VNC
  input, and wrote
  `C:\rev\logs\codex-imjinrok-k01-launchdebug-stage-20260602-1550-ui-callsite-debug-launchdebug-stage-select.json`
  with `status: hit`. The hit was `select-stage-border-bind-resource` at `0x004aafda`, target `0x00442dd0`,
  pre-call context `push 0x0094ba60,yfnt\\selectstageborder.spr`, exception code `0x4000001e`, and live register,
  stack, and call-site byte snapshots. This proves the original runtime reaches the stage-select resource-binding
  path; it is not yet K01 HUD layout or in-mission mechanics parity evidence.
- The updated helper now records `stackDwords` and decoded `registerPointers` for hits, in addition to raw stack/code
  bytes. VM PowerShell blocks direct `.ps1` invocation under the default execution policy, so helper launches through
  the wrapper use process-scope `Set-ExecutionPolicy -ExecutionPolicy Bypass` before invoking
  `C:\rev\work\trace-ui-callsite-debugger.ps1`.
- Marker `codex-imjinrok-k01-launchdebug-hud-20260602-1442` launched the working-copy game under debug, armed the
  `hud-mouse-interface` call-sites `0x004a51de`, `0x004a5210`, `0x004aaae3`, and `0x004aab15`, then reached live K01
  mission HUD by VNC input. It timed out with `status: no-hit`, cleared the hardware registers, and stopped the target.
  Treat this as evidence that those `mouseinterface.spr` setup call-sites did not re-enter during this K01 HUD entry,
  not as proof that the visible K01 HUD has no related original resource path.
- Static disassembly then added a narrower `hud-resource-candidates` helper scope from original UI sprite xrefs:
  `objectiveborder.spr` at `0x004a577a`, `hero.spr` at `0x004a7445`, `ProgressBar_*` at `0x004a952d`, and
  `gamespeed.spr` at `0x004ac3bd`. Marker `codex-imjinrok-k01-launchdebug-hudres-20260602-1458` hit
  `hero-panel-resource` at `0x004a7445` almost immediately after launch, before K01 navigation. The hit decoded
  `stackDwords[0] == 0x004c91f4` as `yfnt\hero.spr`, `stackDwords[1] == 0x0094ba60` as
  `C:\Program Files\HQTeam\`, and captured the expected `0x4000001e` hardware breakpoint exception. Because this hit
  happened during early startup, it is hero-panel resource-load evidence, not K01 mission HUD timing evidence.
- Marker `codex-imjinrok-k01-launchdebug-hudres-nohero-20260602-1500` armed the same candidate scope without
  `hero.spr`, reached live K01 mission HUD, then timed out with `status: no-hit` for `objectiveborder.spr`,
  `ProgressBar_*`, and `gamespeed.spr` resource call-sites. This narrows the K01 HUD gap: the visible live HUD likely
  uses already-initialized resources or draw/update paths rather than re-entering these setup call-sites during K01
  mission entry.
- Host static disassembly then narrowed a hero-panel draw/update route. The helper scope
  `hud-hero-panel-draw-candidates` now arms `0x004a76d0` (`hero-panel-name-lookup-call`, target `0x004a8870`),
  `0x004a887f` (`hero-panel-name-table-read`, indexed read from `0x00c83e00`), `0x004a7758`
  (`hero-panel-frame-table-read`, indexed read from `0x00c84348` plus `0x00c84a7c`), and `0x004a7778`
  (`hero-panel-frame-draw-call`, target `0x0044dfd0`).
- Marker `codex-imjinrok-k01-launchdebug-herodraw-20260602-1529` launched the working-copy game under debug and armed
  those four hero-panel draw/update candidates, but it timed out with `status: no-hit` before useful K01 mission entry.
  Cleanup found the recorded PID already not running and left no `imjinrok2` or helper process. Treat this marker as a
  navigation/timing failure, not as negative evidence for the hero-panel draw/update path.
- Marker `codex-imjinrok-k01-launchdebug-herodraw-20260602-1533` repeated the same hardware-breakpoint scope, navigated
  through the scenario country screen by selecting the right-side Joseon map area, selected `1. 불안한 전운`, and wrote
  `C:\rev\logs\codex-imjinrok-k01-launchdebug-herodraw-20260602-1533-ui-callsite-debug-k01-hero-draw.json` with
  `status: hit`. The hit was `hero-panel-name-lookup-call` at `0x004a76d0`, target `0x004a8870`, exception code
  `0x4000001e`, `ECX == ESI == 0x005e3680`, `EDX == stackDwords[0] == 0x04e6b468`, `EDI == 1`,
  `EIP == 0x004a76d0`, and call-site bytes beginning `E8-9B-11-00-00`. This is original-runtime evidence for the
  hero-panel name lookup path in the Joseon K01 menu-to-mission flow.
- Cleanup for `codex-imjinrok-k01-launchdebug-herodraw-20260602-1533` found recorded `imjinrok2` PID `372` already
  not-running. Follow-up wrapper `ps` checks for `imjinrok2`, `trace-ui-callsite-debugger`, and `x32dbg` returned no
  output.
- Marker `codex-imjinrok-k01-launchdebug-heroframe-20260602-1542` armed the downstream hero-panel frame candidates
  without the earlier `0x004a76d0` lookup. It selected K01 and hit `hero-panel-frame-presence-check` at `0x004a7716`,
  target `0x0044abb0`, exception code `0x4000001e`, with `ECX == 0x00559418`, `EDX == stackDwords[0] == 0x00fe96c8`,
  `ESI == 0x005e3680`, `EDI == 0`, `EBP == 2`, and call-site bytes beginning `E8-95-34-FA-FF`.
- Cleanup for `codex-imjinrok-k01-launchdebug-heroframe-20260602-1542` found recorded `imjinrok2` PID `5528` already
  not-running. Follow-up wrapper `ps` checks for `imjinrok2`, `trace-ui-callsite-debugger`, and `x32dbg` returned no
  output.
- Marker `codex-imjinrok-k01-launchdebug-herodrawonly-20260602-1546` armed `0x004a773d`, `0x004a7758`, `0x004a7778`,
  and `0x004a778a`, excluding the earlier presence check. It hit `hero-panel-frame-clear-call` at `0x004a773d`,
  target `0x0044c8c0`, exception code `0x4000001e`, with `EAX == 0x77`, `EDX == 0x78`, `ECX == 0x00559418`,
  `ESI == 0x005e3680`, `EDI == 0`, `EBP == 2`, and stack dwords starting `0, 0, 0x81, 0x77, 0xfe`. This matches the
  static clear/fill pre-call context derived from `0x00c83e8c-1`, `0x00c83e90-1`, and `0xfe`.
- Cleanup for `codex-imjinrok-k01-launchdebug-herodrawonly-20260602-1546` found recorded `imjinrok2` PID `7772`
  already not-running. Follow-up wrapper `ps` checks for `imjinrok2`, `trace-ui-callsite-debugger`, and `x32dbg`
  returned no output.
- Marker `codex-imjinrok-k01-launchdebug-herofinaldraw-20260602-1551` armed the final hero-panel draw candidates and
  hit `hero-panel-frame-draw-call` at `0x004a7778`, target `0x0044dfd0`, exception code `0x4000001e`. The captured
  stack dwords started `0, 0, 0x82, 0x78, 0x04783a86`; registers included `ECX == 0x00559418`, `EDX == 0x78`,
  `ESI == 0x005e3680`, `EDI == 0`, `EBP == 2`, `EIP == 0x004a7778`; call-site bytes began `E8-53-68-FA-FF`. This is
  original-runtime evidence that the K01 menu-to-mission flow reaches the hero-panel frame draw call after consuming
  the `hero.spr` setup-created tables.
- Cleanup for `codex-imjinrok-k01-launchdebug-herofinaldraw-20260602-1551` found recorded `imjinrok2` PID `8380`
  already not-running. Follow-up wrapper `ps` checks for `imjinrok2`, `trace-ui-callsite-debugger`, and `x32dbg`
  returned no output.
- Static disassembly then narrowed the remaining non-hero HUD candidates. `objectiveborder.spr` setup feeds
  `0x004a5980`/`0x004a5a10`; `ProgressBar_*` setup feeds `0x004a9610`, `0x004a967b`, and `0x004a96b5`;
  `gamespeed.spr` setup feeds `0x004ac4c0` and jump-table dispatch at `0x004ac547`.
- Marker `codex-imjinrok-k01-nonhero-draw-20260602-160713` launched the working-copy game under debug with the broad
  `hud-nonhero-draw-candidates` scope. It reached live K01 HUD by VNC, but no final hit/no-hit JSON was written before
  cleanup stopped the marked `imjinrok2` PID `8676`; treat this as inconclusive lifecycle/timing evidence, not as a
  negative call-site result.
- Marker `codex-imjinrok-k01-normal-nonhero-20260602-1612` launched a normal rendered game process, reached live K01
  HUD, then attached the broad `hud-nonhero-draw-candidates` scope. The attach helper armed 8 threads and timed out
  with `status: no-hit` before the settings dialog was opened, so this is a timing/surface miss rather than evidence
  against objective/progress candidates.
- The same marker opened the original environment/settings dialog and attached `hud-game-speed-draw-candidates`. It
  hit `game-speed-draw-entry` at `0x004ac4c0`, exception code `0x4000001e`, with `EAX == 0x78`, `EBX == 0x8c`,
  `ECX == 0x00c83b64`, `ESI == 0x00c83a48`, `EDI == 3`, and call-site bytes beginning
  `83-EC-20-0F-BF-41-10`. This is original-runtime evidence for the game-speed settings draw/update entry.
- A follow-up `hud-game-speed-frame-only-candidates` scope on the same marker excluded the entry breakpoint and hit
  `game-speed-state-jump-table` at `0x004ac547`, exception code `0x4000001e`, with `EAX == 4`, `EBX == 4`,
  `ECX == 0x00c83b64`, `EDX == 0x0d`, `ESI == 0x0a`, `EDI == 7`, `EBP == 1`, and stack dwords encoding the static
  word sequence `0..0xe` before dispatch through table `0x004ac5bc`.
- Cleanup for `codex-imjinrok-k01-normal-nonhero-20260602-1612` stopped the marked `imjinrok2` PID `2648`.
  Follow-up wrapper `ps` checks for `imjinrok2`, `codex-imjinrok`, `trace-ui-callsite-debugger`, and `x32dbg` returned
  no output.
- Cleanup for `codex-imjinrok-ui-debugapi-20260602-1131-game` found recorded `imjinrok2` PID `6752` already
  not-running. Follow-up wrapper `ps` checks for `imjinrok`, `x32dbg`, `headless`, and
  `trace-ui-callsite-debugger` returned no output.

The generated plan currently uses marker prefix `codex-imjinrok-ui-trace` and targets these runtime questions:

- Which `0x00442dd0` call-site arguments are resource path, cache pointer, and destination buffer?
- Which `0x004434a0` call-site arguments become UI control state, geometry, or hit-test records?
- Whether `YMAP###` loops around `0x0049b190` encode stage/map cell bounds or index limits.
- Whether mouse-interface constants `0x119`, `0x185`, `0x120`, and `0x1c2` are coordinates, dimensions, or structure
  fields.
- Whether the K01 live HUD draw/update paths use pre-initialized `hero.spr`, `objectiveborder.spr`, `ProgressBar_*`,
  or `gamespeed.spr` resources without re-running their setup call-sites. The hero-panel lookup/final draw path and
  game-speed settings path are now dynamically confirmed; objective/progress HUD draw/update paths remain unhit.

Primary call-site breakpoints to capture in x32dbg:

- `0x004aafda` and `0x004aafeb`: stage-selection border load/bind.
- `0x004ab043` and `0x004ab054`: adjacent save/load bar load/bind in the same stage-select block.
- `0x004994d6`: `YMAP000 [%d]` range diagnostic path.
- `0x0049b19d` and `0x0049b1c0`: map-control hit-test helper and diagnostic path.
- `0x00494bb9` and `0x00494bca`: OK/cancel border load/bind.
- `0x004a51de` and `0x004a5210`: primary mouse-interface load/bind.
- `0x004aaae3` and `0x004aab15`: secondary mouse-interface load/bind.
- `0x004a76d0` and `0x004a887f`: hero-panel name lookup and `0x00c83e00` table read.
- `0x004a7758` and `0x004a7778`: hero-panel frame-table read and candidate draw call.

Capture at each hit:

- `EAX`, `EBX`, `ECX`, `EDX`, `ESI`, `EDI`, `EBP`, `ESP`.
- Top stack dwords before the call.
- Decoded ASCII for stack/register pointers that land inside `.data`.
- Memory near stack-buffer arguments and destination object field pointers.
- Current menu/screen state and the user action that triggered the hit.

Do not treat any captured value as final layout parity until it is tied to a named resource/control path and a concrete
runtime condition.
