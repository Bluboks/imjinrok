import assert from "node:assert/strict";
import test from "node:test";

import { extractK01RyuProjectilePilot } from "../../../tools/imjinrok/extract-k01-ryu-projectile-pilot.mjs";
import {
  advanceOriginalProjectilePoolRandomState,
  allocateOriginalProjectileSlot,
  buildOriginalRyuProjectileRoute,
  calculateOriginalEffectKindNineDamage,
  ORIGINAL_RYU_PROJECTILE_EFFECT_KIND,
  ORIGINAL_RYU_PROJECTILE_SAMPLE_INTERVAL,
  ORIGINAL_RYU_PROJECTILE_SUBTYPE,
  resolveOriginalRyuProjectileImpact,
} from "./originalRyuProjectile.js";

test("simulation port consumes the extractor's original-input vectors", () => {
  const report = extractK01RyuProjectilePilot();

  assert.equal(
    ORIGINAL_RYU_PROJECTILE_SUBTYPE,
    report.identity.projectileSubtype,
  );
  assert.equal(
    ORIGINAL_RYU_PROJECTILE_EFFECT_KIND,
    report.damage.effectKind,
  );
  assert.equal(
    ORIGINAL_RYU_PROJECTILE_SAMPLE_INTERVAL,
    report.subtypeConfig.routeSampleInterval,
  );

  for (const vector of report.testVectors) {
    if (vector.input.route) {
      const { sampleInterval, ...routeInput } = vector.input.route;
      assert.equal(sampleInterval, ORIGINAL_RYU_PROJECTILE_SAMPLE_INTERVAL);
      assert.deepEqual(
        buildOriginalRyuProjectileRoute(routeInput),
        vector.expected.route,
        vector.id,
      );
    }
    if (vector.input.impact) {
      assert.deepEqual(
        resolveOriginalRyuProjectileImpact(vector.input.impact),
        vector.expected.impact,
        vector.id,
      );
    }
    if (vector.input.activeSubtypes) {
      assert.equal(
        allocateOriginalProjectileSlot(vector.input.activeSubtypes),
        vector.expected.allocatedSlot,
        vector.id,
      );
    }
    if (vector.input.randomState) {
      assert.deepEqual(
        advanceOriginalProjectilePoolRandomState(vector.input.randomState),
        vector.expected.randomState,
        vector.id,
      );
    }
  }
});

test("simulation port preserves random-state, class, and damage boundaries", () => {
  assert.deepEqual(
    buildOriginalRyuProjectileRoute({
      startX: 0,
      startY: 0,
      endX: 15,
      endY: 8,
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
    advanceOriginalProjectilePoolRandomState({
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
    advanceOriginalProjectilePoolRandomState({
      seed: 0xffffffff,
      currentSeed: 7,
    }),
    {
      seed: 145,
      currentSeed: 145,
      previousSeed: 7,
    },
  );
  assert.equal(
    calculateOriginalEffectKindNineDamage({
      payload: 45,
      defenseBase: 0,
      defenderClass: 5,
    }),
    67,
  );
  assert.equal(
    calculateOriginalEffectKindNineDamage({
      payload: 1,
      defenseBase: 90,
      defenderClass: 1,
    }),
    1,
  );
  assert.equal(
    calculateOriginalEffectKindNineDamage({
      payload: 45,
      defenseBase: 32767,
      defenseModifier: 1,
      defenderClass: 1,
    }),
    14790,
  );
  assert.equal(
    calculateOriginalEffectKindNineDamage({
      payload: 45,
      defenseBase: -32768,
      specialDefenseFlag: 1,
      defenderClass: 1,
    }),
    5,
  );
  assert.equal(
    calculateOriginalEffectKindNineDamage({
      payload: 32767,
      defenseBase: 0,
      defenderClass: 5,
    }),
    1,
  );
  assert.deepEqual(
    resolveOriginalRyuProjectileImpact({
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
    resolveOriginalRyuProjectileImpact({
      targetActive: true,
      targetGenerationMatches: true,
      payload: 45,
      defenseBase: 0,
      defenderClass: 1,
      buffer: 0,
      health: 0xffff,
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
    resolveOriginalRyuProjectileImpact({
      targetActive: true,
      targetGenerationMatches: true,
      payload: 45,
      defenseBase: 0,
      defenderClass: 1,
      buffer: 50,
      health: 100,
      healthApplicationMode: 1,
      defenderSignedByte38: 3,
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
  assert.deepEqual(
    resolveOriginalRyuProjectileImpact({
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
});

test("simulation port rejects malformed fixed-width inputs loudly", () => {
  assert.throws(
    () => allocateOriginalProjectileSlot(Array(99).fill(0)),
    /exactly 100 words/,
  );
  assert.throws(
    () =>
      buildOriginalRyuProjectileRoute({
        startX: -1,
        startY: 0,
        endX: 0,
        endY: 0,
      }),
    /startX must be an integer in 0\.\.32767/,
  );
  assert.throws(
    () =>
      resolveOriginalRyuProjectileImpact({
        // @ts-expect-error Intentional malformed runtime input exercises boolean validation.
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
      resolveOriginalRyuProjectileImpact({
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
      resolveOriginalRyuProjectileImpact({
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
      resolveOriginalRyuProjectileImpact({
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
