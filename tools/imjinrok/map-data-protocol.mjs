#!/usr/bin/env node
/**
 * Versioned, declarative map-data extraction protocol.
 *
 * The protocol intentionally describes byte mechanics and provenance only. It
 * does not assign human terrain/elevation/passability meanings to raw fields.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMapHeader } from "./map-codec.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const defaultMapPath = resolve(defaultOriginalRoot, "stagemap/k01.map");
const defaultExecutablePath = resolve(defaultOriginalRoot, "imjinrok2.exe");
const defaultOutputPath = resolve(repositoryRoot, "analysis/generated/k01-map-data-protocol.json");
const defaultTypeScriptPath = resolve(repositoryRoot, "packages/shared/src/generated/k01MapDataProtocol.ts");

export const MAP_DATA_PROTOCOL_VERSION = "map-data-protocol/v1";
export const K01_MAP_DATA_PROFILE_ID = "k01-terrain-map-v1";
export const K01_MAP_DATA_EXPECTED = Object.freeze({
  executable: { size: 843_833, sha256: "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e" },
  map: { size: 1_097_100, sha256: "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb" },
});

const K01_EXPECTED_THEME_ID = 0;
const K01_EXPECTED_THEME_NAME = "normal";
const K01_REQUIRED_CHANNEL_IDS = Object.freeze([
  "field_0x32514_raw",
  "field_0x32514_low_nibble",
  "objectIndex",
  "frameIndex",
  "fogFamily",
  "placementSelector",
  "placementLookup",
  "placementHelperResult",
  "rawRasterVerticalShift",
  "passabilityPrimary",
  "passabilityAuxiliary",
]);
const K01_EXPECTED_CHANNEL_DIGESTS = Object.freeze({
  field_0x32514_raw: "6dd13ef5c9b57e69567a20d556e7c9a257a48d32337fdc5bdc07c288e4e2933a",
  field_0x32514_low_nibble: "6dd13ef5c9b57e69567a20d556e7c9a257a48d32337fdc5bdc07c288e4e2933a",
  objectIndex: "905b0deb2b68f2ea4b4332255a4a49472ed69563a4bfcac68646ec14de6c9881",
  frameIndex: "7904f0413f370b288b7c7f1bc9113fd4fc856529d06849b7a47f3c86579b2297",
  fogFamily: "7a9fcc150cf0128af19d57f742a6c160c6b5b8b003a81c069fb3167427208f88",
  placementSelector: "5938e85f3671d6c464c1b3af9a429dbfc2cf1905a2f4943302660b458f91440b",
  placementLookup: "967eedb2dc77a95e6270119ece23d9f47ca97c3b18ffa7d391d34e461b284f4c",
  placementHelperResult: "e4331b4b5dff91084b34db4018c5905a016cdf9c0d74d02c0d5af88dabfc6bc6",
  rawRasterVerticalShift: "76cc670258325ebc671d19b6f864768bf376328a7573ca7b29887c780e50b864",
  passabilityPrimary: "c7ff06e4148c20ed8eeb1de8f409fd2a8068b3a716888879c92a98ec14149f68",
  passabilityAuxiliary: "097951c3f1a907741e797ba9873dc6f81f4686d0fecc1877059371bf7c0469b7",
});
const DEFAULT_EVIDENCE_PATHS = Object.freeze({
  sourceTileSelector: resolve(repositoryRoot, "analysis/fixtures/k01-source-tile-selector.json"),
  placement: resolve(repositoryRoot, "analysis/fixtures/k01-tile-placement-elevation-evidence.json"),
  fog: resolve(repositoryRoot, "analysis/fixtures/source-fog-render-evidence.json"),
  passability: resolve(repositoryRoot, "analysis/fixtures/k01-map-passability-field.json"),
  compositor: resolve(repositoryRoot, "analysis/fixtures/k01-gameplay-terrain-compositor.json"),
  projection: resolve(repositoryRoot, "analysis/fixtures/k01-cell-projection-evidence.json"),
});
const EXPECTED_EVIDENCE_FIXTURE_DIGESTS = Object.freeze({
  "analysis/fixtures/k01-source-tile-selector.json": "bb72fbca0a03b41dee11ce1fc3e7c50f0731d3654ef0c9b89afdd09cc26aa1f3",
  "analysis/fixtures/k01-tile-placement-elevation-evidence.json": "c9daedbd269e0823ff0cb4331bfc08bf65e15409b0da91fd337437ea25b3391c",
  "analysis/fixtures/source-fog-render-evidence.json": "bf8b76d850635ff9619277e5fdff9495e68c18fb6d183ba7f9b99be7974a8e78",
  "analysis/fixtures/k01-map-passability-field.json": "f9a1f62f8b8f70c1506466b9b6bb0d144ef71b1e476fb3d6dda4998366d494da",
  "analysis/fixtures/k01-gameplay-terrain-compositor.json": "0122865391b5182af1a7b1bc5182e52669e6fe64a5fdfa64d21644c8c420256c",
  "analysis/fixtures/k01-cell-projection-evidence.json": "3d421eb1a1870dd09bf1b32fc82a16a059e5358a3eb123061ed50e833e925fff",
});

/**
 * Generic field mechanics. A channel may be a direct byte stream or a
 * selector-indexed stream. Derived channels are computed only from declared
 * dependencies and retain their evidence status in the resulting artifact.
 */
export const K01_TERRAIN_MAP_PROFILE = Object.freeze({
  protocolVersion: MAP_DATA_PROTOCOL_VERSION,
  profileId: K01_MAP_DATA_PROFILE_ID,
  theme: "normal",
  dimensions: { width: 60, height: 60 },
  header: {
    themeIdOffset: 0x00,
    viewOffset: 0x2d98,
    widthOffset: 0x2da0,
    heightOffset: 0x2da4,
    format: "little-endian int32 theme/view; little-endian uint32 dimensions",
  },
  coordinateOrder: "x-major storage: ordinal = x * height + y",
  channels: [
    direct("field_0x32514_raw", 0x32514, "uint8", "raw field_0x32514 byte; human meaning unresolved"),
    derived("field_0x32514_low_nibble", "uint8", ["field_0x32514_raw"], "field_0x32514_raw & 0x0f; branch selector only", { kind: "bitmask", mask: 0x0f, source: "field_0x32514_raw", testVectors: [{ input: 0xa2, output: 2 }] }),
    direct("objectIndex", 0x3a3a4, "uint8", "FUN_00469330/FUN_00469510 selected loader object index"),
    direct("frameIndex", 0x42234, "uint8", "FUN_00469330/FUN_00469510 selected YTL frame index"),
    direct("fogFamily", 0x4a0c4, "uint8", "runtime family selector byte; human fog meaning unresolved"),
    direct("placementSelector", 0x79824, "uint8", "FUN_0046d650 selector input; placement semantics unresolved"),
    selector("placementLookup", 0x147d5, 0x1fa4, "uint8", "FUN_0046d650 selector-indexed lookup byte"),
    derived("placementHelperResult", "int16", ["placementSelector", "placementLookup"], "FUN_0046d650 bounded helper return", { kind: "placement-helper", selector: "placementSelector", lookup: "placementLookup", rules: { outOfBounds: -1, lookup15: "selector", lookupNonzero: "selector - 1", lookupZero: 0 } }),
    derived("rawRasterVerticalShift", "uint8", ["field_0x32514_low_nibble", "placementHelperResult"], "FUN_00469510 raw vertical shift magnitude 0/16; not physical elevation", { kind: "raw-raster-shift", lowNibble: "field_0x32514_low_nibble", helper: "placementHelperResult", branches: { lowNibble2: "helper << 4", other: "(abs(helper) + 1) << 4" } }),
    direct("passabilityPrimary", 0xcc90c, "uint8", "bounded passability-gate primary field; human terrain meaning unresolved"),
    direct("passabilityAuxiliary", 0xdc62c, "uint8", "bounded passability-gate auxiliary field; human terrain meaning unresolved"),
  ],
  provenance: {
    evidenceClassification: "정적 확정 (bounded byte addressing and derived arithmetic); product coverage is 의도적 적응",
    nativeBoundary: "bounded original compositor clears index 0/black; selected YTL row spans may retain black gaps",
    legacyExcluded: "K01_TERRAIN_RLE is project-only/legacy and is not an original per-cell channel",
  },
});

function direct(id, baseOffset, storageWidth, evidence) {
  return { id, kind: "direct", baseOffset, xStrideBytes: 180, yStrideBytes: 1, elementWidthBytes: 1, signedness: storageWidth === "int8" ? "signed" : "unsigned", storageOrder: "x-major", storageWidth, evidence };
}

function selector(id, baseOffset, selectorStrideBytes, storageWidth, evidence) {
  return { ...direct(id, baseOffset, storageWidth, evidence), kind: "selector-indexed", selectorChannel: "placementSelector", selectorStrideBytes, selectorDomainMax: 15 };
}

function derived(id, signedness, dependencies, evidence, operation) {
  return { id, kind: "derived", signedness: signedness === "int16" ? "signed" : "unsigned", dependencies, storageWidth: signedness, operation, evidence };
}

export function extractK01MapDataProtocol(options = {}) {
  const originalRoot = options.originalRoot ?? defaultOriginalRoot;
  const mapPath = options.mapPath ?? resolve(originalRoot, "stagemap/k01.map");
  const executablePath = options.executablePath ?? resolve(originalRoot, "imjinrok2.exe");
  const map = readVerifiedFile(mapPath, K01_MAP_DATA_EXPECTED.map, "K01 MAP");
  const executable = readVerifiedFile(executablePath, K01_MAP_DATA_EXPECTED.executable, "original EXE");
  const core = extractMapDataProtocolFromBuffer(map.bytes, { profile: K01_TERRAIN_MAP_PROFILE, source: mapPath });
  const { header, channels } = core;
  const evidenceBindings = bindEvidence({
    mapBuffer: map.bytes,
    mapPath,
    executablePath,
    header,
    channels,
    evidencePaths: options.evidencePaths,
  });
  return {
    protocolVersion: MAP_DATA_PROTOCOL_VERSION,
    profileId: K01_MAP_DATA_PROFILE_ID,
    sources: {
      map: { path: relative(repositoryRoot, mapPath), size: map.bytes.length, sha256: map.sha256 },
      executable: { path: relative(repositoryRoot, executablePath), size: executable.bytes.length, sha256: executable.sha256 },
    },
    header: K01_TERRAIN_MAP_PROFILE.header,
    dimensions: { width: header.width, height: header.height },
    themeId: header.themeId,
    theme: K01_TERRAIN_MAP_PROFILE.theme,
    themeName: header.inferredTileTheme ?? `theme-id-${header.themeId}`,
    themeNameResolution: header.inferredTileTheme ? "resolved" : "neutral",
    view: header.view,
    coordinateOrder: K01_TERRAIN_MAP_PROFILE.coordinateOrder,
    channelSchemas: K01_TERRAIN_MAP_PROFILE.channels,
    channels,
    representativeVectors: representativeVectors(channels, header),
    provenance: K01_TERRAIN_MAP_PROFILE.provenance,
    evidenceBindings,
  };
}

/**
 * Bounded protocol core used by the K01 extractor and synthetic dimension
 * tests. It deliberately has no source-file/hash dependency, so a generic
 * caller can reach the profile/header gate before any evidence is bound.
 */
export function extractMapDataProtocolFromBuffer(mapBuffer, { profile = K01_TERRAIN_MAP_PROFILE, source = "map" } = {}) {
  if (!Buffer.isBuffer(mapBuffer)) throw new TypeError("mapBuffer must be a Buffer");
  const header = parseMapHeader(mapBuffer, source);
  validateProfile(profile, mapBuffer.length, header);
  const channels = extractChannels(mapBuffer, header, profile.channels);
  return { header, channels };
}

export function extractChannels(mapBuffer, header, channelSchemas = K01_TERRAIN_MAP_PROFILE.channels) {
  if (!Buffer.isBuffer(mapBuffer)) throw new TypeError("mapBuffer must be a Buffer");
  if (!header || !Number.isInteger(header.width) || !Number.isInteger(header.height)) throw new TypeError("header dimensions are required");
  const directValues = new Map();
  const result = {};
  for (const schema of channelSchemas) {
    if (!schema || typeof schema.id !== "string") throw new TypeError("channel schema requires an id");
    if (schema.kind === "derived") continue;
    const values = [];
    for (let x = 0; x < header.width; x += 1) {
      for (let y = 0; y < header.height; y += 1) {
        const storageOffset = x * schema.xStrideBytes + y * schema.yStrideBytes;
        const selectorValue = schema.selectorChannel ? directValues.get(schema.selectorChannel)?.[x * header.height + y] : 0;
        const offset = schema.baseOffset + (schema.selectorChannel ? selectorValue * schema.selectorStrideBytes : 0) + storageOffset;
        assertExtent(mapBuffer, offset, schema.elementWidthBytes, `${schema.id} (${x},${y})`);
        values.push(readScalar(mapBuffer, offset, schema.storageWidth));
      }
    }
    const stream = summarizeStream(values, schema.storageWidth, header);
    result[schema.id] = stream;
    directValues.set(schema.id, values);
  }
  const derivedValues = new Map();
  for (const schema of channelSchemas) {
    if (schema.kind !== "derived") continue;
    const dependencies = schema.dependencies.map((id) => directValues.get(id) ?? derivedValues.get(id));
    if (dependencies.some((value) => !value)) throw new Error(`${schema.id} references an unavailable channel`);
    const values = deriveChannel(schema, dependencies, header);
    result[schema.id] = summarizeStream(values, schema.storageWidth, header);
    derivedValues.set(schema.id, values);
  }
  return Object.fromEntries(channelSchemas.map((schema) => [schema.id, result[schema.id]]));
}

function deriveChannel(schema, dependencies, header) {
  const count = header.width * header.height;
  const operation = schema.operation;
  if (!operation || typeof operation.kind !== "string") throw new Error(`${schema.id} has no declared derivation operation`);
  if (operation.kind === "bitmask") {
    if (!Number.isInteger(operation.mask) || operation.mask < 0 || operation.mask > 0xff) throw new Error(`${schema.id} bitmask is invalid`);
    return dependencies[0].map((value) => value & operation.mask);
  }
  if (operation.kind === "placement-helper") {
    return Array.from({ length: count }, (_value, index) => {
      const selector = dependencies[0][index];
      const lookup = dependencies[1][index];
      if (lookup === 15) return selector;
      if (lookup !== 0) return selector - 1;
      return 0;
    });
  }
  if (operation.kind === "raw-raster-shift") {
    return Array.from({ length: count }, (_value, index) => dependencies[0][index] === 2 ? dependencies[1][index] << 4 : (Math.abs(dependencies[1][index]) + 1) << 4);
  }
  throw new Error(`Unsupported derived operation '${operation.kind}' for '${schema.id}'`);
}

function summarizeStream(values, storageWidth, header) {
  const bytes = encodeValues(values, storageWidth);
  return {
    count: values.length,
    byteCount: bytes.length,
    coordinateOrder: "x-major: ordinal = x * height + y",
    valuesBase64: bytes.toString("base64"),
    sha256: sha256(bytes),
    distribution: distribution(values),
    valueRange: { min: Math.min(...values), max: Math.max(...values) },
    dimensions: { width: header.width, height: header.height },
  };
}

function representativeVectors(channels, header) {
  const points = [[15, 6], [14, 6], [16, 6], [15, 5], [15, 7], [0, 0], [header.width - 1, 0], [0, header.height - 1], [header.width - 1, header.height - 1]];
  return points.map(([x, y]) => {
    const index = x * header.height + y;
    return { x, y, logicalIndex: index, channels: Object.fromEntries(Object.entries(channels).map(([id, stream]) => [id, decodeScalarAt(stream, index)])) };
  });
}

function decodeScalarAt(stream, index) {
  const bytes = decodeBase64Strict(stream.valuesBase64, stream.id ?? "stream");
  if (stream.byteCount === stream.count) return bytes[index];
  return bytes.readInt16LE(index * 2);
}

function decodeBase64Strict(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw new Error(`${label} valuesBase64 is invalid`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error(`${label} valuesBase64 is not canonical base64`);
  return bytes;
}

function encodeValues(values, storageWidth) {
  if (storageWidth === "int16") {
    const bytes = Buffer.alloc(values.length * 2);
    values.forEach((value, index) => bytes.writeInt16LE(value, index * 2));
    return bytes;
  }
  const bytes = Buffer.alloc(values.length);
  values.forEach((value, index) => { if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError(`uint8 channel value out of range: ${value}`); bytes[index] = value; });
  return bytes;
}

function bindEvidence({ mapBuffer, mapPath, executablePath, header, channels, evidencePaths = {} }) {
  const paths = { ...DEFAULT_EVIDENCE_PATHS, ...evidencePaths };
  const selector = readEvidenceFixture(paths.sourceTileSelector, "sourceTileSelector");
  const placement = readEvidenceFixture(paths.placement, "placement");
  const fog = readEvidenceFixture(paths.fog, "fog");
  const passability = readEvidenceFixture(paths.passability, "passability");
  const compositor = readEvidenceFixture(paths.compositor, "compositor");
  const projection = readEvidenceFixture(paths.projection, "projection");
  const sourceHashes = {
    map: { size: mapBuffer.length, sha256: sha256(mapBuffer) },
    executable: { sha256: sha256(readFileSync(executablePath)) },
  };

  assertEvidenceSource(selector, sourceHashes, "sourceTileSelector");
  assertEvidenceSource(placement, sourceHashes, "placement");
  assertEvidenceSource(fog, sourceHashes, "fog");
  assertEvidenceSource(passability, sourceHashes, "passability");
  assertEvidenceSource(compositor, sourceHashes, "compositor");
  assertEvidenceSource(projection, sourceHashes, "projection");

  const pairBytes = Buffer.alloc(header.width * header.height * 2);
  for (let index = 0; index < header.width * header.height; index += 1) {
    pairBytes[index * 2] = decodeStreamBytes(channels.objectIndex)[index];
    pairBytes[index * 2 + 1] = decodeStreamBytes(channels.frameIndex)[index];
  }
  const pairSha256 = sha256(pairBytes);
  assertEqual(selector.map?.themeId, K01_EXPECTED_THEME_ID, "source selector themeId");
  assertEqual(selector.map?.width, header.width, "source selector width");
  assertEqual(selector.map?.height, header.height, "source selector height");
  assertEqual(selector.pairStream?.count, header.width * header.height, "source selector pair count");
  assertEqual(selector.pairStream?.sha256, pairSha256, "combined object/frame pair digest");

  assertEqual(placement.map?.dimensions?.width, header.width, "placement dimensions width");
  assertEqual(placement.map?.dimensions?.height, header.height, "placement dimensions height");
  assertEqual(placement.cellStream?.sha256, compositor.channelDigests?.placementSha256, "placement cell digest");
  assertEqual(placement.cellProjection?.K01Distribution?.sourceBackedRawRelativeComponent?.sha256, channels.rawRasterVerticalShift.sha256, "raw shift digest");

  assertEqual(fog.resources?.k01FamilyBytes?.dimensions?.width, header.width, "fog family dimensions width");
  assertEqual(fog.resources?.k01FamilyBytes?.dimensions?.height, header.height, "fog family dimensions height");
  assertEqual(fog.resources?.k01FamilyBytes?.valueStreamSha256, channels.fogFamily.sha256, "fog-family digest");

  assertEqual(passability.header?.width, header.width, "passability dimensions width");
  assertEqual(passability.header?.height, header.height, "passability dimensions height");
  assertEqual(passability.values?.sha256, digestByCoordinateOrder(mapBuffer, 0xcc90c, header, "y-major"), "passability primary digest");
  assertEqual(passability.auxiliaryValues?.sha256, digestByCoordinateOrder(mapBuffer, 0xdc62c, header, "y-major"), "passability auxiliary digest");

  assertEqual(compositor.sources?.k01MapSha256, sourceHashes.map.sha256, "compositor map hash");
  assertEqual(compositor.sources?.executableSha256, sourceHashes.executable.sha256, "compositor executable hash");
  assertEqual(compositor.compositor?.target?.width, 640, "compositor target width");
  assertEqual(compositor.compositor?.target?.height, 384, "compositor target height");
  assertEqual(compositor.channelDigests?.rawRasterVerticalShiftSha256, channels.rawRasterVerticalShift.sha256, "compositor raw shift digest");
  assertEqual(projection.sources?.map?.sha256, sourceHashes.map.sha256, "projection map hash");
  assertEqual(projection.sources?.executable?.sha256, sourceHashes.executable.sha256, "projection executable hash");
  if (typeof projection.outputYJointVector?.stream?.sha256 !== "string") throw new Error("projection outputY joint digest is required");

  return {
    sourceTileSelector: evidenceDescriptor(paths.sourceTileSelector, selector, { pairSha256 }),
    placement: evidenceDescriptor(paths.placement, placement, { cellSha256: placement.cellStream.sha256, rawShiftSha256: channels.rawRasterVerticalShift.sha256 }),
    fog: evidenceDescriptor(paths.fog, fog, { familySha256: channels.fogFamily.sha256 }),
    passability: evidenceDescriptor(paths.passability, passability, { primarySha256: passability.values.sha256, auxiliarySha256: passability.auxiliaryValues.sha256 }),
    compositor: evidenceDescriptor(paths.compositor, compositor, { placementSha256: compositor.channelDigests.placementSha256, rawShiftSha256: compositor.channelDigests.rawRasterVerticalShiftSha256 }),
    projection: evidenceDescriptor(paths.projection, projection, { outputYJointSha256: projection.outputYJointVector.stream.sha256 }),
  };
}

function readEvidenceFixture(path, id) {
  const bytes = readFileSync(path);
  const relativePath = relative(repositoryRoot, path);
  const expectedDigest = EXPECTED_EVIDENCE_FIXTURE_DIGESTS[relativePath];
  if (expectedDigest && sha256(bytes) !== expectedDigest) throw new Error(`${id} evidence fixture SHA-256 mismatch: ${relativePath}`);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${id} evidence fixture is not valid JSON: ${relativePath}: ${error.message}`);
  }
  return value;
}

function evidenceDescriptor(path, fixture, digests) {
  const relativePath = relative(repositoryRoot, path);
  return { path: relativePath, sourceSha256: sha256(readFileSync(path)), ...digests };
}

function assertEvidenceSource(fixture, sourceHashes, id) {
  const map = fixture.sources?.map ?? fixture.sources?.k01Map ?? (fixture.sources?.k01MapSha256 ? { sha256: fixture.sources.k01MapSha256 } : undefined);
  const executable = fixture.sources?.executable ?? (fixture.sources?.executableSha256 ? { sha256: fixture.sources.executableSha256 } : undefined);
  if (map?.sha256 !== sourceHashes.map.sha256 || executable?.sha256 !== sourceHashes.executable.sha256) {
    throw new Error(`${id} evidence fixture source hash binding mismatch`);
  }
}

function decodeStreamBytes(stream) {
  return decodeBase64Strict(stream.valuesBase64, stream.id ?? "stream");
}

function digestByCoordinateOrder(buffer, baseOffset, header, order) {
  const values = [];
  if (order === "y-major") {
    for (let y = 0; y < header.height; y += 1) for (let x = 0; x < header.width; x += 1) values.push(buffer[baseOffset + x * 180 + y]);
  } else {
    for (let x = 0; x < header.width; x += 1) for (let y = 0; y < header.height; y += 1) values.push(buffer[baseOffset + x * 180 + y]);
  }
  return sha256(Buffer.from(values));
}

function readScalar(buffer, offset, storageWidth) {
  if (storageWidth === "int16") return buffer.readInt16LE(offset);
  return buffer[offset];
}

function validateProfile(profile, mapLength, header) {
  if (profile.protocolVersion !== MAP_DATA_PROTOCOL_VERSION) throw new Error(`Unsupported map protocol ${profile.protocolVersion}`);
  if (!Number.isInteger(header.themeId) || header.themeId !== K01_EXPECTED_THEME_ID) throw new Error(`K01 themeId mismatch: expected ${K01_EXPECTED_THEME_ID}, got ${header.themeId}`);
  if (profile.dimensions.width !== header.width || profile.dimensions.height !== header.height) throw new Error("profile/header dimension mismatch");
  for (const schema of profile.channels) {
    if (schema.kind === "derived") {
      if (!schema.operation || typeof schema.operation.kind !== "string") throw new Error(`${schema.id} derivation operation is required`);
      continue;
    }
    if (!Number.isInteger(schema.baseOffset) || schema.baseOffset < 0) throw new Error(`${schema.id} baseOffset is invalid`);
    if (schema.kind === "selector-indexed" && (!Number.isInteger(schema.selectorStrideBytes) || schema.selectorStrideBytes <= 0)) throw new Error(`${schema.id} selector stride is invalid`);
    const max = schema.baseOffset + ((schema.kind === "selector-indexed" ? schema.selectorDomainMax * schema.selectorStrideBytes : 0)) + (header.width - 1) * schema.xStrideBytes + (header.height - 1) * schema.yStrideBytes + schema.elementWidthBytes;
    if (max > mapLength) throw new Error(`${schema.id} channel extent exceeds input (${max} > ${mapLength})`);
  }
}

export function validateProtocolArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || artifact.protocolVersion !== MAP_DATA_PROTOCOL_VERSION) throw new Error("protocol artifact version mismatch");
  if (artifact.profileId !== K01_MAP_DATA_PROFILE_ID) throw new Error("protocol artifact profile mismatch");
  if (JSON.stringify(artifact.header) !== JSON.stringify(K01_TERRAIN_MAP_PROFILE.header)) throw new Error("protocol artifact header schema mismatch");
  if (artifact.dimensions?.width !== K01_TERRAIN_MAP_PROFILE.dimensions.width || artifact.dimensions?.height !== K01_TERRAIN_MAP_PROFILE.dimensions.height) throw new Error("protocol artifact dimensions mismatch");
  if (artifact.themeId !== K01_EXPECTED_THEME_ID || artifact.theme !== K01_EXPECTED_THEME_NAME || artifact.themeName !== K01_EXPECTED_THEME_NAME || artifact.themeNameResolution !== "resolved") throw new Error("protocol artifact theme metadata mismatch");
  const expectedSources = {
    map: { path: "original/imjinrok2/stagemap/k01.map", size: K01_MAP_DATA_EXPECTED.map.size, sha256: K01_MAP_DATA_EXPECTED.map.sha256 },
    executable: { path: "original/imjinrok2/imjinrok2.exe", size: K01_MAP_DATA_EXPECTED.executable.size, sha256: K01_MAP_DATA_EXPECTED.executable.sha256 },
  };
  if (JSON.stringify(artifact.sources) !== JSON.stringify(expectedSources)) throw new Error("protocol artifact source metadata mismatch");
  if (JSON.stringify(artifact.channelSchemas) !== JSON.stringify(K01_TERRAIN_MAP_PROFILE.channels)) throw new Error("protocol artifact channel schema mismatch");
  if (!Array.isArray(artifact.channelSchemas) || artifact.channelSchemas.length !== K01_REQUIRED_CHANNEL_IDS.length) throw new Error("protocol artifact channel schema count mismatch");
  const actualIds = Object.keys(artifact.channels ?? {});
  if (actualIds.length !== K01_REQUIRED_CHANNEL_IDS.length || actualIds.some((id, index) => id !== K01_REQUIRED_CHANNEL_IDS[index])) throw new Error("protocol artifact channel set mismatch");
  const cellCount = K01_TERRAIN_MAP_PROFILE.dimensions.width * K01_TERRAIN_MAP_PROFILE.dimensions.height;
  for (const [index, id] of K01_REQUIRED_CHANNEL_IDS.entries()) {
    const schema = K01_TERRAIN_MAP_PROFILE.channels[index];
    const stream = artifact.channels[id];
    if (!stream || stream.count !== cellCount || stream.byteCount !== cellCount * (schema.storageWidth === "int16" ? 2 : 1)) throw new Error(`${id} count/byteCount mismatch`);
    if (!Number.isInteger(stream.count) || stream.count <= 0 || typeof stream.coordinateOrder !== "string" || stream.coordinateOrder !== "x-major: ordinal = x * height + y") throw new Error(`${id} stream metadata mismatch`);
    const bytes = decodeBase64Strict(stream.valuesBase64, id);
    if (bytes.length !== stream.byteCount || !/^[0-9a-f]{64}$/u.test(stream.sha256) || stream.sha256 !== K01_EXPECTED_CHANNEL_DIGESTS[id] || sha256(bytes) !== stream.sha256) throw new Error(`${id} stream digest mismatch`);
    const values = decodeValues(bytes, schema.storageWidth);
    const expectedDistribution = distribution(values);
    if (JSON.stringify(stream.distribution) !== JSON.stringify(expectedDistribution)) throw new Error(`${id} distribution mismatch`);
    const expectedRange = { min: Math.min(...values), max: Math.max(...values) };
    if (JSON.stringify(stream.valueRange) !== JSON.stringify(expectedRange)) throw new Error(`${id} value range mismatch`);
    if (JSON.stringify(stream.dimensions) !== JSON.stringify(K01_TERRAIN_MAP_PROFILE.dimensions)) throw new Error(`${id} dimensions mismatch`);
  }
  validateEvidenceBindings(artifact.evidenceBindings);
  validateRepresentativeVectors(artifact.representativeVectors, artifact.channels);
  return true;
}

function decodeValues(bytes, storageWidth) {
  if (storageWidth === "int16") {
    const values = [];
    for (let offset = 0; offset < bytes.length; offset += 2) values.push(bytes.readInt16LE(offset));
    return values;
  }
  return [...bytes];
}

function validateEvidenceBindings(bindings) {
  if (!bindings || typeof bindings !== "object") throw new Error("protocol artifact evidence bindings are required");
  const expected = Object.fromEntries(Object.entries(DEFAULT_EVIDENCE_PATHS).map(([id, path]) => [id, relative(repositoryRoot, path)]));
  const actualIds = Object.keys(bindings);
  const expectedIds = Object.keys(expected);
  if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) throw new Error("protocol artifact evidence binding set mismatch");
  for (const [id, expectedPath] of Object.entries(expected)) {
    const binding = bindings[id];
    if (!binding || binding.path !== expectedPath || binding.sourceSha256 !== EXPECTED_EVIDENCE_FIXTURE_DIGESTS[expectedPath]) throw new Error(`protocol artifact ${id} evidence binding mismatch`);
  }
}

function validateRepresentativeVectors(vectors, channels) {
  const expectedPoints = [[15, 6], [14, 6], [16, 6], [15, 5], [15, 7], [0, 0], [59, 0], [0, 59], [59, 59]];
  if (!Array.isArray(vectors) || vectors.length !== expectedPoints.length) throw new Error("protocol artifact representative vector count mismatch");
  vectors.forEach((vector, vectorIndex) => {
    const [x, y] = expectedPoints[vectorIndex];
    if (vector.x !== x || vector.y !== y || vector.logicalIndex !== x * 60 + y) throw new Error("protocol artifact representative coordinate metadata mismatch");
    for (const id of K01_REQUIRED_CHANNEL_IDS) {
      if (vector.channels?.[id] !== decodeScalarAt(channels[id], vector.logicalIndex)) throw new Error(`protocol artifact representative ${id} mismatch`);
    }
  });
}

export function readProtocolCell(artifact, channelId, x, y) {
  validateProtocolArtifact(artifact);
  validateCoordinate(x, y, artifact.dimensions);
  const stream = artifact.channels?.[channelId];
  if (!stream) throw new RangeError(`protocol channel '${channelId}' is not declared`);
  return decodeScalarAt(stream, x * artifact.dimensions.height + y);
}

export function verifyK01MapDataProtocolArtifact({ artifactPath = defaultOutputPath, ...options } = {}) {
  const expected = JSON.parse(readFileSync(artifactPath, "utf8"));
  const actual = extractK01MapDataProtocol(options);
  validateProtocolArtifact(expected);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`map-data protocol artifact drift: ${artifactPath}`);
  return true;
}

export function writeK01MapDataProtocolArtifacts(options = {}) {
  const artifact = extractK01MapDataProtocol(options);
  const outputPath = options.outputPath ?? defaultOutputPath;
  const typeScriptPath = options.typeScriptPath ?? defaultTypeScriptPath;
  validateProtocolArtifact(artifact);
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  mkdirSync(dirname(outputPath), { recursive: true });
  mkdirSync(dirname(typeScriptPath), { recursive: true });
  writeFileSync(outputPath, json);
  writeFileSync(typeScriptPath, `// Generated by tools/imjinrok/map-data-protocol.mjs. Do not edit by hand.\nexport const K01_MAP_DATA_PROTOCOL = ${JSON.stringify(artifact, null, 2)} as const;\n`);
  return { artifact, outputPath, typeScriptPath };
}

function readVerifiedFile(path, expected, label) {
  const bytes = readFileSync(path);
  if (bytes.length !== expected.size) throw new Error(`${label} size mismatch: expected ${expected.size}, got ${bytes.length}`);
  const digest = sha256(bytes);
  if (digest !== expected.sha256) throw new Error(`${label} SHA-256 mismatch: expected ${expected.sha256}, got ${digest}`);
  return { bytes, size: bytes.length, sha256: digest };
}

function assertExtent(buffer, offset, width, label) {
  if (!Number.isInteger(offset) || offset < 0 || offset + width > buffer.length) throw new RangeError(`${label} channel extent is outside input`);
}

function validateCoordinate(x, y, header) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError(`coordinates must be integers: ${x},${y}`);
  if (x < 0 || x >= header.width || y < 0 || y >= header.height) throw new RangeError(`coordinate outside ${header.width}x${header.height}: ${x},${y}`);
}

function distribution(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left - right).map(([value, count]) => ({ value, count }));
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const outputPath = outputIndex >= 0 ? resolve(repositoryRoot, process.argv[outputIndex + 1]) : defaultOutputPath;
  const tsIndex = process.argv.indexOf("--ts");
  const typeScriptPath = tsIndex >= 0 ? resolve(repositoryRoot, process.argv[tsIndex + 1]) : defaultTypeScriptPath;
  const { artifact } = writeK01MapDataProtocolArtifacts({ outputPath, typeScriptPath });
  process.stdout.write(`${JSON.stringify({ outputPath: relative(repositoryRoot, outputPath), typeScriptPath: relative(repositoryRoot, typeScriptPath), channels: Object.keys(artifact.channels), digest: sha256(Buffer.from(JSON.stringify(artifact))) }, null, 2)}\n`);
}
