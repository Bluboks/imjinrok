import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_FUNCTIONS_SHA256,
  EXPECTED_JUMP_TABLES_SHA256,
  EXPECTED_REFERENCES_SHA256,
  computeKind2Payload,
  enumerateChebyshevCells,
  evaluateCandidateLiveGate,
  extractGenericMode1Kind2Enumeration,
  reproduceExclusionHelpers,
  reproduceGenericKind2Enumeration,
} from "./extract-generic-mode1-kind2-enumeration.mjs";
import { reproduceFinalDamage } from "./extract-k01-subtype-16-path.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
};
const fixture = JSON.parse(readFileSync(
  join(root, "analysis/fixtures/generic-mode1-kind2-enumeration-vectors.json"), "utf8"));
const priorFixture = JSON.parse(readFileSync(
  join(root, "analysis/fixtures/k01-subtype-16-path-vectors.json"), "utf8"));

test("reproduces every complete expected-output vector", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceFunctionsSha256, EXPECTED_FUNCTIONS_SHA256);
  assert.equal(fixture.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  assert.equal(fixture.sourceJumpTablesSha256, EXPECTED_JUMP_TABLES_SHA256);
  const groups = [
    ["geometryVectors", fixture.geometryVectors, ({ input }) => enumerateChebyshevCells(input)],
    ["liveGateVectors", fixture.liveGateVectors, ({ input }) => evaluateCandidateLiveGate(input)],
    ["payloadVectors", fixture.payloadVectors, ({ input }) => computeKind2Payload(input)],
    ["exclusionVectors", fixture.exclusionVectors,
      ({ candidates }) => reproduceExclusionHelpers(candidates)],
    ["enumerationVectors", fixture.enumerationVectors,
      ({ input }) => reproduceGenericKind2Enumeration(input)],
  ];
  assert.deepEqual(
    Object.fromEntries(groups.map(([name, vectors]) => [name, vectors.length])),
    {
      geometryVectors: 2,
      liveGateVectors: 4,
      payloadVectors: 4,
      exclusionVectors: 2,
      enumerationVectors: 4,
    },
  );
  for (const [, vectors, reproduce] of groups) for (const vector of vectors) {
    assert.deepEqual(reproduce(vector), vector.expected, vector.id);
    assert.deepEqual(reproduce(vector), reproduce(vector), `${vector.id} determinism`);
  }
  assert.equal(
    hashJson(Object.fromEntries(groups.map(([name, vectors]) => [name, vectors]))),
    fixture.expectedProjectionSha256,
  );
});

test("binds complete static evidence and the shared-branch scope", () => {
  const report = extractGenericMode1Kind2Enumeration(paths);
  assert.equal(report.analysisStatus,
    "static-confirmed-generic-mode1-kind2-callback-boundary");
  assert.equal(report.reproductionStatus,
    "partial-reproduction-complete-enumeration-input-projection");
  assert.equal(report.rawCodeRanges.length, 8);
  assert.equal(report.functionCatalog.length, 9);
  assert.equal(report.genericCalls.length, 5);
  assert.deepEqual(report.relevantDataReferences, [
    { from: "0x00412ff0", to: "0x0052dc38", type: "WRITE", fromFunctionEntry: "0x00412ff0" },
    { from: "0x00413000", to: "0x0052dc38", type: "READ", fromFunctionEntry: "0x00413000" },
    { from: "0x00413017", to: "0x0052dbfc", type: "READ", fromFunctionEntry: "0x00413000" },
    { from: "0x00413040", to: "0x0052dc38", type: "READ", fromFunctionEntry: "0x00413040" },
    { from: "0x00413056", to: "0x0052dbfc", type: "DATA", fromFunctionEntry: "0x00413040" },
    { from: "0x0041305e", to: "0x0052dc38", type: "WRITE", fromFunctionEntry: "0x00413040" },
    { from: "0x0041392b", to: "0x00ac2d90", type: "READ", fromFunctionEntry: "0x00413700" },
    { from: "0x00413946", to: "0x00ac2d94", type: "READ", fromFunctionEntry: "0x00413700" },
    { from: "0x00413986", to: "0x00ac2da4", type: "DATA", fromFunctionEntry: "0x00413700" },
    { from: "0x00413a16", to: "0x00635290", type: "DATA", fromFunctionEntry: "0x00413700" },
    { from: "0x00413a46", to: "0x0063540e", type: "DATA", fromFunctionEntry: "0x00413700" },
    { from: "0x00441e44", to: "0x007d0ed8", type: "DATA", fromFunctionEntry: "0x00441e40" },
    { from: "0x00441e5e", to: "0x00635296", type: "DATA", fromFunctionEntry: "0x00441e40" },
    { from: "0x00441e6b", to: "0x00635448", type: "DATA", fromFunctionEntry: "0x00441e40" },
  ]);
  assert.deepEqual(report.dispatcher.sharedBranchKinds, [2, 3, 4, 13, 14, 18, 24, 25, 26, 27]);
  assert.equal(report.dispatcher.promotedEffectKind, 2);
  assert.equal(report.directCallers.allCallSites.length, 26);
  assert.deepEqual(report.directCallers.staticallyIdentifiedKind2CallSites,
    ["0x0040ebb4", "0x0040ef30"]);
  assert.equal(report.directCallers.k01Mode1ProducerEstablished, false);
  assert.deepEqual(
    report.genericCalls.map(({ from, to }) => ({ from, to })),
    [
      { from: "0x0041389b", to: "0x00412ff0" },
      { from: "0x0041399c", to: "0x00441e40" },
      { from: "0x004139ad", to: "0x00413000" },
      { from: "0x00413a4f", to: "0x00413b30" },
      { from: "0x00413a55", to: "0x00413040" },
    ],
  );
});

test("fixes low-WORD primary matching and current-full-reference callback arguments", () => {
  const mode1 = fixture.enumerationVectors[0].expected;
  assert.equal(mode1.calls[0].payload.primaryLowIndexOverride, true);
  assert.notEqual(
    mode1.calls[0].currentActiveReferenceDword,
    fixture.enumerationVectors[0].input.suppliedTargetReferenceDword,
  );
  assert.equal(
    mode1.calls[0].consumerArguments.targetReferenceDword,
    mode1.calls[0].currentActiveReferenceDword,
  );
  assert.equal(mode1.calls[0].consumerReturnUsed, false);
  assert.equal(mode1.calls[0].postConsumerAppend.appended, true);

  const directMismatch = priorFixture.finalDamageVectors.find(
    ({ id }) => id === "direct-kind-9-full-reference-generation-mismatch-calls-writer-with-zero");
  assert.equal(directMismatch.input.effectKind, 9);
  assert.deepEqual(reproduceFinalDamage(directMismatch.input), directMismatch.expected);
});

test("preserves reached-only, width, normalization, and bounded failure paths", () => {
  const mode2 = fixture.enumerationVectors[1].input;
  assert.doesNotThrow(() => reproduceGenericKind2Enumeration(mode2));
  const allOutOfBounds = fixture.enumerationVectors[2];
  const registryZero = fixture.enumerationVectors[3];
  assert.deepEqual(reproduceGenericKind2Enumeration(allOutOfBounds.input), allOutOfBounds.expected);
  assert.equal(allOutOfBounds.expected.selectionModeWord, null);
  assert.deepEqual(allOutOfBounds.expected.calls, []);
  assert.doesNotThrow(() => reproduceGenericKind2Enumeration(withThrowingGetters(
    allOutOfBounds.input,
    [
      "selectionModeWord",
      "sourceReferenceDword",
      "sourceOwnerWord",
      "payloadWord",
      "suppliedTargetReferenceDword",
      "mapCells",
      "entities",
    ],
  )));
  assert.deepEqual(reproduceGenericKind2Enumeration(registryZero.input), registryZero.expected);
  assert.equal(registryZero.expected.cellResults[0].liveReason, "registry-zero");
  assert.deepEqual(registryZero.expected.calls, []);
  const registryZeroReachedOnly = withThrowingGetters(
    registryZero.input,
    ["sourceReferenceDword", "sourceOwnerWord", "payloadWord", "suppliedTargetReferenceDword"],
  );
  registryZeroReachedOnly.entities = [{
    targetIndex: 7,
    registryWord: 0,
    get currentHealthWord() {
      throw new Error("registry-zero path read currentHealthWord");
    },
    get activeByte() {
      throw new Error("registry-zero path read activeByte");
    },
    get ownerByte() {
      throw new Error("registry-zero path read ownerByte");
    },
    get currentActiveReferenceDword() {
      throw new Error("registry-zero path read currentActiveReferenceDword");
    },
  }];
  assert.doesNotThrow(() => reproduceGenericKind2Enumeration(registryZeroReachedOnly));

  let ownerReads = 0;
  let currentReferenceReads = 0;
  const duplicateLateFields = {
    targetIndex: 20,
    registryWord: 2,
    currentHealthWord: 50,
    activeByte: 1,
    get ownerByte() {
      ownerReads += 1;
      if (ownerReads > 1) throw new Error("duplicate path read ownerByte");
      return 2;
    },
    get currentActiveReferenceDword() {
      currentReferenceReads += 1;
      if (currentReferenceReads > 1)
        throw new Error("duplicate path read currentActiveReferenceDword");
      return 305397780;
    },
  };
  assert.doesNotThrow(() => reproduceGenericKind2Enumeration({
    ...mode2,
    entities: [duplicateLateFields],
  }));
  assert.equal(ownerReads, 1);
  assert.equal(currentReferenceReads, 1);

  assert.throws(() => reproduceGenericKind2Enumeration({
    ...mode2, selectionModeWord: 1, mapCells: [],
  }), /mapCells 0,0 is required/u);
  assert.throws(() => reproduceGenericKind2Enumeration({
    ...mode2, effectKindWord: 3,
  }), /exactly 2/u);
  assert.throws(() => enumerateChebyshevCells({
    radiusWord: 9, centerXWord: 0, centerYWord: 0, mapWidth: 1, mapHeight: 1,
  }), /maximum 8/u);
  assert.throws(() => evaluateCandidateLiveGate({
    targetIndex: 65535, registryWord: 0,
  }), /nonnegative index boundary/u);
  assert.doesNotThrow(() => evaluateCandidateLiveGate({
    targetIndex: 1, registryWord: 0, currentHealthWord: "unreachable",
  }));
});

test("rejects stale executable and generated evidence independently", () => {
  for (const key of Object.keys(paths)) {
    const temporary = mkdtempSync(join(tmpdir(), "generic-mode1-kind2-"));
    const altered = join(temporary, key.endsWith("Path") ? "source.bin" : "source.json");
    copyFileSync(paths[key], altered);
    const bytes = readFileSync(altered);
    bytes[Math.min(32, bytes.length - 1)] ^= 1;
    writeFileSync(altered, bytes);
    assert.throws(
      () => extractGenericMode1Kind2Enumeration({ ...paths, [key]: altered }),
      /SHA-256/u,
      key,
    );
  }
});

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function withThrowingGetters(input, fields) {
  const copy = { ...input };
  for (const field of fields) Object.defineProperty(copy, field, {
    configurable: true,
    get() {
      throw new Error(`unreached input was read: ${field}`);
    },
  });
  return copy;
}
