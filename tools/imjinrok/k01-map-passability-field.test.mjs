import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  K01_PASSABILITY_GATE_FIELD,
  evaluateK01PassabilityGate,
  extractK01MapPassabilityField,
  projectK01PassabilityGateValues,
  readK01PassabilityGateValue,
} from "./extract-k01-map-passability-field.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const mapPath = join(repositoryRoot, "original/imjinrok2/stagemap/k01.map");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const extractorPath = join(dirname(fileURLToPath(import.meta.url)), "extract-k01-map-passability-field.mjs");
const fixture = JSON.parse(readFileSync(join(repositoryRoot, "analysis/fixtures/k01-map-passability-field.json"), "utf8"));

test("K01 source-bound passability gate has the exact field formula, values, and source branches", () => {
  const report = extractK01MapPassabilityField({ mapPath, executablePath });

  assert.deepEqual(pickReport(report), fixture);
  assert.equal(report.executableEvidence.every(({ matched }) => matched), true);
  assert.equal(report.interpretationLimits.renderingField, "unresolved; this extractor does not identify a tile-rendering field or attach terrain artwork labels");
  assert.equal(report.interpretationLimits.priorRleProjection.startsWith("not an original per-cell field"), true);
});

test("K01 source gate preserves the recovered branch boundary without claiming final passability", () => {
  assert.equal(evaluateK01PassabilityGate(0, 255), "continues-to-later-checks");
  assert.equal(evaluateK01PassabilityGate(3, 0), "continues-to-later-checks");
  assert.equal(evaluateK01PassabilityGate(3, 1), "rejects-before-later-checks");
  assert.equal(evaluateK01PassabilityGate(1, 0), "rejects-before-later-checks");
  assert.equal(evaluateK01PassabilityGate(255, 0), "rejects-before-later-checks");
  assert.throws(() => evaluateK01PassabilityGate(-1, 0), /unsigned byte/);
  assert.throws(() => evaluateK01PassabilityGate(0, 256), /unsigned byte/);
});

test("K01 passability field rejects stale inputs and field boundaries", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-passability-field-"));
  const tamperedMapPath = join(directory, "k01.map");
  const tamperedExecutablePath = join(directory, "imjinrok2.exe");
  const tamperedFunctionsPath = join(directory, "functions.json");
  const tamperedReferencesPath = join(directory, "references.json");
  const map = readFileSync(mapPath);
  const executable = readFileSync(executablePath);
  const functions = readFileSync(functionsPath);
  const references = readFileSync(referencesPath);
  map[0] ^= 0x01;
  executable[0] ^= 0x01;
  functions[functions.length - 1] ^= 0x01;
  references[references.length - 1] ^= 0x01;
  writeFileSync(tamperedMapPath, map);
  writeFileSync(tamperedExecutablePath, executable);
  writeFileSync(tamperedFunctionsPath, functions);
  writeFileSync(tamperedReferencesPath, references);

  try {
    assert.throws(
      () => extractK01MapPassabilityField({ mapPath: tamperedMapPath, executablePath }),
      /K01 map SHA-256 mismatch/,
    );
    assert.throws(
      () => extractK01MapPassabilityField({ mapPath, executablePath: tamperedExecutablePath }),
      /original executable SHA-256 mismatch/,
    );
    assert.throws(
      () => extractK01MapPassabilityField({ mapPath, executablePath, functionsPath: tamperedFunctionsPath }),
      /static functions SHA-256 mismatch/,
    );
    assert.throws(
      () => extractK01MapPassabilityField({ mapPath, executablePath, referencesPath: tamperedReferencesPath }),
      /static references SHA-256 mismatch/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  const requiredLength = fixture.field.extentEndExclusive;
  assert.throws(() => projectK01PassabilityGateValues(Buffer.alloc(requiredLength - 1)), /requires at least/);
  assert.throws(() => readK01PassabilityGateValue(Buffer.alloc(requiredLength), -1, 0), /outside/);
  assert.throws(() => readK01PassabilityGateValue(Buffer.alloc(requiredLength), 60, 0), /outside/);
  assert.throws(() => readK01PassabilityGateValue(Buffer.alloc(requiredLength), 0, 0.5), /must be integers/);
});

test("K01 passability CLI accepts explicit hash-bound source paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-passability-cli-"));
  const copiedMapPath = join(directory, "k01.map");
  const copiedExecutablePath = join(directory, "imjinrok2.exe");
  writeFileSync(copiedMapPath, readFileSync(mapPath));
  writeFileSync(copiedExecutablePath, readFileSync(executablePath));

  try {
    const result = spawnSync(process.execPath, [extractorPath, "--map", copiedMapPath, "--executable", copiedExecutablePath], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.sources.map.path, copiedMapPath);
    assert.equal(report.sources.executable.path, copiedExecutablePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function pickReport(report) {
  return {
    sources: {
      map: { size: report.sources.map.size, sha256: report.sources.map.sha256 },
      executable: { size: report.sources.executable.size, sha256: report.sources.executable.sha256 },
    },
    header: report.header,
    field: report.field,
    values: report.values,
    auxiliaryValues: report.auxiliaryValues,
    staticAnalysis: {
      functions: {
        size: report.staticAnalysis.functions.size,
        sha256: report.staticAnalysis.functions.sha256,
        sourceSha256: report.staticAnalysis.functions.sourceSha256,
        functionProvenance: report.staticAnalysis.functions.functionProvenance.map(
          ({ entry, bodyRange, bodySize, rawBodySha256, instructionSha256 }) => ({
            entry,
            bodyRange,
            bodySize,
            rawBodySha256,
            instructionSha256,
          }),
        ),
      },
      references: {
        size: report.staticAnalysis.references.size,
        sha256: report.staticAnalysis.references.sha256,
        sourceSha256: report.staticAnalysis.references.sourceSha256,
        requiredCallEdges: report.staticAnalysis.references.requiredCallEdges,
      },
    },
    representativeVectors: report.representativeVectors,
    sourceGateVectors: report.sourceGateVectors,
    executableEvidence: report.executableEvidence.map(({ id, va, bytes }) => ({ id, va, bytes })),
    fieldConstant: K01_PASSABILITY_GATE_FIELD,
  };
}
