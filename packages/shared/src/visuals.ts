export type VisualKind = "terrain" | "entity" | "projectile" | "effect" | "ui";
export type VisualFiltering = "nearest" | "linear";

export interface VisualPoint {
  x: number;
  y: number;
}

export interface VisualSize {
  w: number;
  h: number;
}

export interface RenderProfile {
  /** Source pixels represented by one logical world unit. */
  srcPxPerWu: number;
  filtering?: VisualFiltering;
}

export interface PivotSpec {
  /** Source-pixel anchor placed on the entity's simulation ground-contact point. */
  anchor: VisualPoint;
  /** Optional source-pixel visual lift applied by generic placement helpers. */
  liftPx?: number;
}

export interface FrameRef {
  /** Runtime texture key. Keep this namespaced by theme/visual to allow swaps later. */
  textureKey: string;
  /** File name relative to the visual asset folder. Defaults to `${textureKey}.png`. */
  fileName?: string;
  /** Optional atlas frame name for future atlas-backed visuals. */
  frameName?: string;
  /** Optional per-frame source size override. */
  size?: VisualSize;
  /** Optional per-frame pivot override. */
  pivot?: PivotSpec;
}

export interface VisualBase {
  id: string;
  kind: VisualKind;
  /** Path relative to the theme asset root, e.g. `terrain/hill0`. */
  assetPath: string;
  render: RenderProfile;
  defaults: {
    size: VisualSize;
    pivot: PivotSpec;
  };
}

export type Facing = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export function getGridFacing(deltaX: number, deltaY: number, fallback: Facing = "s"): Facing {
  if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) {
    return fallback;
  }

  const angle = Math.atan2(deltaY, deltaX);
  const sector = Math.round(angle / (Math.PI / 4));
  const normalized = ((sector % 8) + 8) % 8;
  const facings = ["e", "se", "s", "sw", "w", "nw", "n", "ne"] as const;

  return facings[normalized] ?? "s";
}

export type TerrainKindSlot =
  | "base"
  | "plateauTop"
  | "ramp_nw"
  | "ramp_ne"
  | "ramp_se"
  | "ramp_sw"
  | "corner_n"
  | "corner_e"
  | "corner_s"
  | "corner_w";

export interface TerrainVisual extends VisualBase {
  kind: "terrain";
  slots: Partial<Record<TerrainKindSlot, readonly FrameRef[]>>;
  elevationSteps: number;
}

export interface AnimationClip {
  frames: readonly FrameRef[];
  fps: number;
  loop?: boolean;
  /** Draw this clip mirrored horizontally. Used by source sprites that only store five facings. */
  mirrorX?: boolean;
  /**
   * Optional integer progress percentages at which construction selects each frame.
   * The list must align one-to-one with `frames`; clips without it use uniform spacing.
   */
  progressFrameThresholds?: readonly number[];
}

/**
 * Optional lossless source-direction clips. The outer key is a stable, serialized
 * orientation profile id and the inner key is that profile's raw direction value.
 */
export type SourceOrientationClipMap = Readonly<Record<number, AnimationClip>>;

export interface EntityVisualState {
  facings?: readonly Facing[];
  clips: Partial<Record<Facing | "default", AnimationClip>>;
  /**
   * Movement-only source-direction presentation supplied by themes that opt in.
   * Consumers must retain normal directional clips as a fallback.
   */
  sourceOrientationClips?: Readonly<Record<string, SourceOrientationClipMap>>;
}

export interface EntityVisualLayer {
  id: string;
  states: Record<string, EntityVisualState>;
}

/**
 * An explicit client-only terminal presentation. The authoritative simulation
 * still removes the entity; renderers may retain this visual for one clip.
 */
export interface EntityTerminalPresentationPolicy {
  /** A non-looping entity visual state, such as a statically recovered death clip. */
  state: string;
}

export interface EntityVisual extends VisualBase {
  kind: "entity";
  states: Record<string, EntityVisualState>;
  /** Opt-in terminal presentation metadata for client renderers. */
  terminalPresentation?: EntityTerminalPresentationPolicy;
  layers?: readonly EntityVisualLayer[];
  shadow?: FrameRef;
  teamColorMask?: FrameRef;
  portrait?: FrameRef;
}

export interface ProjectileVisual extends VisualBase {
  kind: "projectile";
  body: AnimationClip;
  trail?: AnimationClip;
}

export interface EffectVisual extends VisualBase {
  kind: "effect";
  clip: AnimationClip;
  attach?: "ground" | "source" | "target";
}

export interface UiVisual extends VisualBase {
  kind: "ui";
  frames: readonly FrameRef[];
}

export type VisualDefinition = TerrainVisual | EntityVisual | ProjectileVisual | EffectVisual | UiVisual;
