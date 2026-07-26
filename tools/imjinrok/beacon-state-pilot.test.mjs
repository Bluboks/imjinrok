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
  BEACON_IDENTITY,
  EXPECTED_BEACON_SPRITE_SHA256,
  extractBeaconStatePilot,
  selectBeaconBodyFrame,
  selectBeaconConstructionFrame,
} from "./extract-beacon-state-pilot.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("statically binds the Korean beacon to firehousek and generic building body states", () => {
  const report = extractBeaconStatePilot();

  assert.equal(
    report.evidenceStatus,
    "static-proven-for-korean-beacon-body-states",
  );
  assert.deepEqual(
    {
      internalClass: report.identity.internalClass,
      originalGameplayName: report.identity.originalGameplayName,
      spriteSlot: report.identity.spriteSlot,
      sourcePath: report.identity.sourcePath,
      baseFrame: report.identity.baseFrame,
      flags: report.identity.flags,
      classSwitchDestination:
        report.identity.classSwitchDestination,
    },
    {
      internalClass: 52,
      originalGameplayName: "조선 봉화대",
      spriteSlot: 113,
      sourcePath: "char\\firehousek.spr",
      baseFrame: 7,
      flags: "0x00310002",
      classSwitchDestination: "0x004292ba",
    },
  );
  assert.deepEqual(report.sources.sprite, {
    path: "original/imjinrok2/char/firehousek.spr",
    embeddedPath: BEACON_IDENTITY.sourcePath,
    sha256: EXPECTED_BEACON_SPRITE_SHA256,
    width: 114,
    height: 108,
    frameCount: 16,
  });
  assert.deepEqual(
    report.construction.phaseThresholdPercentages,
    [0, 10, 20, 30, 40, 50, 70, 100],
  );
  assert.equal(
    report.sources.jumpTables.sourceSha256,
    report.sources.executable.executableSha256,
  );
  assert.equal(report.completedBody.healthyFrame, 7);
  assert.equal(report.completedBody.damagedFrame, 8);
});

test("selects exact beacon construction and health boundary frames", () => {
  assert.deepEqual(
    [
      0, 9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 69, 70, 99,
      100,
    ].map((constructionPercent) => [
      constructionPercent,
      selectBeaconConstructionFrame(constructionPercent),
    ]),
    [
      [0, 0],
      [9, 0],
      [10, 1],
      [19, 1],
      [20, 2],
      [29, 2],
      [30, 3],
      [39, 3],
      [40, 4],
      [49, 4],
      [50, 5],
      [69, 5],
      [70, 6],
      [99, 6],
      [100, 7],
    ],
  );
  assert.equal(
    selectBeaconBodyFrame({
      constructionPercent: 100,
      maximumHealth: 760,
      currentHealth: 380,
    }).frameIndex,
    7,
  );
  assert.equal(
    selectBeaconBodyFrame({
      constructionPercent: 100,
      maximumHealth: 760,
      currentHealth: 379,
    }).frameIndex,
    8,
  );
  assert.throws(
    () => selectBeaconConstructionFrame(101),
    /outside integer range 0\.\.100/,
  );
});

test("rejects jump-table analysis produced from another executable", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "beacon-state-pilot-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const jumpTables = JSON.parse(
    readFileSync(
      join(
        repositoryRoot,
        "analysis/generated/imjinrok2/jump-tables.json",
      ),
      "utf8",
    ),
  );
  jumpTables.sourceSha256 = "0".repeat(64);
  const jumpTablesPath = join(temporaryDirectory, "jump-tables.json");
  writeFileSync(jumpTablesPath, `${JSON.stringify(jumpTables)}\n`);

  assert.throws(
    () => extractBeaconStatePilot({ jumpTablesPath }),
    /source SHA-256 mismatch/,
  );
});
