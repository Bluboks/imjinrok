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
  EXPECTED_SEEDS_SHA256,
  advanceClass78Cadence,
  extractK01RyuAutoMagicPath,
  reproduceAction40Effect,
  reproduceAction59Effect,
  reproduceAutoIssue,
  reproducePendingStore,
  reproduceTargetAdmission,
} from "./extract-k01-ryu-auto-magic-path.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
};
const fixture = JSON.parse(readFileSync(
  join(root, "analysis/fixtures/k01-ryu-auto-magic-path-vectors.json"), "utf8"));

test("reproduces every declared partial projection with complete expected output", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceSeedsSha256, EXPECTED_SEEDS_SHA256);
  assert.equal(fixture.sourceFunctionsSha256, EXPECTED_FUNCTIONS_SHA256);
  assert.equal(fixture.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  assert.equal(fixture.sourceJumpTablesSha256, EXPECTED_JUMP_TABLES_SHA256);
  const groups = [
    ["cadenceVectors", fixture.cadenceVectors, advanceClass78Cadence],
    ["targetAdmissionVectors", fixture.targetAdmissionVectors, reproduceTargetAdmission],
    ["pendingStoreVectors", fixture.pendingStoreVectors, reproducePendingStore],
    ["autoIssueVectors", fixture.autoIssueVectors, reproduceAutoIssue],
    ["action40Vectors", fixture.action40Vectors, reproduceAction40Effect],
    ["action59Vectors", fixture.action59Vectors, reproduceAction59Effect],
  ];
  assert.deepEqual(groups.map(([name, vectors]) => [name, vectors.map(({ id }) => id)]), [
    ["cadenceVectors", ["cadence-hit-zero", "cadence-miss-one", "cadence-u32-product-wrap"]],
    ["targetAdmissionVectors", [
      "gate-zero-no-op", "registry-slot-zero", "health-zero", "active-gate-zero",
      "caster-resource-below-70", "excluded-class-81", "class78-bit1-missing",
      "alternate-0x80000-missing", "type-definition-mask-0x08-set", "same-team",
      "strict-threshold-66-rejects-equal", "class78-bit1-eligible-at-65",
      "alternate-0x80000-eligible", "signed-negative-max-threshold-minus-3",
    ]],
    ["pendingStoreVectors", [
      "idle-accepts-auto", "auto-replaces-auto", "manual-pending-blocks-auto",
      "manual-replaces-auto",
    ]],
    ["autoIssueVectors", [
      "global-gate-off", "cadence-miss", "action40-stored", "action59-stored",
      "no-fallback-normal-attack", "invalid-source-still-short-circuits",
      "manual-store-rejection-still-short-circuits",
    ]],
    ["action40Vectors", [
      "success-above-boundary", "success-clamps-at-70", "revalidation-failure",
    ]],
    ["action59Vectors", [
      "zero-charge-no-op", "signed-negative-charge-no-op",
      "positive-charge-all-candidates-rejected",
      "negative-resource-clamp-and-filtered-accepts",
    ]],
  ]);
  for (const [, vectors, reproduce] of groups) for (const vector of vectors) {
    assert.deepEqual(reproduce(vector.input), vector.expected, vector.id);
    assert.deepEqual(reproduce(vector.input), reproduce(vector.input), `${vector.id} determinism`);
  }
  const projection = Object.fromEntries(groups.map(([name, vectors]) => [name, vectors]));
  assert.equal(hashJson(projection), fixture.expectedProjectionSha256);
});

test("verifies complete raw ranges, functions, references, switches, and action definitions", () => {
  const report = extractK01RyuAutoMagicPath(paths);
  assert.equal(report.reproductionStatus, "partial-reproduction-bounded-projections");
  assert.equal(report.rawCodeRanges.length, 19);
  assert.equal(report.functionCatalog.length, 19);
  assert.equal(report.referenceSets.length, 11);
  assert.equal(report.jumpTables.pendingSwitch.count, 68);
  assert.equal(report.jumpTables.stateSwitch.count, 69);
  assert.deepEqual(
    report.actionDefinitions.map(({ actionId, flagsWord, targetModeWord, producedInternalClass }) =>
      ({ actionId, flagsWord, targetModeWord, producedInternalClass })),
    [
      { actionId: 40, flagsWord: 16, targetModeWord: 1, producedInternalClass: 70 },
      { actionId: 59, flagsWord: 1, targetModeWord: 0, producedInternalClass: 0 },
    ],
  );
  assert.equal(report.jumpTables.pendingSwitch.cases.find(({ label }) => label === 40).destination, "0x004272e0");
  assert.equal(report.jumpTables.pendingSwitch.cases.find(({ label }) => label === 59).destination, "0x00426ff1");
  assert.equal(report.jumpTables.stateSwitch.cases.find(({ label }) => label === 5).destination, "0x0043d153");
  assert.equal(report.jumpTables.stateSwitch.cases.find(({ label }) => label === 40).destination, "0x0043d1da");
  assert.equal(report.jumpTables.stateSwitch.cases.find(({ label }) => label === 59).destination, "0x0043cfd7");
  assert.deepEqual(
    report.functionCatalog
      .filter(({ entry }) => ["0x00441db0", "0x00441e40", "0x004426a0"].includes(entry))
      .map(({ entry, bodySize, instructionCount }) => ({ entry, bodySize, instructionCount })),
    [
      { entry: "0x00441db0", bodySize: 41, instructionCount: 12 },
      { entry: "0x00441e40", bodySize: 59, instructionCount: 19 },
      { entry: "0x004426a0", bodySize: 66, instructionCount: 23 },
    ],
  );
  assert.deepEqual(
    report.fields.target,
    {
      base: "common entity object at 0x00635258 + index*0x558",
      internalClass: ["BYTE", "0x37"],
      owner: ["signed BYTE", "0x38"],
      maximumHealth: ["signed WORD", "0x3c"],
      currentHealth: ["signed WORD", "0x3e"],
      kind: ["BYTE", "0x68"],
      flags: ["DWORD", "0x74"],
      active: ["BYTE", "0x1f0"],
      x: ["WORD", "0x1bc"],
      y: ["WORD", "0x1be"],
      status: ["WORD", "0x252"],
      statusPhase: ["WORD", "0x254"],
    },
  );
  assert.deepEqual(report.fields.entity.pendingAuxiliaryWord, ["WORD", "0x266"]);
  for (const vector of fixture.action59Vectors.slice(2)) {
    assert.equal(vector.expected.attempts.length, 8);
    assert.equal(
      vector.expected.attempts.some(({ xOffset, yOffset }) => xOffset === 0 && yOffset === 0),
      false,
      vector.id,
    );
    for (const attempt of vector.expected.attempts) {
      assert.equal(Object.hasOwn(attempt, "subtypePayloadLowWord"), true, vector.id);
      assert.equal(Object.hasOwn(attempt, "payload"), false, vector.id);
    }
  }
});

test("preserves reached-only inputs and exact width/signedness boundaries", () => {
  assert.doesNotThrow(() => reproduceAutoIssue({
    globalGate: 0, randomValue: "unreachable",
    pending: { actionWord: 1, originByte: 0, byte3: 0, payload: 0, context: 0, pendingAuxiliaryWord: 0 },
  }));
  assert.doesNotThrow(() => reproduceAction59Effect({
    chargeWord: 0xffff, casterResource: "unreachable", entityPayloadWord: "unreachable",
    classModifier: "unreachable", accepted: "unreachable",
  }));
  assert.doesNotThrow(() => reproduceAction59Effect({
    chargeWord: 1,
    casterResource: 0,
    entityPayloadWord: "unreachable",
    classModifier: "unreachable",
    accepted: [false, false, false, false, false, false, false, false],
  }));
  assert.deepEqual(reproduceTargetAdmission({
    targetRuleGate: 0,
    registrySlotNonzero: "unreachable",
    currentHealth: "unreachable",
    targetActive: "unreachable",
    casterResource: "unreachable",
    targetClass: "unreachable",
  }), {
    eligible: false,
    failedReason: "target-rule-gate-zero",
    healthThreshold: null,
  });
  assert.throws(() => advanceClass78Cadence(-1), /0\.\.4294967295/u);
  assert.throws(() => reproduceAction40Effect({
    targetStillEligible: true, casterResource: 0x8000,
    casterPlayer: 0, targetOwner: 0, targetStatus: 0, targetStatusPhase: 0,
  }), /casterResource/u);
  assert.throws(() => reproducePendingStore({
    existing: { actionWord: 1, originByte: 0, byte3: 0, payload: 0, context: 0, pendingAuxiliaryWord: 0 },
    incoming: { actionWord: 21 },
  }), /actionWord 21 is outside/u);
  assert.doesNotThrow(() => reproducePendingStore({
    existing: { actionWord: 7, originByte: 0, byte3: 0, payload: 1, context: 2, pendingAuxiliaryWord: 3 },
    incoming: {
      actionWord: 40,
      originByte: 1,
      byte3: "unreachable",
      payload: "unreachable",
      context: "unreachable",
      pendingAuxiliaryWord: "unreachable",
    },
  }));
  assert.throws(() => reproduceAction59Effect({
    chargeWord: 1,
    casterResource: 0,
    entityPayloadWord: 0,
    classModifier: 0,
    accepted: Array(9).fill(false),
  }), /exactly eight booleans/u);
  assert.throws(() => reproduceAction59Effect({
    chargeWord: 1,
    casterResource: 0,
    entityPayloadWord: -1,
    classModifier: 0,
    accepted: [true, false, false, false, false, false, false, false],
  }), /entityPayloadWord/u);
});

test("rejects stale executable and generated evidence independently", () => {
  for (const key of Object.keys(paths)) {
    const temporary = mkdtempSync(join(tmpdir(), "k01-ryu-auto-"));
    const altered = join(temporary, key.endsWith("Path") ? "source.bin" : "source.json");
    copyFileSync(paths[key], altered);
    const bytes = readFileSync(altered);
    bytes[Math.min(32, bytes.length - 1)] ^= 1;
    writeFileSync(altered, bytes);
    assert.throws(() => extractK01RyuAutoMagicPath({ ...paths, [key]: altered }), /SHA-256/u, key);
  }
});

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
