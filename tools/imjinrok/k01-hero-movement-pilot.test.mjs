import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01HeroMovementPilot } from "./extract-k01-hero-movement-pilot.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const executablePath = join(
  repositoryRoot,
  "original/imjinrok2/imjinrok2.exe",
);
const jumpTablesPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/jump-tables.json",
);
const seedsPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/seeds.json",
);
const spearmanSpritePath = join(
  repositoryRoot,
  "original/imjinrok2/char/swordk.spr",
);
const gwonYulSpritePath = join(
  repositoryRoot,
  "original/imjinrok2/char/generalk11.spr",
);
const gwonYulAttackSpritePath = join(
  repositoryRoot,
  "original/imjinrok2/char/generalk12.spr",
);
const gwonYulIdleSpritePath = join(
  repositoryRoot,
  "original/imjinrok2/char/generalk13.spr",
);
const ryuSeongRyongSpritePath = join(
  repositoryRoot,
  "original/imjinrok2/char/generalk31.spr",
);
const ryuSeongRyongCombatSpritePath = join(
  repositoryRoot,
  "original/imjinrok2/char/generalk32.spr",
);

test("recovers the K01 hero identities and dedicated sprite sources", () => {
  const report = extractReport();

  assert.equal(
    report.analysisStatus,
    "static-confirmed-for-k01-hero-core-animation-states",
  );
  assert.deepEqual(
    report.heroes.map((hero) => ({
      projectEntityId: hero.projectEntityId,
      internalClass: hero.identity.internalClass,
      originalGameplayName: hero.identity.originalGameplayName,
      spriteSlot: hero.identity.spriteSlot,
      sourcePath: hero.identity.sourcePath,
      width: hero.sprite.width,
      height: hero.sprite.height,
      frameCount: hero.sprite.frameCount,
      initializer: hero.animationInitializer.classSwitchDestination,
      frameRange: hero.movement.frameRange,
    })),
    [
      {
        projectEntityId: "gwon-yul",
        internalClass: 76,
        originalGameplayName: "조선 권율",
        spriteSlot: 153,
        sourcePath: "char\\generalk11.spr",
        width: 128,
        height: 108,
        frameCount: 48,
        initializer: "0x0042a9da",
        frameRange: [0, 39],
      },
      {
        projectEntityId: "ryu-seong-ryong",
        internalClass: 78,
        originalGameplayName: "조선 유성룡",
        spriteSlot: 158,
        sourcePath: "char\\generalk31.spr",
        width: 88,
        height: 76,
        frameCount: 80,
        initializer: "0x0042ab2a",
        frameRange: [40, 79],
      },
    ],
  );
  assert.equal(
    report.evidencePoints.every((evidence) => evidence.matched),
    true,
  );
});

test("recovers idle, attack, and health-zero death states from secondary sprite slots", () => {
  const report = extractReport();

  assert.deepEqual(
    report.recoveredStateSemantics,
    {
      idle: {
        originalAnimationState: 8,
        producer: "0x0043c344",
        consumer: "0x0041d880",
        spriteSlotField: "+0x93",
        phaseCountField: "+0x92",
        frameBaseFields: ["+0x94", "+0x96", "+0x98", "+0x9a", "+0x9c"],
      },
      attack: {
        originalAnimationState: 4,
        producer: "0x00423837",
        consumer: "0x0041e200",
        spriteSlotField: "+0x146",
        phaseCountField: "+0x144",
        frameBaseFields: ["+0x148", "+0x14a", "+0x14c", "+0x14e", "+0x150"],
      },
      death: {
        originalActionState: 6,
        originalAnimationState: 7,
        healthField: "+0x3e",
        actionTransition: "0x0043ccf6",
        producer: "0x004236a4",
        consumer: "0x0041d700",
        spriteSlotField: "+0x192",
        phaseCountField: "+0x18c",
        frameBaseFields: ["+0x194", "+0x196", "+0x198", "+0x19a", "+0x19c"],
      },
    },
  );
  assert.deepEqual(
    report.heroes.map((hero) => ({
      projectEntityId: hero.projectEntityId,
      sprites: Object.fromEntries(
        Object.entries(hero.sprites).map(([state, sprite]) => [
          state,
          [
            sprite.spriteSlot,
            sprite.sourcePath,
            sprite.frameCount,
            sprite.tableIndex,
          ],
        ]),
      ),
      idle: [hero.idle.frameRange, hero.idle.phaseCount],
      attack: [hero.attack.frameRange, hero.attack.phaseCount],
      death: [hero.death.frameRange, hero.death.phaseCount],
    })),
    [
      {
        projectEntityId: "gwon-yul",
        sprites: {
          movement: [153, "char\\generalk11.spr", 48, 53],
          idle: [155, "char\\generalk13.spr", 48, 55],
          attack: [154, "char\\generalk12.spr", 56, 54],
          death: [153, "char\\generalk11.spr", 48, 53],
        },
        idle: [[0, 39], 8],
        attack: [[0, 47], 8],
        death: [[40, 47], 8],
      },
      {
        projectEntityId: "ryu-seong-ryong",
        sprites: {
          movement: [158, "char\\generalk31.spr", 80, 58],
          idle: [158, "char\\generalk31.spr", 80, 58],
          attack: [159, "char\\generalk32.spr", 60, 59],
          death: [159, "char\\generalk32.spr", 60, 59],
        },
        idle: [[0, 39], 8],
        attack: [[0, 49], 10],
        death: [[50, 57], 8],
      },
    ],
  );

  for (const hero of report.heroes) {
    for (const state of ["idle", "attack", "death"]) {
      assert.equal(hero[state].directions.length, 8);
      assert.deepEqual(
        hero[state].directions.map((direction) => direction.facing).sort(),
        ["e", "n", "ne", "nw", "s", "se", "sw", "w"],
      );
    }
    assert.equal(hero.initialTypeFlags.usesState8NormalDirectionPath, true);
    assert.equal(hero.initialTypeFlags.usesState4NormalDirectionPath, true);
  }
});

test("reproduces all eight normal movement facings and phase bounds", () => {
  const report = extractReport();
  const expectedDirections = {
    s: [0, false],
    sw: [8, false],
    w: [16, false],
    nw: [24, false],
    n: [16, true],
    ne: [8, true],
    e: [0, true],
    se: [32, false],
  };

  for (const hero of report.heroes) {
    const frameShift = hero.projectEntityId === "gwon-yul" ? 0 : 40;
    assert.equal(hero.movement.directions.length, 8);
    assert.deepEqual(
      Object.fromEntries(
        hero.movement.directions.map((direction) => [
          direction.facing,
          [
            direction.frameRange[0],
            direction.frameRange[1],
            direction.mirrorX,
          ],
        ]),
      ),
      Object.fromEntries(
        Object.entries(expectedDirections).map(
          ([facing, [frameBase, mirrorX]]) => [
            facing,
            [
              frameBase + frameShift,
              frameBase + frameShift + 7,
              mirrorX,
            ],
          ],
        ),
      ),
    );
    assert.equal(
      hero.initialTypeFlags.usesState1NormalDirectionPath,
      true,
    );
    assert.equal(
      hero.initialTypeFlags.normalMovementDefaultsToState1,
      true,
    );
  }
});

test("refuses a hero sprite whose source hash no longer matches", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-hero-movement-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );
  const alteredSpritePath = join(temporaryDirectory, "generalk11.spr");
  copyFileSync(gwonYulSpritePath, alteredSpritePath);
  const sprite = readFileSync(alteredSpritePath);
  sprite[sprite.length - 1] ^= 0xff;
  writeFileSync(alteredSpritePath, sprite);

  assert.throws(
    () =>
      extractK01HeroMovementPilot({
        executablePath,
        jumpTablesPath,
        seedsPath,
        spearmanSpritePath,
        gwonYulSpritePath: alteredSpritePath,
        gwonYulAttackSpritePath,
        gwonYulIdleSpritePath,
        ryuSeongRyongSpritePath,
        ryuSeongRyongCombatSpritePath,
      }),
    /SHA-256 mismatch/,
  );
});

function extractReport() {
  return extractK01HeroMovementPilot({
    executablePath,
    jumpTablesPath,
    seedsPath,
    spearmanSpritePath,
    gwonYulSpritePath,
    gwonYulAttackSpritePath,
    gwonYulIdleSpritePath,
    ryuSeongRyongSpritePath,
    ryuSeongRyongCombatSpritePath,
  });
}
