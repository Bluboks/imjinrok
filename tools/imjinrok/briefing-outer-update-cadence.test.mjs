import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractBriefingOuterUpdateCadence,
  reproduceOuterUpdateSequence,
  validateCanonicalUpstream,
} from "./extract-briefing-outer-update-cadence.mjs";
import { reproduceSetDelay } from "./extract-briefing-metadata-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  scriptPath: join(root, "original/imjinrok2/script/K0110"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  metadataExtractorPath: join(root, "tools/imjinrok/extract-briefing-metadata-evidence.mjs"),
  changeTitleExtractorPath: join(root, "tools/imjinrok/extract-changetitle-consumer-evidence.mjs"),
  metadataFixturePath: join(root, "analysis/fixtures/briefing-metadata-evidence-vectors.json"),
  changeTitleFixturePath: join(root, "analysis/fixtures/changetitle-consumer-evidence-vectors.json"),
};
const fixturePath = join(root, "analysis/fixtures/briefing-outer-update-cadence-vectors.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("binds outer cadence vectors to the exact upstream closure", () => {
  const report = extractBriefingOuterUpdateCadence(paths);
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "scoped-reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only-no-production-change");
  assert.equal(report.rawCodeRanges.length, 7);
  assert.equal(report.functionCatalog.length, 7);
  assert.equal(report.evidencePoints.length, 12);
  assert.equal(report.callEdges.length, 7);
  assert.equal(report.queueCallers.count, 3);
  assert.deepEqual(report.imports.map(({ dll, name }) => ({ dll, name })), [
    { dll: "USER32.dll", name: "PeekMessageA" },
    { dll: "WINMM.dll", name: "timeGetTime" },
    { dll: "USER32.dll", name: "GetAsyncKeyState" },
  ]);
  assert.equal(report.jumpTable.state14Destination, "0x0045ffb6");
  assert.equal(report.progression.acceptedUpdateUnit, "an accepted outer visit means a message-absent main-loop iteration that reaches state 0x14; it is not a fixed 24 Hz/gameplay scheduler step");
  validateCanonicalUpstream(fixture, paths);
});

test("reproduces strict delay boundaries, wrap, and signed-word behavior", () => {
  for (const vector of fixture.timingVectors) assert.deepEqual(reproduceSetDelay(vector.input), vector.expected, vector.id);
  assert.throws(() => reproduceSetDelay({ startTick: 0, durationWord: 0x8000, nowTick: 1 }), /signed WORD/u);
  assert.throws(() => reproduceSetDelay({ startTick: 0, durationWord: 1, nowTick: 0x1_0000_0000 }), /unsigned DWORD/u);
});

test("reproduces one-record progression and retained outer visits", () => {
  for (const vector of fixture.outerUpdateVectors) {
    const result = reproduceOuterUpdateSequence(vector);
    const acceptedRecords = result.trace.flatMap(({ events }) => events.filter(({ type }) => type === "record-accepted")).map(({ index, record: type }) => ({ index, type }));
    assert.deepEqual(result.trace.map(({ acceptedOuterUpdate }) => acceptedOuterUpdate), vector.expected.acceptedOuterUpdates ?? result.trace.map(() => true), vector.id);
    assert.deepEqual(acceptedRecords, vector.expected.acceptedRecords, vector.id);
    if (vector.expected.retainedIndices) assert.deepEqual(result.trace.flatMap(({ events }) => events.filter(({ type }) => type === "record-retained").map(({ index }) => index)), vector.expected.retainedIndices, vector.id);
    if (vector.expected.cleanupEventOuterIndices) assert.deepEqual(result.trace.filter(({ events }) => events.some(({ type }) => type === "previous-record-cleanup")).map(({ outerIndex }) => outerIndex), vector.expected.cleanupEventOuterIndices, vector.id);
    if (vector.expected.finalDrawOrder) assert.deepEqual(result.trace.at(-1).events.at(-1).frame.drawOrder, vector.expected.finalDrawOrder, vector.id);
    assert.equal(result.final.nextRecordIndex, vector.expected.finalNextRecordIndex, vector.id);
    if (vector.expected.finalTornDown !== undefined) assert.equal(result.final.tornDown, vector.expected.finalTornDown, vector.id);
  }
});

test("rejects tampered executable, generated artifacts, and fixture closure", () => {
  const directory = mkdtempSync(join(tmpdir(), "briefing-outer-update-cadence-"));
  const executablePath = join(directory, "imjinrok2.exe");
  copyFileSync(paths.executablePath, executablePath);
  const executable = readFileSync(executablePath);
  executable[0x200] ^= 0xff;
  writeFileSync(executablePath, executable);
  assert.throws(() => extractBriefingOuterUpdateCadence({ ...paths, executablePath }), /SHA-256/u);

  const functions = JSON.parse(readFileSync(paths.functionsPath, "utf8"));
  functions.sourceSha256 = "0".repeat(64);
  const functionsPath = join(directory, "functions.json");
  writeFileSync(functionsPath, `${JSON.stringify(functions)}\n`);
  assert.throws(() => extractBriefingOuterUpdateCadence({ ...paths, functionsPath }), /sourceSha256/u);

  const references = JSON.parse(readFileSync(paths.referencesPath, "utf8"));
  references.references.find(({ from }) => from === "0x00482545").to = "0x00000000";
  const referencesPath = join(directory, "references.json");
  writeFileSync(referencesPath, `${JSON.stringify(references)}\n`);
  assert.throws(() => extractBriefingOuterUpdateCadence({ ...paths, referencesPath }), /queue-to-record-consumer/u);

  const jumpTables = JSON.parse(readFileSync(paths.jumpTablesPath, "utf8"));
  jumpTables.sourceSha256 = "0".repeat(64);
  const jumpTablesPath = join(directory, "jump-tables.json");
  writeFileSync(jumpTablesPath, `${JSON.stringify(jumpTables)}\n`);
  assert.throws(() => extractBriefingOuterUpdateCadence({ ...paths, jumpTablesPath }), /sourceSha256/u);

  const seeds = JSON.parse(readFileSync(paths.seedsPath, "utf8"));
  seeds.sourceSha256 = "0".repeat(64);
  const seedsPath = join(directory, "seeds.json");
  writeFileSync(seedsPath, `${JSON.stringify(seeds)}\n`);
  assert.throws(() => extractBriefingOuterUpdateCadence({ ...paths, seedsPath }), /sourceSha256/u);

  assert.throws(() => validateCanonicalUpstream({ ...fixture, source: { ...fixture.source, seedsSha256: "0".repeat(64) } }, paths), /fixture source closure/u);
});
