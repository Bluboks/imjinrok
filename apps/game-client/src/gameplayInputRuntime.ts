import {
  gameSpeedPresetToPlaybackMultiplier,
  stepGameSpeedPreset,
  type GameplayPreferences,
} from "./gameplayPreferences.js";

export interface GameplayRuntimeSpeed {
  preferences: GameplayPreferences;
  playbackSpeed: number;
}

export function createGameplayRuntimeSpeed(preferences: GameplayPreferences): GameplayRuntimeSpeed {
  return {
    preferences: { ...preferences },
    playbackSpeed: gameSpeedPresetToPlaybackMultiplier(preferences.gameSpeed),
  };
}

export function stepGameplayRuntimeSpeed(
  preferences: GameplayPreferences,
  direction: -1 | 1,
): GameplayRuntimeSpeed {
  return createGameplayRuntimeSpeed({
    ...preferences,
    gameSpeed: stepGameSpeedPreset(preferences.gameSpeed, direction),
  });
}
