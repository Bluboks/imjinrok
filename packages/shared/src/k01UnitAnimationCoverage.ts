import { unitDefinitions, type UnitDefinitionId } from "./content.js";
import type { ScenarioDefinition } from "./scenarios.js";
import type { ThemeDefinition } from "./themes.js";
import type { EntityVisual } from "./visuals.js";

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
  /** States selected by the current normal runtime presentation adapter. */
  readonly runtimeStates: readonly ("idle" | "move" | "attack")[];
  readonly quarantines: readonly K01UnitAnimationQuarantine[];
  readonly sourceOrientation?: {
    readonly state: "move";
    readonly profileId: string;
    readonly rawDirections: readonly number[];
  };
  readonly evidenceDocument: string;
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
  },
  {
    kind: "korean-monk",
    originalClasses: [11],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-unit-bindings.md",
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
  },
  {
    kind: "japanese-samurai",
    originalClasses: [13],
    missionSources: ["initial-map", "k0120-reinforcement"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-samurai-animation-pilot.md",
  },
  {
    kind: "japanese-shrine-maiden",
    originalClasses: [16],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-unit-bindings.md",
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
  },
  {
    kind: "gwon-yul",
    originalClasses: [76],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-hero-animation-pilot.md",
  },
  {
    kind: "ryu-seong-ryong",
    originalClasses: [78],
    missionSources: ["initial-map"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-hero-animation-pilot.md",
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
  },
  {
    kind: "japanese-konishi",
    originalClasses: [82],
    missionSources: ["k0120-reinforcement"],
    sourceStates: ["idle", "move", "attack", "death"],
    runtimeStates: ["idle", "move", "attack"],
    quarantines: [noRuntimeDeathLifecycle],
    evidenceDocument: "docs/reverse-engineering/mechanics/k01-konishi-animation-pilot.md",
  },
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

export function assessK01UnitAnimationCoverage(
  theme: ThemeDefinition,
): readonly K01UnitAnimationCoverageResult[] {
  return K01_UNIT_ANIMATION_EVIDENCE.map((evidence) => {
    const visualId = theme.entityBindings[evidence.kind] ?? null;
    const visual = visualId ? theme.visuals[visualId] : null;
    const entityVisual = visual?.kind === "entity" ? visual : null;

    return {
      ...evidence,
      visualId,
      missingStates: findMissingStates(entityVisual, evidence.sourceStates),
      missingFrames: findMissingFrames(entityVisual, evidence.sourceStates),
      missingSourceOrientationDirections: findMissingSourceOrientationDirections(entityVisual, evidence),
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
