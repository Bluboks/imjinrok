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
  constructAction59Payload,
  extractK01Subtype16Path,
  reproduceAction59PayloadAttempts,
  reproduceFlightUpdate,
  reproduceCreation,
  reproduceFinalDamage,
  reproduceSubtypeEndpoint,
  resetFixedRegistry,
} from "./extract-k01-subtype-16-path.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
};
const fixture = JSON.parse(readFileSync(
  join(root, "analysis/fixtures/k01-subtype-16-path-vectors.json"), "utf8"));

test("reproduces every promoted bounded projection with complete expected output", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceFunctionsSha256, EXPECTED_FUNCTIONS_SHA256);
  assert.equal(fixture.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  assert.equal(fixture.sourceJumpTablesSha256, EXPECTED_JUMP_TABLES_SHA256);
  const groups = [
    ["payloadVectors", fixture.payloadVectors, ({ input }) => constructAction59Payload(input)],
    ["payloadAttemptVectors", fixture.payloadAttemptVectors,
      ({ input }) => reproduceAction59PayloadAttempts(input)],
    ["creationVectors", fixture.creationVectors, (vector) =>
      reproduceCreation({ ...vector.input, registry: makeRegistry(vector.registry) })],
    ["resetVectors", fixture.resetVectors, (vector) => resetFixedRegistry(makeRegistry(vector.registry))],
    ["flightVectors", fixture.flightVectors, ({ input }) => reproduceFlightUpdate(input)],
    ["endpointVectors", fixture.endpointVectors, ({ input }) => reproduceSubtypeEndpoint(input)],
    ["finalDamageVectors", fixture.finalDamageVectors, ({ input }) => reproduceFinalDamage(input)],
  ];
  assert.deepEqual(
    Object.fromEntries(groups.map(([name, vectors]) => [name, vectors.length])),
    {
      payloadVectors: 5,
      payloadAttemptVectors: 3,
      creationVectors: 3,
      resetVectors: 2,
      flightVectors: 5,
      endpointVectors: 7,
      finalDamageVectors: 13,
    },
  );
  for (const [, vectors, reproduce] of groups) for (const vector of vectors) {
    assert.deepEqual(reproduce(vector), vector.expected, vector.id);
    assert.deepEqual(reproduce(vector), reproduce(vector), `${vector.id} determinism`);
  }
  const projection = Object.fromEntries(groups.map(([name, vectors]) => [name, vectors]));
  assert.equal(hashJson(projection), fixture.expectedProjectionSha256);
});

test("binds complete functions, raw ranges, references, and both shared dispatchers", () => {
  const report = extractK01Subtype16Path(paths);
  assert.equal(report.analysisStatus, "static-confirmed-k01-subtype-16-bounded-chain");
  assert.equal(report.reproductionStatus, "partial-reproduction-bounded-projections");
  assert.equal(report.rawCodeRanges.length, 17);
  assert.equal(report.functionCatalog.length, 26);
  assert.equal(report.recordReferences.length, 12);
  assert.ok(report.rawCodeRanges.some(({ id }) => id === "action-59-complete-body"));
  assert.ok(report.functionCatalog.some(({ entry }) => entry === "0x00416600"));
  assert.ok(report.rawCodeRanges.some(({ id }) => id === "fixed-registry-reset"));
  assert.ok(report.functionCatalog.some(({ entry }) => entry === "0x00411190"));
  assert.ok(report.rawCodeRanges.some(({ id }) => id === "path-initializer"));
  assert.ok(report.functionCatalog.some(({ entry }) => entry === "0x0040f9b0"));
  assert.ok(report.rawCodeRanges.some(({ id }) => id === "subtype-0x01-final-dispatch"));
  assert.ok(report.functionCatalog.some(({ entry }) => entry === "0x0040eab0"));
  for (const entry of [
    "0x004426f0",
    "0x00441db0",
    "0x004426a0",
    "0x00441e40",
    "0x00438e30",
  ]) assert.ok(report.functionCatalog.some((candidate) => candidate.entry === entry), entry);
  assert.deepEqual(
    report.jumpTables.finalBySubtype.cases
      .filter(({ label }) => label === 12 || label === 16),
    [
      { destination: "0x0040e039", label: 12 },
      { destination: "0x0040dfe9", label: 16 },
    ],
  );
  assert.deepEqual(
    report.jumpTables.finalEffectKind.cases
      .filter(({ label }) => label === 2 || label === 9),
    [
      { destination: "0x0041388b", label: 2 },
      { destination: "0x0041384f", label: 9 },
    ],
  );
  assert.deepEqual(report.record, {
    base: "0x00aa85e8",
    stride: "0x3a0",
    slotCount: 100,
    allocatableSlots: [1, 99],
    registryBase: "0x00842500",
    initializedBytes: "0x3a0",
    fields: {
      phase: ["WORD", "0x16"],
      activeState: ["WORD", "0x22", 1],
      slot: ["WORD", "0x24"],
      subtype: ["WORD", "0x26"],
      selectionModeByte: ["BYTE", "0x2e"],
      phaseDivisor: ["signed BYTE", "0x3c"],
      targetOrContextReference: ["DWORD low index/high generation", "0x9a"],
      payload: ["WORD from call DWORD arg13", "0x9e"],
      sourceReference: ["DWORD", "0xa0"],
      sourceOwner: ["signed WORD copied from live source BYTE +0x38, or -1", "0xa4"],
      pathIndex: ["WORD", "0xa6"],
      pathEnd: ["WORD", "0xa8"],
      pathX: ["WORD[160], promoted read index 0..159", "0x11c"],
      pathY: ["WORD[160], promoted read index 0..159", "0x25c"],
      trackingEnabled: ["WORD exact 1", "0x114"],
      trackingCount: ["WORD promoted domain 0..15", "0x116"],
    },
  });
});

test("preserves exact widths, reached-only ordering, no-op, and failure boundaries", () => {
  assert.deepEqual(reproduceSubtypeEndpoint({ subtype: 12 }), {
    updaterReturn: 0,
    cleanupRegistry: true,
    finalEffectKind: 9,
    sameSlotTransition: null,
  });
  assert.throws(() => constructAction59Payload({
    previousEdiDword: 0, ownerByte: -1, entityPayloadWord: 0, classModifierWord: 0,
  }), /ownerByte/u);
  assert.throws(() => reproduceCreation({
    registry: Array(99).fill(0), subtype: 16, selectionModeByte: 0, payloadDword: 0,
    targetOrContextReferenceDword: 0, sourceReference: 0, sourceLive: false,
  }), /exactly 100/u);
  assert.throws(() => resetFixedRegistry(Array(99).fill(0)), /exactly 100/u);
  assert.throws(() => reproduceSubtypeEndpoint({
    subtype: 16,
    candidates: [{ registryActive: true, chebyshevDistance: -1, teamHelperReturnedSame: false, reference: 1 }],
    geometryAccepted: true,
    currentSlot: 1,
    payloadDword: 0,
  }), /chebyshevDistance/u);
  assert.doesNotThrow(() => reproduceSubtypeEndpoint({
    subtype: 16,
    candidates: [],
    geometryAccepted: "unreachable",
    currentSlot: "unreachable",
    payloadDword: "unreachable",
  }));
  assert.throws(() => reproduceSubtypeEndpoint({
    subtype: 16,
    candidates: [{ registryActive: true, chebyshevDistance: 1, teamHelperReturnedSame: false, reference: 1 }],
    geometryAccepted: true,
    currentSlot: 100,
    payloadDword: 0,
  }), /currentSlot/u);
  assert.doesNotThrow(() => reproduceFlightUpdate({
    globalTick: 1,
    phaseWord: 0,
    phaseDivisorByte: "unreachable",
    trackingEnabledWord: 0,
    pathIndex: 0,
    pathEnd: 0,
    trackingCount: "unreachable",
    targetReferenceDword: "unreachable",
    targetLive: "unreachable",
    activeTargetReferenceDword: "unreachable",
    repathPathEnd: "unreachable",
  }));
  assert.throws(() => reproduceFlightUpdate({
    globalTick: 0, phaseWord: 0, phaseDivisorByte: 0, trackingEnabledWord: 0,
    pathIndex: 0, pathEnd: 0,
  }), /nonzero/u);
  assert.throws(() => reproduceFlightUpdate({
    globalTick: 1, phaseWord: 0, phaseDivisorByte: "unreachable", trackingEnabledWord: 0,
    pathIndex: 160, pathEnd: 160,
  }), /pathIndex/u);
  assert.throws(() => reproduceFlightUpdate({
    globalTick: 1, phaseWord: 0, phaseDivisorByte: "unreachable", trackingEnabledWord: 0,
    pathIndex: 5, pathEnd: 4,
  }), /must not exceed/u);
  assert.throws(() => reproduceFinalDamage({
    effectKind: 1, payload: 1,
  }), /effectKind/u);
  assert.throws(() => reproduceFinalDamage({
    effectKind: 2, targetActive: true, payload: -1,
  }), /nonnegative/u);
  assert.throws(() => reproduceFinalDamage({
    effectKind: 2, targetActive: true, payload: 1, selectionModeByte: 1, sameOwner: false,
  }), /exactly 2/u);
  assert.doesNotThrow(() => reproduceFinalDamage({
    effectKind: 9, targetActive: true, targetClassByte: 1, targetGenerationMatches: true,
    payload: 1, selectionModeByte: "unreachable", sameOwner: "unreachable",
    targetModeDword: 0, defenseWord50: 0, defenseWord44: 0, targetByteBa: 0,
    writerGlobalWord: 0, targetOwnerByte: "unreachable", playerOwnerGateByte: "unreachable",
    bufferWord: 1, currentHealth: 1,
  }));
  assert.throws(() => reproduceFinalDamage({
    effectKind: 9, targetActive: true, payload: 1,
    selectionModeByte: "unreachable", sameOwner: "unreachable",
    targetClassByte: 1, targetGenerationMatches: false, targetModeDword: "unreachable",
    defenseWord50: "unreachable", defenseWord44: "unreachable", targetByteBa: "unreachable",
    writerGlobalWord: 1, targetOwnerByte: "reached", playerOwnerGateByte: 1,
    bufferWord: 1, currentHealth: 1,
  }), /targetOwnerByte/u);
});

test("rejects stale executable and each generated evidence input independently", () => {
  for (const key of Object.keys(paths)) {
    const temporary = mkdtempSync(join(tmpdir(), "k01-subtype-16-"));
    const altered = join(temporary, key.endsWith("Path") ? "source.bin" : "source.json");
    copyFileSync(paths[key], altered);
    const bytes = readFileSync(altered);
    bytes[Math.min(32, bytes.length - 1)] ^= 1;
    writeFileSync(altered, bytes);
    assert.throws(() => extractK01Subtype16Path({ ...paths, [key]: altered }), /SHA-256/u, key);
  }
});

function makeRegistry(spec) {
  if (spec.fill !== undefined) return Array(100).fill(spec.fill);
  const registry = Array(100).fill(0);
  for (const slot of spec.occupied ?? []) registry[slot] = slot === 0 ? 1 : slot;
  if (spec.occupiedRange) {
    const [start, end] = spec.occupiedRange;
    for (let slot = start; slot <= end; slot += 1) registry[slot] = slot;
  }
  return registry;
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
