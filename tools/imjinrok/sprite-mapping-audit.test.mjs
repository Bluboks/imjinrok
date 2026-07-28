import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const reportPath = join(
  repositoryRoot,
  "analysis/generated/sprite-mapping-audit.json",
);
const report = JSON.parse(readFileSync(reportPath, "utf8"));

test("sprite mapping audit is deterministic and current", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "sprite-mapping-audit-"));
  const regeneratedPath = join(temporaryDirectory, "audit.json");
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "tools/imjinrok/audit-sprite-mappings.mjs",
      regeneratedPath,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(readFileSync(regeneratedPath, "utf8")),
    report,
  );
});

test("frame mappings stay quarantined outside statically proven scopes while identities are cataloged", () => {
  assert.deepEqual(report.summary, {
    visualCount: 21,
    unitVisualCount: 12,
    buildingVisualCount: 9,
    stateMappingCount: 69,
    clipCount: 429,
    frameReferenceCount: 2_978,
    missingFrameReferenceCount: 0,
    unverifiedVisualCount: 2,
    mixedVisualCount: 17,
    scopedStaticProvenVisualCount: 2,
    staticIdentityVisualCount: 19,
    ambiguousIdentityVisualCount: 1,
    unboundIdentityVisualCount: 1,
    projectBindingCount: 20,
    projectBindingConflictCount: 0,
    portraitCueCount: 17,
    unverifiedPortraitCueCount: 0,
    findingCount: 67,
  });
  assert.equal(
    report.visuals.filter((visual) => visual.evidenceStatus === "unverified").length,
    2,
  );
  assert.deepEqual(report.entityTypeCatalog.summary, {
    typeCount: 95,
    minimumClass: 1,
    maximumClass: 95,
    uniqueOriginalNameCount: 95,
    uniqueSpritePathCount: 93,
    sharedSpritePathCount: 2,
    baseFrameZeroCount: 58,
    baseFrameSevenCount: 35,
    otherBaseFrameCount: 2,
  });
  const koreanSpearman = report.visuals.find((visual) => visual.visualId === "korean-swordsman");
  assert.equal(koreanSpearman?.evidenceStatus, "mixed");
  assert.equal(koreanSpearman?.staticEvidence.originalGameplayName, "조선 창병");
  assert.equal(
    koreanSpearman?.staticEvidence.animationStateMapping,
    "static-proven-movement-only",
  );
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.visualId === "korean-swordsman" &&
        (finding.state === "move" || finding.state === "walk") &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ),
    false,
  );
  assert.equal(
    report.findings.filter(
      (finding) =>
        finding.visualId === "korean-swordsman" &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ).length,
    4,
  );
  const japaneseSamurai = report.visuals.find(
    (visual) => visual.visualId === "japanese-samurai",
  );
  assert.equal(japaneseSamurai?.staticEvidence.internalClass, 13);
  assert.equal(
    japaneseSamurai?.staticEvidence.originalGameplayName,
    "일본 사무라이",
  );
  assert.equal(
    japaneseSamurai?.staticEvidence.animationStateMapping,
    "static-proven-core-state-frames",
  );
  assert.deepEqual(
    japaneseSamurai?.staticEvidence.stateFrameRanges,
    {
      idle: [0, 39],
      move: [0, 39],
      walk: [0, 39],
      attack: [50, 89],
      death: [40, 47],
    },
  );
  assert.deepEqual(
    japaneseSamurai?.staticEvidence.stateSources,
    {
      idle: "char\\horseswordj2.spr",
      move: "char\\horseswordj1.spr",
      walk: "char\\horseswordj1.spr",
      attack: "char\\horseswordj1.spr",
      death: "char\\horseswordj1.spr",
    },
  );
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.visualId === "japanese-samurai" &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ),
    false,
  );
  assert.deepEqual(
    [
      ["japanese-turtle-tank", 14, "일본 귀갑차", 0],
      ["japanese-konishi", 82, "일본 고니시", 0],
    ].map(([visualId, internalClass, originalGameplayName, baseFrame]) => {
      const visual = report.visuals.find(
        (candidate) => candidate.visualId === visualId,
      );
      return {
        visualId,
        internalClass: visual?.staticEvidence.internalClass,
        originalGameplayName:
          visual?.staticEvidence.originalGameplayName,
        baseFrame: visual?.staticEvidence.baseFrame,
        animationStateMapping:
          visual?.staticEvidence.animationStateMapping,
        mapping: visual?.mappings,
      };
    }),
    [
      ["japanese-turtle-tank", 14, "일본 귀갑차", "ghosttankj_0000.png"],
      ["japanese-konishi", 82, "일본 고니시", "generalj11_0000.png"],
    ].map(([visualId, internalClass, originalGameplayName, frameFile]) => ({
      visualId,
      internalClass,
      originalGameplayName,
      baseFrame: 0,
      animationStateMapping: "unverified",
      mapping: [
        {
          scope: "base",
          state: "default",
          declaredFacings: [],
          clips: [
            {
              facing: "default",
              frameFiles: [frameFile],
              frameIndexes: [0],
              mirrorX: false,
              missingFrames: [],
            },
          ],
        },
      ],
    })),
  );
  const japaneseSpearman = report.visuals.find(
    (visual) => visual.visualId === "japanese-swordsman",
  );
  assert.equal(japaneseSpearman?.staticEvidence.internalClass, 3);
  assert.equal(
    japaneseSpearman?.staticEvidence.originalGameplayName,
    "일본 창병",
  );
  const koreanHeadquarters = report.visuals.find((visual) => visual.visualId === "korean-hq");
  assert.equal(koreanHeadquarters?.evidenceStatus, "scoped-static-proven");
  assert.deepEqual(koreanHeadquarters?.staticEvidence.constructionFrames, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(koreanHeadquarters?.staticEvidence.healthyFrame, 7);
  assert.equal(koreanHeadquarters?.staticEvidence.damagedFrame, 8);
  const currentBeacon = report.visuals.find(
    (visual) => visual.visualId === "korean-signal-beacon",
  );
  assert.equal(
    currentBeacon?.staticEvidence.originalGameplayName,
    "조선 봉화대",
  );
  assert.equal(
    currentBeacon?.staticEvidence.sourcePath,
    "char\\firehousek.spr",
  );
  assert.equal(currentBeacon?.staticEvidence.healthyFrame, 7);
  assert.equal(currentBeacon?.staticEvidence.damagedFrame, 8);
  const currentGeneral = report.visuals.find(
    (visual) => visual.visualId === "korean-general-k4",
  );
  assert.equal(currentGeneral?.staticEvidence.internalClass, 79);
  assert.equal(
    currentGeneral?.staticEvidence.originalGameplayName,
    "조선 사명대사",
  );
  const gwonYul = report.visuals.find(
    (visual) => visual.visualId === "korean-gwon-yul",
  );
  assert.equal(gwonYul?.staticEvidence.internalClass, 76);
  assert.equal(gwonYul?.staticEvidence.originalGameplayName, "조선 권율");
  assert.equal(
    gwonYul?.staticEvidence.animationStateMapping,
    "static-proven-core-state-frames",
  );
  assert.deepEqual(gwonYul?.staticEvidence.stateFrameRanges, {
    idle: [0, 39],
    move: [0, 39],
    walk: [0, 39],
    attack: [0, 47],
    death: [40, 47],
  });
  assert.deepEqual(gwonYul?.staticEvidence.stateSources, {
    idle: "char\\generalk13.spr",
    move: "char\\generalk11.spr",
    walk: "char\\generalk11.spr",
    attack: "char\\generalk12.spr",
    death: "char\\generalk11.spr",
  });
  assert.deepEqual(
    gwonYul?.sources.map((source) => [source.path, source.primary]),
    [
      ["original/imjinrok2/char/generalk11.spr", true],
      ["original/imjinrok2/char/generalk12.spr", false],
      ["original/imjinrok2/char/generalk13.spr", false],
    ],
  );
  const ryuSeongRyong = report.visuals.find(
    (visual) => visual.visualId === "korean-ryu-seong-ryong",
  );
  assert.equal(ryuSeongRyong?.staticEvidence.internalClass, 78);
  assert.equal(
    ryuSeongRyong?.staticEvidence.originalGameplayName,
    "조선 유성룡",
  );
  assert.equal(
    ryuSeongRyong?.staticEvidence.animationStateMapping,
    "static-proven-core-state-frames",
  );
  assert.deepEqual(
    ryuSeongRyong?.staticEvidence.stateFrameRanges,
    {
      idle: [0, 39],
      move: [40, 79],
      walk: [40, 79],
      attack: [0, 49],
      death: [50, 57],
    },
  );
  assert.equal(
    report.findings.some(
      (finding) =>
        ["korean-gwon-yul", "korean-ryu-seong-ryong"].includes(
          finding.visualId,
        ) &&
        ["idle", "move", "walk", "attack", "death"].includes(
          finding.state,
        ) &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ),
    false,
  );
  const currentVillager = report.visuals.find(
    (visual) => visual.visualId === "villager-korean-farmer",
  );
  assert.equal(currentVillager?.staticEvidence.identity, "ambiguous");
  assert.deepEqual(
    currentVillager?.staticEvidence.identityCandidates.map(
      ({ internalClass, originalGameplayName }) => [
        internalClass,
        originalGameplayName,
      ],
    ),
    [
      [7, "조선 농부"],
      [93, "솜씨 좋은 도공"],
    ],
  );
  const unboundAdvancedTower = report.visuals.find(
    (visual) => visual.visualId === "japanese-camp-advanced-tower",
  );
  assert.equal(unboundAdvancedTower?.staticEvidence.identity, "unbound");
  assert.deepEqual(
    report.entityTypeCatalog.projectBindings
      .filter((binding) => binding.nameMatchesOriginal === false)
      .map((binding) => binding.entityId),
    [],
  );
  assert.ok(
    report.portraits.cues.every(
      (cue) => cue.evidenceStatus === "static-proven",
    ),
  );
  assert.equal(report.portraits.evidenceStatus, "static-proven");
  assert.deepEqual(report.portraits.registeredSpeakerIds, [
    "K1",
    "K2",
    "K3",
    "K4",
    "K5",
    "J1",
    "J2",
    "J3",
    "J4",
    "J5",
    "C1",
    "C2",
    "C3",
    "C4",
    "C5",
    "K10",
    "K6",
  ]);
  assert.ok(
    report.portraits.originalScriptSpeakerTokens.some(
      (token) => token.speakerToken === "원균",
    ),
  );
  assert.ok(
    report.portraits.originalScriptSpeakerTokens.some(
      (token) => token.speakerToken === "이순신",
    ),
  );
  assert.deepEqual(
    Object.fromEntries(
      report.portraits.cues.map(({ portraitId, frameIndex }) => [
        portraitId,
        frameIndex,
      ]),
    ),
    {
      C1: 5,
      C2: 14,
      C3: 13,
      C4: 10,
      C5: 12,
      J1: 4,
      J2: 2,
      J3: 3,
      J4: 1,
      J5: 0,
      K1: 6,
      K10: 15,
      K2: 11,
      K3: 8,
      K4: 9,
      K5: 7,
      K6: 17,
    },
  );
  assert.ok(
    report.findings.some(
      (finding) =>
        finding.code === "distinct-state-frame-collision" &&
        finding.visualId === "japanese-gunner" &&
        finding.states.includes("attack") &&
        finding.states.includes("move"),
    ),
  );
  assert.equal(
    report.findings.filter(
      (finding) => finding.code === "building-health-frame-unverified",
    ).length,
    7,
  );
  assert.deepEqual(report.portraits.currentScenarioPortraitIds, [
    "J1",
    "K1",
    "K10",
    "K3",
  ]);
});

test("audit provenance hashes resolve to the current source files", () => {
  for (const sourceFile of report.sourceFiles) {
    assert.equal(
      sha256File(join(repositoryRoot, sourceFile.path)),
      sourceFile.sha256,
      sourceFile.path,
    );
  }
  for (const visual of report.visuals) {
    assert.equal(
      sha256File(join(repositoryRoot, visual.source.path)),
      visual.source.sha256,
      visual.source.path,
    );
    assert.equal(
      sha256File(join(repositoryRoot, visual.conversionManifest.path)),
      visual.conversionManifest.sha256,
      visual.conversionManifest.path,
    );
  }
  assert.equal(
    sha256File(join(repositoryRoot, report.portraits.source.path)),
    report.portraits.source.sha256,
    report.portraits.source.path,
  );
  assert.equal(
    sha256File(
      join(repositoryRoot, report.portraits.source.conversionManifest.path),
    ),
    report.portraits.source.conversionManifest.sha256,
    report.portraits.source.conversionManifest.path,
  );
});

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
