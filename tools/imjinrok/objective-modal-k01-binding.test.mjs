import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_K01_MAP_SHA256,
  EXPECTED_K01_SCRIPT_SHA256,
  EXPECTED_K02_SCRIPT_SHA256,
  extractObjectiveModalK01Binding,
  reproduceObjectiveModalBinding,
  reproduceObjectiveStateProducer,
  reproduceSelectedStageIndex,
} from "./extract-objective-modal-k01-binding.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const k01ScriptPath = join(repositoryRoot, "original/imjinrok2/script/K0110");
const k02ScriptPath = join(repositoryRoot, "original/imjinrok2/script/K0210");
const k01MapPath = join(repositoryRoot, "original/imjinrok2/stagemap/k01.map");
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/objective-modal-k01-binding-vectors.json",
);
const vectors = JSON.parse(readFileSync(fixturePath, "utf8"));

test("binds every reproduction vector to the exact original inputs", () => {
  assert.equal(vectors.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(vectors.sourceK01ScriptSha256, EXPECTED_K01_SCRIPT_SHA256);
  assert.equal(vectors.sourceK02ScriptSha256, EXPECTED_K02_SCRIPT_SHA256);
  assert.equal(vectors.sourceK01MapSha256, EXPECTED_K01_MAP_SHA256);
});

test("recovers the complete K01 common-objective-modal binding", () => {
  const report = extract();

  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only; no client scene integration");
  assert.equal(report.functions.length, 16);
  assert.equal(report.rawCodeRanges.length, 1);
  assert.equal(report.evidencePoints.length, 26);
  assert.equal(report.staticEvidencePointCount, 26);
  assert.equal(
    report.stateProducer.reproductionScope,
    "earlier one-shot and state-3 controls in FUN_004495e0 are inactive; the model begins at the objective control and reproduces every following state-producing control in original order",
  );
  assert.deepEqual(report.stateProducer.orderedLaterControls, [
    { controlObject: "0x005528f8", pendingState: "0x3ee", call: "0x004496c0" },
    { controlObject: "0x00552ae0", pendingState: "0x3ec", call: "0x00449703" },
    { controlObject: "0x00552850", pendingState: "0x3ea", call: "0x00449718" },
  ]);
  assert.deepEqual(report.k01Binding.modalTextInputs, [
    "1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)",
    "",
  ]);
  assert.deepEqual(
    {
      selectedStage: report.k01Binding.selectedStage,
      recordAddress: report.k01Binding.recordAddress,
      recordPath: report.k01Binding.recordPath,
      mapPath: report.k01Binding.mapPath,
      missionHandler: report.k01Binding.missionHandler,
      isK01Runtime: report.k01Binding.isK01Runtime,
      selectsK01ObjectiveText: report.k01Binding.selectsK01ObjectiveText,
    },
    {
      selectedStage: 1,
      recordAddress: "0x00abf168",
      recordPath: "script\\k0110",
      mapPath: "stagemap\\k01.map",
      missionHandler: "0x0048a5c0",
      isK01Runtime: true,
      selectsK01ObjectiveText: true,
    },
  );
});

test("reproduces every scoped 0x3f0 producer vector", () => {
  for (const vector of vectors.stateProducerVectors) {
    assert.deepEqual(reproduceObjectiveStateProducer(vector.input), vector.expected, vector.id);
  }
});

test("reproduces every signed WORD stage-index write vector", () => {
  for (const vector of vectors.stageIndexVectors) {
    assert.deepEqual(reproduceSelectedStageIndex(vector.input), vector.expected, vector.id);
  }
});

test("reproduces every modal-record, map, and mission-handler binding vector", () => {
  for (const vector of vectors.bindingVectors) {
    assert.deepEqual(
      reproduceObjectiveModalBinding(vector.input.stageIndex),
      vector.expected,
      vector.id,
    );
  }
});

test("is deterministic across independent extraction runs", () => {
  assert.deepEqual(extract(), extract());
});

test("rejects values outside the original signed WORD fields", () => {
  assert.throws(
    () => reproduceSelectedStageIndex({ country: 1, stage: 32768, previousIndex: 0 }),
    /stage must be a signed WORD/,
  );
  assert.throws(
    () => reproduceObjectiveModalBinding(-32769),
    /stageIndex must be a signed WORD/,
  );
  assert.throws(
    () =>
      reproduceObjectiveStateProducer({
        objectiveControlActivated: true,
        state3eeControlActivated: false,
        state3ecControlActivated: false,
        state3eaControlActivated: null,
      }),
    /state3eaControlActivated must be boolean/,
  );
});

test("refuses altered executable, K0110, K0210, map, and stale analysis inputs", () => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-objective-k01-binding-"));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const alteredK01ScriptPath = join(directory, "K0110");
  const alteredK02ScriptPath = join(directory, "K0210");
  const alteredK01MapPath = join(directory, "k01.map");
  const staleSeedsPath = join(directory, "seeds.json");
  copyFileSync(executablePath, alteredExecutablePath);
  copyFileSync(k01ScriptPath, alteredK01ScriptPath);
  copyFileSync(k02ScriptPath, alteredK02ScriptPath);
  copyFileSync(k01MapPath, alteredK01MapPath);
  flipByte(alteredExecutablePath, 0x486b5);
  flipByte(alteredK01ScriptPath, 0x10);
  flipByte(alteredK02ScriptPath, 0x10);
  flipByte(alteredK01MapPath, 0x20);
  writeFileSync(staleSeedsPath, JSON.stringify({ sourceSha256: "0".repeat(64), functions: [] }));

  assert.throws(
    () => extract({ executablePath: alteredExecutablePath }),
    /imjinrok2\.exe SHA-256 mismatch/,
  );
  assert.throws(
    () => extract({ k01ScriptPath: alteredK01ScriptPath }),
    /K0110 SHA-256 mismatch/,
  );
  assert.throws(
    () => extract({ k02ScriptPath: alteredK02ScriptPath }),
    /K0210 SHA-256 mismatch/,
  );
  assert.throws(
    () => extract({ k01MapPath: alteredK01MapPath }),
    /k01\.map SHA-256 mismatch/,
  );
  assert.throws(
    () => extract({ seedsPath: staleSeedsPath }),
    /source SHA-256 mismatch/,
  );
});

function extract(overrides = {}) {
  return extractObjectiveModalK01Binding({
    executablePath,
    k01ScriptPath,
    k02ScriptPath,
    k01MapPath,
    seedsPath,
    ...overrides,
  });
}

function flipByte(path, offset) {
  const buffer = readFileSync(path);
  buffer[offset] ^= 0xff;
  writeFileSync(path, buffer);
}
