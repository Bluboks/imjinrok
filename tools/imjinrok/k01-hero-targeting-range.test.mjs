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
  chooseFirstAutomaticTarget,
  chooseFirstRelationDifferentSecondaryListTarget,
  classifyAttackTargetTransition,
  evaluateAutomaticScanGate,
  evaluateOriginalTargetRange,
  evaluateStoredTargetCandidate,
  extractK01HeroTargetingRange,
  shouldRunAutomaticTargetScan,
} from "./extract-k01-hero-targeting-range.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("recovers the scoped K01 hero target producer, scan, range, and transitions", () => {
  const report = extractK01HeroTargetingRange();

  assert.equal(
    report.question,
    "For the K01 Gwon Yul and Ryu Seong-ryong ordinary-attack path, how is the current target reference produced and validated, how do missing or out-of-range targets cause automatic acquisition or state transitions, and what exact fixed-width range formula and inclusive/exclusive boundaries does the original use?",
  );
  assert.equal(
    report.statuses.analysis,
    "static-proven-for-described-class-76-and-78-raw-inputs",
  );
  assert.equal(
    report.statuses.reproduction,
    "complete-for-listed-normal-boundary-and-failure-vectors",
  );
  assert.match(report.statuses.integration, /^gated-/);
  assert.deepEqual(
    report.heroes.map((hero) => ({
      internalClass: hero.internalClass,
      rangeWord: hero.rangeWord,
      scanRadius: hero.scanRadius,
      initialFlags: hero.initialFlags,
      hasSecondaryAcquisitionList: hero.hasSecondaryAcquisitionList,
    })),
    [
      {
        internalClass: 76,
        rangeWord: 1,
        scanRadius: 5,
        initialFlags: "0x00880805",
        hasSecondaryAcquisitionList: false,
      },
      {
        internalClass: 78,
        rangeWord: 5,
        scanRadius: 5,
        initialFlags: "0x00882805",
        hasSecondaryAcquisitionList: true,
      },
    ],
  );
  assert.equal(report.analyzedFunctions.length, 33);
  assert.equal(report.callEdges.length, 35);
  assert.equal(report.codeAnchors.length, 17);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.deepEqual(report.currentTargetReference.producerChain, [
    "0x00439d70",
    "0x00478400",
    "0x00478320",
    "0x00426740",
    "0x00426c20",
    "0x00416870",
  ]);
  assert.deepEqual(
    report.testVectors.find(
      (vector) =>
        vector.id ===
        "gwon-negative-target-footprint-truncates-toward-zero",
    ),
    {
      id: "gwon-negative-target-footprint-truncates-toward-zero",
      input: {
        attackerX: 0,
        attackerFootprintX: 1,
        targetX: 2,
        targetFootprintX: -2,
      },
      expected: false,
    },
  );
  assert.deepEqual(
    report.testVectors.find(
      (vector) =>
        vector.id === "secondary-direct-exact-full-reference-excluded",
    )?.expected,
    { index: 1, fullReference: 0x00020014, lowWord: 20 },
  );
});

test("replays Ryu strict squared-distance boundaries and x86 wrap", () => {
  const base = {
    targetActive: true,
    attackerClass: 78,
    rangeWord: 5,
    attackerCenterX: 0,
    attackerCenterY: 0,
    targetCenterY: 0,
  };
  assert.equal(
    evaluateOriginalTargetRange({ ...base, targetCenterX: 224 }),
    true,
  );
  assert.equal(
    evaluateOriginalTargetRange({ ...base, targetCenterX: 225 }),
    false,
  );
  assert.equal(
    evaluateOriginalTargetRange({
      ...base,
      attackerCenterX: 32767,
      targetCenterX: -32768,
    }),
    true,
  );
  assert.equal(
    evaluateOriginalTargetRange({
      ...base,
      rangeWord: 16384,
      targetCenterX: 0,
    }),
    false,
  );
  assert.equal(
    evaluateOriginalTargetRange({ ...base, targetActive: false, targetCenterX: 0 }),
    false,
  );
});

test("replays Gwon inclusive footprint low-WORD boundary", () => {
  const base = {
    targetActive: true,
    attackerClass: 76,
    rangeWord: 1,
    attackerTileX: 0,
    attackerTileY: 0,
    attackerFootprintX: 1,
    attackerFootprintY: 1,
    targetFootprintX: 1,
    targetFootprintY: 1,
    targetTileY: 0,
  };
  assert.equal(
    evaluateOriginalTargetRange({ ...base, targetTileX: 2 }),
    true,
  );
  assert.equal(
    evaluateOriginalTargetRange({ ...base, targetTileX: 3 }),
    false,
  );
  assert.equal(
    evaluateOriginalTargetRange({
      ...base,
      attackerTileX: 32767,
      attackerFootprintX: 1,
      targetTileX: -32768,
    }),
    true,
  );
  assert.equal(
    evaluateOriginalTargetRange({
      ...base,
      targetTileX: 2,
      targetFootprintX: -2,
    }),
    false,
  );
});

test("replays Y-major scan order, exclusions, and no-candidate failure", () => {
  const scan = {
    minX: 0,
    maxX: 2,
    minY: 0,
    maxY: 2,
    currentTargetLowWord: 8,
    cells: [
      {
        x: 2,
        y: 0,
        lowWord: 8,
        active: true,
        relationDiffers: true,
        commandAccepted: true,
      },
      {
        x: 1,
        y: 1,
        lowWord: 9,
        active: true,
        relationDiffers: false,
        commandAccepted: true,
      },
      {
        x: 2,
        y: 1,
        lowWord: 10,
        active: true,
        relationDiffers: true,
        commandAccepted: true,
      },
      {
        x: 0,
        y: 2,
        lowWord: 11,
        active: true,
        relationDiffers: true,
        commandAccepted: true,
      },
    ],
  };
  assert.deepEqual(chooseFirstAutomaticTarget(scan), {
    x: 2,
    y: 1,
    lowWord: 10,
  });
  assert.equal(
    chooseFirstAutomaticTarget({
      ...scan,
      cells: scan.cells.map((cell) => ({ ...cell, commandAccepted: false })),
    }),
    null,
  );
});

test("replays scan scheduling, raw gate, stored-reference age, and direct secondary order", () => {
  assert.equal(
    shouldRunAutomaticTargetScan({
      globalDisableWord: 0,
      actorPhaseWord: -1,
      acceptedStepCounter: 1,
    }),
    true,
  );
  assert.equal(
    shouldRunAutomaticTargetScan({
      globalDisableWord: 1,
      actorPhaseWord: 0,
      acceptedStepCounter: 20,
    }),
    false,
  );
  assert.equal(
    evaluateAutomaticScanGate({
      actorSignedByte8c: 100,
      actorByte1f0: 1,
      surroundingMaskMatch: true,
    }),
    true,
  );
  assert.equal(
    evaluateAutomaticScanGate({
      actorSignedByte8c: 99,
      actorByte1f0: 1,
      surroundingMaskMatch: true,
    }),
    false,
  );

  const storedBase = {
    storedStep: 1000,
    fullReferenceValid: true,
    relationDiffers: true,
    selectedRawModeIsOne: false,
    withinFourCellSeparation: true,
  };
  assert.equal(
    evaluateStoredTargetCandidate({
      ...storedBase,
      acceptedStepCounter: 1199,
    }),
    true,
  );
  assert.equal(
    evaluateStoredTargetCandidate({
      ...storedBase,
      acceptedStepCounter: 1200,
    }),
    false,
  );
  assert.equal(
    evaluateStoredTargetCandidate({
      ...storedBase,
      storedStep: 0x80000000,
      acceptedStepCounter: 0,
    }),
    true,
  );
  assert.equal(
    evaluateStoredTargetCandidate({
      ...storedBase,
      acceptedStepCounter: 1000,
      withinFourCellSeparation: false,
    }),
    false,
  );
  assert.deepEqual(
    chooseFirstRelationDifferentSecondaryListTarget({
      currentFullReference: 0x00010014,
      candidates: [
        {
          fullReference: 0x00010014,
          active: true,
          relationDiffers: true,
          inScanRange: true,
          commandAccepted: true,
        },
        {
          fullReference: 0x00020014,
          active: true,
          relationDiffers: true,
          inScanRange: true,
          commandAccepted: true,
        },
        {
          fullReference: 0x00010016,
          active: true,
          relationDiffers: true,
          inScanRange: true,
          commandAccepted: true,
        },
      ],
    }),
    { index: 1, fullReference: 0x00020014, lowWord: 20 },
  );
  assert.deepEqual(
    chooseFirstRelationDifferentSecondaryListTarget({
      currentFullReference: 0x00010001,
      candidates: [
        {
          fullReference: 0x00010020,
          active: true,
          relationDiffers: true,
          inScanRange: false,
          commandAccepted: true,
        },
        {
          fullReference: 0x00010021,
          active: true,
          relationDiffers: true,
          inScanRange: true,
          commandAccepted: true,
        },
        {
          fullReference: 0x00010022,
          active: true,
          relationDiffers: true,
          inScanRange: true,
          commandAccepted: true,
        },
      ],
    }),
    { index: 1, fullReference: 0x00010021, lowWord: 33 },
  );
});

test("replays missing, movement, arrival, and attack-entry gate transitions", () => {
  assert.deepEqual(
    classifyAttackTargetTransition({
      substate: 1,
      targetPassesLowWordCheck: false,
      inRange: false,
    }),
    { nextSubstate: 1, cancelCommand: true, automaticScan: true },
  );
  assert.deepEqual(
    classifyAttackTargetTransition({
      substate: 1,
      targetPassesLowWordCheck: true,
      inRange: false,
    }),
    { nextSubstate: 4, cancelCommand: false, automaticScan: false },
  );
  assert.deepEqual(
    classifyAttackTargetTransition({
      substate: 1,
      targetPassesLowWordCheck: true,
      inRange: true,
      attackEntryGateReturnedOne: true,
    }),
    {
      nextSubstate: 1,
      cancelCommand: false,
      automaticScan: false,
      attackEntryIntercepted: true,
    },
  );
  assert.deepEqual(
    classifyAttackTargetTransition({
      substate: 4,
      targetPassesLowWordCheck: true,
      inRange: true,
      movementComplete: true,
    }),
    { nextSubstate: 1, cancelCommand: false, automaticScan: false },
  );
  assert.deepEqual(
    classifyAttackTargetTransition({
      substate: 5,
      targetPassesLowWordCheck: true,
      inRange: true,
      movementComplete: true,
      specialFootprintCheck: true,
    }),
    { nextSubstate: 5, cancelCommand: false, automaticScan: false },
  );
});

test("rejects invalid raw inputs, stale analysis, and tampered executable", () => {
  assert.throws(
    () =>
      evaluateOriginalTargetRange({
        targetActive: 1,
        attackerClass: 78,
        rangeWord: 5,
      }),
    /targetActive must be boolean/,
  );
  assert.throws(
    () =>
      chooseFirstAutomaticTarget({
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        currentTargetLowWord: 0,
        cells: [
          {
            x: 0,
            y: 0,
            lowWord: 1,
            active: 1,
            relationDiffers: true,
            commandAccepted: true,
          },
        ],
      }),
    /candidate\.active must be boolean/,
  );
  assert.throws(
    () =>
      evaluateOriginalTargetRange({
        targetActive: true,
        attackerClass: 33,
        rangeWord: 0,
        attackerTileX: 32768,
        attackerTileY: 0,
        mapWidth: 100,
        mapHeight: 100,
        occupiedTargetLowWord: 1,
        targetLowWord: 1,
      }),
    /attackerTileX must be an integer in -32768\.\.32767/,
  );
  assert.throws(
    () =>
      evaluateOriginalTargetRange({
        targetActive: true,
        attackerClass: 33,
        rangeWord: 0,
        attackerTileX: 0,
        attackerTileY: 0,
        mapWidth: 100,
        mapHeight: 100,
        occupiedTargetLowWord: 65535,
        targetLowWord: -1,
      }),
    /occupiedTargetLowWord must be an integer in -32768\.\.32767/,
  );

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-targeting-"));
  try {
    const executablePath = join(temporaryDirectory, "imjinrok2.exe");
    const executable = readFileSync(
      join(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
    );
    executable[0x100] ^= 0xff;
    writeFileSync(executablePath, executable);
    assert.throws(
      () => extractK01HeroTargetingRange({ executablePath }),
      /original EXE SHA-256 mismatch/,
    );

    const seedsPath = join(temporaryDirectory, "seeds.json");
    const seeds = JSON.parse(
      readFileSync(
        join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json"),
        "utf8",
      ),
    );
    seeds.sourceSha256 = "0".repeat(64);
    writeFileSync(seedsPath, JSON.stringify(seeds));
    assert.throws(
      () => extractK01HeroTargetingRange({ seedsPath }),
      /seed analysis .* source SHA-256 mismatch/,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
