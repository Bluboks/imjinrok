export const GAMEPLAY_PREFERENCES_STORAGE_KEY = "isorts.gameplay.preferences.v1";

export const GAME_SPEED_PRESETS = ["slowest", "slow", "normal", "fast", "fastest"] as const;

export type GameSpeedPreset = (typeof GAME_SPEED_PRESETS)[number];
export type MouseControlMode = "one-button" | "two-button";

export interface GameplayPreferences {
  version: 1;
  gameSpeed: GameSpeedPreset;
  mouseControlMode: MouseControlMode;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_GAMEPLAY_PREFERENCES: GameplayPreferences = Object.freeze({
  version: 1,
  gameSpeed: "normal",
  mouseControlMode: "two-button",
});

const SOURCE_BASE_INTERVAL_MS = 50;
const SOURCE_INTERVALS_BY_STATE = [64, 60, 50, 40, 30] as const;

export function parseGameplayPreferences(serialized: string | null | undefined): GameplayPreferences {
  if (!serialized) return { ...DEFAULT_GAMEPLAY_PREFERENCES };

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isGameplayPreferences(parsed)) return { ...DEFAULT_GAMEPLAY_PREFERENCES };
    return { ...parsed };
  } catch {
    return { ...DEFAULT_GAMEPLAY_PREFERENCES };
  }
}

export function readGameplayPreferences(storage: PreferenceStorage | null | undefined = getBrowserStorage()): GameplayPreferences {
  if (!storage) return { ...DEFAULT_GAMEPLAY_PREFERENCES };

  try {
    return parseGameplayPreferences(storage.getItem(GAMEPLAY_PREFERENCES_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_GAMEPLAY_PREFERENCES };
  }
}

export function writeGameplayPreferences(
  preferences: GameplayPreferences,
  storage: PreferenceStorage | null | undefined = getBrowserStorage(),
): boolean {
  if (!isGameplayPreferences(preferences) || !storage) return false;

  try {
    storage.setItem(GAMEPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function gameSpeedPresetToSourceState(preset: GameSpeedPreset): number {
  const index = GAME_SPEED_PRESETS.indexOf(preset);
  if (index < 0) throw new RangeError(`Unknown game speed preset: ${String(preset)}`);
  return index;
}

export function sourceStateToGameSpeedPreset(sourceState: number): GameSpeedPreset {
  assertInteger(sourceState, "sourceState");
  return GAME_SPEED_PRESETS[sourceState] ?? "fastest";
}

export function sourceStateToIntervalMs(sourceState: number): number {
  assertInteger(sourceState, "sourceState");
  return SOURCE_INTERVALS_BY_STATE[sourceState] ?? SOURCE_INTERVALS_BY_STATE[4];
}

export function gameSpeedPresetToIntervalMs(preset: GameSpeedPreset): number {
  return sourceStateToIntervalMs(gameSpeedPresetToSourceState(preset));
}

export function gameSpeedPresetToPlaybackMultiplier(preset: GameSpeedPreset): number {
  return SOURCE_BASE_INTERVAL_MS / gameSpeedPresetToIntervalMs(preset);
}

export function stepGameSpeedPreset(preset: GameSpeedPreset, direction: -1 | 1): GameSpeedPreset {
  const currentIndex = gameSpeedPresetToSourceState(preset);
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), GAME_SPEED_PRESETS.length - 1);
  return GAME_SPEED_PRESETS[nextIndex] ?? "normal";
}

export function cycleMouseControlMode(mode: MouseControlMode): MouseControlMode {
  return mode === "one-button" ? "two-button" : "one-button";
}

function isGameplayPreferences(value: unknown): value is GameplayPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameplayPreferences>;
  return candidate.version === 1 &&
    GAME_SPEED_PRESETS.includes(candidate.gameSpeed as GameSpeedPreset) &&
    (candidate.mouseControlMode === "one-button" || candidate.mouseControlMode === "two-button");
}

function getBrowserStorage(): PreferenceStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
}
