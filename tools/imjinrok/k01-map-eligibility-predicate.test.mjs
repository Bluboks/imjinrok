import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateK01MapEligibilityPredicate,
  extractK01MapEligibilityPredicate,
  K01_MAP_ELIGIBILITY_PREDICATE,
} from "./extract-k01-map-eligibility-predicate.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const extractorPath = join(dirname(fileURLToPath(import.meta.url)), "extract-k01-map-eligibility-predicate.mjs");
const fixture = JSON.parse(readFileSync(join(repositoryRoot, "analysis/fixtures/k01-map-eligibility-predicate.json"), "utf8"));

const base = { x: 0, y: 0, width: 60, height: 60, occupancyWord: 0, primaryValue: 0, auxiliaryValue: 0, lowNibbleField: 0, globalMaskWord: 0, derivedFlags: 0 };

test("FUN_00465960 source-bound report fixes every predicate reference, field width, and result vector", () => {
  const report = extractK01MapEligibilityPredicate({ executablePath, functionsPath, referencesPath });
  assert.deepEqual(pickReport(report), fixture);
  assert.equal(report.executableEvidence.every(({ matched }) => matched), true);
  assert.equal(report.predicate, K01_MAP_ELIGIBILITY_PREDICATE);
  assert.match(report.producerBoundary.lowNibbleField, /synthetic/);
  assert.match(report.producerBoundary.firstUnresolvedEdge, /field_0x00032514/);
});

test("FUN_00465960 reproduces every ordered reject branch and its final boolean", () => {
  const vectors = [
    [{ ...base, x: -1 }, false], [{ ...base, x: 60 }, false], [{ ...base, width: 0x80000000 }, false],
    [{ ...base, y: -1 }, false], [{ ...base, y: 60 }, false], [{ ...base, height: 0xffffffff }, false],
    [{ ...base, occupancyWord: 1 }, false], [{ ...base, primaryValue: 3, auxiliaryValue: 1 }, false],
    [{ ...base, primaryValue: 2 }, false], [{ ...base, primaryValue: 0, lowNibbleField: 0xf1 }, false],
    [{ ...base, primaryValue: 3, auxiliaryValue: 0, lowNibbleField: 1 }, false],
    [{ ...base, globalMaskWord: 0x136a, derivedFlags: 0x2000 }, false],
    [{ ...base, globalMaskWord: 0x136a, derivedFlags: 0x0080 }, true],
  ];
  for (const [input, expected] of vectors) assert.equal(evaluateK01MapEligibilityPredicate(input), expected, JSON.stringify(input));
});

test("FUN_00465960 does not inspect unreachable synthetic inputs", () => {
  assert.equal(evaluateK01MapEligibilityPredicate(unreachableAfter({ ...base, x: -1 }, ["width", "y", "height", "occupancyWord", "primaryValue", "auxiliaryValue", "lowNibbleField", "globalMaskWord", "derivedFlags"])), false);
  assert.equal(evaluateK01MapEligibilityPredicate(unreachableAfter({ ...base, width: 0x80000000 }, ["y", "height", "occupancyWord", "primaryValue", "auxiliaryValue", "lowNibbleField", "globalMaskWord", "derivedFlags"])), false);
  assert.equal(evaluateK01MapEligibilityPredicate(unreachableAfter({ ...base, height: 0xffffffff }, ["occupancyWord", "primaryValue", "auxiliaryValue", "lowNibbleField", "globalMaskWord", "derivedFlags"])), false);
  assert.equal(evaluateK01MapEligibilityPredicate(unreachableAfter({ ...base, occupancyWord: 1 }, ["primaryValue", "auxiliaryValue", "lowNibbleField", "globalMaskWord", "derivedFlags"])), false);
  assert.equal(evaluateK01MapEligibilityPredicate(unreachableAfter({ ...base, primaryValue: 2 }, ["auxiliaryValue", "lowNibbleField", "globalMaskWord", "derivedFlags"])), false);
  assert.equal(evaluateK01MapEligibilityPredicate(unreachableAfter({ ...base, lowNibbleField: 1 }, ["globalMaskWord", "derivedFlags"])), false);
  assert.equal(evaluateK01MapEligibilityPredicate(unreachableAfter({ ...base, globalMaskWord: 0, derivedFlags: 0 }, [])), true);
});

test("FUN_00465960 rejects malformed reached canonical values", () => {
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, x: -32769 }), /signed int16/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, width: -1 }), /unsigned dword/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, width: 0x1_0000_0000 }), /unsigned dword/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, height: 0x1_0000_0000 }), /unsigned dword/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, occupancyWord: 0x10000 }), /unsigned word/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, primaryValue: 256 }), /unsigned byte/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, primaryValue: 3, auxiliaryValue: -1 }), /unsigned byte/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, lowNibbleField: -1 }), /unsigned byte/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, globalMaskWord: -1 }), /unsigned word/);
  assert.throws(() => evaluateK01MapEligibilityPredicate({ ...base, derivedFlags: 0x10000 }), /unsigned word/);
});

test("FUN_00465960 rejects tampered source and generated artifacts before reporting", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-eligibility-predicate-"));
  const targets = [
    ["exe", executablePath, "original executable SHA-256 mismatch"],
    ["functions", functionsPath, "static functions SHA-256 mismatch"],
    ["references", referencesPath, "static references SHA-256 mismatch"],
  ];
  try {
    for (const [name, source, message] of targets) {
      const path = join(directory, name);
      const bytes = readFileSync(source);
      bytes[bytes.length - 1] ^= 1;
      writeFileSync(path, bytes);
      const options = { executablePath, functionsPath, referencesPath };
      options[{ exe: "executablePath", functions: "functionsPath", references: "referencesPath" }[name]] = path;
      assert.throws(() => extractK01MapEligibilityPredicate(options), new RegExp(message));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("FUN_00465960 CLI is deterministic with an explicit hash-bound executable", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-eligibility-cli-"));
  const copiedExecutablePath = join(directory, "imjinrok2.exe");
  writeFileSync(copiedExecutablePath, readFileSync(executablePath));
  try {
    const command = [extractorPath, "--executable", copiedExecutablePath];
    const first = spawnSync(process.execPath, command, { cwd: repositoryRoot, encoding: "utf8" });
    const second = spawnSync(process.execPath, command, { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.equal(JSON.parse(first.stdout).sources.executable.path, copiedExecutablePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function unreachableAfter(input, names) {
  for (const name of names) Object.defineProperty(input, name, { get() { throw new Error(`unreachable ${name} read`); } });
  return input;
}

function pickReport(report) {
  return {
    sources: { executable: { size: report.sources.executable.size, sha256: report.sources.executable.sha256 } },
    predicate: report.predicate,
    staticAnalysis: {
      functions: { size: report.staticAnalysis.functions.size, sha256: report.staticAnalysis.functions.sha256, sourceSha256: report.staticAnalysis.functions.sourceSha256, functionProvenance: report.staticAnalysis.functions.functionProvenance },
      references: { size: report.staticAnalysis.references.size, sha256: report.staticAnalysis.references.sha256, sourceSha256: report.staticAnalysis.references.sourceSha256, requiredCallEdges: report.staticAnalysis.references.requiredCallEdges, predicateReferences: report.staticAnalysis.references.predicateReferences },
    },
    executableEvidence: report.executableEvidence.map(({ id, va, bytes }) => ({ id, va, bytes })),
    orderedPredicate: report.orderedPredicate,
    syntheticVectors: report.syntheticVectors,
  };
}
