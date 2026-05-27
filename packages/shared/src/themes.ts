import type { TerrainType } from "./content.js";
import type { AnimationClip, EntityVisual, Facing, FrameRef, TerrainVisual, VisualBase, VisualDefinition } from "./visuals.js";

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

const ENTITY_FACING_ORDER = ["s", "sw", "w", "nw", "n", "ne", "e", "se"] as const satisfies readonly Facing[];
const FIVE_FACING_SOURCE_ORDER = ["s", "sw", "w", "nw", "se"] as const satisfies readonly Facing[];
const FIVE_FACING_MIRRORED_FACINGS = {
  n: "w",
  ne: "sw",
  e: "w",
} as const satisfies Partial<Record<Facing, Facing>>;
const SOURCE_FRAMES_PER_FACING = 8;
const ROYAL_CART_FRAMES_PER_FACING = 6;

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

const buildingConstructionClip = (visualId: string, stem: string, completeFrameIndex = 8): AnimationClip => ({
  frames: entityFrameRange(visualId, stem, 0, completeFrameIndex + 1),
  fps: 8,
  loop: false,
});

const buildingOverlayClip = (visualId: string, stem: string, startFrame: number, frameCount: number, fps: number): AnimationClip => ({
  frames: entityFrameRange(visualId, stem, startFrame, frameCount),
  fps,
  loop: true,
});

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
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingStillClips("villager", "farmerk", 0),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("villager", "farmerk", 0, 8),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("villager", "farmerk", 0, 8),
    },
    gather: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("villager", "farmerk", 64, 8),
    },
    build: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("villager", "farmerk", 128, 8),
    },
    repair: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("villager", "farmerk", 128, 8),
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
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingStillClips("swordsman", "swordk", 0),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("swordsman", "swordk", 0, 8),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("swordsman", "swordk", 0, 8),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("swordsman", "swordk", 64, 8),
    },
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
  states: {
    idle: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingStillClips("archer", "archerk", 80),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("archer", "archerk", 80, 8),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("archer", "archerk", 80, 8),
    },
    attack: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFiveFacingClips("archer", "archerk", 0, 8),
    },
  },
} as const satisfies EntityVisual;

export const townCenterEntityVisual = {
  id: "korean-hq",
  kind: "entity",
  assetPath: "entities/town-center",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 131, h: 131 },
    pivot: { anchor: { x: 66, y: 101 } },
  },
  states: {
    idle: {
      clips: {
        default: { frames: [entityFrame("town_center", "hqk", 8)], fps: 1, loop: true },
      },
    },
    construction: {
      clips: {
        default: buildingConstructionClip("town_center", "hqk"),
      },
    },
  },
} as const satisfies EntityVisual;

export const houseEntityVisual = {
  id: "korean-mill-house-proxy",
  kind: "entity",
  assetPath: "entities/house",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 114, h: 107 },
    pivot: { anchor: { x: 57, y: 84 } },
  },
  states: {
    idle: {
      clips: {
        default: { frames: [entityFrame("house", "millk", 8)], fps: 1, loop: true },
      },
    },
    construction: {
      clips: {
        default: buildingConstructionClip("house", "millk"),
      },
    },
  },
} as const satisfies EntityVisual;

export const barracksEntityVisual = {
  id: "korean-barracks",
  kind: "entity",
  assetPath: "entities/barracks",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 128, h: 117 },
    pivot: { anchor: { x: 64, y: 91 } },
  },
  states: {
    idle: {
      clips: {
        default: { frames: [entityFrame("barracks", "barrackk", 7)], fps: 1, loop: true },
      },
    },
    construction: {
      clips: {
        default: buildingConstructionClip("barracks", "barrackk", 7),
      },
    },
  },
  layers: [
    {
      id: "flag",
      states: {
        idle: {
          clips: {
            default: buildingOverlayClip("barracks", "barrackk", 9, 7, 8),
          },
        },
      },
    },
  ],
} as const satisfies EntityVisual;

export const beaconEntityVisual = {
  id: "korean-signal-beacon",
  kind: "entity",
  assetPath: "entities/beacon",
  render: {
    srcPxPerWu: 32,
    filtering: "nearest",
  },
  defaults: {
    size: { w: 80, h: 96 },
    pivot: { anchor: { x: 40, y: 72 } },
  },
  states: {
    idle: {
      clips: {
        default: { frames: [entityFrame("beacon", "towerk", 8)], fps: 1, loop: true },
      },
    },
    construction: {
      clips: {
        default: buildingConstructionClip("beacon", "towerk"),
      },
    },
  },
} as const satisfies EntityVisual;

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
      clips: sourceFacingStillClips("royal_cart", "koreanking", 0, ROYAL_CART_FRAMES_PER_FACING),
    },
    move: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFacingClips("royal_cart", "koreanking", 0, 6, ROYAL_CART_FRAMES_PER_FACING),
    },
    walk: {
      facings: ENTITY_FACING_ORDER,
      clips: sourceFacingClips("royal_cart", "koreanking", 0, 6, ROYAL_CART_FRAMES_PER_FACING),
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
    "villager-korean-farmer": villagerEntityVisual,
    "korean-swordsman": swordsmanEntityVisual,
    "korean-archer": archerEntityVisual,
    "korean-hq": townCenterEntityVisual,
    "korean-mill-house-proxy": houseEntityVisual,
    "korean-barracks": barracksEntityVisual,
    "korean-signal-beacon": beaconEntityVisual,
    "korean-royal-cart": royalCartEntityVisual,
  },
  terrainBindings: {
    grass: { flat: "hill0", elevated: "hill0" },
  },
  entityBindings: {
    villager: "villager-korean-farmer",
    swordsman: "korean-swordsman",
    archer: "korean-archer",
    "ryu-seong-ryong": "korean-swordsman",
    "gwon-yul": "korean-swordsman",
    "town-center": "korean-hq",
    house: "korean-mill-house-proxy",
    barracks: "korean-barracks",
    beacon: "korean-signal-beacon",
    "royal-cart": "korean-royal-cart",
  },
} as const satisfies ThemeDefinition;

export interface ThemeFrameRef {
  visual: VisualDefinition;
  frame: FrameRef;
}

export function getThemeAssetUrl(theme: ThemeDefinition, visual: VisualBase, frame: FrameRef): string {
  const fileName = frame.fileName ?? `${frame.textureKey}.png`;
  const assetRoot = theme.assetRoot.endsWith("/") ? theme.assetRoot.slice(0, -1) : theme.assetRoot;

  return `${assetRoot}/${visual.assetPath}/${fileName}`;
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
        ...Object.values(visual.states).flatMap((state) => Object.values(state.clips).flatMap((clip) => clip?.frames ?? [])),
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
