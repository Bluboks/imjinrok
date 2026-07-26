import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCampaignRuntimeTracePlan } from "./extract-campaign-runtime-trace-plan.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalExecutablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");

test("campaign runtime trace plan points at the prepared VM analysis environment", () => {
  const plan = buildCampaignRuntimeTracePlan(originalExecutablePath);

  assert.equal(plan.executableSha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(plan.vm.qgaWrapper, "/home/bluboks/.local/bin/win10-qga");
  assert.equal(plan.vm.debuggerPath, "C:\\rev\\tools\\x64dbg\\release\\x32\\x32dbg.exe");
  assert.equal(plan.vm.debuggerHeadlessPath, "C:\\rev\\tools\\x64dbg\\release\\x32\\headless.exe");
  assert.equal(plan.vm.guiTargetLauncher, "C:\\rev\\work\\run-campaign-x32dbg-target-launch.ps1");
  assert.equal(plan.vm.guiCommandSequenceHelper, "C:\\rev\\work\\send-x32dbg-command-sequence.ps1");
  assert.equal(plan.vm.markerCleanupHelper, "C:\\rev\\work\\cleanup-codex-marker-processes.ps1");
  assert.equal(plan.vm.campaignSetupScript, "C:\\rev\\work\\codex-imjinrok-campaign-setup.xdbg");
  assert.equal(plan.vm.workingCopyLauncher, "C:\\rev\\work\\imjinrok2-ascii\\run-imjinrok2.cmd");
  assert.equal(plan.vm.markerPrefix, "codex-imjinrok-campaign-trace");
  assert.equal(plan.scope.mission, "K01");
  assert.match(plan.scope.allowedFlow, /single-player Joseon K01/);
  assert.ok(plan.manualTraceSequence.some((step) => step.includes("interactive x32dbg")));
  assert.ok(plan.manualTraceSequence.some((step) => step.includes("scriptexec")));
});

test("campaign runtime trace plan defaults to K01 script trigger call-sites", () => {
  const plan = buildCampaignRuntimeTracePlan(originalExecutablePath);
  const events = new Map(plan.scriptEvents.map((event) => [event.id, event]));

  assertScriptEvent(events, "k01-opening-dialogue-k0115", "script\\k0115", "0x0048a6cf");
  assertScriptEvent(events, "k01-beacon-reinforcement-dialogue-k0120", "script\\k0120", "0x0048a78a");
  assert.ok(events.get("k01-beacon-reinforcement-dialogue-k0120")?.breakpoints.some((breakpoint) =>
    breakpoint.address === "0x0048a7ae" && breakpoint.role === "k01-k0120-world-effect-or-spawn-call"
  ));
  assert.ok(events.get("k01-beacon-reinforcement-dialogue-k0120")?.breakpoints.some((breakpoint) =>
    breakpoint.address === "0x0048a7d5" && breakpoint.role === "k01-k0120-retreat-order-or-marker-call"
  ));
  assert.equal(events.has("k02-opening-dialogue-k0220"), false);
  assert.equal(events.has("k02-pyongyang-arrival-dialogue-k0230"), false);
});

test("campaign runtime trace plan can include optional K02 script trigger call-sites explicitly", () => {
  const plan = buildCampaignRuntimeTracePlan(originalExecutablePath, { mission: "all" });
  const events = new Map(plan.scriptEvents.map((event) => [event.id, event]));

  assert.equal(plan.scope.mission, "all");
  assert.match(plan.scope.goal, /K02 probes retained only as optional follow-up/);
  assert.match(plan.scope.allowedFlow, /K01 flow first/);
  assert.ok(plan.manualTraceSequence.some((step) => step.includes("K02 only for explicit optional follow-up")));
  assertScriptEvent(events, "k01-opening-dialogue-k0115", "script\\k0115", "0x0048a6cf");
  assertScriptEvent(events, "k01-beacon-reinforcement-dialogue-k0120", "script\\k0120", "0x0048a78a");
  assertScriptEvent(events, "k02-opening-dialogue-k0220", "script\\k0220", "0x0048a922");
  assertScriptEvent(events, "k02-hanseong-occupation-dialogue-k0225", "script\\k0225", "0x0048a990");
  assertScriptEvent(events, "k02-gwon-yul-rendezvous-dialogue-k0227", "script\\k0227", "0x0048ab52");
  assertScriptEvent(events, "k02-pyongyang-arrival-dialogue-k0230", "script\\k0230", "0x0048ace1");
});

test("campaign runtime trace plan carries initial scripts and map copy functions", () => {
  const plan = buildCampaignRuntimeTracePlan(originalExecutablePath);
  const resources = new Map(plan.missionResources.map((resource) => [resource.id, resource]));

  assertResource(resources, "k01-initial-script-copy-k0110", "script\\k0110", "0x0048d049", "0x0048d04a");
  assertResource(resources, "k01-stage-map-copy", "stagemap\\k01.map", "0x0048d740", "0x0048d745");
  assert.equal(resources.has("k02-initial-script-copy-k0210"), false);
  assert.equal(resources.has("k02-stage-map-copy"), false);

  assert.deepEqual(
    plan.dispatcherBreakpoints.map((breakpoint) => `${breakpoint.id}:${breakpoint.address}`),
    [
      "campaign-stage-map-dispatcher:0x0048d410",
      "campaign-stage-map-dispatch-k01:0x0048d429",
    ],
  );
});

test("campaign runtime trace plan includes K01 watched globals and omits K02 rain by default", () => {
  const plan = buildCampaignRuntimeTracePlan(originalExecutablePath);

  assert.ok(plan.watchedGlobals.some((global) => global.address === "0x00bcbe08"));
  assert.ok(plan.watchedGlobals.some((global) => global.address === "0x008438dc"));
  assert.equal(plan.watchedGlobals.some((global) => global.address === "0x008438e4"), false);
  assert.deepEqual(plan.worldEffectBreakpoints.map((breakpoint) => breakpoint.address), []);
  assert.equal(plan.breakpoints.some((breakpoint) => breakpoint.address === "0x0048aad2"), false);
});

test("campaign runtime trace plan includes optional K02 rain evidence in all scope", () => {
  const plan = buildCampaignRuntimeTracePlan(originalExecutablePath, { mission: "all" });

  assert.ok(plan.watchedGlobals.some((global) => global.address === "0x008438e4"));
  assert.deepEqual(plan.worldEffectBreakpoints.map((breakpoint) => breakpoint.address), ["0x0048aad2"]);
  assert.ok(plan.breakpoints.some((breakpoint) => breakpoint.address === "0x0048aad2"));
});

function assertScriptEvent(events, id, sourceScript, scriptPushVa) {
  const event = events.get(id);

  assert.ok(event, `missing script event ${id}`);
  assert.equal(event.sourceScript, sourceScript);
  assert.equal(event.pushSite.instructionVa, scriptPushVa);
  assert.deepEqual(
    event.inferredScriptEngineCalls.map((call) => `${call.va}->${call.target}`),
    [`${nextInstruction(scriptPushVa, 0x0a)}->0x00482180`, `${nextInstruction(scriptPushVa, 0x14)}->0x00482340`],
  );
  assert.ok(event.breakpoints.some((breakpoint) => breakpoint.address === scriptPushVa));
}

function assertResource(resources, id, resource, address, xrefAddress) {
  const entry = resources.get(id);

  assert.ok(entry, `missing resource ${id}`);
  assert.equal(entry.resource, resource);
  assert.equal(entry.xref.instructionVa, xrefAddress);
  assert.equal(entry.breakpoint.address, address);
}

function nextInstruction(hexAddress, offset) {
  return `0x${(Number.parseInt(hexAddress, 16) + offset).toString(16).padStart(8, "0")}`;
}
