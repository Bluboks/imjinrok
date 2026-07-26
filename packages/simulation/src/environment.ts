import type { DayPhase, EnvironmentPreset, MapDefinition, WeatherKind } from "../../shared/src/index.js";
import type { WorldState } from "./types.js";

export interface EnvironmentState {
  weather: WeatherKind;
  weatherOverride?: WeatherKind;
  weatherOverrideUntilTick?: number;
  timeOfDay01: number;
  dayPhase: DayPhase;
}

export function createInitialEnvironmentState(map: MapDefinition): EnvironmentState {
  return deriveEnvironmentState(map, 0);
}

export function updateEnvironment(state: WorldState): void {
  const nextEnvironment = deriveEnvironmentState(state.map, state.tick);

  if (state.environment.weatherOverrideUntilTick !== undefined && state.tick >= state.environment.weatherOverrideUntilTick) {
    delete state.environment.weatherOverride;
    delete state.environment.weatherOverrideUntilTick;
  }

  state.environment.weather = state.environment.weatherOverride ?? nextEnvironment.weather;
  state.environment.timeOfDay01 = nextEnvironment.timeOfDay01;
  state.environment.dayPhase = nextEnvironment.dayPhase;
}

export function getEnvironmentLightLevel(environment: EnvironmentState): number {
  return environment.dayPhase === "night" ? 0.5 : 1;
}

export function getEnvironmentSightMultiplier(environment: EnvironmentState, preset?: EnvironmentPreset): number {
  if (environment.dayPhase !== "night") {
    return 1;
  }

  const multiplier = preset?.dayNight?.nightSightMultiplier ?? 1;

  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}

function deriveEnvironmentState(map: MapDefinition, tick: number): EnvironmentState {
  const preset = map.environment;
  const weather = preset?.weather ?? "clear";

  const dayNight = preset?.dayNight;
  if (!dayNight || dayNight.cycleTicks <= 0) {
    return {
      weather,
      timeOfDay01: 0,
      dayPhase: "day",
    };
  }

  const cycleTick = tick % dayNight.cycleTicks;
  return {
    weather,
    timeOfDay01: cycleTick / dayNight.cycleTicks,
    dayPhase: isNightTick(cycleTick, dayNight.nightStartTick, dayNight.dayStartTick) ? "night" : "day",
  };
}

function isNightTick(cycleTick: number, nightStartTick: number, dayStartTick: number): boolean {
  if (nightStartTick === dayStartTick) {
    return false;
  }

  if (nightStartTick < dayStartTick) {
    return cycleTick >= nightStartTick && cycleTick < dayStartTick;
  }

  return cycleTick >= nightStartTick || cycleTick < dayStartTick;
}
