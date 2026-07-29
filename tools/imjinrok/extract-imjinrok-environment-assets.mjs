#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");

export function extractImjinrokEnvironmentAssets(options = {}) {
  const originalRoot = options.originalRoot ?? defaultOriginalRoot;
  const sourceFiles = [
    ...collectTilesetAssets(originalRoot),
    ...["pal/night1.pal", "pal/night2.pal", "pal/night3.pal", "pal/night4.pal", "tempeft/night1.YAV"].map((path) => catalogFile(originalRoot, path, "environment")),
    ...["fnt/crop0.spr", "fnt/crop1.spr", "fnt/tree0.spr", "fnt/resource.spr", "fnt/helpresource.spr"].map((path) => catalogFile(originalRoot, path, "resource-candidate")),
  ];

  return {
    generatedBy: "tools/imjinrok/extract-imjinrok-environment-assets.mjs",
    originalRoot: relative(repositoryRoot, originalRoot),
    sourceFiles,
  };
}

function collectTilesetAssets(originalRoot) {
  const themes = ["normal", "snow", "brown"];
  return themes.flatMap((theme) => {
    const themeRoot = resolve(originalRoot, "tile", theme);
    return readdirSync(themeRoot)
      .filter((fileName) => /^(grss|sea|shallow|hill|diff|castle|newblk|fog)/i.test(fileName))
      .sort()
      .map((fileName) => catalogFile(originalRoot, `tile/${theme}/${fileName}`, `tileset:${theme}`));
  });
}

function catalogFile(originalRoot, sourcePath, category) {
  const absolutePath = resolve(originalRoot, sourcePath);
  const contents = readFileSync(absolutePath);
  return {
    category,
    sourcePath,
    size: statSync(absolutePath).size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

function parseArgs(argv) {
  const outputIndex = argv.indexOf("--output");
  if (outputIndex === -1) {
    return {};
  }
  const output = argv[outputIndex + 1];
  if (!output) {
    throw new Error("--output requires a path");
  }
  return { output: resolve(repositoryRoot, output) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractImjinrokEnvironmentAssets();
  const rendered = `${JSON.stringify(report, null, 2)}\n`;

  if (args.output) {
    writeFileSync(args.output, rendered);
  } else {
    process.stdout.write(rendered);
  }
}
