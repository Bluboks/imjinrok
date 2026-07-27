#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import {
  extractK01BeaconK0120Trigger,
  K01_REINFORCEMENT_DESCRIPTORS,
} from "./extract-k01-beacon-k0120-trigger.mjs";
import { MAP_FILE_SIZE, parseMapHeader } from "./map-codec.mjs";

export const EXPECTED_ENTITY_CATALOG_SHA256 =
  "572044d9eec6162689154f3625c7572f27d7ee9030d4e4f9f51151b6a88f8745";
export const EXPECTED_K01_MAP_SHA256 =
  "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";
export const JAPANESE_GUNNER_CONVERSION_MANIFEST_LOGICAL_PATH =
  "apps/game-client/public/assets/themes/default/entities/japanese-gunner/gunj1.manifest.json";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

const EXPECTED_TYPES = [
  {
    internalClass: 12,
    originalGameplayName: "일본 조총병",
    sourcePathNormalized: "char/gunj1.spr",
    slot: 114,
    baseFrame: 0,
    sha256:
      "e35c3dddfc4860d3e8ccbb7d86ecb006b11230e269d04091dcfa320dc116a7a8",
    width: 60,
    height: 60,
    frameCount: 80,
    projectKind: "japanese-gunner",
    identityMapping: "exact-static-identity-source",
  },
  {
    internalClass: 13,
    originalGameplayName: "일본 사무라이",
    sourcePathNormalized: "char/horseswordj1.spr",
    slot: 117,
    baseFrame: 0,
    sha256:
      "f08dba883a1e5686383d05882d2c0f21c2bb52b6b2c2bb00e4d806f41ac9fdfa",
    width: 80,
    height: 80,
    frameCount: 90,
    projectKind: "japanese-swordsman",
    identityMapping: "proxy",
  },
  {
    internalClass: 14,
    originalGameplayName: "일본 귀갑차",
    sourcePathNormalized: "char/ghosttankj.spr",
    slot: 104,
    baseFrame: 0,
    sha256:
      "34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec",
    width: 70,
    height: 60,
    frameCount: 88,
    projectKind: "japanese-swordsman",
    identityMapping: "proxy",
  },
  {
    internalClass: 82,
    originalGameplayName: "일본 고니시",
    sourcePathNormalized: "char/generalj11.spr",
    slot: 165,
    baseFrame: 0,
    sha256:
      "eff3f8eb3a60c50ea6ac534d90e568bac415526a00f6ca2e287e00bfdf4bb03f",
    width: 140,
    height: 108,
    frameCount: 49,
    projectKind: "japanese-gunner",
    identityMapping: "proxy",
  },
];

const DEFAULT_PATHS = {
  catalog: resolve(repositoryRoot, "analysis/generated/entity-type-catalog.json"),
  spriteAudit: resolve(
    repositoryRoot,
    "analysis/generated/sprite-mapping-audit.json",
  ),
  map: resolve(repositoryRoot, "original/imjinrok2/stagemap/k01.map"),
  originalRoot: resolve(repositoryRoot, "original/imjinrok2"),
  japaneseGunnerConversionManifest: resolve(
    repositoryRoot,
    JAPANESE_GUNNER_CONVERSION_MANIFEST_LOGICAL_PATH,
  ),
};

const REQUIRED_SPRITE_AUDIT_SOURCE_PATHS = [
  "packages/shared/src/themes.ts",
  "packages/shared/src/visuals.ts",
  "packages/shared/src/content.ts",
  "packages/shared/src/scenarios.ts",
  "analysis/generated/entity-type-catalog.json",
  "tools/imjinrok/audit-sprite-mappings.mjs",
];

export function mapDescriptorsToRequestedPositions({
  descriptors,
  origin,
  mapWidth,
  mapHeight,
}) {
  validateSignedWord(origin.x, "origin.x");
  validateSignedWord(origin.y, "origin.y");
  validatePositiveUnsignedDword(mapWidth, "mapWidth");
  validatePositiveUnsignedDword(mapHeight, "mapHeight");
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    throw new TypeError("descriptors must be a non-empty array");
  }

  const requested = [];
  let terminated = false;
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    if (!Array.isArray(descriptor)) {
      throw new TypeError(`descriptor ${index} must be an array`);
    }
    if (descriptor.length === 1 && descriptor[0] === 0) {
      terminated = true;
      if (index !== descriptors.length - 1) {
        throw new Error("class-zero descriptor must terminate the array");
      }
      break;
    }
    if (descriptor.length !== 4) {
      throw new Error(`descriptor ${index} must contain class, owner, dx, dy`);
    }
    const [originalClass, rawOwnerWord, dx, dy] = descriptor;
    validateSignedWord(originalClass, `descriptor ${index} class`);
    validateSignedWord(rawOwnerWord, `descriptor ${index} owner`);
    validateSignedWord(dx, `descriptor ${index} dx`);
    validateSignedWord(dy, `descriptor ${index} dy`);
    if (originalClass === 0) {
      throw new Error(`descriptor ${index} has a malformed class-zero record`);
    }

    const x = signedWord(origin.x + dx);
    const y = signedWord(origin.y + dy);
    requested.push({
      index,
      originalClass,
      rawOwnerWord,
      offset: { x: dx, y: dy },
      requestedPosition: { x, y },
      inBounds: x >= 0 && x < mapWidth && y >= 0 && y < mapHeight,
    });
  }
  if (!terminated) {
    throw new Error("descriptor array is missing its class-zero terminator");
  }
  return requested;
}

export function extractK01ReinforcementIdentityMap(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const beaconReport =
    options.beaconReport ?? extractK01BeaconK0120Trigger(options.beaconOptions);
  assertDeepEqual(
    beaconReport.descriptorCreation.descriptors,
    K01_REINFORCEMENT_DESCRIPTORS,
    "verified K01 native descriptors",
  );
  assertEqual(
    beaconReport.descriptorCreation.helper,
    "0x00488420",
    "descriptor helper",
  );
  assertDeepEqual(
    beaconReport.descriptorCreation.origin,
    { x: 55, y: 53 },
    "descriptor origin",
  );
  assertEqual(
    beaconReport.descriptorCreation.rawArgument,
    0x10,
    "descriptor raw argument",
  );

  const catalogBuffer = readFileSync(paths.catalog);
  const catalogSha256 = sha256(catalogBuffer);
  assertEqual(
    catalogSha256,
    EXPECTED_ENTITY_CATALOG_SHA256,
    "entity type catalog SHA-256",
  );
  const catalog = parseJson(catalogBuffer, paths.catalog);
  assertEqual(
    catalog.source?.executableSha256,
    beaconReport.sources.executable.sha256,
    "entity catalog executable SHA-256",
  );
  const spriteAuditBuffer = readFileSync(paths.spriteAudit);
  const spriteAuditSha256 = sha256(spriteAuditBuffer);
  const spriteAudit = parseJson(spriteAuditBuffer, paths.spriteAudit);
  const projectStaticSourceBinding = validateProjectStaticSourceBinding(
    spriteAudit,
    repositoryRoot,
    paths.japaneseGunnerConversionManifest,
  );

  const mapBuffer = readFileSync(paths.map);
  const mapSha256 = sha256(mapBuffer);
  assertEqual(mapSha256, EXPECTED_K01_MAP_SHA256, "K01 map SHA-256");
  assertEqual(mapBuffer.length, MAP_FILE_SIZE, "K01 map byte length");
  const mapHeader = parseMapHeader(mapBuffer, paths.map);
  assertEqual(mapHeader.width, 60, "K01 map width");
  assertEqual(mapHeader.height, 60, "K01 map height");
  assertDeepEqual(mapHeader.view, { x: 13, y: 8 }, "K01 map view");
  assertDeepEqual(
    mapHeader.spawnPoints,
    [{ id: "spawn-1", x: 6, y: 6 }],
    "K01 source spawn points",
  );
  assertDeepEqual(mapHeader.warnings, [], "K01 map parser warnings");

  const identities = EXPECTED_TYPES.map((expected) =>
    inspectIdentity(
      catalog,
      paths.originalRoot,
      expected,
      options.spritePathResolver,
    ),
  );
  const requestedPositions = mapDescriptorsToRequestedPositions({
    descriptors: beaconReport.descriptorCreation.descriptors,
    origin: beaconReport.descriptorCreation.origin,
    mapWidth: mapHeader.width,
    mapHeight: mapHeader.height,
  }).map((entry) => {
    const identity = identities.find(
      ({ internalClass }) => internalClass === entry.originalClass,
    );
    if (!identity) {
      throw new Error(
        `descriptor ${entry.index} class ${entry.originalClass} has no scoped identity`,
      );
    }
    return {
      ...entry,
      originalGameplayName: identity.originalGameplayName,
      projectKind: identity.projectKind,
      identityMapping: identity.identityMapping,
    };
  });
  if (requestedPositions.some(({ inBounds }) => !inBounds)) {
    throw new Error("a K01 native requested reinforcement position is out of bounds");
  }

  const exactStaticIdentitySourceBindingCount = requestedPositions.filter(
    ({ identityMapping }) =>
      identityMapping === "exact-static-identity-source",
  ).length;
  const proxyIdentityCount =
    requestedPositions.length - exactStaticIdentitySourceBindingCount;
  assertEqual(
    exactStaticIdentitySourceBindingCount,
    3,
    "exact static identity/source binding count",
  );
  assertEqual(proxyIdentityCount, 6, "proxy identity binding count");

  return {
    question:
      "For K01, how do the native reinforcement descriptor classes and requested map coordinates map into the project while keeping static-proven original facts separate from project adaptations?",
    analysisStatus: "static-proven-original-identity-and-k01-requested-coordinates",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "isolated-k01-adapter-partial-identity-binding",
    sources: {
      executable: beaconReport.sources.executable,
      entityCatalog: {
        path: paths.catalog,
        sha256: catalogSha256,
      },
      spriteMappingAudit: {
        path: paths.spriteAudit,
        sha256: spriteAuditSha256,
        validatedSourceFiles: projectStaticSourceBinding.validatedSourceFiles,
      },
      japaneseGunnerConversionManifest:
        projectStaticSourceBinding.conversionManifest,
      k01Map: {
        path: paths.map,
        sha256: mapSha256,
        size: mapBuffer.length,
        width: mapHeader.width,
        height: mapHeader.height,
        view: mapHeader.view,
        sourceSpawns: mapHeader.spawnPoints.map(({ x, y }) => ({ x, y })),
      },
    },
    nativeCall: {
      site: "0x0048a7ae",
      helper: beaconReport.descriptorCreation.helper,
      origin: beaconReport.descriptorCreation.origin,
      rawArgument: beaconReport.descriptorCreation.rawArgument,
      rawOwnerMeaning: "unresolved",
    },
    identities,
    projectStaticSourceBinding,
    requestedPositions,
    integration: {
      exactRequestedCoordinateCount: requestedPositions.length,
      exactStaticIdentitySourceBindingCount,
      proxyIdentityBindingCount: proxyIdentityCount,
      rawOwnerAdapter: { rawOwnerWord: 1, projectPlayerId: "cpu-1" },
      requestedVersusFinal:
        "requested coordinates are exact for K01; generic runtime clamping/open-point search may relocate or skip final placement",
      projectAdaptations: [
        "raw owner WORD 1 to project playerId cpu-1",
        "objective-status beacon completion trigger",
        "attack-move target 10,10",
        "class 13/14/82 proxy entity kinds",
      ],
      behaviorParity:
        "not proven: project stats, combat behavior, and animation-state mappings are outside this evidence",
    },
    uncertainties: [
      "class 13, 14, and 82 have no exact project entity kind or verified animation mapping",
      "class 12 animation-state mapping, combat behavior, and stats are not proven",
      "final runtime placement can differ from native requested coordinates",
      "raw owner WORD 1 has no statically proven human-facing meaning in this unit",
    ],
  };
}

function validateProjectStaticSourceBinding(
  spriteAudit,
  currentRepositoryRoot,
  conversionManifestPhysicalPath,
) {
  if (!Array.isArray(spriteAudit.sourceFiles)) {
    throw new Error("sprite mapping audit is missing sourceFiles");
  }
  const validatedSourceFiles = REQUIRED_SPRITE_AUDIT_SOURCE_PATHS.map(
    (sourcePath) => {
      const source = spriteAudit.sourceFiles.find(
        ({ path }) => path === sourcePath,
      );
      if (!source) {
        throw new Error(
          `sprite mapping audit is missing provenance for ${sourcePath}`,
        );
      }
      const currentSha256 = sha256(
        readFileSync(resolve(currentRepositoryRoot, sourcePath)),
      );
      assertEqual(
        source.sha256,
        currentSha256,
        `sprite mapping audit provenance ${sourcePath}`,
      );
      return { path: sourcePath, sha256: currentSha256 };
    },
  );

  const binding = spriteAudit.entityTypeCatalog?.projectBindings?.find(
    ({ entityId }) => entityId === "japanese-gunner",
  );
  if (!binding) {
    throw new Error(
      "sprite mapping audit is missing japanese-gunner project binding",
    );
  }
  const expectedBinding = {
    entityId: "japanese-gunner",
    projectDisplayName: "일본 조총병",
    visualId: "japanese-gunner",
    visualSourcePath: "original/imjinrok2/char/gunj1.spr",
    identityStatus: "static-proven",
    originalGameplayName: "일본 조총병",
    internalClass: 12,
    nameMatchesOriginal: true,
  };
  assertDeepEqual(
    binding,
    expectedBinding,
    "japanese-gunner project binding",
  );

  const visual = spriteAudit.visuals?.find(
    ({ visualId }) => visualId === "japanese-gunner",
  );
  if (!visual) {
    throw new Error(
      "sprite mapping audit is missing japanese-gunner visual evidence",
    );
  }
  assertEqual(
    visual.evidenceStatus,
    "mixed",
    "japanese-gunner visual evidence status",
  );
  assertDeepEqual(
    {
      identity: visual.staticEvidence?.identity,
      originalGameplayName: visual.staticEvidence?.originalGameplayName,
      internalClass: visual.staticEvidence?.internalClass,
      spriteSlot: visual.staticEvidence?.spriteSlot,
      sourcePath: visual.staticEvidence?.sourcePath,
      baseFrame: visual.staticEvidence?.baseFrame,
      animationStateMapping:
        visual.staticEvidence?.animationStateMapping,
    },
    {
      identity: "static-proven",
      originalGameplayName: "일본 조총병",
      internalClass: 12,
      spriteSlot: 114,
      sourcePath: "char\\gunj1.spr",
      baseFrame: 0,
      animationStateMapping: "unverified",
    },
    "japanese-gunner visual static evidence",
  );
  assertDeepEqual(
    {
      path: visual.source?.path,
      sha256: visual.source?.sha256,
      width: visual.source?.width,
      height: visual.source?.height,
      frameCount: visual.source?.frameCount,
    },
    {
      path: "original/imjinrok2/char/gunj1.spr",
      sha256:
        "e35c3dddfc4860d3e8ccbb7d86ecb006b11230e269d04091dcfa320dc116a7a8",
      width: 60,
      height: 60,
      frameCount: 80,
    },
    "japanese-gunner visual source",
  );
  const conversionManifestBuffer = readFileSync(
    conversionManifestPhysicalPath,
  );
  const conversionManifestSha256 = sha256(conversionManifestBuffer);
  assertDeepEqual(
    visual.conversionManifest,
    {
      path: JAPANESE_GUNNER_CONVERSION_MANIFEST_LOGICAL_PATH,
      sha256: conversionManifestSha256,
    },
    "japanese-gunner conversion manifest provenance",
  );
  const conversionManifest = parseJson(
    conversionManifestBuffer,
    conversionManifestPhysicalPath,
  );
  assertEqual(
    conversionManifest.source,
    "original/imjinrok2/char/gunj1.spr",
    "japanese-gunner conversion manifest source",
  );
  assertEqual(
    conversionManifest.frameCount,
    80,
    "japanese-gunner conversion manifest frame count",
  );
  if (!Array.isArray(conversionManifest.exportedFrames)) {
    throw new Error(
      "japanese-gunner conversion manifest exportedFrames must be an array",
    );
  }
  assertEqual(
    conversionManifest.exportedFrames.length,
    80,
    "japanese-gunner conversion manifest exported frame count",
  );

  return {
    binding: expectedBinding,
    visual: {
      evidenceStatus: visual.evidenceStatus,
      source: visual.source,
      staticEvidence: visual.staticEvidence,
    },
    conversionManifest: {
      logicalPath: JAPANESE_GUNNER_CONVERSION_MANIFEST_LOGICAL_PATH,
      physicalPath: conversionManifestPhysicalPath,
      sha256: conversionManifestSha256,
      source: conversionManifest.source,
      frameCount: conversionManifest.frameCount,
      exportedFrameCount: conversionManifest.exportedFrames.length,
    },
    validatedSourceFiles,
    scope:
      "project kind identity and source SPR binding only; animation-state, direction, stats, and behavior are unverified",
  };
}

function inspectIdentity(catalog, originalRoot, expected, spritePathResolver) {
  const record = catalog.types?.find(
    ({ internalClass }) => internalClass === expected.internalClass,
  );
  if (!record) {
    throw new Error(
      `entity catalog is missing class ${expected.internalClass}`,
    );
  }
  assertEqual(
    record.originalGameplayName,
    expected.originalGameplayName,
    `class ${expected.internalClass} original name`,
  );
  assertEqual(
    record.sprite?.sourcePathNormalized,
    expected.sourcePathNormalized,
    `class ${expected.internalClass} sprite path`,
  );
  assertEqual(
    record.sprite?.slot,
    expected.slot,
    `class ${expected.internalClass} sprite slot`,
  );
  assertEqual(
    record.sprite?.baseFrame,
    expected.baseFrame,
    `class ${expected.internalClass} base frame`,
  );

  const spritePath = spritePathResolver
    ? spritePathResolver(expected.sourcePathNormalized)
    : resolve(originalRoot, expected.sourcePathNormalized);
  const spriteBuffer = readFileSync(spritePath);
  const spriteSha256 = sha256(spriteBuffer);
  assertEqual(
    spriteSha256,
    expected.sha256,
    `class ${expected.internalClass} SPR SHA-256`,
  );
  const header = parseSpriteLikeHeader(spriteBuffer, spritePath);
  assertDeepEqual(
    {
      width: header.width,
      height: header.height,
      frameCount: header.frameCount,
    },
    {
      width: expected.width,
      height: expected.height,
      frameCount: expected.frameCount,
    },
    `class ${expected.internalClass} SPR header`,
  );
  return {
    internalClass: expected.internalClass,
    originalGameplayName: expected.originalGameplayName,
    sprite: {
      path: expected.sourcePathNormalized,
      slot: expected.slot,
      baseFrame: expected.baseFrame,
      sha256: spriteSha256,
      width: header.width,
      height: header.height,
      frameCount: header.frameCount,
    },
    projectKind: expected.projectKind,
    identityMapping: expected.identityMapping,
  };
}

function parseJson(buffer, source) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(
      `${source}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function signedWord(value) {
  return (value << 16) >> 16;
}

function validateSignedWord(value, name) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${name} must be a signed WORD`);
  }
}

function validatePositiveUnsignedDword(value, name) {
  if (!Number.isInteger(value) || value <= 0 || value > 0xffffffff) {
    throw new RangeError(`${name} must be a positive unsigned DWORD`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    const key = {
      "--catalog": "catalog",
      "--sprite-audit": "spriteAudit",
      "--map": "map",
      "--original-root": "originalRoot",
    }[argument];
    if (!key) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[++index];
    if (!value) throw new Error(`${argument} requires a path`);
    options[key] = resolve(value);
  }
  return options;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = extractK01ReinforcementIdentityMap(options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("K01 reinforcement identity/map:");
      console.log(`  map SHA-256: ${report.sources.k01Map.sha256}`);
      console.log(
        `  requested positions: ${report.integration.exactRequestedCoordinateCount}/9`,
      );
      console.log(
        `  exact static identity/source bindings: ${report.integration.exactStaticIdentitySourceBindingCount}/9`,
      );
      console.log(
        `  proxy identities: ${report.integration.proxyIdentityBindingCount}/9`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
