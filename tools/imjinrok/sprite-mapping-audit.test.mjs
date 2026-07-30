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

function expectedResourceWorkDirectionFrames(frameStart, sharedBand = false) {
  return [
    ["s", 1, 0, false],
    ["sw", 5, 1, false],
    ["w", 4, 2, false],
    ["nw", 20, 3, false],
    ["n", 16, 2, true],
    ["ne", 80, 1, true],
    ["e", 64, 0, true],
    ["se", 65, 4, false],
  ].map(([facing, direction, frameBaseIndex, mirrorX]) => {
    const frameBase = sharedBand ? frameStart : frameStart + frameBaseIndex * 8;
    return {
      facing,
      direction,
      frameBase,
      frameRange: [frameBase, frameBase + 7],
      mirrorX: sharedBand ? [16, 80, 64, 65].includes(direction) : mirrorX,
    };
  });
}

function assertFarmerResourceWorkEvidence(visual, sourcePath, frameStarts) {
  const resourceWork = visual?.staticEvidence.resourceWork;
  assert.equal(resourceWork?.analysisStatus, "static-confirmed");
  assert.equal(resourceWork?.reproductionStatus, "reproduction-complete");
  assert.equal(resourceWork?.implementationStatus, "partial-project-adapters");
  for (const [state, frameStart] of Object.entries(frameStarts)) {
    const sharedBand = state === "10";
    assert.deepEqual(resourceWork?.originalStates[state], {
      sourcePath,
      frameRange: sharedBand ? [frameStart, frameStart + 7] : [frameStart, frameStart + 39],
      directionFrames: expectedResourceWorkDirectionFrames(frameStart, sharedBand),
    });
  }
  const expectedAdapters = [
    {
      projectStates: ["gather"],
      originalAnimationState: 10,
      implementationStatus: "intentional-source-layout-adapter",
    },
    ...(visual?.visualId === "villager-korean-farmer"
      ? [{ projectStates: ["build", "repair"], originalAnimationState: 11, implementationStatus: "intentional-source-layout-adapter" }]
      : []),
  ];
  assert.deepEqual(
    resourceWork?.projectAdapters.map(({ projectStates, originalAnimationState, implementationStatus }) => ({ projectStates, originalAnimationState, implementationStatus })),
    expectedAdapters,
  );
  for (const adapter of resourceWork?.projectAdapters ?? []) {
    const sourceLayout = resourceWork.originalStates[adapter.originalAnimationState];
    assert.deepEqual(adapter.sourceLayout, sourceLayout);
    for (const projectState of adapter.projectStates) {
      const mapping = visual?.mappings.find(({ scope, state }) => scope === "base" && state === projectState);
      assert.ok(mapping, `${visual?.visualId} ${projectState} mapping`);
      assert.deepEqual(
        mapping.clips.filter(({ facing }) => facing !== "default").map(({ facing, frameIndexes, mirrorX }) => ({ facing, frameIndexes, mirrorX })).sort((left, right) => left.facing.localeCompare(right.facing)),
        sourceLayout.directionFrames.map(({ facing, frameRange, mirrorX }) => ({
          facing,
          frameIndexes: Array.from({ length: frameRange[1] - frameRange[0] + 1 }, (_, index) => frameRange[0] + index),
          mirrorX,
        })).sort((left, right) => left.facing.localeCompare(right.facing)),
        `${visual?.visualId} ${projectState} must match original state-${adapter.originalAnimationState} source layout`,
      );
    }
  }
}

function assertFarmerState4FallbackEvidence(visual, sourcePath, frameStart) {
  const fallback = visual?.staticEvidence.creationDefaultState4Fallback;
  assert.equal(fallback?.analysisStatus, "static-confirmed");
  assert.equal(fallback?.reproductionStatus, "reproduction-complete");
  assert.deepEqual(fallback?.condition, {
    sourceCreated: true,
    typeFlagsHighBit: "clear",
    creationWord144: 0,
    initializerRange: visual?.staticEvidence.internalClass === 7 ? "0x0042981d-0x004298e7" : "0x00429b90-0x00429c59",
  });
  assert.equal(fallback?.originalVisualState, 4);
  assert.equal(fallback?.fallbackOriginalVisualState, 8);
  assert.equal(fallback?.sourcePath, sourcePath);
  assert.deepEqual(fallback?.directionFrames, expectedResourceWorkDirectionFrames(frameStart));
  assert.match(fallback?.productBoundary ?? "", /No product attack clip is inferred/);
}

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
    visualCount: 26,
    unitVisualCount: 15,
    buildingVisualCount: 11,
    stateMappingCount: 97,
    clipCount: 713,
    frameReferenceCount: 5_410,
    missingFrameReferenceCount: 0,
    unverifiedVisualCount: 1,
    mixedVisualCount: 23,
    scopedStaticProvenVisualCount: 2,
    staticIdentityVisualCount: 25,
    ambiguousIdentityVisualCount: 0,
    unboundIdentityVisualCount: 1,
    projectBindingCount: 25,
    projectBindingConflictCount: 0,
    portraitCueCount: 17,
    unverifiedPortraitCueCount: 0,
    k01EntityVisualCount: 22,
    k01RuntimeStateGapCount: 0,
    k01SelectionPortraitCount: 22,
    findingCount: 78,
  });
  assert.equal(report.schemaVersion, 4);
  assert.equal(report.k01EntityVisualCoverage.entries.length, 22);
  assert.equal(report.k01EntityVisualCoverage.selectionPortraitRegistry.length, 22);
  assert.ok(
    report.k01EntityVisualCoverage.entries.every(
      (entry) =>
        entry.visualId !== null &&
        entry.missingStates.length === 0 &&
        entry.missingFrames.length === 0 &&
        entry.missingSourceOrientationDirections.length === 0 &&
        entry.missingDefaultFrame === false &&
        entry.missingExplicitSelectionRepresentative === false,
    ),
  );
  assert.ok(
    report.k01EntityVisualCoverage.selectionPortraitRegistry.every(
      (entry) =>
        entry.semanticStatus === "source-frame-representative" &&
        entry.frame.fileName === entry.sourceFrameFileName,
    ),
  );
  assert.equal(
    report.visuals.filter((visual) => visual.evidenceStatus === "unverified").length,
    1,
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
    "static-proven-core-state-frames",
  );
  assert.equal(
    report.findings.filter(
      (finding) =>
        finding.visualId === "korean-swordsman" &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ).length,
    0,
  );
  assert.deepEqual(koreanSpearman?.staticEvidence.stateFrameRanges, {
    idle: [128, 177], move: [0, 39], walk: [0, 39], attack: [48, 87], death: [40, 47],
  });
  const japaneseSamurai = report.visuals.find(
    (visual) => visual.visualId === "japanese-samurai",
  );
  for (const [visualId, internalClass, name, ranges] of [
    ["korean-monk", 11, "조선 승병", { idle: [100, 139], move: [0, 39], walk: [0, 39], attack: [50, 99], death: [40, 47] }],
    ["japanese-shrine-maiden", 16, "일본 무녀", { idle: [120, 159], move: [0, 39], walk: [0, 39], attack: [60, 109], death: [40, 47] }],
  ]) {
    const visual = report.visuals.find((candidate) => candidate.visualId === visualId);
    assert.equal(visual?.evidenceStatus, "mixed");
    assert.equal(visual?.staticEvidence.internalClass, internalClass);
    assert.equal(visual?.staticEvidence.originalGameplayName, name);
    assert.equal(visual?.staticEvidence.animationStateMapping, "static-proven-core-state-frames");
    assert.deepEqual(visual?.staticEvidence.stateFrameRanges, ranges);
    assert.equal(report.findings.some((finding) => finding.visualId === visualId && (finding.code === "direction-order-unverified" || finding.code === "mirrored-facing-unverified")), false);
  }
  const japaneseGunner = report.visuals.find(
    (visual) => visual.visualId === "japanese-gunner",
  );
  const japaneseFarmer = report.visuals.find(
    (visual) => visual.visualId === "japanese-farmer",
  );
  assert.equal(japaneseFarmer?.evidenceStatus, "mixed");
  assert.equal(japaneseFarmer?.staticEvidence.internalClass, 31);
  assert.equal(japaneseFarmer?.staticEvidence.originalGameplayName, "일본 농부");
  assert.deepEqual(japaneseFarmer?.staticEvidence.stateFrameRanges, {
    idle: [0, 39], move: [160, 199], walk: [160, 199], death: [240, 247], gather: [40, 47],
  });
  assert.deepEqual(japaneseFarmer?.staticEvidence.stateSources.gather, "char\\farmerj.spr");
  assert.deepEqual(
    japaneseFarmer?.staticEvidence.directionFrames.gather,
    expectedResourceWorkDirectionFrames(40, true),
  );
  assertFarmerResourceWorkEvidence(japaneseFarmer, "char\\farmerj.spr", {
    10: 40,
    11: 80,
    16: 120,
  });
  assertFarmerState4FallbackEvidence(japaneseFarmer, "char\\farmerj.spr", 0);
  assert.deepEqual(japaneseFarmer?.staticEvidence.nonzeroResourceBranch, {
    condition: "unsigned WORD entity +0x47a != 0",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    confirmedAnimationScope:
      "project carry maps original state 1 move and carry-idle maps original state 8 idle using the recovered direction/mirror profile",
    stateSources: {
      carry: "char\\farmerj.spr",
      "carry-idle": "char\\farmerj.spr",
    },
    stateFrameRanges: { carry: [200, 239], "carry-idle": [200, 239] },
    directionFrames: ["carry", "carry-idle"].reduce((evidence, state) => {
      evidence[state] = [
        ["s", 1, 200, [200, 207], false],
        ["sw", 5, 208, [208, 215], false],
        ["w", 4, 216, [216, 223], false],
        ["nw", 20, 224, [224, 231], false],
        ["n", 16, 216, [216, 223], true],
        ["ne", 80, 208, [208, 215], true],
        ["e", 64, 200, [200, 207], true],
        ["se", 65, 232, [232, 239], false],
      ].map(([facing, direction, frameBase, frameRange, mirrorX]) => ({ facing, direction, frameBase, frameRange, mirrorX }));
      return evidence;
    }, {}),
    intentionalDuplicateStates: ["carry", "carry-idle"],
    duplicateExplanation:
      "The original class-31 +0x47a!=0 state 8 idle and state 1 move configurations both select the same 200..239 directional clip; this is static evidence, not an unverified project alias.",
  });
  assert.equal(japaneseFarmer?.staticEvidence.stateSources.attack, undefined);
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.visualId === "japanese-farmer" &&
        finding.code === "distinct-state-frame-collision" &&
        finding.states.includes("carry") &&
        finding.states.includes("carry-idle"),
    ),
    false,
  );
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.visualId === "japanese-farmer" &&
        ["gather", "carry", "carry-idle"].includes(finding.state) &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ),
    false,
  );
  assert.equal(japaneseGunner?.evidenceStatus, "mixed");
  assert.equal(
    japaneseGunner?.staticEvidence.animationStateMapping,
    "static-proven-core-state-frames",
  );
  assert.deepEqual(japaneseGunner?.staticEvidence.stateSources, {
    idle: "char\\gunj1.spr",
    move: "char\\gunj1.spr",
    walk: "char\\gunj1.spr",
    attack: "char\\gunj2.spr",
    death: "char\\gunj3.spr",
  });
  assert.equal(
    report.findings.filter(
      (finding) =>
        finding.visualId === "japanese-gunner" &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ).length,
    0,
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
  const turtleTank = report.visuals.find(
    (visual) => visual.visualId === "japanese-turtle-tank",
  );
  assert.equal(turtleTank?.staticEvidence.internalClass, 14);
  assert.equal(turtleTank?.staticEvidence.originalGameplayName, "일본 귀갑차");
  assert.equal(
    turtleTank?.staticEvidence.animationStateMapping,
    "static-proven-core-state-frames",
  );
  assert.deepEqual(turtleTank?.staticEvidence.stateFrameRanges, {
    idle: [0, 64],
    move: [0, 71],
    walk: [0, 71],
    attack: [72, 80],
  });
  assert.deepEqual(turtleTank?.staticEvidence.stateSources, {
    idle: "char\\ghosttankj.spr",
    move: "char\\ghosttankj.spr",
    walk: "char\\ghosttankj.spr",
    attack: "char\\ghosttankj.spr",
  });
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.visualId === "japanese-turtle-tank" &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ),
    false,
  );
  const konishi = report.visuals.find(
    (visual) => visual.visualId === "japanese-konishi",
  );
  assert.equal(konishi?.staticEvidence.internalClass, 82);
  assert.equal(
    konishi?.staticEvidence.animationStateMapping,
    "static-proven-core-state-frames",
  );
  assert.deepEqual(konishi?.staticEvidence.stateFrameRanges, {
    idle: [0, 29],
    move: [0, 39],
    walk: [0, 39],
    attack: [0, 49],
    death: [40, 47],
  });
  assert.deepEqual(konishi?.staticEvidence.stateSources, {
    idle: "char\\generalj12.spr",
    move: "char\\generalj11.spr",
    walk: "char\\generalj11.spr",
    attack: "char\\generalj13.spr",
    death: "char\\generalj11.spr",
  });
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.visualId === "japanese-konishi" &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ),
    false,
  );
  const japaneseSpearman = report.visuals.find(
    (visual) => visual.visualId === "japanese-swordsman",
  );
  assert.equal(japaneseSpearman?.staticEvidence.internalClass, 3);
  assert.equal(
    japaneseSpearman?.staticEvidence.originalGameplayName,
    "일본 창병",
  );
  assert.equal(japaneseSpearman?.staticEvidence.animationStateMapping, "static-proven-core-state-frames");
  assert.deepEqual(japaneseSpearman?.staticEvidence.stateFrameRanges, {
    idle: [0, 39], move: [40, 79], walk: [40, 79], attack: [120, 159], death: [176, 183],
  });
  const koreanArcher = report.visuals.find((visual) => visual.visualId === "korean-archer");
  assert.equal(koreanArcher?.staticEvidence.animationStateMapping, "static-proven-core-state-frames");
  assert.deepEqual(koreanArcher?.staticEvidence.stateFrameRanges, {
    idle: [0, 39], move: [80, 119], walk: [80, 119], attack: [120, 159], death: [160, 167],
  });
  for (const visualId of ["korean-swordsman", "japanese-swordsman", "korean-archer"]) {
    assert.equal(
      report.findings.some(
        (finding) => finding.visualId === visualId &&
          (finding.code === "direction-order-unverified" || finding.code === "mirrored-facing-unverified"),
      ),
      false,
    );
  }
  const koreanHeadquarters = report.visuals.find((visual) => visual.visualId === "korean-hq");
  assert.equal(koreanHeadquarters?.evidenceStatus, "scoped-static-proven");
  assert.deepEqual(koreanHeadquarters?.staticEvidence.constructionFrames, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(koreanHeadquarters?.staticEvidence.healthyFrame, 7);
  assert.equal(koreanHeadquarters?.staticEvidence.damagedFrame, 8);
  for (const [visualId, internalClass, name, sourcePath] of [
    ["korean-training-command", 51, "조선 훈련도감", "char\\advbarrackk.spr"],
    ["japanese-hq", 58, "일본 본영", "char\\jhq.spr"],
    ["japanese-camp-barracks", 60, "일본 훈련소", "char\\barrackj.spr"],
    ["japanese-camp-tower", 63, "일본 망루", "char\\towerj.spr"],
  ]) {
    const visual = report.visuals.find((candidate) => candidate.visualId === visualId);

    assert.equal(visual?.evidenceStatus, "mixed");
    assert.equal(visual?.staticEvidence.internalClass, internalClass);
    assert.equal(visual?.staticEvidence.originalGameplayName, name);
    assert.equal(visual?.staticEvidence.sourcePath, sourcePath);
    assert.equal(visual?.staticEvidence.baseFrame, 7);
    assert.equal(visual?.staticEvidence.bodyStateMapping, "static-proven-base-frame");
    assert.deepEqual(visual?.mappings.map((mapping) => mapping.state), ["idle"]);
  }
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
  assert.equal(currentVillager?.staticEvidence.identity, "static-proven");
  assert.equal(currentVillager?.staticEvidence.internalClass, 7);
  assert.equal(currentVillager?.staticEvidence.animationStateMapping, "static-proven-core-state-frames");
  assert.deepEqual(
    currentVillager?.staticEvidence.stateFrameRanges,
    { idle: [0, 39], move: [40, 79], walk: [40, 79], death: [240, 247], gather: [120, 127], build: [160, 199], repair: [160, 199] },
  );
  assert.deepEqual(currentVillager?.staticEvidence.stateSources.gather, "char\\farmerk.spr");
  assert.deepEqual(
    currentVillager?.staticEvidence.directionFrames.gather,
    expectedResourceWorkDirectionFrames(120, true),
  );
  assertFarmerResourceWorkEvidence(currentVillager, "char\\farmerk.spr", {
    10: 120,
    11: 160,
    16: 200,
  });
  assertFarmerState4FallbackEvidence(currentVillager, "char\\farmerk.spr", 0);
  assert.deepEqual(currentVillager?.staticEvidence.nonzeroResourceBranch, {
    condition: "unsigned WORD entity +0x47a != 0",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    confirmedAnimationScope:
      "project carry maps original state 1 move and carry-idle maps original state 8 idle using the recovered direction/mirror profile",
    stateSources: {
      carry: "char\\farmerk.spr",
      "carry-idle": "char\\farmerk.spr",
    },
    stateFrameRanges: { carry: [80, 119] },
    stateFrameIndexes: { "carry-idle": [82, 90, 98, 106, 98, 90, 82, 114] },
    directionFrames: {
      carry: [
        ["s", 1, 80, [80, 87], false],
        ["sw", 5, 88, [88, 95], false],
        ["w", 4, 96, [96, 103], false],
        ["nw", 20, 104, [104, 111], false],
        ["n", 16, 96, [96, 103], true],
        ["ne", 80, 88, [88, 95], true],
        ["e", 64, 80, [80, 87], true],
        ["se", 65, 112, [112, 119], false],
      ].map(([facing, direction, frameBase, frameRange, mirrorX]) => ({ facing, direction, frameBase, frameRange, mirrorX })),
      "carry-idle": [
        ["s", 1, 82, false], ["sw", 5, 90, false], ["w", 4, 98, false], ["nw", 20, 106, false],
        ["n", 16, 98, true], ["ne", 80, 90, true], ["e", 64, 82, true], ["se", 65, 114, false],
      ].map(([facing, direction, frameBase, mirrorX]) => ({ facing, direction, frameBase, frameRange: [frameBase, frameBase], mirrorX })),
    },
  });
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.visualId === "villager-korean-farmer" &&
        ["gather", "carry", "carry-idle"].includes(finding.state) &&
        (finding.code === "direction-order-unverified" ||
          finding.code === "mirrored-facing-unverified"),
    ),
    false,
  );
  assert.equal(japaneseFarmer?.mappings.some(({ state }) => ["build", "repair"].includes(state)), false);
  assert.equal(
    report.findings.filter(
      (finding) =>
        ["villager-korean-farmer", "japanese-farmer"].includes(finding.visualId) &&
        finding.severity === "blocking",
    ).length,
    0,
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
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.code === "distinct-state-frame-collision" &&
        finding.visualId === "japanese-gunner" &&
        finding.states.includes("attack") &&
        finding.states.includes("move"),
    ),
    false,
  );
  assert.equal(
    report.findings.filter(
      (finding) => finding.code === "building-health-frame-unverified",
    ).length,
    9,
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

test("pivot audit keeps source anchors in bounds and labels them as project adaptations", () => {
  const entityVisuals = report.visuals.filter((visual) => visual.category === "unit" || visual.category === "building");

  assert.equal(
    report.findings.some((finding) => finding.code === "pivot-anchor-out-of-bounds"),
    false,
  );
  assert.equal(
    report.findings.some((finding) => finding.code === "layer-state-without-base-state"),
    false,
  );
  assert.equal(
    report.findings.filter((finding) => finding.code === "pivot-evidence-project-adaptation").length,
    entityVisuals.length,
  );
});

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
