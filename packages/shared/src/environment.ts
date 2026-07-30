export type WeatherKind = "clear" | "rain";

export type DayPhase = "dawn" | "day" | "dusk" | "night";

export interface DayNightLightKeyframe {
  /** Fixed tick within the cycle. The curve interpolates to the next keyframe. */
  tick: number;
  phase: DayPhase;
  lightLevel01: number;
}

/** A deterministic, renderer-facing palette selection at a fixed cycle tick. */
export interface DayNightVisualStep {
  tick: number;
  /** Stable palette identity owned by the map's environment visual profile. */
  paletteId: string;
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
  /**
   * Optional stepped visual selection. This does not change the legacy light
   * curve or imply a renderer-equivalent palette implementation.
   */
  visualSteps?: readonly DayNightVisualStep[];
}

export interface DayNightValidationIssue {
  path: string;
  message: string;
}

export function validateDayNightCycle(dayNight: DayNightCycleDefinition): DayNightValidationIssue[] {
  const issues: DayNightValidationIssue[] = [];
  const cycleTicksValid = Number.isInteger(dayNight.cycleTicks) && dayNight.cycleTicks > 0;

  if (!cycleTicksValid) {
    issues.push({ path: "cycleTicks", message: "Cycle ticks must be a positive integer." });
  }

  validateCycleTick(dayNight.dayStartTick, "dayStartTick", "Day start", dayNight.cycleTicks, cycleTicksValid, issues);
  validateCycleTick(dayNight.nightStartTick, "nightStartTick", "Night start", dayNight.cycleTicks, cycleTicksValid, issues);

  if (dayNight.nightSightMultiplier !== undefined && (!Number.isFinite(dayNight.nightSightMultiplier) || dayNight.nightSightMultiplier < 0)) {
    issues.push({ path: "nightSightMultiplier", message: "Night sight multiplier must be a non-negative finite number." });
  }

  const curve = dayNight.lightCurve;
  if (curve !== undefined) {
    if (!Array.isArray(curve)) {
      issues.push({ path: "lightCurve", message: "Light curve must be an array of keyframes." });
    } else {
      if (curve.length < 2) {
        issues.push({ path: "lightCurve", message: "Light curve must contain at least two keyframes." });
      }

      const knownTicks = new Set<number>();
      curve.forEach((keyframe, index) => {
        const path = `lightCurve[${index}]`;
        validateSteppedTick(keyframe.tick, `${path}.tick`, "Keyframe", dayNight.cycleTicks, cycleTicksValid, knownTicks, issues);

        if (!isDayPhase(keyframe.phase)) {
          issues.push({ path: `${path}.phase`, message: "Keyframe phase must be dawn, day, dusk, or night." });
        }
        if (!Number.isFinite(keyframe.lightLevel01) || keyframe.lightLevel01 < 0 || keyframe.lightLevel01 > 1) {
          issues.push({ path: `${path}.lightLevel01`, message: "Keyframe light level must be a finite number from 0 through 1." });
        }
      });
    }
  }

  const visualSteps = dayNight.visualSteps;
  if (visualSteps !== undefined) {
    if (!Array.isArray(visualSteps) || visualSteps.length === 0) {
      issues.push({ path: "visualSteps", message: "Visual steps must be a non-empty array." });
    } else {
      const knownTicks = new Set<number>();
      visualSteps.forEach((step, index) => {
        const path = `visualSteps[${index}]`;
        validateSteppedTick(step.tick, `${path}.tick`, "Visual step", dayNight.cycleTicks, cycleTicksValid, knownTicks, issues);
        if (!step.paletteId.trim()) {
          issues.push({ path: `${path}.paletteId`, message: "Visual step palette id is required." });
        }
      });
    }
  }

  return issues;
}

function validateSteppedTick(
  tick: number,
  path: string,
  label: string,
  cycleTicks: number,
  cycleTicksValid: boolean,
  knownTicks: Set<number>,
  issues: DayNightValidationIssue[],
): void {
  const tickValid = Number.isInteger(tick) && cycleTicksValid && tick >= 0 && tick < cycleTicks;
  if (!tickValid) {
    issues.push({ path, message: `${label} tick must be an integer within the cycle.` });
  } else if (knownTicks.has(tick)) {
    issues.push({ path, message: `Duplicate ${label.toLowerCase()} tick '${tick}'.` });
  } else {
    knownTicks.add(tick);
  }
}

export function assertValidDayNightCycle(dayNight: DayNightCycleDefinition): void {
  const issues = validateDayNightCycle(dayNight);

  if (issues.length > 0) {
    throw new Error(`Invalid day/night cycle: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join(" ")}`);
  }
}

export interface RainEnvironmentDefinition {
  fireDamageMultiplier?: number;
}

export interface EnvironmentPreset {
  dayNight?: DayNightCycleDefinition;
  weather?: WeatherKind;
  rain?: RainEnvironmentDefinition;
}

function validateCycleTick(
  tick: number,
  path: "dayStartTick" | "nightStartTick",
  label: string,
  cycleTicks: number,
  cycleTicksValid: boolean,
  issues: DayNightValidationIssue[],
): void {
  if (!Number.isInteger(tick) || !cycleTicksValid || tick < 0 || tick >= cycleTicks) {
    issues.push({ path, message: `${label} tick must be an integer within the cycle.` });
  }
}

function isDayPhase(value: string): value is DayPhase {
  return value === "dawn" || value === "day" || value === "dusk" || value === "night";
}
