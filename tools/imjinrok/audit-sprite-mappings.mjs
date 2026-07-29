#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

import { MISSION_PORTRAIT_IMAGE_CUES } from "../../apps/game-client/src/missionPortraits.ts";
import { unitDefinitions } from "../../packages/shared/src/content.ts";
import { k01ReinforcementAdapter } from "../../packages/shared/src/scenarios.ts";
import { defaultTheme } from "../../packages/shared/src/themes.ts";
import { extractBeaconStatePilot } from "./extract-beacon-state-pilot.mjs";
import { extractBuildingStatePilot } from "./extract-building-state-pilot.mjs";
import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { extractK01HeroMovementPilot } from "./extract-k01-hero-movement-pilot.mjs";
import { extractK01SamuraiAnimationPilot } from "./extract-k01-samurai-animation-pilot.mjs";
import { extractK01TurtleTankAnimationPilot } from "./extract-k01-turtle-tank-animation-pilot.mjs";
import { extractK01KonishiAnimationPilot } from "./extract-k01-konishi-animation-pilot.mjs";
import { extractK01CoreUnitAnimations } from "./extract-k01-core-unit-animations.mjs";
import { extractK01JapaneseFarmerFrames } from "./extract-k01-japanese-farmer-frames.mjs";
import { extractK01KoreanFarmerCoreFrames } from "./extract-k01-korean-farmer-core-frames.mjs";
import { extractK01FarmerResourceBranchFrames } from "./extract-k01-farmer-resource-branch-frames.mjs";
import { extractK01SpecialUnitAnimations } from "./extract-k01-special-unit-animations.mjs";
import { extractK01NormalReinforcementAnimationBatch } from "./extract-k01-normal-reinforcement-animation-batch.mjs";
import { extractMissionPortraitMapping } from "./extract-mission-portrait-mapping.mjs";
import { extractUnitAnimationPilot } from "./extract-unit-animation-pilot.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const publicThemeRoot = join(
  repositoryRoot,
  "apps/game-client/public/assets/themes/default",
);
const themesPath = join(repositoryRoot, "packages/shared/src/themes.ts");
const visualsPath = join(repositoryRoot, "packages/shared/src/visuals.ts");
const contentPath = join(repositoryRoot, "packages/shared/src/content.ts");
const scenariosPath = join(repositoryRoot, "packages/shared/src/scenarios.ts");
const generatorPath = join(
  repositoryRoot,
  "tools/imjinrok/audit-sprite-mappings.mjs",
);
const skirmishScenePath = join(
  repositoryRoot,
  "apps/game-client/src/scenes/SkirmishScene.ts",
);
const missionPortraitsPath = join(
  repositoryRoot,
  "apps/game-client/src/missionPortraits.ts",
);
const missionPortraitExtractorPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-mission-portrait-mapping.mjs",
);
const unitAnimationPilotPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-unit-animation-pilot.mjs",
);
const k01HeroMovementPilotPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-hero-movement-pilot.mjs",
);
const k01SamuraiAnimationPilotPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-samurai-animation-pilot.mjs",
);
const k01TurtleTankAnimationPilotPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-turtle-tank-animation-pilot.mjs",
);
const k01KonishiAnimationPilotPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-konishi-animation-pilot.mjs",
);
const k01CoreUnitAnimationsPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-core-unit-animations.mjs",
);
const k01JapaneseFarmerFramesPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-japanese-farmer-frames.mjs",
);
const k01KoreanFarmerCoreFramesPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-korean-farmer-core-frames.mjs",
);
const k01FarmerResourceBranchFramesPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-farmer-resource-branch-frames.mjs",
);
const k01SpecialUnitAnimationsPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-special-unit-animations.mjs",
);
const k01NormalReinforcementAnimationBatchPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-k01-normal-reinforcement-animation-batch.mjs",
);
const buildingStatePilotPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-building-state-pilot.mjs",
);
const beaconStatePilotPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-beacon-state-pilot.mjs",
);
const entityTypeCatalogExtractorPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-entity-type-catalog.mjs",
);
const entityTypeCatalogPath = join(
  repositoryRoot,
  "analysis/generated/entity-type-catalog.json",
);
const portraitManifestPath = join(
  publicThemeRoot,
  "ui/mission-portraits/hero.manifest.json",
);
const outputPath = resolve(
  repositoryRoot,
  process.argv[2] ?? "analysis/generated/sprite-mapping-audit.json",
);
const unitAnimationPilot = extractUnitAnimationPilot();
const k01HeroMovementPilot = extractK01HeroMovementPilot();
const k01SamuraiAnimationPilot = extractK01SamuraiAnimationPilot();
const k01TurtleTankAnimationPilot =
  extractK01TurtleTankAnimationPilot();
const k01KonishiAnimationPilot = extractK01KonishiAnimationPilot();
const k01CoreUnitAnimations = extractK01CoreUnitAnimations();
const k01JapaneseFarmerFrames = extractK01JapaneseFarmerFrames();
const k01KoreanFarmerCoreFrames = extractK01KoreanFarmerCoreFrames();
const k01FarmerResourceBranchFrames = extractK01FarmerResourceBranchFrames();
const k01SpecialUnitAnimations = extractK01SpecialUnitAnimations();
const k01NormalReinforcementAnimationBatch = extractK01NormalReinforcementAnimationBatch();
const buildingStatePilot = extractBuildingStatePilot();
const beaconStatePilot = extractBeaconStatePilot();
const entityTypeCatalog = extractEntityTypeCatalog();
const catalogTypesBySourcePath = groupBy(
  entityTypeCatalog.types,
  (type) => type.sprite.sourcePathNormalized,
);

const visualRecords = [];
const findings = [];
let stateMappingCount = 0;
let clipCount = 0;
let frameReferenceCount = 0;
let missingFrameReferenceCount = 0;

for (const visual of Object.values(defaultTheme.visuals)
  .filter((candidate) => candidate.kind === "entity")
  .sort((left, right) => left.id.localeCompare(right.id))) {
  const manifestResources = findManifests(
    join(publicThemeRoot, visual.assetPath),
  ).map(readManifestResource);
  const primaryResource = selectPrimaryManifestResource(manifestResources);
  const exportedFrameNames = new Set(
    manifestResources.flatMap((resource) =>
      resource.manifest.exportedFrames.map((frame) => frame.fileName),
    ),
  );
  const category = isProjectBuildingVisual(visual.id) ? "building" : "unit";
  const mappings = [];

  appendStateMappings({
    mappings,
    scope: "base",
    states: visual.states,
    exportedFrameNames,
    visual,
  });
  for (const layer of visual.layers ?? []) {
    appendStateMappings({
      mappings,
      scope: `layer:${layer.id}`,
      states: layer.states,
      exportedFrameNames,
      visual,
    });
  }

  const identityCandidates =
    catalogTypesBySourcePath.get(primaryResource.sourcePathNormalized) ?? [];
  const staticEvidence = buildVisualStaticEvidence(
    visual,
    identityCandidates,
  );
  const visualRecord = {
    visualId: visual.id,
    category,
    assetPath: visual.assetPath,
    render: visual.render,
    defaults: visual.defaults,
    evidenceStatus: staticEvidence.status,
    staticEvidence,
    source: primaryResource.source,
    conversionManifest: primaryResource.conversionManifest,
    sources: manifestResources.map((resource) => ({
      ...resource.source,
      conversionManifest: resource.conversionManifest,
      primary: resource === primaryResource,
    })),
    mappings,
  };
  visualRecords.push(visualRecord);
  appendVisualFindings(visualRecord);
  appendIdentityFindings(visualRecord);
}

const projectBindings = buildProjectBindingAudit(visualRecords);
findings.push(...projectBindings.findings);
const portraitAudit = buildPortraitAudit();
findings.push(...portraitAudit.findings);

const report = {
  schemaVersion: 2,
  policy: {
    semanticStatus: "mixed",
    acceptedEvidence:
      "All 95 original type identities, uniquely matched current visual source identities, SPEECH portraits, Korean HQ and signal-beacon body states, K01 opening classes 48/49/51/58/60/63 catalog base frame 7 bindings, K01 classes 2/3/4/7/11/12/13/16/31/82 normal core states in their documented limits, class-7/31 +0x47a!=0 carry/carry-idle states, class-14 Japanese turtle-tank idle/move/attack grid states plus its non-theme 16-ring turn and creation-default transient destruction contracts, and the K01 heroes' idle, movement, attack, and death frame/direction mappings are statically proven in their documented scopes.",
    parityUse:
      "A unique source identity proves the original name and SPR binding only. Only explicitly listed frame scopes may be used for animation parity; all other direction, action, layer, and body mappings remain quarantined.",
  },
  sourceFiles: [
    sourceFileRecord(themesPath),
    sourceFileRecord(visualsPath),
    sourceFileRecord(contentPath),
    sourceFileRecord(scenariosPath),
    sourceFileRecord(skirmishScenePath),
    sourceFileRecord(missionPortraitsPath),
    sourceFileRecord(missionPortraitExtractorPath),
    sourceFileRecord(unitAnimationPilotPath),
    sourceFileRecord(k01HeroMovementPilotPath),
    sourceFileRecord(k01SamuraiAnimationPilotPath),
    sourceFileRecord(k01TurtleTankAnimationPilotPath),
    sourceFileRecord(k01KonishiAnimationPilotPath),
    sourceFileRecord(k01CoreUnitAnimationsPath),
    sourceFileRecord(k01JapaneseFarmerFramesPath),
    sourceFileRecord(k01KoreanFarmerCoreFramesPath),
    sourceFileRecord(k01FarmerResourceBranchFramesPath),
    sourceFileRecord(k01SpecialUnitAnimationsPath),
    sourceFileRecord(k01NormalReinforcementAnimationBatchPath),
    sourceFileRecord(buildingStatePilotPath),
    sourceFileRecord(beaconStatePilotPath),
    sourceFileRecord(entityTypeCatalogExtractorPath),
    sourceFileRecord(entityTypeCatalogPath),
    sourceFileRecord(generatorPath),
    sourceFileRecord(portraitManifestPath),
  ],
  summary: {
    visualCount: visualRecords.length,
    unitVisualCount: visualRecords.filter(
      (visual) => visual.category === "unit",
    ).length,
    buildingVisualCount: visualRecords.filter(
      (visual) => visual.category === "building",
    ).length,
    stateMappingCount,
    clipCount,
    frameReferenceCount,
    missingFrameReferenceCount,
    unverifiedVisualCount: visualRecords.filter(
      (visual) => visual.evidenceStatus === "unverified",
    ).length,
    mixedVisualCount: visualRecords.filter(
      (visual) => visual.evidenceStatus === "mixed",
    ).length,
    scopedStaticProvenVisualCount: visualRecords.filter(
      (visual) => visual.evidenceStatus === "scoped-static-proven",
    ).length,
    staticIdentityVisualCount: visualRecords.filter(
      (visual) => visual.staticEvidence.identity === "static-proven",
    ).length,
    ambiguousIdentityVisualCount: visualRecords.filter(
      (visual) => visual.staticEvidence.identity === "ambiguous",
    ).length,
    unboundIdentityVisualCount: visualRecords.filter(
      (visual) => visual.staticEvidence.identity === "unbound",
    ).length,
    projectBindingCount: projectBindings.bindings.length,
    projectBindingConflictCount: projectBindings.bindings.filter(
      (binding) => binding.nameMatchesOriginal === false,
    ).length,
    portraitCueCount: portraitAudit.cues.length,
    unverifiedPortraitCueCount: portraitAudit.cues.filter(
      (cue) => cue.evidenceStatus === "unverified",
    ).length,
    findingCount: findings.length,
  },
  visuals: visualRecords,
  entityTypeCatalog: {
    evidenceStatus: entityTypeCatalog.evidenceStatus,
    source: sourceFileRecord(entityTypeCatalogPath),
    summary: entityTypeCatalog.summary,
    projectBindings: projectBindings.bindings,
  },
  k01ReinforcementAdapter: k01ReinforcementAdapter.map(
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
  portraits: {
    evidenceStatus: "static-proven",
    source: portraitAudit.source,
    currentScenarioPortraitIds: portraitAudit.currentScenarioPortraitIds,
    registeredSpeakerIds: portraitAudit.registeredSpeakerIds,
    originalScriptSpeakerTokens: portraitAudit.originalScriptSpeakerTokens,
    cues: portraitAudit.cues,
  },
  findings: findings.sort(compareFindings),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  output: toRepositoryPath(outputPath),
  ...report.summary,
}, null, 2));

function appendStateMappings({
  mappings,
  scope,
  states,
  exportedFrameNames,
  visual,
}) {
  for (const [stateName, state] of Object.entries(states).sort(compareEntries)) {
    stateMappingCount++;
    const clips = [];
    for (const [facing, clip] of Object.entries(state.clips).sort(
      compareEntries,
    )) {
      clipCount++;
      frameReferenceCount += clip.frames.length;
      const missingFrames = clip.frames
        .map((frame) => frame.fileName)
        .filter((fileName) => !exportedFrameNames.has(fileName));
      missingFrameReferenceCount += missingFrames.length;
      clips.push({
        facing,
        frameFiles: clip.frames.map((frame) => frame.fileName),
        frameIndexes: clip.frames.map((frame) => parseFrameIndex(frame.fileName)),
        mirrorX: clip.mirrorX === true,
        missingFrames,
      });
    }
    mappings.push({
      scope,
      state: stateName,
      declaredFacings: [...(state.facings ?? [])],
      clips,
    });

    const staticDirectionEvidence = hasStaticDirectionEvidence(
      visual.id,
      scope,
      stateName,
    );
    if ((state.facings?.length ?? 0) > 0 && !staticDirectionEvidence) {
      findings.push({
        severity: "blocking",
        code: "direction-order-unverified",
        visualId: visual.id,
        scope,
        state: stateName,
        detail: "Facing labels are assigned by a hard-coded source-frame order.",
      });
    }
    if (clips.some((clip) => clip.mirrorX) && !staticDirectionEvidence) {
      findings.push({
        severity: "blocking",
        code: "mirrored-facing-unverified",
        visualId: visual.id,
        scope,
        state: stateName,
        detail: "Three facings reuse mirrored source frames without binary/data proof.",
      });
    }
  }
}

function appendVisualFindings(visual) {
  if (visual.category === "building") {
    const idleMappings = visual.mappings.filter(
      (mapping) => mapping.state === "idle",
    );
    const constructionMappings = visual.mappings.filter(
      (mapping) => mapping.state === "construction",
    );
    if (visual.staticEvidence.bodyStateMapping !== "static-proven") {
      findings.push({
        severity: "blocking",
        code: "building-health-frame-unverified",
        visualId: visual.visualId,
        detail:
          "Idle/full-health and construction/damage semantics are inferred from frame positions.",
        idleFrameIndexes: uniqueFrameIndexes(idleMappings),
        constructionFrameIndexes: uniqueFrameIndexes(constructionMappings),
      });
    }
  }

  const baseMappings = visual.mappings.filter(
    (mapping) => mapping.scope === "base",
  );
  for (let leftIndex = 0; leftIndex < baseMappings.length; leftIndex++) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < baseMappings.length;
      rightIndex++
    ) {
      const left = baseMappings[leftIndex];
      const right = baseMappings[rightIndex];
      if (isIntentionalAlias(visual.visualId, left.state, right.state)) {
        continue;
      }
      if (clipSignature(left.clips) !== clipSignature(right.clips)) {
        continue;
      }
      findings.push({
        severity: "blocking",
        code: "distinct-state-frame-collision",
        visualId: visual.visualId,
        states: [left.state, right.state],
        detail: "Distinct gameplay states currently resolve to identical frame clips.",
      });
    }
  }
}

function buildVisualStaticEvidence(visual, identityCandidates) {
  if (visual.id === "villager-korean-farmer") {
    const farmer = k01KoreanFarmerCoreFrames;
    const carriedStates = k01FarmerResourceBranchFrames.states[7];
    return {
      status: "mixed",
      identity: "static-proven",
      originalGameplayName: farmer.identity.originalGameplayName,
      internalClass: farmer.identity.internalClass,
      spriteSlot: farmer.identity.spriteSlot,
      sourcePath: farmer.identity.sourcePath,
      baseFrame: 0,
      flags: farmer.identity.typeFlags,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        "project idle, move/walk, and death use the statically recovered K01 source-created class-7 +0x47a==0 state 8, 1, and 7 frames, direction order, and mirroring",
      stateFrameRanges: {
        idle: farmer.states.idle.frameRange,
        move: farmer.states.move.frameRange,
        walk: farmer.states.move.frameRange,
        death: farmer.states.death.frameRange,
      },
      stateSources: {
        idle: farmer.states.idle.sourcePath,
        move: farmer.states.move.sourcePath,
        walk: farmer.states.move.sourcePath,
        death: farmer.states.death.sourcePath,
      },
      nonzeroResourceBranch: farmerResourceBranchAuditEvidence(carriedStates),
      unresolvedScope:
        "state 4 attack, exact timing/FPS, pivot, stats, commands, behavior, later runtime mutation, and death lifetime remain unresolved; gather/build/repair remain project source-layout adaptations",
    };
  }

  if (identityCandidates.length === 0) {
    return {
      status: "unverified",
      identity: "unbound",
      identityCandidates: [],
      bodyStateMapping:
        visual.states.construction === undefined
          ? undefined
          : "unverified",
      animationStateMapping:
        visual.states.construction === undefined
          ? "unverified"
          : undefined,
    };
  }
  if (identityCandidates.length > 1) {
    return {
      status: "unverified",
      identity: "ambiguous",
      identityCandidates: identityCandidates.map(toIdentitySummary),
      bodyStateMapping:
        visual.states.construction === undefined
          ? undefined
          : "unverified",
      animationStateMapping:
        visual.states.construction === undefined
          ? "unverified"
          : undefined,
    };
  }

  const [identity] = identityCandidates;
  const identityEvidence = {
    identity: "static-proven",
    originalGameplayName: identity.originalGameplayName,
    internalClass: identity.internalClass,
    spriteSlot: identity.sprite.slot,
    sourcePath: identity.sprite.sourcePath,
    baseFrame: identity.sprite.baseFrame,
    flags: identity.definition.flags,
  };

  if (visual.id === "korean-swordsman") {
    const unit = k01CoreUnitAnimations.classes.find(({ identity }) => identity.internalClass === 2);
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        "project idle, move/walk, attack, and death use the statically recovered class-2 state 8, 1, 4, and 7 frames, direction order, and mirroring",
      stateFrameRanges: coreStateFrameRanges(unit),
      stateSources: coreStateSources(unit),
      unresolvedScope:
        "state 2 is a statically proven alternate movement variant but its environment label and project policy are unresolved; the state 1 masked +0x1e8 path, exact timing, pivot, later flags, hit reaction, and death lifetime remain unresolved",
    };
  }

  if (visual.id === "japanese-swordsman" || visual.id === "korean-archer") {
    const internalClass = visual.id === "japanese-swordsman" ? 3 : 4;
    const unit = k01CoreUnitAnimations.classes.find(({ identity }) => identity.internalClass === internalClass);
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        `project idle, move/walk, attack, and death use the statically recovered class-${internalClass} state 8, 1, 4, and 7 frames, direction order, and mirroring`,
      stateFrameRanges: coreStateFrameRanges(unit),
      stateSources: coreStateSources(unit),
      unresolvedScope:
        "state 2 is a statically proven alternate movement variant but its environment label and project policy are unresolved; exact timing, pivot, later flags, hit reaction, and death lifetime remain unresolved",
    };
  }

  if (visual.id === "korean-monk" || visual.id === "japanese-shrine-maiden") {
    const internalClass = visual.id === "korean-monk" ? 11 : 16;
    const unit = k01SpecialUnitAnimations.classes.find(({ identity }) => identity.internalClass === internalClass);
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        `project idle, move/walk, attack, and death use the statically recovered class-${internalClass} state 8, 1, 4, and 7 frames, direction order, and mirroring`,
      stateFrameRanges: coreStateFrameRanges(unit),
      stateSources: coreStateSources(unit),
      unresolvedScope:
        "exact timing, pivot, stats, behavior, magic, state 2, later runtime mutation, hit reaction, and death lifetime remain unresolved",
    };
  }

  if (visual.id === "japanese-gunner") {
    const states = k01NormalReinforcementAnimationBatch.states;
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        "project idle, move/walk, attack, and death use the statically recovered class-12 state 8, 1, 4, and 7 slots, frames, direction order, and mirroring; class-12 state 2 remains quarantined",
      stateFrameRanges: {
        idle: states.idle.frameRange,
        move: states.move.frameRange,
        walk: states.move.frameRange,
        attack: states.attack.frameRange,
        death: states.death.frameRange,
      },
      stateSources: {
        idle: states.idle.sourcePath,
        move: states.move.sourcePath,
        walk: states.move.sourcePath,
        attack: states.attack.sourcePath,
        death: states.death.sourcePath,
      },
      unresolvedScope:
        "state 2 is a statically proven movement variant but its environment label and project policy are unresolved; exact timing, pivot, later flags, hit reaction, and death lifetime remain unresolved",
    };
  }

  if (visual.id === "japanese-farmer") {
    const states = k01JapaneseFarmerFrames.states;
    const carriedStates = k01FarmerResourceBranchFrames.states[31];
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        "project idle and move/walk and death use the statically recovered class-31 state 8, 1, and 7 frames, direction order, and mirroring; state 4 attack is deliberately absent and the existing runtime fallback selects idle",
      stateFrameRanges: {
        idle: stateFrameRange(states.idle),
        move: stateFrameRange(states.move),
        walk: stateFrameRange(states.move),
        death: stateFrameRange(states.death),
      },
      stateSources: {
        idle: states.idle.sourcePath,
        move: states.move.sourcePath,
        walk: states.move.sourcePath,
        death: states.death.sourcePath,
      },
      nonzeroResourceBranch: farmerResourceBranchAuditEvidence(carriedStates, {
        intentionalDuplicateStates: ["carry", "carry-idle"],
        duplicateExplanation:
          "The original class-31 +0x47a!=0 state 8 idle and state 1 move configurations both select the same 200..239 directional clip; this is static evidence, not an unverified project alias.",
      }),
      unresolvedScope:
        "state 4 attack, exact timing, pivot, stats, commands, behavior, later runtime mutation, and death lifetime remain unresolved",
    };
  }

  if (visual.id === "japanese-samurai") {
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        "project idle, move/walk, attack, and death use the statically recovered class-13 state 8, 1, 4, and 7 sprite slots, frames, direction order, and mirroring",
      stateFrameRanges: {
        idle: k01SamuraiAnimationPilot.states.idle.frameRange,
        move: k01SamuraiAnimationPilot.states.move.frameRange,
        walk: k01SamuraiAnimationPilot.states.move.frameRange,
        attack: k01SamuraiAnimationPilot.states.attack.frameRange,
        death: k01SamuraiAnimationPilot.states.death.frameRange,
      },
      stateSources: {
        idle: k01SamuraiAnimationPilot.states.idle.sourcePath,
        move: k01SamuraiAnimationPilot.states.move.sourcePath,
        walk: k01SamuraiAnimationPilot.states.move.sourcePath,
        attack: k01SamuraiAnimationPilot.states.attack.sourcePath,
        death: k01SamuraiAnimationPilot.states.death.sourcePath,
      },
      unresolvedScope:
        "exact seconds-per-phase playback timing, hit reaction, pivot, later runtime flag mutation, and project-side death playback before removal remain unresolved",
    };
  }

  if (visual.id === "japanese-turtle-tank") {
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        "project idle, move/walk, and attack use the statically recovered class-14 state 8, 1, and 4 grid-direction frames and mirroring",
      stateFrameRanges: {
        idle: k01TurtleTankAnimationPilot.states.idle.frameRange,
        move: k01TurtleTankAnimationPilot.states.move.frameRange,
        walk: k01TurtleTankAnimationPilot.states.move.frameRange,
        attack: k01TurtleTankAnimationPilot.states.attack.frameRange,
      },
      stateSources: {
        idle: k01TurtleTankAnimationPilot.states.idle.sourcePath,
        move: k01TurtleTankAnimationPilot.states.move.sourcePath,
        walk: k01TurtleTankAnimationPilot.states.move.sourcePath,
        attack: k01TurtleTankAnimationPilot.states.attack.sourcePath,
      },
      unresolvedScope:
        "the raw 1000..1007 values are statically resolved as intermediate 16-ring turn positions, but their generic Facing mapping and project-side transient destruction/tick mapping remain unresolved; frames 81..87 are not the creation-default death path, while their other use remains unresolved",
    };
  }

  if (visual.id === "japanese-konishi") {
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        "project idle, move/walk, attack, and death use the statically recovered class-82 state 8, 1, 4, and 7 sprite slots, grid-direction frames, and mirroring",
      stateFrameRanges: {
        idle: k01KonishiAnimationPilot.states.idle.frameRange,
        move: k01KonishiAnimationPilot.states.move.frameRange,
        walk: k01KonishiAnimationPilot.states.move.frameRange,
        attack: k01KonishiAnimationPilot.states.attack.frameRange,
        death: k01KonishiAnimationPilot.states.death.frameRange,
      },
      stateSources: {
        idle: k01KonishiAnimationPilot.states.idle.sourcePath,
        move: k01KonishiAnimationPilot.states.move.sourcePath,
        walk: k01KonishiAnimationPilot.states.move.sourcePath,
        attack: k01KonishiAnimationPilot.states.attack.sourcePath,
        death: k01KonishiAnimationPilot.states.death.sourcePath,
      },
      unresolvedScope:
        "unused tail frames, generalj14, exact seconds-per-phase playback timing, hit reaction and other states, pivot, later runtime flag mutation, and project-side death playback before removal remain unresolved",
    };
  }

  const k01Hero = k01HeroMovementPilot.heroes.find(
    (hero) => hero.projectVisualId === visual.id,
  );
  if (k01Hero) {
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-core-state-frames",
      confirmedAnimationScope:
        "project idle, move/walk, attack, and death use the statically recovered state 8, 1, 4, and 7 sprite slots, frames, direction order, and mirroring",
      stateFrameRanges: {
        idle: k01Hero.idle.frameRange,
        move: k01Hero.movement.frameRange,
        walk: k01Hero.movement.frameRange,
        attack: k01Hero.attack.frameRange,
        death: k01Hero.death.frameRange,
      },
      stateSources: {
        idle: k01Hero.idle.sourcePath,
        move: k01Hero.movement.sourcePath,
        walk: k01Hero.movement.sourcePath,
        attack: k01Hero.attack.sourcePath,
        death: k01Hero.death.sourcePath,
      },
      unresolvedScope:
        "exact seconds-per-phase playback timing, hit reaction, pivot, later runtime flag mutation, and project-side death playback before removal remain unresolved",
    };
  }

  if (visual.id === "korean-hq") {
    return {
      status: "scoped-static-proven",
      ...identityEvidence,
      bodyStateMapping: "static-proven",
      constructionFrames: buildingStatePilot.construction.phaseFrames.map(
        (phase) => phase.frameIndex,
      ),
      healthyFrame: buildingStatePilot.completedBody.healthyFrame,
      damagedFrame: buildingStatePilot.completedBody.damagedFrame,
      unresolvedScope: "frames 9..19, pivot, overlays, and non-body effects",
    };
  }

  if (visual.id === "korean-signal-beacon") {
    return {
      status: "scoped-static-proven",
      ...identityEvidence,
      bodyStateMapping: "static-proven",
      constructionFrames:
        beaconStatePilot.construction.phaseFrames.map(
          (phase) => phase.frameIndex,
        ),
      healthyFrame: beaconStatePilot.completedBody.healthyFrame,
      damagedFrame: beaconStatePilot.completedBody.damagedFrame,
      unresolvedScope:
        "frames 9..15, pivot, overlays, and non-body effects",
    };
  }

  if ([
    "korean-training-command",
    "japanese-hq",
    "japanese-camp-barracks",
    "japanese-camp-tower",
  ].includes(visual.id)) {
    return {
      status: "mixed",
      ...identityEvidence,
      bodyStateMapping: "static-proven-base-frame",
      confirmedBodyScope:
        "project idle uses the catalog-proven source base frame 7 only",
      unresolvedScope:
        "construction, damaged/health body states, overlays, timing, pivot, stats, commands, behavior, and later runtime mutation remain unresolved; size is source dimensions and the foot anchor is a project rendering adaptation",
    };
  }

  return {
    status: "mixed",
    ...identityEvidence,
    bodyStateMapping:
      visual.states.construction === undefined ? undefined : "unverified",
    animationStateMapping:
      visual.states.construction === undefined ? "unverified" : undefined,
  };
}

function isProjectBuildingVisual(visualId) {
  return Object.entries(defaultTheme.entityBindings).some(
    ([entityId, boundVisualId]) =>
      boundVisualId === visualId && unitDefinitions[entityId]?.category === "building",
  );
}

function appendIdentityFindings(visual) {
  if (visual.staticEvidence.identity === "unbound") {
    findings.push({
      severity: "blocking",
      code: "visual-source-unbound-to-original-type",
      visualId: visual.visualId,
      sourcePath: visual.source.path,
      detail:
        "The current visual source SPR is not referenced by any of the 95 original type definitions.",
    });
  }
  if (visual.staticEvidence.identity === "ambiguous") {
    findings.push({
      severity: "blocking",
      code: "visual-source-identity-ambiguous",
      visualId: visual.visualId,
      sourcePath: visual.source.path,
      candidates: visual.staticEvidence.identityCandidates,
      detail:
        "The current visual source SPR is shared by multiple original type definitions.",
    });
  }
}

function buildProjectBindingAudit(visuals) {
  const visualById = new Map(
    visuals.map((visual) => [visual.visualId, visual]),
  );
  const bindings = [];
  const bindingFindings = [];

  for (const [entityId, visualId] of Object.entries(
    defaultTheme.entityBindings,
  ).sort(compareEntries)) {
    const definition = unitDefinitions[entityId];
    if (!definition) {
      throw new Error(
        `Theme entity binding ${entityId} has no unit definition`,
      );
    }
    const visual = visualById.get(visualId);
    if (!visual) {
      throw new Error(
        `Theme entity binding ${entityId} references missing visual ${visualId}`,
      );
    }

    const originalGameplayName =
      visual.staticEvidence.identity === "static-proven"
        ? visual.staticEvidence.originalGameplayName
        : undefined;
    const nameMatchesOriginal =
      originalGameplayName === undefined
        ? undefined
        : definition.displayName === originalGameplayName;
    const binding = {
      entityId,
      projectDisplayName: definition.displayName,
      projectGameplayAdapter: {
        category: definition.category,
        actionIds: definition.actionIds,
        populationCost: definition.populationCost,
        footprint: definition.footprint,
        baseAttributes: definition.baseAttributes,
        combat: definition.combat,
        renderRadius: definition.renderRadius,
        selectionRadius: definition.selectionRadius,
        hitRadius: definition.hitRadius,
        sightRadius: definition.sightRadius,
        minimapShape: definition.minimapShape,
        minimapRadius: definition.minimapRadius,
        selectedMinimapRadius: definition.selectedMinimapRadius,
      },
      visualId,
      visualSourcePath: visual.source.path,
      identityStatus: visual.staticEvidence.identity,
      originalGameplayName,
      internalClass:
        visual.staticEvidence.identity === "static-proven"
          ? visual.staticEvidence.internalClass
          : undefined,
      nameMatchesOriginal,
    };
    bindings.push(binding);

    if (nameMatchesOriginal === false) {
      bindingFindings.push({
        severity: "blocking",
        code: "project-entity-name-source-identity-conflict",
        entityId,
        visualId,
        projectDisplayName: definition.displayName,
        originalGameplayName,
        detail:
          "The project entity name does not match the statically proven identity of its bound visual source.",
      });
    }
  }

  return { bindings, findings: bindingFindings };
}

function toIdentitySummary(type) {
  return {
    internalClass: type.internalClass,
    originalGameplayName: type.originalGameplayName,
    spriteSlot: type.sprite.slot,
    sourcePath: type.sprite.sourcePath,
  };
}

function buildPortraitAudit() {
  const scenarioSource = readFileSync(scenariosPath, "utf8");
  const portraitManifest = readJson(portraitManifestPath);
  const exportedFrames = new Set(
    portraitManifest.exportedFrames.map((frame) => frame.fileName),
  );
  const extractedMapping = extractMissionPortraitMapping();
  const extractedById = new Map(
    extractedMapping.entries.map((entry) => [entry.speakerId, entry]),
  );
  const cues = MISSION_PORTRAIT_IMAGE_CUES.map((cue) => {
    const extracted = extractedById.get(cue.portraitId);
    if (!extracted || extracted.frameIndex !== cue.frameIndex) {
      throw new Error(
        `Client portrait mapping for ${cue.portraitId} does not match the original executable`,
      );
    }

    const fileName = cue.url.split("/").at(-1);
    if (!fileName) {
      throw new Error(`Portrait cue ${cue.portraitId} has no asset file name`);
    }

    return {
      portraitId: cue.portraitId,
      lookupIndex: extracted.lookupIndex,
      frameIndex: cue.frameIndex,
      fileName,
      frameExported: exportedFrames.has(fileName),
      evidenceStatus: "static-proven",
    };
  });

  const currentScenarioPortraitIds = uniqueMatches(
    scenarioSource,
    /portraitId:\s*"([^"]+)"/g,
  );
  const originalScriptSpeakerTokens = collectOriginalScriptSpeakerTokens();
  const findings = [];

  for (const portraitId of currentScenarioPortraitIds) {
    if (!cues.some((cue) => cue.portraitId === portraitId)) {
      findings.push({
        severity: "blocking",
        code: "scenario-portrait-unmapped",
        portraitId,
        detail: "A current scenario portrait ID has no preload mapping.",
      });
    }
  }

  return {
    source: {
      path: portraitManifest.source,
      sha256: sha256File(resolve(repositoryRoot, portraitManifest.source)),
      conversionManifest: sourceFileRecord(portraitManifestPath),
      frameCount: portraitManifest.frameCount,
      width: portraitManifest.width,
      height: portraitManifest.height,
      evidence: {
        executableSha256: extractedMapping.source.executableSha256,
        resourcePath: extractedMapping.source.resourcePath,
        lookupFailureIndex: extractedMapping.lookupFailureIndex,
      },
    },
    currentScenarioPortraitIds,
    registeredSpeakerIds: extractedMapping.entries.map(
      (entry) => entry.speakerId,
    ),
    originalScriptSpeakerTokens,
    cues: cues.sort((left, right) =>
      left.portraitId.localeCompare(right.portraitId),
    ),
    findings,
  };
}

function collectOriginalScriptSpeakerTokens() {
  const scriptDirectory = join(repositoryRoot, "original/imjinrok2/script");
  const usage = new Map();
  for (const scriptPath of listFilesRecursively(scriptDirectory)) {
    const source = new TextDecoder("windows-949").decode(
      readFileSync(scriptPath),
    );
    for (const match of source.matchAll(/\[SPEECH\]\[([^\]]+)\]/g)) {
      const sourceFiles = usage.get(match[1]) ?? [];
      sourceFiles.push(toRepositoryPath(scriptPath));
      usage.set(match[1], sourceFiles);
    }
  }
  return [...usage.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([speakerToken, sourceFiles]) => ({
      speakerToken,
      sourceFiles: [...new Set(sourceFiles)],
    }));
}

function listFilesRecursively(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function findManifests(directory) {
  const manifestNames = readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".manifest.json"))
    .sort();
  if (manifestNames.length === 0) {
    throw new Error(
      `Expected at least one sprite manifest in ${directory}`,
    );
  }
  return manifestNames.map((manifestName) => join(directory, manifestName));
}

function readManifestResource(manifestPath) {
  const manifest = readJson(manifestPath);
  const sourcePath = resolve(repositoryRoot, manifest.source);
  return {
    manifest,
    sourcePathNormalized: normalizeOriginalSourcePath(manifest.source),
    source: {
      path: toRepositoryPath(sourcePath),
      sha256: sha256File(sourcePath),
      frameCount: manifest.frameCount,
      width: manifest.width,
      height: manifest.height,
    },
    conversionManifest: sourceFileRecord(manifestPath),
  };
}

function selectPrimaryManifestResource(resources) {
  const identityResources = resources.filter(
    (resource) =>
      (catalogTypesBySourcePath.get(resource.sourcePathNormalized)?.length ??
        0) > 0,
  );
  if (identityResources.length > 1) {
    throw new Error(
      `Multiple original type identity manifests share one visual directory: ${identityResources.map((resource) => resource.source.path).join(", ")}`,
    );
  }
  return identityResources[0] ?? resources[0];
}

function uniqueFrameIndexes(mappings) {
  return [
    ...new Set(
      mappings.flatMap((mapping) =>
        mapping.clips.flatMap((clip) => clip.frameIndexes),
      ),
    ),
  ].sort((left, right) => left - right);
}

function hasStaticDirectionEvidence(visualId, scope, stateName) {
  if (scope !== "base") {
    return false;
  }
  if (visualId === "korean-swordsman") {
    return ["idle", "move", "walk", "attack", "death"].includes(stateName);
  }
  if (["japanese-swordsman", "korean-archer"].includes(visualId)) {
    return ["idle", "move", "walk", "attack", "death"].includes(stateName);
  }
  if (["korean-monk", "japanese-shrine-maiden"].includes(visualId)) {
    return ["idle", "move", "walk", "attack", "death"].includes(stateName);
  }
  if (visualId === "japanese-gunner") {
    return ["idle", "move", "walk", "attack", "death"].includes(stateName);
  }
  if (visualId === "japanese-farmer") {
    return ["idle", "move", "walk", "carry", "carry-idle", "death"].includes(stateName);
  }
  if (visualId === "villager-korean-farmer") {
    return ["idle", "move", "walk", "carry", "carry-idle", "death"].includes(stateName);
  }
  if (visualId === "japanese-samurai") {
    return ["idle", "move", "walk", "attack", "death"].includes(stateName);
  }
  if (visualId === "japanese-turtle-tank") {
    return ["idle", "move", "walk", "attack"].includes(stateName);
  }
  if (visualId === "japanese-konishi") {
    return ["idle", "move", "walk", "attack", "death"].includes(stateName);
  }
  return (
    ["korean-gwon-yul", "korean-ryu-seong-ryong"].includes(visualId) &&
    ["idle", "move", "walk", "attack", "death"].includes(stateName)
  );
}

function coreStateFrameRanges(unit) {
  if (!unit) throw new Error("core unit animation extractor is missing a scoped class");
  return {
    idle: unit.states.idle.frameRange,
    move: unit.states.move.frameRange,
    walk: unit.states.move.frameRange,
    attack: unit.states.attack.frameRange,
    death: unit.states.death.frameRange,
  };
}

function stateFrameRange({ frameStart, frameStride, phaseCount, directions }) {
  if (frameStart === undefined) {
    const frameIndexes = directions.flatMap(({ frameRange }) => frameRange);
    return [Math.min(...frameIndexes), Math.max(...frameIndexes)];
  }
  const bases = [0, 1, 2, 3, 2, 1, 0, 4].map(
    (index) => frameStart + index * frameStride,
  );
  return [Math.min(...bases), Math.max(...bases) + phaseCount - 1];
}

function farmerResourceBranchAuditEvidence(states, exception = {}) {
  return {
    condition: "unsigned WORD entity +0x47a != 0",
    analysisStatus: k01FarmerResourceBranchFrames.analysisStatus,
    reproductionStatus: k01FarmerResourceBranchFrames.reproductionStatus,
    confirmedAnimationScope:
      "project carry maps original state 1 move and carry-idle maps original state 8 idle using the recovered direction/mirror profile",
    stateSources: {
      carry: states.move.sourcePath,
      "carry-idle": states.idle.sourcePath,
    },
    stateFrameRanges: {
      carry: stateFrameRange(states.move),
      ...(states.idle.phaseCount > 1
        ? { "carry-idle": stateFrameRange(states.idle) }
        : {}),
    },
    stateFrameIndexes:
      states.idle.phaseCount === 1
        ? { "carry-idle": directionalFrameBases(states.idle) }
        : undefined,
    directionFrames: {
      carry: directionalFrameEvidence(states.move),
      "carry-idle": directionalFrameEvidence(states.idle),
    },
    ...exception,
  };
}

function directionalFrameBases(state) {
  return state.directions.map(({ frameBase }) => frameBase);
}

function directionalFrameEvidence(state) {
  return state.directions.map(
    ({ facing, direction, frameBase, frameRange, mirrorX }) => ({
      facing,
      direction,
      frameBase,
      frameRange,
      mirrorX,
    }),
  );
}

function coreStateSources(unit) {
  if (!unit) throw new Error("core unit animation extractor is missing a scoped class");
  return {
    idle: unit.states.idle.sourcePath,
    move: unit.states.move.sourcePath,
    walk: unit.states.move.sourcePath,
    attack: unit.states.attack.sourcePath,
    death: unit.states.death.sourcePath,
  };
}

function clipSignature(clips) {
  return JSON.stringify(
    clips.map(({ facing, frameFiles, mirrorX }) => ({
      facing,
      frameFiles,
      mirrorX,
    })),
  );
}

function isIntentionalAlias(visualId, left, right) {
  const pair = [left, right].sort().join("|");
  return (
    pair === "move|walk" ||
    pair === "build|repair" ||
    (visualId === "japanese-farmer" && pair === "carry|carry-idle")
  );
}

function parseFrameIndex(fileName) {
  const match = /_(\d+)\.png$/.exec(fileName);
  if (match === null) {
    throw new Error(`Unable to parse frame index from ${fileName}`);
  }
  return Number.parseInt(match[1], 10);
}

function uniqueMatches(source, pattern) {
  return [
    ...new Set([...source.matchAll(pattern)].map((match) => match[1])),
  ].sort();
}

function groupBy(values, selectKey) {
  const groups = new Map();
  for (const value of values) {
    const key = selectKey(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function normalizeOriginalSourcePath(path) {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const sourceRoot = "/imjinrok2/";
  const sourceRootIndex = normalized.indexOf(sourceRoot);
  if (sourceRootIndex < 0) {
    throw new Error(
      `Sprite manifest source is outside original/imjinrok2: ${path}`,
    );
  }
  return normalized.slice(sourceRootIndex + sourceRoot.length);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sourceFileRecord(path) {
  return {
    path: toRepositoryPath(path),
    sha256: sha256File(path),
  };
}

function toRepositoryPath(path) {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function compareEntries([left], [right]) {
  return left.localeCompare(right);
}

function compareFindings(left, right) {
  return findingSortKey(left).localeCompare(findingSortKey(right));
}

function findingSortKey(finding) {
  return [
    finding.code,
    finding.visualId ?? "",
    finding.portraitId ?? "",
    finding.scope ?? "",
    finding.state ?? "",
  ].join("|");
}
