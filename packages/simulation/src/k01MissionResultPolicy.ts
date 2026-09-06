import { completeScenarioRuntime } from "./scenario.js";
import { SIM_TICK_SECONDS, SIM_TICKS_PER_SECOND } from "./constants.js";
import {
  advanceK01MissionResult,
  advanceK01MissionResultClock,
  cloneK01MissionResultState,
  patchK01MissionResultState,
  validateK01MissionResultState,
  type K01BeaconResult,
  type K01MissionResultState,
} from "./k01MissionResult.js";
import {
  advanceK01BeaconPolicy,
  evaluateK01GeneralPresence,
  evaluateK01HeroAlive,
} from "./k01BeaconPolicy.js";
import {
  validateK01SourceRuntimeState,
  K01_SOURCE_RUNTIME_PROFILE_ID,
  type K01SourceRuntimeState,
} from "./k01SourceRuntimeProfile.js";
import type { SourceRuntimeProfileEnvelope, WorldState } from "./types.js";

const HEADLESS_RESULT_CLOCK_ELAPSED_MS = SIM_TICK_SECONDS * 1000;
const K01_SCRIPT_SOURCE = "script/K0120";

export interface AdvanceK01MissionResultPolicyOptions {
  readonly k01ResultClockMilliseconds?: number;
  readonly k01ResultClockRemainder?: number;
  readonly rawGlobalTick?: number;
  readonly c06e34?: number;
  readonly forcedVictory?: number;
  readonly forcedDefeat?: number;
  readonly scriptLoaderResult?: 0 | 1;
  readonly scriptBusy?: boolean;
  readonly scriptPostState?: number;
}

export interface AdvanceK01MissionResultPolicyResult {
  readonly applied: boolean;
  readonly result: -1 | 0 | 1;
  readonly reason?: string;
}

/** Applies the one-time compatibility adaptation for legacy v4 snapshots. */
export function normalizeK01MissionResultStateForWorld(world: WorldState): void {
  const envelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(envelope)) {
    return;
  }

  const candidateState = envelope.state as Record<string, unknown>;
  const candidatePolicies = candidateState.policies;
  let candidateResult: unknown;
  if (candidatePolicies && typeof candidatePolicies === "object" && !Array.isArray(candidatePolicies)) {
    candidateResult = (candidatePolicies as Record<string, unknown>).result;
  }
  if (!candidateResult || typeof candidateResult !== "object" || (candidateResult as Record<string, unknown>).legacyMigrationPending !== true) {
    return;
  }

  validateK01SourceRuntimeState(envelope.state);
  const result = envelope.state.policies.result;

  const current = legacyTickToMilliseconds(world.tick);
  let lossTimer = result.lossTimer;
  if (lossTimer === 0) {
    const failedAtTicks = Object.values(world.scenario.objectives)
      .filter((objective) =>
        (objective.id === "protect-ryu-seong-ryong" || objective.id === "protect-gwon-yul") &&
        objective.status === "failed" &&
        objective.failedAtTick !== undefined,
      )
      .map((objective) => objective.failedAtTick as number);
    const earliestFailure = failedAtTicks.length > 0 ? Math.min(...failedAtTicks) : undefined;
    if (earliestFailure !== undefined) {
      lossTimer = legacyTickToMilliseconds(earliestFailure).clockMilliseconds;
    }
  }

  const nextResult = patchK01MissionResultState(result, {
    clockMilliseconds: current.clockMilliseconds,
    submillisecondRemainder: current.submillisecondRemainder,
    lossTimer,
    legacyMigrationPending: false,
  });
  const migratedEnvelope = withResultState(envelope, nextResult);
  const beacon = migratedEnvelope.state.policies.beacon;
  const shouldRestorePendingK0120 = world.scenario.status === "running" &&
    beacon.triggerFlag === 1 &&
    beacon.scriptPostState === 0;
  world.sourceRuntimeProfile = shouldRestorePendingK0120
    ? {
      ...migratedEnvelope,
      state: {
        ...migratedEnvelope.state,
        policies: {
          ...migratedEnvelope.state.policies,
          beacon: {
            ...beacon,
            scriptBusy: true,
            scriptPostState: 1,
          },
        },
      },
    }
    : migratedEnvelope;
}

/** Adds real elapsed time to the K01 result clock without applying a tick. */
export function advanceK01MissionResultClockElapsed(world: WorldState, elapsedMilliseconds: number): void {
  const envelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(envelope)) {
    return;
  }

  normalizeK01MissionResultStateForWorld(world);
  const currentEnvelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(currentEnvelope)) {
    return;
  }
  const nextResult = advanceK01MissionResultClock(currentEnvelope.state.policies.result, elapsedMilliseconds);
  world.sourceRuntimeProfile = withResultState(currentEnvelope, nextResult);
}

export function getK01MissionResultClockSample(
  world: WorldState,
): { readonly clockMilliseconds: number; readonly submillisecondRemainder: number } | undefined {
  const envelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(envelope)) {
    return undefined;
  }
  validateK01MissionResultState(envelope.state.policies.result);
  return {
    clockMilliseconds: envelope.state.policies.result.clockMilliseconds,
    submillisecondRemainder: envelope.state.policies.result.submillisecondRemainder,
  };
}

/**
 * Runs result gates before the rest of an accepted world tick. The callback
 * boundary keeps source beacon mutation in its existing policy module while
 * the pure kernel owns order, timer, and distinct-tick semantics.
 */
export function advanceK01MissionResultPolicy(
  world: WorldState,
  options: AdvanceK01MissionResultPolicyOptions = {},
): AdvanceK01MissionResultPolicyResult {
  if (world.scenario.status !== "running") {
    return { applied: false, result: 0, reason: "scenario-terminal" };
  }

  const envelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(envelope)) {
    return { applied: false, result: 0 };
  }

  normalizeK01MissionResultStateForWorld(world);
  const currentEnvelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(currentEnvelope)) {
    return { applied: false, result: 0 };
  }

  let resultState = cloneK01MissionResultState(currentEnvelope.state.policies.result);
  if (options.k01ResultClockMilliseconds !== undefined) {
    assertDword(options.k01ResultClockMilliseconds, "K01 absolute result clock");
    const remainder = options.k01ResultClockRemainder ?? (
      options.k01ResultClockMilliseconds === resultState.clockMilliseconds
        ? resultState.submillisecondRemainder
        : 0
    );
    if (!Number.isFinite(remainder) || remainder < 0 || remainder >= 1) {
      throw new RangeError("K01 absolute result clock remainder must be finite in [0, 1).");
    }
    resultState = patchK01MissionResultState(resultState, {
      clockMilliseconds: options.k01ResultClockMilliseconds,
      submillisecondRemainder: remainder,
    });
  } else {
    resultState = advanceHeadlessResultClock(resultState);
  }

  const rawGlobalTick = options.rawGlobalTick ?? ((world.tick + 1) >>> 0);
  assertDword(rawGlobalTick, "K01 raw global tick");
  const sourceBeforeCallbacks = currentEnvelope.state;
  const result = advanceK01MissionResult({
    state: resultState,
    rawTick: rawGlobalTick,
    ...(options.c06e34 !== undefined ? { c06e34: options.c06e34 } : {}),
    ...(options.forcedVictory !== undefined ? { forcedVictory: options.forcedVictory } : {}),
    ...(options.forcedDefeat !== undefined ? { forcedDefeat: options.forcedDefeat } : {}),
    generalPresent: () => evaluateK01GeneralPresence(world, sourceBeforeCallbacks),
    runBeacon: (): K01BeaconResult => {
      const beaconResult = advanceK01BeaconPolicy(world, {
        ...(options.scriptLoaderResult !== undefined ? { scriptLoaderResult: options.scriptLoaderResult } : {}),
        ...(options.scriptBusy !== undefined ? { scriptBusy: options.scriptBusy } : {}),
        ...(options.scriptPostState !== undefined ? { scriptPostState: options.scriptPostState } : {}),
      });
      const beacon = beaconResult.state?.policies.beacon;
      if (!beacon) {
        return 0;
      }
      return {
        triggerFlag: beacon.triggerFlag,
        scriptPostState: beacon.scriptPostState,
        lastReturnValue: beacon.lastReturnValue,
      };
    },
    heroAlive: (originalClass) => {
      const latestEnvelope = world.sourceRuntimeProfile;
      return isK01Envelope(latestEnvelope) && evaluateK01HeroAlive(world, latestEnvelope.state, originalClass);
    },
  });

  const finalEnvelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(finalEnvelope)) {
    throw new Error("K01 beacon callback removed the source runtime profile envelope.");
  }
  world.sourceRuntimeProfile = withResultState(finalEnvelope, result.state);

  if (result.result !== 0) {
    completeScenarioRuntime(world, result.result === 1 ? "victory" : "defeat");
  }

  return {
    applied: true,
    result: result.result,
    reason: result.reason,
  };
}

/** Completes only the running K0120 source script and clears both raw flags. */
export function completeK01MissionScript(world: WorldState, sourceScript: string): boolean {
  if (world.scenario.status !== "running") {
    return false;
  }
  const envelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(envelope) || sourceScript !== K01_SCRIPT_SOURCE) {
    return false;
  }

  normalizeK01MissionResultStateForWorld(world);
  const currentEnvelope = world.sourceRuntimeProfile;
  if (!isK01Envelope(currentEnvelope)) {
    return false;
  }
  const beacon = currentEnvelope.state.policies.beacon;
  if (beacon.triggerFlag !== 1 || beacon.scriptBusy !== true || beacon.scriptPostState !== 1) {
    return false;
  }

  const nextBeacon = {
    ...beacon,
    scriptBusy: false,
    scriptPostState: 0,
    lastReturnValue: null,
  };
  world.sourceRuntimeProfile = {
    ...currentEnvelope,
    state: {
      ...currentEnvelope.state,
      policies: {
        ...currentEnvelope.state.policies,
        beacon: nextBeacon,
      },
    },
  };
  return true;
}

function legacyTickToMilliseconds(tick: number): Pick<K01MissionResultState, "clockMilliseconds" | "submillisecondRemainder"> {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError("legacy world tick must be a non-negative safe integer");
  }
  const wholeSeconds = Math.floor(tick / SIM_TICKS_PER_SECOND);
  const remainderTicks = tick % SIM_TICKS_PER_SECOND;
  const remainderMillisecondsNumerator = remainderTicks * 1000;
  const wholeMilliseconds = (wholeSeconds % 0x1_0000_000) * 1000 +
    Math.floor(remainderMillisecondsNumerator / SIM_TICKS_PER_SECOND);
  return {
    clockMilliseconds: (1 + wholeMilliseconds) >>> 0,
    submillisecondRemainder: (remainderMillisecondsNumerator % SIM_TICKS_PER_SECOND) / SIM_TICKS_PER_SECOND,
  };
}

function advanceHeadlessResultClock(state: K01MissionResultState): K01MissionResultState {
  const total = state.submillisecondRemainder + HEADLESS_RESULT_CLOCK_ELAPSED_MS;
  const nearestWhole = Math.round(total);
  // Normalize the repeatable 24 Hz floating-point residue at exact millisecond boundaries.
  const roundedToWhole = Math.abs(total - nearestWhole) < 1e-9;
  const wholeMilliseconds = roundedToWhole ? nearestWhole : Math.floor(total);
  return patchK01MissionResultState(state, {
    clockMilliseconds: (state.clockMilliseconds + wholeMilliseconds) >>> 0,
    submillisecondRemainder: roundedToWhole ? 0 : total - wholeMilliseconds,
  });
}

function withResultState(
  envelope: SourceRuntimeProfileEnvelope & { readonly state: K01SourceRuntimeState },
  result: K01MissionResultState,
): SourceRuntimeProfileEnvelope & { readonly state: K01SourceRuntimeState } {
  return {
    ...envelope,
    state: {
      ...envelope.state,
      policies: {
        ...envelope.state.policies,
        result,
      },
    },
  };
}

function isK01Envelope(envelope: SourceRuntimeProfileEnvelope | undefined): envelope is SourceRuntimeProfileEnvelope & { readonly state: K01SourceRuntimeState } {
  return envelope?.profileId === K01_SOURCE_RUNTIME_PROFILE_ID;
}

function assertDword(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be an unsigned DWORD.`);
  }
}
