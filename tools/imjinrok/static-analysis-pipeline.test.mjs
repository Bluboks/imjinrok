import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  EXPECTED_IMJINROK_EXE_SHA256,
  validateStaticAnalysisDirectory,
} from "./validate-static-analysis.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const generatedAnalysisDirectory = join(repositoryRoot, "analysis/generated/imjinrok2");

test("committed Ghidra analysis artifacts are internally consistent", () => {
  const summary = validateStaticAnalysisDirectory(generatedAnalysisDirectory);

  assert.equal(summary.sourceSha256, EXPECTED_IMJINROK_EXE_SHA256);
  assert.equal(summary.ghidraVersion, "12.1.2");
  assert.equal(summary.functionCount, 2_448);
  assert.equal(summary.stringCount, 1_545);
  assert.equal(summary.referenceCount, 57_572);
  assert.equal(summary.computedJumpCount, 268);
  assert.equal(summary.jumpTableCount, 234);
  assert.equal(summary.seedCount, 121);
  assert.equal(summary.seedFunctionCount, 120);
});

test("validator rejects a source hash mismatch instead of accepting stale evidence", (t) => {
  const fixtureDirectory = createMinimalFixture({
    sourceSha256: "0".repeat(64),
  });
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

  assert.throws(
    () => validateStaticAnalysisDirectory(fixtureDirectory),
    /manifest\.json sourceSha256 mismatch/,
  );
});

test("validator rejects unresolved seed functions", (t) => {
  const fixtureDirectory = createMinimalFixture({
    seedFunctionEntry: null,
  });
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

  assert.throws(
    () => validateStaticAnalysisDirectory(fixtureDirectory),
    /functionEntry does not match/,
  );
});

test("validator rejects a generated file changed after checksums were recorded", (t) => {
  const fixtureDirectory = createMinimalFixture();
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

  appendFileSync(join(fixtureDirectory, "manifest.json"), "\n");

  assert.throws(
    () => validateStaticAnalysisDirectory(fixtureDirectory),
    /SHA256SUMS checksum for manifest\.json mismatch/,
  );
});

test("validator rejects a reference to an unknown containing function", (t) => {
  const fixtureDirectory = createMinimalFixture({
    referenceFunctionEntry: "0x00402000",
  });
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

  assert.throws(
    () => validateStaticAnalysisDirectory(fixtureDirectory),
    /fromFunctionEntry is absent from functions\.json/,
  );
});

test("validator rejects a recovered flag that disagrees with jump-table output", (t) => {
  const fixtureDirectory = createMinimalFixture({
    computedJumpRecovered: false,
  });
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

  assert.throws(
    () => validateStaticAnalysisDirectory(fixtureDirectory),
    /candidates\[0\]\.recovered mismatch/,
  );
});

function createMinimalFixture({
  sourceSha256 = EXPECTED_IMJINROK_EXE_SHA256,
  seedFunctionEntry = "0x00401000",
  referenceFunctionEntry = "0x00401000",
  computedJumpRecovered = true,
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-static-analysis-test-"));

  writeJson(directory, "manifest.json", {
    schemaVersion: 2,
    exporter: "test",
    ghidraVersion: "12.1.2",
    sourceId: "fixture",
    sourceSha256,
    sourceSize: 843833,
    imageBase: "0x00400000",
    functionCount: 1,
    stringCount: 0,
    referenceCount: 1,
    computedJumpCount: 1,
    jumpTableCount: 1,
    seedCount: 1,
    seedFunctionCount: 1,
    memoryBlocks: [{ name: ".text" }],
  });
  writeJson(directory, "functions.json", {
    schemaVersion: 2,
    sourceSha256,
    functions: [{
      entry: "0x00401000",
      name: "FUN_00401000",
      prototype: "undefined FUN_00401000(void)",
      bodySize: 1,
      instructionCount: 1,
      instructionSha256: "1".repeat(64),
      bodyRanges: ["0x00401000-0x00401000"],
      callers: [],
      callees: [],
    }],
  });
  writeJson(directory, "strings.json", {
    schemaVersion: 2,
    sourceSha256,
    strings: [],
  });
  writeJson(directory, "references.json", {
    schemaVersion: 2,
    sourceSha256,
    references: [{
      from: "0x00401000",
      to: "0x00401000",
      type: "DATA",
      source: "ANALYSIS",
      operandIndex: 0,
      primary: true,
      fromFunctionEntry: referenceFunctionEntry,
      fromBlock: ".text",
      toBlock: ".text",
      toSymbol: "",
    }],
  });
  writeJson(directory, "jump-tables.json", {
    schemaVersion: 2,
    sourceSha256,
    candidates: [{
      address: "0x00401000",
      functionEntry: "0x00401000",
      instruction: "JMP EAX",
      destinations: [],
      recovered: computedJumpRecovered,
    }],
    tables: [{
      functionEntry: "0x00401000",
      switchAddress: "0x00401000",
      cases: [{
        destination: "0x00401000",
        label: 0,
      }],
      loadTables: [],
    }],
  });
  writeJson(directory, "seeds.json", {
    schemaVersion: 2,
    sourceSha256,
    seeds: [{
      label: "fixture",
      address: "0x00401000",
      functionEntry: seedFunctionEntry,
    }],
    functions: [{
      entry: "0x00401000",
      name: "FUN_00401000",
      prototype: "undefined FUN_00401000(void)",
      bodyRanges: ["0x00401000-0x00401000"],
      basicBlocks: [{
        start: "0x00401000",
        end: "0x00401000",
        destinations: [],
      }],
      instructions: [{
        address: "0x00401000",
        bytes: "c3",
        flowType: "TERMINATOR",
        text: "RET",
      }],
      decompilation: "void FUN_00401000(void) { return; }",
    }],
  });
  writeChecksumManifest(directory);

  return directory;
}

function writeJson(directory, fileName, value) {
  writeFileSync(join(directory, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function writeChecksumManifest(directory) {
  const fileNames = [
    "manifest.json",
    "functions.json",
    "strings.json",
    "references.json",
    "jump-tables.json",
    "seeds.json",
  ];
  const lines = fileNames.map((fileName) => {
    const checksum = createHash("sha256")
      .update(readFileSync(join(directory, fileName)))
      .digest("hex");
    return `${checksum}  ${fileName}`;
  });
  writeFileSync(join(directory, "SHA256SUMS"), `${lines.join("\n")}\n`);
}
