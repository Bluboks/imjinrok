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
import { defaultTheme } from "../../packages/shared/src/themes.ts";
import { extractBuildingStatePilot } from "./extract-building-state-pilot.mjs";
import { extractMissionPortraitMapping } from "./extract-mission-portrait-mapping.mjs";
import { extractUnitAnimationPilot } from "./extract-unit-animation-pilot.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const publicThemeRoot = join(
  repositoryRoot,
  "apps/game-client/public/assets/themes/default",
);
const themesPath = join(repositoryRoot, "packages/shared/src/themes.ts");
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
const buildingStatePilotPath = join(
  repositoryRoot,
  "tools/imjinrok/extract-building-state-pilot.mjs",
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
const buildingStatePilot = extractBuildingStatePilot();

const visualRecords = [];
const findings = [];
let stateMappingCount = 0;
let clipCount = 0;
let frameReferenceCount = 0;
let missingFrameReferenceCount = 0;

for (const visual of Object.values(defaultTheme.visuals)
  .filter((candidate) => candidate.kind === "entity")
  .sort((left, right) => left.id.localeCompare(right.id))) {
  const manifestPath = findSingleManifest(join(publicThemeRoot, visual.assetPath));
  const manifest = readJson(manifestPath);
  const exportedFrameNames = new Set(
    manifest.exportedFrames.map((frame) => frame.fileName),
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

  const sourcePath = resolve(repositoryRoot, manifest.source);
  const staticEvidence = buildVisualStaticEvidence(visual);
  const visualRecord = {
    visualId: visual.id,
    category,
    assetPath: visual.assetPath,
    evidenceStatus: staticEvidence.status,
    staticEvidence,
    source: {
      path: toRepositoryPath(sourcePath),
      sha256: sha256File(sourcePath),
      frameCount: manifest.frameCount,
      width: manifest.width,
      height: manifest.height,
    },
    conversionManifest: sourceFileRecord(manifestPath),
    mappings,
  };
  visualRecords.push(visualRecord);
  appendVisualFindings(visualRecord);
}

const portraitAudit = buildPortraitAudit();
findings.push(...portraitAudit.findings);

const report = {
  schemaVersion: 1,
  policy: {
    semanticStatus: "mixed",
    acceptedEvidence:
      "SPEECH portraits, Korean HQ construction/healthy/damaged body frames, and the class-2 Korean spearman identity are statically proven in their documented scopes.",
    parityUse:
      "Only explicitly listed staticEvidence scopes may be used for parity; all other entity direction, action, layer, and body mappings remain quarantined.",
  },
  sourceFiles: [
    sourceFileRecord(themesPath),
    sourceFileRecord(scenariosPath),
    sourceFileRecord(skirmishScenePath),
    sourceFileRecord(missionPortraitsPath),
    sourceFileRecord(missionPortraitExtractorPath),
    sourceFileRecord(unitAnimationPilotPath),
    sourceFileRecord(buildingStatePilotPath),
    sourceFileRecord(generatorPath),
    sourceFileRecord(portraitManifestPath),
  ],
  summary: {
    visualCount: visualRecords.length,
    unitVisualCount: visualRecords.filter((visual) => visual.category === "unit").length,
    buildingVisualCount: visualRecords.filter(
      (visual) => visual.category === "building",
    ).length,
    stateMappingCount,
    clipCount,
    frameReferenceCount,
    missingFrameReferenceCount,
    unverifiedVisualCount: visualRecords.filter((visual) => visual.evidenceStatus === "unverified").length,
    mixedVisualCount: visualRecords.filter((visual) => visual.evidenceStatus === "mixed").length,
    scopedStaticProvenVisualCount: visualRecords.filter(
      (visual) => visual.evidenceStatus === "scoped-static-proven",
    ).length,
    portraitCueCount: portraitAudit.cues.length,
    unverifiedPortraitCueCount: portraitAudit.cues.filter(
      (cue) => cue.evidenceStatus === "unverified",
    ).length,
    findingCount: findings.length,
  },
  visuals: visualRecords,
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
    for (const [facing, clip] of Object.entries(state.clips).sort(compareEntries)) {
      clipCount++;
      frameReferenceCount += clip.frames.length;
      const missingFrames = clip.frames
        .map((frame) => frame.fileName)
        .filter((fileName) => !exportedFrameNames.has(fileName));
      missingFrameReferenceCount += missingFrames.length;
      clips.push({
        facing,
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

    if ((state.facings?.length ?? 0) > 0) {
      findings.push({
        severity: "blocking",
        code: "direction-order-unverified",
        visualId: visual.id,
        scope,
        state: stateName,
        detail: "Facing labels are assigned by a hard-coded source-frame order.",
      });
    }
    if (clips.some((clip) => clip.mirrorX)) {
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
    const idleMappings = visual.mappings.filter((mapping) => mapping.state === "idle");
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

  const baseMappings = visual.mappings.filter((mapping) => mapping.scope === "base");
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

function buildVisualStaticEvidence(visual) {
  if (visual.id === "korean-swordsman") {
    return {
      status: "mixed",
      identity: "static-proven",
      originalGameplayName: unitAnimationPilot.identity.originalGameplayName,
      internalClass: unitAnimationPilot.identity.internalClass,
      spriteSlot: unitAnimationPilot.identity.spriteSlot,
      sourcePath: unitAnimationPilot.identity.sourcePath,
      animationStateMapping: "unverified-action-meaning",
      confirmedAnimationScope: "states 1 and 2 frame formulas only; state 1 requires flags mask 0x80000008 to be clear",
    };
  }

  if (visual.id === "korean-hq") {
    return {
      status: "scoped-static-proven",
      identity: "static-proven",
      originalGameplayName: buildingStatePilot.identity.originalGameplayName,
      internalClass: buildingStatePilot.identity.internalClass,
      spriteSlot: buildingStatePilot.identity.spriteSlot,
      sourcePath: buildingStatePilot.identity.sourcePath,
      bodyStateMapping: "static-proven",
      constructionFrames: buildingStatePilot.construction.phaseFrames.map((phase) => phase.frameIndex),
      healthyFrame: buildingStatePilot.completedBody.healthyFrame,
      damagedFrame: buildingStatePilot.completedBody.damagedFrame,
      unresolvedScope: "frames 9..19, pivot, overlays, and non-body effects",
    };
  }

  return {
    status: "unverified",
    identity: "unverified",
    bodyStateMapping: visual.states.construction === undefined ? undefined : "unverified",
    animationStateMapping: visual.states.construction === undefined ? "unverified" : undefined,
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
    cues: cues.sort((left, right) => left.portraitId.localeCompare(right.portraitId)),
    findings,
  };
}

function collectOriginalScriptSpeakerTokens() {
  const scriptDirectory = join(repositoryRoot, "original/imjinrok2/script");
  const usage = new Map();
  for (const scriptPath of listFilesRecursively(scriptDirectory)) {
    const source = new TextDecoder("windows-949").decode(readFileSync(scriptPath));
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

function findSingleManifest(directory) {
  const manifestNames = readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".manifest.json"))
    .sort();
  if (manifestNames.length !== 1) {
    throw new Error(
      `Expected exactly one sprite manifest in ${directory}, found ${manifestNames.length}`,
    );
  }
  return join(directory, manifestNames[0]);
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

function clipSignature(clips) {
  return JSON.stringify(
    clips.map(({ facing, frameIndexes, mirrorX }) => ({
      facing,
      frameIndexes,
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
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1]))].sort();
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
