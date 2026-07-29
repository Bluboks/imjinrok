import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { copyGlobalMask, eligibilityMask, extractK01GlobalMaskBoundary, selectGlobalMask } from "./extract-k01-global-mask-boundary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const paths = { executablePath: join(root, "original/imjinrok2/imjinrok2.exe"), functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"), referencesPath: join(root, "analysis/generated/imjinrok2/references.json"), seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json") };
const fixture = JSON.parse(readFileSync(join(root, "analysis/fixtures/k01-global-mask-boundary.json"), "utf8"));

test("global mask has one bound copy function, three canonical READs, and zero canonical WRITEs", () => {
  const report = extractK01GlobalMaskBoundary(paths);
  assert.deepEqual(pick(report), fixture);
  assert.equal(report.staticAnalysis.functionProvenance.length, 3);
  assert.match(report.residualBoundary, /alias\/computed/);
});
test("initialized mask, eligibility OR, copy, and owner boundary reproduce complete outputs", () => {
  assert.equal(eligibilityMask(0x136a), 0x336e);
  assert.deepEqual(copyGlobalMask(0x136a), { runtimeCopyWord: 0x136a });
  assert.deepEqual(selectGlobalMask(2, 0x5555, 0x136a), { source: "runtime-copy-0x00aa3fe8", selectedWord: 0x5555 });
  assert.deepEqual(selectGlobalMask(3, 0x5555, 0x136a), { source: "direct-global-0x004bdfd0", selectedWord: 0x136a });
  for (const value of [-1, 0x10000, 1.5]) assert.throws(() => eligibilityMask(value), /unsigned word/);
  for (const value of [-1, 0x10000, 1.5]) assert.throws(() => selectGlobalMask(value, 0, 0), /ownerWord must be an unsigned word/);
  assert.deepEqual(selectGlobalMask(2, 1, { valueOf() { throw new Error("unreachable global read"); } }), { source: "runtime-copy-0x00aa3fe8", selectedWord: 1 });
  assert.deepEqual(selectGlobalMask(3, { valueOf() { throw new Error("unreachable copy read"); } }, 2), { source: "direct-global-0x004bdfd0", selectedWord: 2 });
});
test("extractor rejects tampered source-bound artifacts", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-global-mask-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, source, key] of [["exe", paths.executablePath, "executablePath"], ["functions", paths.functionsPath, "functionsPath"], ["references", paths.referencesPath, "referencesPath"], ["seeds", paths.seedsPath, "seedsPath"]]) {
    const target = join(directory, name); const bytes = readFileSync(source); bytes[bytes.length - 1] ^= 1; writeFileSync(target, bytes);
    assert.throws(() => extractK01GlobalMaskBoundary({ ...paths, [key]: target }), /SHA-256 mismatch/);
  }
});
test("CLI is deterministic with explicit override paths", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-global-mask-cli-")); const copied = join(directory, "imjinrok2.exe"); writeFileSync(copied, readFileSync(paths.executablePath));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const command = [join(root, "tools/imjinrok/extract-k01-global-mask-boundary.mjs"), "--executable", copied];
  const first = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8" }); const second = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr); assert.equal(first.stdout, second.stdout);
});
function pick(report) { const compact = ({ size, sha256, sourceSha256 }) => ({ size, sha256, sourceSha256 }); return { sources: { executable: { size: report.sources.executable.size, sha256: report.sources.executable.sha256 } }, staticAnalysis: { functions: compact(report.staticAnalysis.functions), references: compact(report.staticAnalysis.references), seeds: compact(report.staticAnalysis.seeds), directWriteCount: report.staticAnalysis.directWriteCount, copyJump: report.staticAnalysis.copyJump, targetReferences: report.staticAnalysis.targetReferences, seededFunction: report.staticAnalysis.seededFunction }, initializedMask: report.initializedMask, vectors: report.vectors }; }
