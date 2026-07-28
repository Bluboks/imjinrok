import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  extractK01MapTerrainContract,
  K01_RAW_VALUE_PROJECTION,
  projectK01RawValues,
  readK01RawValue,
} from "./extract-k01-map-terrain-contract.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const mapPath = join(repositoryRoot, "original/imjinrok2/stagemap/k01.map");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const portSourcePath = join(repositoryRoot, "packages/shared/src/imjinrokMaps.ts");
const fixture = JSON.parse(readFileSync(join(repositoryRoot, "analysis/fixtures/k01-map-terrain-contract.json"), "utf8"));

test("K01 hash-bound raw projection reproduces the complete RLE and record-crossing vectors", () => {
  const report = extractK01MapTerrainContract({ mapPath, executablePath, portSourcePath });

  assert.deepEqual(report.sources.map.size, fixture.map.size);
  assert.deepEqual(report.sources.map.sha256, fixture.map.sha256);
  assert.deepEqual(report.sources.executable.size, fixture.executable.size);
  assert.deepEqual(report.sources.executable.sha256, fixture.executable.sha256);
  assert.deepEqual(report.sources.portSource.size, fixture.portSource.size);
  assert.deepEqual(report.sources.portSource.sha256, fixture.portSource.sha256);
  assert.deepEqual(pickProjection(report.projection), fixture.projection);
  assert.deepEqual(report.values, fixture.values);
  assert.deepEqual(report.portSourceBinding, fixture.portSourceBinding);
  assert.equal(report.parserProvenance.mapLoad.matched, true);
  assert.equal(report.parserProvenance.dimensions.matched, true);
  assert.equal(report.interpretationLimits.terrainValueMapping.includes("unconfirmed"), true);
});

test("K01 raw projection rejects stale source bytes before producing a value", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-map-contract-"));
  const tamperedMapPath = join(directory, "k01.map");
  const tampered = readFileSync(mapPath);
  tampered[0] ^= 0x01;
  writeFileSync(tamperedMapPath, tampered);

  try {
    assert.throws(
      () => extractK01MapTerrainContract({ mapPath: tamperedMapPath, executablePath, portSourcePath }),
      /K01 map SHA-256 mismatch/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("K01 raw projection rejects a tampered executable before accepting static provenance", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-executable-contract-"));
  const tamperedExecutablePath = join(directory, "imjinrok2.exe");
  const tampered = readFileSync(executablePath);
  tampered[0] ^= 0x01;
  writeFileSync(tamperedExecutablePath, tampered);

  try {
    assert.throws(
      () => extractK01MapTerrainContract({ mapPath, executablePath: tamperedExecutablePath, portSourcePath }),
      /original executable SHA-256 mismatch/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("K01 raw projection rejects a port source whose hash no longer binds the named terrain literal", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-port-source-contract-"));
  const tamperedPortSourcePath = join(directory, "imjinrokMaps.ts");
  const tampered = readFileSync(portSourcePath);
  tampered[tampered.length - 1] ^= 0x01;
  writeFileSync(tamperedPortSourcePath, tampered);

  try {
    assert.throws(
      () => extractK01MapTerrainContract({ mapPath, executablePath, portSourcePath: tamperedPortSourcePath }),
      /K01 port source SHA-256 mismatch/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("K01 raw projection rejects truncated maps and coordinates outside the complete contract", () => {
  const requiredLength = fixture.projection.streamEndAbsoluteExclusive;
  assert.throws(() => projectK01RawValues(Buffer.alloc(requiredLength - 1)), /requires at least/);
  assert.throws(() => readK01RawValue(Buffer.alloc(requiredLength), -1, 0), /outside/);
  assert.throws(
    () => readK01RawValue(Buffer.alloc(requiredLength), K01_RAW_VALUE_PROJECTION.width, 0),
    /outside/,
  );
  assert.throws(() => readK01RawValue(Buffer.alloc(requiredLength), 0.5, 0), /must be integers/);
});

function pickProjection(projection) {
  return {
    width: projection.width,
    height: projection.height,
    coordinateOrder: projection.coordinateOrder,
    recordRegionOffset: projection.recordRegionOffset,
    streamStartInRecordRegion: projection.streamStartInRecordRegion,
    rowStride: projection.rowStride,
    valueWidthBytes: projection.valueWidthBytes,
    streamStartAbsolute: projection.streamStartAbsolute,
    streamEndAbsoluteExclusive: projection.streamEndAbsoluteExclusive,
  };
}
