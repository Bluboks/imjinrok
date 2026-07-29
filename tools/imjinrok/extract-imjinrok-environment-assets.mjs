#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpriteLikeHeader } from "./codec.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const TILESET_THEMES = ["normal", "snow", "brown"];
const TILESET_FAMILY_PATTERN = /^(grss|sea|shallow|hill|diff|castle|newblk|fog)/i;
const TILESET_FILE_PATTERN = /\.(spr|ytl|ypr)$/i;
const SPRITE_LIKE_EXTENSIONS = new Set([".spr", ".ytl", ".ypr"]);
const EXPECTED_TILESET_SOURCE_DIGESTS = {
  normal: "2dcbbd197fff61ac6a6fdc3b979f1150a2bd1cdcb85912eec9a85b7251465b0e",
  snow: "a8b2235f15077d490d9f68ea7d871a0aa7acda12b7b8ef47bcc8c6fecc24be18",
  brown: "86adbbd1ede4404704b66e9b546eb4b375cd73c10a22aafc1e2fc48b05e1ad81",
};

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
    tilesetSymmetry: summarizeTilesetSymmetry(sourceFiles),
  };
}

function collectTilesetAssets(originalRoot) {
  const sourceFiles = TILESET_THEMES.flatMap((theme) => {
    const themeRoot = resolve(originalRoot, "tile", theme);
    const names = readdirSync(themeRoot);
    // Preserve the prior catalog order for its existing family entries, then
    // append black/blacktile entries needed for the complete 78-file container set.
    const knownFamilyNames = names.filter((fileName) => TILESET_FAMILY_PATTERN.test(fileName)).sort();
    const additionalTileNames = names
      .filter((fileName) => TILESET_FILE_PATTERN.test(fileName) && !TILESET_FAMILY_PATTERN.test(fileName))
      .sort();

    return [...knownFamilyNames, ...additionalTileNames]
      .map((fileName) => catalogFile(originalRoot, `tile/${theme}/${fileName}`, `tileset:${theme}`));
  });

  assertTilesetSourceDigests(sourceFiles);
  return sourceFiles;
}

function catalogFile(originalRoot, sourcePath, category) {
  const absolutePath = resolve(originalRoot, sourcePath);
  const contents = readFileSync(absolutePath);
  const extension = extname(sourcePath).toLowerCase();
  const entry = {
    category,
    sourcePath,
    size: statSync(absolutePath).size,
    sha256: createHash("sha256").update(contents).digest("hex"),
    extension,
    familyStem: getFamilyStem(sourcePath, category),
  };

  if (!SPRITE_LIKE_EXTENSIONS.has(extension)) {
    return entry;
  }

  const header = parseSpriteLikeHeader(contents, sourcePath);
  return {
    ...entry,
    width: header.width,
    height: header.height,
    frameCount: header.frameCount,
    endOffset: header.endOffset,
  };
}

function getFamilyStem(sourcePath, category) {
  const stem = basename(sourcePath, extname(sourcePath)).toLowerCase();
  if (category.startsWith("tileset:")) {
    return stem.match(TILESET_FAMILY_PATTERN)?.[1]?.toLowerCase() ?? stem;
  }

  return stem.replace(/[0-9]+$/, "");
}

function assertTilesetSourceDigests(sourceFiles) {
  for (const theme of TILESET_THEMES) {
    const rows = sourceFiles
      .filter((entry) => entry.category === `tileset:${theme}`)
      .map((entry) => `${entry.sourcePath}\t${entry.size}\t${entry.sha256}\n`)
      .join("");
    const actual = createHash("sha256").update(rows).digest("hex");
    const expected = EXPECTED_TILESET_SOURCE_DIGESTS[theme];

    if (actual !== expected) {
      throw new Error(`tileset:${theme} source digest mismatch: expected ${expected}, got ${actual}`);
    }
  }
}

function summarizeTilesetSymmetry(sourceFiles) {
  const themes = Object.fromEntries(TILESET_THEMES.map((theme) => {
    const entries = sourceFiles.filter((entry) => entry.category === `tileset:${theme}`);
    return [theme, {
      fileCount: entries.length,
      fileNames: entries.map((entry) => basename(entry.sourcePath)).sort(),
      headerShapes: Object.fromEntries(entries
        .map((entry) => [basename(entry.sourcePath), toHeaderShape(entry)])
        .sort(([left], [right]) => left.localeCompare(right))),
    }];
  }));
  const normal = themes.normal;
  const fileNameSetsSymmetric = TILESET_THEMES.every((theme) => JSON.stringify(themes[theme].fileNames) === JSON.stringify(normal.fileNames));
  const headerShapesSymmetric = TILESET_THEMES.every((theme) => JSON.stringify(themes[theme].headerShapes) === JSON.stringify(normal.headerShapes));

  return { themes, fileNameSetsSymmetric, headerShapesSymmetric };
}

function toHeaderShape(entry) {
  if (entry.width === undefined || entry.height === undefined || entry.frameCount === undefined || entry.endOffset === undefined) {
    throw new Error(`${entry.sourcePath}: tileset source has no sprite-like header`);
  }

  return {
    extension: entry.extension,
    familyStem: entry.familyStem,
    width: entry.width,
    height: entry.height,
    frameCount: entry.frameCount,
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
