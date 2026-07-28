import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import { extractK01StateThreeConsumerBridge, mapRaw23PollOutcome, replayRaw23Bridge, replayStateThreeConsumers } from "./extract-k01-state-three-consumer-bridge.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = Object.fromEntries(["executable", "functions", "references", "jumpTables"].map((name) => [`${name}Path`, name === "executable" ? resolve(root, "original/imjinrok2/imjinrok2.exe") : resolve(root, `analysis/generated/imjinrok2/${name === "jumpTables" ? "jump-tables" : name}.json`)]));
const temporaryDirectories = new Set();
after(() => { for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true }); });

test("binds post-state-three direct consumers to state tables and existing result relay", () => {
  const report = extractK01StateThreeConsumerBridge(paths);
  assert.equal(report.analysisStatus, "static-confirmed-bounded-negative-contract");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "none");
  assert.equal(report.source.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(report.functionEvidence.length, 7);
  assert.equal(report.callEdges.length, 14);
  assert.deepEqual(report.stateSwitches.rawStates, [22, 23, 24, 25, 26, 27]);
  assert.deepEqual(report.stateSwitches.pollReturnDomain, [0, 3, 8, 10, 32]);
  assert.deepEqual(report.linkedContracts.stateThreeWrites.entries.map(({ site }) => site), ["0x00447c08", "0x004481f5", "0x0044820f"]);
  assert.match(report.linkedContracts.finalResultRelay, /0x8c/);
  assert.match(report.contract.bridge, /does not write or dispatch raw state 5/);
  assert.match(report.contract.boundary, /FUN_004a5070/);
  assert.ok(report.codeAnchors.every(({ matched }) => matched));
  for (const vector of report.testVectors) assert.deepEqual(vector.result, vector.expected, vector.id);
});

test("replays scheduler short-circuit, exact raw23 source domain, and result consumers", () => {
  assert.deepEqual(replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 1, stateAfterSchedulerWord: 26, pollSourceOutcomeDword: 32 }), { currentStateWord: 26, targetStateWord: undefined, schedulerCalled: true, pollOutcome: 32, dispatchSkipped: true });
  assert.equal(replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, get stateAfterSchedulerWord() { throw new Error("scheduler did not run"); }, pollSourceOutcomeDword: 0 }).currentStateWord, 23);
  assert.deepEqual([3, 8, 10, 32, 31, 0xffffffff].map(mapRaw23PollOutcome), [3, 8, 10, 32, 0, 0]);
  assert.deepEqual(replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, pollSourceOutcomeDword: 8, externalModeDword: 0 }), { currentStateWord: 0x8c, targetStateWord: 1, schedulerCalled: false, pollOutcome: 8, dispatchSkipped: false, branch: "source-8-fallthrough" });
  assert.deepEqual(replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, pollSourceOutcomeDword: 32 }), { currentStateWord: 0x8c, targetStateWord: 1, schedulerCalled: false, pollOutcome: 32, dispatchSkipped: false, branch: "source-32" });
  assert.deepEqual(replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, pollSourceOutcomeDword: 10, raw634ac0: 0, rawC06e38: 0 }), { currentStateWord: 0x8c, targetStateWord: 10, schedulerCalled: false, pollOutcome: 10, dispatchSkipped: false, branch: "source-10-0a" });
  assert.deepEqual(replayStateThreeConsumers({ currentStateWord: 27, presentationPollResultEax: 1 }), { currentStateWord: 0x8c, targetStateWord: 0x1c, branch: "presentation-complete" });
  assert.throws(() => replayRaw23Bridge({ currentStateWord: 0x10000, schedulerModeWord: 0, pollSourceOutcomeDword: 0 }), /currentStateWord/);
  assert.throws(() => replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 2, pollSourceOutcomeDword: -1 }), /sourceOutcomeDword/);
  assert.throws(() => replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, pollSourceOutcomeDword: 8, externalModeDword: 1, progressCounterDword: -1 }), /progressCounterDword/);
  assert.throws(() => replayStateThreeConsumers({ currentStateWord: 25, presentationPollResultEax: -1 }), /pollResultEax/);
});

test("rejects tampered and stale provenance artifacts on custom API paths", () => {
  const functionsPath = tamper(paths.functionsPath, "7fb4f74394b9f113ca0da3a2fbba16e877572eb06411e733d53cee4c4a30b290", "0".repeat(64));
  assert.throws(() => extractK01StateThreeConsumerBridge({ ...paths, functionsPath }), /functions artifact SHA-256/);
  const referencesPath = tamper(paths.referencesPath, '"to": "0x00449090"', '"to": "0x00449091"');
  assert.throws(() => extractK01StateThreeConsumerBridge({ ...paths, referencesPath }), /references artifact SHA-256/);
  const jumpTablesPath = tamper(paths.jumpTablesPath, '"destination": "0x004602db"', '"destination": "0x004602dc"');
  assert.throws(() => extractK01StateThreeConsumerBridge({ ...paths, jumpTablesPath }), /jump tables artifact SHA-256/);
  const staleFunctionsPath = tamper(paths.functionsPath, '"sourceSha256": "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e"', '"sourceSha256": "0000000000000000000000000000000000000000000000000000000000000000"');
  assert.throws(() => extractK01StateThreeConsumerBridge({ ...paths, functionsPath: staleFunctionsPath }), /functions artifact SHA-256/);
});

function tamper(source, expected, replacement) { assert.equal(expected.length, replacement.length); const directory = mkdtempSync(join(tmpdir(), "k01-state-three-bridge-")); temporaryDirectories.add(directory); const destination = join(directory, "artifact.json"); const text = readFileSync(source, "utf8"); assert.ok(text.includes(expected)); writeFileSync(destination, text.replace(expected, replacement)); return destination; }
