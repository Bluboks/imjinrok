#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseMapHeader, readMapRecord, recordSignature, summarizeRecordClusters } from "./map-codec.mjs";

const DEFAULT_ROOT = "original/imjinrok2";

const args = parseArgs(process.argv.slice(2));
const root = args.root ?? DEFAULT_ROOT;
const files = args.file ? [args.file] : listMapFiles(root);
const maps = files.map((file) => inspectMapRecords(file, root, args));
const report = {
  root,
  files: maps.length,
  maps,
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report, args);
}

function parseArgs(argv) {
  const parsed = {
    maxClusters: 12,
    maxRecords: 32,
    maxSignatures: 4,
    maxSamples: 3,
    points: [],
  };

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

    if (arg === "--point") {
      parsed.points.push(parsePointArg(arg, argv[i + 1]));
      i += 1;
      continue;
    }

    if (arg === "--bbox") {
      parsed.bbox = parseBboxArg(arg, argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--signature") {
      parsed.signature = parseSignatureArg(arg, argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg === "--max-clusters" || arg === "--max-records" || arg === "--max-signatures" || arg === "--max-samples") {
      parsed[toCamelCase(arg.slice(2))] = parseIntegerArg(arg, argv[i + 1]);
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

function inspectMapRecords(file, rootPath, options) {
  const buffer = readFileSync(file);
  const source = normalizePath(relative(rootPath, file));
  const header = parseMapHeader(buffer, source);
  const region = options.bbox ?? {
    minX: 0,
    minY: 0,
    maxX: header.width - 1,
    maxY: header.height - 1,
  };
  const clusterReport = summarizeRecordClusters(buffer, header, {
    x: region.minX,
    y: region.minY,
    width: region.maxX - region.minX + 1,
    height: region.maxY - region.minY + 1,
    maxSignatureSamples: options.maxSignatures,
    maxRecordSamples: options.maxSamples,
  });
  const recordClusters = {
    ...clusterReport,
    clusters: clusterReport.clusters.slice(0, options.maxClusters),
  };

  return {
    path: source,
    size: statSync(file).size,
    header: {
      width: header.width,
      height: header.height,
      themeId: header.themeId,
      inferredTileTheme: header.inferredTileTheme,
      spawnPoints: header.spawnPoints,
      view: header.view,
      warnings: header.warnings,
    },
    recordRegion: region,
    recordClusters,
    pointProbes: options.points.map((point) => toRecordProbe(readMapRecord(buffer, point.x, point.y))),
    signatureMatches: options.signature
      ? collectSignatureMatches(buffer, region, options.signature, options.maxRecords)
      : undefined,
  };
}

function printHumanReport(report, options) {
  console.log(`IMJINROK map record inspection: ${report.root}`);
  console.log(`Maps: ${report.files}`);
  console.log("");

  for (const map of report.maps) {
    const header = map.header;
    const clusters = map.recordClusters;
    const bbox = formatBbox(clusters.nonZeroBoundingBox);
    const theme = header.inferredTileTheme ? `${header.themeId}/${header.inferredTileTheme}` : String(header.themeId);
    const region = formatBbox(map.recordRegion);

    console.log(
      `${map.path}: ${header.width}x${header.height} theme=${theme} ` +
        `region=${region} records=${clusters.nonZeroRecords}/${clusters.totalRecords} ` +
        `clusters=${clusters.clusterCount} bbox=${bbox}`,
    );

    for (const cluster of clusters.clusters) {
      console.log(
        `  #${cluster.id} count=${cluster.count} bbox=${formatBbox(cluster.boundingBox)} ` +
          `area=${cluster.area} density=${cluster.density.toFixed(2)}`,
      );
      console.log(`    signatures: ${formatSignatures(cluster.topSignatures)}`);
      console.log(`    sample: ${formatSample(cluster.samples[0])}`);
    }

    if (map.pointProbes.length > 0) {
      console.log("  points:");
      for (const probe of map.pointProbes) {
        console.log(
          `    ${probe.x},${probe.y} offset=${probe.offsetHex} hex=${probe.hex} ` +
            `u16=[${probe.uint16.join(",")}] u32=[${probe.uint32.join(",")}]`,
        );
      }
    }

    if (map.signatureMatches) {
      const matches = map.signatureMatches;
      console.log(
        `  signature ${matches.signature}: ${matches.totalMatches} matches ` +
          `(showing ${matches.records.length}/${matches.limit})`,
      );
      for (const probe of matches.records) {
        console.log(`    ${probe.x},${probe.y} offset=${probe.offsetHex} u16=[${probe.uint16.join(",")}]`);
      }
    }

    console.log("");
  }
}

function formatBbox(bbox) {
  if (!bbox) {
    return "none";
  }

  return `${bbox.minX},${bbox.minY}..${bbox.maxX},${bbox.maxY}`;
}

function formatSignatures(signatures) {
  if (signatures.length === 0) {
    return "none";
  }

  return signatures.map((signature) => `${signature.count}x:${signature.hex}`).join(" | ");
}

function formatSample(sample) {
  if (!sample) {
    return "none";
  }

  return `${sample.x},${sample.y} ${sample.hex}`;
}

function parseIntegerArg(name, value) {
  if (!value) {
    throw new Error(`${name} requires a value`);
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer: ${value}`);
  }

  return parsed;
}

function parsePointArg(name, value) {
  if (!value) {
    throw new Error(`${name} requires x,y`);
  }

  const match = value.match(/^(\d+),(\d+)$/);
  if (!match) {
    throw new Error(`${name} must be formatted as x,y: ${value}`);
  }

  return {
    x: parseCoordinate(name, match[1]),
    y: parseCoordinate(name, match[2]),
  };
}

function parseBboxArg(name, value) {
  if (!value) {
    throw new Error(`${name} requires x1,y1..x2,y2`);
  }

  const match = value.match(/^(\d+),(\d+)(?:\.\.|,)(\d+),(\d+)$/);
  if (!match) {
    throw new Error(`${name} must be formatted as x1,y1..x2,y2 or x1,y1,x2,y2: ${value}`);
  }

  const bbox = {
    minX: parseCoordinate(name, match[1]),
    minY: parseCoordinate(name, match[2]),
    maxX: parseCoordinate(name, match[3]),
    maxY: parseCoordinate(name, match[4]),
  };

  if (bbox.maxX < bbox.minX || bbox.maxY < bbox.minY) {
    throw new Error(`${name} max coordinates must be greater than or equal to min coordinates: ${value}`);
  }

  return bbox;
}

function parseCoordinate(name, value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} coordinates must be non-negative integers: ${value}`);
  }

  return parsed;
}

function parseSignatureArg(name, value) {
  if (!value) {
    throw new Error(`${name} requires a 16-byte hex signature`);
  }

  const signature = value.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{32}$/.test(signature)) {
    throw new Error(`${name} must be exactly 32 hex characters: ${value}`);
  }

  return signature;
}

function collectSignatureMatches(buffer, region, signature, limit) {
  let totalMatches = 0;
  const records = [];

  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      const record = readMapRecord(buffer, x, y);

      if (recordSignature(record.bytes) !== signature) {
        continue;
      }

      totalMatches += 1;
      if (records.length < limit) {
        records.push(toRecordProbe(record));
      }
    }
  }

  return {
    signature,
    region,
    limit,
    totalMatches,
    records,
  };
}

function toRecordProbe(record) {
  return {
    x: record.x,
    y: record.y,
    offset: record.offset,
    offsetHex: `0x${record.offset.toString(16)}`,
    hex: recordSignature(record.bytes),
    bytes: record.bytes,
    uint16: record.uint16,
    int16: record.int16,
    uint32: record.uint32,
  };
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function normalizePath(path) {
  return path.split(sep).join("/").replaceAll("\\", "/");
}
