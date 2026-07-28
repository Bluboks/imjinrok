import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import { extractK01StateThreeModeBoundary, replayReachedStateThree } from "./extract-k01-state-three-mode-boundary.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = Object.fromEntries(["executable", "functions", "references", "jumpTables"].map((name) => [
  `${name}Path`, name === "executable" ? resolve(root, "original/imjinrok2/imjinrok2.exe") : resolve(root, `analysis/generated/imjinrok2/${name === "jumpTables" ? "jump-tables" : name}.json`),
]));
const temporaryDirectories = new Set();
after(() => { for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true }); });

test("binds active state three to exact closure, writes, and direct-reference boundary", () => {
  const report = extractK01StateThreeModeBoundary(paths);
  assert.equal(report.analysisStatus, "static-confirmed-bounded-negative-contract");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "none");
  assert.equal(report.source.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(report.functionEvidence.length, 6);
  assert.equal(report.callEdges.length, 7);
  assert.deepEqual(report.closure, { root: "0x00447bc0", count: 1070, entriesSha256: "90f252b91ca3b4acc0e80ba9c8937721249bd28225dd894f552791af68885657" });
  assert.deepEqual(report.stateWrites.entries.map(({ site }) => site), ["0x00447c08", "0x004481f5", "0x0044820f"]);
  assert.equal(report.stateWrites.sha256, "cc3cd3124c0188f28d84d660fc4a21022f76476273ed8e705b5e79739b6807cc");
  assert.deepEqual(report.zeroDirectReferences, [{ target: "0x004bdff4", count: 0 }, { target: "0x00484130", count: 0 }, { target: "0x00485890", count: 0 }]);
  assert.ok(report.codeAnchors.every(({ matched }) => matched));
  assert.match(report.contract.negative, /no direct state-5 writer/);
  assert.match(report.contract.boundary, /not an indirect-call/);
  for (const vector of report.testVectors) assert.deepEqual(vector.result, vector.expected, vector.id);
});

test("replays reached state-three branch order and fixed-width outcomes", () => {
  assert.deepEqual(replayReachedStateThree({ currentStateWord: 3, specialModeWord: 1, get progressCounterDword() { throw new Error("unreachable progress read"); }, get observedProgressDword() { throw new Error("unreachable progress read"); }, get resultWord() { throw new Error("unreachable result read"); } }), { branch: "special", stateWord: 22, write: 22 });
  assert.deepEqual(replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 4, observedProgressDword: 4, get resultWord() { throw new Error("unreachable result read"); } }), { branch: "unchanged-progress", stateWord: 3, write: null });
  assert.deepEqual(replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 5, observedProgressDword: 4, resultWord: 1 }), { branch: "result-one", stateWord: 24, write: 24 });
  assert.deepEqual(replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 5, observedProgressDword: 4, resultWord: 0xffff }), { branch: "result-ffff", stateWord: 26, write: 26 });
  assert.deepEqual(replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 5, observedProgressDword: 4, resultWord: 2 }), { branch: "other-result", stateWord: 3, write: null });
  assert.throws(() => replayReachedStateThree({ currentStateWord: 0x10000, specialModeWord: 0 }), /currentStateWord/);
  assert.throws(() => replayReachedStateThree({ currentStateWord: 3, specialModeWord: -1 }), /specialModeWord/);
  assert.throws(() => replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: -1, observedProgressDword: 0 }), /progressCounterDword/);
  assert.throws(() => replayReachedStateThree({ currentStateWord: 3, specialModeWord: 0, progressCounterDword: 1, observedProgressDword: 0, resultWord: 0x10000 }), /resultWord/);
});

test("rejects independently tampered and stale provenance artifacts", () => {
  const functionsPath = tamper(paths.functionsPath, "3c4ad59801dd66dcb03339fb810c187160b58ccdc18848f6e80ee39bd77b4d91", "0".repeat(64));
  assert.throws(() => extractK01StateThreeModeBoundary({ ...paths, functionsPath }), /functions artifact SHA-256/);
  const referencesPath = tamper(paths.referencesPath, '"to": "0x004bdfc8"', '"to": "0x004bdfc9"');
  assert.throws(() => extractK01StateThreeModeBoundary({ ...paths, referencesPath }), /references artifact SHA-256/);
  const jumpTablesPath = tamper(paths.jumpTablesPath, '"destination": "0x0045fd5d"', '"destination": "0x0045fd5e"');
  assert.throws(() => extractK01StateThreeModeBoundary({ ...paths, jumpTablesPath }), /jump tables artifact SHA-256/);
  const staleFunctionsPath = tamper(paths.functionsPath, '"sourceSha256": "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e"', '"sourceSha256": "0000000000000000000000000000000000000000000000000000000000000000"');
  assert.throws(() => extractK01StateThreeModeBoundary({ ...paths, functionsPath: staleFunctionsPath }), /functions artifact SHA-256/);
});

function tamper(source, expected, replacement) { assert.equal(expected.length, replacement.length); const directory = mkdtempSync(join(tmpdir(), "k01-state-three-mode-")); temporaryDirectories.add(directory); const destination = join(directory, "artifact.json"); const text = readFileSync(source, "utf8"); assert.ok(text.includes(expected)); writeFileSync(destination, text.replace(expected, replacement)); return destination; }
