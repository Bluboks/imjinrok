export type WeatherKind = "clear" | "rain";

export type DayPhase = "dawn" | "day" | "dusk" | "night";

export interface DayNightLightKeyframe {
  /** Fixed tick within the cycle. The curve interpolates to the next keyframe. */
  tick: number;
  phase: DayPhase;
  lightLevel01: number;
}

export interface DayNightCycleDefinition {
  cycleTicks: number;
  nightStartTick: number;
  dayStartTick: number;
  nightSightMultiplier?: number;
  /**
   * Optional project-authored curve. Omitting it preserves the legacy binary
   * day/night state and deliberately makes no claim about original timing.
   */
  lightCurve?: readonly DayNightLightKeyframe[];
}

export interface RainEnvironmentDefinition {
  fireDamageMultiplier?: number;
}

export interface EnvironmentPreset {
  dayNight?: DayNightCycleDefinition;
  weather?: WeatherKind;
  rain?: RainEnvironmentDefinition;
}
