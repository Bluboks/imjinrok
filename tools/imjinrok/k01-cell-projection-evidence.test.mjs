import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  extractK01CellProjectionEvidence,
  reproduceK01CellProjectionVector,
} from "./extract-k01-cell-projection-evidence.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const mapPath = join(repositoryRoot, "original/imjinrok2/stagemap/k01.map");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(repositoryRoot, "analysis/fixtures/k01-cell-projection-evidence.json");
const extractorPath = join(dirname(fileURLToPath(import.meta.url)), "extract-k01-cell-projection-evidence.mjs");

test("hash-bound extractor fixes output pointer order, all FUN_00464cc0 callers, and K01 joint outputY vector", () => {
  const report = extractK01CellProjectionEvidence();
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.deepEqual(report, fixture);
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.outputWriterContracts.FUN_00464cc0.outputOrder, ["argument3 -> outputX", "argument4 -> outputY"]);
  assert.deepEqual(report.outputWriterContracts.FUN_004648e0.outputPointers, {
    outputX: "0x00843984 + 4*(x*180+y)",
    outputY: "0x008633c4 + 4*(x*180+y)",
  });
  assert.deepEqual(report.outputWriterContracts.FUN_00481c50.outputPointers, {
    outputX: "0x00843984 + 4*y",
    outputY: "0x008633c4 + 4*y",
  });
  assert.match(report.outputWriterContracts.FUN_00481c50.conclusion, /not a per-cell output table write/u);
  assert.deepEqual(report.sources.staticAnalysis.references.callEdges.map(({ from, fromFunctionEntry }) => [from, fromFunctionEntry]), [
    ["0x00410f7e", "0x00410cc0"],
    ["0x00416749", "0x00416600"],
    ["0x0046491a", "0x004648e0"],
    ["0x0046547b", "0x004653d0"],
    ["0x0047301c", "0x00472f90"],
    ["0x00481e27", "0x00481c50"],
  ]);
  assert.equal(report.outputYJointVector.stream.sha256, "4483d6b50a3bf13220c21e4aa7fcf5c7e10216010be45e6aee759dd4a6c14796");
  assert.deepEqual(report.outputYJointVector.lowNibbleFamilyCounts, {
    "1/1": 95, "1/2": 95, "1/3": 101, "1/4": 79, "1/5": 38, "1/6": 36, "1/7": 54,
    "1/8": 61, "1/9": 52, "1/10": 33, "1/11": 35, "1/12": 55, "1/14": 1, "2/0": 2865,
  });
  assert.equal(report.outputYJointVector.joints.find(({ lowNibble, family, helperReturn }) => lowNibble === 2 && family === 0 && helperReturn === 0)?.outputYAdjustment, 16);
  assert.equal(report.outputYJointVector.joints.find(({ lowNibble, family, helperReturn }) => lowNibble === 1 && family === 1 && helperReturn === 0)?.outputYAdjustment, 9);
  assert.equal(report.outputYJointVector.joints.find(({ lowNibble, family, helperReturn }) => lowNibble === 1 && family === 1 && helperReturn === 0)?.rawRasterVerticalBranch, 16);
  assert.deepEqual(Object.fromEntries(report.outputYJointVector.joints.reduce((counts, { outputYAdjustment, count }) => counts.set(outputYAdjustment, (counts.get(outputYAdjustment) ?? 0) + count), new Map())), {
    "-48": 156, "-39": 33, "-32": 41, "-23": 87, "-16": 1028, "-7": 307, "0": 309, "9": 308, "16": 1331,
  });
});

test("K01 vector rejects malformed storage and non-K01 dimensions", () => {
  assert.throws(() => reproduceK01CellProjectionVector(Buffer.alloc(0)), /too short/u);
  const map = readFileSync(mapPath);
  const alteredDimensions = Buffer.from(map);
  alteredDimensions.writeUInt32LE(59, 0x2da0);
  assert.throws(() => reproduceK01CellProjectionVector(alteredDimensions), /Expected hash-bound K01 dimensions/u);
});

test("extractor rejects a one-byte change to every hash-bound primary input", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-cell-projection-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [label, source, option, expected] of [
    ["executable", executablePath, "executablePath", /not an MZ executable|SHA-256 mismatch/u],
    ["map", mapPath, "mapPath", /SHA-256 mismatch/u],
    ["functions", functionsPath, "functionsPath", /static functions SHA-256 mismatch/u],
    ["references", referencesPath, "referencesPath", /static references SHA-256 mismatch/u],
  ]) {
    const target = join(directory, label);
    copyFileSync(source, target);
    const bytes = readFileSync(target);
    bytes[0] ^= 0xff;
    writeFileSync(target, bytes);
    assert.throws(() => extractK01CellProjectionEvidence({ executablePath, mapPath, functionsPath, referencesPath, [option]: target }), expected);
  }
});

test("CLI is deterministic with explicit canonical source paths", () => {
  const args = [extractorPath, "--executable", executablePath, "--map", mapPath, "--functions", functionsPath, "--references", referencesPath];
  const first = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: "utf8" });
  const second = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.equal(JSON.parse(first.stdout).outputYJointVector.stream.sha256, "4483d6b50a3bf13220c21e4aa7fcf5c7e10216010be45e6aee759dd4a6c14796");
});
