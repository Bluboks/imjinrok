import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { extractImjinrokEnvironmentAssets } from "./extract-imjinrok-environment-assets.mjs";
import { extractImjinrokTilesetLoaderBoundary } from "./extract-imjinrok-tileset-loader-boundary.mjs";
import { extractK01SourceTileSelector, resolveK01SourceTile } from "./extract-k01-source-tile-selector.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalRoot = join(repositoryRoot, "original/imjinrok2");
const mapPath = join(originalRoot, "stagemap/k01.map");
const executablePath = join(originalRoot, "imjinrok2.exe");
const fixture = JSON.parse(readFileSync(join(repositoryRoot, "analysis/fixtures/k01-source-tile-selector.json"), "utf8"));

test("source-binds every K01 x-major object/frame pair to a normal loader source", () => {
  const report = extractK01SourceTileSelector({ executablePath, mapPath, originalRoot });
  assert.deepEqual(report, fixture);
  assert.equal(report.map.themeId, 0);
  assert.equal(report.map.storage.coordinateOrder.startsWith("x-major"), true);
  assert.equal(report.pairStream.count, 3600);
  assert.equal(report.pairStream.uniquePairCount, 243);
  assert.deepEqual(report.objects.map((object) => object.objectIndex), [...Array.from({ length: 14 }, (_value, index) => index), ...Array.from({ length: 13 }, (_value, index) => index + 16), ...Array.from({ length: 13 }, (_value, index) => index + 31)]);

  const map = readFileSync(mapPath);
  const bytes = [];
  for (let x = 0; x < report.map.width; x += 1) {
    for (let y = 0; y < report.map.height; y += 1) {
      const pair = resolveK01SourceTile(map, report.objects, x, y);
      bytes.push(pair.objectIndex, pair.frameIndex);
    }
  }
  assert.equal(bytes.length, report.pairStream.byteCount);
  assert.equal(createHash("sha256").update(Buffer.from(bytes)).digest("hex"), report.pairStream.sha256);
  assert.equal(report.objects.every((object) => object.frameRange.max < object.frameCount), true);
});

test("resolver loudly rejects invalid coordinates, object indices, and frame indices", () => {
  const map = readFileSync(mapPath);
  assert.throws(() => resolveK01SourceTile(map, fixture.objects, -1, 0), /outside/u);
  assert.throws(() => resolveK01SourceTile(map, fixture.objects, 60, 0), /outside/u);
  assert.throws(() => resolveK01SourceTile(map, fixture.objects, 0.5, 0), /must be integers/u);

  const badObject = Buffer.from(map);
  badObject[0x3a3a4] = 44;
  assert.throws(() => resolveK01SourceTile(badObject, fixture.objects, 0, 0), /object index 44/u);
  const badFrame = Buffer.from(map);
  badFrame[0x42234] = 0xff;
  assert.throws(() => resolveK01SourceTile(badFrame, fixture.objects, 0, 0), /frame index 255 exceeds/u);
});

test("rejects stale executable, map, environment fixture, and source YTL bytes", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-source-tile-selector-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutable = join(directory, "imjinrok2.exe");
  const alteredMap = join(directory, "k01.map");
  const alteredEnvironmentFixture = join(directory, "environment.json");
  const alteredLoaderFixture = join(directory, "loader.json");
  copyFileSync(executablePath, alteredExecutable);
  copyFileSync(mapPath, alteredMap);
  copyFileSync(join(repositoryRoot, "analysis/fixtures/imjinrok-environment-assets.json"), alteredEnvironmentFixture);
  copyFileSync(join(repositoryRoot, "analysis/fixtures/imjinrok-tileset-loader-boundary.json"), alteredLoaderFixture);
  flipByte(alteredExecutable, 0x100);
  flipByte(alteredMap, 0);
  const staleEnvironmentFixture = JSON.parse(readFileSync(alteredEnvironmentFixture, "utf8"));
  staleEnvironmentFixture.generatedBy = "tampered";
  writeFileSync(alteredEnvironmentFixture, `${JSON.stringify(staleEnvironmentFixture)}\n`);
  const staleLoaderFixture = JSON.parse(readFileSync(alteredLoaderFixture, "utf8"));
  staleLoaderFixture.loader.recordStride = "tampered";
  writeFileSync(alteredLoaderFixture, `${JSON.stringify(staleLoaderFixture)}\n`);
  assert.throws(() => extractK01SourceTileSelector({ executablePath: alteredExecutable, mapPath, originalRoot }), /SHA-256 mismatch/u);
  assert.throws(() => extractK01SourceTileSelector({ executablePath, mapPath: alteredMap, originalRoot }), /SHA-256 mismatch/u);
  assert.throws(() => extractK01SourceTileSelector({ executablePath, mapPath, originalRoot, environmentFixturePath: alteredEnvironmentFixture }), /environment asset fixture does not match/u);
  assert.throws(() => extractK01SourceTileSelector({ executablePath, mapPath, originalRoot, loaderFixturePath: alteredLoaderFixture }), /tileset loader fixture does not match/u);

  const sourceRoot = copyEnvironmentSources();
  const customLoaderFixture = join(directory, "loader.json");
  const loader = extractImjinrokTilesetLoaderBoundary({ executablePath, tileDirectory: join(sourceRoot, "tile/normal") });
  writeFileSync(customLoaderFixture, `${JSON.stringify(loader)}\n`);
  flipByte(join(sourceRoot, "tile/normal/hill0.ytl"), 0);
  assert.throws(
    () => extractK01SourceTileSelector({ executablePath, mapPath, originalRoot: sourceRoot, loaderFixturePath: customLoaderFixture }),
    /tile\/normal\/hill0\.ytl: magic mismatch/u,
  );
});

function copyEnvironmentSources() {
  const root = mkdtempSync(join(tmpdir(), "k01-source-tile-input-"));
  const report = extractImjinrokEnvironmentAssets({ originalRoot });
  for (const entry of report.sourceFiles) {
    const destination = resolve(root, entry.sourcePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(originalRoot, entry.sourcePath), destination);
  }
  return root;
}

function flipByte(path, offset) {
  const bytes = readFileSync(path);
  bytes[offset] ^= 0xff;
  writeFileSync(path, bytes);
}
