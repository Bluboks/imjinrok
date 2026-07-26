import { basename } from "node:path";

export const MAP_FILE_SIZE = 0x10bd8c;
export const MAP_DIMENSIONS_OFFSET = 0x2da0;
export const MAP_VIEW_OFFSET = 0x2d98;
export const MAP_RECORDS_OFFSET = 0xbd8c;
export const MAP_RECORD_GRID_SIDE = 256;
export const MAP_RECORD_SIZE = 16;
export const MAP_RECORDS_SIZE = MAP_RECORD_GRID_SIDE * MAP_RECORD_GRID_SIDE * MAP_RECORD_SIZE;
export const MAP_RECORDS_END_OFFSET = MAP_RECORDS_OFFSET + MAP_RECORDS_SIZE;
export const MAP_ENTITY_LIMIT = 0x320;
export const MAP_ENTITY_TYPE_OFFSET = 0x00a4;
export const MAP_ENTITY_X_OFFSET = 0x06e4;
export const MAP_ENTITY_Y_OFFSET = 0x0d24;
export const MAP_ENTITY_OWNER_OFFSET = 0x1364;

export const INFERRED_TILE_THEMES = {
  0: "normal",
  1: "snow",
  2: "brown",
};

export function parseMapHeader(buffer, source = "map") {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("parseMapHeader expects a Buffer");
  }

  if (buffer.length < MAP_RECORDS_END_OFFSET) {
    throw new Error(`${source}: map file is too small (${buffer.length} bytes)`);
  }

  const themeId = buffer.readInt32LE(0x00);
  const spawnValues = [];
  for (let index = 0; index < 16; index += 1) {
    spawnValues.push(buffer.readInt32LE(0x04 + index * 4));
  }

  const spawnPoints = [];
  for (let index = 0; index < spawnValues.length; index += 2) {
    const x = spawnValues[index];
    const y = spawnValues[index + 1];

    if (x === -1 || y === -1) {
      break;
    }

    spawnPoints.push({
      id: `spawn-${spawnPoints.length + 1}`,
      x,
      y,
    });
  }

  const viewX = buffer.readInt32LE(MAP_VIEW_OFFSET);
  const viewY = buffer.readInt32LE(MAP_VIEW_OFFSET + 4);
  const width = buffer.readUInt32LE(MAP_DIMENSIONS_OFFSET);
  const height = buffer.readUInt32LE(MAP_DIMENSIONS_OFFSET + 4);

  const warnings = [];
  if (buffer.length !== MAP_FILE_SIZE) {
    warnings.push(`expected ${MAP_FILE_SIZE} bytes, got ${buffer.length}`);
  }

  if (width < 1 || width > MAP_RECORD_GRID_SIDE || height < 1 || height > MAP_RECORD_GRID_SIDE) {
    warnings.push(`declared dimensions are outside 1..${MAP_RECORD_GRID_SIDE}: ${width}x${height}`);
  }

  if (spawnPoints.length === 0) {
    warnings.push("no spawn pairs found in header");
  }

  return {
    source,
    fileName: basename(source),
    fileSize: buffer.length,
    themeId,
    inferredTileTheme: INFERRED_TILE_THEMES[themeId] ?? null,
    spawnPoints,
    view: { x: viewX, y: viewY },
    width,
    height,
    recordRegion: {
      offset: MAP_RECORDS_OFFSET,
      bytes: MAP_RECORDS_SIZE,
      recordSize: MAP_RECORD_SIZE,
      gridSide: MAP_RECORD_GRID_SIDE,
    },
    warnings,
  };
}

export function readMapRecord(buffer, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`record coordinates must be integers: ${x},${y}`);
  }

  if (x < 0 || x >= MAP_RECORD_GRID_SIDE || y < 0 || y >= MAP_RECORD_GRID_SIDE) {
    throw new Error(`record coordinates outside 0..${MAP_RECORD_GRID_SIDE - 1}: ${x},${y}`);
  }

  const offset = getMapRecordOffset(x, y);
  const bytes = [...buffer.subarray(offset, offset + MAP_RECORD_SIZE)];
  const uint16 = [];
  const int16 = [];
  const uint32 = [];

  for (let index = 0; index < MAP_RECORD_SIZE; index += 2) {
    uint16.push(buffer.readUInt16LE(offset + index));
    int16.push(buffer.readInt16LE(offset + index));
  }

  for (let index = 0; index < MAP_RECORD_SIZE; index += 4) {
    uint32.push(buffer.readUInt32LE(offset + index));
  }

  return { x, y, offset, bytes, uint16, int16, uint32 };
}

export function getMapRecordOffset(x, y) {
  return MAP_RECORDS_OFFSET + (y * MAP_RECORD_GRID_SIDE + x) * MAP_RECORD_SIZE;
}

export function extractMapEntities(buffer, header = parseMapHeader(buffer), options = {}) {
  const includeInactive = options.includeInactive ?? false;
  const entities = [];

  for (let index = 0; index < MAP_ENTITY_LIMIT; index += 1) {
    const typeId = buffer.readInt16LE(MAP_ENTITY_TYPE_OFFSET + index * 2);
    const x = buffer.readInt16LE(MAP_ENTITY_X_OFFSET + index * 2);
    const y = buffer.readInt16LE(MAP_ENTITY_Y_OFFSET + index * 2);
    const ownerId = buffer.readInt16LE(MAP_ENTITY_OWNER_OFFSET + index * 2);
    const active =
      typeId > 1 &&
      x >= 0 &&
      y >= 0 &&
      x < header.width &&
      y < header.height;

    if (!active && !includeInactive) {
      continue;
    }

    entities.push({
      index,
      typeId,
      typeHex: `0x${typeId.toString(16).padStart(2, "0")}`,
      x,
      y,
      ownerId,
      active,
    });
  }

  return {
    layoutAssumption:
      "0x320 source entity slots with type/x/y/owner int16 arrays at 0xa4/0x6e4/0xd24/0x1364",
    totalSlots: MAP_ENTITY_LIMIT,
    activeCount: entities.filter((entity) => entity.active).length,
    byOwnerId: countBy(entities.filter((entity) => entity.active), (entity) => String(entity.ownerId)),
    byTypeHex: countBy(entities.filter((entity) => entity.active), (entity) => entity.typeHex),
    entities,
  };
}

export function summarizeRecordRegion(buffer, options = {}) {
  const width = options.width ?? MAP_RECORD_GRID_SIDE;
  const height = options.height ?? MAP_RECORD_GRID_SIDE;
  const maxValueSamples = options.maxValueSamples ?? 8;

  if (width < 1 || width > MAP_RECORD_GRID_SIDE || height < 1 || height > MAP_RECORD_GRID_SIDE) {
    throw new Error(`record summary dimensions outside 1..${MAP_RECORD_GRID_SIDE}: ${width}x${height}`);
  }

  let nonZeroRecords = 0;
  const byteNonZeroCounts = Array.from({ length: MAP_RECORD_SIZE }, () => 0);
  const byteValueCounts = Array.from({ length: MAP_RECORD_SIZE }, () => new Map());
  const bbox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = getMapRecordOffset(x, y);
      let recordHasData = false;

      for (let byteIndex = 0; byteIndex < MAP_RECORD_SIZE; byteIndex += 1) {
        const value = buffer[offset + byteIndex];

        if (value !== 0) {
          recordHasData = true;
          byteNonZeroCounts[byteIndex] += 1;
        }

        const counts = byteValueCounts[byteIndex];
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }

      if (recordHasData) {
        nonZeroRecords += 1;
        bbox.minX = Math.min(bbox.minX, x);
        bbox.minY = Math.min(bbox.minY, y);
        bbox.maxX = Math.max(bbox.maxX, x);
        bbox.maxY = Math.max(bbox.maxY, y);
      }
    }
  }

  return {
    width,
    height,
    totalRecords: width * height,
    nonZeroRecords,
    nonZeroRatio: width * height === 0 ? 0 : nonZeroRecords / (width * height),
    nonZeroBoundingBox: nonZeroRecords === 0 ? null : bbox,
    byteNonZeroCounts,
    byteTopValues: byteValueCounts.map((counts) => topEntries(counts, maxValueSamples)),
  };
}

export function summarizeRecordClusters(buffer, header = parseMapHeader(buffer), options = {}) {
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const width = options.width ?? header.width - x;
  const height = options.height ?? header.height - y;
  const maxSignatureSamples = options.maxSignatureSamples ?? 4;
  const maxRecordSamples = options.maxRecordSamples ?? 3;

  validateRecordScanRegion(x, y, width, height, header);

  const recordsByKey = new Map();
  const bbox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  for (let recordY = y; recordY < y + height; recordY += 1) {
    for (let recordX = x; recordX < x + width; recordX += 1) {
      const record = readMapRecord(buffer, recordX, recordY);

      if (!record.bytes.some((value) => value !== 0)) {
        continue;
      }

      recordsByKey.set(toRecordKey(recordX, recordY), record);
      bbox.minX = Math.min(bbox.minX, recordX);
      bbox.minY = Math.min(bbox.minY, recordY);
      bbox.maxX = Math.max(bbox.maxX, recordX);
      bbox.maxY = Math.max(bbox.maxY, recordY);
    }
  }

  const clusters = [];
  const visited = new Set();

  for (const key of recordsByKey.keys()) {
    if (visited.has(key)) {
      continue;
    }

    const queue = [key];
    const records = [];
    visited.add(key);

    while (queue.length > 0) {
      const currentKey = queue.shift();
      const record = recordsByKey.get(currentKey);

      if (!record) {
        continue;
      }

      records.push(record);

      for (const neighborKey of getNeighborRecordKeys(record.x, record.y)) {
        if (!recordsByKey.has(neighborKey) || visited.has(neighborKey)) {
          continue;
        }

        visited.add(neighborKey);
        queue.push(neighborKey);
      }
    }

    clusters.push(summarizeRecordCluster(records, {
      id: clusters.length + 1,
      maxSignatureSamples,
      maxRecordSamples,
    }));
  }

  clusters.sort(
    (a, b) =>
      b.count - a.count ||
      a.boundingBox.minY - b.boundingBox.minY ||
      a.boundingBox.minX - b.boundingBox.minX ||
      a.id - b.id,
  );

  return {
    layoutAssumption: "row-major 256x256 records of 16 bytes at 0xbd8c",
    x,
    y,
    width,
    height,
    totalRecords: width * height,
    nonZeroRecords: recordsByKey.size,
    nonZeroBoundingBox: recordsByKey.size === 0 ? null : bbox,
    clusterCount: clusters.length,
    clusters,
  };
}

function validateRecordScanRegion(x, y, width, height, header) {
  for (const [name, value] of Object.entries({ x, y, width, height })) {
    if (!Number.isInteger(value)) {
      throw new Error(`record cluster ${name} must be an integer: ${value}`);
    }
  }

  if (x < 0 || y < 0 || width < 1 || height < 1) {
    throw new Error(`record cluster region must be positive: ${x},${y} ${width}x${height}`);
  }

  if (x + width > MAP_RECORD_GRID_SIDE || y + height > MAP_RECORD_GRID_SIDE) {
    throw new Error(`record cluster region outside 0..${MAP_RECORD_GRID_SIDE - 1}: ${x},${y} ${width}x${height}`);
  }

  if (x + width > header.width || y + height > header.height) {
    throw new Error(`record cluster region outside ${header.source} dimensions ${header.width}x${header.height}: ${x},${y} ${width}x${height}`);
  }
}

export function extractLikelyTerrainMask(buffer, header = parseMapHeader(buffer), options = {}) {
  const maxMaskValue = options.maxMaskValue ?? 3;
  const minDistinctValues = options.minDistinctValues ?? 3;
  const maxDistinctValues = options.maxDistinctValues ?? 6;
  const minNonZeroRatio = options.minNonZeroRatio ?? 0.25;
  const step = options.step ?? 4;
  const sampleStride = options.sampleStride ?? 4;
  const refineCandidates = options.refineCandidates ?? 96;
  const width = header.width;
  const height = header.height;
  const tileCount = width * height;
  const rowStride = width * 3;
  const maxStart = MAP_RECORDS_SIZE - ((height - 1) * rowStride + width);

  if (options.start !== undefined) {
    const start = validateTerrainMaskStart(options.start, maxStart);
    const stats = summarizeTerrainMaskCandidate(buffer, start, width, height, rowStride, maxMaskValue);
    const candidate = {
      start,
      rowStride,
      width,
      height,
      nonZeroRatio: stats.nonZeroValues / tileCount,
      distinctValues: stats.distinctValues,
      counts: stats.counts,
    };

    return {
      best: { ...candidate, values: readTerrainMaskValues(buffer, start, width, height, rowStride) },
      candidates: [candidate],
    };
  }

  const candidates = [];
  const coarseCandidates = [];
  const scanStart = validateTerrainMaskStart(options.scanStart ?? 0, maxStart);
  const scanEnd = validateTerrainMaskStart(options.scanEnd ?? maxStart, maxStart);

  if (scanStart > scanEnd) {
    throw new Error(`terrain mask scan start ${scanStart} is after scan end ${scanEnd}`);
  }

  for (let start = scanStart; start <= scanEnd; start += step) {
    const stats = summarizeTerrainMaskCandidate(buffer, start, width, height, rowStride, maxMaskValue, sampleStride);

    if (
      stats.badValues === 0 &&
      stats.distinctValues >= minDistinctValues &&
      stats.distinctValues <= maxDistinctValues &&
      stats.nonZeroValues / stats.sampledValues >= minNonZeroRatio
    ) {
      coarseCandidates.push({
        start,
        rowStride,
        width,
        height,
        nonZeroRatio: stats.nonZeroValues / stats.sampledValues,
        distinctValues: stats.distinctValues,
        counts: stats.counts,
      });
    }
  }

  coarseCandidates.sort(compareTerrainMaskCandidates);

  for (const coarseCandidate of coarseCandidates.slice(0, refineCandidates)) {
    const stats = summarizeTerrainMaskCandidate(buffer, coarseCandidate.start, width, height, rowStride, maxMaskValue);

    if (
      stats.badValues === 0 &&
      stats.distinctValues >= minDistinctValues &&
      stats.distinctValues <= maxDistinctValues &&
      stats.nonZeroValues / tileCount >= minNonZeroRatio
    ) {
      candidates.push({
        start: coarseCandidate.start,
        rowStride,
        width,
        height,
        nonZeroRatio: stats.nonZeroValues / tileCount,
        distinctValues: stats.distinctValues,
        counts: stats.counts,
      });
    }
  }

  candidates.sort(compareTerrainMaskCandidates);

  const best = candidates[0] ?? null;

  return {
    best: best ? { ...best, values: readTerrainMaskValues(buffer, best.start, width, height, rowStride) } : null,
    candidates,
  };
}

export function encodeTerrainMaskRle(values) {
  if (!values.length) {
    return "";
  }

  const runs = [];
  let currentValue = values[0];
  let count = 0;

  for (const value of values) {
    if (value === currentValue) {
      count += 1;
      continue;
    }

    runs.push(`${currentValue}${count.toString(36)}`);
    currentValue = value;
    count = 1;
  }

  runs.push(`${currentValue}${count.toString(36)}`);
  return runs.join(" ");
}

function validateTerrainMaskStart(start, maxStart) {
  if (!Number.isInteger(start) || start < 0 || start > maxStart) {
    throw new Error(`terrain mask start must be an integer in 0..${maxStart}: ${start}`);
  }

  return start;
}

function compareTerrainMaskCandidates(a, b) {
  const ratioDelta = b.nonZeroRatio - a.nonZeroRatio;
  if (Math.abs(ratioDelta) > 0.000001) {
    return ratioDelta;
  }

  return a.distinctValues - b.distinctValues || a.start - b.start;
}

function summarizeTerrainMaskCandidate(buffer, start, width, height, rowStride, maxMaskValue, sampleStride = 1) {
  const counts = new Map();
  let nonZeroValues = 0;
  let badValues = 0;
  let sampledValues = 0;

  for (let y = 0; y < height; y += sampleStride) {
    for (let x = 0; x < width; x += sampleStride) {
      const value = buffer[MAP_RECORDS_OFFSET + start + y * rowStride + x];

      sampledValues += 1;

      if (value !== 0) {
        nonZeroValues += 1;
      }

      if (value > maxMaskValue) {
        badValues += 1;
      }

      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return {
    nonZeroValues,
    badValues,
    sampledValues,
    distinctValues: counts.size,
    counts: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([value, count]) => ({ value, count })),
  };
}

function readTerrainMaskValues(buffer, start, width, height, rowStride) {
  const values = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values.push(buffer[MAP_RECORDS_OFFSET + start + y * rowStride + x]);
    }
  }

  return values;
}

export function normalizePortablePath(path) {
  return path.replaceAll("\\", "/");
}

function summarizeRecordCluster(records, options) {
  const boundingBox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const byteNonZeroCounts = Array.from({ length: MAP_RECORD_SIZE }, () => 0);
  const signatureCounts = new Map();
  const samples = [];

  for (const record of records) {
    boundingBox.minX = Math.min(boundingBox.minX, record.x);
    boundingBox.minY = Math.min(boundingBox.minY, record.y);
    boundingBox.maxX = Math.max(boundingBox.maxX, record.x);
    boundingBox.maxY = Math.max(boundingBox.maxY, record.y);

    const signature = recordSignature(record.bytes);
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);

    record.bytes.forEach((value, index) => {
      if (value !== 0) {
        byteNonZeroCounts[index] += 1;
      }
    });

    if (samples.length < options.maxRecordSamples) {
      samples.push({
        x: record.x,
        y: record.y,
        hex: signature,
        uint16: record.uint16,
      });
    }
  }

  const width = boundingBox.maxX - boundingBox.minX + 1;
  const height = boundingBox.maxY - boundingBox.minY + 1;
  const area = width * height;

  return {
    id: options.id,
    count: records.length,
    boundingBox,
    area,
    density: area === 0 ? 0 : records.length / area,
    byteNonZeroCounts,
    topSignatures: topEntries(signatureCounts, options.maxSignatureSamples).map(({ value, count }) => ({
      hex: value,
      count,
    })),
    samples,
  };
}

function getNeighborRecordKeys(x, y) {
  return [
    toRecordKey(x + 1, y),
    toRecordKey(x - 1, y),
    toRecordKey(x, y + 1),
    toRecordKey(x, y - 1),
  ];
}

function toRecordKey(x, y) {
  return `${x},${y}`;
}

export function recordSignature(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function topEntries(counts, limit) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || compareEntryKeys(a[0], b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function countBy(items, getKey) {
  const counts = new Map();

  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || compareEntryKeys(a[0], b[0])));
}

function compareEntryKeys(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  return String(a).localeCompare(String(b));
}
