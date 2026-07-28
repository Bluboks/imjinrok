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
  EXPECTED_FUNCTIONS_SHA256,
  EXPECTED_REFERENCES_SHA256,
  extractPersistentSelectionActionBoundary,
  reproducePersistentSelectionAction,
  reproduceProductionActionDispatch,
} from "./extract-persistent-selection-action-boundary.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/persistent-selection-action-boundary-vectors.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("binds the bounded reproduction vectors to the exact executable and semantic boundary", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceFunctionsSha256, EXPECTED_FUNCTIONS_SHA256);
  assert.equal(fixture.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  assert.match(fixture.scopeNotice, /zero-or-internal-class-1\.\.95/u);
  assert.match(fixture.scopeNotice, /action 115/u);
  assert.match(fixture.scopeNotice, /조선 권율/u);
  for (const vector of fixture.vectors) {
    const actual = reproducePersistentSelectionAction(vector.input);
    assert.deepEqual(actual, vector.expected, vector.id);
    assert.equal(sha256Json(actual), vector.expectedOutputSha256, vector.id);
  }
  for (const vector of fixture.productionActionDispatchVectors) {
    const actual = reproduceProductionActionDispatch(vector.input);
    assert.deepEqual(actual, vector.expected, vector.id);
    assert.equal(sha256Json(actual), vector.expectedOutputSha256, vector.id);
  }
  assert.equal(fixture.productionStateUpdateVectors, undefined);
  assert.match(fixture.scopeNotice, /FUN_0042de00.*static-only/u);
});

test("verifies whole functions, exact anchors, and complete canonical caller projections", () => {
  const report = extract();
  assert.equal(
    report.analysisStatus,
    "static-confirmed-for-scoped-production-action-and-slot-boundary",
  );
  assert.equal(report.reproductionStatus, "partial-reproduction-production-state-static-only");
  assert.equal(report.implementationStatus, "analysis-only-no-production-ui-change");
  assert.match(
    report.completenessBoundary,
    /queue pump, selected-action queue-count marker.*static-only/u,
  );
  assert.match(
    report.completenessBoundary,
    /reproduction-complete only for the bounded synthetic selection\/no-selection owner and input transport plus modeled FUN_00426c20 action dispatch paths/u,
  );
  assert.equal(report.sourceFunctionsSha256, EXPECTED_FUNCTIONS_SHA256);
  assert.equal(report.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  assert.equal(report.rawCodeRanges.length, 34);
  assert.equal(report.functionCatalog.length, 34);
  assert.equal(report.evidencePoints.length, 41);
  assert.deepEqual(
    report.referenceSets.map(({ label, count, digest }) => ({ label, count, digest })),
    [
      {
        label: "FUN_00459430 callers",
        count: 1,
        digest: "d24c4c84dfa0f7be5e8d0b8a38609122ccc5b44ab1e67e33086bf489b0842058",
      },
      {
        label: "FUN_0045b420 callers",
        count: 1,
        digest: "b2e3cfa60d4d551344c8b754968039478e0320bb62f8184c66c9ddc9a146b497",
      },
      {
        label: "FUN_0045b8b0 callers",
        count: 1,
        digest: "c2a9684f993fb285ff29be15b30a867b3da1ade9f13d7bac8e934c2821ef893d",
      },
      {
        label: "FUN_00461390 callers",
        count: 3,
        digest: "20c637b4dd92d7e2411828dd7eeb10e439715eb4e9bc325a16b8a8735a241752",
      },
      {
        label: "FUN_00477cc0 callers",
        count: 15,
        digest: "478860c8462d22e4f7b68f14c5247dadc21ae7ab987dd8e33f05a611869c5146",
      },
      {
        label: "FUN_00478250 callers",
        count: 2,
        digest: "da33c8d26873f69a654b83bca62c3821a46cee2918975c5f7698f6bc0962cdb6",
      },
      {
        label: "FUN_00421b20 callers",
        count: 1,
        digest: "a220c209844c46fb1361aed201f58724508c19917ec8090667c687b6281e58fd",
      },
      {
        label: "FUN_00426930 callers",
        count: 2,
        digest: "5297a63228ad546449dc9f3f7561b21677ad7cdfc26cbe8c8656e09eac1234d7",
      },
      {
        label: "FUN_0042de00 callers",
        count: 1,
        digest: "02b86dcb71b5e547fd237bac313cfc5d6823fa0c340be866dca37b0b29ecfef6",
      },
      {
        label: "FUN_00428530 callers",
        count: 1,
        digest: "98c395ace336d81b5579a8c4d50ff3fae53630f3975e7a9984df72b99ac49835",
      },
      {
        label: "FUN_00428580 callers",
        count: 1,
        digest: "13ea87efa571b11679528e08cb1054fb4d7ad39e7b872a93666215ca1d51690b",
      },
      {
        label: "FUN_0047fef0 callers",
        count: 3,
        digest: "d19803dabe0ab63d61efd31efed82c577e95767d5c3fb513a4c4863465b28470",
      },
      {
        label: "FUN_0047ff80 callers",
        count: 2,
        digest: "cdb75d465ffc1a31202fa20416867a963fd4b9fca2d4d43bc0b43bf8ea2f4680",
      },
      {
        label: "FUN_00480010 callers",
        count: 2,
        digest: "e0d0adec12f3178ca761570d44c2c02d18b532ad697baf4c8ddb424a1a2ab677",
      },
      {
        label: "FUN_004475a0 outgoing",
        count: 233,
        digest: "81f7e6c7c7aba4adaa5ee2e3b18ac6e26672481a6bd8aeb6a68ef4918af07dc9",
      },
      {
        label: "FUN_00459490 outgoing",
        count: 848,
        digest: "eb8e49be85f069a15dfaef4be5c2e7f08caa605bf40ce61dac5d9736f8aeb05f",
      },
      {
        label: "FUN_00426c20 outgoing",
        count: 379,
        digest: "b5be97466e55145f1eb9b1976354f7f475a01a77ac68dd57afa69e849eddbd6c",
      },
      {
        label: "FUN_0042de00 outgoing",
        count: 59,
        digest: "5c9bba3fbe3674f0b0f6d9dc87448efe38e692b830af0490fb1911576bb373e6",
      },
      {
        label: "FUN_0043c300 outgoing",
        count: 106,
        digest: "800e8c54d21c64052537708e7288d5d37d7f6c6728b02d5e7115611306e06e6a",
      },
      {
        label: "FUN_00476820 outgoing",
        count: 458,
        digest: "3d15ed4165d753bc70e95743620e6aa41f98f72bc33710196171c0f291f6316c",
      },
    ],
  );
  assert.deepEqual(
    report.referenceSets.find(({ label }) => label === "FUN_0045b420 callers").references,
    [{
      from: "0x004594ba",
      to: "0x0045b420",
      type: "UNCONDITIONAL_CALL",
      fromFunctionEntry: "0x00459490",
    }],
  );
  assert.deepEqual(
    report.referenceSets.find(({ label }) => label === "FUN_00461390 callers").references,
    [
      {
        from: "0x0045946c",
        to: "0x00461390",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x00459430",
      },
      {
        from: "0x0045b861",
        to: "0x00461390",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x0045b420",
      },
      {
        from: "0x0045b8a0",
        to: "0x00461390",
        type: "UNCONDITIONAL_CALL",
        fromFunctionEntry: "0x0045b420",
      },
    ],
  );
  assert.match(report.semanticConclusion, /no direct write or read link/u);
  assert.match(report.semanticConclusion, /action 115/u);
  assert.match(report.semanticConclusion, /조선 권율/u);
  assert.match(report.semanticConclusion, /payload zero/u);
  assert.match(report.semanticConclusion, /right-release payload one/u);
  assert.match(report.semanticConclusion, /without caller refund/u);
  assert.match(report.semanticConclusion, /not the remembered persistent right-click reservation feature/u);
  assert.match(report.semanticConclusion, /contained-object container/u);
  assert.equal(report.productionAction.perActionQueueLimit, 1);
  assert.equal(report.productionAction.producedInternalClass, 76);
  assert.equal(report.productionAction.actionBookkeepingIndexDword, 0);
  assert.equal(report.productionAction.producedTypeField0x20Dword, 0x8);
  assert.equal(report.productionAction.producedTypeField0x20Bit0x8, true);
  assert.deepEqual(report.productionAction.producedTypeRawFields, {
    field0x0eWord: 0,
    field0x10Word: 400,
    field0x12Word: 0,
  });
  assert.match(report.selectionValueDomains.selectionCount, /0\.\.20/u);
  assert.match(report.selectionValueDomains.sevenSlotStorage, /1\.\.95/u);
  assert.match(report.unresolvedBoundary, /right-click production reservation\/pinning feature is not bound/u);
  assert.match(report.unresolvedBoundary, /no-match rollback edge/u);
  assert.match(
    report.unresolvedBoundary,
    /independent slices bind the remembered global magic-auto-use and hero-priority toggles/u,
  );
  assert.deepEqual(extract(), report);
});

test("keeps the right-release DWORD distinct from action byte 2 and delivery mode byte 3", () => {
  const immediate = reproduce("right-release-zero-target-mode-packs-immediate-payload");
  const queued = reproduce("right-release-zero-target-mode-packs-queued-payload");
  const left = reproduce("left-release-packs-zero-right-release-payload");
  assert.deepEqual(immediate.command, {
    actionWord: 321,
    actionRecordByte2: 0,
    immediateModeByte3: 1,
    rightReleasePayload: 1,
    delivery: "immediate-entity-action",
  });
  assert.deepEqual(queued.command, {
    actionWord: 654,
    actionRecordByte2: 0,
    immediateModeByte3: 0,
    rightReleasePayload: 1,
    delivery: "queued-entity-action",
  });
  assert.equal(left.command.rightReleasePayload, 0);
  assert.equal(reproduce("right-release-nonzero-target-mode-is-ignored").command, null);
});

test("preserves branch reachability and rejects reached invalid widths loudly", () => {
  assert.doesNotThrow(() =>
    reproducePersistentSelectionAction({
      selectionCount: 0,
      drawSurfaceLockSucceeded: false,
      predefinedSlots: [0, 0, 0, 0, 0, 0, 0],
      actionAvailable: "unreachable",
      pointerRelease: "unreachable",
      pointerButton: "unreachable",
      actionWord: "unreachable",
      targetModeWord: "unreachable",
      immediateMode: "unreachable",
    }));
  assert.doesNotThrow(() =>
    reproducePersistentSelectionAction({
      selectionCount: 1,
      drawSurfaceLockSucceeded: true,
      predefinedSlots: "unreachable",
      actionAvailable: false,
      pointerRelease: "unreachable",
      pointerButton: "unreachable",
      actionWord: "unreachable",
      targetModeWord: "unreachable",
      immediateMode: "unreachable",
    }));
  assert.doesNotThrow(() =>
    reproducePersistentSelectionAction({
      selectionCount: 1,
      drawSurfaceLockSucceeded: true,
      actionAvailable: true,
      pointerRelease: false,
      pointerButton: "unreachable",
      actionWord: 1,
      targetModeWord: "unreachable",
      immediateMode: "unreachable",
    }));
  assert.throws(
    () => reproducePersistentSelectionAction({
      ...fixture.vectors.find(
        ({ id }) => id === "right-release-zero-target-mode-packs-immediate-payload",
      ).input,
      targetModeWord: 0x10000,
    }),
    /targetModeWord must be an integer/u,
  );
  assert.throws(
    () => reproducePersistentSelectionAction({
      selectionCount: 0,
      drawSurfaceLockSucceeded: true,
      predefinedSlots: [0, 0, 0, 0, 0, 0, 96],
    }),
    /predefinedSlots\[6\] must be an integer/u,
  );
  assert.throws(
    () => reproducePersistentSelectionAction({
      selectionCount: 0,
      drawSurfaceLockSucceeded: true,
      predefinedSlots: [0, 0, 0, 0, 0, 0, 0, 0],
    }),
    /exactly 7/u,
  );
  assert.throws(
    () => reproducePersistentSelectionAction({
      selectionCount: 21,
      drawSurfaceLockSucceeded: true,
    }),
    /selectionCount must be an integer in 0\.\.20/u,
  );
});

test("reproduces payload-zero admission and payload-one removal or no-match rollback", () => {
  const directStart = reproduceProductionActionDispatch(
    productionActionDispatchVector(
      "action-115-payload-zero-state-word-one-starts-produced-type-76",
    ).input,
  );
  assert.deepEqual(
    directStart.operations.map(({ type }) => type),
    [
      "dispatch-production-action",
      "reserve-resources-and-capacity",
      "assign-produced-type-field-0x0e-to-entity-field-0x3f0",
      "write-produced-type-player-word-0x82c55c",
      "write-produced-type-player-word-0x82c624-from-entity-field-0x1b6",
      "clear-current-action-state",
      "start-production-state",
    ],
  );
  const queuedAdmission = reproduceProductionActionDispatch(
    productionActionDispatchVector(
      "action-115-payload-zero-non-one-state-appends-one-queued-action",
    ).input,
  );
  assert.deepEqual(queuedAdmission.finalQueueActionIds, [7, 8, 115]);
  assert.deepEqual(
    queuedAdmission.operations.map(({ type }) => type),
    [
      "dispatch-production-action",
      "reserve-resources-and-capacity",
      "add-produced-type-field-0x0e-to-entity-field-0x3f0",
      "write-produced-type-player-word-0x82c55c",
      "write-produced-type-player-word-0x82c624-from-entity-field-0x1b6",
      "append-production-action-to-queue",
    ],
  );
  const bypass = reproduceProductionActionDispatch(
    productionActionDispatchVector(
      "action-115-payload-zero-non-one-field-0x266-bypasses-checks-and-appends",
    ).input,
  );
  assert.deepEqual(
    bypass.operations.map(({ type }) => type),
    [
      "dispatch-production-action",
      "bypass-prerequisite-and-reservation-for-entity-field-0x266-non-one",
      "write-produced-type-player-word-0x82c55c",
      "write-produced-type-player-word-0x82c624-from-entity-field-0x1b6",
      "append-production-action-to-queue",
    ],
  );
  assert.equal(
    bypass.operations.some(({ type }) =>
      type === "add-produced-type-field-0x0e-to-entity-field-0x3f0" ||
      type === "assign-produced-type-field-0x0e-to-entity-field-0x3f0" ||
      type === "decrement-action-indexed-player-word"),
    false,
  );
  const directBypass = reproduceProductionActionDispatch(
    productionActionDispatchVector(
      "action-115-payload-zero-state-one-non-one-field-0x266-bypasses-to-common-writes-and-starts",
    ).input,
  );
  assert.deepEqual(
    directBypass.operations.map(({ type }) => type),
    [
      "dispatch-production-action",
      "bypass-prerequisite-and-reservation-for-entity-field-0x266-non-one",
      "write-produced-type-player-word-0x82c55c",
      "write-produced-type-player-word-0x82c624-from-entity-field-0x1b6",
      "clear-current-action-state",
      "start-production-state",
    ],
  );
  const matchingRemoval = reproduceProductionActionDispatch(
    productionActionDispatchVector(
      "action-115-right-release-payload-one-removes-match-without-caller-refund",
    ).input,
  );
  assert.deepEqual(matchingRemoval.finalQueueActionIds, [4, 9, 115]);
  assert.deepEqual(
    matchingRemoval.operations.map(({ type }) => type),
    [
      "dispatch-production-action",
      "remove-first-matching-queued-action-without-caller-refund",
    ],
  );
  const noMatch = reproduceProductionActionDispatch(
    productionActionDispatchVector(
      "action-115-right-release-payload-one-no-match-refunds-and-writes-bookkeeping",
    ).input,
  );
  assert.deepEqual(
    noMatch.operations.map(({ type }) => type),
    [
      "dispatch-production-action",
      "matching-queued-action-not-found",
      "refund-produced-type-resources-and-capacity",
      "subtract-produced-type-field-0x0e-from-entity-field-0x3f0",
      "write-produced-type-player-word-0x82c55c",
      "write-produced-type-player-word-0x82c624",
    ],
  );
  assert.throws(
    () => reproduceProductionActionDispatch({
      actionId: 115,
      rightReleasePayload: 0,
      currentStateWord: "invalid-reached-state",
      queueActionIds: "unreachable",
    }),
    /currentStateWord must be an integer/u,
  );
  assert.doesNotThrow(() =>
    reproduceProductionActionDispatch(
      productionActionDispatchVector(
        "action-115-payload-zero-duplicate-is-rejected-before-later-inputs",
      ).input,
    ));
  assert.doesNotThrow(() =>
    reproduceProductionActionDispatch(
      productionActionDispatchVector("twenty-entry-production-action-queue-is-full").input,
    ));
  assert.throws(
    () => reproduceProductionActionDispatch({
      ...productionActionDispatchVector(
        "action-115-payload-zero-non-one-state-appends-one-queued-action",
      ).input,
      reservationOutcome: "invalid",
    }),
    /reservationOutcome must be one of/u,
  );
  assert.throws(
    () => reproduceProductionActionDispatch({
      ...productionActionDispatchVector(
        "action-115-payload-zero-state-word-one-starts-produced-type-76",
      ).input,
      entityField0x1b6Word: "invalid-reached-word",
    }),
    /entityField0x1b6Word must be an integer/u,
  );
  assert.throws(
    () => reproduceProductionActionDispatch({
      ...productionActionDispatchVector(
        "action-115-payload-zero-state-word-one-starts-produced-type-76",
      ).input,
      entityField0x266Word: 0x10000,
      reservationOutcome: "unreachable",
      entityField0x1b6Word: "unreachable",
    }),
    /entityField0x266Word must be an integer/u,
  );
  assert.throws(
    () => reproduceProductionActionDispatch({
      ...productionActionDispatchVector(
        "action-107-missing-prerequisite-is-rejected-before-reservation",
      ).input,
      prerequisiteAvailable: "invalid",
    }),
    /prerequisiteAvailable must be a boolean/u,
  );
  assert.throws(
    () => reproduceProductionActionDispatch({
      actionId: 107,
      rightReleasePayload: 1,
      queueActionIds: [],
    }),
    /rollback reproduction is scoped to statically bounded action 115/u,
  );
  assert.throws(
    () => reproduceProductionActionDispatch({
      ...productionActionDispatchVector(
        "action-107-missing-prerequisite-is-rejected-before-reservation",
      ).input,
      prerequisiteAvailable: true,
      reservationOutcome: "unreachable",
    }),
    /action 107 reproduction is scoped to prerequisite and capacity early exits/u,
  );
});

test("rejects stale executable, function metadata, and each canonical caller set", () => {
  const directory = mkdtempSync(join(tmpdir(), "persistent-selection-action-"));
  const badExecutable = join(directory, "imjinrok2.exe");
  copyFileSync(executablePath, badExecutable);
  const bytes = readFileSync(badExecutable);
  bytes[0x20] ^= 0xff;
  writeFileSync(badExecutable, bytes);
  assert.throws(
    () => extractPersistentSelectionActionBoundary({ executablePath: badExecutable }),
    /SHA-256 mismatch/u,
  );

  const badFunctions = join(directory, "functions.json");
  const functions = JSON.parse(readFileSync(functionsPath, "utf8"));
  functions.functions.find(({ entry }) => entry === "0x00459490").instructionCount -= 1;
  writeFileSync(badFunctions, JSON.stringify(functions));
  assert.throws(
    () => extractPersistentSelectionActionBoundary({ functionsPath: badFunctions }),
    /0x00459490 instruction count mismatch/u,
  );

  for (const [index, target] of [
    "0x00459430",
    "0x0045b420",
    "0x0045b8b0",
    "0x00461390",
    "0x00477cc0",
    "0x00478250",
    "0x00421b20",
    "0x00426930",
    "0x0042de00",
    "0x00428530",
    "0x00428580",
    "0x0047fef0",
    "0x0047ff80",
    "0x00480010",
  ].entries()) {
    const badReferences = join(directory, `references-${index}.json`);
    const references = JSON.parse(readFileSync(referencesPath, "utf8"));
    const removed = references.references.findIndex(
      ({ to, type }) => to === target && type === "UNCONDITIONAL_CALL",
    );
    assert.notEqual(removed, -1);
    references.references.splice(removed, 1);
    writeFileSync(badReferences, JSON.stringify(references));
    assert.throws(
      () => extractPersistentSelectionActionBoundary({ referencesPath: badReferences }),
      /callers (?:count|projection SHA-256) mismatch/u,
      target,
    );
  }

  for (const [index, entry] of [
    "0x004475a0",
    "0x0042de00",
    "0x0043c300",
    "0x00476820",
  ].entries()) {
    const badOutgoing = join(directory, `references-outgoing-${index}.json`);
    const outgoingReferences = JSON.parse(readFileSync(referencesPath, "utf8"));
    const outgoingIndex = outgoingReferences.references.findIndex(
      ({ fromFunctionEntry }) => fromFunctionEntry === entry,
    );
    assert.notEqual(outgoingIndex, -1);
    outgoingReferences.references.splice(outgoingIndex, 1);
    writeFileSync(badOutgoing, JSON.stringify(outgoingReferences));
    assert.throws(
      () => extractPersistentSelectionActionBoundary({ referencesPath: badOutgoing }),
      new RegExp(`${entry.replace("0x00", "FUN_00")} outgoing (?:count|projection SHA-256) mismatch`, "u"),
    );
  }
});

function extract() {
  return extractPersistentSelectionActionBoundary({
    executablePath,
    functionsPath,
    referencesPath,
  });
}

function reproduce(id) {
  const vector = fixture.vectors.find((candidate) => candidate.id === id);
  assert.ok(vector, `missing fixture vector ${id}`);
  return reproducePersistentSelectionAction(vector.input);
}

function productionActionDispatchVector(id) {
  const vector = fixture.productionActionDispatchVectors.find((candidate) => candidate.id === id);
  assert.ok(vector, `missing production action dispatch fixture vector ${id}`);
  return vector;
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
