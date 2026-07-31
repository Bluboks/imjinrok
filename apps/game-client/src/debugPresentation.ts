/**
 * Project-only inspector presentation.  None of these switches participate in
 * simulation, command admission, or authoritative player visibility.
 */
export interface DebugPresentationState {
  collapsed: boolean;
  entityBounds: boolean;
  terrainWireframe: boolean;
  tileMetadata: boolean;
  fogEnabled: boolean;
}

export type DebugPresentationToggle = Exclude<keyof DebugPresentationState, "collapsed">;

export const DEBUG_PRESENTATION_STORAGE_KEY = "isorts.debug.presentation.v1";

export const DEFAULT_DEBUG_PRESENTATION_STATE: Readonly<DebugPresentationState> = Object.freeze({
  collapsed: true,
  entityBounds: false,
  terrainWireframe: false,
  tileMetadata: false,
  fogEnabled: true,
});

export interface DebugPresentationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readDebugPresentationState(storage: DebugPresentationStorage | null | undefined): DebugPresentationState {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(DEBUG_PRESENTATION_STORAGE_KEY) ?? "null");
    if (!isStateRecord(parsed)) return { ...DEFAULT_DEBUG_PRESENTATION_STATE };
    return {
      collapsed: readBoolean(parsed, "collapsed", DEFAULT_DEBUG_PRESENTATION_STATE.collapsed),
      entityBounds: readBoolean(parsed, "entityBounds", DEFAULT_DEBUG_PRESENTATION_STATE.entityBounds),
      terrainWireframe: readBoolean(parsed, "terrainWireframe", DEFAULT_DEBUG_PRESENTATION_STATE.terrainWireframe),
      tileMetadata: readBoolean(parsed, "tileMetadata", DEFAULT_DEBUG_PRESENTATION_STATE.tileMetadata),
      fogEnabled: readBoolean(parsed, "fogEnabled", DEFAULT_DEBUG_PRESENTATION_STATE.fogEnabled),
    };
  } catch {
    console.warn("Debug presentation preferences could not be read; using defaults.");
    return { ...DEFAULT_DEBUG_PRESENTATION_STATE };
  }
}

export function writeDebugPresentationState(storage: DebugPresentationStorage | null | undefined, state: DebugPresentationState): void {
  try {
    storage?.setItem(DEBUG_PRESENTATION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    console.warn("Debug presentation preferences could not be saved.");
  }
}

export function toggleDebugPresentation(state: DebugPresentationState, key: DebugPresentationToggle): DebugPresentationState {
  return { ...state, [key]: !state[key] };
}

export function setDebugPresentationCollapsed(state: DebugPresentationState, collapsed: boolean): DebugPresentationState {
  return { ...state, collapsed };
}

/** Presentation reveal deliberately never alters the authority visibility data. */
export function shouldRevealDebugPresentationFog(state: DebugPresentationState): boolean {
  return !state.fogEnabled;
}

/** Chooses a draw value without mutating the supplied authoritative value. */
export function resolveDebugPresentationVisibility<T>(state: DebugPresentationState, authoritative: T, visible: T): T {
  return shouldRevealDebugPresentationFog(state) ? visible : authoritative;
}

export interface GridViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function clampGridViewportBounds(bounds: GridViewportBounds, width: number, height: number): GridViewportBounds | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  const minX = Math.max(0, Math.floor(bounds.minX));
  const minY = Math.max(0, Math.floor(bounds.minY));
  const maxX = Math.min(width - 1, Math.ceil(bounds.maxX));
  const maxY = Math.min(height - 1, Math.ceil(bounds.maxY));
  return minX <= maxX && minY <= maxY ? { minX, maxX, minY, maxY } : null;
}

function isStateRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBoolean(record: Record<string, unknown>, key: keyof DebugPresentationState, fallback: boolean): boolean {
  return typeof record[key] === "boolean" ? record[key] : fallback;
}
