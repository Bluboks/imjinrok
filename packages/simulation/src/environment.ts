import { assertValidDayNightCycle, type DayPhase, type EnvironmentPreset, type MapDefinition, type WeatherKind } from "../../shared/src/index.js";
import type { WorldState } from "./types.js";

export interface EnvironmentState {
  weather: WeatherKind;
  weatherOverride?: WeatherKind;
  weatherOverrideUntilTick?: number;
  timeOfDay01: number;
  dayPhase: DayPhase;
  /** Present only for maps that opt into a light curve. */
  lightLevel01?: number;
  /** Stable renderer-facing identity selected from an opt-in visual schedule. */
  visualPaletteId?: string;
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
  if (nextEnvironment.lightLevel01 === undefined) {
    delete state.environment.lightLevel01;
  } else {
    state.environment.lightLevel01 = nextEnvironment.lightLevel01;
  }
  if (nextEnvironment.visualPaletteId === undefined) {
    delete state.environment.visualPaletteId;
  } else {
    state.environment.visualPaletteId = nextEnvironment.visualPaletteId;
  }
}

export function getEnvironmentLightLevel(environment: EnvironmentState): number {
  return environment.lightLevel01 ?? (environment.dayPhase === "night" ? 0.5 : 1);
}

export function getEnvironmentSightMultiplier(environment: EnvironmentState, preset?: EnvironmentPreset): number {
  if (environment.lightLevel01 === undefined && environment.dayPhase !== "night") {
    return 1;
  }

  const multiplier = preset?.dayNight?.nightSightMultiplier ?? 1;
  const normalizedMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;

  if (environment.lightLevel01 !== undefined) {
    return 1 - ((1 - clamp01(environment.lightLevel01)) * (1 - normalizedMultiplier));
  }

  return normalizedMultiplier;
}

function deriveEnvironmentState(map: MapDefinition, tick: number): EnvironmentState {
  const preset = map.environment;
  const weather = preset?.weather ?? "clear";

  const dayNight = preset?.dayNight;
  if (!dayNight) {
    return {
      weather,
      timeOfDay01: 0,
      dayPhase: "day",
    };
  }

  assertValidDayNightCycle(dayNight);

  const cycleTick = tick % dayNight.cycleTicks;
  const lightCurveState = deriveLightCurveState(cycleTick, dayNight);
  const visualPaletteId = deriveVisualPaletteId(cycleTick, dayNight);

  return {
    weather,
    timeOfDay01: cycleTick / dayNight.cycleTicks,
    dayPhase: lightCurveState?.dayPhase ?? (isNightTick(cycleTick, dayNight.nightStartTick, dayNight.dayStartTick) ? "night" : "day"),
    ...(lightCurveState ? { lightLevel01: lightCurveState.lightLevel01 } : {}),
    ...(visualPaletteId ? { visualPaletteId } : {}),
  };
}

function deriveVisualPaletteId(cycleTick: number, dayNight: EnvironmentPreset["dayNight"]): string | null {
  const steps = dayNight?.visualSteps;
  if (!steps || steps.length === 0) {
    return null;
  }
  const ordered = [...steps].sort((left, right) => left.tick - right.tick);
  const selected = ordered.reduce<typeof ordered[number] | null>((current, step) => step.tick <= cycleTick ? step : current, null)
    ?? ordered[ordered.length - 1];
  return selected?.paletteId ?? null;
}

function deriveLightCurveState(cycleTick: number, dayNight: EnvironmentPreset["dayNight"]): Pick<EnvironmentState, "dayPhase" | "lightLevel01"> | null {
  const curve = dayNight?.lightCurve;

  if (!curve) {
    return null;
  }

  const ordered = [...curve].sort((a, b) => a.tick - b.tick);
  let previousIndex = -1;
  for (let index = 0; index < ordered.length; index += 1) {
    const candidate = ordered[index];
    if (candidate && candidate.tick <= cycleTick) {
      previousIndex = index;
    }
  }
  const leftIndex = previousIndex === -1 ? ordered.length - 1 : previousIndex;
  const left = ordered[leftIndex];
  const right = ordered[(leftIndex + 1) % ordered.length];

  if (!left || !right) {
    return null;
  }

  const rightTick = right.tick > left.tick ? right.tick : right.tick + dayNight.cycleTicks;
  const currentTick = cycleTick < left.tick ? cycleTick + dayNight.cycleTicks : cycleTick;
  const duration = rightTick - left.tick;
  const progress = duration === 0 ? 0 : (currentTick - left.tick) / duration;

  return {
    dayPhase: left.phase,
    lightLevel01: clamp01(left.lightLevel01 + ((right.lightLevel01 - left.lightLevel01) * progress)),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
