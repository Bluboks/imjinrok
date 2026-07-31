import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_K0110_SHA256,
  extractBriefingMetadataEvidence,
  reproduceBriefingOverlayDispatch,
  reproduceSetDelay,
} from "./extract-briefing-metadata-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  scriptPath: join(root, "original/imjinrok2/script/K0110"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
};
const fixture = JSON.parse(readFileSync(join(root, "analysis/fixtures/briefing-metadata-evidence-vectors.json"), "utf8"));

test("binds briefing vectors to the exact EXE and K0110", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceK0110Sha256, EXPECTED_K0110_SHA256);
  assert.match(fixture.k0110.timingNotice, /not an exact wall-clock/u);
});

test("recovers static briefing metadata, complete bounds, and K0110 ordering", () => {
  const report = extractBriefingMetadataEvidence(paths);
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "scoped-reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only-no-production-change");
  assert.equal(report.rawCodeRanges.length, 6);
  assert.equal(report.functionCatalog.length, 6);
  assert.equal(report.evidencePoints.length, 13);
  assert.equal(report.referenceProjections.length, 4);
  assert.deepEqual(report.commandMapping, { SETDELAYTIME: 3, OBJECTIVE: 7, TITLE: 9 });
  assert.deepEqual(report.overlays, {
    objective: {
      rectangle: { left: 188, top: 290, right: 466, bottom: 376 },
      wrapWidth: 278,
      textAnchors: [{ x: 188, centerY: 311 }, { x: 188, centerY: 354 }],
      activationField: "owner+0x568=1",
    },
    title: {
      rectangle: { left: 188, top: 65, right: 466, bottom: 95 },
      textAnchor: { x: 188, centerY: 80 },
      activationField: "owner+0x564=1",
    },
    dispatcherOrder: ["field_0x568", "field_0x564"],
  });
  assert.equal(report.k0110.changeTitleRawDelayTotal, 665);
  assert.equal(report.k0110.preFirstSpeechDelay, 100);
  assert.equal(report.k0110.preFirstSpeech.at(-1).command, "SETDELAYTIME");
  assert.deepEqual(report.k0110.preFirstSpeech.at(-1).args, ["100"]);
  assert.match(report.k0110.timingLimit, /Strict >/u);
  assert.deepEqual(
    report.evidencePoints.filter(({ va }) => ["0x0048353b", "0x00483549", "0x00483565", "0x004a8a6a"].includes(va)),
    [
      { va: "0x0048353b", rawOffset: "0x0008353b", bytes: "8b 86 24 0c 00 00 85 c0 0f 84 dd 00 00 00", meaning: "readiness case 3 reads owner+0xc24 and a zero duration jumps directly to its ready return" },
      { va: "0x00483549", rawOffset: "0x00083549", bytes: "ff 15 70 72 4b 00 8b 96 20 0c 00 00 8b 8e 24 0c 00 00 2b c2 3b c1 0f 86 cb 00 00 00", meaning: "nonzero case 3 calls timeGetTime, subtracts owner+0xc20, compares unsigned elapsed with owner+0xc24, and JBE retains the delay" },
      { va: "0x00483565", rawOffset: "0x00083565", bytes: "c7 86 20 0c 00 00 00 00 00 00 c7 86 24 0c 00 00 00 00 00 00", meaning: "completed nonzero case 3 clears owner+0xc20 and owner+0xc24 before returning ready" },
      { va: "0x004a8a6a", rawOffset: "0x000a8a6a", bytes: "b9 50 00 00 00 d1 f8 2b c8 8b 44 24 10 0f bf d1 56 52 68 bc 00 00 00 50 ff 15 50 70 4b 00", meaning: "title text uses x 188 as a left anchor and is vertically centered around y 80" },
    ],
  );
});

test("reproduces strict, wrap, negative-word, and overlay-order vectors", () => {
  for (const vector of fixture.setDelayVectors) assert.deepEqual(reproduceSetDelay(vector.input), vector.expected, vector.id);
  for (const vector of fixture.overlayDispatchVectors) assert.deepEqual(reproduceBriefingOverlayDispatch(vector.input), vector.expected, vector.id);
  assert.throws(() => reproduceSetDelay({ startTick: 0, durationWord: 0x8000, nowTick: 1 }), /signed WORD/u);
  assert.throws(() => reproduceBriefingOverlayDispatch({ field_0x568: -1, field_0x564: 0 }), /unsigned DWORD/u);
});

test("rejects tampered source and stale structured evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "briefing-metadata-evidence-"));
  const executablePath = join(directory, "imjinrok2.exe");
  copyFileSync(paths.executablePath, executablePath);
  const executable = readFileSync(executablePath);
  executable[0x200] ^= 0xff;
  writeFileSync(executablePath, executable);
  assert.throws(() => extractBriefingMetadataEvidence({ ...paths, executablePath }), /SHA-256/u);

  const functions = JSON.parse(readFileSync(paths.functionsPath, "utf8"));
  functions.sourceSha256 = "0".repeat(64);
  const functionsPath = join(directory, "functions.json");
  writeFileSync(functionsPath, `${JSON.stringify(functions)}\n`);
  assert.throws(() => extractBriefingMetadataEvidence({ ...paths, functionsPath }), /sourceSha256/u);

  const references = JSON.parse(readFileSync(paths.referencesPath, "utf8"));
  references.references.find(({ fromFunctionEntry }) => fromFunctionEntry === "0x004830f0").to = "0x00000000";
  const referencesPath = join(directory, "references.json");
  writeFileSync(referencesPath, `${JSON.stringify(references)}\n`);
  assert.throws(() => extractBriefingMetadataEvidence({ ...paths, referencesPath }), /record consumer outgoing/u);
});
