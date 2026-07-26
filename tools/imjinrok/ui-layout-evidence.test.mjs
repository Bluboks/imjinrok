import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractUiLayoutStaticEvidence } from "./extract-ui-layout-evidence.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalExecutablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");

test("original executable exposes static UI layout probe blocks", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));

  assert.equal(report.imageBase, "0x00400000");
  assert.deepEqual(
    report.probes.map((probe) => probe.id),
    [
      "select-stage-border-bind",
      "map-control-range-check",
      "map-control-hit-test",
      "ok-cancel-control-bind",
      "mouse-interface-primary",
      "mouse-interface-secondary",
      "objective-border-bind",
      "hero-panel-bind",
      "hero-panel-update-draw",
      "selected-panel-progress-draw",
      "selected-panel-production-text-draw",
      "selected-panel-slot-dispatch",
      "bottom-panel-text-numeric-draw",
      "bottom-panel-main-hud-call-order",
      "hero-panel-name-table-lookup",
      "progress-bar-bind",
      "game-speed-bind",
      "objective-border-update-draw",
      "progress-bar-update-draw",
      "game-speed-update-draw",
    ],
  );

  assertProbeStrings(probesById.get("select-stage-border-bind"), [
    "YSELECTSTAGE",
    "YSELECTSTAGE [%s]",
    "yfnt\\selectstageborder.spr",
    "yfnt\\saveloadbar.spr",
  ]);
  assertProbeCalls(probesById.get("select-stage-border-bind"), ["0x0044b040", "0x00442dd0", "0x004434a0"]);
  assertProbeFieldOffsets(probesById.get("select-stage-border-bind"), [
    "0x00001ce0",
    "0x000010ec",
    "0x000028d8",
    "0x00001ce4",
  ]);
});

test("original executable exposes map/stage-selection control candidates", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));
  const rangeCheck = probesById.get("map-control-range-check");
  const hitTest = probesById.get("map-control-hit-test");

  assertProbeStrings(rangeCheck, ["YMAP000 [%d]"]);
  assertProbeCalls(rangeCheck, ["0x0044b040"]);
  assert.deepEqual(rangeCheck.comparisons.map((comparison) => comparison.immediate), ["0x00000002"]);

  assertProbeStrings(hitTest, ["YMAP006 [%d][%d]"]);
  assertProbeCalls(hitTest, ["0x004a2de0", "0x0044b040"]);
  assert.deepEqual(hitTest.comparisons.map((comparison) => `${comparison.register}:${comparison.immediate}`), [
    "esi:0x00000003",
  ]);
});

test("original executable exposes modal and HUD/mouse-interface layout candidates", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));
  const okCancel = probesById.get("ok-cancel-control-bind");
  const mousePrimary = probesById.get("mouse-interface-primary");
  const mouseSecondary = probesById.get("mouse-interface-secondary");

  assertProbeStrings(okCancel, ["YOKCANCEL", "YOKCANCEL [%s]", "yfnt\\infoborder.spr"]);
  assertProbeCalls(okCancel, ["0x0044b040", "0x00442dd0", "0x004434a0"]);
  assertProbeFieldOffsets(okCancel, [
    "0x00000d04",
    "0x00000110",
    "0x00000114",
    "0x00000104",
    "0x00000118",
    "0x00000106",
  ]);

  assertProbeStrings(mousePrimary, ["yfnt\\mouseinterface.spr", "YYMICONTROL0000001"]);
  assertProbeSmallPushes(mousePrimary, ["0x00000002"]);
  assertProbeStackWrites(mousePrimary, ["0x0000000c=0x00000119", "0x00000024=0x00000185"]);

  assertProbeStrings(mouseSecondary, ["yfnt\\mouseinterface.spr", "YYSCRSPEEDCONTROL0000001"]);
  assertProbeSmallPushes(mouseSecondary, ["0x00000003"]);
  assertProbeStackWrites(mouseSecondary, ["0x0000000c=0x00000120", "0x00000034=0x000001c2"]);
});

test("original executable exposes K01 HUD resource candidate binding paths", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));
  const objective = probesById.get("objective-border-bind");
  const hero = probesById.get("hero-panel-bind");
  const progress = probesById.get("progress-bar-bind");
  const gameSpeed = probesById.get("game-speed-bind");

  assertProbeStrings(objective, ["yfnt\\objectiveborder.spr"]);
  assertProbeCalls(objective, ["0x00442dd0", "0x004434a0"]);
  assertCallContext(objective, "0x004a577a", {
    pushes: ["0x0094ba60", "yfnt\\objectiveborder.spr"],
  });

  assertProbeStrings(hero, ["yfnt\\hero.spr"]);
  assertProbeCalls(hero, ["0x00442dd0", "0x004434a0"]);
  assertCallContext(hero, "0x004a7445", {
    pushes: ["0x0094ba60", "yfnt\\hero.spr"],
  });

  assertProbeAnchors(progress, [
    "yfnt\\ProgressBar_Small.spr",
    "yfnt\\ProgressBar_Large.spr",
    "YYPROGRESSBARCONTROL0000001",
  ]);
  assertProbeCalls(progress, ["0x00442dd0", "0x004434a0"]);

  assertProbeStrings(gameSpeed, ["yfnt\\gamespeed.spr"]);
  assertProbeCalls(gameSpeed, ["0x00442dd0", "0x004434a0"]);
  assertProbeSmallPushes(gameSpeed, ["0x00000005"]);
  assertProbeStackWrites(gameSpeed, ["0x0000000c=0x0000011c", "0x00000054=0x00000194"]);
  assertCallContext(gameSpeed, "0x004ac3bd", {
    pushes: ["0x00000005", "0x0094ba60", "yfnt\\gamespeed.spr"],
  });
});

test("original executable exposes K01 hero-panel draw/update candidates", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));
  const updateDraw = probesById.get("hero-panel-update-draw");
  const lookup = probesById.get("hero-panel-name-table-lookup");

  assertProbeCalls(updateDraw, ["0x004a8870", "0x0044abb0", "0x0044c8c0", "0x0044dfd0", "0x0044ada0"]);
  assertProbeGlobals(updateDraw, ["0x00c83e8c", "0x00c83e90", "0x00c84a7c"]);
  assertProbeIndexedGlobals(updateDraw, ["edi*4+0x00549588", "eax*4+0x00c84348"]);
  assertCallContext(updateDraw, "0x004a7778", {
    pushes: ["0x00000000", "0x00000000"],
    globals: ["mov-r32-from-absolute:0x00c84a7c", "mov-eax-from-absolute:0x00c83e8c", "mov-r32-from-absolute:0x00c83e90"],
    indexedGlobals: ["ecx=[eax*4+0x00c84348]"],
  });

  assertProbeIndexedGlobals(lookup, ["eax*4+0x00c83e00"]);
  assertProbeCalls(lookup, ["0x0044b040"]);
});

test("original executable exposes selected panel production progress candidates", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));
  const selectedProgress = probesById.get("selected-panel-progress-draw");
  const productionText = probesById.get("selected-panel-production-text-draw");
  const slotDispatch = probesById.get("selected-panel-slot-dispatch");

  assertProbeCalls(selectedProgress, ["0x004a8410", "[ecx+0x00000014]"]);
  assertProbeIndexedGlobals(selectedProgress, ["edi*4+0x00549588"]);

  assertProbeCalls(productionText, [
    "[ecx+0x00000044]",
    "[0x004b7058]",
    "0x004a8410",
    "[0x004b7050]",
    "[edx+0x00000068]",
  ]);
  assertProbeGlobals(productionText, ["0x00634e38", "0x0055941c", "0x00559420"]);
  assertProbeIndexedGlobals(productionText, ["ecx*4+0x00c83e44", "edx*4+0x00c83e44"]);

  assertProbeCalls(slotDispatch, ["0x004a8480", "[ecx+0x0000001c]", "0x004a7880", "0x004a8410", "[edx+0x0000001c]", "0x004a81f0"]);
  assertProbeGlobals(slotDispatch, ["0x0054927c"]);
});

test("original executable exposes bottom panel text and numeric draw candidates", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));
  const bottomText = probesById.get("bottom-panel-text-numeric-draw");
  const bottomCallOrder = probesById.get("bottom-panel-main-hud-call-order");

  assertProbeAnchors(bottomText, ["%s", "%s(%c)", " %d "]);
  assertProbeStrings(bottomText, ["%s", "%s(%c)", "%c", " %d "]);
  assertProbeFieldOffsets(bottomText, [
    "0x00000080",
    "0x00000082",
    "0x00000084",
    "0x00000094",
    "0x00000294",
    "0x00000296",
    "0x00000298",
    "0x0000029a",
    "0x00000088",
    "0x00000114",
  ]);
  assertProbeCalls(bottomText, [
    "[ecx+0x00000044]",
    "[edx+0x00000044]",
    "[ecx+0x00000068]",
    "[edx+0x00000068]",
    "[esi+0x0000001c]",
    "[0x004b7054]",
    "[0x004b7044]",
    "[0x004b7048]",
    "[0x004b704c]",
    "[0x004b722c]",
    "[0x004b7050]",
    "[0x004b7058]",
    "0x0044abb0",
    "0x0044dfd0",
    "0x0044ada0",
  ]);
  assertProbeGlobals(bottomText, [
    "0x00549270",
    "0x00c06d9c",
    "0x008cae20",
    "0x008cae1c",
    "0x0055941c",
    "0x00559420",
    "0x00549580",
    "0x008cba0c",
    "0x008cb2d8",
    "0x008cb2dc",
    "0x008cb2e0",
    "0x008cb2e4",
  ]);
  assertCallContext(bottomText, "0x00456885", {
    pushes: ["%s(%c)", "%s"],
    fields: ["esi+0x00000094", "esi+0x00000094"],
    globals: ["mov-r32-from-absolute:0x004b722c"],
  });
  assertCallContext(bottomText, "0x00456f71", {
    pushes: [" %d "],
  });
  assertCallContext(bottomText, "0x004573af", {
    stackWrites: ["0x0000002c=0x00000003"],
    fields: ["esi+0x00000088", "esi+0x00000114"],
  });
  assertCallContext(bottomText, "0x00457438", {
    pushes: ["0x00000011"],
    globals: ["mov-r32-from-absolute:0x00549580", "mov-r32-from-absolute:0x00549270"],
  });

  assertProbeCalls(bottomCallOrder, ["0x004a7de0", "0x004a84e0", "0x004567c0", "0x0046fd40"]);
  assertProbeGlobals(bottomCallOrder, ["0x00549580"]);
  assertCallContext(bottomCallOrder, "0x00447b19", {
    globals: ["mov-eax-from-absolute:0x00549580"],
  });
});

test("original executable exposes remaining non-hero K01 HUD draw/update candidates", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));
  const objective = probesById.get("objective-border-update-draw");
  const progress = probesById.get("progress-bar-update-draw");
  const gameSpeed = probesById.get("game-speed-update-draw");

  assertProbeCalls(objective, ["0x0044abb0", "0x0044ae80", "0x0044af20", "0x0044dfd0", "0x0044ada0"]);
  assertProbeGlobals(objective, ["0x00552d70", "0x0088b498", "0x0088bbcc", "0x0088afe0", "0x0088afdc"]);
  assertCallContext(objective, "0x004a5a10", {
    pushes: ["0x00000051", "0x00000070"],
    globals: [
      "mov-r32-from-absolute:0x0088b498",
      "mov-eax-from-absolute:0x0088bbcc",
      "mov-r32-from-absolute:0x0088afe0",
      "mov-r32-from-absolute:0x0088afdc",
    ],
  });

  assertProbeCalls(progress, ["0x00443440", "0x0044dfd0", "0x0044e160"]);
  assertProbeGlobals(progress, ["0x00c84a80"]);
  assertProbeRegisterDisplacements(progress, ["eax+0x00c8567c", "eax+0x00c84a90", "eax+0x00c84a8c"]);
  assertCallContext(progress, "0x004a967b", {
    fields: ["esi+0x0000010c"],
    registerDisplacements: [
      "edx=[eax+0x00c8567c]",
      "edx=[eax+0x00c84a90]",
      "eax=[eax+0x00c84a8c]",
    ],
  });

  assertProbeCalls(gameSpeed, ["0x00443440", "0x0043f560"]);
  assertProbeGlobals(gameSpeed, ["0x00cd9c3c"]);
  assertProbeStackWordWrites(gameSpeed, [
    "0x00000010=0x00000000",
    "0x00000014=0x00000002",
    "0x00000016=0x00000003",
    "0x0000001a=0x00000005",
    "0x0000001c=0x00000006",
    "0x00000020=0x00000008",
    "0x00000022=0x00000009",
    "0x00000026=0x0000000b",
    "0x00000028=0x0000000c",
    "0x0000002c=0x0000000e",
  ]);
});

test("original executable groups UI evidence by call-site pre-call context", () => {
  const report = extractUiLayoutStaticEvidence(originalExecutablePath);
  const probesById = new Map(report.probes.map((probe) => [probe.id, probe]));
  const stageSelect = probesById.get("select-stage-border-bind");
  const okCancel = probesById.get("ok-cancel-control-bind");
  const mousePrimary = probesById.get("mouse-interface-primary");
  const mouseSecondary = probesById.get("mouse-interface-secondary");

  assertCallContext(stageSelect, "0x004aafda", {
    pushes: ["0x0094ba60", "yfnt\\selectstageborder.spr"],
  });
  assertCallContext(stageSelect, "0x004aafeb", {
    fields: ["esi+0x000010ec"],
  });
  assertCallContext(okCancel, "0x00494bca", {
    fields: ["esi+0x00000110"],
  });
  assertCallContext(mousePrimary, "0x004a51de", {
    pushes: ["0x00000002", "0x0094ba60", "yfnt\\mouseinterface.spr"],
    stackWrites: ["0x0000000c=0x00000119", "0x00000024=0x00000185"],
  });
  assertCallContext(mouseSecondary, "0x004aaae3", {
    pushes: ["0x00000003", "0x0094ba60", "yfnt\\mouseinterface.spr"],
    stackWrites: ["0x0000000c=0x00000120", "0x00000034=0x000001c2"],
  });
});

function assertProbeStrings(probe, expectedStrings) {
  assert.ok(probe);
  const actual = new Set(probe.pushStrings.map((event) => event.string));
  for (const expected of expectedStrings) {
    assert.equal(actual.has(expected), true, `missing pushed string ${expected}`);
  }
}

function assertProbeAnchors(probe, expectedAnchors) {
  assert.ok(probe);
  const actual = new Map(probe.anchors.map((anchor) => [anchor.value, anchor]));
  for (const expected of expectedAnchors) {
    assert.equal(actual.get(expected)?.present, true, `missing anchor ${expected}`);
  }
}

function assertProbeCalls(probe, expectedTargets) {
  assert.ok(probe);
  const actual = new Set(probe.callTargets.map((event) => event.target));
  for (const expected of expectedTargets) {
    assert.equal(actual.has(expected), true, `missing call target ${expected}`);
  }
}

function assertProbeFieldOffsets(probe, expectedOffsets) {
  assert.ok(probe);
  const actual = new Set(probe.fieldRefs.map((event) => event.fieldOffset));
  for (const expected of expectedOffsets) {
    assert.equal(actual.has(expected), true, `missing field offset ${expected}`);
  }
}

function assertProbeSmallPushes(probe, expectedImmediates) {
  assert.ok(probe);
  assert.deepEqual(
    probe.pushSmallImmediates.map((event) => event.immediate),
    expectedImmediates,
  );
}

function assertProbeStackWrites(probe, expectedWrites) {
  assert.ok(probe);
  assert.deepEqual(
    probe.stackWrites.map((event) => `${event.stackOffset}=${event.immediate}`),
    expectedWrites,
  );
}

function assertCallContext(probe, callVa, expected) {
  assert.ok(probe);
  const context = probe.callsiteContexts.find((candidate) => candidate.callVa === callVa);
  assert.ok(context, `missing callsite context ${callVa}`);

  if (expected.pushes) {
    const actualPushes = context.preCallPushes.map((event) => event.string ?? event.immediate);
    assert.deepEqual(actualPushes, expected.pushes);
  }

  if (expected.stackWrites) {
    const actualWrites = context.preCallStackWrites.map((event) => `${event.stackOffset}=${event.immediate}`);
    assert.deepEqual(actualWrites, expected.stackWrites);
  }

  if (expected.stackWordWrites) {
    const actualWrites = context.preCallStackWordWrites.map((event) => `${event.stackOffset}=${event.immediate}`);
    assert.deepEqual(actualWrites, expected.stackWordWrites);
  }

  if (expected.fields) {
    const actualFields = context.preCallFieldRefs.map((event) => `${event.baseRegister}+${event.fieldOffset}`);
    assert.deepEqual(actualFields, expected.fields);
  }

  if (expected.globals) {
    const actualGlobals = context.preCallGlobalRefs.map((event) => `${event.operation}:${event.address}`);
    assert.deepEqual(actualGlobals, expected.globals);
  }

  if (expected.indexedGlobals) {
    const actualIndexedGlobals = context.preCallIndexedGlobalRefs.map(
      (event) => `${event.register}=[${event.indexRegister}*${event.scale}+${event.address}]`,
    );
    assert.deepEqual(actualIndexedGlobals, expected.indexedGlobals);
  }

  if (expected.registerDisplacements) {
    const actualRegisterDisplacements = context.preCallRegisterDisplacementRefs.map(
      (event) => `${event.register}=[${event.baseRegister}+${event.displacement}]`,
    );
    assert.deepEqual(actualRegisterDisplacements, expected.registerDisplacements);
  }
}

function assertProbeGlobals(probe, expectedAddresses) {
  assert.ok(probe);
  const actual = new Set(probe.globalRefs.map((event) => event.address));
  for (const expected of expectedAddresses) {
    assert.equal(actual.has(expected), true, `missing global ref ${expected}`);
  }
}

function assertProbeIndexedGlobals(probe, expectedRefs) {
  assert.ok(probe);
  const actual = new Set(
    probe.indexedGlobalRefs.map((event) => `${event.indexRegister}*${event.scale}+${event.address}`),
  );
  for (const expected of expectedRefs) {
    assert.equal(actual.has(expected), true, `missing indexed global ref ${expected}`);
  }
}

function assertProbeRegisterDisplacements(probe, expectedRefs) {
  assert.ok(probe);
  const actual = new Set(
    probe.registerDisplacementRefs.map((event) => `${event.baseRegister}+${event.displacement}`),
  );
  for (const expected of expectedRefs) {
    assert.equal(actual.has(expected), true, `missing register displacement ref ${expected}`);
  }
}

function assertProbeStackWordWrites(probe, expectedWrites) {
  assert.ok(probe);
  assert.deepEqual(
    probe.stackWordWrites.map((event) => `${event.stackOffset}=${event.immediate}`),
    expectedWrites,
  );
}
