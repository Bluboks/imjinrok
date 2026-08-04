#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractK01AcceptedUpdateScheduler,
} from "./extract-k01-accepted-update-scheduler.mjs";
import {
  extractK01CellProjectionEvidence,
} from "./extract-k01-cell-projection-evidence.mjs";
import {
  extractK01Class2LocomotionBridge,
  replayK01Class2AccumulatorCoordinateCommit,
} from "./extract-k01-class2-locomotion-bridge.mjs";
import {
  extractK01OpeningBuildingBindings,
} from "./extract-k01-opening-building-bindings.mjs";
import {
  extractK01OpeningUnitBindings,
} from "./extract-k01-opening-unit-bindings.mjs";
import {
  extractK01ReinforcementPlacementPolicy,
} from "./extract-k01-reinforcement-placement-policy.mjs";
import {
  extractK01RyuProjectilePilot,
  buildSampledProjectileRoute,
} from "./extract-k01-ryu-projectile-pilot.mjs";
import {
  extractK01SourceHandleLifecycle,
} from "./extract-k01-source-handle-lifecycle.mjs";
import {
  extractK01TilePlacementElevationEvidence,
} from "./extract-k01-tile-placement-elevation-evidence.mjs";
import { extractMapEntities, parseMapHeader } from "./map-codec.mjs";
import { parsePeImage } from "./pe-image.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_PATHS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  mapPath: resolve(ROOT, "original/imjinrok2/stagemap/k01.map"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  seedsPath: resolve(ROOT, "analysis/generated/imjinrok2/seeds.json"),
  jumpTablesPath: resolve(ROOT, "analysis/generated/imjinrok2/jump-tables.json"),
  catalogPath: resolve(ROOT, "analysis/generated/entity-type-catalog.json"),
  spriteDirectory: resolve(ROOT, "original/imjinrok2/char"),
  fixturePath: resolve(ROOT, "analysis/fixtures/k01-source-coordinate-bridge-vectors.json"),
};
const CANONICAL_PATHS = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  mapPath: "original/imjinrok2/stagemap/k01.map",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  fixturePath: "analysis/fixtures/k01-source-coordinate-bridge-vectors.json",
};

const EXPECTED = {
  executable: "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e",
  map: "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb",
  functions: "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e",
  references: "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5",
  seeds: "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2",
  jumpTables: "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f",
};

const FUNCTION_ENTRIES = [
  ["mapCellProjection", "0x00464cc0"],
  ["mapPlacementReader", "0x00464ea0"],
  ["mapPlacementHelper", "0x0046d650"],
  ["mapRasterCaller", "0x00466f20"],
  ["mapPlacementObjectFrame", "0x00469510"],
  ["placementDescriptor", "0x00488420"],
  ["placementAllocator", "0x00483a60"],
  ["placementCreate", "0x00483c50"],
  ["entityInitializer", "0x00437650"],
  ["locomotionWrapper", "0x00425af0"],
  ["locomotionNormal", "0x00425b20"],
  ["projectileRouteBuilder", "0x0040f9b0"],
  ["projectileRouteInitializer", "0x00410ab0"],
  ["projectileSpawn", "0x004111b0"],
  ["projectileUpdate", "0x00410cc0"],
  ["projectilePool", "0x00447360"],
  ["sourceScheduler", "0x00447bc0"],
  ["k01StageUpdater", "0x0048a5c0"],
  ["sourceHandleValidity", "0x00441e40"],
];

const RAW_CODE_RANGES = [
  ["map-cell-projection", 0x00464cc0, 0x00464dde],
  ["map-placement-reader", 0x00464ea0, 0x00465002],
  ["map-placement-helper", 0x0046d650, 0x0046d6d8],
  ["map-raster-caller", 0x00466f20, 0x004676e0],
  ["placement-descriptor", 0x00488420, 0x004884b5],
  ["placement-create", 0x00483c50, 0x00483c9f],
  ["entity-initializer", 0x00437650, 0x00438025],
  ["locomotion-normal", 0x00425b20, 0x004262df],
  ["projectile-route-builder", 0x0040f9b0, 0x0040fc8f],
  ["projectile-update", 0x00410cc0, 0x0041115b],
  ["projectile-pool", 0x00447360, 0x00447599],
  ["source-scheduler", 0x00447bc0, 0x00447cfa],
];

const CODE_ANCHORS = [
  [0x00464cc6, "8b 4c 24 14 66 85 c9 7c 23 8b 87 a0 2d 00 00 0f bf f1 3b f0 7d 16 8b 44 24 18 66 85 c0 7c 0d", "map projection admits signed x/y only inside map dimensions"],
  [0x00464d27, "8d 14 33 c1 e0 05 c1 e2 04 89 01 89 55 00", "map projection writes the separate (x-y)<<5 and (x+y)<<4 base pair"],
  [0x004695ab, "8d 84 9b e1 19 00 00 0f bf cd 8d 14 c0 89 4c 24 18 8d 04 91 66 0f b6 14 30", "placement reader loads the object byte from the x-major map field"],
  [0x004695c4, "8d 84 9b 65 1d 00 00 0f bf fa 8d 04 c0", "placement reader forms the frame-byte field address"],
  [0x00425f09, "66 8b 8e ee 04 00 00", "class-2 normal movement reads raw WORD +0x4ee"],
  [0x00425f41, "66 89 86 f2 04 00 00", "class-2 normal movement stores the signed-WORD accumulator"],
  [0x00425f63, "66 3d 32 00 0f 8c 9e 00 00 00", "coordinate commit is admitted only at signed accumulator >= 50"],
  [0x00425f90, "66 89 8e bc 01 00 00", "coordinate commit writes next X to current +0x1bc"],
  [0x0040fa11, "66 89 a9 1c 01 00 00 66 3b d0 66 89 b9 5c 02 00 00 be 01 00 00 00", "projectile route stores signed-WORD start X/Y at route index zero and retains the 160-point cap"],
  [0x00410e0a, "66 8b 86 a6 00 00 00 0f bf c8 66 3b 86 a8 00 00 00", "projectile update compares current route index with final route index"],
  [0x00417b84, "0f bf 86 22 01 00 00 8b ce 8d 14 c0 8d 04 50 8d 04 c0 c1 e0 03 66 8b b8 c2 52 63 00 66 8b 98 c4 52 63 00", "Ryu spawn reads the active target signed WORD endpoint fields"],
  [0x00488468, "66 85 c9 7c 2f 0f bf f1 3b 35 90 2d ac 00 7d 24", "native placement checks signed coordinate bounds after allocation"],
  [0x0043782e, "66 89 86 b6 01 00 00 66 8b 44 24 24 66 89 be b0 01 00 00 88 5e 37 88 5e 38 66 89 8e b8 01 00 00 66 89 96 bc 01 00 00 66 89 86 be 01 00 00", "entity initializer writes slot, generation, and exact signed x/y fields"],
];

const REQUIRED_CALL_EDGES = [
  ["0x0046491a", "0x004648e0", "0x00464cc0"],
  ["0x00467160", "0x00466f20", "0x00469510"],
  ["0x00488440", "0x00488420", "0x00483a60"],
  ["0x00488494", "0x00488420", "0x00483c50"],
  ["0x00483c95", "0x00483c50", "0x00437650"],
  ["0x00410f7e", "0x00410cc0", "0x00464cc0"],
  ["0x00411218", "0x004111b0", "0x0040c6c0"],
  ["0x0040c830", "0x0040c6c0", "0x00410ab0"],
  ["0x0040c95c", "0x0040c6c0", "0x0040f9b0"],
  ["0x004474d0", "0x00447360", "0x00410cc0"],
  ["0x0045fd5d", "0x0045f9c0", "0x00447bc0"],
  ["0x00447cb8", "0x00447bc0", "0x00447360"],
];

export function extractK01SourceCoordinateBridge(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const executable = readVerifiedBinary(paths.executablePath, EXPECTED.executable, "EXE");
  const map = readVerifiedBinary(paths.mapPath, EXPECTED.map, "K01 map");
  const artifacts = {
    functions: readVerifiedJson(paths.functionsPath, EXPECTED.functions, "functions"),
    references: readVerifiedJson(paths.referencesPath, EXPECTED.references, "references"),
    seeds: readVerifiedJson(paths.seedsPath, EXPECTED.seeds, "seeds"),
    jumpTables: readVerifiedJson(paths.jumpTablesPath, EXPECTED.jumpTables, "jump tables"),
  };
  const fixture = readFixture(paths.fixturePath, executable.sha256);
  const image = parsePeImage(executable.buffer, paths.executablePath);
  const header = parseMapHeader(map.buffer, paths.mapPath);
  assertEqual(header.width, 60, "K01 map width");
  assertEqual(header.height, 60, "K01 map height");

  // Witness extractors emit historical source paths in their reports. Run them against
  // canonical repository paths and keep only status/slices so this bridge remains root
  // independent when callers supply alternate absolute roots or symlinks.
  const witnessPaths = {
    executablePath: DEFAULT_PATHS.executablePath,
    mapPath: DEFAULT_PATHS.mapPath,
    functionsPath: DEFAULT_PATHS.functionsPath,
    referencesPath: DEFAULT_PATHS.referencesPath,
    seedsPath: DEFAULT_PATHS.seedsPath,
    jumpTablesPath: DEFAULT_PATHS.jumpTablesPath,
    fixturePath: resolve(ROOT, "analysis/fixtures/k01-source-handle-lifecycle-vectors.json"),
    originalRoot: resolve(ROOT, "original/imjinrok2"),
  };
  const placementWitness = extractK01TilePlacementElevationEvidence({ ...witnessPaths });
  const projectionWitness = extractK01CellProjectionEvidence({ ...witnessPaths });
  const locomotionWitness = extractK01Class2LocomotionBridge({ executablePath: paths.executablePath, seedsPath: paths.seedsPath });
  const projectileWitness = extractK01RyuProjectilePilot({ executablePath: paths.executablePath, seedsPath: paths.seedsPath, jumpTablesPath: paths.jumpTablesPath });
  const handleWitness = extractK01SourceHandleLifecycle({
    executablePath: paths.executablePath,
    seedsPath: paths.seedsPath,
    functionsPath: paths.functionsPath,
    referencesPath: paths.referencesPath,
    fixturePath: witnessPaths.fixturePath,
  });
  const reinforcementWitness = extractK01ReinforcementPlacementPolicy({ executablePath: paths.executablePath, functionsPath: paths.functionsPath, seedsPath: paths.seedsPath });
  const openingUnits = extractK01OpeningUnitBindings({ catalog: paths.catalogPath, map: paths.mapPath });
  const openingBuildings = extractK01OpeningBuildingBindings({ executable: paths.executablePath, catalog: paths.catalogPath, map: paths.mapPath, spriteDirectory: paths.spriteDirectory });
  const schedulerWitness = extractK01AcceptedUpdateScheduler({
    executablePath: paths.executablePath,
    functionsPath: paths.functionsPath,
    referencesPath: paths.referencesPath,
    jumpTablesPath: paths.jumpTablesPath,
    seedsPath: paths.seedsPath,
  });

  const functionRanges = FUNCTION_ENTRIES.map(([name, entry]) => functionProvenance(artifacts.functions, executable.buffer, image, name, entry));
  const rawCodeRanges = RAW_CODE_RANGES.map(([id, start, endExclusive]) => ({ id, byteRange: `${hex(start)}-${hex(endExclusive)} (end exclusive)`, sha256: sha256(readVaRange(executable.buffer, image, start, endExclusive)) }));
  const codeAnchors = CODE_ANCHORS.map(([va, bytes, meaning]) => verifyAnchor(executable.buffer, image, { va, bytes, meaning }));
  const callEdges = REQUIRED_CALL_EDGES.map(([site, caller, callee]) => verifyCallEdge(artifacts.references.references, site, caller, callee));
  const vectors = fixture.vectors.map((vector) => {
    const result = replayVector(vector);
    assertExpectedSubset(result, vector.expected, `${vector.id} expected result`);
    return { id: vector.id, operation: vector.operation, input: vector.input, expected: vector.expected, result };
  });

  const sourceEntities = extractMapEntities(map.buffer, header).entities;
  const openingSourceRecords = sourceEntities.filter(({ active, ownerId, typeId }) => active && ownerId === 1 && (typeId === 12 || typeId === 13)).map(({ typeId, ownerId, x, y }) => ({ originalClass: typeId, rawOwnerWord: ownerId, sourcePosition: { x, y } }));
  const class7SourceRecords = sourceEntities.filter(({ active, ownerId, typeId }) => active && ownerId === 0 && typeId === 7).map(({ typeId, ownerId, x, y }) => ({ originalClass: typeId, rawOwnerWord: ownerId, sourcePosition: { x, y } }));
  const descriptorCoordinates = reinforcementWitness.testVectors.canonicalRequestedCoordinates;

  return {
    schemaVersion: 1,
    question: "Which coordinate domains does K01 use for map cells, exact placement, entity locomotion, movement accumulation/commit, and projectile start/end/route points, and which closed subset can be converted explicitly to semantic GridPoint?",
    analysisStatus: "static-confirmed-for-closed-coordinate-domains",
    reproductionStatus: "reproduction-complete-for-accepted-vectors-and-fail-closed-boundaries",
    implementationStatus: "analysis-only-no-production-change",
    sources: {
      executable: { path: CANONICAL_PATHS.executablePath, byteLength: executable.buffer.length, sha256: executable.sha256 },
      map: { path: CANONICAL_PATHS.mapPath, byteLength: map.buffer.length, sha256: map.sha256, width: header.width, height: header.height },
      generatedArtifacts: Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, { path: CANONICAL_PATHS[`${name}Path`], byteLength: artifact.buffer.length, sha256: artifact.sha256, sourceSha256: artifact.parsed.sourceSha256 }])),
      fixture: { path: CANONICAL_PATHS.fixturePath, sourceSha256: fixture.sourceSha256, vectorCount: fixture.vectors.length },
    },
    coordinateDomains: [
      {
        id: "k01-map-cell",
        storage: "map byte fields indexed by x*180+y; x/y are signed WORD arguments",
        width: "signed WORD inputs; K01 accepted 0..59",
        unit: "discrete source map cell",
        scale: "1 cell per integer index; no pixel or iso scale asserted",
        anchor: "logical cell index only; geometric/pixel anchor unknown",
        producers: ["FUN_00466f20 raster loop", "FUN_00464cc0 projection/reader", "FUN_0046d650 helper"],
        consumers: ["map field readers", "bounded source projection consumers"],
        provenRange: { x: [0, 59], y: [0, 59], firstOutOfBounds: { x: 60, y: 0 } },
        storageFields: { lowNibble: "map+0x32514+x*180+y", fogFamily: "map+0x4a0c4+x*180+y", object: "map+0x3a3a4+x*180+y", frame: "map+0x42234+x*180+y" },
        conversion: "explicit identity to/from semantic GridPoint only for integer in-bounds K01 cells",
      },
      {
        id: "k01-exact-placement-coordinate",
        storage: "signed WORD origin plus signed WORD descriptor offset, wrapped to signed WORD before bounds",
        width: "signed WORD coordinate pair; K01 map bounds 0..59",
        unit: "exact source cell coordinate",
        scale: "1 source cell index; no rounding",
        anchor: "record x/y anchor; only native mobile classes 12/13/14/82 have proven 1x1 footprint",
        producers: ["FUN_00488420 descriptor loop", "FUN_00483c50 generation/create wrapper", "K01 opening map entity arrays"],
        consumers: ["FUN_00437650 record initializer", "FUN_0043c300 position reader", "FUN_0043ad30 mobile occupancy writer"],
        provenRange: { originAndOffset: [-32768, 32767], inBounds: { x: [0, 59], y: [0, 59] }, outOfBoundsPolicy: "allocate/update age first, skip create, continue descriptor loop" },
        conversion: "explicit identity to/from semantic GridPoint only after signed-WORD sum and in-bounds check",
      },
      {
        id: "k01-entity-current-and-raw-locomotion",
        storage: "entity WORD +0x1bc/+0x1be current pair, +0x4ee raw input, +0x4ea cadence limit, +0x4f2 accumulator; signed arithmetic in recovered branch",
        width: "16-bit WORD storage; signed interpretation where compare/division is proven",
        unit: "source locomotion field; coordinate unit and world-cell displacement unknown",
        scale: "unknown; no 24 Hz/FPS conversion",
        anchor: "current/next record fields only; interpolation/output helper semantics unknown",
        producers: ["FUN_00437650 initializer", "FUN_00425b20 normal movement", "FUN_00425af0 wrapper"],
        consumers: ["normal movement accumulator/commit branch", "later interpolation/occupancy consumers outside scope"],
        provenRange: { storage: [0, 65535], signed: [-32768, 32767], commitThreshold: 50 },
        conversion: "fail-closed: no semantic GridPoint conversion until source unit/producer/consumer mapping is statically closed",
      },
      {
        id: "k01-movement-accumulator-commit",
        storage: "entity WORD +0x4f2; raw WORD +0x4ee is transformed only for selector BYTE +0xba == 1",
        width: "16-bit signed-WORD arithmetic with storage wrap",
        unit: "accumulator threshold units, not a confirmed cell or pixel distance",
        scale: "raw selector-1 transform raw-trunc(raw/3); otherwise raw; no fixed-time scale",
        anchor: "commit snapshots +0x1bc/+0x1be to +0x1cc/+0x1ce and copies +0x4d8/+0x4da to current pair",
        producers: ["FUN_00425b20 normal movement"],
        consumers: ["same function's signed threshold and current-pair commit"],
        provenRange: { justBelow: 49, threshold: 50, postCommit: -50, signedBoundaries: [-32768, -1, 0, 32767] },
        conversion: "fail-closed: accumulator is not a GridPoint and current pair's source unit is unresolved",
      },
      {
        id: "k01-projectile-start-end-route",
        storage: "projectile record signed WORD start/end/current fields and signed WORD[160] route arrays",
        width: "source record fields are signed WORD; independent accepted route subset is 0..32767 per coordinate",
        unit: "integer route coordinate; route index is signed WORD and route sample interval is 14",
        scale: "integer Bresenham-style arithmetic; no rounding or product scale conversion",
        anchor: "route index 0 stores start; final route index is compared for arrival; endpoint is copied from target +0x32/+0x34",
        producers: ["Ryu callsite 0x00417b84/0x00417bfb", "FUN_004111b0 record initializer", "FUN_0040f9b0 route builder"],
        consumers: ["FUN_00410cc0 route update", "subtype 0x0c arrival dispatcher"],
        provenRange: { acceptedPortSubset: [0, 32767], rejectedForPort: [-32768, -1, 32768, 65535], routeCapacity: 160 },
        conversion: "fail-closed: source route scale and semantic GridPoint mapping are not statically proven",
      },
    ],
    exactTransforms: [
      "map storage ordinal = x*180+y (x-major); no rounding",
      "placement coordinate = signedWord(origin + signedWord(offset)); bounds are checked after allocation",
      "selector BYTE +0xba == 1: raw - trunc(raw/3) toward zero; other selector values retain raw",
      "movement accumulator stores signed-WORD sum, clamps negative-to-positive crossing to zero, commits at >=50, then subtracts 100",
      "projectile route uses integer Bresenham-style stepping and retains every 14th point, with route index 0 as start",
      "semantic GridPoint conversion is identity only for in-bounds map cell and exact placement coordinates",
    ],
    nonTransforms: [
      "No universal scale combines map cells, placement records, locomotion fields, and projectile route words.",
      "No pixel, iso.ts, render output, clamping, or Math.round value is used as original-coordinate evidence.",
      "No locomotion or projectile source coordinate is promoted to semantic GridPoint without a proven scale/anchor.",
      "Negative, unsigned-32768, signed-32767, and overflowed sums fail closed outside each accepted contract.",
    ],
    sourceRecords: {
      mapEntityArrayOffsets: { type: "+0xa4", x: "+0x6e4", y: "+0xd24", owner: "+0x1364", elementWidth: 2, signedness: "signed WORD" },
      openingUnits: { records: openingSourceRecords, class7Supplement: class7SourceRecords, bindingWitness: openingUnits.evidenceStatus ?? "exact-static-identity-source" },
      openingBuildings: { records: openingBuildings.bindings, bindingWitness: openingBuildings.evidenceStatus },
      reinforcement: { origin: { x: 55, y: 53 }, descriptorCoordinates, footprint: "1x1 only for classes 12/13/14/82", slotRange: [1, 1199] },
    },
    linkedEvidence: {
      C01: { acceptedStep: schedulerWitness.acceptedStep.orderedCalls, sourceUpdateToEntityAndProjectile: ["FUN_00447bc0", "FUN_004464c0", "FUN_004481d0", "FUN_0048ddb0", "FUN_0048a5c0", "FUN_00447360"], scope: "accepted source-update order and count only; raw clock→project tick and identity policy unresolved" },
      E01: { sourceHandle: { allocator: "FUN_00483a60 slots 1..1199", generation: "FUN_00483c50 WORD increment", initializer: "FUN_00437650 writes signed x/y +0x1bc/+0x1be", validity: "FUN_00441e40 positive active record predicate" }, projectile: "projectile pool and source-entity handle references remain distinct pools", scope: "only evidence-confirmed slot/generation/coordinate linkage" },
    },
    proposedAdapter: {
      name: "analysis-only-k01-source-coordinate-bridge",
      input: "Tagged source coordinate domain; map dimensions and explicit direction (sourceToSemantic or semanticToSource)",
      output: "Tagged semantic GridPoint for map-cell/exact-placement accepted subset, or an explicit rejection reason",
      accepted: ["map-cell x/y integer in 0..59", "placement signed-WORD origin+offset after wrap and in-bounds check"],
      rejected: ["locomotion current/raw fields until source unit is proven", "movement accumulator values", "projectile route values until source scale/anchor is proven", "fractional, rounded, clamped, or pixel coordinates"],
      direction: { sourceToSemantic: "identity only in accepted map/placement subset", semanticToSource: "identity only for integer in-bounds GridPoint; otherwise reject" },
      rounding: "none; any requested rounding is an explicit contract error",
      anchor: "logical cell anchor only; no ground-contact or pixel anchor",
      implementation: "not implemented; no production package/app change",
    },
    evidence: { functionRanges, rawCodeRanges, codeAnchors, callEdges },
    witnessExtractors: {
      mapPlacement: placementWitness.reproductionStatus,
      cellProjection: projectionWitness.reproductionStatus,
      locomotion: locomotionWitness.reproductionStatus,
      projectile: projectileWitness.reproductionStatus,
      sourceHandle: handleWitness.reproductionStatus,
      reinforcement: reinforcementWitness.reproductionStatus,
      openingUnits: "reproduction-complete",
      openingBuildings: openingBuildings.reproductionStatus,
      acceptedScheduler: schedulerWitness.reproductionStatus,
    },
    vectors,
    unresolved: [
      "locomotion +0x1bc/+0x1be and +0x4ee/+0x4ea source unit, producer range, interpolation and occupancy mapping",
      "projectile caller's full signed-WORD coordinate range, source-to-project GridPoint scale, endpoint producer and anchor",
      "placement raw owner meaning, wider footprints, and create-return movement/pathfinding lifecycle",
      "runtime WORD adjustment table lifetime/order and human terrain/elevation meaning",
      "C01 raw scheduler clock to project tick and E01 source identity/generation to project entity identity",
    ],
  };
}

export function replaySourceCoordinateBridgeVector(vector) {
  if (!vector || typeof vector !== "object") throw new TypeError("vector must be an object");
  switch (vector.operation) {
    case "source-word":
      return interpretSourceWord(vector.input?.word);
    case "map-cell-to-grid":
      return mapCellToSemanticGridPoint(vector.input);
    case "placement-to-grid":
      return placementToSemanticGridPoint(vector.input);
    case "movement-commit":
      return replayK01Class2AccumulatorCoordinateCommit(vector.input);
    case "projectile-route":
      return buildSampledProjectileRoute(vector.input);
    case "coordinate-contract":
      return coordinateContract();
    default:
      throw new RangeError(`unsupported coordinate bridge operation: ${String(vector.operation)}`);
  }
}

export function interpretSourceWord(word) {
  validateUnsignedWord(word, "word");
  return { unsignedWord: word, signedWord: word >= 0x8000 ? word - 0x10000 : word };
}

export function mapCellToSemanticGridPoint({ x, y, width = 60, height = 60 } = {}) {
  validateSignedWord(x, "x");
  validateSignedWord(y, "y");
  validateMapDimension(width, "width");
  validateMapDimension(height, "height");
  if (x < 0 || y < 0 || x >= width || y >= height) return { accepted: false, reason: "out-of-bounds" };
  return { accepted: true, gridPoint: { x, y }, rounding: "none", scale: 1 };
}

export function placementToSemanticGridPoint({ origin, offset, width = 60, height = 60 } = {}) {
  validateSignedPair(origin, "origin");
  validateSignedPair(offset, "offset");
  validateMapDimension(width, "width");
  validateMapDimension(height, "height");
  const sourceCoordinate = { x: signedWord(origin.x + offset.x), y: signedWord(origin.y + offset.y) };
  const cell = mapCellToSemanticGridPoint({ ...sourceCoordinate, width, height });
  if (!cell.accepted) return { ...cell, sourceCoordinate };
  return { accepted: true, sourceCoordinate, gridPoint: cell.gridPoint, rounding: "none", scale: 1 };
}

export function coordinateContract() {
  return {
    mapCell: { sourceToGrid: "identity-in-bounds", gridToSource: "identity-in-bounds" },
    placement: { sourceToGrid: "identity-in-bounds", gridToSource: "identity-in-bounds" },
    locomotion: { sourceToGrid: "reject-unresolved-scale", gridToSource: "reject-unresolved-scale" },
    projectile: { sourceToGrid: "reject-unresolved-scale", gridToSource: "reject-unresolved-scale" },
  };
}

function functionProvenance(functions, executable, image, name, entry) {
  const record = functions.functions.find((candidate) => candidate.entry === entry);
  if (!record) throw new Error(`functions artifact is missing ${entry}`);
  if (!Array.isArray(record.bodyRanges) || record.bodyRanges.length !== 1) throw new Error(`${entry} must have one body range`);
  const [start, endExclusive] = record.bodyRanges[0].split("-").map((value) => Number.parseInt(value, 16));
  const body = readVaRange(executable, image, start, endExclusive);
  return { name, entry, bodyRange: record.bodyRanges[0], byteRange: `${hex(start)}-${hex(endExclusive)} (end exclusive)`, bodySize: record.bodySize, instructionCount: record.instructionCount, instructionSha256: record.instructionSha256, rawBodySha256: sha256(body), callees: record.callees ?? [] };
}

function readVerifiedBinary(path, expectedSha256, label) {
  const buffer = readFileSync(path);
  const digest = sha256(buffer);
  assertEqual(digest, expectedSha256, `${label} SHA-256`);
  return { buffer, sha256: digest };
}

function readVerifiedJson(path, expectedSha256, label) {
  const buffer = readFileSync(path);
  const digest = sha256(buffer);
  assertEqual(digest, expectedSha256, `${label} artifact SHA-256`);
  const parsed = JSON.parse(buffer.toString("utf8"));
  assertEqual(parsed.sourceSha256, EXPECTED.executable, `${label} source SHA-256`);
  return { buffer, sha256: digest, parsed, ...parsed };
}

function readFixture(path, sourceSha256) {
  const buffer = readFileSync(path);
  const fixture = JSON.parse(buffer.toString("utf8"));
  assertEqual(fixture.schemaVersion, 1, "coordinate bridge fixture schema");
  assertEqual(fixture.sourceSha256, sourceSha256, "coordinate bridge fixture source SHA-256");
  if (!Array.isArray(fixture.vectors) || fixture.vectors.length < 10) throw new Error("coordinate bridge fixture must contain at least ten vectors");
  return fixture;
}

function readVaRange(buffer, image, start, endExclusive) {
  const offset = image.vaToRawOffset(start);
  if (offset === undefined) throw new RangeError(`${hex(start)} is not file-backed`);
  const bytes = buffer.subarray(offset, offset + endExclusive - start);
  if (bytes.length !== endExclusive - start) throw new RangeError(`${hex(start)}-${hex(endExclusive)} exceeds executable`);
  return bytes;
}

function verifyAnchor(buffer, image, { va, bytes, meaning }) {
  const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex");
  const actual = readVaRange(buffer, image, va, va + expected.length);
  if (!actual.equals(expected)) throw new Error(`coordinate bridge byte anchor mismatch at ${hex(va)}`);
  return { va: hex(va), rawOffset: hex(image.vaToRawOffset(va)), bytes, meaning };
}

function verifyCallEdge(references, site, caller, callee) {
  const edge = references.find((candidate) => candidate.from === site && candidate.to === callee && candidate.fromFunctionEntry === caller);
  if (!edge) throw new Error(`call edge missing ${site} ${caller} -> ${callee}`);
  return { callSite: site, caller, callee, type: edge.type };
}

function replayVector(vector) {
  return replaySourceCoordinateBridgeVector(vector);
}

function assertExpectedSubset(actual, expected, label) {
  if (expected === null || typeof expected !== "object") {
    if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`${label}: array length mismatch`);
    expected.forEach((value, index) => assertExpectedSubset(actual[index], value, `${label}[${index}]`));
    return;
  }
  if (!actual || typeof actual !== "object") throw new Error(`${label}: actual result is not an object`);
  for (const [key, value] of Object.entries(expected)) assertExpectedSubset(actual[key], value, `${label}.${key}`);
}

function validateSignedPair(pair, label) {
  if (!pair || typeof pair !== "object") throw new TypeError(`${label} must be a coordinate pair`);
  validateSignedWord(pair.x, `${label}.x`);
  validateSignedWord(pair.y, `${label}.y`);
}

function validateSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`);
}

function validateUnsignedWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`);
}

function validateMapDimension(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 0x7fff) throw new RangeError(`${label} must be a positive signed WORD`);
}

function signedWord(value) {
  return ((value & 0xffff) << 16) >> 16;
}

function hex(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function parseArgs(argv) {
  const options = {};
  const names = new Map([
    ["--input", "executablePath"],
    ["--map", "mapPath"],
    ["--functions", "functionsPath"],
    ["--references", "referencesPath"],
    ["--seeds", "seedsPath"],
    ["--jump-tables", "jumpTablesPath"],
    ["--catalog", "catalogPath"],
    ["--fixture", "fixturePath"],
    ["--sprite-directory", "spriteDirectory"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--json") continue;
    if (argv[index] === "--output") {
      if (argv[index + 1] === undefined) throw new Error("--output requires a path");
      options.outputPath = argv[++index];
      continue;
    }
    const key = names.get(argv[index]);
    if (!key || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${argv[index]}`);
    options[key] = argv[++index];
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractK01SourceCoordinateBridge(args);
  if (args.outputPath) writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
