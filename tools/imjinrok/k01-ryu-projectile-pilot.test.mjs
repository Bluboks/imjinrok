import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  advanceProjectilePoolRandomState,
  allocateProjectileSlot,
  buildSampledProjectileRoute,
  calculateEffectKindNineDamage,
  extractK01RyuProjectilePilot,
  resolveSubtype0cImpact,
} from "./extract-k01-ryu-projectile-pilot.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const seedsPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/seeds.json",
);
const jumpTablesPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/jump-tables.json",
);

test("recovers the complete subtype 0x0c flight, impact, and damage path", () => {
  const report = extractK01RyuProjectilePilot();

  assert.equal(
    report.evidenceStatus,
    "static-proven-k01-ryu-projectile-subtype-0x0c",
  );
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.match(
    report.acceptedInputSubset.routeCoordinates,
    /conservative port contract/,
  );
  assert.match(
    report.acceptedInputSubset.routeCoordinates,
    /not a statically proven original caller range/,
  );
  assert.ok(
    report.unresolvedScope.some((item) =>
      item.includes("full signed-WORD values"),
    ),
  );
  assert.deepEqual(report.subtypeConfig.values, [
    14, 29, 0, 0, 0, 0, 1, 1,
  ]);
  assert.deepEqual(report.recordLifecycle.allocatableSlots, {
    first: 1,
    last: 99,
  });
  assert.equal(report.dispatcher.caseLabel, 0x0c);
  assert.equal(report.dispatcher.caseDestination, "0x0040e039");
  assert.equal(report.dispatcher.handlerFunction, "0x0040e270");
  assert.deepEqual(report.dispatcher.caseLabels, [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    12, 13, 14, 15, 16, 17, 18, 19, 20, 21, null,
  ]);
  assert.equal(report.damage.effectKind, 9);
  assert.equal(report.damage.basePayload, 45);
  assert.equal(report.damage.switchAddress, "0x004130f4");
  assert.equal(report.damage.caseDestination, "0x00413537");
  assert.equal(report.callEdges.length, 25);
  assert.equal(report.analyzedFunctions.length, 25);
  assert.equal(report.codeAnchors.length, 27);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.deepEqual(
    report.testVectors.map((vector) => vector.id),
    [
      "normal-flight-and-impact",
      "short-route-arrives-at-start-sample",
      "route-error-accumulator-starts-at-zero",
      "route-cap-preserves-original-memory-alias",
      "pool-random-state-advances-before-projectiles",
      "buffer-is-consumed-before-health",
      "health-table-gate-skips-all-state-mutation",
      "defense-word-add-wraps-before-signed-cap",
      "conditional-half-defense-add-wraps-as-word",
      "class-five-modified-payload-wraps-through-cx",
      "signed-negative-buffer-does-not-absorb-damage",
      "signed-negative-health-clamps-after-word-subtraction",
      "inactive-target-is-not-dispatched",
      "stale-target-generation-deals-zero",
      "stale-generation-zero-damage-still-runs-health-branch",
      "full-projectile-pool-skips-spawn",
    ],
  );
});

test("replays original pool random-state order and signed-word routes", () => {
  assert.deepEqual(
    advanceProjectilePoolRandomState({
      seed: 12345,
      currentSeed: 54321,
    }),
    {
      seed: 25813,
      currentSeed: 25813,
      previousSeed: 54321,
    },
  );
  assert.deepEqual(
    advanceProjectilePoolRandomState({
      seed: 0xffffffff,
      currentSeed: 7,
    }),
    {
      seed: 145,
      currentSeed: 145,
      previousSeed: 7,
    },
  );

  assert.deepEqual(
    buildSampledProjectileRoute({
      startX: 0,
      startY: 0,
      endX: 28,
      endY: 14,
      sampleInterval: 14,
    }),
    {
      points: [
        { x: 0, y: 0 },
        { x: 14, y: 7 },
        { x: 28, y: 14 },
      ],
      finalRouteIndex: 2,
      updateCountUntilImpact: 3,
    },
  );
  assert.deepEqual(
    buildSampledProjectileRoute({
      startX: 0,
      startY: 0,
      endX: 15,
      endY: 8,
      sampleInterval: 14,
    }),
    {
      points: [
        { x: 0, y: 0 },
        { x: 14, y: 7 },
      ],
      finalRouteIndex: 1,
      updateCountUntilImpact: 2,
    },
  );
  assert.deepEqual(
    buildSampledProjectileRoute({
      startX: 10,
      startY: 20,
      endX: 23,
      endY: 20,
      sampleInterval: 14,
    }),
    {
      points: [{ x: 10, y: 20 }],
      finalRouteIndex: 0,
      updateCountUntilImpact: 1,
    },
  );
  const cappedRoute = buildSampledProjectileRoute({
    startX: 0,
    startY: 100,
    endX: 3000,
    endY: 100,
    sampleInterval: 14,
  });
  assert.equal(cappedRoute.points.length, 160);
  assert.equal(cappedRoute.finalRouteIndex, 159);
  assert.equal(cappedRoute.updateCountUntilImpact, 160);
  assert.deepEqual(cappedRoute.points[0], { x: 0, y: 2996 });
  assert.deepEqual(cappedRoute.points[159], { x: 2226, y: 100 });
  assert.throws(
    () =>
      buildSampledProjectileRoute({
        startX: 0,
        startY: 0,
        endX: 1,
        endY: 1,
        sampleInterval: 0,
      }),
    /sampleInterval must be a positive signed word/,
  );
  assert.throws(
    () =>
      buildSampledProjectileRoute({
        startX: -1,
        startY: 0,
        endX: 1,
        endY: 1,
        sampleInterval: 14,
      }),
    /startX must be an integer in 0\.\.32767/,
  );
});

test("replays effect-kind-9 class, defense, buffer, and health boundaries", () => {
  assert.equal(
    calculateEffectKindNineDamage({
      payload: 45,
      defenseBase: 20,
      defenseModifier: 10,
      defenderClass: 4,
    }),
    41,
  );
  assert.equal(
    calculateEffectKindNineDamage({
      payload: 45,
      defenseBase: 0,
      defenderClass: 5,
    }),
    67,
  );
  assert.equal(
    calculateEffectKindNineDamage({
      payload: 45,
      defenseBase: 60,
      specialDefenseFlag: 1,
      defenderClass: 1,
    }),
    5,
  );
  assert.equal(
    calculateEffectKindNineDamage({
      payload: 45,
      defenseBase: 100,
      defenderClass: 5,
    }),
    7,
  );
  assert.equal(
    calculateEffectKindNineDamage({
      payload: 45,
      defenseBase: 32767,
      defenseModifier: 1,
      defenderClass: 1,
    }),
    14790,
  );
  assert.equal(
    calculateEffectKindNineDamage({
      payload: 45,
      defenseBase: -32768,
      specialDefenseFlag: 1,
      defenderClass: 1,
    }),
    5,
  );
  assert.equal(
    calculateEffectKindNineDamage({
      payload: 32767,
      defenseBase: 0,
      defenderClass: 5,
    }),
    1,
  );

  assert.deepEqual(
    resolveSubtype0cImpact({
      targetActive: true,
      targetGenerationMatches: true,
      payload: 45,
      defenseBase: 0,
      defenderClass: 1,
      buffer: 50,
      health: 100,
    }),
    {
      effectDispatched: true,
      calculatedDamage: 45,
      damageAppliedToBuffer: 45,
      healthSubtractionOperand: 0,
      healthApplicationReturn: 1,
      healthApplicationSkippedByTableGate: false,
      buffer: 5,
      health: 100,
      projectileReleased: true,
    },
  );
  assert.deepEqual(
    resolveSubtype0cImpact({
      targetActive: true,
      targetGenerationMatches: true,
      payload: 45,
      defenseBase: 0,
      defenderClass: 1,
      buffer: 10,
      health: 30,
    }),
    {
      effectDispatched: true,
      calculatedDamage: 45,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 45,
      healthApplicationReturn: 0,
      healthApplicationSkippedByTableGate: false,
      buffer: 0,
      health: 0,
      projectileReleased: true,
    },
  );
  assert.deepEqual(
    resolveSubtype0cImpact({
      targetActive: true,
      targetGenerationMatches: true,
      payload: 45,
      defenseBase: 0,
      defenderClass: 1,
      buffer: 0xffff,
      health: 100,
    }),
    {
      effectDispatched: true,
      calculatedDamage: 45,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 45,
      healthApplicationReturn: 1,
      healthApplicationSkippedByTableGate: false,
      buffer: 0,
      health: 55,
      projectileReleased: true,
    },
  );
  assert.deepEqual(
    resolveSubtype0cImpact({
      targetActive: true,
      targetGenerationMatches: true,
      payload: 45,
      defenseBase: 0,
      defenderClass: 1,
      buffer: 50,
      health: 100,
      healthApplicationMode: 1,
      defenderSignedByte38: -1,
      selectedHealthApplicationTableByte: 0,
    }),
    {
      effectDispatched: true,
      calculatedDamage: 45,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 0,
      healthApplicationReturn: 1,
      healthApplicationSkippedByTableGate: true,
      buffer: 50,
      health: 100,
      projectileReleased: true,
    },
  );
});

test("replays allocation exhaustion and target disappearance failures", () => {
  const activeSubtypes = Array(100).fill(0x0c);
  activeSubtypes[0] = 0;
  activeSubtypes[37] = 0;
  assert.equal(allocateProjectileSlot(activeSubtypes), 37);

  activeSubtypes[37] = 0x0c;
  assert.equal(allocateProjectileSlot(activeSubtypes), 0);
  assert.equal(allocateProjectileSlot(Array(100).fill(0xffff)), 0);

  assert.deepEqual(
    resolveSubtype0cImpact({
      targetActive: false,
      targetGenerationMatches: true,
      payload: 45,
      defenseBase: 0,
      defenderClass: 4,
      buffer: 8,
      health: 100,
    }),
    {
      effectDispatched: false,
      calculatedDamage: 0,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 0,
      healthApplicationReturn: null,
      healthApplicationSkippedByTableGate: false,
      buffer: 8,
      health: 100,
      projectileReleased: true,
    },
  );
  assert.deepEqual(
    resolveSubtype0cImpact({
      targetActive: true,
      targetGenerationMatches: false,
      payload: 45,
      defenseBase: 0,
      defenderClass: 4,
      buffer: 8,
      health: 100,
    }),
    {
      effectDispatched: true,
      calculatedDamage: 0,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 0,
      healthApplicationReturn: 1,
      healthApplicationSkippedByTableGate: false,
      buffer: 8,
      health: 100,
      projectileReleased: true,
    },
  );
  assert.deepEqual(
    resolveSubtype0cImpact({
      targetActive: true,
      targetGenerationMatches: false,
      payload: 45,
      defenseBase: 0,
      defenderClass: 4,
      buffer: 0,
      health: 0xffff,
    }),
    {
      effectDispatched: true,
      calculatedDamage: 0,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 0,
      healthApplicationReturn: 0,
      healthApplicationSkippedByTableGate: false,
      buffer: 0,
      health: 0,
      projectileReleased: true,
    },
  );
  assert.throws(
    () =>
      resolveSubtype0cImpact({
        targetActive: 1,
        targetGenerationMatches: true,
        payload: 45,
        defenseBase: 0,
        defenderClass: 1,
        buffer: 0,
        health: 100,
      }),
    /targetActive must be a boolean/,
  );
  assert.throws(
    () =>
      resolveSubtype0cImpact({
        targetActive: true,
        targetGenerationMatches: true,
        payload: 45,
        defenseBase: 0,
        defenderClass: 1,
        buffer: 0,
        health: 100,
        defenderSignedByte38: 128,
      }),
    /defenderSignedByte38 must be an integer in -128\.\.127/,
  );
  assert.throws(
    () =>
      resolveSubtype0cImpact({
        targetActive: true,
        targetGenerationMatches: true,
        payload: 45,
        defenseBase: 0,
        defenderClass: 1,
        buffer: 0,
        health: 100,
        defenderSignedByte38: -128,
        selectedHealthApplicationTableByte: 256,
      }),
    /selectedHealthApplicationTableByte must be an integer in 0\.\.255/,
  );
  assert.throws(
    () =>
      resolveSubtype0cImpact({
        targetActive: true,
        targetGenerationMatches: true,
        payload: 45,
        defenseBase: 0,
        defenderClass: -1,
        buffer: 0,
        health: 100,
      }),
    /defenderClass must be an integer in 0\.\.4294967295/,
  );
});

test("rejects tampered subtype constants and mismatched analysis inputs", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-ryu-projectile-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const tamperedSeeds = JSON.parse(readFileSync(seedsPath, "utf8"));
  const subtypeInitializer = tamperedSeeds.functions.find(
    (candidate) => candidate.entry === "0x0040c470",
  );
  const sampleIntervalPush = subtypeInitializer?.instructions.find(
    (instruction) => instruction.address === "0x0040c5e8",
  );
  assert.ok(sampleIntervalPush);
  sampleIntervalPush.text = "PUSH 0xd";
  const tamperedSeedsPath = join(temporaryDirectory, "tampered-seeds.json");
  writeFileSync(
    tamperedSeedsPath,
    `${JSON.stringify(tamperedSeeds)}\n`,
  );
  assert.throws(
    () =>
      extractK01RyuProjectilePilot({
        seedsPath: tamperedSeedsPath,
      }),
    /subtype-0x0c-config mismatch/,
  );

  const mismatchedJumpTables = JSON.parse(
    readFileSync(jumpTablesPath, "utf8"),
  );
  mismatchedJumpTables.sourceSha256 = "0".repeat(64);
  const mismatchedJumpTablesPath = join(
    temporaryDirectory,
    "mismatched-jump-tables.json",
  );
  writeFileSync(
    mismatchedJumpTablesPath,
    `${JSON.stringify(mismatchedJumpTables)}\n`,
  );
  assert.throws(
    () =>
      extractK01RyuProjectilePilot({
        jumpTablesPath: mismatchedJumpTablesPath,
      }),
    /source SHA-256 mismatch/,
  );
});
