import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  extractK01MapLowNibbleWriters,
  isStandardLowNibbleAddressConstructionBytes,
  writeLowNibbleOne,
  writeLowNibbleTwo,
} from "./extract-k01-map-low-nibble-writers.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const extractorPath = join(dirname(fileURLToPath(import.meta.url)), "extract-k01-map-low-nibble-writers.mjs");
const fixture = JSON.parse(readFileSync(join(repositoryRoot, "analysis/fixtures/k01-map-low-nibble-writers.json"), "utf8"));

test("standard-address scan fixes all 21 classified occurrences, five direct writers, provenance, and transforms", () => {
  const report = extractK01MapLowNibbleWriters({ executablePath, functionsPath, referencesPath });
  assert.deepEqual(pickReport(report), fixture);
  assert.deepEqual(report.staticAnalysis.functions.functionProvenance.map(({ entry, instructionSha256, rawBodySha256 }) => [entry, instructionSha256, rawBodySha256]), [
    ["0x004646e0", "4399ed2c86fa3810846148f11475757effaa8f87fdcc5f5f36f0babb4ee03f21", "036a602fc7cdf5ea37c5da2146b2e90e4b7612544d3078e18a55ef94346ba8c9"],
    ["0x0046dbc0", "994f7743c1287168cc85e375ac4ff3e91a02b87248a0e19ed890b53602b63902", "ed2d5cf7fbb1c0736ac671ffbb10a299e862ad6869e8138d61ca45bf03d22e17"],
    ["0x0046dfd0", "5e3d0c0e35540a7c2c349bb83cc6e511b40c0cf3ebe1c6891a19b39448e78552", "17efb630c7e96349b0300b89927c3619867fb41353ae537530e2c095bcda3664"],
    ["0x0046ba00", "8325a4ffc05cc127cc5798ac31ef2ceb324f241af2dec116e266f40e12afecd9", "7233c1a8619b985ccac54d72f03ef7a9617bacab27dc34a0424ef63d7f701abf"],
  ]);
});

test("low-nibble writers preserve the high nibble and force exactly one or two", () => {
  for (const [oldValue, one, two] of [[0x00, 0x01, 0x02], [0x0f, 0x01, 0x02], [0xa5, 0xa1, 0xa2], [0xff, 0xf1, 0xf2]]) {
    assert.equal(writeLowNibbleOne(oldValue), one);
    assert.equal(writeLowNibbleTwo(oldValue), two);
  }
});

test("low-nibble writer evaluators reject non-canonical bytes", () => {
  for (const value of [-1, 0x100, 1.5, undefined]) {
    assert.throws(() => writeLowNibbleOne(value), /unsigned byte/);
    assert.throws(() => writeLowNibbleTwo(value), /unsigned byte/);
  }
});

test("the construction matcher rejects near matches instead of classifying them as standard-form sites", () => {
  assert.equal(isStandardLowNibbleAddressConstructionBytes(Buffer.from([0x8d, 0x84, 0x80, 0x5d, 0x16, 0x00, 0x00])), true);
  assert.equal(isStandardLowNibbleAddressConstructionBytes(Buffer.from([0x8d, 0x84, 0x80, 0x5c, 0x16, 0x00, 0x00])), false);
  assert.equal(isStandardLowNibbleAddressConstructionBytes(Buffer.from([0x8d, 0x84, 0x80, 0x5d, 0x16, 0x00, 0x01])), false);
});

test("extractor rejects tampered executable and generated evidence before reporting", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-low-nibble-tamper-"));
  const targets = [["exe", executablePath, "executablePath", /original executable SHA-256 mismatch/], ["functions", functionsPath, "functionsPath", /static functions SHA-256 mismatch/], ["references", referencesPath, "referencesPath", /static references SHA-256 mismatch/]];
  try {
    for (const [name, source, optionName, expected] of targets) {
      const path = join(directory, name);
      const bytes = readFileSync(source);
      bytes[bytes.length - 1] ^= 1;
      writeFileSync(path, bytes);
      assert.throws(() => extractK01MapLowNibbleWriters({ executablePath, functionsPath, referencesPath, [optionName]: path }), expected);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI honors all explicit source-path overrides and is deterministic", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-low-nibble-cli-"));
  const copiedExecutable = join(directory, "imjinrok2.exe");
  const copiedFunctions = join(directory, "functions.json");
  const copiedReferences = join(directory, "references.json");
  try {
    for (const [source, destination] of [[executablePath, copiedExecutable], [functionsPath, copiedFunctions], [referencesPath, copiedReferences]]) writeFileSync(destination, readFileSync(source));
    const args = [extractorPath, "--executable", copiedExecutable, "--functions", copiedFunctions, "--references", copiedReferences];
    const first = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: "utf8" });
    const second = spawnSync(process.execPath, args, { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    const report = JSON.parse(first.stdout);
    assert.equal(report.sources.executable.path, copiedExecutable);
    assert.equal(report.staticAnalysis.functions.path, copiedFunctions);
    assert.equal(report.staticAnalysis.references.path, copiedReferences);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function pickReport(report) {
  return {
    sources: { executable: { size: report.sources.executable.size, sha256: report.sources.executable.sha256 } },
    field: report.field,
    standardAddressScan: {
      totalOccurrences: report.standardAddressScan.totalOccurrences,
      constructions: report.standardAddressScan.constructions,
      readSites: report.standardAddressScan.readSites.map(({ constructionVa, classification }) => ({ constructionVa, classification })),
      directWriters: report.standardAddressScan.directWriters,
    },
    staticAnalysis: {
      functions: { size: report.staticAnalysis.functions.size, sha256: report.staticAnalysis.functions.sha256, sourceSha256: report.staticAnalysis.functions.sourceSha256, entries: report.staticAnalysis.functions.functionProvenance.map(({ entry }) => entry) },
      references: { size: report.staticAnalysis.references.size, sha256: report.staticAnalysis.references.sha256, sourceSha256: report.staticAnalysis.references.sourceSha256, requiredCallEdges: report.staticAnalysis.references.requiredCallEdges },
    },
    transforms: report.transforms,
  };
}
