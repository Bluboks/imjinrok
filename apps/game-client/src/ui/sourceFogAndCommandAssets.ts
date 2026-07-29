import type { ActionDefinitionId } from "@shared";

export type FogVisibility = "visible" | "explored" | "unseen";
export type FogNeighborMask = number;
export type CardinalDirection = "north" | "east" | "south" | "west";

export interface SourceFogTile {
  readonly textureKey: string;
  readonly assetPath: string;
  readonly sourceSpriteIndex: number;
  readonly sourceFrameIndex: 0;
  readonly alpha: number;
}

export interface SourceCommandIcon {
  readonly textureKey: string;
  readonly assetPath: string;
  readonly sourceFrameIndex: number;
}

export interface OriginalCommandControlBinding {
  readonly sourceActionWord: number;
  readonly frameOrResourceIndex: number;
  readonly sourceLabel: string | null;
}

export interface EnvironmentOverlayLightContract {
  readonly lightLevel: number;
  readonly lightSignature: string;
  readonly nightAlpha: number;
}

const NORMAL_FOG_ASSET_PREFIX = "assets/themes/default/fog/normal";
export const NORMAL_SOURCE_FOG_TILESET_ID = "imjinrok-normal";
export const CARDINAL_FOG_NEIGHBOR_OFFSETS: Readonly<Record<CardinalDirection, Readonly<{ x: number; y: number }>>> = Object.freeze({
  west: { x: -1, y: 0 },
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
});

export const NORMAL_FOG_ASSETS: readonly SourceFogTile[] = Object.freeze(
  Array.from({ length: 15 }, (_, sourceSpriteIndex) => ({
    textureKey: `original-normal-fog-${sourceSpriteIndex}-frame-0000`,
    assetPath: `${NORMAL_FOG_ASSET_PREFIX}/fog${sourceSpriteIndex}_0000.png`,
    sourceSpriteIndex,
    sourceFrameIndex: 0 as const,
    alpha: 1,
  })),
);

export const ORIGINAL_COMMAND_ICON_ASSETS: readonly SourceCommandIcon[] = Object.freeze([
  {
    textureKey: "original-command-button-frame-0026",
    assetPath: "assets/themes/default/ui/command-icons/button_0026.png",
    sourceFrameIndex: 26,
  },
  {
    textureKey: "original-command-button-frame-0027",
    assetPath: "assets/themes/default/ui/command-icons/button_0027.png",
    sourceFrameIndex: 27,
  },
  {
    textureKey: "original-command-button-frame-0028",
    assetPath: "assets/themes/default/ui/command-icons/button_0028.png",
    sourceFrameIndex: 28,
  },
  {
    textureKey: "original-command-button-frame-0029",
    assetPath: "assets/themes/default/ui/command-icons/button_0029.png",
    sourceFrameIndex: 29,
  },
]);

// These records are source evidence, not a claim that a frame/resource index is a button.spr pixel frame.
export const ORIGINAL_COMMAND_CONTROL_BINDINGS: readonly OriginalCommandControlBinding[] = Object.freeze([
  { sourceActionWord: 61, frameOrResourceIndex: 27, sourceLabel: "자동마법설정" },
  { sourceActionWord: 62, frameOrResourceIndex: 26, sourceLabel: "자동마법해제" },
  { sourceActionWord: 63, frameOrResourceIndex: 28, sourceLabel: null },
  { sourceActionWord: 64, frameOrResourceIndex: 29, sourceLabel: null },
]);

// The current product action IDs have no source-complete action/control/label/frame match.
// Keep this deliberately empty until a whole static path closes one.
const PRODUCT_ACTION_SOURCE_ICONS: Readonly<Partial<Record<ActionDefinitionId, SourceCommandIcon>>> = Object.freeze({});

const PROJECT_NEIGHBOR_MASK_TO_NORMAL_FOG_INDEX: Readonly<Record<number, number>> = Object.freeze({
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
  8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 14,
});

export function resolveSourceFogTile(
  visibility: FogVisibility,
  neighborMask: FogNeighborMask,
): SourceFogTile | null {
  assertNeighborMask(neighborMask);
  if (visibility === "visible") return null;
  const sourceSpriteIndex = PROJECT_NEIGHBOR_MASK_TO_NORMAL_FOG_INDEX[neighborMask];
  if (sourceSpriteIndex === undefined) {
    throw new Error(`No project fog mapping for neighbor mask ${neighborMask}`);
  }
  const asset = NORMAL_FOG_ASSETS[sourceSpriteIndex];
  if (!asset) throw new Error(`Missing normal fog source asset ${sourceSpriteIndex}`);
  return visibility === "explored" ? { ...asset, alpha: 0.58 } : asset;
}

/**
 * Product-only normal source-fog transition policy. The bit order and fogN mapping are
 * deliberately not an assertion about the original game's neighbor-mask rule.
 */
export function resolveNormalSourceFogTransition(
  tilesetId: string | undefined,
  visibility: FogVisibility,
  neighborVisibility: (direction: CardinalDirection) => FogVisibility,
): SourceFogTile | null {
  if (tilesetId !== NORMAL_SOURCE_FOG_TILESET_ID || visibility === "visible") {
    return null;
  }
  const mask = resolveCardinalVisibleNeighborMask(neighborVisibility);
  return mask === 0 ? null : resolveSourceFogTile(visibility, mask);
}

export function resolveCardinalVisibleNeighborMask(
  neighborVisibility: (direction: CardinalDirection) => FogVisibility,
): FogNeighborMask {
  let mask = 0;
  if (neighborVisibility("west") === "visible") mask |= 0x1;
  if (neighborVisibility("north") === "visible") mask |= 0x2;
  if (neighborVisibility("east") === "visible") mask |= 0x4;
  if (neighborVisibility("south") === "visible") mask |= 0x8;
  return mask;
}

export function resolveSourceFogTileScale(mapTileWidth: number, mapTileHeight: number): Readonly<{ x: number; y: number }> {
  if (!Number.isFinite(mapTileWidth) || mapTileWidth <= 0 || !Number.isFinite(mapTileHeight) || mapTileHeight <= 0) {
    throw new RangeError(`source fog requires positive finite map tile dimensions; received ${mapTileWidth}x${mapTileHeight}`);
  }
  return { x: mapTileWidth / 32, y: mapTileHeight / 16 };
}

export function resolveEnvironmentOverlayLightContract(lightLevel: number): EnvironmentOverlayLightContract {
  if (!Number.isFinite(lightLevel)) {
    throw new RangeError(`environment light level must be finite; received ${String(lightLevel)}`);
  }
  return {
    lightLevel,
    lightSignature: lightLevel.toFixed(4),
    nightAlpha: Math.max(0, Math.min(0.32, (1 - lightLevel) * 0.42)),
  };
}

export function resolveSourceCommandIcon(actionId: ActionDefinitionId): SourceCommandIcon | undefined {
  return PRODUCT_ACTION_SOURCE_ICONS[actionId];
}

export function requireSourceTexture(
  source: Pick<SourceFogTile | SourceCommandIcon, "textureKey">,
  exists: (textureKey: string) => boolean,
): void {
  if (!exists(source.textureKey)) {
    throw new Error(`Required source-backed texture is not loaded: ${source.textureKey}`);
  }
}

function assertNeighborMask(value: FogNeighborMask): asserts value is number {
  if (!Number.isInteger(value) || value < 0 || value > 15) {
    throw new RangeError(`fog neighbor mask must be an integer in 0..15; received ${String(value)}`);
  }
}
