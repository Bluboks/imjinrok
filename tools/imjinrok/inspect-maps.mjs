#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { extractMapEntities, parseMapHeader, summarizeRecordRegion } from "./map-codec.mjs";

const DEFAULT_ROOT = "original/imjinrok2";

const args = parseArgs(process.argv.slice(2));
const root = args.root ?? DEFAULT_ROOT;
const files = args.file ? [args.file] : listMapFiles(root);
const maps = files.map((file) => inspectMap(file, root));
const report = summarizeMaps(root, maps);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report);
}

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--root" || arg === "--file") {
      parsed[arg.slice(2)] = argv[i + 1];
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function listMapFiles(rootPath) {
  const output = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".map")) {
        output.push(path);
      }
    }
  }

  return output.sort();
}

function inspectMap(file, rootPath) {
  const buffer = readFileSync(file);
  const path = normalizePath(relative(rootPath, file));
  const header = parseMapHeader(buffer, path);
  const entityProbe = extractMapEntities(buffer, header);
  const fullGridRecords = summarizeRecordRegion(buffer);
  const declaredBoundsRecords = summarizeRecordRegion(buffer, {
    width: header.width,
    height: header.height,
  });

  return {
    path,
    size: statSync(file).size,
    header,
    recordProbe: {
      layoutAssumption: "row-major 256x256 records of 16 bytes at 0xbd8c",
      fullGrid: fullGridRecords,
      declaredBounds: declaredBoundsRecords,
    },
    entityProbe,
  };
}

function summarizeMaps(rootPath, maps) {
  return {
    root: rootPath,
    files: maps.length,
    byDimensions: countBy(maps, (map) => `${map.header.width}x${map.header.height}`),
    byThemeId: countBy(maps, (map) => String(map.header.themeId)),
    bySpawnCount: countBy(maps, (map) => String(map.header.spawnPoints.length)),
    maps,
  };
}

function printHumanReport(report) {
  console.log(`IMJINROK map inspection: ${report.root}`);
  console.log(`Maps: ${report.files}`);
  console.log("");

  printCounts("By dimensions", report.byDimensions);
  printCounts("By theme id", report.byThemeId);
  printCounts("By spawn count", report.bySpawnCount);

  console.log("Maps:");
  for (const map of report.maps) {
    const header = map.header;
    const full = map.recordProbe.fullGrid;
    const declared = map.recordProbe.declaredBounds;
    const bbox = formatBbox(full.nonZeroBoundingBox);
    const theme = header.inferredTileTheme ? `${header.themeId}/${header.inferredTileTheme}` : String(header.themeId);
    const warnings = header.warnings.length > 0 ? ` warnings=${header.warnings.length}` : "";

    console.log(
      `  ${map.path}: ${header.width}x${header.height} theme=${theme} spawns=${header.spawnPoints.length} ` +
        `view=${header.view.x},${header.view.y} records=${full.nonZeroRecords}/${full.totalRecords} ` +
        `declaredRecords=${declared.nonZeroRecords}/${declared.totalRecords} ` +
        `entities=${map.entityProbe.activeCount} bbox=${bbox}${warnings}`,
    );
  }
}

function printCounts(title, counts) {
  console.log(`${title}:`);
  for (const [key, count] of Object.entries(counts)) {
    console.log(`  ${key}: ${count}`);
  }
  console.log("");
}

function formatBbox(bbox) {
  if (!bbox) {
    return "none";
  }

  return `${bbox.minX},${bbox.minY}..${bbox.maxX},${bbox.maxY}`;
}

function countBy(items, getKey) {
  return Object.fromEntries(
    Object.entries(
      items.reduce((counts, item) => {
        const key = getKey(item);
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

function normalizePath(path) {
  return path.split(sep).join("/").replaceAll("\\", "/");
}
