import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateUiX64dbgScript } from "./generate-ui-x64dbg-script.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalExecutablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");

test("UI x64dbg setup script covers HUD and menu UI runtime probes", () => {
  const script = generateUiX64dbgScript(originalExecutablePath);

  assert.match(script, /IMJINROK_UI_TRACE_SETUP sha=25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e mode=setup category=all/);
  assert.match(script, /scriptcmd bp 0x004a51de/);
  assert.match(script, /scriptcmd bp 0x004a5210/);
  assert.match(script, /scriptcmd bp 0x004aaae3/);
  assert.match(script, /scriptcmd bp 0x004aab15/);
  assert.match(script, /scriptcmd bp 0x004aafda/);
  assert.match(script, /scriptcmd bp 0x00494bb9/);
  assert.match(script, /scriptcmd bp 0x0049b19d/);
  assert.match(script, /strings=yfnt\/mouseinterface\.spr\|YYMICONTROL0000001\|FKJE8567/);
  assert.match(script, /stack11=\{p:dword:\[esp\+2c\]\}/);
  assert.match(script, /\nret\n$/);
});

test("UI x64dbg setup script can focus on mouse-interface probes", () => {
  const script = generateUiX64dbgScript(originalExecutablePath, { category: "hud-mouse-interface" });

  assert.match(script, /category=hud-mouse-interface/);
  assert.match(script, /scriptcmd bp 0x004a51de/);
  assert.match(script, /scriptcmd bp 0x004a5210/);
  assert.match(script, /scriptcmd bp 0x004aaae3/);
  assert.match(script, /scriptcmd bp 0x004aab15/);
  assert.doesNotMatch(script, /scriptcmd bp 0x004aafda/);
  assert.doesNotMatch(script, /scriptcmd bp 0x00494bb9/);
  assert.doesNotMatch(script, /scriptcmd bp 0x0049b19d/);
});

test("UI x64dbg capture-file script stores stack snapshots on UI breakpoint hits", () => {
  const script = generateUiX64dbgScript(originalExecutablePath, {
    mode: "capture-file",
    capturePrefix: "codex-imjinrok-ui-capture-test",
    category: "hud-mouse-interface",
  });

  assert.match(script, /mode=capture-file/);
  assert.match(
    script,
    /scriptcmd SetBreakpointCommand 0x004a51de, "savedata C:\\rev\\logs\\codex-imjinrok-ui-capture-test-mouse-interface-primary_0x004a51de-_0x00442dd0-0x004a51de-stack\.bin, esp, 0x80"/,
  );
  assert.match(script, /scriptcmd SetBreakpointCommandCondition 0x004a51de, 1/);
  assert.match(script, /scriptcmd SetBreakpointFastResume 0x004a51de, 0/);
  assert.match(script, /scriptcmd SetBreakpointCommand 0x004aab15, "savedata C:\\rev\\logs\\codex-imjinrok-ui-capture-test-mouse-interface-secondary_0x004aab15-_0x004434a0-0x004aab15-stack\.bin, esp, 0x80"/);
  assert.doesNotMatch(script, /YSELECTSTAGE/);
  assert.match(script, /\nret\n$/);
});
