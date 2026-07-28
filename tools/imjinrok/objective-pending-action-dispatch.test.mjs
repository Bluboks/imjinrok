import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_DISPATCHER_CALL_REFERENCE_SHA256,
  EXPECTED_OBJECTIVE_SPRITE_SHA256,
  EXPECTED_PENDING_REFERENCE_SHA256,
  extractObjectivePendingActionDispatch,
  reproduceObjectivePendingDispatcher,
  reproduceObjectivePendingProduction,
} from "./extract-objective-pending-action-dispatch.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const objectiveSpritePath = join(
  repositoryRoot,
  "original/imjinrok2/yfnt/objectiveborder.spr",
);
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/objective-pending-action-dispatch-vectors.json",
);
const vectors = JSON.parse(readFileSync(fixturePath, "utf8"));

test("binds dispatcher vectors to the exact executable and structured references", () => {
  assert.equal(vectors.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(vectors.sourceObjectiveSpriteSha256, EXPECTED_OBJECTIVE_SPRITE_SHA256);
  assert.equal(
    vectors.structuredPendingReferenceSha256,
    EXPECTED_PENDING_REFERENCE_SHA256,
  );
  assert.equal(
    vectors.structuredDispatcherCallReferenceSha256,
    EXPECTED_DISPATCHER_CALL_REFERENCE_SHA256,
  );
});

test("recovers the complete scoped producer, dispatcher, and failure evidence", () => {
  const report = extract();

  assert.equal(report.analysisStatus, "static-confirmed");
  assert.match(report.reproductionStatus, /^reproduction-complete/u);
  assert.match(report.implementationStatus, /^UI-domain contract/u);
  assert.equal(report.functions.length, 11);
  assert.equal(report.rawCodeRanges.length, 5);
  assert.equal(report.evidencePoints.length, 23);
  assert.equal(report.staticEvidencePointCount, 23);
  assert.equal(report.pendingStorage.directReferenceCount, 14);
  assert.equal(
    report.pendingStorage.structuredReferenceSha256,
    EXPECTED_PENDING_REFERENCE_SHA256,
  );
  assert.equal(report.dispatcher.structuredDirectCallCount, 2);
  assert.equal(
    report.dispatcher.structuredDirectCallSha256,
    EXPECTED_DISPATCHER_CALL_REFERENCE_SHA256,
  );
  assert.deepEqual(report.sources.references.validatedSets.dispatcherCallers, {
    count: 2,
    sha256: EXPECTED_DISPATCHER_CALL_REFERENCE_SHA256,
  });
  assert.deepEqual(report.dispatcher.structuredDirectCalls, [
    {
      from: "0x0045efd1",
      type: "UNCONDITIONAL_CALL",
      fromFunctionEntry: "0x0045efd0",
    },
    {
      from: "0x004602e9",
      type: "UNCONDITIONAL_CALL",
      fromFunctionEntry: "0x0045f9c0",
    },
  ]);
  assert.deepEqual(report.semanticContract.confirmedAction, {
    type: "open-objective-modal",
    metadata: { profile: "original-parity" },
  });
  assert.deepEqual(report.producer.orderedSelections, [
    { control: "0x005527b0", value: "0x3f0" },
    { control: "0x005528f8", value: "0x3ee" },
    { control: "0x00552ae0", value: "0x3ec" },
    { control: "0x00552850", value: "0x3ea" },
  ]);
  assert.deepEqual(report.dispatcher.exactCallers, [
    "0x0045efd1 from complete wrapper FUN_0045efd0",
    "0x004602e9 from application state 0x17 in FUN_0045f9c0",
  ]);
});

test("reproduces every ordered producer vector with complete expected results", () => {
  for (const vector of vectors.producerVectors) {
    assert.deepEqual(
      reproduceObjectivePendingProduction(vector.input),
      vector.expected,
      vector.id,
    );
  }
});

test("reproduces every dispatcher lifecycle, boundary, and failure vector", () => {
  for (const vector of vectors.dispatcherVectors) {
    assert.deepEqual(
      reproduceObjectivePendingDispatcher(vector.input),
      vector.expected,
      vector.id,
    );
  }
});

test("rejects incomplete or out-of-range original-field inputs", () => {
  assert.throws(
    () =>
      reproduceObjectivePendingProduction({
        ...vectors.producerVectors[0].input,
        surfaceLockSucceeded: 1,
      }),
    /surfaceLockSucceeded must be boolean/,
  );
  assert.throws(
    () =>
      reproduceObjectivePendingDispatcher({
        ownerEnabled: true,
        pendingState: 0x3f0,
      }),
    /objectiveResourceLoadSucceeded must be boolean/,
  );
  assert.throws(
    () =>
      reproduceObjectivePendingDispatcher({
        ownerEnabled: true,
        pendingState: 0x3f1,
      }),
    /objectiveUpdate is required/,
  );
  assert.throws(
    () =>
      reproduceObjectivePendingDispatcher({
        ownerEnabled: true,
        pendingState: 32768,
      }),
    /pendingState must be a signed WORD/,
  );
});

test("is deterministic and refuses altered executable or analysis inputs", () => {
  assert.deepEqual(extract(), extract());

  const directory = mkdtempSync(join(tmpdir(), "imjinrok-objective-dispatch-"));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const alteredObjectiveSpritePath = join(directory, "objectiveborder.spr");
  const staleSeedsPath = join(directory, "seeds.json");
  const staleReferencesPath = join(directory, "references.json");
  const missingDispatcherCallPath = join(directory, "missing-dispatcher-call.json");
  const addedDispatcherCallPath = join(directory, "added-dispatcher-call.json");
  const modifiedDispatcherCallPath = join(directory, "modified-dispatcher-call.json");
  copyFileSync(executablePath, alteredExecutablePath);
  copyFileSync(objectiveSpritePath, alteredObjectiveSpritePath);
  flipByte(alteredExecutablePath, 0x481bc);
  flipByte(alteredObjectiveSpritePath, 0x10);
  writeFileSync(staleSeedsPath, JSON.stringify({ sourceSha256: "0".repeat(64), functions: [] }));
  writeFileSync(
    staleReferencesPath,
    JSON.stringify({ sourceSha256: EXPECTED_EXECUTABLE_SHA256, references: [] }),
  );
  const originalReferences = JSON.parse(readFileSync(referencesPath, "utf8"));
  writeFileSync(
    missingDispatcherCallPath,
    JSON.stringify({
      ...originalReferences,
      references: originalReferences.references.filter(
        (reference) =>
          reference.to !== "0x00449090" || reference.from !== "0x0045efd1",
      ),
    }),
  );
  writeFileSync(
    addedDispatcherCallPath,
    JSON.stringify({
      ...originalReferences,
      references: [
        ...originalReferences.references,
        {
          from: "0x00400000",
          to: "0x00449090",
          type: "UNCONDITIONAL_CALL",
          fromFunctionEntry: null,
        },
      ],
    }),
  );
  writeFileSync(
    modifiedDispatcherCallPath,
    JSON.stringify({
      ...originalReferences,
      references: originalReferences.references.map((reference) =>
        reference.to === "0x00449090" && reference.from === "0x0045efd1"
          ? { ...reference, type: "CONDITIONAL_CALL" }
          : reference,
      ),
    }),
  );

  assert.throws(
    () => extract({ executablePath: alteredExecutablePath }),
    /imjinrok2\.exe SHA-256 mismatch/,
  );
  assert.throws(
    () => extract({ objectiveSpritePath: alteredObjectiveSpritePath }),
    /objectiveborder\.spr SHA-256 mismatch/,
  );
  assert.throws(
    () => extract({ seedsPath: staleSeedsPath }),
    /source SHA-256 mismatch/,
  );
  assert.throws(
    () => extract({ referencesPath: staleReferencesPath }),
    /direct reference count mismatch/,
  );
  assert.throws(
    () => extract({ referencesPath: missingDispatcherCallPath }),
    /FUN_00449090 structured direct-call count mismatch: expected 2, got 1/,
  );
  assert.throws(
    () => extract({ referencesPath: addedDispatcherCallPath }),
    /FUN_00449090 structured direct-call count mismatch: expected 2, got 3/,
  );
  assert.throws(
    () => extract({ referencesPath: modifiedDispatcherCallPath }),
    /FUN_00449090 structured direct-call digest mismatch/,
  );
});

function extract(overrides = {}) {
  return extractObjectivePendingActionDispatch({
    executablePath,
    objectiveSpritePath,
    seedsPath,
    referencesPath,
    ...overrides,
  });
}

function flipByte(path, offset) {
  const buffer = readFileSync(path);
  buffer[offset] ^= 0xff;
  writeFileSync(path, buffer);
}
