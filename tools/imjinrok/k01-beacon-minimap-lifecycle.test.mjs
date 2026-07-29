import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01BeaconMinimapLifecycle,
  compactMapPrimaryGateAllows,
  replayBeaconFlagLifecycle,
  resetFlagAtStandardMissionEntry,
} from "./extract-k01-beacon-minimap-lifecycle.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
};
const fixture = JSON.parse(readFileSync(join(root, "analysis/fixtures/k01-beacon-minimap-lifecycle.json"), "utf8"));

test("keeps the overall rule unresolved while refuting the one-shot beacon-flag gate hypothesis", () => {
  const report = extractK01BeaconMinimapLifecycle(paths);
  assert.deepEqual(pick(report), fixture);
  assert.equal(report.classification, "still-unresolved");
  assert.match(report.classificationReason, /producers remain unresolved/);
  assert.equal(report.beaconFlagHypothesis.classification, "refuted");
  assert.equal(report.flagLifecycle.directReferenceSet.length, 3);
  assert.match(report.flagLifecycle.clearerOnDestructionOrRemoval, /none/);
  assert.match(report.flagLifecycle.nativeEffectsBoundary, /not classified as minimap or fog-of-war/);
  assert.equal(report.compactMapDrawControl.mode.directReferenceSet.length, 3);
  assert.equal(report.compactMapDrawControl.redrawRequest.directReferenceSet.length, 3);
  assert.match(report.compactMapDrawControl.renderer.beaconInputBoundary, /only 0x0048a5c0/);
  assert.equal(report.compactMapDrawControl.helpers.terrainMapCellByteWriter.entry, "0x004abbc0");
  assert.equal(report.compactMapDrawControl.helpers.activeEntityMarkerProjection.entry, "0x004abe50");
  assert.match(report.compactMapDrawControl.helpers.activeEntityMarkerProjection.projection, /0x0044ba50/);
  assert.ok(report.evidence.every(({ bytes }) => bytes.length > 0));
});

test("replays zero, first, multiple, stale, inactive, and reset vectors", () => {
  for (const vector of fixture.vectors) {
    const actual = vector.id === "standard-entry-reset-clears-stale-word"
      ? { finalFlagWord: resetFlagAtStandardMissionEntry(vector.input.value) }
      : vector.id.startsWith("compact-map-primary-gate-")
        ? { allowsRenderControl: compactMapPrimaryGateAllows(vector.input) }
        : replayBeaconFlagLifecycle(vector.input);
    assert.deepEqual(actual, vector.expected, vector.id);
  }
  assert.deepEqual(
    replayBeaconFlagLifecycle({ initialFlagWord: 2, records: [] }),
    { finalFlagWord: 2, events: [{ kind: "initial-flag-nonzero-skip" }] },
  );
});

test("rejects malformed flag and record inputs", () => {
  for (const value of [-1, 0x10000, 1.5]) {
    assert.throws(() => replayBeaconFlagLifecycle({ initialFlagWord: value, records: [] }), /unsigned WORD/);
    assert.throws(() => resetFlagAtStandardMissionEntry(value), /unsigned WORD/);
  }
  assert.throws(() => replayBeaconFlagLifecycle({ initialFlagWord: 0, records: null }), /records must be an array/);
  assert.throws(() => replayBeaconFlagLifecycle({ initialFlagWord: 0, records: [null] }), /records\[0\] must be an object/);
  assert.throws(() => compactMapPrimaryGateAllows({ playerRecordGateWord: -1, globalGateWord: 0 }), /unsigned WORD/);
});

test("rejects tampered source-bound artifacts", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-beacon-minimap-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, source, key] of [
    ["exe", paths.executablePath, "executablePath"],
    ["functions", paths.functionsPath, "functionsPath"],
    ["references", paths.referencesPath, "referencesPath"],
    ["seeds", paths.seedsPath, "seedsPath"],
  ]) {
    const target = join(directory, name);
    const bytes = readFileSync(source);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(target, bytes);
    assert.throws(() => extractK01BeaconMinimapLifecycle({ ...paths, [key]: target }), /SHA-256 mismatch/);
  }
});

test("CLI output is deterministic with an explicit source override", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-beacon-minimap-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = join(directory, "imjinrok2.exe");
  writeFileSync(executable, readFileSync(paths.executablePath));
  const command = [join(root, "tools/imjinrok/extract-k01-beacon-minimap-lifecycle.mjs"), "--executable", executable];
  const first = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8" });
  const second = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
});

function pick(report) {
  const compact = ({ size, sha256, sourceSha256 }) => ({ size, sha256, sourceSha256 });
  return {
    classification: report.classification,
    analysisStatus: report.analysisStatus,
    reproductionStatus: report.reproductionStatus,
    implementationStatus: report.implementationStatus,
    sources: {
      executable: { size: report.sources.executable.size, sha256: report.sources.executable.sha256 },
      functions: compact(report.sources.functions),
      references: compact(report.sources.references),
      seeds: compact(report.sources.seeds),
    },
    analyzedFunctions: report.analyzedFunctions,
    searchTrail: report.searchTrail,
    flagLifecycle: {
      address: report.flagLifecycle.address,
      width: report.flagLifecycle.width,
      writer: report.flagLifecycle.writer,
      initializerReset: report.flagLifecycle.initializerReset,
      clearerOnDestructionOrRemoval: report.flagLifecycle.clearerOnDestructionOrRemoval,
      directReferenceSet: report.flagLifecycle.directReferenceSet,
      directConsumer: report.flagLifecycle.directConsumer,
    },
    beaconFlagHypothesis: report.beaconFlagHypothesis,
    compactMapDrawControl: report.compactMapDrawControl,
    vectors: report.vectors,
  };
}
