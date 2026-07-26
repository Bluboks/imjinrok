#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseSpriteLikeHeader } from "./codec.mjs";

const DEFAULT_ROOT = "original/imjinrok2";
const ASSET_REF_PATTERN = /[A-Za-z0-9_./\\:-]+\.(spr|ytl|pal|map|yav|mpeg|pcx|bmp|dat|exe|hq)/gi;

const args = parseArgs(process.argv.slice(2));
const root = args.root ?? DEFAULT_ROOT;
const asJson = Boolean(args.json);

const files = listFiles(root);
const fileRecords = files.map((absolutePath) => {
  const relativePath = normalizePath(relative(root, absolutePath));
  return {
    absolutePath,
    relativePath,
    extension: getExtension(relativePath),
    directory: normalizePath(relativePath.split("/").slice(0, -1).join("/")) || ".",
    size: statSync(absolutePath).size,
  };
});

const spriteLike = inspectSpriteLikeFiles(fileRecords);
const executablePath = fileRecords.find((file) => file.relativePath.toLowerCase() === "imjinrok2.exe")?.absolutePath;
const executableRefs = executablePath
  ? inspectExecutableReferences(executablePath, fileRecords)
  : null;

const report = {
  root,
  generatedAt: new Date().toISOString(),
  totals: {
    files: fileRecords.length,
    bytes: fileRecords.reduce((sum, file) => sum + file.size, 0),
  },
  byExtension: countBy(fileRecords, (file) => file.extension),
  byTopLevelDirectory: countBy(fileRecords, (file) => file.relativePath.split("/")[0] || "."),
  tileThemes: inspectTileThemes(fileRecords),
  spriteLike,
  executableRefs,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report);
}

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--root") {
      parsed.root = argv[i + 1];
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function listFiles(rootPath) {
  const output = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile()) {
        output.push(path);
      }
    }
  }

  return output.sort();
}

function inspectSpriteLikeFiles(files) {
  const records = files.filter((file) => file.extension === "spr" || file.extension === "ytl");
  let valid = 0;
  const invalid = [];
  const byExtension = {};
  const dimensions = {};
  let totalFrames = 0;

  for (const file of records) {
    try {
      const header = parseSpriteLikeHeader(readFileSync(file.absolutePath), file.relativePath);
      valid += 1;
      totalFrames += header.frameCount;
      byExtension[file.extension] = (byExtension[file.extension] ?? 0) + 1;
      const dimensionKey = `${header.width}x${header.height}`;
      dimensions[dimensionKey] = (dimensions[dimensionKey] ?? 0) + 1;
    } catch (error) {
      invalid.push({ path: file.relativePath, reason: error.message });
    }
  }

  return {
    files: records.length,
    valid,
    invalid,
    totalFrames,
    byExtension,
    dimensions,
  };
}

function inspectTileThemes(files) {
  const themes = {};

  for (const file of files) {
    const parts = file.relativePath.split("/");
    if (parts[0] !== "tile" || parts.length < 3) {
      continue;
    }

    const theme = parts[1];
    themes[theme] ??= { files: 0, spr: 0, ytl: 0, ypr: 0 };
    themes[theme].files += 1;
    if (file.extension in themes[theme]) {
      themes[theme][file.extension] += 1;
    }
  }

  return themes;
}

function inspectExecutableReferences(executablePath, files) {
  const strings = extractAsciiStrings(readFileSync(executablePath));
  const refs = new Set();

  for (const value of strings) {
    for (const match of value.matchAll(ASSET_REF_PATTERN)) {
      refs.add(normalizePath(match[0].toLowerCase()));
    }
  }

  const existingPaths = new Set(files.map((file) => file.relativePath.toLowerCase()));
  const basenames = new Map();
  for (const file of files) {
    const basename = file.relativePath.split("/").at(-1).toLowerCase();
    basenames.set(basename, (basenames.get(basename) ?? 0) + 1);
  }

  const exact = [];
  const basenameOnly = [];
  const missing = [];

  for (const ref of [...refs].sort()) {
    const basename = ref.split("/").at(-1);
    if (existingPaths.has(ref)) {
      exact.push(ref);
    } else if (basenames.has(basename)) {
      basenameOnly.push(ref);
    } else {
      missing.push(ref);
    }
  }

  return {
    totalUniqueRefs: refs.size,
    exactMatches: exact.length,
    basenameMatches: basenameOnly.length,
    missing: missing.length,
    missingRefs: missing,
  };
}

function extractAsciiStrings(buffer) {
  const strings = [];
  let current = "";

  for (const byte of buffer) {
    if (byte >= 0x20 && byte <= 0x7e) {
      current += String.fromCharCode(byte);
      continue;
    }

    if (current.length >= 4) {
      strings.push(current);
    }
    current = "";
  }

  if (current.length >= 4) {
    strings.push(current);
  }

  return strings;
}

function countBy(items, getKey) {
  return Object.fromEntries(
    Object.entries(
      items.reduce((counts, item) => {
        const key = getKey(item) || "[unknown]";
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

function getExtension(path) {
  const basename = path.split("/").at(-1);
  const dot = basename.lastIndexOf(".");
  return dot === -1 ? "[no-ext]" : basename.slice(dot + 1).toLowerCase();
}

function normalizePath(path) {
  return path.split(sep).join("/").replaceAll("\\", "/");
}

function printHumanReport(report) {
  console.log(`IMJINROK asset inventory: ${report.root}`);
  console.log(`Files: ${report.totals.files}`);
  console.log(`Bytes: ${report.totals.bytes}`);
  console.log("");

  console.log("By extension:");
  for (const [extension, count] of Object.entries(report.byExtension)) {
    console.log(`  ${extension}: ${count}`);
  }
  console.log("");

  console.log("Tile themes:");
  for (const [theme, counts] of Object.entries(report.tileThemes)) {
    console.log(`  ${theme}: ${counts.files} files (${counts.ytl} ytl, ${counts.spr} spr, ${counts.ypr} ypr)`);
  }
  console.log("");

  console.log("SPR/YTL:");
  console.log(`  files: ${report.spriteLike.files}`);
  console.log(`  valid headers: ${report.spriteLike.valid}`);
  console.log(`  total frames: ${report.spriteLike.totalFrames}`);
  console.log(`  invalid headers: ${report.spriteLike.invalid.length}`);

  if (report.executableRefs) {
    console.log("");
    console.log("Executable asset references:");
    console.log(`  unique refs: ${report.executableRefs.totalUniqueRefs}`);
    console.log(`  exact path matches: ${report.executableRefs.exactMatches}`);
    console.log(`  basename matches: ${report.executableRefs.basenameMatches}`);
    console.log(`  missing refs: ${report.executableRefs.missing}`);
    for (const missing of report.executableRefs.missingRefs.slice(0, 20)) {
      console.log(`    - ${missing}`);
    }
  }
}
