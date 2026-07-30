import { unitDefinitions, type UnitDefinitionId } from "./content.js";
import { resolveEntityPortraitFrame } from "./entityPortrait.js";
import type { ScenarioDefinition } from "./scenarios.js";
import type { ThemeDefinition } from "./themes.js";
import type { EntityVisual, FrameRef } from "./visuals.js";

/**
 * K01 mobile-unit animation coverage is intentionally narrower than type identity.
 * Every entry below points to a focused static-analysis document with source hashes,
 * addresses, and replay vectors; do not promote a quarantined state from image order.
 */
export interface K01UnitAnimationEvidence {
  readonly kind: UnitDefinitionId;
  readonly originalClasses: readonly number[];
  readonly missionSources: readonly ("initial-map" | "k0120-reinforcement")[];
  readonly sourceStates: readonly string[];
  /** Theme state keys that carry the scoped source output. Defaults to sourceStates. */
  readonly themeStates?: readonly string[];
  /** States selected by the current normal runtime presentation adapter. */
  readonly runtimeStates: readonly ("idle" | "move" | "attack")[];
  readonly quarantines: readonly K01UnitAnimationQuarantine[];
  readonly sourceOrientation?: {
    readonly state: "move";
    readonly profileId: string;
    readonly rawDirections: readonly number[];
  };
  readonly evidenceDocument: string;
  /**
   * Source frame selected by the K01 opening/runtime adapter. This is a frame
   * identity check, not a claim about an original portrait or body-state name.
   */
  readonly defaultFrameFileName?: string;
}

export interface K01UnitAnimationQuarantine {
  readonly state: string;
  readonly reason: string;
}

export interface K01UnitAnimationCoverageResult extends K01UnitAnimationEvidence {
  readonly visualId: string | null;
  readonly missingStates: readonly string[];
  readonly missingFrames: readonly string[];
  readonly missingSourceOrientationDirections: readonly number[];
  readonly missingDefaultFrame: boolean;
  readonly missingExplicitSelectionRepresentative: boolean;
}

/**
 * A serializable selection-image registry entry for a K01 entity that can
 * actually appear in the scenario. The frame is a source-backed
 * representative, not a claim that the original selection panel used this
 * frame as a portrait.
 */
export interface K01SelectionPortraitRegistryEntry {
  readonly kind: UnitDefinitionId;
  readonly visualId: string;
  readonly frame: FrameRef;
  readonly mirrorX: boolean;
  readonly sourceFrameFileName: string;
  readonly evidenceDocument: string;
  readonly sourceStates: readonly string[];
  readonly quarantines: readonly K01UnitAnimationQuarantine[];
  readonly semanticStatus: "source-frame-representative";
}

const noRuntimeDeathLifecycle: K01UnitAnimationQuarantine = {
  state: "death-runtime",
  reason: "The current simulation does not retain a terminal visual lifecycle, so the source-proven death clip is not selected by the normal runtime state adapter.",
};

/**
 * This is a coverage matrix, not a new source claim. The linked focused reports
 * remain the single sources of hashes, addresses, control flow, and vectors.
 */
export const K01_UNIT_ANIMATION_EVIDENCE = [
  {
    kind: "villager",
    originalClasses: [7],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "death"],
    runtimeStates: ["idle", "move"],
    quarantines: [
      { state: "attack", reason: "Class-7 state 4 is only proven as a creation-default fallback to idle, not as a product attack clip." },
      noRuntimeDeathLifecycle,
    ],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-korean-farmer-core-frames.md",
    defaultFrameFileName: "farmerk_0000.png",
  },
  {
    kind: "swordsman",
    originalClasses: [2],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [
      { state: "state-2", reason: "The alternate movement frame block is recovered, but its environment meaning and project policy remain intentionally unbound." },
      noRuntimeDeathLifecycle,
    ],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-core-unit-animation-states.md",
    defaultFrameFileName: "swordk_0128.png",
  },
  {
    kind: "archer",
    originalClasses: [4],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [
      { state: "state-2", reason: "The alternate movement frame block is recovered, but its environment meaning and project policy remain intentionally unbound." },
      noRuntimeDeathLifecycle,
    ],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-core-unit-animation-states.md",
    defaultFrameFileName: "archerk_0000.png",
  },
  {
    kind: "korean-monk",
    originalClasses: [11],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-unit-bindings.md",
    defaultFrameFileName: "budak_0100.png",
  },
  {
    kind: "japanese-swordsman",
    originalClasses: [3],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [
      { state: "state-2", reason: "The alternate movement frame block is recovered, but its environment meaning and project policy remain intentionally unbound." },
      noRuntimeDeathLifecycle,
    ],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-core-unit-animation-states.md",
    defaultFrameFileName: "swordj_0000.png",
  },
  {
    kind: "japanese-gunner",
    originalClasses: [12],
    missionSources: ["initial-map", "k0120-reinforcement"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [
      { state: "state-2", reason: "The second movement variant has no approved project-state policy." },
      noRuntimeDeathLifecycle,
    ],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-normal-reinforcement-animation-batch.md",
    defaultFrameFileName: "gunj1_0000.png",
  },
  {
    kind: "japanese-samurai",
    originalClasses: [13],
    missionSources: ["initial-map", "k0120-reinforcement"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-samurai-animation-pilot.md",
    defaultFrameFileName: "horseswordj2_0000.png",
  },
  {
    kind: "japanese-shrine-maiden",
    originalClasses: [16],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-unit-bindings.md",
    defaultFrameFileName: "advbudaj_0120.png",
  },
  {
    kind: "japanese-farmer",
    originalClasses: [31],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "death"],
    runtimeStates: ["idle", "move"],
    quarantines: [
      { state: "attack", reason: "Class-31 state 4 has no static-confirmed source-to-frame mapping." },
      noRuntimeDeathLifecycle,
    ],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-japanese-farmer-frames.md",
    defaultFrameFileName: "Farmerj_0000.png",
  },
  {
    kind: "gwon-yul",
    originalClasses: [76],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-hero-animation-pilot.md",
    defaultFrameFileName: "generalk13_0000.png",
  },
  {
    kind: "ryu-seong-ryong",
    originalClasses: [78],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-hero-animation-pilot.md",
    defaultFrameFileName: "generalk31_0000.png",
  },
  {
    kind: "japanese-turtle-tank",
    originalClasses: [14],
    missionSources: ["k0120-reinforcement"],
    sourceStates: ["idle", "move", "attack"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [
      { state: "death", reason: "The recovered creation-default destruction path is a transient effect contract, not a generic entity death clip." },
    ],
    sourceOrientation: {
      state: "move",
      profileId: "k01-japanese-turtle-tank-raw16",
      rawDirections: [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007],
    },
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-turtle-tank-animation-pilot.md",
    defaultFrameFileName: "ghosttankj_0016.png",
  },
  {
    kind: "japanese-konishi",
    originalClasses: [82],
    missionSources: ["k0120-reinforcement"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-konishi-animation-pilot.md",
    defaultFrameFileName: "generalj12_0000.png",
  },
] as const satisfies readonly K01UnitAnimationEvidence[];

/**
 * K01 opening buildings are guarded independently from mobile animation.
 * Their static evidence establishes identity plus source base frame 7 only;
 * construction, damage, overlay, timing, pivot, and lift stay quarantined.
 */
export const K01_BUILDING_VISUAL_EVIDENCE = [
  {
    kind: "barracks",
    originalClasses: [50],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "barrackk_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 catalog evidence binds only class-50 base frame 7; construction, damage, overlays, timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/data-structures/entity-type-catalog.md",
  },
  {
    kind: "house",
    originalClasses: [48],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "millk_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 class-48 evidence binds only base frame 7; construction, damage, overlays, timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md",
  },
  {
    kind: "japanese-camp-barracks",
    originalClasses: [60],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "barrackj_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 class-60 evidence binds only base frame 7; construction, damage, overlays, timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md",
  },
  {
    kind: "japanese-camp-firehouse",
    originalClasses: [62],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "firehousej_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 catalog evidence binds only class-62 base frame 7; construction, damage, overlays, timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/data-structures/entity-type-catalog.md",
  },
  {
    kind: "japanese-camp-house",
    originalClasses: [57],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "millj_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 catalog evidence binds only class-57 base frame 7; construction, damage, overlays, timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/data-structures/entity-type-catalog.md",
  },
  {
    kind: "japanese-camp-tower",
    originalClasses: [63],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "towerj_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 class-63 evidence binds only base frame 7; construction, damage, overlays, timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md",
  },
  {
    kind: "japanese-hq",
    originalClasses: [58],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "jhq_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 class-58 evidence binds only base frame 7; construction, damage, overlays, timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md",
  },
  {
    kind: "korean-training-command",
    originalClasses: [51],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "advbarrackk_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 class-51 evidence binds only base frame 7; construction, damage, overlays, timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md",
  },
  {
    kind: "town-center",
    originalClasses: [49],
    missionSources: ["initial-map"],
    sourceStates: ["base-frame-7"],
    themeStates: ["idle"],
    runtimeStates: ["idle"],
    defaultFrameFileName: "hqk_0007.png",
    quarantines: [{ state: "building-states", reason: "K01 class-49 base frame 7 is scoped; construction and damage have separate bounded evidence, while timing, pivot, and lift remain unverified." }],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md",
  },
] as const satisfies readonly K01UnitAnimationEvidence[];

export const K01_ENTITY_VISUAL_EVIDENCE = [
  ...K01_UNIT_ANIMATION_EVIDENCE,
  ...K01_BUILDING_VISUAL_EVIDENCE,
] as const satisfies readonly K01UnitAnimationEvidence[];

export function collectScenarioSpawnKinds(scenario: Pick<ScenarioDefinition, "startingUnits" | "playerStarts" | "scriptedEvents">): readonly UnitDefinitionId[] {
  const kinds = new Set<UnitDefinitionId>(scenario.startingUnits.map(({ kind }) => kind));

  for (const playerStart of Object.values(scenario.playerStarts ?? {})) {
    for (const { kind } of playerStart.startingUnits ?? []) {
      kinds.add(kind);
    }
  }

  for (const event of scenario.scriptedEvents ?? []) {
    for (const action of event.actions) {
      if (action.type !== "spawn-units") {
        continue;
      }

      for (const { kind } of action.units) {
        kinds.add(kind);
      }
    }
  }

  return [...kinds].sort();
}

export function collectK01MobileSpawnKinds(scenario: Pick<ScenarioDefinition, "startingUnits" | "playerStarts" | "scriptedEvents">): readonly UnitDefinitionId[] {
  return collectScenarioSpawnKinds(scenario).filter((kind) => unitDefinitions[kind].category !== "building");
}

export function collectK01BuildingSpawnKinds(scenario: Pick<ScenarioDefinition, "startingUnits" | "playerStarts" | "scriptedEvents">): readonly UnitDefinitionId[] {
  return collectScenarioSpawnKinds(scenario).filter((kind) => unitDefinitions[kind].category === "building");
}

export function assessK01UnitAnimationCoverage(
  theme: ThemeDefinition,
): readonly K01UnitAnimationCoverageResult[] {
  return assessK01VisualCoverage(theme, K01_UNIT_ANIMATION_EVIDENCE);
}

export function assessK01EntityVisualCoverage(
  theme: ThemeDefinition,
): readonly K01UnitAnimationCoverageResult[] {
  return assessK01VisualCoverage(theme, K01_ENTITY_VISUAL_EVIDENCE);
}

/**
 * Produces selection-panel metadata only for K01 spawnable entities with an
 * explicit source-frame representative. It deliberately omits a record when
 * a theme binding or its validated representative drifts, rather than
 * returning a plausible but unsupported fallback.
 */
export function getK01SelectionPortraitRegistry(
  theme: ThemeDefinition,
): readonly K01SelectionPortraitRegistryEntry[] {
  return assessK01EntityVisualCoverage(theme).flatMap((coverage) => {
    if (
      coverage.visualId === null ||
      coverage.missingDefaultFrame ||
      coverage.missingExplicitSelectionRepresentative
    ) {
      return [];
    }

    const visual = theme.visuals[coverage.visualId];
    const resolved = visual?.kind === "entity" ? resolveEntityPortraitFrame(visual) : null;

    if (
      resolved === null ||
      coverage.defaultFrameFileName === undefined ||
      resolved.frame.fileName !== coverage.defaultFrameFileName
    ) {
      return [];
    }

    return [{
      kind: coverage.kind,
      visualId: coverage.visualId,
      frame: resolved.frame,
      mirrorX: resolved.mirrorX,
      sourceFrameFileName: coverage.defaultFrameFileName,
      evidenceDocument: coverage.evidenceDocument,
      sourceStates: coverage.sourceStates,
      quarantines: coverage.quarantines,
      semanticStatus: "source-frame-representative",
    }];
  });
}

function assessK01VisualCoverage(
  theme: ThemeDefinition,
  evidenceEntries: readonly K01UnitAnimationEvidence[],
): readonly K01UnitAnimationCoverageResult[] {
  return evidenceEntries.map((evidence) => {
    const visualId = theme.entityBindings[evidence.kind] ?? null;
    const visual = visualId ? theme.visuals[visualId] : null;
    const entityVisual = visual?.kind === "entity" ? visual : null;
    const selectionRepresentative = entityVisual ? resolveEntityPortraitFrame(entityVisual) : null;
    const requiredThemeStates = evidence.themeStates ?? evidence.sourceStates;

    return {
      ...evidence,
      visualId,
      missingStates: findMissingStates(entityVisual, requiredThemeStates),
      missingFrames: findMissingFrames(entityVisual, requiredThemeStates),
      missingSourceOrientationDirections: findMissingSourceOrientationDirections(entityVisual, evidence),
      missingDefaultFrame: evidence.defaultFrameFileName !== undefined &&
        entityVisual?.states.idle?.clips.default?.frames[0]?.fileName !== evidence.defaultFrameFileName,
      missingExplicitSelectionRepresentative: evidence.defaultFrameFileName !== undefined &&
        (entityVisual?.portrait === undefined || selectionRepresentative?.frame.fileName !== evidence.defaultFrameFileName),
    };
  });
}

function findMissingStates(visual: EntityVisual | null, stateKeys: readonly string[]): readonly string[] {
  return stateKeys.filter((stateKey) => visual?.states[stateKey] === undefined);
}

function findMissingFrames(visual: EntityVisual | null, stateKeys: readonly string[]): readonly string[] {
  return stateKeys.filter((stateKey) => {
    const state = visual?.states[stateKey];

    return !state || Object.values(state.clips).every((clip) => !clip || clip.frames.length === 0);
  });
}

function findMissingSourceOrientationDirections(
  visual: EntityVisual | null,
  evidence: K01UnitAnimationEvidence,
): readonly number[] {
  if (!evidence.sourceOrientation) {
    return [];
  }

  const clips = visual?.states[evidence.sourceOrientation.state]?.sourceOrientationClips?.[evidence.sourceOrientation.profileId];

  return evidence.sourceOrientation.rawDirections.filter((direction) => {
    const clip = clips?.[direction];

    return !clip || clip.frames.length === 0;
  });
}
