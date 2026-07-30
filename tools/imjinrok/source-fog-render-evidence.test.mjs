import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractSourceFogRenderEvidence, lookupFogNeighborMask } from "./extract-source-fog-render-evidence.mjs";

const fixturePath = resolve("analysis/fixtures/source-fog-render-evidence.json");
const executablePath = resolve("original/imjinrok2/imjinrok2.exe");

test("extracts the hash-bound source fog render contract byte-identically", () => {
  const fixture = readFileSync(fixturePath, "utf8");
  const first = `${JSON.stringify(extractSourceFogRenderEvidence(), null, 2)}\n`;
  const second = `${JSON.stringify(extractSourceFogRenderEvidence(), null, 2)}\n`;
  assert.equal(first, fixture);
  assert.equal(second, fixture);

  const report = JSON.parse(first);
  assert.deepEqual(report.neighborLookup.vectors, [
    { input: 0, output: 0 }, { input: 1, output: 9 }, { input: 2, output: 8 }, { input: 3, output: 2 },
    { input: 4, output: 10 }, { input: 5, output: 1 }, { input: 6, output: 12 }, { input: 7, output: 5 },
    { input: 8, output: 11 }, { input: 9, output: 13 }, { input: 10, output: 3 }, { input: 11, output: 6 },
    { input: 12, output: 0 }, { input: 13, output: 4 }, { input: 14, output: 7 }, { input: 15, output: 0 },
  ]);
  assert.deepEqual(report.resources.fog.map(({ resourceIndex, fileName, header }) => [resourceIndex, fileName, header]), Array.from({ length: 15 }, (_value, index) => [60 + index, `fog${index}.spr`, { width: 32, height: 16, frameCount: 96 }]));
  assert.deepEqual(report.resources.black, { resourceIndex: 75, recordAddress: "0x00c061a0", fileName: "black.spr", sourcePath: "original/imjinrok2/tile/normal/black.spr", sha256: "9ef53a565bfe804e8a272f73f9749c05681b6b9e3af4090f7e4eea61237292d0", header: { width: 64, height: 32, frameCount: 1 } });
  assert.deepEqual(report.composition.subframeGrid, { columns: 3, rows: 2, subframeCount: 6 });
  assert.deepEqual(report.callerContract.separateNeighborStateValues, [4, 8]);
});

test("lookup helper accepts only the byte-proven table domain", () => {
  assert.equal(lookupFogNeighborMask(0), 0);
  assert.equal(lookupFogNeighborMask(13), 4);
  assert.equal(lookupFogNeighborMask(15), 0);
  assert.throws(() => lookupFogNeighborMask(-1), /0\.\.15/u);
  assert.throws(() => lookupFogNeighborMask(16), /0\.\.15/u);
  assert.throws(() => lookupFogNeighborMask(1.5), /0\.\.15/u);
});

test("rejects a changed original executable before emitting evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "source-fog-render-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutable = join(directory, "imjinrok2.exe");
  const bytes = readFileSync(executablePath);
  bytes[0x000bf9c4] ^= 0xff;
  writeFileSync(alteredExecutable, bytes);
  assert.throws(() => extractSourceFogRenderEvidence({ executablePath: alteredExecutable }), /SHA-256 mismatch/u);
});
