import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_EXECUTABLE_SHA256,
  extractImjinrokTilesetLoaderBoundary,
  reproduceTilesetPrefix,
} from "./extract-imjinrok-tileset-loader-boundary.mjs";
import { readPeImage } from "./pe-image.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const fixturePath = join(repositoryRoot, "analysis/fixtures/imjinrok-tileset-loader-boundary.json");

test("source-binds the 76-entry tileset loader table, sentinel, record stride, cleanup, and disk-only files", () => {
  const report = extractImjinrokTilesetLoaderBoundary({ executablePath });
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

  assert.deepEqual(report, fixture);
  assert.equal(report.sources.executable.sha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(report.loader.filenameTable.loadedEntryCount, 76);
  assert.equal(report.loader.filenameTable.sentinel.pointer, "0x004cab44");
  assert.equal(report.loader.recordBase, "0x00bcdff8");
  assert.equal(report.loader.recordStride, "0x0bf8");
  assert.equal(report.cleanup.count, 0x4c);
  assert.deepEqual(report.diskCatalog.outsideMainLoaderTable, ["diff13l.ytl", "hill0.ypr"]);
  assert.match(report.diskCatalog.boundary, /does not claim they are unused/u);
});

test("reproduces signed-WORD directory selection with normal fallback", () => {
  assert.equal(reproduceTilesetPrefix(0), "tile\\normal\\");
  assert.equal(reproduceTilesetPrefix(1), "tile\\snow\\");
  assert.equal(reproduceTilesetPrefix(2), "tile\\brown\\");
  for (const selector of [-0x8000, -1, 3, 0x7fff]) {
    assert.equal(reproduceTilesetPrefix(selector), "tile\\normal\\", String(selector));
  }
  assert.throws(() => reproduceTilesetPrefix(0x8000), /signed 16-bit integer/u);
  assert.throws(() => reproduceTilesetPrefix(1.5), /signed 16-bit integer/u);
});

test("rejects tampering in the loader branches, table, sentinel, and cleanup", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-tileset-loader-boundary-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { image } = readPeImage(executablePath);

  for (const [label, va] of [["branch", 0x00443192], ["table", 0x004bc420], ["sentinel", 0x004bc550], ["cleanup", 0x00443327]]) {
    const alteredPath = join(directory, `${label}.exe`);
    copyFileSync(executablePath, alteredPath);
    flipByte(alteredPath, image.vaToRawOffset(va));
    assert.throws(
      () => extractImjinrokTilesetLoaderBoundary({ executablePath: alteredPath }),
      new RegExp(`${label}\\.exe SHA-256 mismatch`, "u"),
    );
  }
});

function flipByte(path, offset) {
  const bytes = readFileSync(path);
  bytes[offset] ^= 0xff;
  writeFileSync(path, bytes);
}
