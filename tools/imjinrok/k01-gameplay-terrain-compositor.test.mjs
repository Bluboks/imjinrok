import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01GameplayTerrainCompositorEvidence } from "./extract-k01-gameplay-terrain-compositor.mjs";

const fixture = JSON.parse(readFileSync(resolve("analysis/fixtures/k01-gameplay-terrain-compositor.json"), "utf8"));
const executablePath = resolve("original/imjinrok2/imjinrok2.exe");
const mapPath = resolve("original/imjinrok2/stagemap/k01.map");
const originalRoot = resolve("original/imjinrok2");

test("extracts the hash-bound gameplay compositor and exact camera(0,0) vector", () => {
  const first = extractK01GameplayTerrainCompositorEvidence();
  const second = extractK01GameplayTerrainCompositorEvidence();
  assert.deepEqual(first, second);
  assert.equal(first.compositor.target.width, fixture.compositor.target.width);
  assert.equal(first.compositor.target.height, fixture.compositor.target.height);
  assert.deepEqual(first.compositor.clip, fixture.compositor.clip);
  assert.equal(first.compositor.clear.index, fixture.compositor.clearIndex);
  assert.deepEqual(first.compositor.clear.paletteEntryRgb, fixture.compositor.paletteEntry0Rgb);
  assert.deepEqual(first.compositor.payload, fixture.compositor.payload);
  const vector = {
    ...first.compositor.vector,
    cells: first.compositor.vector.cells.map(({ x, y, stem, frame, rawVerticalShiftPx, draw, payloadWrites }) => ({ x, y, stem, frame, rawVerticalShiftPx, draw, payloadWrites })),
  };
  assert.deepEqual(vector, fixture.compositor.vector);
  assert.deepEqual(first.channelDigests, fixture.channelDigests);
  assert.deepEqual(first.functions.map(({ name, bodyRange, instructionCount, instructionSha256, rawBodySha256 }) => ({ name, bodyRange, instructionCount, instructionSha256, rawBodySha256 })), fixture.functions);
  assert.equal(first.compositor.defaultBlitter.payloadIndex0Opaque, true);
  assert.equal(first.compositor.defaultBlitter.payloadIndexFeOpaqueIfPresent, true);
  assert.equal(first.compositor.defaultBlitter.skippedSpansRetainClear, true);
});

test("rejects tampered original compositor inputs before emitting evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-gameplay-compositor-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const alteredExecutable = join(directory, "imjinrok2.exe");
  const executable = readFileSync(executablePath);
  executable[0] ^= 0xff;
  writeFileSync(alteredExecutable, executable);
  assert.throws(() => extractK01GameplayTerrainCompositorEvidence({ executablePath: alteredExecutable }), /SHA-256 mismatch|MZ executable/u);

  const alteredMap = join(directory, "k01.map");
  cpSync(mapPath, alteredMap);
  const map = readFileSync(alteredMap);
  map[0x32514] ^= 0xff;
  writeFileSync(alteredMap, map);
  assert.throws(() => extractK01GameplayTerrainCompositorEvidence({ mapPath: alteredMap }), /SHA-256 mismatch/u);
});

test("rejects tampered selected YTL, palette, generated artifact, and function metadata inputs", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "k01-gameplay-compositor-inputs-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourceRoot = join(directory, "imjinrok2");
  mkdirSync(join(sourceRoot, "tile", "normal"), { recursive: true });
  mkdirSync(join(sourceRoot, "pal"), { recursive: true });
  for (const fileName of readdirSync(resolve(originalRoot, "tile", "normal"))) {
    if (fileName.endsWith(".ytl")) cpSync(resolve(originalRoot, "tile", "normal", fileName), resolve(sourceRoot, "tile", "normal", fileName));
  }
  for (const fileName of ["imjin2.pal", "night1.pal", "night2.pal", "night3.pal", "night4.pal"]) {
    cpSync(resolve(originalRoot, "pal", fileName), resolve(sourceRoot, "pal", fileName));
  }

  const alteredYtl = resolve(sourceRoot, "tile", "normal", "hill0.ytl");
  const ytl = readFileSync(alteredYtl);
  ytl[0x0bf4] ^= 0xff;
  writeFileSync(alteredYtl, ytl);
  assert.throws(() => extractK01GameplayTerrainCompositorEvidence({ originalRoot: sourceRoot }), /hill0\.ytl SHA-256 mismatch/u);

  const cleanYtl = readFileSync(resolve(originalRoot, "tile", "normal", "hill0.ytl"));
  writeFileSync(alteredYtl, cleanYtl);
  const alteredPalette = resolve(sourceRoot, "pal", "night3.pal");
  const palette = readFileSync(alteredPalette);
  palette[0] ^= 0xff;
  writeFileSync(alteredPalette, palette);
  assert.throws(() => extractK01GameplayTerrainCompositorEvidence({ originalRoot: sourceRoot }), /night3\.pal SHA-256 mismatch/u);

  const alteredArtifact = join(directory, "k01SourceTileVisualArtifact.ts");
  let artifact = readFileSync(resolve("packages/shared/src/generated/k01SourceTileVisualArtifact.ts"), "utf8");
  artifact = artifact.replace(/(pairBytesBase64": ")([A-Za-z0-9+/])/, "$1B");
  writeFileSync(alteredArtifact, artifact);
  assert.throws(() => extractK01GameplayTerrainCompositorEvidence({ artifactPath: alteredArtifact }), /object stream|frame stream/u);

  const alteredFunctions = join(directory, "functions.json");
  let functions = readFileSync(resolve("analysis/generated/imjinrok2/functions.json"), "utf8");
  functions = functions.replace("a1d0c6254193bc293f4010fcd81250c43549a5af500fda5b59c076b77888cbf3", "0000000000000000000000000000000000000000000000000000000000000000");
  writeFileSync(alteredFunctions, functions);
  assert.throws(() => extractK01GameplayTerrainCompositorEvidence({ functionsPath: alteredFunctions }), /FUN_004676e0 instruction SHA-256/u);
});
