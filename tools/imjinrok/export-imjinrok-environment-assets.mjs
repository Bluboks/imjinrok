#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const defaultAssetRoot = resolve(repositoryRoot, "apps/game-client/public/assets/themes/default");
const representatives = ["grss1.ytl", "sea0.ytl", "hill0.ytl"];

export function exportImjinrokEnvironmentAssets(options = {}) {
  const originalRoot = options.originalRoot ?? defaultOriginalRoot;
  const assetRoot = options.assetRoot ?? defaultAssetRoot;

  for (const theme of ["normal", "snow", "brown"]) {
    for (const fileName of representatives) {
      convertSprite(originalRoot, resolve(assetRoot, "terrain", `imjinrok-${theme}`), `tile/${theme}/${fileName}`);
    }
  }

  for (const fileName of ["crop0.spr", "tree0.spr", "resource.spr"]) {
    convertSprite(originalRoot, resolve(assetRoot, "resources", "imjinrok"), `fnt/${fileName}`);
  }

  const nightOutput = resolve(assetRoot, "environment", "imjinrok-night");
  mkdirSync(nightOutput, { recursive: true });
  for (const fileName of ["night1.pal", "night2.pal", "night3.pal", "night4.pal"]) {
    writePaletteManifest(originalRoot, nightOutput, `pal/${fileName}`);
  }

  return { assetRoot, exportedThemes: ["normal", "snow", "brown"], resourceCandidates: ["crop0", "tree0", "resource"] };
}

function convertSprite(originalRoot, outputDirectory, sourcePath) {
  const result = spawnSync(process.execPath, [
    resolve(repositoryRoot, "tools/imjinrok/convert-sprites.mjs"),
    "--input", resolve(originalRoot, sourcePath),
    "--out", outputDirectory,
    "--frames", "0",
  ], { cwd: repositoryRoot, encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`Failed to export ${sourcePath}: ${result.stderr || result.stdout}`);
  }
}

function writePaletteManifest(originalRoot, outputDirectory, sourcePath) {
  const source = readFileSync(resolve(originalRoot, sourcePath));
  const outputName = `${sourcePath.split("/").at(-1)}.json`;
  writeFileSync(resolve(outputDirectory, outputName), `${JSON.stringify({
    source: sourcePath,
    sha256: createHash("sha256").update(source).digest("hex"),
    evidenceStatus: "unresolved",
  }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportImjinrokEnvironmentAssets();
}
