import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_K0110_SHA256,
  extractSelectionPanelSlotLifecycle,
  reproduceOwnerInitialization,
  reproduceSlotClear,
  reproduceSlotReset,
  reproduceSpeechSlotProduction,
} from "./extract-selection-panel-slot-lifecycle.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const scriptPath = join(repositoryRoot, "original/imjinrok2/script/K0110");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/selection-panel-slot-lifecycle-vectors.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("binds lifecycle vectors to the exact executable and K0110 inputs", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceK0110Sha256, EXPECTED_K0110_SHA256);
  assert.match(fixture.scopeNotice, /unchecked original out-of-range frame-table read/u);
});

test("recovers the bounded producer, caller, lifecycle, and string-table evidence", () => {
  const report = extract();
  assert.equal(report.analysisStatus, "static-confirmed-with-explicit-alias-boundary");
  assert.equal(report.reproductionStatus, "scoped-reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only-no-production-change");
  assert.equal(report.rawCodeRanges.length, 28);
  assert.equal(report.functionCatalog.length, 28);
  assert.equal(report.evidencePoints.length, 22);
  assert.equal(report.referenceSets.length, 14);
  assert.equal(report.outgoingReferenceSets.length, 5);
  assert.match(report.completenessBoundary, /cannot be globally excluded/u);
  assert.deepEqual(
    report.referenceSets.find(({ label }) => label === "FUN_004a7b10 callers").references,
    [
      {
        from: "0x0048313c",
        to: "0x004a7b10",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x004830f0",
      },
      {
        from: "0x004a84cf",
        to: "0x004a7b10",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x004a84b0",
      },
    ],
  );
  assert.deepEqual(
    report.labelTable.map(({ index, identifier, label }) => ({ index, identifier, label })),
    [
      { index: 0, identifier: "K1", label: "조선 권율" },
      { index: 1, identifier: "K2", label: "조선 이순신" },
      { index: 2, identifier: "K3", label: "조선 유성룡" },
      { index: 3, identifier: "K4", label: "조선 사명대사" },
      { index: 4, identifier: "K5", label: "조선 곽재우" },
      { index: 5, identifier: "J1", label: "일본 고니시" },
      { index: 6, identifier: "J2", label: "일본 가토" },
      { index: 7, identifier: "J3", label: "일본 와카자키" },
      { index: 8, identifier: "J4", label: "일본 세이쇼오" },
      { index: 9, identifier: "J5", label: "일본 우기다" },
      { index: 10, identifier: "C1", label: "명 이여송" },
      { index: 11, identifier: "C2", label: "명 조승훈" },
      { index: 12, identifier: "C3", label: "명 심유경" },
      { index: 13, identifier: "C4", label: "명 진린" },
      { index: 14, identifier: "C5", label: "명 여여문" },
      { index: 15, identifier: "K10", label: "조선 선조" },
      { index: 16, identifier: "K6", label: "조선 허준" },
    ],
  );
  assert.deepEqual(report.k0110.identifiers, ["K3", "K10", "K1"]);
  assert.deepEqual(report.k0110.resolvedSpeakers, ["조선 유성룡", "조선 선조", "조선 권율"]);
  assert.deepEqual(report.producerDiagnostics, [
    { va: "0x004babb0", value: "FKJE8567", role: "diagnostic-title" },
    { va: "0x004c920c", value: "YPRG005 [%s]", role: "new-load-failure" },
    { va: "0x004c921c", value: "YPRG004", role: "existing-pointer-before-overwrite" },
  ]);
  assert.match(report.semanticConclusion, /statically disproved as construction\/production\/research/u);
});

test("reproduces every normal, replacement, failure, reset, and clear vector", () => {
  for (const vector of fixture.productionVectors) {
    const output = reproduceSpeechSlotProduction({
      ...vector.input,
      initial: stateFor(vector),
    });
    assert.equal(sha256Json(output), vector.expectedOutputSha256, vector.id);
  }
  for (const vector of fixture.resetVectors) {
    const state = baseState();
    state.slots[vector.slot] = structuredClone(vector.record);
    assert.equal(
      sha256Json(reproduceSlotReset({ slot: vector.slot, initial: state })),
      vector.expectedOutputSha256,
      vector.id,
    );
  }
  for (const vector of fixture.clearVectors) {
    const state = baseState();
    state.slots[vector.slot] = structuredClone(vector.record);
    state.field_0xf8 = vector.field_0xf8;
    state.resourcePresent = vector.resourcePresent;
    assert.equal(
      sha256Json(reproduceSlotClear({ slot: vector.slot, mode: vector.mode, initial: state })),
      vector.expectedOutputSha256,
      vector.id,
    );
  }
});

test("locks changed-label ordering, surface failure, and retained reset fields", () => {
  const same = reproduceProduction("same-k3-replacement-clears-first-but-kind-remains-zero");
  assert.deepEqual(
    same.events.map(({ type }) => type),
    [
      "resolve-label-index",
      "compare-old-label",
      "begin-replaced-active-slot-clear",
      "deactivate-and-restore-label-sentinel",
      "call-separate-text-clear",
      "clear-exact-one-speech-text-state",
      "release-speech-resource",
      "store-kind-after-optional-replacement-clear",
      "store-label-and-draw-portrait",
      "store-disposition-activate-slot-and-reset-progress",
      "load-and-start-speech-resource",
      "activate-separate-speech-text-state",
    ],
  );
  assert.deepEqual(same.final.slots[0], {
    labelIndex: 2,
    kindState: 0,
    activeState: 1,
    progressWord: 0,
    disposition: 7,
  });

  const failedReload = reproduceProduction(
    "active-replacement-clears-text-and-old-resource-before-new-load-failure",
  );
  assert.equal(failedReload.final.field_0xf8, 0);
  assert.equal(failedReload.final.resourcePresent, false);
  assert.deepEqual(
    failedReload.events.map(({ type }) => type),
    [
      "resolve-label-index",
      "compare-old-label",
      "begin-replaced-active-slot-clear",
      "deactivate-and-restore-label-sentinel",
      "call-separate-text-clear",
      "clear-exact-one-speech-text-state",
      "release-speech-resource",
      "store-kind-after-optional-replacement-clear",
      "store-label-and-draw-portrait",
      "store-disposition-activate-slot-and-reset-progress",
      "report-speech-resource-load-failure",
    ],
  );

  const existingResource = reproduceProduction(
    "inactive-slot-reports-existing-resource-before-failed-load-overwrite",
  );
  assert.deepEqual(
    existingResource.events.slice(-2),
    [
      {
        type: "report-existing-speech-resource-before-overwrite",
        diagnostic: "YPRG004",
        resourcePresentAfterDiagnostic: true,
      },
      {
        type: "report-speech-resource-load-failure",
        diagnostic: "YPRG005 [%s]",
      },
    ],
  );
  assert.equal(existingResource.final.resourcePresent, false);

  const lockFailure = reproduceProduction(
    "surface-lock-failure-still-activates-with-sentinel-label",
  );
  assert.deepEqual(lockFailure.final.slots[3], {
    labelIndex: -1,
    kindState: 1,
    activeState: 1,
    progressWord: 0,
    disposition: 3,
  });

  const reset = fixture.resetVectors.find(({ id }) => id === "active-reset-retains-label-and-progress");
  const resetState = baseState();
  resetState.slots[reset.slot] = structuredClone(reset.record);
  assert.deepEqual(reproduceSlotReset({ slot: reset.slot, initial: resetState }).final.slots[1], {
    labelIndex: 15,
    kindState: 0,
    activeState: 0,
    progressWord: 95,
    disposition: 0,
  });
});

test("does not inspect fields unreachable after admission rejection or the unsafe frame read", () => {
  const rejected = fixture.productionVectors.find(
    ({ id }) => id === "admission-rejection-does-not-read-downstream-inputs",
  );
  const unreachableState = baseState();
  unreachableState.slots[2] = "unreachable";
  unreachableState.resourcePresent = 1;
  assert.doesNotThrow(() =>
    reproduceSpeechSlotProduction({ ...rejected.input, initial: unreachableState }));

  const failedLookup = fixture.productionVectors.find(
    ({ id }) => id === "lookup-minus-one-stops-at-explicit-unsafe-boundary",
  );
  const result = reproduceSpeechSlotProduction({
    ...failedLookup.input,
    initial: stateFor(failedLookup),
  });
  assert.equal(result.status, "unresolved-unsafe-label-index");
  assert.deepEqual(
    result.events.map(({ type }) => type),
    [
      "resolve-label-index",
      "compare-old-label",
      "begin-replaced-active-slot-clear",
      "deactivate-and-restore-label-sentinel",
      "call-separate-text-clear",
      "clear-exact-one-speech-text-state",
      "release-speech-resource",
      "store-kind-after-optional-replacement-clear",
      "store-invalid-label-before-unresolved-frame-read",
    ],
  );
  assert.equal(result.final.field_0xf8, 0);
  assert.equal(result.final.resourcePresent, false);

  const inactiveUnsafeState = baseState();
  inactiveUnsafeState.resourcePresent = 1;
  assert.doesNotThrow(() =>
    reproduceSpeechSlotProduction({
      slot: 2,
      guardAccepted: true,
      resolvedLabelIndex: -1,
      surfaceLockSucceeded: true,
      dispositionInput: "unreachable",
      resourceLoadSucceeded: "unreachable",
      textPathAccepted: "unreachable",
      initial: inactiveUnsafeState,
    }));
});

test("records an actual speech-resource release only when the prior pointer is present", () => {
  const absent = fixture.clearVectors.find(
    ({ id }) => id === "inactive-clear-with-absent-resource-does-not-release",
  );
  const absentState = baseState();
  absentState.slots[absent.slot] = structuredClone(absent.record);
  absentState.field_0xf8 = absent.field_0xf8;
  absentState.resourcePresent = absent.resourcePresent;
  const absentResult = reproduceSlotClear({
    slot: absent.slot,
    mode: absent.mode,
    initial: absentState,
  });
  assert.deepEqual(absentResult.events, [{ type: "call-separate-text-clear", mode: 0 }]);

  const present = fixture.clearVectors.find(
    ({ id }) => id === "mode-zero-restores-label-sentinel",
  );
  const presentState = baseState();
  presentState.slots[present.slot] = structuredClone(present.record);
  presentState.field_0xf8 = present.field_0xf8;
  presentState.resourcePresent = present.resourcePresent;
  assert.deepEqual(
    reproduceSlotClear({
      slot: present.slot,
      mode: present.mode,
      initial: presentState,
    }).events.map(({ type }) => type),
    [
      "deactivate-and-restore-label-sentinel",
      "call-separate-text-clear",
      "clear-exact-one-speech-text-state",
      "release-speech-resource",
    ],
  );
});

test("rejects noncanonical record widths and invalid reproduced slots loudly", () => {
  const state = baseState();
  state.slots[0].activeState = 1;
  state.slots[0].kindState = -1;
  assert.throws(
    () => reproduceSlotClear({ slot: 0, mode: 1, initial: state }),
    /canonical unsigned DWORD/u,
  );
  assert.throws(
    () => reproduceSpeechSlotProduction({
      ...fixture.productionVectors[0].input,
      dispositionInput: -1,
      initial: baseState(),
    }),
    /dispositionInput must be a canonical unsigned DWORD/u,
  );
  const reachedResourceState = baseState();
  reachedResourceState.resourcePresent = 1;
  assert.throws(
    () => reproduceSpeechSlotProduction({
      ...fixture.productionVectors[0].input,
      initial: reachedResourceState,
    }),
    /initial\.resourcePresent must be boolean/u,
  );
  assert.throws(
    () => reproduceSlotClear({ slot: 4, mode: 0, initial: baseState() }),
    /four reproduced slots 0\.\.3/u,
  );
});

test("rejects stale executable, K0110, function, and structured-reference inputs", () => {
  const directory = mkdtempSync(join(tmpdir(), "slot-lifecycle-"));
  const badExecutable = join(directory, "imjinrok2.exe");
  copyFileSync(executablePath, badExecutable);
  const executableBytes = readFileSync(badExecutable);
  executableBytes[0x10] ^= 0xff;
  writeFileSync(badExecutable, executableBytes);
  assert.throws(
    () => extractSelectionPanelSlotLifecycle({ executablePath: badExecutable }),
    /SHA-256 mismatch/u,
  );

  const badScript = join(directory, "K0110");
  copyFileSync(scriptPath, badScript);
  const scriptBytes = readFileSync(badScript);
  scriptBytes[0] ^= 0xff;
  writeFileSync(badScript, scriptBytes);
  assert.throws(
    () => extractSelectionPanelSlotLifecycle({ scriptPath: badScript }),
    /SHA-256 mismatch/u,
  );

  const badFunctions = join(directory, "functions.json");
  const functions = JSON.parse(readFileSync(functionsPath, "utf8"));
  functions.functions.find(({ entry }) => entry === "0x004a7690").instructionCount -= 1;
  writeFileSync(badFunctions, JSON.stringify(functions));
  assert.throws(
    () => extractSelectionPanelSlotLifecycle({ functionsPath: badFunctions }),
    /0x004a7690 instructionCount mismatch/u,
  );

  const badReferences = join(directory, "references.json");
  const references = JSON.parse(readFileSync(referencesPath, "utf8"));
  references.references = references.references.filter(
    ({ from, to }) => !(from === "0x0048313c" && to === "0x004a7b10"),
  );
  writeFileSync(badReferences, JSON.stringify(references));
  assert.throws(
    () => extractSelectionPanelSlotLifecycle({ referencesPath: badReferences }),
    /FUN_004a7b10 callers structured reference count mismatch/u,
  );

  const badOutgoingReferences = join(directory, "references-outgoing.json");
  const outgoingReferences = JSON.parse(readFileSync(referencesPath, "utf8"));
  const producerReferenceIndex = outgoingReferences.references.findIndex(
    ({ fromFunctionEntry, type }) =>
      fromFunctionEntry === "0x004a7690" && type === "CONDITIONAL_JUMP",
  );
  assert.notEqual(producerReferenceIndex, -1);
  outgoingReferences.references.splice(producerReferenceIndex, 1);
  writeFileSync(badOutgoingReferences, JSON.stringify(outgoingReferences));
  assert.throws(
    () => extractSelectionPanelSlotLifecycle({ referencesPath: badOutgoingReferences }),
    /FUN_004a7690 outgoing structured reference count mismatch/u,
  );
});

function extract() {
  return extractSelectionPanelSlotLifecycle({
    executablePath,
    scriptPath,
    functionsPath,
    referencesPath,
  });
}

function baseState() {
  assert.deepEqual(reproduceOwnerInitialization(), fixture.initialState);
  return structuredClone(fixture.initialState);
}

function stateFor(vector) {
  const state = baseState();
  const override = vector.initialOverrides;
  if (!override) return state;
  if (override.record) state.slots[override.slot] = structuredClone(override.record);
  if ("field_0xf8" in override) state.field_0xf8 = override.field_0xf8;
  if ("resourcePresent" in override) state.resourcePresent = override.resourcePresent;
  return state;
}

function reproduceProduction(id) {
  const vector = fixture.productionVectors.find((candidate) => candidate.id === id);
  return reproduceSpeechSlotProduction({ ...vector.input, initial: stateFor(vector) });
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
