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
  extractSelectionPanelSlotDispatch,
  reproduceSelectionSlotRectangle,
  reproduceSelectionPanelSlotDispatch,
} from "./extract-selection-panel-slot-dispatch.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const functionsPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/functions.json",
);
const referencesPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/references.json",
);
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/selection-panel-slot-dispatch-vectors.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("binds every slot-dispatch vector to the exact executable and explicit synthetic boundaries", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.match(
    fixture.syntheticMeasurementNotice,
    /injected synthetic GDI outputs/u,
  );
  assert.match(
    fixture.surfaceFailureNotice,
    /downstream indirect blit behavior remains unresolved/u,
  );
});

test("recovers complete dispatcher, helper, caller, resource, and reference boundaries", () => {
  const report = extract();

  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "scoped-reproduction-complete");
  assert.equal(
    report.implementationStatus,
    "analysis-only-no-production-change",
  );
  assert.equal(report.rawCodeRanges.length, 11);
  assert.equal(report.functionCatalog.length, 11);
  assert.equal(report.evidencePoints.length, 20);
  assert.equal(report.referenceSets.length, 8);
  assert.match(report.question, /기존 탐색 후보명/u);
  assert.deepEqual(report.geometry, {
    base: { left: 188, top: 100, right: 466, bottom: 280 },
    slots: [
      { left: 26, top: 49, right: 156, bottom: 169 },
      { left: 490, top: 49, right: 620, bottom: 169 },
      { left: 26, top: 210, right: 156, bottom: 330 },
      { left: 490, top: 210, right: 620, bottom: 330 },
    ],
    field_0x568: { left: 188, top: 290, right: 466, bottom: 376 },
    field_0x564: { left: 188, top: 65, right: 466, bottom: 95 },
  });
  assert.deepEqual(
    report.referenceSets.find(
      ({ label }) => label === "FUN_004a84e0 callers",
    ).references,
    [
      {
        from: "0x00447b19",
        to: "0x004a84e0",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x004475a0",
      },
      {
        from: "0x0047f394",
        to: "0x004a84e0",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x0047f300",
      },
    ],
  );
  assert.equal(
    report.referenceSets.find(
      ({ label }) => label === "FUN_004a84e0 outgoing references",
    ).sha256,
    "abcc36278d6b346b6a8386bd8a26b7d773918ca412f171e39f1f05e3a72e0992",
  );
  assert.match(report.compatibilityConclusion, /no production UI behavior/u);
});

test("reproduces every vector with an unconditional complete-output digest", () => {
  for (const vector of fixture.slotRectangleVectors) {
    assert.deepEqual(
      reproduceSelectionSlotRectangle(vector.input),
      vector.expected,
      vector.id,
    );
  }
  for (const vector of fixture.vectors) {
    const actual = reproduceSelectionPanelSlotDispatch(expandInput(vector));
    assert.equal(
      sha256Json(actual),
      vector.expectedOutputSha256,
      vector.id,
    );
  }
});

test("preserves progress boundary timing and exact ordered draw behavior", () => {
  const ninetyFive = reproduceVector(
    "progress-ninety-five-draws-full-before-next-frame-clear",
  );
  assert.deepEqual(ninetyFive.finalSlots[1], {
    activeState: 1,
    kindState: 1,
    progressWord: 100,
  });
  assert.deepEqual(ninetyFive.operations.at(-1).rect, {
    left: 490,
    top: 49,
    right: 620,
    bottom: 169,
  });

  const oneHundred = reproduceVector(
    "progress-one-hundred-clears-kind-and-still-draws",
  );
  assert.equal(oneHundred.finalSlots[2].kindState, 0);
  assert.deepEqual(
    oneHundred.operations.map(({ role }) => role),
    ["base", "clear-kind-at-progress-boundary", "progress"],
  );

  const fourLabels = reproduceVector(
    "four-non-progress-slots-use-supplied-synthetic-label-metrics",
  );
  assert.deepEqual(
    fourLabels.operations.map(({ role, slot, status }) => ({
      role,
      slot,
      status,
    })),
    [
      { role: "base", slot: undefined, status: undefined },
      { role: "slot-frame", slot: 0, status: undefined },
      { role: undefined, slot: 0, status: "rendered" },
      { role: "slot-frame", slot: 1, status: undefined },
      { role: undefined, slot: 1, status: "rendered" },
      { role: "slot-frame", slot: 2, status: undefined },
      { role: undefined, slot: 2, status: "rendered" },
      { role: "slot-frame", slot: 3, status: undefined },
      { role: undefined, slot: 3, status: "rendered" },
    ],
  );
});

test("follows original no-op and HDC failure control flow without inspecting unreachable fields", () => {
  const invisible = expandInput(findVector("no-owner-state-no-dispatch"));
  const invisibleWithUnreachableInputs =
    reproduceSelectionPanelSlotDispatch({
      ...invisible,
      callerDestination: { not: "reached" },
      destinationSurfaceAvailable: "not-reached",
      baseSourceAvailable: "not-reached",
      slotSourceAvailability: "not-reached",
      screenWidth: "not-reached",
      screenHeight: "not-reached",
      slots: invisible.slots.map((slot, index) => ({
        ...slot,
        kindState: { unreachable: index },
      })),
    });
  assert.equal(invisibleWithUnreachableInputs.dispatcherInvoked, false);
  assert.deepEqual(invisibleWithUnreachableInputs.operations, []);

  const baseOnly = expandInput(findVector("field-0xf8-invokes-base-only"));
  const baseOnlyWithUnreachableKinds = reproduceSelectionPanelSlotDispatch({
    ...baseOnly,
    slots: baseOnly.slots.map((slot, index) => ({
      ...slot,
      kindState: { unreachable: index },
    })),
  });
  assert.deepEqual(
    baseOnlyWithUnreachableKinds.operations.map(({ role }) => role),
    ["base"],
  );

  const hdcFailure = findVector(
    "label-hdc-failure-skips-downstream-fields-and-release",
  );
  assert.deepEqual(
    reproduceSelectionPanelSlotDispatch(expandInput(hdcFailure)),
    reproduceSelectionPanelSlotDispatch({
      ...expandInput(hdcFailure),
      screenWidth: null,
      screenHeight: { not: "reached" },
      slots: expandInput(hdcFailure).slots.map((slot, index) =>
        index === 0
          ? {
              ...slot,
              textRecordIndex: null,
              label: {
                hdcAcquisitionSucceeded: false,
                labelPointerAvailable: null,
                gdiMeasurementSucceeded: null,
                suppliedMeasuredWidth: null,
                suppliedMeasuredHeight: null,
              },
            }
          : slot,
      ),
    }),
  );

  const noOp = reproduceVector(
    "non-one-slot-and-draw-fields-only-trigger-base",
  );
  assert.deepEqual(noOp.operations.map(({ role }) => role), ["base"]);
});

test("rejects invalid reached fields and unresolved deterministic failures loudly", () => {
  assert.throws(
    () => reproduceSelectionSlotRectangle({ slot: 4 }),
    /callerRect must be an object/u,
  );
  assert.throws(
    () => reproduceSelectionSlotRectangle({ slot: 32768 }),
    /slot must be a signed WORD/u,
  );

  const progress = expandInput(findVector("progress-slot-zero-advances-five"));
  assert.throws(
    () =>
      reproduceSelectionPanelSlotDispatch({
        ...progress,
        slots: progress.slots.map((slot, index) =>
          index === 0 ? { ...slot, progressWord: 32768 } : slot,
        ),
      }),
    /progressWord must be a signed WORD/u,
  );
  assert.throws(
    () =>
      reproduceSelectionPanelSlotDispatch({
        ...progress,
        destinationSurfaceAvailable: false,
      }),
    /DAT_00549580 is unavailable/u,
  );

  const label = expandInput(
    findVector(
      "alternate-caller-label-clips-with-signed-word-screen-difference",
    ),
  );
  assert.throws(
    () =>
      reproduceSelectionPanelSlotDispatch({
        ...label,
        slots: label.slots.map((slot, index) =>
          index === 3
            ? {
                ...slot,
                label: { ...slot.label, gdiMeasurementSucceeded: false },
              }
            : slot,
        ),
      }),
    /GetTextExtentPoint32A failure/u,
  );
  assert.throws(
    () =>
      reproduceSelectionPanelSlotDispatch({
        ...label,
        slots: label.slots.map((slot, index) =>
          index === 3
            ? { ...slot, label: { ...slot.label, labelPointerAvailable: false } }
            : slot,
        ),
      }),
    /does not resolve to an available pointer/u,
  );
});

test("uses pre-overflow shadow storage, post-overflow main coordinates, and signed LONG wrap", () => {
  const overflow = reproduceVector(
    "alternate-caller-label-clips-with-signed-word-screen-difference",
  ).operations.at(-1);
  assert.deepEqual(overflow.shadowBounds, {
    left: 486,
    top: 331,
    right: 625,
    bottom: 360,
  });
  assert.deepEqual(overflow.mainBounds, {
    left: -40,
    top: 70,
    right: 100,
    bottom: 100,
  });
  assert.deepEqual(overflow.textDraws, [
    { x: 486, y: 331, color: "0x00010101" },
    { x: -40, y: 70, color: "0x00fafafa" },
  ]);

  const signedLongBoundary = expandInput(
    findVector(
      "alternate-caller-label-clips-with-signed-word-screen-difference",
    ),
  );
  signedLongBoundary.slots[3].label.suppliedMeasuredHeight = 0x7fffffff;
  const wrapped = reproduceSelectionPanelSlotDispatch(
    signedLongBoundary,
  ).operations.at(-1);
  assert.equal(wrapped.shadowBounds.bottom, -2147483319);
  assert.deepEqual(wrapped.mainBounds, {
    left: -40,
    top: 330,
    right: 100,
    bottom: -2147483319,
  });
});

test("accepts only the canonical unsigned representation of raw DWORD fields", () => {
  const input = expandInput(findVector("field-0xf8-invokes-base-only"));
  assert.throws(
    () =>
      reproduceSelectionPanelSlotDispatch({
        ...input,
        field_0xf8: -1,
      }),
    /field_0xf8 must be one canonical unsigned DWORD/u,
  );
  assert.throws(
    () =>
      reproduceSelectionPanelSlotDispatch({
        ...input,
        slots: input.slots.map((slot, index) =>
          index === 0
            ? { ...slot, activeState: 1, kindState: 0x100000000 }
            : slot,
        ),
      }),
    /kindState must be one canonical unsigned DWORD/u,
  );
});

test("is deterministic and rejects altered executable, stale analysis, and changed complete reference sets", () => {
  assert.deepEqual(extract(), extract());

  const directory = mkdtempSync(join(tmpdir(), "imjinrok-slot-dispatch-"));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const staleFunctionsPath = join(directory, "functions.json");
  const staleReferencesPath = join(directory, "references.json");
  const missingCallerPath = join(directory, "missing-caller.json");
  const addedCallerPath = join(directory, "added-caller.json");
  const modifiedOutgoingPath = join(directory, "modified-outgoing.json");
  copyFileSync(executablePath, alteredExecutablePath);
  flipByte(alteredExecutablePath, 0x004a84e0 - 0x00401000 + 0x400);
  writeFileSync(
    staleFunctionsPath,
    JSON.stringify({ sourceSha256: "0".repeat(64), functions: [] }),
  );
  writeFileSync(
    staleReferencesPath,
    JSON.stringify({ sourceSha256: EXPECTED_EXECUTABLE_SHA256, references: [] }),
  );
  const references = JSON.parse(readFileSync(referencesPath, "utf8"));
  writeFileSync(
    missingCallerPath,
    JSON.stringify({
      ...references,
      references: references.references.filter(
        ({ from, to }) => from !== "0x00447b19" || to !== "0x004a84e0",
      ),
    }),
  );
  writeFileSync(
    addedCallerPath,
    JSON.stringify({
      ...references,
      references: [
        ...references.references,
        {
          from: "0x00400000",
          to: "0x004a84e0",
          type: "UNCONDITIONAL_CALL",
          fromFunctionEntry: "0x00400000",
        },
      ],
    }),
  );
  writeFileSync(
    modifiedOutgoingPath,
    JSON.stringify({
      ...references,
      references: references.references.map((reference) =>
        reference.from === "0x004a8529"
          ? { ...reference, type: "UNCONDITIONAL_JUMP" }
          : reference,
      ),
    }),
  );

  assert.throws(
    () => extract({ executablePath: alteredExecutablePath }),
    /imjinrok2\.exe SHA-256 mismatch/u,
  );
  assert.throws(
    () => extract({ functionsPath: staleFunctionsPath }),
    /sourceSha256 mismatch/u,
  );
  assert.throws(
    () => extract({ referencesPath: staleReferencesPath }),
    /structured reference count mismatch/u,
  );
  assert.throws(
    () => extract({ referencesPath: missingCallerPath }),
    /FUN_004a84e0 callers structured reference count mismatch: expected 2, got 1/u,
  );
  assert.throws(
    () => extract({ referencesPath: addedCallerPath }),
    /FUN_004a84e0 callers structured reference count mismatch: expected 2, got 3/u,
  );
  assert.throws(
    () => extract({ referencesPath: modifiedOutgoingPath }),
    /FUN_004a84e0 outgoing references structured reference digest mismatch/u,
  );
});

function extract(overrides = {}) {
  return extractSelectionPanelSlotDispatch({
    executablePath,
    functionsPath,
    referencesPath,
    ...overrides,
  });
}

function findVector(id) {
  const vector = fixture.vectors.find((candidate) => candidate.id === id);
  assert.ok(vector, `missing fixture vector ${id}`);
  return vector;
}

function reproduceVector(id) {
  return reproduceSelectionPanelSlotDispatch(expandInput(findVector(id)));
}

function expandInput(vector) {
  const input = structuredClone(fixture.commonInput);
  const { slotOverrides = {}, ...overrides } = vector.inputOverrides;
  Object.assign(input, structuredClone(overrides));
  for (const [index, slot] of Object.entries(slotOverrides)) {
    input.slots[Number(index)] = structuredClone(slot);
  }
  return input;
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function flipByte(path, offset) {
  const buffer = readFileSync(path);
  buffer[offset] ^= 0xff;
  writeFileSync(path, buffer);
}
