import type { TerrainType } from "./content.js";
import { resolveOriginalEntityFramePivot, type AnimationClip, type EntityVisual, type Facing, type FrameRef, type TerrainVisual, type VisualBase, type VisualDefinition } from "./visuals.js";
import { originalBuildingVisualProfiles, originalEntityTypeProfilesByClass } from "./originalEntityTypeProfiles.generated.js";

export interface ThemeDisplayProfile {
  policy: "world-constant" | "pixel-perfect";
  defaultPxPerWu: number;
}

export interface TerrainVisualBinding {
  flat: string;
  elevated?: string;
}

export interface ThemeDefinition {
  id: string;
  displayName: string;
  /** Public URL root for this theme. */
  assetRoot: string;
  display: ThemeDisplayProfile;
  visuals: Record<string, VisualDefinition>;
  terrainBindings: Partial<Record<TerrainType, TerrainVisualBinding>>;
  entityBindings: Record<string, string>;
}

export interface SkinPack {
  id: string;
  baseThemeId: string;
  factionOverrides: Partial<Record<string, Record<string, string>>>;
}

const HILL0_FOOTPRINT_ANCHOR = { x: 32, y: 16 } as const;
const HILL0_ELEVATION_LIFT_PX = 16;

const hill0Frame = (index: number, liftPx?: number): FrameRef => {
  const sourceId = `hill0_${String(index).padStart(4, "0")}`;

  const frame: FrameRef = {
    textureKey: `default_terrain_hill0_${sourceId}`,
    fileName: `${sourceId}.png`,
  };

  if (liftPx !== undefined) {
    frame.pivot = {
      anchor: HILL0_FOOTPRINT_ANCHOR,
      liftPx,
    };
  }

  return frame;
};

const hill0FrameRange = (from: number, to: number, liftPx?: number): readonly FrameRef[] =>
  Array.from({ length: to - from + 1 }, (_value, offset) => hill0Frame(from + offset, liftPx));

const entityFrame = (
  visualId: string,
  stem: string,
  index: number,
  options?: Partial<Pick<FrameRef, "size" | "pivot">>,
): FrameRef => {
  const sourceId = `${stem}_${String(index).padStart(4, "0")}`;

  return {
    textureKey: `default_entity_${visualId}_${sourceId}`,
    fileName: `${sourceId}.png`,
    ...options,
  };
};

/** Exact fnt/portrait.spr frame recovered from the selected-entity helper. */
const selectionPortrait = (index: number): FrameRef => {
  const sourceId = `portrait_${String(index).padStart(4, "0")}`;

  return {
    textureKey: `default_ui_selection_${sourceId}`,
    fileName: `${sourceId}.png`,
    assetPath: "ui/portraits",
  };
};

/**
 * PROVISIONAL BY DEFAULT: direction order, state blocks, mirroring, and building health semantics are unverified
 * unless a visual has narrower static evidence recorded in analysis/generated/sprite-mapping-audit.json.
 */
const ENTITY_FACING_ORDER = ["s", "sw", "w", "nw", "n", "ne", "e", "se"] as const satisfies readonly Facing[];
const FIVE_FACING_SOURCE_ORDER = ["n", "ne", "e", "se", "s"] as const satisfies readonly Facing[];
const FIVE_FACING_MIRRORED_FACINGS = {
  nw: "ne",
  w: "e",
  sw: "se",
} as const satisfies Partial<Record<Facing, Facing>>;
const STATICALLY_RECOVERED_DIRECTION_SOURCES = {
  s: { frameBaseIndex: 0, mirrorX: false },
  sw: { frameBaseIndex: 1, mirrorX: false },
  w: { frameBaseIndex: 2, mirrorX: false },
  nw: { frameBaseIndex: 3, mirrorX: false },
  n: { frameBaseIndex: 2, mirrorX: true },
  ne: { frameBaseIndex: 1, mirrorX: true },
  e: { frameBaseIndex: 0, mirrorX: true },
  se: { frameBaseIndex: 4, mirrorX: false },
} as const satisfies Record<Facing, { frameBaseIndex: number; mirrorX: boolean }>;
const STATICALLY_RECOVERED_RESOURCE_WORK_DIRECTION_SOURCES = {
  s: { frameBaseIndex: 0, mirrorX: false },
  sw: { frameBaseIndex: 0, mirrorX: false },
  w: { frameBaseIndex: 0, mirrorX: false },
  nw: { frameBaseIndex: 0, mirrorX: false },
  n: { frameBaseIndex: 0, mirrorX: true },
  ne: { frameBaseIndex: 0, mirrorX: true },
  e: { frameBaseIndex: 0, mirrorX: true },
  se: { frameBaseIndex: 0, mirrorX: true },
} as const satisfies Record<Facing, { frameBaseIndex: number; mirrorX: boolean }>;
const TURTLE_TANK_RECOVERED_DIRECTION_SOURCES = {
  s: { frameBaseIndex: 2, mirrorX: false },
  sw: { frameBaseIndex: 4, mirrorX: false },
  w: { frameBaseIndex: 6, mirrorX: false },
  nw: { frameBaseIndex: 8, mirrorX: false },
  n: { frameBaseIndex: 6, mirrorX: true },
  ne: { frameBaseIndex: 4, mirrorX: true },
  e: { frameBaseIndex: 2, mirrorX: true },
  se: { frameBaseIndex: 0, mirrorX: false },
} as const satisfies Record<Facing, { frameBaseIndex: number; mirrorX: boolean }>;

const TURTLE_TANK_INTERMEDIATE_TURN_SOURCES = {
  1000: { frameStart: 24, mirrorX: false },
  1001: { frameStart: 40, mirrorX: false },
  1002: { frameStart: 56, mirrorX: false },
  1003: { frameStart: 56, mirrorX: true },
  1004: { frameStart: 40, mirrorX: true },
  1005: { frameStart: 24, mirrorX: true },
  1006: { frameStart: 8, mirrorX: true },
  1007: { frameStart: 8, mirrorX: false },
} as const;

const turtleTankIntermediateTurnClips = (): Record<number, AnimationClip> =>
  Object.fromEntries(
    Object.entries(TURTLE_TANK_INTERMEDIATE_TURN_SOURCES).map(([rawDirection, source]) => [
      Number(rawDirection),
      {
        frames: entityFrameRange("japanese_turtle_tank", "ghosttankj", source.frameStart, 8),
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
        ...(source.mirrorX ? { mirrorX: true } : {}),
      },
    ]),
  );
const SOURCE_FRAMES_PER_FACING = 8;
const ROYAL_CART_FRAMES_PER_FACING = 10;
const PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS = 4;
const PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS = 8;

const entityFrameRange = (
  visualId: string,
  stem: string,
  from: number,
  count = SOURCE_FRAMES_PER_FACING,
): readonly FrameRef[] =>
  Array.from({ length: count }, (_value, offset) => entityFrame(visualId, stem, from + offset));

const sourceFacingClips = (
  visualId: string,
  stem: string,
  startFrame: number,
  fps: number,
  framesPerFacing = SOURCE_FRAMES_PER_FACING,
): Partial<Record<Facing | "default", AnimationClip>> => {
  const clips: Partial<Record<Facing | "default", AnimationClip>> = {};

  ENTITY_FACING_ORDER.forEach((facing, directionIndex) => {
    clips[facing] = {
      frames: entityFrameRange(visualId, stem, startFrame + directionIndex * framesPerFacing, framesPerFacing),
      fps,
      loop: true,
    };
  });
  const defaultClip = clips.s;
  if (defaultClip) {
    clips.default = defaultClip;
  }

  return clips;
};

const sourceFacingStillClips = (
  visualId: string,
  stem: string,
  startFrame: number,
  framesPerFacing = SOURCE_FRAMES_PER_FACING,
): Partial<Record<Facing | "default", AnimationClip>> => {
  const clips: Partial<Record<Facing | "default", AnimationClip>> = {};

  ENTITY_FACING_ORDER.forEach((facing, directionIndex) => {
    clips[facing] = {
      frames: [entityFrame(visualId, stem, startFrame + directionIndex * framesPerFacing)],
      fps: 1,
      loop: true,
    };
  });
  const defaultClip = clips.s;
  if (defaultClip) {
    clips.default = defaultClip;
  }

  return clips;
};

const sourceFiveFacingClips = (
  visualId: string,
  stem: string,
  startFrame: number,
  fps: number,
  framesPerFacing = SOURCE_FRAMES_PER_FACING,
): Partial<Record<Facing | "default", AnimationClip>> => {
  const clips: Partial<Record<Facing | "default", AnimationClip>> = {};

  FIVE_FACING_SOURCE_ORDER.forEach((facing, directionIndex) => {
    clips[facing] = {
      frames: entityFrameRange(visualId, stem, startFrame + directionIndex * framesPerFacing, framesPerFacing),
      fps,
      loop: true,
    };
  });
  Object.entries(FIVE_FACING_MIRRORED_FACINGS).forEach(([facing, sourceFacing]) => {
    const sourceClip = clips[sourceFacing];
    if (sourceClip) {
      clips[facing as Facing] = { ...sourceClip, mirrorX: true };
    }
  });
  const defaultClip = clips.s;
  if (defaultClip) {
    clips.default = defaultClip;
  }

  return clips;
};

function staticallyRecoveredNormalMovementClips(
  visualId: string,
  stem: string,
  startFrame: number,
  fps: number,
): Partial<Record<Facing | "default", AnimationClip>> {
  return staticallyRecoveredDirectionalClips({
    visualId,
    stem,
    frameStart: startFrame,
    frameStride: SOURCE_FRAMES_PER_FACING,
    phaseCount: SOURCE_FRAMES_PER_FACING,
    fps,
    loop: true,
  });
}

function staticallyRecoveredResourceWorkClips(
  visualId: string,
  stem: string,
  startFrame: number,
): Partial<Record<Facing | "default", AnimationClip>> {
  // State 10 shares one eight-phase source band across all facings; direction only controls mirroring.
  return staticallyRecoveredDirectionalClips({
    visualId,
    stem,
    frameStart: startFrame,
    frameStride: 0,
    phaseCount: SOURCE_FRAMES_PER_FACING,
    fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
    loop: true,
    directionSources: STATICALLY_RECOVERED_RESOURCE_WORK_DIRECTION_SOURCES,
  });
}

function staticallyRecoveredDirectionalClips({
  visualId,
  stem,
  frameStart,
  frameStride,
  phaseCount,
  fps,
  loop,
  directionSources = STATICALLY_RECOVERED_DIRECTION_SOURCES,
}: {
  visualId: string;
  stem: string;
  frameStart: number;
  frameStride: number;
  phaseCount: number;
  fps: number;
  loop: boolean;
  directionSources?: Readonly<
    Record<Facing, { frameBaseIndex: number; mirrorX: boolean }>
  >;
}): Partial<Record<Facing | "default", AnimationClip>> {
  const clips: Partial<Record<Facing | "default", AnimationClip>> = {};
  for (const facing of ENTITY_FACING_ORDER) {
    const source = directionSources[facing];
    clips[facing] = {
      frames: entityFrameRange(
        visualId,
        stem,
        frameStart + source.frameBaseIndex * frameStride,
        phaseCount,
      ),
      fps,
      loop,
      ...(source.mirrorX ? { mirrorX: true } : {}),
    };
  }
  const defaultClip = clips.s;
  if (defaultClip) {
    clips.default = defaultClip;
  }

  return clips;
}

const sourceFiveFacingStillClips = (
  visualId: string,
  stem: string,
  startFrame: number,
  framesPerFacing = SOURCE_FRAMES_PER_FACING,
): Partial<Record<Facing | "default", AnimationClip>> => {
  const clips: Partial<Record<Facing | "default", AnimationClip>> = {};

  FIVE_FACING_SOURCE_ORDER.forEach((facing, directionIndex) => {
    clips[facing] = {
      frames: [entityFrame(visualId, stem, startFrame + directionIndex * framesPerFacing)],
      fps: 1,
      loop: true,
    };
  });
  Object.entries(FIVE_FACING_MIRRORED_FACINGS).forEach(([facing, sourceFacing]) => {
    const sourceClip = clips[sourceFacing];
    if (sourceClip) {
      clips[facing as Facing] = { ...sourceClip, mirrorX: true };
    }
  });
  const defaultClip = clips.s;
  if (defaultClip) {
    clips.default = defaultClip;
  }

  return clips;
};

type OriginalBuildingProfile = (typeof originalBuildingVisualProfiles)[number];

function getOriginalSourceProfile(internalClass: number) {
  const profile = originalEntityTypeProfilesByClass[String(internalClass) as keyof typeof originalEntityTypeProfilesByClass];
  if (!profile) {
    throw new Error(`Unknown original entity internal class ${String(internalClass)}`);
  }
  return profile;
}

function getOriginalBuildingProfile(internalClass: number): OriginalBuildingProfile {
  const profile = originalBuildingVisualProfiles.find((candidate) => candidate.internalClass === internalClass);
  if (!profile) {
    throw new Error(`Missing original building visual profile for internal class ${String(internalClass)}`);
  }
  return profile;
}

function sourceBuildingStates(
  visualId: string,
  stem: string,
  profile: OriginalBuildingProfile,
): Pick<EntityVisual, "states" | "layers"> {
  const construction = profile.construction;
  const body = profile.completedBody;
  if (construction.status !== "static-confirmed-generic-selector" || body.status !== "static-confirmed-generic-health-selector") {
    throw new Error(`Original building state profile ${String(profile.internalClass)} is not resolved for runtime use`);
  }

  const frameStart = getOriginalSourceProfile(profile.internalClass).sprite.baseFrame - 7;
  const frameCount = construction.phaseThresholds.length;
  const frames = entityFrameRange(visualId, stem, frameStart, frameCount);
  const states: EntityVisual["states"] = {
    idle: { clips: { default: { frames: [entityFrame(visualId, stem, body.healthyFrame)], fps: 1, loop: true } } },
    damaged: { clips: { default: { frames: [entityFrame(visualId, stem, body.damagedFrame)], fps: 1, loop: true } } },
    construction: {
      clips: {
        default: {
          frames,
          fps: 8,
          loop: false,
          progressFrameThresholds: construction.phaseThresholds,
        },
      },
    },
  };

  if (profile.overlay.category !== "continuous") {
    return { states };
  }

  const { frameStart: overlayStart, frameCount: overlayCount, sourceGlobalTickDivisor } = profile.overlay;
  if (!Number.isInteger(overlayStart) || !Number.isInteger(overlayCount) || !Number.isInteger(sourceGlobalTickDivisor)) {
    throw new Error(`Continuous overlay profile ${String(profile.internalClass)} is missing frame/tick data`);
  }
  const overlayFrames = entityFrameRange(visualId, stem, overlayStart, overlayCount);
  const overlayClip: AnimationClip = {
    frames: overlayFrames,
    fps: 1,
    loop: true,
    sourceGlobalTickDivisor,
  };
  return {
    states,
    layers: [{ id: "completed-overlay", states: {
      idle: { clips: { default: overlayClip } },
      damaged: { clips: { default: overlayClip } },
    } }],
  };
}

function sourceBuildingVisualFromProfile({
  id,
  assetPath,
  visualId,
  stem,
  selectionPortraitFrameIndex,
  originalClass,
}: {
  id: string;
  assetPath: string;
  visualId: string;
  stem: string;
  selectionPortraitFrameIndex?: number;
  originalClass: number;
}): EntityVisual {
  const sourceProfile = getOriginalSourceProfile(originalClass);
  const buildingProfile = getOriginalBuildingProfile(originalClass);
  const stateProfile = sourceBuildingStates(visualId, stem, buildingProfile);
  if (!Number.isInteger(sourceProfile.sprite.width) || sourceProfile.sprite.width <= 0 || !Number.isInteger(sourceProfile.sprite.height) || sourceProfile.sprite.height <= 0) {
    throw new Error(`Original source profile ${String(originalClass)} has invalid dimensions`);
  }
  const sourceSize = { w: sourceProfile.sprite.width, h: sourceProfile.sprite.height };
  const baseVisual: EntityVisual = {
    id,
    kind: "entity",
    assetPath,
    render: { srcPxPerWu: 32, filtering: "nearest" },
    originalSourceProfile: { internalClass: originalClass, status: "proven" },
    defaults: { size: sourceSize, pivot: { anchor: { x: 0, y: 0 } } },
    ...(selectionPortraitFrameIndex === undefined ? {} : { portrait: selectionPortrait(selectionPortraitFrameIndex) }),
    ...stateProfile,
  };
  const pivot = resolveOriginalEntityFramePivot(baseVisual, sourceSize);
  if (!pivot) throw new Error(`Failed to resolve original pivot for ${id}`);
  return { ...baseVisual, defaults: { size: sourceSize, pivot } };
}

function sourceProfiledVisual(visual: EntityVisual, originalClass: number): EntityVisual {
  const profile = getOriginalSourceProfile(originalClass);
  const originalSourceProfile = { internalClass: originalClass, status: "proven" as const };
  if (!Number.isInteger(profile.sprite.width) || profile.sprite.width <= 0 || !Number.isInteger(profile.sprite.height) || profile.sprite.height <= 0) {
    throw new Error(`Original source profile ${String(originalClass)} has invalid dimensions`);
  }
  const size = { w: profile.sprite.width, h: profile.sprite.height };
  const pivot = resolveOriginalEntityFramePivot({ ...visual, originalSourceProfile }, size);
  if (!pivot) {
    throw new Error(`Failed to resolve original pivot for ${visual.id}`);
  }
  return { ...visual, originalSourceProfile, defaults: { ...visual.defaults, size, pivot } };
}

/**
 * Provisional hill0 slot map from the source asset naming notes.
 * Direction names are screen-space around the raised tile.
 */
export const hill0TerrainVisual = {
  id: "hill0",
  kind: "terrain",
  assetPath: "terrain/hill0",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 64, h: 48 },
    // Source frames are 64x48, but the ground footprint sits in the top 64x32 area.
    // The anchor is the footprint center, not the full frame center/bottom.
    pivot: { anchor: HILL0_FOOTPRINT_ANCHOR },
  },
  elevationSteps: 1,
  slots: {
    base: hill0FrameRange(0, 5),
    ramp_sw: hill0FrameRange(6, 12, HILL0_ELEVATION_LIFT_PX),
    ramp_nw: hill0FrameRange(13, 19, HILL0_ELEVATION_LIFT_PX),
    ramp_ne: hill0FrameRange(20, 26, HILL0_ELEVATION_LIFT_PX),
    ramp_se: hill0FrameRange(27, 33, HILL0_ELEVATION_LIFT_PX),
    corner_w: [hill0Frame(34, HILL0_ELEVATION_LIFT_PX)],
    corner_n: [hill0Frame(35, HILL0_ELEVATION_LIFT_PX)],
    corner_e: [hill0Frame(36, HILL0_ELEVATION_LIFT_PX)],
    corner_s: [hill0Frame(37, HILL0_ELEVATION_LIFT_PX)],
    plateauTop: hill0FrameRange(0, 5, HILL0_ELEVATION_LIFT_PX),
  },
} as const satisfies TerrainVisual;

export const villagerEntityVisual = {
  id: "villager-korean-farmer",
  kind: "entity",
  assetPath: "entities/villager",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 60, h: 60 },
    pivot: { anchor: { x: 30, y: 52 } },
  },
  portrait: selectionPortrait(33),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({ visualId: "villager", stem: "farmerk", frameStart: 0, frameStride: 8, phaseCount: 8, fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS, loop: true }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips("villager", "farmerk", 40, PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips("villager", "farmerk", 40, PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({ visualId: "villager", stem: "farmerk", frameStart: 240, frameStride: 0, phaseCount: 8, fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS, loop: false }),
    },
    carry: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "villager",
        stem: "farmerk",
        frameStart: 80,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    "carry-idle": {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "villager",
        stem: "farmerk",
        frameStart: 82,
        frameStride: 8,
        phaseCount: 1,
        fps: 1,
        loop: true,
      }),
    },
    // Project adapter: generic gather selects the recovered original state-10 source layout.
    gather: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredResourceWorkClips("villager", "farmerk", 120),
    },
    // Project adapters: generic build/repair select the recovered original state-11 source layout.
    // State 11's original gameplay meaning is not recovered.
    build: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "villager",
        stem: "farmerk",
        frameStart: 160,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    repair: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "villager",
        stem: "farmerk",
        frameStart: 160,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
  },
} as const satisfies EntityVisual;

export const swordsmanEntityVisual = {
  id: "korean-swordsman",
  kind: "entity",
  assetPath: "entities/swordsman",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 60, h: 60 },
    pivot: { anchor: { x: 30, y: 52 } },
  },
  portrait: selectionPortrait(32),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "swordsman",
        stem: "swordk",
        frameStart: 128,
        frameStride: 10,
        phaseCount: 10,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips("swordsman", "swordk", 0, 8),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips("swordsman", "swordk", 0, 8),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "swordsman",
        stem: "swordk",
        frameStart: 48,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "swordsman",
        stem: "swordk",
        frameStart: 40,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const japaneseSwordsmanEntityVisual = {
  id: "japanese-swordsman",
  kind: "entity",
  assetPath: "entities/japanese-swordsman",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 60, h: 50 },
    pivot: { anchor: { x: 30, y: 44 } },
  },
  portrait: selectionPortrait(3),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_swordsman",
        stem: "swordj",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "japanese_swordsman",
        "swordj",
        40,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "japanese_swordsman",
        "swordj",
        40,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_swordsman",
        stem: "swordj",
        frameStart: 120,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_swordsman",
        stem: "swordj",
        frameStart: 176,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const koreanMonkEntityVisual = {
  id: "korean-monk",
  kind: "entity",
  assetPath: "entities/korean-monk",
  render: { srcPxPerWu: 32, filtering: "nearest" },
  defaults: {
    // Source dimensions are recovered; pivot and timing remain project display adaptations.
    size: { w: 65, h: 50 },
    pivot: { anchor: { x: 32, y: 44 } },
  },
  portrait: selectionPortrait(34),
  terminalPresentation: { state: "death" },
  states: {
    idle: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredDirectionalClips({ visualId: "korean_monk", stem: "budak", frameStart: 100, frameStride: 8, phaseCount: 8, fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS, loop: true }) },
    move: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredNormalMovementClips("korean_monk", "budak", 0, PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS) },
    walk: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredNormalMovementClips("korean_monk", "budak", 0, PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS) },
    attack: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredDirectionalClips({ visualId: "korean_monk", stem: "budak", frameStart: 50, frameStride: 10, phaseCount: 10, fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS, loop: false }) },
    death: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredDirectionalClips({ visualId: "korean_monk", stem: "budak", frameStart: 40, frameStride: 0, phaseCount: 8, fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS, loop: false }) },
  },
} as const satisfies EntityVisual;

export const archerEntityVisual = {
  id: "korean-archer",
  kind: "entity",
  assetPath: "entities/archer",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 60, h: 60 },
    pivot: { anchor: { x: 30, y: 52 } },
  },
  portrait: selectionPortrait(31),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "archer",
        stem: "archerk",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "archer",
        "archerk",
        80,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "archer",
        "archerk",
        80,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "archer",
        stem: "archerk",
        frameStart: 120,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "archer",
        stem: "archerk",
        frameStart: 160,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const japaneseGunnerEntityVisual = {
  id: "japanese-gunner",
  kind: "entity",
  assetPath: "entities/japanese-gunner",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    // Project display adaptation: original timing and pivot contracts are not recovered.
    size: { w: 60, h: 60 },
    pivot: { anchor: { x: 30, y: 52 } },
  },
  portrait: selectionPortrait(2),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_gunner",
        stem: "gunj1",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_gunner",
        stem: "gunj1",
        frameStart: 40,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_gunner",
        stem: "gunj1",
        frameStart: 40,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_gunner",
        stem: "gunj2",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_gunner",
        stem: "gunj3",
        frameStart: 60,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const japaneseFarmerEntityVisual = {
  id: "japanese-farmer",
  kind: "entity",
  assetPath: "entities/japanese-farmer",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    // Project display adaptation: original timing and pivot contracts are not recovered.
    size: { w: 66, h: 56 },
    pivot: { anchor: { x: 33, y: 50 } },
  },
  portrait: selectionPortrait(6),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_farmer",
        stem: "Farmerj",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_farmer",
        stem: "Farmerj",
        frameStart: 160,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_farmer",
        stem: "Farmerj",
        frameStart: 160,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    // Project adapter: generic gather selects the recovered original state-10 source layout.
    gather: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredResourceWorkClips("japanese_farmer", "Farmerj", 40),
    },
    carry: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_farmer",
        stem: "Farmerj",
        frameStart: 200,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    "carry-idle": {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_farmer",
        stem: "Farmerj",
        frameStart: 200,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_farmer",
        stem: "Farmerj",
        frameStart: 240,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const japaneseShrineMaidenEntityVisual = {
  id: "japanese-shrine-maiden",
  kind: "entity",
  assetPath: "entities/japanese-shrine-maiden",
  render: { srcPxPerWu: 32, filtering: "nearest" },
  defaults: {
    // Source dimensions are recovered; pivot and timing remain project display adaptations.
    size: { w: 50, h: 50 },
    pivot: { anchor: { x: 25, y: 44 } },
  },
  portrait: selectionPortrait(5),
  terminalPresentation: { state: "death" },
  states: {
    idle: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredDirectionalClips({ visualId: "japanese_shrine_maiden", stem: "advbudaj", frameStart: 120, frameStride: 8, phaseCount: 8, fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS, loop: true }) },
    move: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredNormalMovementClips("japanese_shrine_maiden", "advbudaj", 0, PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS) },
    walk: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredNormalMovementClips("japanese_shrine_maiden", "advbudaj", 0, PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS) },
    attack: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredDirectionalClips({ visualId: "japanese_shrine_maiden", stem: "advbudaj", frameStart: 60, frameStride: 10, phaseCount: 10, fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS, loop: false }) },
    death: { facings: ENTITY_FACING_ORDER, clips: staticallyRecoveredDirectionalClips({ visualId: "japanese_shrine_maiden", stem: "advbudaj", frameStart: 40, frameStride: 0, phaseCount: 8, fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS, loop: false }) },
  },
} as const satisfies EntityVisual;

export const japaneseSamuraiEntityVisual = {
  id: "japanese-samurai",
  kind: "entity",
  assetPath: "entities/japanese-samurai",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    // Project display adaptation: the original pivot contract is not recovered.
    size: { w: 80, h: 80 },
    pivot: { anchor: { x: 40, y: 72 } },
  },
  portrait: selectionPortrait(4),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_samurai",
        stem: "horseswordj2",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "japanese_samurai",
        "horseswordj1",
        0,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "japanese_samurai",
        "horseswordj1",
        0,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_samurai",
        stem: "horseswordj1",
        frameStart: 50,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_samurai",
        stem: "horseswordj1",
        frameStart: 40,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const japaneseTurtleTankEntityVisual = {
  id: "japanese-turtle-tank",
  kind: "entity",
  assetPath: "entities/japanese-turtle-tank",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    // Project display adaptation: the original pivot contract is not recovered.
    size: { w: 70, h: 60 },
    pivot: { anchor: { x: 35, y: 52 } },
  },
  portrait: selectionPortrait(11),
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_turtle_tank",
        stem: "ghosttankj",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 1,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
        directionSources: TURTLE_TANK_RECOVERED_DIRECTION_SOURCES,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_turtle_tank",
        stem: "ghosttankj",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
        directionSources: TURTLE_TANK_RECOVERED_DIRECTION_SOURCES,
      }),
      sourceOrientationClips: {
        "k01-japanese-turtle-tank-raw16": turtleTankIntermediateTurnClips(),
      },
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_turtle_tank",
        stem: "ghosttankj",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
        directionSources: TURTLE_TANK_RECOVERED_DIRECTION_SOURCES,
      }),
      sourceOrientationClips: {
        "k01-japanese-turtle-tank-raw16": turtleTankIntermediateTurnClips(),
      },
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_turtle_tank",
        stem: "ghosttankj",
        frameStart: 72,
        frameStride: 1,
        phaseCount: 1,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
        directionSources: TURTLE_TANK_RECOVERED_DIRECTION_SOURCES,
      }),
    },
  },
} as const satisfies EntityVisual;

export const japaneseKonishiEntityVisual = {
  id: "japanese-konishi",
  kind: "entity",
  assetPath: "entities/japanese-konishi",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    // Project display adaptation: the original pivot contract is not recovered.
    size: { w: 140, h: 108 },
    pivot: { anchor: { x: 70, y: 100 } },
  },
  portrait: selectionPortrait(15),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_konishi",
        stem: "generalj12",
        frameStart: 0,
        frameStride: 6,
        phaseCount: 6,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_konishi",
        stem: "generalj11",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_konishi",
        stem: "generalj11",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: true,
      }),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_konishi",
        stem: "generalj13",
        frameStart: 0,
        frameStride: 10,
        phaseCount: 10,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "japanese_konishi",
        stem: "generalj11",
        frameStart: 40,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const generalK4EntityVisual = {
  id: "korean-general-k4",
  kind: "entity",
  assetPath: "entities/general-k4",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 84, h: 76 },
    pivot: { anchor: { x: 42, y: 66 } },
  },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingStillClips("general_k4", "generalk4", 0),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("general_k4", "generalk4", 40, 8),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("general_k4", "generalk4", 40, 8),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("general_k4", "generalk4", 96, 8),
    },
  },
} as const satisfies EntityVisual;

export const gwonYulEntityVisual = {
  id: "korean-gwon-yul",
  kind: "entity",
  assetPath: "entities/gwon-yul",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 128, h: 108 },
    pivot: { anchor: { x: 64, y: 98 } },
  },
  portrait: selectionPortrait(46),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "gwon_yul",
        stem: "generalk13",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "gwon_yul",
        "generalk11",
        0,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "gwon_yul",
        "generalk11",
        0,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "gwon_yul",
        stem: "generalk12",
        frameStart: 0,
        frameStride: 10,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "gwon_yul",
        stem: "generalk11",
        frameStart: 40,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const ryuSeongRyongEntityVisual = {
  id: "korean-ryu-seong-ryong",
  kind: "entity",
  assetPath: "entities/ryu-seong-ryong",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 88, h: 76 },
    pivot: { anchor: { x: 44, y: 66 } },
  },
  portrait: selectionPortrait(48),
  terminalPresentation: { state: "death" },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "ryu_seong_ryong",
        stem: "generalk31",
        frameStart: 0,
        frameStride: 8,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_IDLE_FPS,
        loop: true,
      }),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "ryu_seong_ryong",
        "generalk31",
        40,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredNormalMovementClips(
        "ryu_seong_ryong",
        "generalk31",
        40,
        PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
      ),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "ryu_seong_ryong",
        stem: "generalk32",
        frameStart: 0,
        frameStride: 10,
        phaseCount: 10,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
    death: {
      facings: ENTITY_FACING_ORDER,
      clips: staticallyRecoveredDirectionalClips({
        visualId: "ryu_seong_ryong",
        stem: "generalk32",
        frameStart: 50,
        frameStride: 0,
        phaseCount: 8,
        fps: PROVISIONAL_RECOVERED_ANIMATION_ACTIVE_FPS,
        loop: false,
      }),
    },
  },
} as const satisfies EntityVisual;

export const townCenterEntityVisual = sourceBuildingVisualFromProfile({ id: "korean-hq", assetPath: "entities/town-center", visualId: "town_center", stem: "hqk", selectionPortraitFrameIndex: 52, originalClass: 49 });
export const houseEntityVisual = sourceBuildingVisualFromProfile({ id: "korean-mill-house-proxy", assetPath: "entities/house", visualId: "house", stem: "millk", selectionPortraitFrameIndex: 51, originalClass: 48 });
export const barracksEntityVisual = sourceBuildingVisualFromProfile({ id: "korean-barracks", assetPath: "entities/barracks", visualId: "barracks", stem: "barrackk", selectionPortraitFrameIndex: 54, originalClass: 50 });
export const beaconEntityVisual = sourceBuildingVisualFromProfile({ id: "korean-signal-beacon", assetPath: "entities/korean-signal-beacon", visualId: "beacon", stem: "firehousek", originalClass: 52 });

export const japaneseCampHouseEntityVisual = sourceBuildingVisualFromProfile({
  id: "japanese-camp-house",
  assetPath: "entities/japanese-camp-house",
  visualId: "japanese_camp_house",
  stem: "millj",
  originalClass: 57,
  selectionPortraitFrameIndex: 28,
});

export const japaneseCampBarracksEntityVisual = sourceBuildingVisualFromProfile({
  id: "japanese-camp-barracks",
  assetPath: "entities/japanese-camp-barracks",
  visualId: "japanese_camp_barracks",
  stem: "barrackj",
  originalClass: 60,
  selectionPortraitFrameIndex: 22,
});

export const japaneseCampTowerEntityVisual = sourceBuildingVisualFromProfile({
  id: "japanese-camp-tower",
  assetPath: "entities/japanese-camp-tower",
  visualId: "japanese_camp_tower",
  stem: "towerj",
  originalClass: 63,
  selectionPortraitFrameIndex: 120,
});

export const japaneseCampFirehouseEntityVisual = sourceBuildingVisualFromProfile({
  id: "japanese-camp-firehouse",
  assetPath: "entities/japanese-camp-firehouse",
  visualId: "japanese_camp_firehouse",
  stem: "firehousej",
  originalClass: 62,
  selectionPortraitFrameIndex: 24,
});

export const japaneseCampAdvancedTowerEntityVisual = {
  id: "japanese-camp-advanced-tower",
  kind: "entity",
  assetPath: "entities/japanese-camp-advanced-tower",
  render: { srcPxPerWu: 32, filtering: "nearest" },
  defaults: { size: { w: 75, h: 98 }, pivot: { anchor: { x: 38, y: 74 } } },
  states: { idle: { clips: { default: { frames: [entityFrame("japanese_camp_advanced_tower", "advtowerj", 8)], fps: 1, loop: true } } } },
} as const satisfies EntityVisual;

export const koreanTrainingCommandEntityVisual = sourceBuildingVisualFromProfile({
  id: "korean-training-command",
  assetPath: "entities/korean-training-command",
  visualId: "korean_training_command",
  stem: "advbarrackk",
  originalClass: 51,
  selectionPortraitFrameIndex: 44,
});

export const japaneseHqEntityVisual = sourceBuildingVisualFromProfile({
  id: "japanese-hq",
  assetPath: "entities/japanese-hq",
  visualId: "japanese_hq",
  stem: "jhq",
  originalClass: 58,
  selectionPortraitFrameIndex: 26,
});

export const royalCartEntityVisual = {
  id: "korean-royal-cart",
  kind: "entity",
  assetPath: "entities/royal-cart",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 80, h: 80 },
    pivot: { anchor: { x: 40, y: 58 } },
  },
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingStillClips("royal_cart", "koreanking", 0, ROYAL_CART_FRAMES_PER_FACING),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("royal_cart", "koreanking", 0, 6, ROYAL_CART_FRAMES_PER_FACING),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("royal_cart", "koreanking", 0, 6, ROYAL_CART_FRAMES_PER_FACING),
    },
  },
} as const satisfies EntityVisual;

export const defaultTheme = {
  id: "default",
  displayName: "Default",
  assetRoot: "/assets/themes/default",
  display: {
    policy: "world-constant",
    defaultPxPerWu: 32,
  },
  visuals: {
    hill0: hill0TerrainVisual,
    "villager-korean-farmer": sourceProfiledVisual(villagerEntityVisual, 7),
    "korean-swordsman": sourceProfiledVisual(swordsmanEntityVisual, 2),
    "korean-monk": sourceProfiledVisual(koreanMonkEntityVisual, 11),
    "japanese-swordsman": sourceProfiledVisual(japaneseSwordsmanEntityVisual, 3),
    "korean-archer": sourceProfiledVisual(archerEntityVisual, 4),
    "japanese-gunner": sourceProfiledVisual(japaneseGunnerEntityVisual, 12),
    "japanese-farmer": sourceProfiledVisual(japaneseFarmerEntityVisual, 31),
    "japanese-shrine-maiden": sourceProfiledVisual(japaneseShrineMaidenEntityVisual, 16),
    "japanese-samurai": sourceProfiledVisual(japaneseSamuraiEntityVisual, 13),
    "japanese-turtle-tank": sourceProfiledVisual(japaneseTurtleTankEntityVisual, 14),
    "japanese-konishi": sourceProfiledVisual(japaneseKonishiEntityVisual, 82),
    "korean-general-k4": sourceProfiledVisual(generalK4EntityVisual, 79),
    "korean-gwon-yul": sourceProfiledVisual(gwonYulEntityVisual, 76),
    "korean-ryu-seong-ryong": sourceProfiledVisual(ryuSeongRyongEntityVisual, 78),
    "korean-hq": townCenterEntityVisual,
    "korean-mill-house-proxy": houseEntityVisual,
    "korean-barracks": barracksEntityVisual,
    "korean-signal-beacon": beaconEntityVisual,
    "japanese-camp-house": japaneseCampHouseEntityVisual,
    "japanese-camp-barracks": japaneseCampBarracksEntityVisual,
    "japanese-camp-tower": japaneseCampTowerEntityVisual,
    "japanese-camp-firehouse": japaneseCampFirehouseEntityVisual,
    "japanese-camp-advanced-tower": japaneseCampAdvancedTowerEntityVisual,
    "korean-training-command": koreanTrainingCommandEntityVisual,
    "japanese-hq": japaneseHqEntityVisual,
    "korean-royal-cart": sourceProfiledVisual(royalCartEntityVisual, 92),
  },
  terrainBindings: {
    grass: { flat: "hill0", elevated: "hill0" },
  },
  entityBindings: {
    villager: "villager-korean-farmer",
    swordsman: "korean-swordsman",
    "korean-monk": "korean-monk",
    archer: "korean-archer",
    "japanese-swordsman": "japanese-swordsman",
    "japanese-gunner": "japanese-gunner",
    "japanese-farmer": "japanese-farmer",
    "japanese-shrine-maiden": "japanese-shrine-maiden",
    "japanese-samurai": "japanese-samurai",
    "japanese-turtle-tank": "japanese-turtle-tank",
    "japanese-konishi": "japanese-konishi",
    "ryu-seong-ryong": "korean-ryu-seong-ryong",
    "gwon-yul": "korean-gwon-yul",
    "town-center": "korean-hq",
    house: "korean-mill-house-proxy",
    barracks: "korean-barracks",
    beacon: "korean-signal-beacon",
    "japanese-camp-house": "japanese-camp-house",
    "japanese-camp-barracks": "japanese-camp-barracks",
    "japanese-camp-tower": "japanese-camp-tower",
    "japanese-camp-firehouse": "japanese-camp-firehouse",
    "korean-training-command": "korean-training-command",
    "japanese-hq": "japanese-hq",
    "royal-cart": "korean-royal-cart",
  },
} as const satisfies ThemeDefinition;

/** Fail-closed audit for every gameplay entity binding in a theme. */
export function assertThemeSourceProfiles(theme: ThemeDefinition): void {
  for (const [binding, visualId] of Object.entries(theme.entityBindings)) {
    const visual = theme.visuals[visualId];
    if (!visual || visual.kind !== "entity") {
      throw new Error(`Gameplay entity binding ${binding} resolves to missing/non-entity visual ${visualId}`);
    }
    const source = visual.originalSourceProfile;
    if (!source) {
      throw new Error(`Gameplay entity visual ${visualId} (${binding}) has no original source profile`);
    }
    getOriginalSourceProfile(source.internalClass);
  }
}

export interface ThemeFrameRef {
  visual: VisualDefinition;
  frame: FrameRef;
}

export function getThemeAssetUrl(theme: ThemeDefinition, visual: VisualBase, frame: FrameRef): string {
  const fileName = frame.fileName ?? `${frame.textureKey}.png`;
  const assetRoot = theme.assetRoot.endsWith("/") ? theme.assetRoot.slice(0, -1) : theme.assetRoot;

  return `${assetRoot}/${frame.assetPath ?? visual.assetPath}/${fileName}`;
}

export function getTerrainVisual(theme: ThemeDefinition, visualId: string): TerrainVisual | null {
  const visual = theme.visuals[visualId];

  return visual?.kind === "terrain" ? visual : null;
}

export function getVisualFrameRefs(visual: VisualDefinition): readonly FrameRef[] {
  switch (visual.kind) {
    case "terrain":
      return Object.values(visual.slots).flatMap((frames) => frames ?? []);
    case "entity":
      return [
        ...(visual.portrait ? [visual.portrait] : []),
        ...Object.values(visual.states).flatMap((state) => Object.values(state.clips).flatMap((clip) => clip?.frames ?? [])),
        ...Object.values(visual.states).flatMap((state) =>
          Object.values(state.sourceOrientationClips ?? {}).flatMap((clips) =>
            Object.values(clips).flatMap((clip) => clip.frames),
          ),
        ),
        ...(visual.layers ?? []).flatMap((layer) =>
          Object.values(layer.states).flatMap((state) => Object.values(state.clips).flatMap((clip) => clip?.frames ?? [])),
        ),
      ];
    case "projectile":
      return [...visual.body.frames, ...(visual.trail?.frames ?? [])];
    case "effect":
      return visual.clip.frames;
    case "ui":
      return visual.frames;
  }
}

export function getThemeFrameRefs(theme: ThemeDefinition): readonly ThemeFrameRef[] {
  const refs: ThemeFrameRef[] = [];
  const seenTextureKeys = new Set<string>();

  for (const visual of Object.values(theme.visuals)) {
    for (const frame of getVisualFrameRefs(visual)) {
      if (seenTextureKeys.has(frame.textureKey)) {
        continue;
      }

      seenTextureKeys.add(frame.textureKey);
      refs.push({ visual, frame });
    }
  }

  return refs;
}
