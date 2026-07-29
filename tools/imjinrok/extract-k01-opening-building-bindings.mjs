#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { EXPECTED_EXECUTABLE_SHA256 } from "./extract-entity-type-catalog.mjs";
import { extractMapEntities, parseMapHeader } from "./map-codec.mjs";
import { readPeImage } from "./pe-image.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const EXPECTED_ENTITY_CATALOG_SHA256 = "572044d9eec6162689154f3625c7572f27d7ee9030d4e4f9f51151b6a88f8745";
export const EXPECTED_K01_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";

const BUILDINGS = [
  { internalClass: 48, originalGameplayName: "조선 방앗간", rawOwnerWord: 0, positions: [[11, 5]], recordAddress: "0x00886c50", flags: "0x00310182", slot: 146, baseFrame: 7, pointerCell: "0x004bc2dc", tableIndex: 46, sourcePath: "char\\millk.spr", file: "millk.spr", sha256: "bb393d9a34cf7ae752c124a077cb4333bc0151f1a171f76a1e74201bbc57ac29", width: 114, height: 107, frameCount: 16 },
  { internalClass: 49, originalGameplayName: "조선 본영", rawOwnerWord: 0, positions: [[5, 4]], recordAddress: "0x00886d9c", flags: "0x00710082", slot: 141, baseFrame: 7, pointerCell: "0x004bc2c8", tableIndex: 41, sourcePath: "char\\hqk.spr", file: "hqk.spr", sha256: "17e5640a7b34f8aaf1063d210bd087b8ba59d769e194f5025e92941e422c2d4e", width: 131, height: 131, frameCount: 20 },
  { internalClass: 51, originalGameplayName: "조선 훈련도감", rawOwnerWord: 0, positions: [[5, 8]], recordAddress: "0x00887034", flags: "0x00710002", slot: 213, baseFrame: 7, pointerCell: "0x004bc3e8", tableIndex: 113, sourcePath: "char\\advbarrackk.spr", file: "advbarrackk.spr", sha256: "df40eb785b60824087329ec991e27b0dd88d5fe4ec918f742d8b06c363aa6bf5", width: 137, height: 118, frameCount: 14 },
  { internalClass: 58, originalGameplayName: "일본 본영", rawOwnerWord: 1, positions: [[7, 57], [56, 6]], recordAddress: "0x00887948", flags: "0x00510082", slot: 106, baseFrame: 7, pointerCell: "0x004bc23c", tableIndex: 6, sourcePath: "char\\jhq.spr", file: "jhq.spr", sha256: "db1b4e9b9a587473b4f18c651fb7cac9791a5d21ad23f56285c0a3f5c22ffba2", width: 120, height: 133, frameCount: 24 },
  { internalClass: 60, originalGameplayName: "일본 훈련소", rawOwnerWord: 1, positions: [[6, 50], [55, 11]], recordAddress: "0x00887be0", flags: "0x00510042", slot: 110, baseFrame: 7, pointerCell: "0x004bc24c", tableIndex: 10, sourcePath: "char\\barrackj.spr", file: "barrackj.spr", sha256: "f71072d74f7fbe1e2646c9ae13ca2f2172f5c096749262a77f477ae8dcb4038d", width: 125, height: 110, frameCount: 24 },
  { internalClass: 63, originalGameplayName: "일본 망루", rawOwnerWord: 1, positions: [[18, 49], [44, 5], [32, 40], [35, 29]], recordAddress: "0x00887fc4", flags: "0x00112006", slot: 219, baseFrame: 7, pointerCell: "0x004bc400", tableIndex: 119, sourcePath: "char\\towerj.spr", file: "towerj.spr", sha256: "bbaa6ec6390d1f1d4c48bccc9787e7d1dcabc729fc290dd92a76673426674693", width: 71, height: 98, frameCount: 40 },
];

export const K01_PROVEN_OPENING_BUILDING_BINDINGS = BUILDINGS.flatMap((building) =>
  building.positions.map(([x, y]) => ({
    internalClass: building.internalClass,
    rawOwnerWord: building.rawOwnerWord,
    sourcePosition: { x, y },
    originalGameplayName: building.originalGameplayName,
    spriteSlot: building.slot,
    baseFrame: building.baseFrame,
    sourcePath: building.sourcePath,
    identityMapping: "exact-static-identity-source",
  })),
).sort(compareBindings);

export function extractK01OpeningBuildingBindings({
  executable = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
  catalog = resolve(repositoryRoot, "analysis/generated/entity-type-catalog.json"),
  map = resolve(repositoryRoot, "original/imjinrok2/stagemap/k01.map"),
  spriteDirectory = resolve(repositoryRoot, "original/imjinrok2/char"),
  bindings = K01_PROVEN_OPENING_BUILDING_BINDINGS,
} = {}) {
  const { buffer } = readPeImage(executable);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `EXE SHA-256 for ${executable}`);
  const catalogBuffer = readFileSync(catalog);
  assertEqual(sha256(catalogBuffer), EXPECTED_ENTITY_CATALOG_SHA256, `entity type catalog SHA-256 for ${catalog}`);
  const catalogReport = JSON.parse(catalogBuffer.toString("utf8"));
  assertEqual(catalogReport.evidenceStatus, "static-proven-type-identities", "entity type catalog evidence status");
  assertBindings(bindings, "provided K01 opening building bindings");

  const spriteTable = extractOriginalSpriteTable(executable);
  const identities = BUILDINGS.map((building) => verifyIdentity(catalogReport, spriteTable, building, resolve(spriteDirectory, building.file)));
  const mapBuffer = readFileSync(map);
  assertEqual(sha256(mapBuffer), EXPECTED_K01_MAP_SHA256, `K01 map SHA-256 for ${map}`);
  const header = parseMapHeader(mapBuffer, map);
  const mapBindings = extractMapEntities(mapBuffer, header).entities
    .filter((entity) => entity.active && BUILDINGS.some((building) => building.internalClass === entity.typeId && building.rawOwnerWord === entity.ownerId))
    .map((entity) => bindingFromRecord(entity))
    .sort(compareBindings);
  assertBindings(mapBindings, "K01 map opening building records");

  return {
    schemaVersion: 1,
    question: "K01 canonical map의 opening building records는 어떤 original class, catalog identity, base frame, SPR source에 결합하는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none",
    evidenceStatus: "exact-static-identity-source",
    source: {
      executable: { path: executable, sha256: EXPECTED_EXECUTABLE_SHA256 },
      catalog: { path: catalog, sha256: EXPECTED_ENTITY_CATALOG_SHA256, evidenceStatus: catalogReport.evidenceStatus },
      map: { path: map, sha256: EXPECTED_K01_MAP_SHA256, width: header.width, height: header.height },
      sprites: identities.map(({ sprite }) => sprite),
    },
    identities: identities.map(({ identity }) => identity),
    bindings: mapBindings,
    acceptedInputScope: "K01 active source records, original type identity/source/slot/base frame only.",
    unresolvedScope: "Construction, damaged, overlay, timing, pivot, stats, behavior, and the human meaning of raw owner words are outside this evidence.",
  };
}

function verifyIdentity(catalog, spriteTable, building, spritePath) {
  const type = catalog.types.find((candidate) => candidate.internalClass === building.internalClass);
  if (!type) throw new Error(`entity type catalog is missing class ${building.internalClass}`);
  assertEqual(type.originalGameplayName, building.originalGameplayName, `class ${building.internalClass} original name`);
  assertEqual(type.definition.recordAddress, building.recordAddress, `class ${building.internalClass} record`);
  assertEqual(type.definition.flags, building.flags, `class ${building.internalClass} flags`);
  assertEqual(type.sprite.slot, building.slot, `class ${building.internalClass} sprite slot`);
  assertEqual(type.sprite.baseFrame, building.baseFrame, `class ${building.internalClass} base frame`);
  assertEqual(type.sprite.pointerCell, building.pointerCell, `class ${building.internalClass} sprite pointer cell`);
  assertEqual(type.sprite.sourcePath, building.sourcePath, `class ${building.internalClass} sprite source path`);
  const tableEntry = spriteTable.entries[building.tableIndex];
  if (!tableEntry) throw new Error(`sprite table is missing class ${building.internalClass} entry`);
  assertEqual(tableEntry.tableVa, building.pointerCell, `class ${building.internalClass} sprite table pointer cell`);
  assertEqual(tableEntry.sourcePath, building.sourcePath, `class ${building.internalClass} sprite table source path`);
  const bytes = readFileSync(spritePath);
  assertEqual(sha256(bytes), building.sha256, `${building.file} SHA-256`);
  const header = parseSpriteLikeHeader(bytes, spritePath);
  assertEqual(header.width, building.width, `${building.file} width`);
  assertEqual(header.height, building.height, `${building.file} height`);
  assertEqual(header.frameCount, building.frameCount, `${building.file} frame count`);
  return {
    identity: { internalClass: building.internalClass, originalGameplayName: building.originalGameplayName, typeRecordAddress: building.recordAddress, flags: building.flags, spriteSlot: building.slot, baseFrame: building.baseFrame, sourcePath: building.sourcePath },
    sprite: { path: spritePath, sha256: building.sha256, width: building.width, height: building.height, frameCount: building.frameCount, tableIndex: building.tableIndex, pointerCell: building.pointerCell, sourcePath: building.sourcePath },
  };
}

function bindingFromRecord(entity) {
  const building = BUILDINGS.find((candidate) => candidate.internalClass === entity.typeId && candidate.rawOwnerWord === entity.ownerId);
  if (!building) throw new Error(`unexpected K01 opening building record class ${entity.typeId}`);
  return {
    internalClass: building.internalClass,
    rawOwnerWord: entity.ownerId,
    sourcePosition: { x: entity.x, y: entity.y },
    originalGameplayName: building.originalGameplayName,
    spriteSlot: building.slot,
    baseFrame: building.baseFrame,
    sourcePath: building.sourcePath,
    identityMapping: "exact-static-identity-source",
  };
}

function assertBindings(actual, label) {
  assertEqual(actual.length, K01_PROVEN_OPENING_BUILDING_BINDINGS.length, `${label} count`);
  assertEqual(JSON.stringify([...actual].sort(compareBindings)), JSON.stringify([...K01_PROVEN_OPENING_BUILDING_BINDINGS].sort(compareBindings)), `${label} must match the static-proven K01 opening building bindings`);
}

function compareBindings(left, right) {
  return left.internalClass - right.internalClass || left.rawOwnerWord - right.rawOwnerWord || left.sourcePosition.x - right.sourcePosition.x || left.sourcePosition.y - right.sourcePosition.y;
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const report = extractK01OpeningBuildingBindings();
  if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], `${JSON.stringify({ schemaVersion: 1, bindings: report.bindings }, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
}
