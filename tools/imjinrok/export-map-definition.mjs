#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { parseMapHeader } from "./map-codec.mjs";

const DEFAULT_FILE = "original/imjinrok2/stagemap/k01.map";
const FACTIONS = ["blue", "red", "green", "yellow"];

const args = parseArgs(process.argv.slice(2));
const file = args.file ?? DEFAULT_FILE;
const header = parseMapHeader(readFileSync(file), file);
const map = createMapDefinition(header, args);
const warnings = [
  ...header.warnings,
  "terrain is a placeholder layer until .map terrain record semantics are decoded",
  "theme id to tile theme name is inferred from the original tile directory set",
];
const output = args.summary ? summarizeExport(file, warnings, map) : args.mapOnly ? map : { source: file, warnings, map };
const serialized = `${JSON.stringify(output, null, 2)}\n`;

if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, serialized);
} else {
  process.stdout.write(serialized);
}

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--map-only" || arg === "--summary") {
      parsed[arg.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = true;
      continue;
    }

    if (arg === "--file" || arg === "--out" || arg === "--id" || arg === "--name" || arg === "--terrain") {
      parsed[arg.slice(2)] = argv[i + 1];
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function createMapDefinition(header, options) {
  const id = options.id ?? slugify(header.fileName.replace(/\.map$/i, ""));
  const terrain = options.terrain ?? "grass";
  const themeTag = header.inferredTileTheme ? `theme-${header.inferredTileTheme}` : `theme-id-${header.themeId}`;
  const spawnPoints = header.spawnPoints.map((spawn, index) => ({
    id: spawn.id,
    x: clamp(spawn.x, 0, header.width - 1),
    y: clamp(spawn.y, 0, header.height - 1),
    faction: FACTIONS[index % FACTIONS.length],
  }));

  return {
    id,
    name: options.name ?? titleFromId(id),
    description: `Scaffold imported from original Imjinrok 2 map ${header.fileName}.`,
    width: header.width,
    height: header.height,
    tileWidth: 64,
    tileHeight: 32,
    layers: [
      {
        id: "ground",
        name: "Ground",
        tiles: Array.from({ length: header.width * header.height }, () => ({
          terrain,
          elevation: 0,
        })),
      },
    ],
    spawnPoints,
    tags: ["imjinrok-original", "import-scaffold", themeTag],
  };
}

function summarizeExport(source, warnings, map) {
  const groundLayer = map.layers[0];

  return {
    source,
    warnings,
    map: {
      id: map.id,
      name: map.name,
      width: map.width,
      height: map.height,
      tileWidth: map.tileWidth,
      tileHeight: map.tileHeight,
      tileCount: groundLayer?.tiles.length ?? 0,
      spawnPoints: map.spawnPoints,
      tags: map.tags,
    },
  };
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "imjinrok-map";
}

function titleFromId(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
