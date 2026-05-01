import type { TerrainType } from "./content.js";
import type { FrameRef, TerrainVisual, VisualBase, VisualDefinition } from "./visuals.js";

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
  },
  terrainBindings: {
    grass: { flat: "hill0", elevated: "hill0" },
  },
  entityBindings: {},
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
      return Object.values(visual.states).flatMap((state) => Object.values(state.clips).flatMap((clip) => clip?.frames ?? []));
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
