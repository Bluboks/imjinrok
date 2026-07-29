import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import { extractK01ModeDirectWriters, replayModeCleanup, replayModeRoutine } from "./extract-k01-mode-direct-writers.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = Object.fromEntries(["executable", "functions", "references", "jumpTables"].map((name) => [`${name}Path`, name === "executable" ? resolve(root, "original/imjinrok2/imjinrok2.exe") : resolve(root, `analysis/generated/imjinrok2/${name === "jumpTables" ? "jump-tables" : name}.json`)]));
const temporaryDirectories = new Set();
after(() => { for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true }); });

test("binds the complete canonical scheduler mode write set and source-bound arg-two path", () => {
  const report = extractK01ModeDirectWriters(paths);
  assert.equal(report.analysisStatus, "static-confirmed-bounded-negative-contract"); assert.equal(report.reproductionStatus, "reproduction-complete"); assert.equal(report.implementationStatus, "none");
  assert.equal(report.source.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e"); assert.equal(report.functionEvidence.length, 7); assert.equal(report.callEdges.length, 6);
  assert.deepEqual(report.directModeWrites.entries.map(({ site }) => site), ["0x00446483", "0x00460377", "0x0047331c", "0x00481e89", "0x0048591a", "0x00485942"]); assert.equal(report.directModeWrites.sha256, "ed5440303ed3a488de53bbc998f83bb67e1154c91f3f618269557de11574eb62");
  assert.deepEqual(report.a5070Closure, { root: "0x004a5070", count: 133, entriesSha256: "7404706e0ac5459e9b0ba112ab3bd238d77c1bb25696d239306335769916938b", modeWrites: [{ site: "0x0048591a", caller: "0x00485890", target: "0x00c06e20", type: "WRITE" }, { site: "0x00485942", caller: "0x00485890", target: "0x00c06e20", type: "WRITE" }] });
  assert.ok(report.codeAnchors.every(({ matched }) => matched)); assert.match(report.contract.a5070, /argument two/); assert.match(report.contract.boundary, /Direct references/);
  for (const vector of report.testVectors) assert.deepEqual(vector.result, vector.expected, vector.id);
});

test("replays exact-one cleanup and mode-routine observable events", () => {
  for (const writer of ["shared-teardown", "state-23-target-10", "scheduler-timeout", "large-cleanup"]) assert.deepEqual(replayModeCleanup({ writer, modeWord: 1 }), { modeWord: 0, events: [{ kind: "call", target: "0x00474ae0" }, { kind: "write-word", address: "0x00c06e20", value: 0 }] });
  assert.deepEqual(replayModeCleanup({ writer: "scheduler-timeout", modeWord: 1, reached: false }), { modeWord: 1, events: [] });
  assert.deepEqual(replayModeRoutine({ previousModeWord: 0, guardWord: 0, argumentWord: 1, resultFlagWord: 7 }), { modeWord: 1, events: [{ kind: "write-word", address: "0x00c06e20", value: 1 }, { kind: "write-word", address: "0x00bccc44", value: 7 }] });
  assert.deepEqual(replayModeRoutine({ previousModeWord: 1, guardWord: 0xffff, argumentWord: 1 }), { modeWord: 0, events: [{ kind: "write-word", address: "0x00c06e20", value: 0 }] });
  assert.deepEqual(replayModeRoutine({ previousModeWord: 1, guardWord: 0, argumentWord: 2 }), { modeWord: 1, events: [{ kind: "tail-jump", target: "0x00474ae0" }] });
  assert.deepEqual(replayModeRoutine({ previousModeWord: 1, guardWord: 1, argumentWord: 2 }), { modeWord: 1, events: [] });
  assert.throws(() => replayModeCleanup({ writer: "unknown", modeWord: 1 }), /unsupported cleanup writer/); assert.throws(() => replayModeRoutine({ previousModeWord: 0x10000, guardWord: 0, argumentWord: 1 }), /previousModeWord/); assert.throws(() => replayModeRoutine({ previousModeWord: 0, guardWord: 0, argumentWord: -1 }), /argumentWord/);
});

test("rejects tampered and stale provenance artifacts", () => {
  const functionsPath = tamper(paths.functionsPath, "1a170bc0fc85185f325fbca82a3f4d0f6c482c55f1858464d0cb5862c4dd006e", "0".repeat(64)); assert.throws(() => extractK01ModeDirectWriters({ ...paths, functionsPath }), /functions artifact SHA-256/);
  const referencesPath = tamper(paths.referencesPath, '"to": "0x00c06e20"', '"to": "0x00c06e21"'); assert.throws(() => extractK01ModeDirectWriters({ ...paths, referencesPath }), /references artifact SHA-256/);
  const jumpTablesPath = tamper(paths.jumpTablesPath, '"destination": "0x004602db"', '"destination": "0x004602dc"'); assert.throws(() => extractK01ModeDirectWriters({ ...paths, jumpTablesPath }), /jump tables artifact SHA-256/);
  const staleFunctionsPath = tamper(paths.functionsPath, '"sourceSha256": "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e"', '"sourceSha256": "0000000000000000000000000000000000000000000000000000000000000000"'); assert.throws(() => extractK01ModeDirectWriters({ ...paths, functionsPath: staleFunctionsPath }), /functions artifact SHA-256/);
});
function tamper(source, expected, replacement) { assert.equal(expected.length, replacement.length); const directory = mkdtempSync(join(tmpdir(), "k01-mode-direct-writers-")); temporaryDirectories.add(directory); const destination = join(directory, "artifact.json"); const text = readFileSync(source, "utf8"); assert.ok(text.includes(expected)); writeFileSync(destination, text.replace(expected, replacement)); return destination; }
