import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCampaignX64dbgScript } from "./generate-campaign-x64dbg-script.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalExecutablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");

test("campaign x64dbg setup script defaults to K01 runtime probes", () => {
  const script = generateCampaignX64dbgScript(originalExecutablePath);

  assert.match(script, /IMJINROK_TRACE_SETUP sha=25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e mode=setup mission=K01/);
  assert.match(script, /scriptcmd bp 0x0048a6cf/);
  assert.match(script, /scriptcmd bp 0x0048a78a/);
  assert.doesNotMatch(script, /scriptcmd bp 0x0048a922/);
  assert.doesNotMatch(script, /scriptcmd bp 0x0048ace1/);
  assert.match(script, /scriptcmd bp 0x0048d410/);
  assert.doesNotMatch(script, /scriptcmd SetBreakpointLog 0x0048aad2, "IMJINROK_TRACE id=k02-midcourse-rain-effect/);
  assert.doesNotMatch(script, /g_8438e4=\{p:dword:\[0x008438e4\]\}/);
  assert.match(script, /stack3=\{p:dword:\[esp\+c\]\}/);
  assert.match(script, /\nret\n$/);
});

test("campaign x64dbg setup script can still include optional K02 probes explicitly", () => {
  const script = generateCampaignX64dbgScript(originalExecutablePath, { mission: "all" });

  assert.match(script, /mission=all/);
  assert.match(script, /scriptcmd bp 0x0048a6cf/);
  assert.match(script, /scriptcmd bp 0x0048a922/);
  assert.match(script, /scriptcmd bp 0x0048ace1/);
  assert.match(script, /scriptcmd SetBreakpointLog 0x0048aad2, "IMJINROK_TRACE id=k02-midcourse-rain-effect/);
});

test("campaign x64dbg headless-run script keeps debugger alive for QGA input", () => {
  const script = generateCampaignX64dbgScript(originalExecutablePath, { mode: "headless-run" });

  assert.match(script, /scriptcmd init "C:\\rev\\work\\imjinrok2-ascii\\imjinrok2\.exe", "", "C:\\rev\\work\\imjinrok2-ascii"/);
  assert.match(script, /IMJINROK_TRACE_INIT_LOADED/);
  assert.match(script, /IMJINROK_TRACE_RUNNING/);
  assert.match(script, /scriptcmd erun/);
  assert.match(script, /\npause\n$/);
  assert.doesNotMatch(script, /\nret\n$/);
});

test("campaign x64dbg capture-file script stores stack snapshots on breakpoint hits", () => {
  const script = generateCampaignX64dbgScript(originalExecutablePath, {
    mode: "capture-file",
    capturePrefix: "codex-imjinrok-capture-test",
  });

  assert.match(script, /mode=capture-file/);
  assert.match(
    script,
    /scriptcmd SetBreakpointCommand 0x0048a6cf, "savedata C:\\rev\\logs\\codex-imjinrok-capture-test-k01-opening-dialogue-k0115_0x0048a6cf-0x0048a6cf-stack\.bin, esp, 0x40"/,
  );
  assert.match(script, /scriptcmd SetBreakpointCommandCondition 0x0048a6cf, 1/);
  assert.match(script, /scriptcmd SetBreakpointFastResume 0x0048a6cf, 0/);
  assert.match(script, /scriptcmd SetBreakpointCommand 0x0048a7ae, "savedata C:\\rev\\logs\\codex-imjinrok-capture-test-k01-beacon-reinforcement-dialogue-k0120_0x0048a7ae-0x0048a7ae-stack\.bin, esp, 0x40"/);
  assert.match(script, /scriptcmd SetBreakpointCommand 0x0048a7d5, "savedata C:\\rev\\logs\\codex-imjinrok-capture-test-k01-beacon-reinforcement-dialogue-k0120_0x0048a7d5-0x0048a7d5-stack\.bin, esp, 0x40"/);
  assert.match(script, /scriptcmd SetBreakpointLog 0x0048d410, "IMJINROK_TRACE id=campaign-stage-map-dispatcher/);
  assert.doesNotMatch(script, /k02-/);
  assert.match(script, /\nret\n$/);
});

test("campaign x64dbg init smoke script loads and stops the target without long running breakpoints", () => {
  const script = generateCampaignX64dbgScript(originalExecutablePath, { mode: "headless-init-smoke" });

  assert.match(script, /mode=headless-init-smoke/);
  assert.match(script, /scriptcmd init "C:\\rev\\work\\imjinrok2-ascii\\imjinrok2\.exe", "", "C:\\rev\\work\\imjinrok2-ascii"/);
  assert.match(script, /IMJINROK_TRACE_INIT_LOADED/);
  assert.match(script, /scriptcmd stop/);
  assert.match(script, /IMJINROK_TRACE_INIT_STOPPED/);
  assert.doesNotMatch(script, /scriptcmd bp 0x0048a6cf/);
  assert.match(script, /\nret\n$/);
});
