# Imjinrok 2 K01 Campaign Runtime Trace Plan

> Archived on 2026-07-26. This VM-first trace plan is retained as historical context, not as the current workflow.

## Purpose

This note records the current static-to-dynamic trace plan for proving original executable K01 mission runtime behavior.
It is not runtime proof by itself. It identifies the exact original executable addresses that should be captured in
x32dbg/QGA before K01 can be described as original-runtime parity. K02 is no longer an MVP completion target; K02 probe
data below is retained only as optional follow-up evidence.

Generate the current plan with:

```sh
node tools/imjinrok/extract-campaign-runtime-trace-plan.mjs
node tools/imjinrok/extract-campaign-runtime-trace-plan.mjs --json
node tools/imjinrok/generate-campaign-x64dbg-script.mjs --mode setup
node tools/imjinrok/generate-campaign-x64dbg-script.mjs --mode capture-file --capture-prefix codex-imjinrok-campaign-trace-<timestamp>
node tools/imjinrok/generate-campaign-x64dbg-script.mjs --mode headless-run
node tools/imjinrok/extract-campaign-runtime-trace-plan.mjs --mission all
node tools/imjinrok/generate-campaign-x64dbg-script.mjs --mission all --mode setup
```

The default mission scope is now K01. Use `--mission all` only when intentionally doing optional K02 follow-up work.

Regression coverage is in:

- `tools/imjinrok/campaign-runtime-trace-plan.test.mjs`
- `tools/imjinrok/campaign-x64dbg-script.test.mjs`

## VM Context

- QGA wrapper: `/home/bluboks/.local/bin/win10-qga`
- Debugger: `C:\rev\tools\x64dbg\release\x32\x32dbg.exe`
- Headless debugger helper: `C:\rev\tools\x64dbg\release\x32\headless.exe`
- Working-copy launcher: `C:\rev\work\imjinrok2-ascii\run-imjinrok2.cmd`
- Working-copy executable: `C:\rev\work\imjinrok2-ascii\imjinrok2.exe`
- Marker prefix for future runs: `codex-imjinrok-campaign-trace`
- GUI x32dbg target launcher: `C:\rev\work\run-campaign-x32dbg-target-launch.ps1`
- GUI x32dbg command sequence helper: `C:\rev\work\send-x32dbg-command-sequence.ps1`
- Generated campaign setup script path: `C:\rev\work\codex-imjinrok-campaign-setup.xdbg`
- Multi-process marker cleanup helper: `C:\rev\work\cleanup-codex-marker-processes.ps1`

The VM has the x64dbg headless helper installed. A no-argument preflight initialized x64dbg and entered its command
loop, then exited without leaving `headless`, `x32dbg`, or `imjinrok` processes behind.

Observed x64dbg/headless automation facts:

- x64dbg build commit: `9c2c21af2032a60d33a786194778f7ef62323208`.
- `headless.exe -c "quit"` initializes and exits without leaving a `headless` process.
- `headless.exe -cf <script>` loads x64dbg SimpleScript files. A script containing `log "..."` and `ret` prints the
  log line and reports `Script finished!`.
- `ret` is the correct SimpleScript terminator for these smoke scripts. Plain `quit` and `scriptcmd "quit"` are not
  valid SimpleScript termination patterns.
- `scriptcmd` is the bridge for issuing debugger commands from a running script. The generated campaign script uses it
  for `bp`, `SetBreakpointSilent`, `SetBreakpointLog`, and `SetBreakpointCondition`.
- When invoked through QGA from the default `C:\Windows\system32` current directory, `-cf` path handling can prefix the
  script path incorrectly. Use a controlled working directory and a relative script path, or a marker launcher whose
  working directory contains the script.
- Headless command-line target loading needs an absolute `imjinrok2.exe` path. A relative `imjinrok2.exe` target
  argument failed with `File does not exist!`.
- An absolute target path loads `imjinrok2.exe` and system DLLs under headless, but the smoke command file did not
  reach its first script log line within a 20 second timeout.
- A 60 second helper timeout for marker `codex-imjinrok-headless-target-extended-20260602-0207` also did not reach the
  smoke command body before cleanup. The helper did clean its marked `headless` and `imjinrok2` processes after the
  timeout, but the host wrapper returned after its current 30 second guest-command wait. Longer captures should
  therefore be split into prompt marker launch, separate log polling, and explicit marker cleanup wrapper calls.
- GUI x32dbg can open `C:\rev\work\imjinrok2-ascii\imjinrok2.exe` under debugger control when dispatched through the
  interactive desktop. Marker `codex-imjinrok-x32dbg-target-interactive-20260602-0803` reached the initial debugger
  break at `ntdll.dll`, with x32dbg PID `5500` and debuggee PID `2976` recorded in marker JSON and later cleaned.
- Non-interactive QGA PowerShell can create x32dbg/debuggee processes but does not surface the GUI on the desktop; use
  `exec-powershell-interactive` or `launch-marked` for GUI debugger work.
- x32dbg currently shows its first-run Release Notes dialog before the main debugger surface. Close or suppress that
  dialog before attempting scripted command entry or K01 menu navigation.
- The verified GUI command path is `send-x32dbg-command-sequence.ps1` with x32dbg marker PID activation. Marker
  `codex-imjinrok-x32dbg-scriptexec-smoke-20260602-0830` ran a small `scriptexec` script and produced a 64-byte
  `savedata` dump of `0x00400000` beginning with `4D-5A-90-00`.
- Marker `codex-imjinrok-x32dbg-campaign-setup-smoke-20260602-0832` sent
  `scriptexec C:\rev\work\codex-imjinrok-campaign-setup.xdbg`, then a proof `savedata` command. The proof file was
  created and also began with `4D-5A-90-00`, so the next trace attempt can start from the same interactive x32dbg
  command path.
- The `capture-file` script mode adds `SetBreakpointCommand` file captures to the log-only breakpoints. Marker
  `codex-imjinrok-x32dbg-capture-run-smoke-20260602-0845` proved this mode under live execution: after `erun` commands,
  the original executable created 64-byte stack snapshots for `script\k0110` at `0x0048d049` and `script\k0210` at
  `0x0048d071`. This is original-runtime proof that those initial campaign script copy call-sites executed, but it was
  not yet proof that K01 mission runtime was entered.

## Static Anchors

The original executable hash is:

- SHA-256: `25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e`

Script engine call targets inferred from repeated campaign call-site patterns:

| Target | Working role |
| --- | --- |
| `0x004823a0` | script engine busy/active check candidate |
| `0x00482180` | script load/queue candidate |
| `0x00482340` | script start/commit candidate |

These roles are hypotheses until a debugger trace captures arguments, return values, and script engine state.

## Mission Script Breakpoints

| Mission | Script | Push site | Load call | Start call | Runtime question |
| --- | --- | ---: | ---: | ---: | --- |
| K01 | `script\k0115` | `0x0048a6cf` | `0x0048a6d9` | `0x0048a6e3` | opening dialogue timing and guard state |
| K01 | `script\k0120` | `0x0048a78a` | `0x0048a794` | `0x0048a79e` | beacon/reinforcement trigger and unit scan state |
| K02 | `script\k0220` | `0x0048a922` | `0x0048a92c` | `0x0048a936` | opening dialogue timing and guard state |
| K02 | `script\k0225` | `0x0048a990` | `0x0048a99a` | `0x0048a9a4` | Hanseong occupation/pursuit trigger |
| K02 | `script\k0227` | `0x0048ab52` | `0x0048ab5c` | `0x0048ab66` | Gwon Yul rendezvous trigger |
| K02 | `script\k0230` | `0x0048ace1` | `0x0048aceb` | `0x0048acf5` | Pyongyang arrival/victory trigger |

Additional trigger guard breakpoints:

- K01 `K0115`: `0x0048a6bd`, `0x0048a6c6`
- K01 `K0120`: `0x0048a74f`, `0x0048a75c`, `0x0048a76a`, `0x0048a76f`, `0x0048a781`
- K01 `K0120` post-trigger effects: `0x0048a7ae`, `0x0048a7b9`, `0x0048a7c7`, `0x0048a7d5`
- K02 `K0220`: `0x0048a910`, `0x0048a919`
- K02 `K0225`: `0x0048a955`, `0x0048a976`, `0x0048a987`
- K02 `K0227`: `0x0048ab19`, `0x0048ab38`, `0x0048ab49`
- K02 `K0230`: `0x0048acc0`, `0x0048acd1`, `0x0048acd8`

## Mission Resource Breakpoints

| Mission | Resource | Breakpoint | Evidence role |
| --- | --- | ---: | --- |
| K01 | `script\k0110` | `0x0048d049` | initial script path copy |
| K02 | `script\k0210` | `0x0048d071` | initial script path copy |
| K01 | `stagemap\k01.map` | `0x0048d740` | stage map path copy function |
| K02 | `stagemap\k02.map` | `0x0048d770` | stage map path copy function |

Stage map dispatcher breakpoints:

- `0x0048d410`: dispatcher entry, capture stage selector argument at `[ESP+4]`
- `0x0048d429`: K01 map-copy dispatch
- `0x0048d435`: K02 map-copy dispatch

K02 rain/weather call-site:

- `0x0048aad2`: trace effect arguments and confirm whether this is the original rain trigger mirrored as
  `exe/K02@0x48aad2`.

K02 rows are optional follow-up only. The default trace-plan and x64dbg script generator now filter them out unless
called with `--mission all`.

## K01 K0120 Static Trigger Derivation

Disassembly around `0x0048a731`-`0x0048a7f2` narrows the K0120 trigger:

- `0x0048a731`: checks one-shot flag `WORD [0x008438dc]`.
- `0x0048a742`: initializes a scan pointer at `0x0063528f`.
- `0x0048a747`: scans `0x4b0` records.
- `0x0048a750`: calls `0x00441e40` with the current index and skips inactive/missing records when it returns zero.
- `0x0048a75c`: compares `BYTE [record+1]` with `WORD [0x00bccc44]`, the current player/owner candidate.
- `0x0048a76a`: requires `BYTE [record] == 0x34`, the beacon unit type.
- `0x0048a76f`: requires `BYTE [record+0x55] == 0x64`, interpreted as full construction/progress.
- `0x0048a77a`: writes the one-shot flag after the beacon condition is met.
- `0x0048a78a`, `0x0048a794`, `0x0048a79e`: pushes `script\k0120`, loads it through `0x00482180`, and starts it
  through `0x00482340`.
- `0x0048a7ae` and `0x0048a7b9`: follow-up calls with coordinates `0x37`, `0x35` (`55`, `53`) and related effect
  arguments.
- `0x0048a7c7` and `0x0048a7d5`: follow-up state/order calls after the K0120 script start.

Marker `codex-imjinrok-k01-memory-base-20260602-0924` added direct-process-memory dynamic evidence for this path:

- Before patching, the live K01 process held the expected K0120 code bytes at `0x0048a731`, `script\k0120` at
  `0x004c2f38`, owner `WORD [0x00bccc44] == 0`, one-shot `WORD [0x008438dc] == 0`, and no current-owner full beacon
  records.
- A single forced beacon record did not set the one-shot flag. NOPing the pre-scan `JNE 0x0048a7f2` at `0x0048a72b`
  also did not set it with only one forced candidate, narrowing the missing condition to active-record selection.
- Patching nine current-owner candidate records to type `0x34`/progress `0x64` produced
  `observed-k0120-one-shot-set`: sample 0 recorded `WORD [0x008438dc] == 1`, active records grew to 120, and unit-type
  counts expanded with `0x0c`, `0x0d`, `0x0e`, and `0x52`; VNC showed `승리했습니다!`.

This is condition/control-flow-forced evidence, not a natural beacon-construction capture. It is strong evidence for
the K0120 scan/effect/victory path, but natural UI construction timing remains a separate parity question.

## K01 Defeat Static Derivation

Disassembly around `0x0048a812`-`0x0048a870` narrows the K01 hero-loss defeat condition:

- `0x0048a812`: loads current owner `WORD [0x00bccc44]`, pushes owner and type `0x4c`, calls `0x004885e0`, then
  calls `0x00441de0`.
- `0x0048a82a`-`0x0048a83b`: if the type `0x4c` lookup is not alive/present and `DWORD [0x00843740] == 0`, writes
  `DWORD [0x00843740] = DWORD [0x00882e04]`.
- `0x0048a840`: repeats the same owner lookup for type `0x4e`.
- `0x0048a858`-`0x0048a86a`: if type `0x4e` is not alive/present and `DWORD [0x00843740] == 0`, writes the same
  current tick value to `0x00843740`.
- Current source-map entity mapping identifies type `0x4c` as Gwon Yul and type `0x4e` as Ryu Seong-ryong in the K01
  local-player start records.
- The shared alive-check helper `0x00441de0` uses the current unit table selection and checks the selected record
  word at `record + 0x07` before considering that unit alive/present.

The common mission-result gate at `0x0048d6f0` consumes the paired result timers:

- `0x0048d6f0` reads `DWORD [0x0084373c]`, the victory-side timer candidate, and compares
  `abs(DWORD [0x00882e04] - DWORD [0x0084373c])` with `0x7d0`; if the delta is greater than `0x7d0`, it returns `1`.
- `0x0048d718` reads `DWORD [0x00843740]`, the defeat-side timer candidate, performs the same `0x7d0` delta check,
  and returns `-1` only after the delta is greater than `0x7d0`.
- `0x0048dde0` calls `0x0048d6f0`; a non-zero result calls `0x004492f0` and returns that mission result value.

The K01 implementation mirrors this static evidence with `imjinrokOriginalMissionResultDelayTicks = 0x7d0` on the
Gwon Yul and Ryu Seong-ryong protection objectives. This is static binary evidence plus local simulation coverage.

Marker `codex-imjinrok-k01-defeat-20260602-0957` added condition-forced live-process evidence for the timer side:

- Pre-patch probe `codex-imjinrok-k01-defeat-20260602-0957-k01-defeat-state-before-hero-patch.json` observed owner
  `0`, defeat timer `0`, current-owner type `0x4c` at record index `19`, and current-owner type `0x4e` at record
  index `30`.
- Patch record `codex-imjinrok-k01-defeat-20260602-0957-k01-defeat-heroes-patch.json` changed only those two current
  owner hero records to type `0x00`/owner `0xff` inside the marked run.
- Watch probe `codex-imjinrok-k01-defeat-20260602-0957-k01-defeat-state-after-hero-patch-watch.json` recorded
  `observed-k01-defeat-timer-set`: sample 0 had `DWORD [0x00843740] == 37839620`, `DWORD [0x00882e04] == 37841666`,
  timer delta `2046`, and zero current-owner hero records.
- VNC showed an original `delete char`/`overflow` dialog instead of the defeat overlay after this direct record patch.
  Treat this as defeat-timer runtime evidence, not clean overlay evidence; this limitation motivated the lower-level
  alive-check-word run below.

Marker `codex-imjinrok-k01-defeat-alive-20260602-1010` captured the clean defeat overlay through the alive-check path:

- Pre-patch probe `codex-imjinrok-k01-defeat-alive-20260602-1010-k01-defeat-state-before-alive-word-patch.json`
  observed owner `0`, defeat timer `0`, current-owner type `0x4c` at record index `19` with alive-check word `1000`,
  and current-owner type `0x4e` at record index `30` with alive-check word `600`.
- Patch record `codex-imjinrok-k01-defeat-alive-20260602-1010-k01-defeat-alive-word-patch.json` preserved type/owner
  fields and changed only each protected hero record `+0x07` alive-check word to `0`.
- Watch probe `codex-imjinrok-k01-defeat-alive-20260602-1010-k01-defeat-state-after-alive-word-patch-watch.json`
  recorded `observed-k01-defeat-timer-set`, retained current-owner type `0x4c`/`0x4e` hero records,
  `currentOwnerAliveHeroCheckCount == 0`, and a defeat timer delta above `0x7d0`.
- VNC showed the original `패배했습니다` overlay without the previous direct record-deletion overflow dialog.

## Watched Globals

Capture these at every K01 breakpoint hit:

| Address | Working role |
| ---: | --- |
| `0x007c5f80` | mission tick or phase counter candidate |
| `0x008438dc` | K01 K0120 one-shot flag candidate |
| `0x0084373c` | common mission victory-result timer candidate |
| `0x00843740` | common mission defeat-result timer candidate |
| `0x00882e04` | global runtime tick/time source candidate |
| `0x00bcbe08` | script engine object used by K01 script calls |
| `0x0063540e` | unit table base candidate used by K01 scans |
| `0x00ac2d90` | map width or x-bound candidate |
| `0x00ac2d94` | map height or y-bound candidate |

## Capture Procedure

1. Confirm no existing `codex-imjinrok` process is running with the wrapper `ps` subcommand.
2. Generate the x64dbg breakpoint setup script with `tools/imjinrok/generate-campaign-x64dbg-script.mjs`; use
   `--mode capture-file --capture-prefix <marker>` for runs where breakpoint hits must leave durable files.
3. Copy the generated script into the VM and keep all guest paths quoted when invoking wrapper commands.
4. Launch the game/debugger with a fresh marker derived from `codex-imjinrok-campaign-trace`.
5. Prefer the verified normal-launch-then-attach x32dbg route for the next K01 capture attempt: launch
   `C:\rev\work\imjinrok2-ascii\run-imjinrok2.cmd` with a marker, attach x32dbg to that live game process, load a
   K01-only capture script through `send-x32dbg-command-sequence.ps1`, and continue.
6. If using the older direct x32dbg target launcher, open the target with
   `C:\rev\work\run-campaign-x32dbg-target-launch.ps1`, close/suppress the Release Notes dialog if it appears, load
   `C:\rev\work\codex-imjinrok-campaign-setup.xdbg` with `send-x32dbg-command-sequence.ps1`, and continue from the
   initial `ntdll.dll` break.
7. For any run expected to exceed roughly 30 seconds, make the marker launch return promptly, then poll logs and clean
   up through separate `/home/bluboks/.local/bin/win10-qga` calls.
8. Enter single-player Joseon K01 using the original working-copy executable.
9. Capture map dispatch/copy breakpoints first to prove the exact mission resource path.
10. Capture script event call-sites to record trigger guard state, pushed script path, script engine arguments, and
   return values.
11. At every hit, record registers, top ESP dwords, watched globals, decoded path buffers, and current mission state.
12. Clean up the marked process immediately after each capture and verify no marker process remains.

K01 mission entry, K01 stage-map dispatch, K0115 opening-trigger captures, a forced K0120/victory dynamic observation,
static K01 defeat-timer derivation, condition-forced K01 defeat-timer dynamic observation, and clean K01 defeat overlay
observation now exist. Until key UI/mechanics and ideally a natural beacon-construction capture exist as
original-runtime observations, the current K01 MVP remains source/static-derived with local simulation coverage and
partial original runtime observation, not fully observed original runtime parity.
