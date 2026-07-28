import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import {
  applyFeedbackToBase,
  deriveFeedback,
  extractK01ClockModeProducers,
  forwardOptionWordToSelector,
  replayModeWriter,
  selectOriginalBaseInterval,
} from "./extract-k01-clock-mode-producers.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: resolve(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(root, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: resolve(root, "analysis/generated/imjinrok2/jump-tables.json"),
};
const temporaryDirectories = new Set();
after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

test("binds K01 clock-mode, selector forwarder, and feedback evidence to the original EXE", () => {
  const report = extractK01ClockModeProducers(paths);
  assert.equal(report.analysisStatus, "static-confirmed-conditional");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "none");
  assert.equal(report.source.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(report.functionEvidence.length, 11);
  assert.equal(report.callEdges.length, 7);
  assert.ok(report.codeAnchors.every(({ matched }) => matched));
  assert.match(report.k01ModeContract.result, /no K01-specific mode value/);
  assert.match(report.k01ModeContract.conditionalModeOne, /50 ms/);
  assert.match(report.feedbackContract.result, /49, 50, or 51 ms/);
  assert.equal(report.projectContract.exactWallClockHz, null);
  assert.deepEqual(report.testVectors.map(({ id }) => id), [
    "mode-one-ignores-selector",
    "non-one-selector-table",
    "signed-word-forwarder",
    "mode-writer-branches",
    "message-feedback-prevents-fixed-50ms",
  ]);
});

test("replays mode equality, signed selector forwarding, and all feedback outcomes", () => {
  assert.equal(selectOriginalBaseInterval({ modeWord: 1, selector: 0xffffffff }), 50);
  assert.deepEqual([0, 1, 2, 3, 4].map((selector) => selectOriginalBaseInterval({ modeWord: 0, selector })), [64, 60, 50, 40, 30]);
  assert.deepEqual([0x0002, 0xffff, 0x8000].map(forwardOptionWordToSelector), [2, 0xffffffff, 0xffff8000]);
  assert.equal(replayModeWriter({ previousModeWord: 0, sessionGateWord: 0, argumentWord: 1 }), 1);
  assert.equal(replayModeWriter({ previousModeWord: 1, sessionGateWord: 1, argumentWord: 1 }), 0);
  assert.equal(replayModeWriter({ previousModeWord: 1, sessionGateWord: 0, argumentWord: 2 }), 1);

  const feedback = [101, 100, 99].map((selectedTimestamp) => deriveFeedback({
    historyReady: 1,
    comparisonInput: 100,
    recordFound: true,
    selectedTimestamp,
    previousFeedback: 0,
  }));
  assert.deepEqual(feedback, [0xffffffff, 0, 1]);
  assert.deepEqual(feedback.map((value) => applyFeedbackToBase({ baseInterval: 50, feedback: value })), [49, 50, 51]);
  assert.equal(deriveFeedback({ historyReady: 0, comparisonInput: 100, recordFound: true, selectedTimestamp: 101, previousFeedback: 7 }), 7);
});

test("rejects malformed widths and source-bound artifact mutations", () => {
  assert.throws(() => selectOriginalBaseInterval({ modeWord: 0x10000, selector: 0 }), /modeWord/);
  assert.throws(() => forwardOptionWordToSelector(-1), /optionWord/);
  assert.throws(() => applyFeedbackToBase({ baseInterval: 50, feedback: -1 }), /feedback/);

  const functionsPath = copyJson(paths.functionsPath, (artifact) => {
    artifact.functions.find(({ entry }) => entry === "0x00485890").instructionSha256 = "0".repeat(64);
  });
  assert.throws(() => extractK01ClockModeProducers({ ...paths, functionsPath }), /0x00485890 instruction SHA-256/);

  const referencesPath = copyJson(paths.referencesPath, (artifact) => {
    artifact.references.find(({ from, to }) => from === "0x00473c7a" && to === "0x004430f0").to = "0x004430f1";
  });
  assert.throws(() => extractK01ClockModeProducers({ ...paths, referencesPath }), /0x00473c7a/);

  const jumpTablesPath = copyJson(paths.jumpTablesPath, (artifact) => {
    const table = Object.values(artifact.tables).find(({ functionEntry, switchAddress }) => functionEntry === "0x0045f9c0" && switchAddress === "0x0045fd56");
    table.cases.find(({ label }) => label === 0).destination = "0x004600cc";
  });
  assert.throws(() => extractK01ClockModeProducers({ ...paths, jumpTablesPath }), /main-state one destination/);

  const stageJumpTablesPath = copyJson(paths.jumpTablesPath, (artifact) => {
    const table = Object.values(artifact.tables).find(({ functionEntry, switchAddress }) => functionEntry === "0x0048d410" && switchAddress === "0x0048d422");
    table.cases.find(({ label }) => label === 1).destination = "0x0048d42a";
  });
  assert.throws(() => extractK01ClockModeProducers({ ...paths, jumpTablesPath: stageJumpTablesPath }), /K01 stage-one destination/);
});

function copyJson(source, mutate) {
  const directory = mkdtempSync(join(tmpdir(), "k01-clock-mode-"));
  temporaryDirectories.add(directory);
  const destination = join(directory, "artifact.json");
  const artifact = JSON.parse(readFileSync(source, "utf8"));
  mutate(artifact);
  writeFileSync(destination, `${JSON.stringify(artifact)}\n`);
  return destination;
}
