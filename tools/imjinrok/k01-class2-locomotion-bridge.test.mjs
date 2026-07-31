import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01Class2LocomotionBridge, replayK01Class2AccumulatorCoordinateCommit } from "./extract-k01-class2-locomotion-bridge.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-class2-locomotion-bridge-vectors.json");
const paths = { executablePath: join(root, "original/imjinrok2/imjinrok2.exe"), seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json") };

test("hash-binds class 2 field writers and the accumulator coordinate commit", () => {
  const report = extractK01Class2LocomotionBridge(paths);
  assert.equal(report.analysisStatus, "static-confirmed-for-bounded-field-lifecycle");
  assert.deepEqual(report.fieldWriters.directWordStores, {
    "0x4ea": ["0x00437dde"],
    "0x4ee": ["0x00437b20", "0x00437e14"],
    "0x4f2": ["0x00425f41", "0x00425f4a", "0x00425f55", "0x00425fa5", "0x00426401", "0x00437b12"],
  });
  assert.match(report.fieldWriters.computedInitializer.operation, /0x558/);
  assert.match(report.accumulatorCoordinateCommit.inputTransform, /trunc\(raw \/ 3\)/);
  assert.match(report.accumulatorCoordinateCommit.commit, /\+0x1bc/);
  assert.equal(report.evidence.evidencePoints.length, 22);
});

test("replays selector-dependent accumulator input, signed clamp, and coordinate commit vectors", () => {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.match(fixture.acceptedReplayScope, /not a coordinate-unit/);
  for (const vector of fixture.vectors) assert.deepEqual(replayK01Class2AccumulatorCoordinateCommit(vector.input), vector.expected, vector.id);
});

test("rejects invalid words, selectors, and tampered static artifacts", (t) => {
  const baseInput = { accumulatorWord: 0, rawInputWord: 0, selectorByte: 0, currentXWord: 0, currentYWord: 0, nextXWord: 0, nextYWord: 0 };
  assert.throws(() => replayK01Class2AccumulatorCoordinateCommit({ ...baseInput, accumulatorWord: -1 }), /accumulatorWord must be an unsigned WORD/);
  assert.throws(() => replayK01Class2AccumulatorCoordinateCommit({ ...baseInput, selectorByte: 256 }), /selectorByte must be an unsigned BYTE/);
  const directory = mkdtempSync(join(tmpdir(), "k01-class2-locomotion-bridge-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredSeedsPath = join(directory, "seeds.json");
  const seeds = JSON.parse(readFileSync(paths.seedsPath, "utf8"));
  seeds.functions.find(({ entry }) => entry === "0x00425af0").instructions.pop();
  writeFileSync(alteredSeedsPath, `${JSON.stringify(seeds)}\n`);
  assert.throws(() => extractK01Class2LocomotionBridge({ ...paths, seedsPath: alteredSeedsPath }), /0x00425af0 instruction count/);
});
