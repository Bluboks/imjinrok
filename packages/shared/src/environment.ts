export type WeatherKind = "clear" | "rain";

export type DayPhase = "day" | "night";

export interface DayNightCycleDefinition {
  cycleTicks: number;
  nightStartTick: number;
  dayStartTick: number;
  nightSightMultiplier?: number;
}

export interface RainEnvironmentDefinition {
  fireDamageMultiplier?: number;
}

export interface EnvironmentPreset {
  dayNight?: DayNightCycleDefinition;
  weather?: WeatherKind;
  rain?: RainEnvironmentDefinition;
}
