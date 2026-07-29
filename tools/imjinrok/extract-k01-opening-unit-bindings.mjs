#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractMapEntities, parseMapHeader } from "./map-codec.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export const EXPECTED_ENTITY_CATALOG_SHA256 =
  "572044d9eec6162689154f3625c7572f27d7ee9030d4e4f9f51151b6a88f8745";
export const EXPECTED_K01_MAP_SHA256 =
  "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";

export const K01_PROVEN_OPENING_UNIT_BINDINGS = [
  { originalClass: 13, rawOwnerWord: 1, sourcePosition: { x: 20, y: 29 }, projectKind: "japanese-samurai", identityMapping: "exact-static-identity-source" },
  { originalClass: 13, rawOwnerWord: 1, sourcePosition: { x: 36, y: 26 }, projectKind: "japanese-samurai", identityMapping: "exact-static-identity-source" },
  { originalClass: 12, rawOwnerWord: 1, sourcePosition: { x: 38, y: 6 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source" },
  { originalClass: 12, rawOwnerWord: 1, sourcePosition: { x: 50, y: 8 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source" },
  { originalClass: 13, rawOwnerWord: 1, sourcePosition: { x: 31, y: 44 }, projectKind: "japanese-samurai", identityMapping: "exact-static-identity-source" },
  { originalClass: 12, rawOwnerWord: 1, sourcePosition: { x: 38, y: 27 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source" },
];

const EXPECTED_IDENTITIES = [
  {
    internalClass: 7,
    originalGameplayName: "조선 농부",
    sourcePathNormalized: "char/farmerk.spr",
    projectKind: "villager",
  },
  {
    internalClass: 12,
    originalGameplayName: "일본 조총병",
    sourcePathNormalized: "char/gunj1.spr",
    projectKind: "japanese-gunner",
  },
  {
    internalClass: 13,
    originalGameplayName: "일본 사무라이",
    sourcePathNormalized: "char/horseswordj1.spr",
    projectKind: "japanese-samurai",
  },
];

const EXPECTED_CLASS_7_OPENING_RECORDS = [
  { originalClass: 7, rawOwnerWord: 0, sourcePosition: { x: 7, y: 6 } },
  { originalClass: 7, rawOwnerWord: 0, sourcePosition: { x: 8, y: 6 } },
];

export function extractK01OpeningUnitBindings({
  catalog = resolve(repositoryRoot, "analysis/generated/entity-type-catalog.json"),
  map = resolve(repositoryRoot, "original/imjinrok2/stagemap/k01.map"),
  bindings = K01_PROVEN_OPENING_UNIT_BINDINGS,
} = {}) {
  const catalogBuffer = readFileSync(catalog);
  assertEqual(
    sha256(catalogBuffer),
    EXPECTED_ENTITY_CATALOG_SHA256,
    `entity type catalog SHA-256 for ${catalog}`,
  );
  const catalogReport = JSON.parse(catalogBuffer.toString("utf8"));
  assertEqual(
    catalogReport.evidenceStatus,
    "static-proven-type-identities",
    "entity type catalog evidence status",
  );

  const identities = EXPECTED_IDENTITIES.map((expected) => {
    const type = catalogReport.types.find(
      (candidate) => candidate.internalClass === expected.internalClass,
    );
    if (!type) {
      throw new Error(`entity type catalog is missing class ${expected.internalClass}`);
    }
    assertEqual(
      type.originalGameplayName,
      expected.originalGameplayName,
      `class ${expected.internalClass} original identity`,
    );
    assertEqual(
      type.sprite.sourcePathNormalized,
      expected.sourcePathNormalized,
      `class ${expected.internalClass} source SPR`,
    );
    return expected;
  });

  const mapBuffer = readFileSync(map);
  assertEqual(sha256(mapBuffer), EXPECTED_K01_MAP_SHA256, `K01 map SHA-256 for ${map}`);
  const header = parseMapHeader(mapBuffer, map);
  const sourceRecords = extractMapEntities(mapBuffer, header).entities
    .filter(
      (entity) =>
        entity.active &&
        entity.ownerId === 1 &&
        (entity.typeId === 12 || entity.typeId === 13),
    )
    .map((entity) => ({
      originalClass: entity.typeId,
      rawOwnerWord: entity.ownerId,
      sourcePosition: { x: entity.x, y: entity.y },
    }));

  assertEqual(sourceRecords.length, 6, "K01 owner-1 class-12/13 source record count");
  assertBindings(bindings, "provided K01 opening bindings");
  assertBindings(sourceRecordsToBindings(sourceRecords), "K01 map class-12/13 source records");
  const class7SourceRecords = extractMapEntities(mapBuffer, header).entities
    .filter(
      (entity) =>
        entity.active && entity.ownerId === 0 && entity.typeId === 7,
    )
    .map((entity) => ({
      originalClass: entity.typeId,
      rawOwnerWord: entity.ownerId,
      sourcePosition: { x: entity.x, y: entity.y },
    }));
  assertEqual(
    JSON.stringify(class7SourceRecords),
    JSON.stringify(EXPECTED_CLASS_7_OPENING_RECORDS),
    "K01 map class-7 source records",
  );

  return {
    evidenceStatus: "exact-static-identity-source",
    source: {
      catalog: { path: catalog, sha256: sha256(catalogBuffer) },
      map: { path: map, sha256: sha256(mapBuffer), width: header.width, height: header.height },
    },
    identities,
    bindings: [...bindings],
    supplementalExactIdentityBindings: class7SourceRecords.map((record) => ({
      ...record,
      projectKind: "villager",
      identityMapping: "exact-static-identity-source",
    })),
  };
}

function sourceRecordsToBindings(sourceRecords) {
  return sourceRecords.map((record) => ({
    ...record,
    projectKind:
      record.originalClass === 13 ? "japanese-samurai" : "japanese-gunner",
    identityMapping: "exact-static-identity-source",
  }));
}

function assertBindings(actual, label) {
  assertEqual(actual.length, K01_PROVEN_OPENING_UNIT_BINDINGS.length, `${label} count`);
  assertEqual(
    JSON.stringify(sortBindings(actual)),
    JSON.stringify(sortBindings(K01_PROVEN_OPENING_UNIT_BINDINGS)),
    `${label} must match the static-proven K01 class-12/13 bindings`,
  );
}

function sortBindings(bindings) {
  return [...bindings].sort(
    (left, right) =>
      left.originalClass - right.originalClass ||
      left.sourcePosition.x - right.sourcePosition.x ||
      left.sourcePosition.y - right.sourcePosition.y,
  );
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractK01OpeningUnitBindings(), null, 2));
}
