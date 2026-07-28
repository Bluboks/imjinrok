import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import { extractK01ModeReachability, replayK01StageOneLifecycle, replayModeWriter } from "./extract-k01-mode-reachability.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = Object.fromEntries(["executable", "functions", "references", "jumpTables", "seeds"].map((name) => [
  `${name}Path`, name === "executable" ? resolve(root, "original/imjinrok2/imjinrok2.exe") : resolve(root, `analysis/generated/imjinrok2/${name === "jumpTables" ? "jump-tables" : name}.json`),
]));
const temporaryDirectories = new Set();
after(() => { for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true }); });

test("binds EBX, guard writers, and K01 state-one continuation to static inputs", () => {
  const report = extractK01ModeReachability(paths);
  assert.equal(report.analysisStatus, "static-confirmed-partial-negative-contract");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.source.byteLength, 843833);
  assert.equal(report.functionEvidence.length, 9);
  assert.equal(report.callEdges.length, 5);
  assert.deepEqual(report.guardDirectWrites.map(({ site }) => site), ["0x0045fbfc", "0x00474845", "0x00474929", "0x00486585", "0x004865ca"]);
  assert.ok(report.codeAnchors.every(({ matched }) => matched));
  assert.match(report.k01Lifecycle.result, /not assigned scheduler mode 0 or 1/);
  assert.match(report.k01Lifecycle.firstUnresolvedEdge, /state 3 to raw main state 5/);
  for (const vector of report.testVectors) assert.deepEqual(vector.result, vector.expected, vector.id);
});

test("replays WORD guard, low-WORD EBX, no-write, and stage boundaries", () => {
  assert.deepEqual(replayModeWriter({ previousModeWord: 0, guardWord: 0, argumentDword: 1 }), { invoked: true, argumentWord: 1, modeWord: 1, write: 1 });
  assert.deepEqual(replayModeWriter({ previousModeWord: 1, guardWord: 2, argumentDword: 1 }), { invoked: true, argumentWord: 1, modeWord: 0, write: 0 });
  assert.equal(replayModeWriter({ previousModeWord: 1, guardWord: 0, argumentDword: 2 }).write, null);
  assert.equal(replayModeWriter({ previousModeWord: 1, guardWord: 0, argumentDword: 0x10001 }).modeWord, 1);
  assert.deepEqual(replayK01StageOneLifecycle({ mainStateWord: 1, stageWord: 1 }), { stageEntryReached: true, stageOneCaseReached: true, nextMainStateWord: 3, schedulerReached: true, modeRoutineReached: false });
  assert.throws(() => replayModeWriter({ previousModeWord: 0x10000, guardWord: 0, argumentDword: 1 }), /previousModeWord/);
  assert.throws(() => replayK01StageOneLifecycle({ mainStateWord: 1, stageWord: -1 }), /stageWord/);
});

test("rejects independently tampered and stale provenance artifacts", () => {
  const functionsPath = tamper(paths.functionsPath, "d44b4995e2906aa527ee362b7f6aee774bef7cd3fdf966aabc09a5fefdd13b73", "0".repeat(64));
  assert.throws(() => extractK01ModeReachability({ ...paths, functionsPath }), /functions artifact SHA-256/);
  const referencesPath = tamper(paths.referencesPath, '"to": "0x00484130"', '"to": "0x00484131"');
  assert.throws(() => extractK01ModeReachability({ ...paths, referencesPath }), /references artifact SHA-256/);
  const jumpTablesPath = tamper(paths.jumpTablesPath, '"destination": "0x0046005c"', '"destination": "0x0046005d"');
  assert.throws(() => extractK01ModeReachability({ ...paths, jumpTablesPath }), /jump tables artifact SHA-256/);
  const seedsPath = jsonCopy(paths.seedsPath, (artifact) => { artifact.sourceSha256 = "0".repeat(64); });
  assert.throws(() => extractK01ModeReachability({ ...paths, seedsPath }), /seeds artifact byte length/);
});

function tamper(source, expected, replacement) { assert.equal(expected.length, replacement.length); const directory = mkdtempSync(join(tmpdir(), "k01-mode-reachability-")); temporaryDirectories.add(directory); const destination = join(directory, "artifact.json"); const text = readFileSync(source, "utf8"); assert.ok(text.includes(expected)); writeFileSync(destination, text.replace(expected, replacement)); return destination; }
function jsonCopy(source, mutate) { const directory = mkdtempSync(join(tmpdir(), "k01-mode-reachability-")); temporaryDirectories.add(directory); const destination = join(directory, "artifact.json"); const artifact = JSON.parse(readFileSync(source, "utf8")); mutate(artifact); writeFileSync(destination, `${JSON.stringify(artifact)}\n`); return destination; }
