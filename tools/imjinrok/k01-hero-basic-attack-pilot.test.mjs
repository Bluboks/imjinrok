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
  advanceBasicAttackCycle,
  advanceBasicAttackRecovery,
  calculateDirectEffectKindOneDamage,
  extractK01HeroBasicAttackPilot,
} from "./extract-k01-hero-basic-attack-pilot.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const seedsPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/seeds.json",
);

test("recovers K01 hero hit phases, recovery gates, and delivery paths", () => {
  const report = extractK01HeroBasicAttackPilot();

  assert.equal(
    report.evidenceStatus,
    "static-proven-k01-hero-basic-attack-phase",
  );
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.equal(report.analyzedFunctions.length, 10);
  assert.deepEqual(
    report.heroes.map((hero) => ({
      internalClass: hero.identity.internalClass,
      name: hero.identity.originalGameplayName,
      phaseCount: hero.attackAnimation.phaseCount,
      hitPhase: hero.attackAnimation.hitPhase,
      phaseTicks: hero.timing.phaseTicksPerAdvance,
      recovery: hero.timing.primaryRecoveryThreshold,
      attackAttribute: hero.delivery.attackAttribute,
      delivery: hero.delivery.mode,
      payloadDamage: hero.delivery.payloadDamage,
    })),
    [
      {
        internalClass: 76,
        name: "조선 권율",
        phaseCount: 8,
        hitPhase: 7,
        phaseTicks: 1,
        recovery: 2,
        attackAttribute: 0x13,
        delivery: "direct",
        payloadDamage: 80,
      },
      {
        internalClass: 78,
        name: "조선 유성룡",
        phaseCount: 10,
        hitPhase: 7,
        phaseTicks: 1,
        recovery: 2,
        attackAttribute: 9,
        delivery: "projectile",
        payloadDamage: 45,
      },
    ],
  );

  const [gwonYul, ryuSeongRyong] = report.heroes;
  assert.equal(gwonYul?.delivery.effectKind, 1);
  assert.equal(gwonYul?.delivery.callSite, "0x0041774a");
  assert.equal(ryuSeongRyong?.delivery.projectileSubtype, 0x0c);
  assert.equal(
    ryuSeongRyong?.delivery.callSite,
    "0x00417bfb",
  );
});

test("replays exact hit and wrap phases for both K01 heroes", () => {
  assert.deepEqual(replayCycle(8, 7), {
    hitSteps: [7],
    completionStep: 8,
    finalPhase: 0,
    finalRecovery: 0,
  });
  assert.deepEqual(replayCycle(10, 7), {
    hitSteps: [7],
    completionStep: 10,
    finalPhase: 0,
    finalRecovery: 0,
  });

  assert.deepEqual(
    advanceBasicAttackCycle({
      phase: 0,
      phaseTickCounter: 0,
      phaseTicksPerAdvance: 1,
      phaseCount: 8,
      hitPhase: 7,
      primaryRecoveryCounter: 1,
      primaryRecoveryThreshold: 2,
    }),
    {
      ready: false,
      phase: 0,
      phaseTickCounter: 0,
      phaseAdvanced: false,
      hit: false,
      cycleComplete: false,
      primaryRecoveryCounter: 1,
      secondaryRecoveryCounter: 0,
    },
  );
});

test("replays even-tick recovery cadence and direct damage boundaries", () => {
  let recovery = {
    primaryRecoveryCounter: 0,
    secondaryRecoveryCounter: 0,
  };
  for (const globalTick of [1, 2, 3, 4]) {
    recovery = advanceBasicAttackRecovery({
      globalTick,
      ...recovery,
      primaryRecoveryThreshold: 2,
    });
  }
  assert.deepEqual(recovery, {
    primaryRecoveryCounter: 2,
    secondaryRecoveryCounter: 0,
  });

  assert.equal(
    calculateDirectEffectKindOneDamage({
      payloadDamage: 80,
      defenseBase: 0,
      attackResponseClass: 0,
    }),
    80,
  );
  assert.equal(
    calculateDirectEffectKindOneDamage({
      payloadDamage: 80,
      defenseBase: 100,
      attackResponseClass: 0,
    }),
    8,
  );
  assert.equal(
    calculateDirectEffectKindOneDamage({
      payloadDamage: 80,
      defenseBase: 0,
      attackResponseClass: 1,
    }),
    88,
  );
  assert.equal(
    calculateDirectEffectKindOneDamage({
      payloadDamage: 80,
      defenseBase: 0,
      attackResponseClass: 3,
    }),
    104,
  );
  assert.throws(
    () =>
      calculateDirectEffectKindOneDamage({
        payloadDamage: 0,
        defenseBase: 0,
        attackResponseClass: 0,
      }),
    /payloadDamage must be an integer in 1\.\.32767/,
  );
});

test("rejects tampered type constants and mismatched static-analysis sources", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-hero-basic-attack-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const mismatchedSeeds = JSON.parse(readFileSync(seedsPath, "utf8"));
  mismatchedSeeds.sourceSha256 = "0".repeat(64);
  const mismatchedSeedsPath = join(
    temporaryDirectory,
    "mismatched-seeds.json",
  );
  writeFileSync(
    mismatchedSeedsPath,
    `${JSON.stringify(mismatchedSeeds)}\n`,
  );
  assert.throws(
    () =>
      extractK01HeroBasicAttackPilot({
        seedsPath: mismatchedSeedsPath,
      }),
    /source SHA-256 mismatch/,
  );

  const tamperedSeeds = JSON.parse(readFileSync(seedsPath, "utf8"));
  const typeInitializer = tamperedSeeds.functions.find(
    (candidate) => candidate.entry === "0x0045bf50",
  );
  const hitPhasePush = typeInitializer?.instructions.find(
    (instruction) => instruction.address === "0x0045d954",
  );
  assert.ok(hitPhasePush);
  hitPhasePush.text = "PUSH 0x6";
  const tamperedSeedsPath = join(
    temporaryDirectory,
    "tampered-seeds.json",
  );
  writeFileSync(
    tamperedSeedsPath,
    `${JSON.stringify(tamperedSeeds)}\n`,
  );
  assert.throws(
    () =>
      extractK01HeroBasicAttackPilot({
        seedsPath: tamperedSeedsPath,
        catalogSeedsPath: seedsPath,
      }),
    /class 76 hitPhase mismatch/,
  );
});

function replayCycle(phaseCount, hitPhase) {
  let state = {
    phase: 0,
    phaseTickCounter: 0,
    primaryRecoveryCounter: 2,
  };
  const hitSteps = [];
  let completionStep;

  for (let step = 1; step <= phaseCount; step += 1) {
    const result = advanceBasicAttackCycle({
      ...state,
      phaseTicksPerAdvance: 1,
      phaseCount,
      hitPhase,
      primaryRecoveryThreshold: 2,
    });
    if (result.hit) {
      hitSteps.push(step);
    }
    if (result.cycleComplete) {
      completionStep = step;
    }
    state = {
      phase: result.phase,
      phaseTickCounter: result.phaseTickCounter,
      primaryRecoveryCounter:
        result.primaryRecoveryCounter,
    };
  }

  return {
    hitSteps,
    completionStep,
    finalPhase: state.phase,
    finalRecovery: state.primaryRecoveryCounter,
  };
}
