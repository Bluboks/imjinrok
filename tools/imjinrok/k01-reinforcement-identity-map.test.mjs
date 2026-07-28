import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01ReinforcementIdentityMap,
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
const conversionManifestExpectations = [
  {
    projectKind: "japanese-gunner",
    logicalPath:
      "apps/game-client/public/assets/themes/default/entities/japanese-gunner/gunj1.manifest.json",
    sha256:
      "f156fab6f775bcf0df46a3f52356dcdbb86634447d9a674d6d9a39476178cae5",
    source: "original/imjinrok2/char/gunj1.spr",
    width: 60,
    height: 60,
    frameCount: 80,
    stem: "gunj1",
    baseFrameSha256:
      "7d17b5bc01f785e7d2e8530db10c7fc0371b39d8558b7084676ea33296918003",
  },
  {
    projectKind: "japanese-samurai",
    logicalPath:
      "apps/game-client/public/assets/themes/default/entities/japanese-samurai/horseswordj1.manifest.json",
    sha256:
      "4d2ef829d95a1b90c2e666757f29c948369e9f27c6b2b11aab992f18030bf9c9",
    source: "original/imjinrok2/char/horseswordj1.spr",
    width: 80,
    height: 80,
    frameCount: 90,
    stem: "horseswordj1",
    baseFrameSha256:
      "9294f923426de05f81e5d18be55bbe8deb31d96282e70469abe3382088ff4d02",
  },
  {
    projectKind: "japanese-turtle-tank",
    logicalPath:
      "apps/game-client/public/assets/themes/default/entities/japanese-turtle-tank/ghosttankj.manifest.json",
    sha256:
      "5d83ac52b270f0489bcde28e83896365c58468de340ffae3cebea64943bd7dc5",
    source: "original/imjinrok2/char/ghosttankj.spr",
    width: 70,
    height: 60,
    frameCount: 88,
    stem: "ghosttankj",
    baseFrameSha256:
      "104517e7249550c719ccda7473720c2384bc217f56c71543894e8ace55dcf354",
  },
  {
    projectKind: "japanese-konishi",
    logicalPath:
      "apps/game-client/public/assets/themes/default/entities/japanese-konishi/generalj11.manifest.json",
    sha256:
      "a71d9b7392a4bc366a7346c90f174c5a7e2d919296ae26d892788c0f43ac7b54",
    source: "original/imjinrok2/char/generalj11.spr",
    width: 140,
    height: 108,
    frameCount: 49,
    stem: "generalj11",
    baseFrameSha256:
      "9b94fe4900a4343de2842c60caae2575e1e949bebba3e72bbdfcfc819a1caeaf",
  },
];

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
  assert.deepEqual(
    report.sources.conversionManifests.map(
      ({
        logicalPath,
        physicalPath,
        sha256,
        source,
        width,
        height,
        frameCount,
        exportedFrameCount,
        firstFrame,
        lastFrame,
        baseFrameAsset,
      }) => ({
        logicalPath,
        physicalPath,
        sha256,
        source,
        width,
        height,
        frameCount,
        exportedFrameCount,
        firstFrame,
        lastFrame,
        baseFrameAsset,
      }),
    ),
    conversionManifestExpectations.map((expected) => ({
      logicalPath: expected.logicalPath,
      physicalPath: resolve(repositoryRoot, expected.logicalPath),
      sha256: expected.sha256,
      source: expected.source,
      width: expected.width,
      height: expected.height,
      frameCount: expected.frameCount,
      exportedFrameCount: expected.frameCount,
      firstFrame: { index: 0, fileName: `${expected.stem}_0000.png` },
      lastFrame: {
        index: expected.frameCount - 1,
        fileName: `${expected.stem}_${String(expected.frameCount - 1).padStart(4, "0")}.png`,
      },
      baseFrameAsset: {
        index: 0,
        path: resolve(
          repositoryRoot,
          expected.logicalPath,
          "..",
          `${expected.stem}_0000.png`,
        ),
        sha256: expected.baseFrameSha256,
      },
    })),
  );
  assert.deepEqual(
    report.projectStaticSourceBindings.map(
      ({ binding, visual, conversionManifest, scope }) => ({
        entityId: binding.entityId,
        projectDisplayName: binding.projectDisplayName,
        originalGameplayName: binding.originalGameplayName,
        internalClass: binding.internalClass,
        projectKind: binding.visualId,
        source: visual.source.path,
        animationStateMapping:
          visual.staticEvidence.animationStateMapping,
        manifest: conversionManifest.logicalPath,
        scope,
      }),
    ),
    [
      [12, "일본 조총병", "japanese-gunner", "gunj1"],
      [13, "일본 사무라이", "japanese-samurai", "horseswordj1"],
      [14, "일본 귀갑차", "japanese-turtle-tank", "ghosttankj"],
      [82, "일본 고니시", "japanese-konishi", "generalj11"],
    ].map(([internalClass, name, projectKind, stem]) => ({
      entityId: projectKind,
      projectDisplayName: name,
      originalGameplayName: name,
      internalClass,
      projectKind,
      source: `original/imjinrok2/char/${stem}.spr`,
      animationStateMapping:
        internalClass === 13 || internalClass === 14
          ? "static-proven-core-state-frames"
          : "unverified",
      manifest: conversionManifestExpectations.find(
        (entry) => entry.projectKind === projectKind,
      ).logicalPath,
      scope:
        internalClass === 13
          ? "project kind identity and source SPR binding are proven here; class-13 idle, move/walk, attack, and death animation frames/directions are separately static-proven by the K01 samurai animation pilot, while exact timing, stats, category, collision, behavior, render scale, and pivot remain unverified original semantics"
          : internalClass === 14
            ? "project kind identity and source SPR binding are proven here; class-14 idle, move/walk, and attack grid-direction frames/mirroring are separately static-proven by the K01 turtle-tank animation pilot, while opaque raw directions, death/destruction, exact timing, stats, category, collision, behavior, render scale, and pivot remain unverified original semantics"
          : "project kind identity and source SPR binding only; animation-state, direction, stats, category, collision, behavior, render scale, and pivot are unverified original semantics",
    })),
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
    report.requestedPositions.map(
      ({ originalClass, projectKind, identityMapping }) => ({
        originalClass,
        projectKind,
        identityMapping,
      }),
    ),
    [
      [13, "japanese-samurai"],
      [82, "japanese-konishi"],
      [13, "japanese-samurai"],
      [14, "japanese-turtle-tank"],
      [14, "japanese-turtle-tank"],
      [14, "japanese-turtle-tank"],
      [12, "japanese-gunner"],
      [12, "japanese-gunner"],
      [12, "japanese-gunner"],
    ].map(([originalClass, projectKind]) => ({
      originalClass,
      projectKind,
      identityMapping: "exact-static-identity-source",
    })),
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
          pointerCell: "0x004bc25c",
          spriteTableIndex: 14,
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
          pointerCell: "0x004bc268",
          spriteTableIndex: 17,
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
          pointerCell: "0x004bc234",
          spriteTableIndex: 4,
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
          pointerCell: "0x004bc328",
          spriteTableIndex: 65,
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
    exactStaticIdentitySourceBindingCount: 9,
    proxyIdentityBindingCount: 0,
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
      ({ entityId }) => entityId === "japanese-samurai",
    );
    binding.internalClass = 14;
    writeFileSync(path, `${JSON.stringify(audit, null, 2)}\n`);
    assert.throws(
      () => extractK01ReinforcementIdentityMap({ spriteAudit: path }),
      /japanese-samurai project binding/,
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

  await t.test("japanese-samurai conversion manifest with matching audit SHA", () => {
    const expected = conversionManifestExpectations.find(
      ({ projectKind }) => projectKind === "japanese-samurai",
    );
    const manifestPath = copiedFile(
      "horseswordj1.manifest.json",
      resolve(repositoryRoot, expected.logicalPath),
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
      ({ visualId }) => visualId === "japanese-samurai",
    );
    visual.conversionManifest.sha256 = createHash("sha256")
      .update(readFileSync(manifestPath))
      .digest("hex");
    writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
    assert.throws(
      () =>
        extractK01ReinforcementIdentityMap({
          spriteAudit: auditPath,
          conversionManifestPathResolver: (logicalPath) =>
            logicalPath === expected.logicalPath
              ? manifestPath
              : resolve(repositoryRoot, logicalPath),
        }),
      /japanese-samurai conversion manifest exported frame count/,
    );
  });

  await t.test("japanese-samurai structurally valid manifest byte tamper", () => {
    const expected = conversionManifestExpectations.find(
      ({ projectKind }) => projectKind === "japanese-samurai",
    );
    const manifestPath = copiedFile(
      "horseswordj1.manifest.json",
      resolve(repositoryRoot, expected.logicalPath),
    );
    writeFileSync(
      resolve(dirname(manifestPath), "horseswordj1_0000.png"),
      readFileSync(
        resolve(
          repositoryRoot,
          expected.logicalPath,
          "..",
          "horseswordj1_0000.png",
        ),
      ),
    );
    writeFileSync(
      manifestPath,
      Buffer.concat([readFileSync(manifestPath), Buffer.from("\n")]),
    );
    assert.throws(
      () =>
        extractK01ReinforcementIdentityMap({
          conversionManifestPathResolver: (logicalPath) =>
            logicalPath === expected.logicalPath
              ? manifestPath
              : resolve(repositoryRoot, logicalPath),
        }),
      /japanese-samurai conversion manifest SHA-256/,
    );
  });

  await t.test("japanese-samurai tampered base-frame PNG", () => {
    const expected = conversionManifestExpectations.find(
      ({ projectKind }) => projectKind === "japanese-samurai",
    );
    const manifestPath = copiedFile(
      "horseswordj1.manifest.json",
      resolve(repositoryRoot, expected.logicalPath),
    );
    const framePath = resolve(
      dirname(manifestPath),
      "horseswordj1_0000.png",
    );
    const frame = readFileSync(
      resolve(
        repositoryRoot,
        expected.logicalPath,
        "..",
        "horseswordj1_0000.png",
      ),
    );
    frame[frame.length - 1] ^= 1;
    writeFileSync(framePath, frame);
    assert.throws(
      () =>
        extractK01ReinforcementIdentityMap({
          conversionManifestPathResolver: (logicalPath) =>
            logicalPath === expected.logicalPath
              ? manifestPath
              : resolve(repositoryRoot, logicalPath),
        }),
      /japanese-samurai base-frame PNG SHA-256/,
    );
  });

  await t.test("japanese-samurai missing referenced base-frame asset", () => {
    const expected = conversionManifestExpectations.find(
      ({ projectKind }) => projectKind === "japanese-samurai",
    );
    const manifestPath = copiedFile(
      "horseswordj1.manifest.json",
      resolve(repositoryRoot, expected.logicalPath),
    );
    assert.throws(
      () =>
        extractK01ReinforcementIdentityMap({
          conversionManifestPathResolver: (logicalPath) =>
            logicalPath === expected.logicalPath
              ? manifestPath
              : resolve(repositoryRoot, logicalPath),
        }),
      /horseswordj1_0000\.png/,
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
    const tamperedSamurai = resolve(root, "char-horseswordj1.spr");
    const buffer = readFileSync(tamperedSamurai);
    buffer[0] ^= 1;
    writeFileSync(tamperedSamurai, buffer);
    assert.throws(
      () =>
        extractK01ReinforcementIdentityMap({
          originalRoot: root,
          spritePathResolver: (source) =>
            resolve(root, source.replace("/", "-")),
        }),
      /class 13 SPR SHA-256/,
    );
  });
});

function copiedFile(name, source) {
  const directory = mkdtempSync(join(tmpdir(), "k01-reinforcement-"));
  const destination = join(directory, name);
  writeFileSync(destination, readFileSync(source));
  return destination;
}
