import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUiRuntimeTracePlan } from "./extract-ui-runtime-trace-plan.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalExecutablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");

test("UI runtime trace plan points at the prepared VM analysis environment", () => {
  const plan = buildUiRuntimeTracePlan(originalExecutablePath);

  assert.equal(plan.executableSha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(plan.vm.qgaWrapper, "/home/bluboks/.local/bin/win10-qga");
  assert.equal(plan.vm.debuggerPath, "C:\\rev\\tools\\x64dbg\\release\\x32\\x32dbg.exe");
  assert.equal(plan.vm.workingCopyLauncher, "C:\\rev\\work\\imjinrok2-ascii\\run-imjinrok2.cmd");
  assert.equal(plan.vm.markerPrefix, "codex-imjinrok-ui-trace");
  assert.match(plan.scope.allowedFlow, /single-player/);
});

test("UI runtime trace plan covers resource binding, control binding, and map hit-test call-sites", () => {
  const plan = buildUiRuntimeTracePlan(originalExecutablePath);
  const breakpoints = new Map(plan.breakpoints.map((breakpoint) => [breakpoint.address, breakpoint]));

  assertBreakpoint(breakpoints, "0x004aafda", "0x00442dd0", "ui-resource-load-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004aafeb", "0x004434a0", "ui-control-copy-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x00494bb9", "0x00442dd0", "ui-resource-load-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x00494bca", "0x004434a0", "ui-control-copy-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004a51de", "0x00442dd0", "ui-resource-load-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004a5210", "0x004434a0", "ui-control-copy-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004aaae3", "0x00442dd0", "ui-resource-load-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004aab15", "0x004434a0", "ui-control-copy-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004a577a", "0x00442dd0", "ui-resource-load-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004a57ac", "0x004434a0", "ui-control-copy-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004a7445", "0x00442dd0", "ui-resource-load-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004a7454", "0x004434a0", "ui-control-copy-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004a76d0", "0x004a8870", "hero-name-to-table-index-candidate");
  assertBreakpoint(breakpoints, "0x004a7778", "0x0044dfd0", "ui-sprite-frame-draw-candidate");
  assertBreakpoint(breakpoints, "0x004a78c4", "0x004a8410", "selected-panel-progress-state-candidate");
  assertBreakpoint(breakpoints, "0x004a8564", "0x004a81f0", "selected-panel-production-text-candidate");
  assertBreakpoint(breakpoints, "0x00447b19", "0x004a84e0", "selected-panel-slot-dispatch-candidate");
  assertBreakpoint(breakpoints, "0x00447b23", "0x004567c0", "bottom-panel-text-numeric-candidate");
  assertBreakpoint(breakpoints, "0x00456885", "[0x004b722c]", "text-format-candidate");
  assertBreakpoint(breakpoints, "0x00456f71", "[0x004b722c]", "text-format-candidate");
  assertBreakpoint(breakpoints, "0x00456e42", "[0x004b716c]", "text-length-candidate");
  assertBreakpoint(breakpoints, "0x00456e57", "[0x004b7050]", "text-draw-candidate");
  assertBreakpoint(breakpoints, "0x00456f9b", "[0x004b7050]", "text-draw-candidate");
  assertBreakpoint(breakpoints, "0x00456fbf", "[0x004b7058]", "text-measure-candidate");
  assertBreakpoint(breakpoints, "0x004573af", "[0x004b7050]", "text-draw-candidate");
  assertBreakpoint(breakpoints, "0x004573cd", "[0x004b7058]", "text-measure-candidate");
  assertBreakpoint(breakpoints, "0x00457406", "[ecx+0x00000068]", "surface-present-or-release-candidate");
  assertBreakpoint(breakpoints, "0x00457438", "[esi+0x0000001c]", "bottom-panel-final-blit-candidate");
  assertBreakpoint(breakpoints, "0x004a952d", "0x00442dd0", "ui-resource-load-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004a955f", "0x004434a0", "ui-control-copy-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004ac3bd", "0x00442dd0", "ui-resource-load-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x004ac3ef", "0x004434a0", "ui-control-copy-or-bind-candidate");
  assertBreakpoint(breakpoints, "0x0049b19d", "0x004a2de0", "map-control-hit-test-helper-candidate");
  assertBreakpoint(breakpoints, "0x0049b1c0", "0x0044b040", "diagnostic-or-assertion-candidate");
  assertBreakpoint(breakpoints, "0x004a5a10", "0x0044dfd0", "ui-sprite-frame-draw-candidate");
  assertBreakpoint(breakpoints, "0x004a967b", "0x0044dfd0", "ui-sprite-frame-draw-candidate");
  assertBreakpoint(breakpoints, "0x004a96b5", "0x0044e160", "ui-sprite-frame-draw-with-extra-argument-candidate");
  assertBreakpoint(breakpoints, "0x004ac451", "0x00443440", "ui-resource-destroy-or-free-candidate");
  assertBreakpoint(breakpoints, "0x004ac49a", "0x0043f560", "game-speed-state-apply-candidate");
});

test("UI runtime trace plan carries exact pre-call static context for dynamic capture", () => {
  const plan = buildUiRuntimeTracePlan(originalExecutablePath);
  const breakpoints = new Map(plan.breakpoints.map((breakpoint) => [breakpoint.address, breakpoint]));

  assert.deepEqual(
    breakpoints.get("0x004a51de")?.staticContext.preCallStackWrites.map((event) =>
      `${event.stackOffset}=${event.immediate}`
    ),
    ["0x0000000c=0x00000119", "0x00000024=0x00000185"],
  );
  assert.deepEqual(
    breakpoints.get("0x004aaae3")?.staticContext.preCallPushes.map((event) => event.string ?? event.immediate),
    ["0x00000003", "0x0094ba60", "yfnt\\mouseinterface.spr"],
  );
  assert.deepEqual(
    breakpoints.get("0x004aafeb")?.staticContext.preCallFieldRefs.map((event) =>
      `${event.baseRegister}+${event.fieldOffset}`
    ),
    ["esi+0x000010ec"],
  );
  assert.deepEqual(
    breakpoints.get("0x00494bb9")?.staticContext.preCallPushes.map((event) => event.string ?? event.immediate),
    ["0x0094ba60", "yfnt\\infoborder.spr"],
  );
  assert.deepEqual(
    breakpoints.get("0x004a7778")?.staticContext.preCallIndexedGlobalRefs.map(
      (event) => `${event.register}=[${event.indexRegister}*${event.scale}+${event.address}]`,
    ),
    ["ecx=[eax*4+0x00c84348]"],
  );
  assert.deepEqual(
    breakpoints.get("0x004a5a10")?.staticContext.preCallGlobalRefs.map((event) =>
      `${event.operation}:${event.address}`
    ),
    [
      "mov-r32-from-absolute:0x0088b498",
      "mov-eax-from-absolute:0x0088bbcc",
      "mov-r32-from-absolute:0x0088afe0",
      "mov-r32-from-absolute:0x0088afdc",
    ],
  );
  assert.deepEqual(
    breakpoints.get("0x004a967b")?.staticContext.preCallRegisterDisplacementRefs.map((event) =>
      `${event.register}=[${event.baseRegister}+${event.displacement}]`
    ),
    [
      "edx=[eax+0x00c8567c]",
      "edx=[eax+0x00c84a90]",
      "eax=[eax+0x00c84a8c]",
    ],
  );
  assert.deepEqual(
    breakpoints.get("0x004a8367")?.staticContext.preCallIndexedGlobalRefs.map(
      (event) => `${event.register}=[${event.indexRegister}*${event.scale}+${event.address}]`,
    ),
    ["edx=[edx*4+0x00c83e44]"],
  );
  assert.deepEqual(
    breakpoints.get("0x00456885")?.staticContext.preCallPushes.map((event) => event.string ?? event.immediate),
    ["%s(%c)", "%s"],
  );
  assert.deepEqual(
    breakpoints.get("0x00456885")?.staticContext.preCallFieldRefs.map((event) =>
      `${event.baseRegister}+${event.fieldOffset}`
    ),
    ["esi+0x00000094", "esi+0x00000094"],
  );
  assert.deepEqual(
    breakpoints.get("0x00456f71")?.staticContext.preCallPushes.map((event) => event.string ?? event.immediate),
    [" %d "],
  );
  assert.deepEqual(
    breakpoints.get("0x004573af")?.staticContext.preCallFieldRefs.map((event) =>
      `${event.baseRegister}+${event.fieldOffset}`
    ),
    ["esi+0x00000088", "esi+0x00000114"],
  );
  assert.deepEqual(
    breakpoints.get("0x00457438")?.staticContext.preCallGlobalRefs.map((event) =>
      `${event.operation}:${event.address}`
    ),
    ["mov-r32-from-absolute:0x00549580", "mov-r32-from-absolute:0x00549270"],
  );
});

test("UI runtime trace plan carries candidate layout constants into runtime follow-up", () => {
  const plan = buildUiRuntimeTracePlan(originalExecutablePath);

  assert.deepEqual(
    plan.candidateConstants.map((constant) => `${constant.va}:${constant.value}`),
    [
      "0x004994b8:0x00000002",
      "0x0049b1ec:0x00000003",
      "0x004a51bc:0x00000119",
      "0x004a51c4:0x00000185",
      "0x004aaac1:0x00000120",
      "0x004aaac9:0x000001c2",
      "0x004ac39b:0x0000011c",
      "0x004ac3a3:0x00000194",
    ],
  );
});

function assertBreakpoint(breakpoints, address, callTarget, role) {
  const breakpoint = breakpoints.get(address);

  assert.ok(breakpoint, `missing breakpoint at ${address}`);
  assert.equal(breakpoint.callTarget, callTarget);
  assert.equal(breakpoint.role, role);
  assert.equal(breakpoint.capture.includes("ESP"), true);
  assert.equal(breakpoint.capture.includes("call-site VA"), true);
}
