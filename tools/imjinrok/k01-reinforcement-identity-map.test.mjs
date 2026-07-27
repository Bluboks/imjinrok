import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01ReinforcementIdentityMap,
  JAPANESE_GUNNER_CONVERSION_MANIFEST_LOGICAL_PATH,
  mapDescriptorsToRequestedPositions,
} from "./extract-k01-reinforcement-identity-map.mjs";
import { K01_REINFORCEMENT_DESCRIPTORS } from "./extract-k01-beacon-k0120-trigger.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const catalogPath = resolve(
  repositoryRoot,
  "analysis/generated/entity-type-catalog.json",
);
const spriteAuditPath = resolve(
  repositoryRoot,
  "analysis/generated/sprite-mapping-audit.json",
);
const mapPath = resolve(
  repositoryRoot,
  "original/imjinrok2/stagemap/k01.map",
);
const originalRoot = resolve(repositoryRoot, "original/imjinrok2");
const japaneseGunnerConversionManifestPath = resolve(
  repositoryRoot,
  JAPANESE_GUNNER_CONVERSION_MANIFEST_LOGICAL_PATH,
);

test("extracts exact native descriptors, identities, and K01 requested coordinates", () => {
  const report = extractK01ReinforcementIdentityMap();

  assert.equal(
    report.sources.executable.sha256,
    "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e",
  );
  assert.deepEqual(report.sources.k01Map, {
    path: mapPath,
    sha256:
      "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb",
    size: 1097100,
    width: 60,
    height: 60,
    view: { x: 13, y: 8 },
    sourceSpawns: [{ x: 6, y: 6 }],
  });
  assert.equal(report.sources.spriteMappingAudit.path, spriteAuditPath);
  assert.equal(
    report.sources.spriteMappingAudit.sha256,
    createHash("sha256")
      .update(readFileSync(spriteAuditPath))
      .digest("hex"),
  );
  const conversionManifestSha256 = createHash("sha256")
    .update(readFileSync(japaneseGunnerConversionManifestPath))
    .digest("hex");
  assert.deepEqual(report.sources.japaneseGunnerConversionManifest, {
    logicalPath: JAPANESE_GUNNER_CONVERSION_MANIFEST_LOGICAL_PATH,
    physicalPath: japaneseGunnerConversionManifestPath,
    sha256: conversionManifestSha256,
    source: "original/imjinrok2/char/gunj1.spr",
    frameCount: 80,
    exportedFrameCount: 80,
  });
  assert.deepEqual(report.projectStaticSourceBinding.binding, {
    entityId: "japanese-gunner",
    projectDisplayName: "일본 조총병",
    visualId: "japanese-gunner",
    visualSourcePath: "original/imjinrok2/char/gunj1.spr",
    identityStatus: "static-proven",
    originalGameplayName: "일본 조총병",
    internalClass: 12,
    nameMatchesOriginal: true,
  });
  assert.equal(
    report.projectStaticSourceBinding.visual.staticEvidence
      .animationStateMapping,
    "unverified",
  );
  assert.equal(
    report.projectStaticSourceBinding.scope,
    "project kind identity and source SPR binding only; animation-state, direction, stats, and behavior are unverified",
  );
  assert.deepEqual(
    report.projectStaticSourceBinding.conversionManifest,
    report.sources.japaneseGunnerConversionManifest,
  );
  assert.deepEqual(
    report.requestedPositions.map(
      ({
        originalClass,
        rawOwnerWord,
        offset,
        requestedPosition,
        inBounds,
      }) => ({
        originalClass,
        rawOwnerWord,
        offset,
        requestedPosition,
        inBounds,
      }),
    ),
    [
      { originalClass: 13, rawOwnerWord: 1, offset: { x: -2, y: -2 }, requestedPosition: { x: 53, y: 51 }, inBounds: true },
      { originalClass: 82, rawOwnerWord: 1, offset: { x: 0, y: -2 }, requestedPosition: { x: 55, y: 51 }, inBounds: true },
      { originalClass: 13, rawOwnerWord: 1, offset: { x: 2, y: -2 }, requestedPosition: { x: 57, y: 51 }, inBounds: true },
      { originalClass: 14, rawOwnerWord: 1, offset: { x: -2, y: 0 }, requestedPosition: { x: 53, y: 53 }, inBounds: true },
      { originalClass: 14, rawOwnerWord: 1, offset: { x: 0, y: 0 }, requestedPosition: { x: 55, y: 53 }, inBounds: true },
      { originalClass: 14, rawOwnerWord: 1, offset: { x: 2, y: 0 }, requestedPosition: { x: 57, y: 53 }, inBounds: true },
      { originalClass: 12, rawOwnerWord: 1, offset: { x: -2, y: 2 }, requestedPosition: { x: 53, y: 55 }, inBounds: true },
      { originalClass: 12, rawOwnerWord: 1, offset: { x: 0, y: 2 }, requestedPosition: { x: 55, y: 55 }, inBounds: true },
      { originalClass: 12, rawOwnerWord: 1, offset: { x: 2, y: 2 }, requestedPosition: { x: 57, y: 55 }, inBounds: true },
    ],
  );
  assert.deepEqual(
    report.identities.map(({ internalClass, originalGameplayName, sprite }) => ({
      internalClass,
      originalGameplayName,
      sprite,
    })),
    [
      {
        internalClass: 12,
        originalGameplayName: "일본 조총병",
        sprite: {
          path: "char/gunj1.spr",
          slot: 114,
          baseFrame: 0,
          sha256: "e35c3dddfc4860d3e8ccbb7d86ecb006b11230e269d04091dcfa320dc116a7a8",
          width: 60,
          height: 60,
          frameCount: 80,
        },
      },
      {
        internalClass: 13,
        originalGameplayName: "일본 사무라이",
        sprite: {
          path: "char/horseswordj1.spr",
          slot: 117,
          baseFrame: 0,
          sha256: "f08dba883a1e5686383d05882d2c0f21c2bb52b6b2c2bb00e4d806f41ac9fdfa",
          width: 80,
          height: 80,
          frameCount: 90,
        },
      },
      {
        internalClass: 14,
        originalGameplayName: "일본 귀갑차",
        sprite: {
          path: "char/ghosttankj.spr",
          slot: 104,
          baseFrame: 0,
          sha256: "34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec",
          width: 70,
          height: 60,
          frameCount: 88,
        },
      },
      {
        internalClass: 82,
        originalGameplayName: "일본 고니시",
        sprite: {
          path: "char/generalj11.spr",
          slot: 165,
          baseFrame: 0,
          sha256: "eff3f8eb3a60c50ea6ac534d90e568bac415526a00f6ca2e287e00bfdf4bb03f",
          width: 140,
          height: 108,
          frameCount: 49,
        },
      },
    ],
  );
  assert.deepEqual(report.integration, {
    exactRequestedCoordinateCount: 9,
    exactStaticIdentitySourceBindingCount: 3,
    proxyIdentityBindingCount: 6,
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
  });
});

test("produces a deterministic focused report", () => {
  assert.deepEqual(
    extractK01ReinforcementIdentityMap(),
    extractK01ReinforcementIdentityMap(),
  );
});

test("replays signed-WORD coordinate wrap and K01 map boundaries", () => {
  assert.deepEqual(
    mapDescriptorsToRequestedPositions({
      descriptors: [[1, 1, -1, 0], [0]],
      origin: { x: 0, y: 59 },
      mapWidth: 60,
      mapHeight: 60,
    }),
    [
      {
        index: 0,
        originalClass: 1,
        rawOwnerWord: 1,
        offset: { x: -1, y: 0 },
        requestedPosition: { x: -1, y: 59 },
        inBounds: false,
      },
    ],
  );
  assert.equal(
    mapDescriptorsToRequestedPositions({
      descriptors: [[1, 1, 1, 0], [0]],
      origin: { x: 0x7fff, y: 0 },
      mapWidth: 60,
      mapHeight: 60,
    })[0].requestedPosition.x,
    -0x8000,
  );
});

test("rejects malformed fixed-width descriptor and map contracts", () => {
  assert.throws(
    () =>
      mapDescriptorsToRequestedPositions({
        descriptors: [[1, 1, 0, 0]],
        origin: { x: 0, y: 0 },
        mapWidth: 60,
        mapHeight: 60,
      }),
    /missing its class-zero terminator/,
  );
  assert.throws(
    () =>
      mapDescriptorsToRequestedPositions({
        descriptors: [[1, 1, 0x8000, 0], [0]],
        origin: { x: 0, y: 0 },
        mapWidth: 60,
        mapHeight: 60,
      }),
    /descriptor 0 dx must be a signed WORD/,
  );
  assert.throws(
    () =>
      mapDescriptorsToRequestedPositions({
        descriptors: K01_REINFORCEMENT_DESCRIPTORS,
        origin: { x: 0, y: 0 },
        mapWidth: 0,
        mapHeight: 60,
      }),
    /mapWidth must be a positive unsigned DWORD/,
  );
  assert.throws(
    () =>
      mapDescriptorsToRequestedPositions({
        descriptors: K01_REINFORCEMENT_DESCRIPTORS,
        origin: { x: 0, y: 0 },
        mapWidth: 0x1_0000_0000,
        mapHeight: 60,
      }),
    /mapWidth must be a positive unsigned DWORD/,
  );
});

test("rejects tampered descriptor evidence", () => {
  const canonical = extractK01ReinforcementIdentityMap();
  assert.throws(
    () =>
      extractK01ReinforcementIdentityMap({
        beaconReport: {
          ...canonical,
          descriptorCreation: {
            helper: "0x00488420",
            origin: { x: 55, y: 53 },
            rawArgument: 0x10,
            descriptors: [[12, 1, 0, 0], [0]],
          },
          sources: canonical.sources,
        },
      }),
    /verified K01 native descriptors/,
  );
});

test("rejects tampered catalog, map, sprite audit, manifest, and SPR inputs", async (t) => {
  await t.test("catalog", () => {
    const path = copiedFile("entity-type-catalog.json", catalogPath);
    const buffer = readFileSync(path);
    buffer[buffer.length - 2] ^= 1;
    writeFileSync(path, buffer);
    assert.throws(
      () => extractK01ReinforcementIdentityMap({ catalog: path }),
      /entity type catalog SHA-256/,
    );
  });

  await t.test("map", () => {
    const path = copiedFile("k01.map", mapPath);
    const buffer = readFileSync(path);
    buffer[0] ^= 1;
    writeFileSync(path, buffer);
    assert.throws(
      () => extractK01ReinforcementIdentityMap({ map: path }),
      /K01 map SHA-256/,
    );
  });

  await t.test("sprite audit project binding", () => {
    const path = copiedFile(
      "sprite-mapping-audit.json",
      spriteAuditPath,
    );
    const audit = JSON.parse(readFileSync(path, "utf8"));
    const binding = audit.entityTypeCatalog.projectBindings.find(
      ({ entityId }) => entityId === "japanese-gunner",
    );
    binding.internalClass = 13;
    writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`);
    assert.throws(
      () => extractK01ReinforcementIdentityMap({ spriteAudit: path }),
      /japanese-gunner project binding/,
    );
  });

  await t.test("sprite audit source provenance", () => {
    const path = copiedFile(
      "sprite-mapping-audit.json",
      spriteAuditPath,
    );
    const audit = JSON.parse(readFileSync(path, "utf8"));
    const source = audit.sourceFiles.find(
      ({ path: sourcePath }) =>
        sourcePath === "packages/shared/src/scenarios.ts",
    );
    source.sha256 = "0".repeat(64);
    writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`);
    assert.throws(
      () => extractK01ReinforcementIdentityMap({ spriteAudit: path }),
      /sprite mapping audit provenance packages\/shared\/src\/scenarios\.ts/,
    );
  });

  await t.test("japanese-gunner conversion manifest", () => {
    const manifestPath = copiedFile(
      "gunj1.manifest.json",
      japaneseGunnerConversionManifestPath,
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.exportedFrames.pop();
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const auditPath = copiedFile(
      "sprite-mapping-audit.json",
      spriteAuditPath,
    );
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    const visual = audit.visuals.find(
      ({ visualId }) => visualId === "japanese-gunner",
    );
    visual.conversionManifest.sha256 = createHash("sha256")
      .update(readFileSync(manifestPath))
      .digest("hex");
    writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
    assert.throws(
      () =>
        extractK01ReinforcementIdentityMap({
          spriteAudit: auditPath,
          japaneseGunnerConversionManifest: manifestPath,
        }),
      /japanese-gunner conversion manifest exported frame count/,
    );
  });

  await t.test("SPR", () => {
    const root = mkdtempSync(join(tmpdir(), "k01-reinforcement-spr-"));
    for (const source of [
      "char/gunj1.spr",
      "char/horseswordj1.spr",
      "char/ghosttankj.spr",
      "char/generalj11.spr",
    ]) {
      const destination = resolve(root, source.replace("/", "-"));
      writeFileSync(destination, readFileSync(resolve(originalRoot, source)));
    }
    const tamperedGunner = resolve(root, "char-gunj1.spr");
    const buffer = readFileSync(tamperedGunner);
    buffer[0] ^= 1;
    writeFileSync(tamperedGunner, buffer);
    assert.throws(
      () =>
        extractK01ReinforcementIdentityMap({
          originalRoot: root,
          spritePathResolver: (source) =>
            resolve(root, source.replace("/", "-")),
        }),
      /class 12 SPR SHA-256/,
    );
  });
});

function copiedFile(name, source) {
  const directory = mkdtempSync(join(tmpdir(), "k01-reinforcement-"));
  const destination = join(directory, name);
  writeFileSync(destination, readFileSync(source));
  return destination;
}
