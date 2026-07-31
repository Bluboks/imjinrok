#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import {
  extractK01BeaconK0120Trigger,
  K01_REINFORCEMENT_DESCRIPTORS,
} from "./extract-k01-beacon-k0120-trigger.mjs";
import { MAP_FILE_SIZE, parseMapHeader } from "./map-codec.mjs";

export const EXPECTED_ENTITY_CATALOG_SHA256 =
  "485344664b278c97a4ceed0756832abadbf2a71bd4a997b117b85c336d620708";
export const EXPECTED_K01_MAP_SHA256 =
  "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

const JAPANESE_SWORDSMAN_GAMEPLAY_ADAPTER = {
  category: "infantry",
  actionIds: ["move", "stop", "attack-move", "patrol", "hold"],
  populationCost: 1,
  footprint: { width: 1, height: 1, blocksMovement: true },
  baseAttributes: { health: 55, mana: 0, movementSpeed: 4 },
  combat: { damage: 9, range: 1.5, cooldownTicks: 18, aggroRange: 7 },
  renderRadius: 6,
  selectionRadius: 6,
  hitRadius: 16,
  sightRadius: 7,
  minimapShape: "circle",
  minimapRadius: 2.9,
  selectedMinimapRadius: 4.2,
};

const JAPANESE_GUNNER_GAMEPLAY_ADAPTER = {
  category: "infantry",
  actionIds: ["move", "stop", "attack-move", "patrol", "hold"],
  populationCost: 1,
  footprint: { width: 1, height: 1, blocksMovement: true },
  baseAttributes: { health: 38, mana: 0, movementSpeed: 3.8 },
  combat: { damage: 7, range: 5.5, cooldownTicks: 24, aggroRange: 8 },
  renderRadius: 6,
  selectionRadius: 6,
  hitRadius: 16,
  sightRadius: 8,
  minimapShape: "circle",
  minimapRadius: 2.9,
  selectedMinimapRadius: 4.2,
};

const EXPECTED_TYPES = [
  {
    internalClass: 12,
    originalGameplayName: "일본 조총병",
    sourcePathNormalized: "char/gunj1.spr",
    slot: 114,
    baseFrame: 0,
    pointerCell: "0x004bc25c",
    spriteTableIndex: 14,
    sha256:
      "e35c3dddfc4860d3e8ccbb7d86ecb006b11230e269d04091dcfa320dc116a7a8",
    width: 60,
    height: 60,
    frameCount: 80,
    projectKind: "japanese-gunner",
    identityMapping: "exact-static-identity-source",
    manifestLogicalPath:
      "apps/game-client/public/assets/themes/default/entities/japanese-gunner/gunj1.manifest.json",
    manifestSha256:
      "f156fab6f775bcf0df46a3f52356dcdbb86634447d9a674d6d9a39476178cae5",
    manifestStem: "gunj1",
    baseFrameSha256:
      "7d17b5bc01f785e7d2e8530db10c7fc0371b39d8558b7084676ea33296918003",
    projectGameplayAdapter: JAPANESE_GUNNER_GAMEPLAY_ADAPTER,
    visualDefaults: {
      render: { srcPxPerWu: 32, filtering: "nearest" },
      size: { w: 60, h: 60 },
      pivot: { anchor: { x: 30, y: 52 } },
    },
    defaultStillOnly: false,
    animationStateMapping: "static-proven-core-state-frames",
    scope:
      "project kind identity and source SPR binding are proven here; class-12 idle, move/walk, attack, and death slots, frames, directions, and mirroring are separately static-proven by the K01 normal reinforcement animation batch. State 2 project policy, timing, stats, category, collision, behavior, render scale, and pivot remain unresolved",
  },
  {
    internalClass: 13,
    originalGameplayName: "일본 사무라이",
    sourcePathNormalized: "char/horseswordj1.spr",
    slot: 117,
    baseFrame: 0,
    pointerCell: "0x004bc268",
    spriteTableIndex: 17,
    sha256:
      "f08dba883a1e5686383d05882d2c0f21c2bb52b6b2c2bb00e4d806f41ac9fdfa",
    width: 80,
    height: 80,
    frameCount: 90,
    projectKind: "japanese-samurai",
    identityMapping: "exact-static-identity-source",
    manifestLogicalPath:
      "apps/game-client/public/assets/themes/default/entities/japanese-samurai/horseswordj1.manifest.json",
    manifestSha256:
      "4d2ef829d95a1b90c2e666757f29c948369e9f27c6b2b11aab992f18030bf9c9",
    manifestStem: "horseswordj1",
    baseFrameSha256:
      "9294f923426de05f81e5d18be55bbe8deb31d96282e70469abe3382088ff4d02",
    projectGameplayAdapter: JAPANESE_SWORDSMAN_GAMEPLAY_ADAPTER,
    visualDefaults: {
      render: { srcPxPerWu: 32, filtering: "nearest" },
      size: { w: 80, h: 80 },
      pivot: { anchor: { x: 40, y: 72 } },
    },
    defaultStillOnly: false,
    animationStateMapping: "static-proven-core-state-frames",
    scope:
      "project kind identity and source SPR binding are proven here; class-13 idle, move/walk, attack, and death animation frames/directions are separately static-proven by the K01 samurai animation pilot, while exact timing, stats, category, collision, behavior, render scale, and pivot remain unverified original semantics",
  },
  {
    internalClass: 14,
    originalGameplayName: "일본 귀갑차",
    sourcePathNormalized: "char/ghosttankj.spr",
    slot: 104,
    baseFrame: 0,
    pointerCell: "0x004bc234",
    spriteTableIndex: 4,
    sha256:
      "34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec",
    width: 70,
    height: 60,
    frameCount: 88,
    projectKind: "japanese-turtle-tank",
    identityMapping: "exact-static-identity-source",
    manifestLogicalPath:
      "apps/game-client/public/assets/themes/default/entities/japanese-turtle-tank/ghosttankj.manifest.json",
    manifestSha256:
      "5d83ac52b270f0489bcde28e83896365c58468de340ffae3cebea64943bd7dc5",
    manifestStem: "ghosttankj",
    baseFrameSha256:
      "104517e7249550c719ccda7473720c2384bc217f56c71543894e8ace55dcf354",
    projectGameplayAdapter: JAPANESE_SWORDSMAN_GAMEPLAY_ADAPTER,
    visualDefaults: {
      render: { srcPxPerWu: 32, filtering: "nearest" },
      size: { w: 70, h: 60 },
      pivot: { anchor: { x: 35, y: 52 } },
    },
    defaultStillOnly: false,
    animationStateMapping: "static-proven-core-state-frames",
    scope:
      "project kind identity and source SPR binding are proven here; class-14 idle, move/walk, attack grid frames/mirroring, intermediate 16-ring raw turn positions, and its creation-default destruction effect path are separately static-proven by the K01 turtle-tank animation pilot. Generic Facing, project-side transient destruction/tick mapping, exact timing, stats, category, collision, behavior, render scale, and pivot remain unresolved",
  },
  {
    internalClass: 82,
    originalGameplayName: "일본 고니시",
    sourcePathNormalized: "char/generalj11.spr",
    slot: 165,
    baseFrame: 0,
    pointerCell: "0x004bc328",
    spriteTableIndex: 65,
    sha256:
      "eff3f8eb3a60c50ea6ac534d90e568bac415526a00f6ca2e287e00bfdf4bb03f",
    width: 140,
    height: 108,
    frameCount: 49,
    projectKind: "japanese-konishi",
    identityMapping: "exact-static-identity-source",
    manifestLogicalPath:
      "apps/game-client/public/assets/themes/default/entities/japanese-konishi/generalj11.manifest.json",
    manifestSha256:
      "a71d9b7392a4bc366a7346c90f174c5a7e2d919296ae26d892788c0f43ac7b54",
    manifestStem: "generalj11",
    baseFrameSha256:
      "9b94fe4900a4343de2842c60caae2575e1e949bebba3e72bbdfcfc819a1caeaf",
    additionalAnimationResources: [
      {
        role: "idle",
        slot: 166,
        pointerCell: "0x004bc32c",
        sourcePointer: "0x004bcd58",
        sourcePathNormalized: "char/generalj12.spr",
        sha256:
          "914ea581e7ba8ad7d972e19f5089478de0391be1c79288a2f711a238dc28b44f",
        width: 140,
        height: 108,
        frameCount: 36,
        manifestLogicalPath:
          "apps/game-client/public/assets/themes/default/entities/japanese-konishi/generalj12.manifest.json",
        manifestSha256:
          "ca12c083547126db0342d6bb5d0e4a4c0cdc9b0241e5d4b54f623c4927e83b48",
        manifestStem: "generalj12",
        baseFrameSha256:
          "9596c5d560dbba4fe0bc54a1950c91534e31baf077718bfdf572166566325b96",
      },
      {
        role: "attack",
        slot: 167,
        pointerCell: "0x004bc330",
        sourcePointer: "0x004bcd44",
        sourcePathNormalized: "char/generalj13.spr",
        sha256:
          "43322afcb8f5c90e63925efc2de647a36c5d3663d8a8638bc814a05c241a8b91",
        width: 140,
        height: 108,
        frameCount: 54,
        manifestLogicalPath:
          "apps/game-client/public/assets/themes/default/entities/japanese-konishi/generalj13.manifest.json",
        manifestSha256:
          "831e5894dc43beeaf85c14c364be57be146f1a492d667a8c405856c20b79121a",
        manifestStem: "generalj13",
        baseFrameSha256:
          "c5894457ff2daa9fa985438584d37e3441a1b96d2b073dfc9ea4261e78312081",
      },
    ],
    projectGameplayAdapter: JAPANESE_GUNNER_GAMEPLAY_ADAPTER,
    visualDefaults: {
      render: { srcPxPerWu: 32, filtering: "nearest" },
      size: { w: 140, h: 108 },
      pivot: { anchor: { x: 70, y: 100 } },
    },
    defaultStillOnly: false,
    animationStateMapping: "static-proven-core-state-frames",
    scope:
      "project kind identity and primary source SPR binding are proven here; class-82 idle, move/walk, attack, and death sprite slots, grid-direction frames, and mirroring are separately static-proven by the K01 Konishi animation pilot, while unused tail frames, generalj14, exact timing, stats, category, collision, behavior, render scale, pivot, and death lifetime remain unverified original semantics",
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
};

const REQUIRED_SPRITE_AUDIT_SOURCE_PATHS = [
  "packages/shared/src/themes.ts",
  "packages/shared/src/visuals.ts",
  "packages/shared/src/content.ts",
  "packages/shared/src/scenarios.ts",
  "analysis/generated/entity-type-catalog.json",
  "tools/imjinrok/audit-sprite-mappings.mjs",
  "tools/imjinrok/extract-k01-samurai-animation-pilot.mjs",
  "tools/imjinrok/extract-k01-turtle-tank-animation-pilot.mjs",
  "tools/imjinrok/extract-k01-konishi-animation-pilot.mjs",
  "tools/imjinrok/extract-k01-normal-reinforcement-animation-batch.mjs",
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
  const projectStaticSourceBindings = validateProjectStaticSourceBindings(
    spriteAudit,
    repositoryRoot,
    options.conversionManifestPathResolver,
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
  assertDeepEqual(
    spriteAudit.k01ReinforcementAdapter,
    requestedPositions.map(
      ({
        originalClass,
        rawOwnerWord,
        offset,
        projectKind,
        identityMapping,
      }) => ({
        originalClass,
        rawOwnerWord,
        offset,
        projectKind,
        identityMapping,
      }),
    ),
    "sprite mapping audit K01 reinforcement adapter",
  );

  const exactStaticIdentitySourceBindingCount = requestedPositions.filter(
    ({ identityMapping }) =>
      identityMapping === "exact-static-identity-source",
  ).length;
  const proxyIdentityCount =
    requestedPositions.length - exactStaticIdentitySourceBindingCount;
  assertEqual(
    exactStaticIdentitySourceBindingCount,
    9,
    "exact static identity/source binding count",
  );
  assertEqual(proxyIdentityCount, 0, "proxy identity binding count");

  return {
    question:
      "For K01, how do the native reinforcement descriptor classes and requested map coordinates map into the project while keeping static-proven original facts separate from project adaptations?",
    analysisStatus: "static-proven-original-identity-and-k01-requested-coordinates",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "isolated-k01-adapter-identity-source-binding",
    sources: {
      executable: beaconReport.sources.executable,
      entityCatalog: {
        path: paths.catalog,
        sha256: catalogSha256,
      },
      spriteMappingAudit: {
        path: paths.spriteAudit,
        sha256: spriteAuditSha256,
        validatedSourceFiles:
          projectStaticSourceBindings.validatedSourceFiles,
      },
      conversionManifests: projectStaticSourceBindings.bindings.flatMap(
        ({ conversionManifest, additionalConversionManifests }) => [
          conversionManifest,
          ...additionalConversionManifests,
        ],
      ),
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
    projectStaticSourceBindings: projectStaticSourceBindings.bindings,
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
        "class 13/14 copy japanese-swordsman gameplay values",
        "class 82 copies japanese-gunner gameplay values",
        "all four current visual pivots and render scaling",
      ],
      behaviorParity:
        "not proven: project stats and combat behavior remain outside this evidence; only separately linked scoped animation-state mappings are static-proven",
    },
    uncertainties: [
      "combat behavior, stats, category choices, collision radii, pivots, and animation timing are not original-proven",
      "final runtime placement can differ from native requested coordinates",
      "raw owner WORD 1 has no statically proven human-facing meaning in this unit",
    ],
  };
}

function validateProjectStaticSourceBindings(
  spriteAudit,
  currentRepositoryRoot,
  conversionManifestPathResolver,
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

  const bindings = EXPECTED_TYPES.map((expected) => {
    const binding = spriteAudit.entityTypeCatalog?.projectBindings?.find(
      ({ entityId }) => entityId === expected.projectKind,
    );
    if (!binding) {
      throw new Error(
        `sprite mapping audit is missing ${expected.projectKind} project binding`,
      );
    }
    const expectedBinding = {
      entityId: expected.projectKind,
      projectDisplayName: expected.originalGameplayName,
      projectGameplayAdapter: expected.projectGameplayAdapter,
      visualId: expected.projectKind,
      visualSourcePath: `original/imjinrok2/${expected.sourcePathNormalized}`,
      identityStatus: "static-proven",
      originalGameplayName: expected.originalGameplayName,
      internalClass: expected.internalClass,
      nameMatchesOriginal: true,
    };
    assertDeepEqual(
      binding,
      expectedBinding,
      `${expected.projectKind} project binding`,
    );

    const visual = spriteAudit.visuals?.find(
      ({ visualId }) => visualId === expected.projectKind,
    );
    if (!visual) {
      throw new Error(
        `sprite mapping audit is missing ${expected.projectKind} visual evidence`,
      );
    }
    assertEqual(
      visual.evidenceStatus,
      "mixed",
      `${expected.projectKind} visual evidence status`,
    );
    assertDeepEqual(
      {
        identity: visual.staticEvidence?.identity,
        originalGameplayName:
          visual.staticEvidence?.originalGameplayName,
        internalClass: visual.staticEvidence?.internalClass,
        spriteSlot: visual.staticEvidence?.spriteSlot,
        sourcePath: visual.staticEvidence?.sourcePath,
        baseFrame: visual.staticEvidence?.baseFrame,
        animationStateMapping:
          visual.staticEvidence?.animationStateMapping,
      },
      {
        identity: "static-proven",
        originalGameplayName: expected.originalGameplayName,
        internalClass: expected.internalClass,
        spriteSlot: expected.slot,
        sourcePath: expected.sourcePathNormalized.replace("/", "\\"),
        baseFrame: 0,
        animationStateMapping: expected.animationStateMapping,
      },
      `${expected.projectKind} visual static evidence`,
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
        path: `original/imjinrok2/${expected.sourcePathNormalized}`,
        sha256: expected.sha256,
        width: expected.width,
        height: expected.height,
        frameCount: expected.frameCount,
      },
      `${expected.projectKind} visual source`,
    );
    assertDeepEqual(
      {
        render: visual.render,
        size: visual.defaults?.size,
        pivot: visual.defaults?.pivot,
      },
      expected.visualDefaults,
      `${expected.projectKind} visual project adapter`,
    );
    if (expected.defaultStillOnly) {
      assertDeepEqual(
        visual.mappings,
        [
          {
            scope: "base",
            state: "default",
            declaredFacings: [],
            clips: [
              {
                facing: "default",
                frameFiles: [`${expected.manifestStem}_0000.png`],
                frameIndexes: [0],
                mirrorX: false,
                missingFrames: [],
              },
            ],
          },
        ],
        `${expected.projectKind} default still fallback`,
      );
    }

    const conversionManifestPhysicalPath = conversionManifestPathResolver
      ? conversionManifestPathResolver(expected.manifestLogicalPath)
      : resolve(currentRepositoryRoot, expected.manifestLogicalPath);
    const conversionManifestBuffer = readFileSync(
      conversionManifestPhysicalPath,
    );
    const conversionManifestSha256 = sha256(conversionManifestBuffer);
    const conversionManifest = parseJson(
      conversionManifestBuffer,
      conversionManifestPhysicalPath,
    );
    assertDeepEqual(
      {
        source: conversionManifest.source,
        width: conversionManifest.width,
        height: conversionManifest.height,
        frameCount: conversionManifest.frameCount,
      },
      {
        source: `original/imjinrok2/${expected.sourcePathNormalized}`,
        width: expected.width,
        height: expected.height,
        frameCount: expected.frameCount,
      },
      `${expected.projectKind} conversion manifest header`,
    );
    if (!Array.isArray(conversionManifest.exportedFrames)) {
      throw new Error(
        `${expected.projectKind} conversion manifest exportedFrames must be an array`,
      );
    }
    assertEqual(
      conversionManifest.exportedFrames.length,
      expected.frameCount,
      `${expected.projectKind} conversion manifest exported frame count`,
    );
    assertDeepEqual(
      conversionManifest.exportedFrames[0],
      { index: 0, fileName: `${expected.manifestStem}_0000.png` },
      `${expected.projectKind} conversion manifest first frame`,
    );
    assertDeepEqual(
      conversionManifest.exportedFrames.at(-1),
      {
        index: expected.frameCount - 1,
        fileName: `${expected.manifestStem}_${String(expected.frameCount - 1).padStart(4, "0")}.png`,
      },
      `${expected.projectKind} conversion manifest last frame`,
    );
    const baseFrameFile = conversionManifest.exportedFrames.find(
      ({ index }) => index === expected.baseFrame,
    )?.fileName;
    if (!baseFrameFile) {
      throw new Error(
        `${expected.projectKind} conversion manifest is missing base frame ${expected.baseFrame}`,
      );
    }
    const baseFramePath = resolve(
      dirname(conversionManifestPhysicalPath),
      baseFrameFile,
    );
    const baseFrameSha256 = sha256(readFileSync(baseFramePath));
    assertEqual(
      baseFrameSha256,
      expected.baseFrameSha256,
      `${expected.projectKind} base-frame PNG SHA-256`,
    );
    assertEqual(
      conversionManifestSha256,
      expected.manifestSha256,
      `${expected.projectKind} conversion manifest SHA-256`,
    );
    assertDeepEqual(
      visual.conversionManifest,
      {
        path: expected.manifestLogicalPath,
        sha256: conversionManifestSha256,
      },
      `${expected.projectKind} conversion manifest provenance`,
    );
    const additionalConversionManifests =
      validateAdditionalAnimationResources({
        expected,
        visual,
        currentRepositoryRoot,
        conversionManifestPathResolver,
      });

    return {
      binding: expectedBinding,
      visual: {
        evidenceStatus: visual.evidenceStatus,
        source: visual.source,
        staticEvidence: visual.staticEvidence,
        projectAdapter: {
          render: visual.render,
          defaults: visual.defaults,
          mappings: visual.mappings,
        },
      },
      conversionManifest: {
        logicalPath: expected.manifestLogicalPath,
        physicalPath: conversionManifestPhysicalPath,
        sha256: conversionManifestSha256,
        source: conversionManifest.source,
        width: conversionManifest.width,
        height: conversionManifest.height,
        frameCount: conversionManifest.frameCount,
        exportedFrameCount: conversionManifest.exportedFrames.length,
        firstFrame: conversionManifest.exportedFrames[0],
        lastFrame: conversionManifest.exportedFrames.at(-1),
        baseFrameAsset: {
          index: expected.baseFrame,
          path: baseFramePath,
          sha256: baseFrameSha256,
        },
      },
      additionalConversionManifests,
      scope: expected.scope,
    };
  });

  return { bindings, validatedSourceFiles };
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
  assertEqual(
    record.sprite?.pointerCell,
    expected.pointerCell,
    `class ${expected.internalClass} sprite pointer cell`,
  );
  const pointerCellValue = Number.parseInt(record.sprite.pointerCell, 16);
  assertEqual(
    (pointerCellValue - 0x004bc224) / 4,
    expected.spriteTableIndex,
    `class ${expected.internalClass} sprite table index`,
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
      pointerCell: expected.pointerCell,
      spriteTableIndex: expected.spriteTableIndex,
      sha256: spriteSha256,
      width: header.width,
      height: header.height,
      frameCount: header.frameCount,
    },
    additionalAnimationResources: (
      expected.additionalAnimationResources ?? []
    ).map((resource) => {
      const path = spritePathResolver
        ? spritePathResolver(resource.sourcePathNormalized)
        : resolve(originalRoot, resource.sourcePathNormalized);
      const buffer = readFileSync(path);
      const digest = sha256(buffer);
      assertEqual(
        digest,
        resource.sha256,
        `class ${expected.internalClass} ${resource.role} SPR SHA-256`,
      );
      const resourceHeader = parseSpriteLikeHeader(buffer, path);
      assertDeepEqual(
        {
          width: resourceHeader.width,
          height: resourceHeader.height,
          frameCount: resourceHeader.frameCount,
        },
        {
          width: resource.width,
          height: resource.height,
          frameCount: resource.frameCount,
        },
        `class ${expected.internalClass} ${resource.role} SPR header`,
      );
      return {
        role: resource.role,
        path: resource.sourcePathNormalized,
        slot: resource.slot,
        pointerCell: resource.pointerCell,
        sourcePointer: resource.sourcePointer,
        sha256: digest,
        width: resourceHeader.width,
        height: resourceHeader.height,
        frameCount: resourceHeader.frameCount,
      };
    }),
    projectKind: expected.projectKind,
    identityMapping: expected.identityMapping,
  };
}

function validateAdditionalAnimationResources({
  expected,
  visual,
  currentRepositoryRoot,
  conversionManifestPathResolver,
}) {
  return (expected.additionalAnimationResources ?? []).map((resource) => {
    const expectedSourcePath =
      `original/imjinrok2/${resource.sourcePathNormalized}`;
    const physicalPath = conversionManifestPathResolver
      ? conversionManifestPathResolver(resource.manifestLogicalPath)
      : resolve(currentRepositoryRoot, resource.manifestLogicalPath);
    const buffer = readFileSync(physicalPath);
    const digest = sha256(buffer);
    const manifest = parseJson(buffer, physicalPath);
    assertDeepEqual(
      {
        source: manifest.source,
        width: manifest.width,
        height: manifest.height,
        frameCount: manifest.frameCount,
      },
      {
        source: expectedSourcePath,
        width: resource.width,
        height: resource.height,
        frameCount: resource.frameCount,
      },
      `${expected.projectKind} ${resource.role} conversion manifest header`,
    );
    if (!Array.isArray(manifest.exportedFrames)) {
      throw new Error(
        `${expected.projectKind} ${resource.role} conversion manifest exportedFrames must be an array`,
      );
    }
    assertEqual(
      manifest.exportedFrames.length,
      resource.frameCount,
      `${expected.projectKind} ${resource.role} conversion manifest exported frame count`,
    );
    assertDeepEqual(
      manifest.exportedFrames[0],
      { index: 0, fileName: `${resource.manifestStem}_0000.png` },
      `${expected.projectKind} ${resource.role} conversion manifest first frame`,
    );
    assertDeepEqual(
      manifest.exportedFrames.at(-1),
      {
        index: resource.frameCount - 1,
        fileName: `${resource.manifestStem}_${String(resource.frameCount - 1).padStart(4, "0")}.png`,
      },
      `${expected.projectKind} ${resource.role} conversion manifest last frame`,
    );
    const baseFrameFile = manifest.exportedFrames.find(
      ({ index }) => index === 0,
    )?.fileName;
    if (!baseFrameFile) {
      throw new Error(
        `${expected.projectKind} ${resource.role} conversion manifest is missing base frame 0`,
      );
    }
    const baseFramePath = resolve(dirname(physicalPath), baseFrameFile);
    const baseFrameSha256 = sha256(readFileSync(baseFramePath));
    assertEqual(
      baseFrameSha256,
      resource.baseFrameSha256,
      `${expected.projectKind} ${resource.role} base-frame PNG SHA-256`,
    );
    assertEqual(
      digest,
      resource.manifestSha256,
      `${expected.projectKind} ${resource.role} conversion manifest SHA-256`,
    );
    const auditSource = visual.sources?.find(
      ({ path }) => path === expectedSourcePath,
    );
    if (!auditSource) {
      throw new Error(
        `${expected.projectKind} sprite audit is missing ${resource.role} source ${expectedSourcePath}`,
      );
    }
    assertDeepEqual(
      {
        path: auditSource.path,
        sha256: auditSource.sha256,
        width: auditSource.width,
        height: auditSource.height,
        frameCount: auditSource.frameCount,
        conversionManifest: auditSource.conversionManifest,
      },
      {
        path: expectedSourcePath,
        sha256: resource.sha256,
        width: resource.width,
        height: resource.height,
        frameCount: resource.frameCount,
        conversionManifest: {
          path: resource.manifestLogicalPath,
          sha256: resource.manifestSha256,
        },
      },
      `${expected.projectKind} ${resource.role} sprite audit source`,
    );

    return {
      role: resource.role,
      logicalPath: resource.manifestLogicalPath,
      physicalPath,
      sha256: digest,
      source: manifest.source,
      width: manifest.width,
      height: manifest.height,
      frameCount: manifest.frameCount,
      exportedFrameCount: manifest.exportedFrames.length,
      firstFrame: manifest.exportedFrames[0],
      lastFrame: manifest.exportedFrames.at(-1),
      baseFrameAsset: {
        index: 0,
        path: baseFramePath,
        sha256: baseFrameSha256,
      },
    };
  });
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
