import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01TurtleTankActionReachability, replayTurtleTankActionFiveReachability } from "./extract-k01-turtle-tank-action-reachability.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: resolve(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(root, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: resolve(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: resolve(root, "analysis/generated/imjinrok2/seeds.json"),
};

test("binds every action-five wrapper reachability edge to the canonical original", () => {
  const report = extractK01TurtleTankActionReachability(paths);
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "none-analysis-only");
  assert.equal(report.source.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(report.functionEvidence.length, 9);
  assert.equal(report.callEdges.length, 14);
  assert.ok(report.codeAnchors.every(({ matched }) => matched));
  assert.deepEqual(report.localActionSelectors.cases, { 1: "0x00416d3a", 2: "0x00417359", 3: "0x00417333", 4: "0x004171e3", 5: "0x0041729c" });
  assert.deepEqual(report.precheckModes.values.filter(({ mode }) => mode !== 4), [
    { value: 5, mode: 0 }, { value: 15, mode: 1 }, { value: 24, mode: 2 }, { value: 37, mode: 3 },
  ]);
  assert.equal(report.class14.rawFlags, "0x80143205");
  assert.equal(report.turnWrapper.ringCallee, "0x004381c0");
});

test("reproduces reaching, no-op, guard, and wrapper-return branches", () => {
  assert.deepEqual(replayTurtleTankActionFiveReachability({ action: 4, localSelector: 1, route: "precheck" }), {
    wrapperCalls: 0, invokesRing: false, path: "action-not-five", wrapperReturn: null, continuation: "no-wrapper",
  });
  assert.deepEqual(replayTurtleTankActionFiveReachability({ localSelector: 1, route: "precheck", precheckMode: 15 }), {
    wrapperCalls: 1, invokesRing: true, path: "precheck-mode-15", wrapperReturn: 0, continuation: "wrapper-returned-zero",
  });
  assert.equal(replayTurtleTankActionFiveReachability({ localSelector: 1, route: "precheck", precheckMode: 6, precheckE8: 1, targetMatches11a: false }).path, "precheck-fallback-e8-target-mismatch");
  assert.equal(replayTurtleTankActionFiveReachability({ localSelector: 4, route: "movement", steeringDirectionNonzero: false }).path, "normal-movement-zero-steering-direction");
  assert.deepEqual(replayTurtleTankActionFiveReachability({ localSelector: 4, route: "movement", flags: 0x8014320d }), {
    wrapperCalls: 1, invokesRing: true, path: "movement-bit-0x08-variant", wrapperReturn: 0, continuation: "wrapper-returned-zero",
  });
  assert.equal(replayTurtleTankActionFiveReachability({ localSelector: 5, route: "movement", wrapperReturn: 1 }).continuation, "wrapper-returned-nonzero");
  assert.equal(replayTurtleTankActionFiveReachability({ localSelector: 2, route: "movement" }).path, "local-selector-has-no-wrapper-call");
  assert.deepEqual(replayTurtleTankActionFiveReachability({ localSelector: 5, route: "movement", flags: 1 }), {
    wrapperCalls: 1, invokesRing: false, path: "normal-movement-nonzero-steering-direction", wrapperReturn: 0, continuation: "wrapper-returned-zero",
  });
});

test("rejects source-bound function and call-edge evidence tampering", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-turtle-action-reachability-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const functions = JSON.parse(readFileSync(paths.functionsPath, "utf8"));
  functions.functions.find(({ entry }) => entry === "0x00416ad0").instructionSha256 = "0".repeat(64);
  const functionsPath = writeJson(directory, "functions.json", functions);
  assert.throws(() => extractK01TurtleTankActionReachability({ ...paths, functionsPath }), /0x00416ad0 instruction SHA-256/);
  const references = JSON.parse(readFileSync(paths.referencesPath, "utf8"));
  references.references.find(({ from, to }) => from === "0x004172a3" && to === "0x00425af0").to = "0x00425af1";
  const referencesPath = writeJson(directory, "references.json", references);
  assert.throws(() => extractK01TurtleTankActionReachability({ ...paths, referencesPath }), /0x004172a3/);
});

function writeJson(directory, name, value) { const path = join(directory, name); writeFileSync(path, `${JSON.stringify(value)}\n`); return path; }
