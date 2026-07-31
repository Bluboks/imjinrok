import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractSourceFogVisibilityLifecycle, replaySourceFogVisibilityLifecycle, selectedPatternCells } from "./extract-source-fog-visibility-lifecycle.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = { executablePath: join(root, "original/imjinrok2/imjinrok2.exe"), functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"), referencesPath: join(root, "analysis/generated/imjinrok2/references.json"), seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json") };
const fixturePath = join(root, "analysis/fixtures/source-fog-visibility-lifecycle.json");

test("extracts the byte-bound source fog lifecycle fixture deterministically", () => {
  const fixture = readFileSync(fixturePath, "utf8");
  const first = `${JSON.stringify(extractSourceFogVisibilityLifecycle(paths), null, 2)}\n`;
  const second = `${JSON.stringify(extractSourceFogVisibilityLifecycle(paths), null, 2)}\n`;
  assert.equal(first, fixture);
  assert.equal(second, fixture);
  const report = JSON.parse(first);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.storage.fogState.address, "0x007d4d5e");
  assert.equal(report.storage.dirty.address, "0x007dcbee");
  assert.deepEqual(report.lifecycle.transitions, [{ from: 4, to: 0, dirty: 1, when: "modeArgumentWord==1 && objectField1ec==1" }, { from: 0, to: 4, dirty: 1, when: "modeArgumentWord==1 && objectField1ec!=1" }]);
  assert.equal(report.lifecycle.reveal.patterns.length, 12);
  assert.match(report.rendererCrossCheck.fact, /literal states 4 and 8/);
});

test("replays initialization, both aging branches, matching-owner selection, one-shot selection, and bounds", () => {
  const report = extractSourceFogVisibilityLifecycle(paths);
  for (const vector of report.vectors.filter((vector) => vector.id !== "selector-radius-cell-counts" && vector.id !== "initialize-180-square-to-eight")) assert.deepEqual(replaySourceFogVisibilityLifecycle(vector.input), vector.expected, vector.id);
  assert.equal(selectedPatternCells(0, 10, 10).length, 21);
  assert.equal(selectedPatternCells(1, 10, 10).length, 21);
  assert.equal(selectedPatternCells(2, 10, 10).length, 21);
  assert.equal(selectedPatternCells(11, 10, 10).length, 339);
  assert.equal(selectedPatternCells(12, 10, 10).length, 339);
});

test("fails closed for malformed sparse lifecycle inputs", () => {
  const base = { globalGateWord: 0, modeArgumentWord: 1, objectField1ec: 1, mapWidth: 20, mapHeight: 20, localPlayerIdentity: 3, cells: [], entities: [] };
  assert.throws(() => replaySourceFogVisibilityLifecycle({ ...base, cells: null }), /cells must be an array/);
  assert.throws(() => replaySourceFogVisibilityLifecycle({ ...base, cells: [{ x: 20, y: 0, state: 8 }] }), /outside map bounds/);
  assert.throws(() => replaySourceFogVisibilityLifecycle({ ...base, entities: [{ x: 0, y: 0, ownerOrFaction: 3, sightSelector: 1.5, oneShotSightLatch: 0 }] }), /unsigned WORD/);
  assert.throws(() => replaySourceFogVisibilityLifecycle({ ...base, objectField1ec: -1 }), /unsigned DWORD/);
  assert.throws(() => selectedPatternCells(-1, 0, 0), /unsigned WORD/);
  assert.deepEqual(replaySourceFogVisibilityLifecycle({ ...base, entities: [{ x: -1, y: 0, ownerOrFaction: 3, sightSelector: 2, oneShotSightLatch: 0 }] }).entityResults, [{ index: 0, outcome: "out-of-bounds", selector: null, oneShotSightLatch: 0 }]);
});

test("rejects tampered static inputs before report emission", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "source-fog-visibility-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, source, key] of [["exe", paths.executablePath, "executablePath"], ["functions", paths.functionsPath, "functionsPath"], ["references", paths.referencesPath, "referencesPath"], ["seeds", paths.seedsPath, "seedsPath"]]) {
    const target = join(directory, name); const bytes = readFileSync(source); bytes[bytes.length - 1] ^= 1; writeFileSync(target, bytes);
    assert.throws(() => extractSourceFogVisibilityLifecycle({ ...paths, [key]: target }), /SHA-256 mismatch/);
  }
});

test("CLI output is deterministic with explicit source override", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "source-fog-visibility-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const copied = join(directory, "imjinrok2.exe"); writeFileSync(copied, readFileSync(paths.executablePath));
  const command = [join(root, "tools/imjinrok/extract-source-fog-visibility-lifecycle.mjs"), "--executable", copied];
  const first = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8" }); const second = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr); assert.equal(first.stdout, second.stdout);
});
