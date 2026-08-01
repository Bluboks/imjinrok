import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_K0110_SHA256,
  extractChangeTitleConsumerEvidence,
  reproduceChangeTitleLifecycle,
  reproduceChangeTitleTeardown,
  reproduceDirectTitleLoadGate,
} from "./extract-changetitle-consumer-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  scriptPath: join(root, "original/imjinrok2/script/K0110"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
};
const fixture = JSON.parse(readFileSync(join(root, "analysis/fixtures/changetitle-consumer-evidence-vectors.json"), "utf8"));

test("binds CHANGETITLE vectors to the exact EXE and K0110", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceK0110Sha256, EXPECTED_K0110_SHA256);
});

test("recovers CHANGETITLE command, owner lifecycle, and unresolved sprite consumer", () => {
  const report = extractChangeTitleConsumerEvidence(paths);
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "scoped-reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only-no-production-change");
  assert.equal(report.rawCodeRanges.length, 14);
  assert.equal(report.functionCatalog.length, 14);
  assert.equal(report.evidencePoints.length, 11);
  assert.equal(report.referenceProjections.length, 14);
  assert.deepEqual(report.commandMapping, { CHANGETITLE: 1, SETDELAYTIME: 3, OBJECTIVE: 7, TITLE: 9 });
  assert.equal(report.k0110.changeTitleCount, 12);
  assert.equal(report.k0110.preFirstSpeech.length, 28);
  assert.equal(report.ownerResource.image, "owner+0xc14 (resourceBase+0xbf4)");
  assert.match(report.compositor.spriteConsumer, /unresolved/u);
  assert.match(report.loadFailure.missingOrMalformedSource, /record is consumed/u);
});

test("reproduces replacement, failed-load, direct-gate, and teardown vectors", () => {
  for (const vector of fixture.ownerVectors) assert.deepEqual(reproduceChangeTitleLifecycle(vector.input), vector.expected, vector.id);
  for (const vector of fixture.directLoadGateVectors) assert.deepEqual(reproduceDirectTitleLoadGate(vector.input), vector.expected, vector.id);
  for (const vector of fixture.teardownVectors) assert.deepEqual(reproduceChangeTitleTeardown(vector.input), vector.expected, vector.id);
  assert.throws(() => reproduceChangeTitleLifecycle({ operations: [{ path: "a.spr", loadResult: "unknown" }] }), /success or failure/u);
  assert.throws(() => reproduceChangeTitleTeardown({ objectiveActive: 2 }), /overlay flags/u);
});

test("rejects tampered source and stale structured evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "changetitle-consumer-evidence-"));
  const executablePath = join(directory, "imjinrok2.exe");
  copyFileSync(paths.executablePath, executablePath);
  const executable = readFileSync(executablePath);
  executable[0x200] ^= 0xff;
  writeFileSync(executablePath, executable);
  assert.throws(() => extractChangeTitleConsumerEvidence({ ...paths, executablePath }), /SHA-256/u);

  const functions = JSON.parse(readFileSync(paths.functionsPath, "utf8"));
  functions.sourceSha256 = "0".repeat(64);
  const functionsPath = join(directory, "functions.json");
  writeFileSync(functionsPath, `${JSON.stringify(functions)}\n`);
  assert.throws(() => extractChangeTitleConsumerEvidence({ ...paths, functionsPath }), /sourceSha256/u);

  const references = JSON.parse(readFileSync(paths.referencesPath, "utf8"));
  references.references.find(({ fromFunctionEntry, to }) => fromFunctionEntry === "0x00482fc0" && to === "0x004434a0").to = "0x00000000";
  const referencesPath = join(directory, "references.json");
  writeFileSync(referencesPath, `${JSON.stringify(references)}\n`);
  assert.throws(() => extractChangeTitleConsumerEvidence({ ...paths, referencesPath }), /title load gate outgoing/u);
});
