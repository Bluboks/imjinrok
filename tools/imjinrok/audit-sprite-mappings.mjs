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
import { defaultTheme } from "../../packages/shared/src/themes.ts";
import { extractBeaconStatePilot } from "./extract-beacon-state-pilot.mjs";
import { extractBuildingStatePilot } from "./extract-building-state-pilot.mjs";
import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { extractK01HeroMovementPilot } from "./extract-k01-hero-movement-pilot.mjs";
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
  const category = visual.states.construction === undefined ? "unit" : "building";
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
      "All 95 original type identities, uniquely matched current visual source identities, SPEECH portraits, Korean HQ and signal-beacon body states, class-2 Korean spearman normal movement, and the K01 heroes' idle, movement, attack, and death frame/direction mappings are statically proven in their documented scopes.",
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
      if (isIntentionalAlias(left.state, right.state)) {
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
    return {
      status: "mixed",
      ...identityEvidence,
      animationStateMapping: "static-proven-movement-only",
      confirmedAnimationScope:
        "project move and walk use the statically recovered state 1 normal movement frames, direction order, and mirroring",
      unresolvedScope:
        "idle, attack/combat states, state 2 alternate movement integration, and the state 1 masked +0x1e8 path",
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

  return {
    status: "mixed",
    ...identityEvidence,
    bodyStateMapping:
      visual.states.construction === undefined ? undefined : "unverified",
    animationStateMapping:
      visual.states.construction === undefined ? "unverified" : undefined,
  };
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
    return stateName === "move" || stateName === "walk";
  }
  return (
    ["korean-gwon-yul", "korean-ryu-seong-ryong"].includes(visualId) &&
    ["idle", "move", "walk", "attack", "death"].includes(stateName)
  );
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

function isIntentionalAlias(left, right) {
  const pair = [left, right].sort().join("|");
  return pair === "move|walk" || pair === "build|repair";
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
