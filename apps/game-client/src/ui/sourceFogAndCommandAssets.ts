import type { ActionDefinitionId } from "@shared";

export type FogVisibility = "visible" | "explored" | "unseen";
export type SourceFogNeighbor = "top" | "bottom" | "left" | "right" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export interface SourceFogComposite {
  readonly textureKey: string;
  readonly assetPath: string;
  readonly familyIndex: number;
  readonly selector: number;
  readonly sourceFrameIndices: readonly number[];
  /** Product mapping to literal source state 4 or 8; source semantics remain unresolved. */
  readonly sourceStateValue: 4 | 8;
  /** Product alpha policy, not a source alpha claim. */
  readonly alpha: number;
}

export interface SourceCommandIcon {
  readonly textureKey: string;
  readonly assetPath: string;
  readonly sourceFrameIndex: number;
}

export type SourceCommandIconEvidenceStatus = "exact-source-control-binding" | "source-backed-adaptation";

export interface SourceCommandIconBinding extends SourceCommandIcon {
  readonly sourceActionWord: number;
  readonly sourceLabel: string;
  readonly evidenceStatus: SourceCommandIconEvidenceStatus;
}

/**
 * Product profiles opt in to source command icons explicitly. A mod can retain
 * glyph fallback by omitting a profile, or provide its own bindings.
 */
export interface SourceCommandIconProfile {
  readonly id: string;
  readonly actionBindings: Readonly<Partial<Record<ActionDefinitionId, SourceCommandIconBinding>>>;
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

const SOURCE_FOG_ASSET_PREFIX = "assets/themes/default/fog/normal/composites";
export const IMJINROK_SOURCE_FOG_PROFILE_ID = "imjinrok-source-fog-composite";
export const SOURCE_FOG_NEIGHBOR_OFFSETS: Readonly<Record<SourceFogNeighbor, Readonly<{ x: number; y: number }>>> = Object.freeze({
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  topLeft: { x: -1, y: -1 },
  topRight: { x: 1, y: -1 },
  bottomLeft: { x: -1, y: 1 },
  bottomRight: { x: 1, y: 1 },
});

const SOURCE_FOG_LOOKUP = [0, 9, 8, 2, 10, 1, 12, 5, 11, 13, 3, 6, 0, 4, 7, 0] as const;
const SOURCE_FOG_SELECTOR_DOMAIN = new Set<number>(Array.from({ length: 14 }, (_value, index) => index));

export const SOURCE_FOG_COMPOSITE_ASSETS = Object.freeze(
  Array.from({ length: 15 }, (_family, familyIndex) =>
    Array.from({ length: 14 }, (_selector, selector) => ({
      textureKey: `original-normal-fog-${familyIndex}-selector-${String(selector).padStart(2, "0")}`,
      assetPath: `${SOURCE_FOG_ASSET_PREFIX}/fog${familyIndex}_selector${String(selector).padStart(2, "0")}.png`,
    })),
  ).flat(),
);

export const ORIGINAL_COMMAND_ICON_ASSETS: readonly SourceCommandIcon[] = Object.freeze([
  {
    textureKey: "original-command-button-frame-0004",
    assetPath: "assets/themes/default/ui/command-icons/button_0004.png",
    sourceFrameIndex: 4,
  },
  {
    textureKey: "original-command-button-frame-0006",
    assetPath: "assets/themes/default/ui/command-icons/button_0006.png",
    sourceFrameIndex: 6,
  },
  {
    textureKey: "original-command-button-frame-0010",
    assetPath: "assets/themes/default/ui/command-icons/button_0010.png",
    sourceFrameIndex: 10,
  },
  {
    textureKey: "original-command-button-frame-0011",
    assetPath: "assets/themes/default/ui/command-icons/button_0011.png",
    sourceFrameIndex: 11,
  },
  {
    textureKey: "original-command-button-frame-0012",
    assetPath: "assets/themes/default/ui/command-icons/button_0012.png",
    sourceFrameIndex: 12,
  },
  {
    textureKey: "original-command-button-frame-0016",
    assetPath: "assets/themes/default/ui/command-icons/button_0016.png",
    sourceFrameIndex: 16,
  },
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
  {
    textureKey: "original-command-button-frame-0039",
    assetPath: "assets/themes/default/ui/command-icons/button_0039.png",
    sourceFrameIndex: 39,
  },
  {
    textureKey: "original-command-button-frame-0043",
    assetPath: "assets/themes/default/ui/command-icons/button_0043.png",
    sourceFrameIndex: 43,
  },
  {
    textureKey: "original-command-button-frame-0045",
    assetPath: "assets/themes/default/ui/command-icons/button_0045.png",
    sourceFrameIndex: 45,
  },
]);

// These records are source evidence, not a claim that a frame/resource index is a button.spr pixel frame.
export const ORIGINAL_COMMAND_CONTROL_BINDINGS: readonly OriginalCommandControlBinding[] = Object.freeze([
  { sourceActionWord: 61, frameOrResourceIndex: 27, sourceLabel: "자동마법설정" },
  { sourceActionWord: 62, frameOrResourceIndex: 26, sourceLabel: "자동마법해제" },
  { sourceActionWord: 63, frameOrResourceIndex: 28, sourceLabel: null },
  { sourceActionWord: 64, frameOrResourceIndex: 29, sourceLabel: null },
]);

const commandIconByFrame = new Map(ORIGINAL_COMMAND_ICON_ASSETS.map((asset) => [asset.sourceFrameIndex, asset]));

function bindSourceCommandIcon(
  actionId: ActionDefinitionId,
  sourceActionWord: number,
  sourceLabel: string,
  sourceFrameIndex: number,
  evidenceStatus: SourceCommandIconEvidenceStatus,
): SourceCommandIconBinding {
  const asset = commandIconByFrame.get(sourceFrameIndex);
  if (!asset) {
    throw new Error(`Missing registered source command icon for button.spr frame ${sourceFrameIndex}`);
  }
  return { ...asset, sourceActionWord, sourceLabel, evidenceStatus };
}

export const IMJINROK_SOURCE_COMMAND_ICON_PROFILE: SourceCommandIconProfile = Object.freeze({
  id: "imjinrok-source-command-icons",
  actionBindings: Object.freeze({
    move: bindSourceCommandIcon("move", 3, "이동", 6, "exact-source-control-binding"),
    stop: bindSourceCommandIcon("stop", 2, "정지", 43, "exact-source-control-binding"),
    patrol: bindSourceCommandIcon("patrol", 35, "순찰", 10, "exact-source-control-binding"),
    repair: bindSourceCommandIcon("repair", 16, "수리", 12, "exact-source-control-binding"),
    hold: bindSourceCommandIcon("hold", 39, "사수", 39, "exact-source-control-binding"),
    "rally-point": bindSourceCommandIcon("rally-point", 21, "집결지설정", 11, "exact-source-control-binding"),
    "cancel-production": bindSourceCommandIcon("cancel-production", 19, "취소", 45, "exact-source-control-binding"),
    "cancel-construction": bindSourceCommandIcon("cancel-construction", 19, "취소", 45, "exact-source-control-binding"),
    "attack-move": bindSourceCommandIcon("attack-move", 5, "공격", 4, "source-backed-adaptation"),
    build: bindSourceCommandIcon("build", 11, "건설", 16, "source-backed-adaptation"),
  }),
});

export function resolveSourceCommandIconProfileForScenario(
  scenarioId: string | undefined,
): SourceCommandIconProfile | undefined {
  return scenarioId === "imjinrok-k01-opening" ? IMJINROK_SOURCE_COMMAND_ICON_PROFILE : undefined;
}

/**
 * Returns a source composite only when a map explicitly selected the profile.
 * The visibility-to-literal-state mapping (unseen→4, explored→8), alpha, and
 * web-map coordinate interpretation are deliberately labelled adaptations.
 */
export function resolveSourceFogComposite(
  profileId: string | undefined,
  familyIndex: number | undefined,
  visibility: FogVisibility,
  neighborVisibility: (neighbor: SourceFogNeighbor) => FogVisibility,
): SourceFogComposite | null {
  if (profileId === undefined || visibility === "visible") return null;
  assertSourceFogVisualProfile(profileId);
  assertFamilyIndex(familyIndex);
  const sourceStateValue = visibility === "unseen" ? 4 : 8;
  const mask = buildSourceFogCornerMask(visibility, neighborVisibility);
  if (mask === 0 || mask === 15) return null;
  const selector = SOURCE_FOG_LOOKUP[mask];
  if (selector === undefined || !SOURCE_FOG_SELECTOR_DOMAIN.has(selector)) {
    throw new Error(`Source fog lookup produced unsupported selector ${String(selector)} for mask ${mask}.`);
  }
  return {
    textureKey: `original-normal-fog-${familyIndex}-selector-${String(selector).padStart(2, "0")}`,
    assetPath: `${SOURCE_FOG_ASSET_PREFIX}/fog${familyIndex}_selector${String(selector).padStart(2, "0")}.png`,
    familyIndex,
    selector,
    sourceFrameIndices: reproduceSourceFogFrameIndices(selector),
    sourceStateValue,
    alpha: visibility === "explored" ? 0.58 : 1,
  };
}

export function assertSourceFogVisualProfile(profileId: string): void {
  if (profileId !== IMJINROK_SOURCE_FOG_PROFILE_ID) {
    throw new Error(`Unknown source fog visual profile '${profileId}'.`);
  }
}

export function assertSourceFogFamilyIndex(value: number | undefined): asserts value is number {
  assertFamilyIndex(value);
}

/** Exact original corner-bit construction, with product-grid directions only. */
export function buildSourceFogCornerMask(
  targetVisibility: Exclude<FogVisibility, "visible">,
  neighborVisibility: (neighbor: SourceFogNeighbor) => FogVisibility,
): number {
  let mask = 0;
  if (neighborVisibility("top") === targetVisibility) mask |= 0x3;
  if (neighborVisibility("bottom") === targetVisibility) mask |= 0xc;
  if (neighborVisibility("left") === targetVisibility) mask |= 0x5;
  if (neighborVisibility("right") === targetVisibility) mask |= 0xa;
  if (neighborVisibility("topLeft") === targetVisibility) mask |= 0x1;
  if (neighborVisibility("topRight") === targetVisibility) mask |= 0x2;
  if (neighborVisibility("bottomLeft") === targetVisibility) mask |= 0x4;
  if (neighborVisibility("bottomRight") === targetVisibility) mask |= 0x8;
  return mask;
}

export function reproduceSourceFogFrameIndices(selector: number): readonly number[] {
  if (!Number.isInteger(selector) || !SOURCE_FOG_SELECTOR_DOMAIN.has(selector)) {
    throw new RangeError(`source fog selector must be an integer in 0..13; received ${String(selector)}`);
  }
  return [2 * selector, 2 * selector + 1, 32 + 2 * selector, 33 + 2 * selector, 64 + 2 * selector, 65 + 2 * selector];
}

/** Product placement adapter for 64x48 composites, not source pivot parity. */
export function resolveSourceFogCompositeScale(mapTileWidth: number): number {
  if (!Number.isFinite(mapTileWidth) || mapTileWidth <= 0) {
    throw new RangeError(`source fog composite requires a positive finite map tile width; received ${String(mapTileWidth)}`);
  }
  return mapTileWidth / 64;
}

/** Marks the one-chunk halo required by the source renderer's eight-neighbor mask. */
export function expandSourceFogDirtyChunkMask(dirtyMask: Uint8Array, chunksPerRow: number, chunksPerColumn: number): number {
  if (!Number.isInteger(chunksPerRow) || chunksPerRow <= 0 || !Number.isInteger(chunksPerColumn) || chunksPerColumn <= 0) {
    throw new RangeError(`source fog chunk grid must be positive integers; received ${chunksPerRow}x${chunksPerColumn}`);
  }
  if (dirtyMask.length !== chunksPerRow * chunksPerColumn) {
    throw new Error(`source fog chunk mask requires ${chunksPerRow * chunksPerColumn} entries; received ${dirtyMask.length}`);
  }
  const originallyDirty = Array.from(dirtyMask.entries())
    .filter(([, dirty]) => dirty === 1)
    .map(([chunkIndex]) => chunkIndex);
  for (const chunkIndex of originallyDirty) {
    const chunkX = chunkIndex % chunksPerRow;
    const chunkY = Math.floor(chunkIndex / chunksPerRow);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const neighborX = chunkX + offsetX;
        const neighborY = chunkY + offsetY;
        if (neighborX < 0 || neighborX >= chunksPerRow || neighborY < 0 || neighborY >= chunksPerColumn) continue;
        dirtyMask[neighborY * chunksPerRow + neighborX] = 1;
      }
    }
  }
  return dirtyMask.reduce((count, dirty) => count + dirty, 0);
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

export function resolveSourceCommandIcon(
  actionId: ActionDefinitionId,
  profile?: SourceCommandIconProfile,
): SourceCommandIconBinding | undefined {
  return profile?.actionBindings[actionId];
}

export function requireSourceTexture(
  source: Pick<SourceFogComposite | SourceCommandIcon, "textureKey">,
  exists: (textureKey: string) => boolean,
): void {
  if (!exists(source.textureKey)) {
    throw new Error(`Required source-backed texture is not loaded: ${source.textureKey}`);
  }
}

function assertFamilyIndex(value: number | undefined): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 14) {
    throw new RangeError(`source fog family index must be an integer in 0..14; received ${String(value)}`);
  }
}
