import type { K01BeaconPolicyState } from "./k01BeaconPolicyState.js";

export const K01_MISSION_RESULT_POLICY_STATE_VERSION = 1;
export const K01_MISSION_RESULT_CLOCK_EPOCH_MILLISECONDS = 1;
export const K01_MISSION_RESULT_TIMER_THRESHOLD_MILLISECONDS = 2000;

export interface K01MissionResultState {
  readonly policyVersion: typeof K01_MISSION_RESULT_POLICY_STATE_VERSION;
  readonly clockMilliseconds: number;
  readonly submillisecondRemainder: number;
  readonly winTimer: number;
  readonly lossTimer: number;
  readonly cachedRawTick: number | null;
  readonly maturedFlag: 0 | 1;
  readonly legacyMigrationPending: boolean;
}

export interface K01MissionResultStatePatch {
  readonly clockMilliseconds?: number;
  readonly submillisecondRemainder?: number;
  readonly winTimer?: number;
  readonly lossTimer?: number;
  readonly cachedRawTick?: number | null;
  readonly maturedFlag?: 0 | 1;
  readonly legacyMigrationPending?: boolean;
}

export interface K01MissionTimerResolution {
  readonly result: -1 | 0 | 1;
  readonly winningTimer: "win" | "loss" | undefined;
}

export type K01BeaconResult =
  | 0
  | 1
  | Pick<K01BeaconPolicyState, "triggerFlag" | "scriptPostState"> & {
      readonly lastReturnValue?: 0 | 1 | null;
    };

export interface AdvanceK01MissionResultInput {
  readonly state: K01MissionResultState;
  readonly rawTick: number;
  readonly c06e34?: number;
  readonly forcedVictory?: number;
  readonly forcedDefeat?: number;
  readonly generalPresent: () => boolean;
  readonly runBeacon: () => K01BeaconResult;
  readonly heroAlive: (originalClass: 76 | 78) => boolean;
}

export interface AdvanceK01MissionResultOutput {
  readonly state: K01MissionResultState;
  readonly result: -1 | 0 | 1;
  readonly skipped: boolean;
  readonly reason:
    | "same-raw-tick"
    | "source-gate"
    | "forced-victory"
    | "forced-defeat"
    | "matured-timer"
    | "beacon-direct-victory"
    | "running";
  readonly timerResolution: K01MissionTimerResolution;
}

export function createK01MissionResultState(
  overrides: Partial<K01MissionResultState> = {},
): K01MissionResultState {
  const state: K01MissionResultState = {
    policyVersion: K01_MISSION_RESULT_POLICY_STATE_VERSION,
    clockMilliseconds: K01_MISSION_RESULT_CLOCK_EPOCH_MILLISECONDS,
    submillisecondRemainder: 0,
    winTimer: 0,
    lossTimer: 0,
    cachedRawTick: null,
    maturedFlag: 0,
    legacyMigrationPending: false,
    ...overrides,
  };
  validateK01MissionResultState(state);
  return state;
}

export function cloneK01MissionResultState(value: unknown): K01MissionResultState {
  validateK01MissionResultState(value);
  const state = value as K01MissionResultState;
  return { ...state };
}

export function validateK01MissionResultState(value: unknown): asserts value is K01MissionResultState {
  assertPlainRecord(value, "K01 mission result state");
  assertExactKeys(value, [
    "policyVersion",
    "clockMilliseconds",
    "submillisecondRemainder",
    "winTimer",
    "lossTimer",
    "cachedRawTick",
    "maturedFlag",
    "legacyMigrationPending",
  ], "K01 mission result state");
  if (value.policyVersion !== K01_MISSION_RESULT_POLICY_STATE_VERSION) {
    throw new RangeError(`K01 mission result policy version must be ${K01_MISSION_RESULT_POLICY_STATE_VERSION}.`);
  }
  assertDword(value.clockMilliseconds, "K01 result clockMilliseconds");
  if (typeof value.submillisecondRemainder !== "number" || !Number.isFinite(value.submillisecondRemainder) || value.submillisecondRemainder < 0 || value.submillisecondRemainder >= 1) {
    throw new RangeError("K01 result submillisecondRemainder must be finite in [0, 1).");
  }
  assertDword(value.winTimer, "K01 result winTimer");
  assertDword(value.lossTimer, "K01 result lossTimer");
  if (value.cachedRawTick !== null) {
    assertDword(value.cachedRawTick, "K01 result cachedRawTick");
  }
  if (value.maturedFlag !== 0 && value.maturedFlag !== 1) {
    throw new RangeError("K01 result maturedFlag must be 0 or 1.");
  }
  if (typeof value.legacyMigrationPending !== "boolean") {
    throw new TypeError("K01 result legacyMigrationPending must be a boolean.");
  }
}

export function patchK01MissionResultState(
  state: K01MissionResultState,
  patch: K01MissionResultStatePatch,
): K01MissionResultState {
  validateK01MissionResultState(state);
  assertPlainRecord(patch, "K01 mission result state patch");
  assertAllowedKeys(patch, [
    "clockMilliseconds",
    "submillisecondRemainder",
    "winTimer",
    "lossTimer",
    "cachedRawTick",
    "maturedFlag",
    "legacyMigrationPending",
  ], "K01 mission result state patch");
  const next = { ...state, ...patch };
  validateK01MissionResultState(next);
  return next;
}

export function advanceK01MissionResultClock(
  state: K01MissionResultState,
  elapsedMilliseconds: number,
): K01MissionResultState {
  validateK01MissionResultState(state);
  if (!Number.isFinite(elapsedMilliseconds)) {
    throw new RangeError("K01 result elapsed milliseconds must be finite.");
  }

  const elapsed = Math.max(0, elapsedMilliseconds);
  const total = state.submillisecondRemainder + elapsed;
  const wholeMilliseconds = Math.floor(total);
  const nextClock = (state.clockMilliseconds + wholeMilliseconds) >>> 0;
  return patchK01MissionResultState(state, {
    clockMilliseconds: nextClock,
    submillisecondRemainder: total - wholeMilliseconds,
  });
}

export function resolveK01MissionTimers({
  clockMilliseconds,
  winTimer,
  lossTimer,
}: Pick<K01MissionResultState, "clockMilliseconds" | "winTimer" | "lossTimer">): K01MissionTimerResolution {
  assertDword(clockMilliseconds, "K01 result clockMilliseconds");
  assertDword(winTimer, "K01 result winTimer");
  assertDword(lossTimer, "K01 result lossTimer");

  if (winTimer !== 0 && isStrictlyMature(clockMilliseconds, winTimer)) {
    return { result: 1, winningTimer: "win" };
  }
  if (lossTimer !== 0 && isStrictlyMature(clockMilliseconds, lossTimer)) {
    return { result: -1, winningTimer: "loss" };
  }
  return { result: 0, winningTimer: undefined };
}

export function advanceK01MissionResult(
  input: AdvanceK01MissionResultInput,
): AdvanceK01MissionResultOutput {
  validateK01MissionResultState(input.state);
  assertDword(input.rawTick, "K01 raw tick");
  const c06e34 = validateGate(input.c06e34 ?? 0, "c06e34");
  const forcedVictory = validateGate(input.forcedVictory ?? 0, "forced victory");
  const forcedDefeat = validateGate(input.forcedDefeat ?? 0, "forced defeat");
  if (typeof input.generalPresent !== "function" || typeof input.runBeacon !== "function" || typeof input.heroAlive !== "function") {
    throw new TypeError("K01 result callbacks must be functions.");
  }

  if (input.state.cachedRawTick !== null && input.state.cachedRawTick === input.rawTick) {
    return output(input.state, 0, true, "same-raw-tick", { result: 0, winningTimer: undefined });
  }

  const cached = patchK01MissionResultState(input.state, { cachedRawTick: input.rawTick });
  if (c06e34 === 1) {
    return output(cached, 0, true, "source-gate", { result: 0, winningTimer: undefined });
  }
  if (forcedVictory === 1) {
    return output(cached, 1, false, "forced-victory", { result: 1, winningTimer: undefined });
  }
  if (forcedDefeat === 1) {
    return output(cached, -1, false, "forced-defeat", { result: -1, winningTimer: undefined });
  }

  const timerResolution = resolveK01MissionTimers(cached);
  if (timerResolution.result !== 0) {
    return output(
      patchK01MissionResultState(cached, { maturedFlag: 1 }),
      timerResolution.result,
      false,
      "matured-timer",
      timerResolution,
    );
  }

  let next = cached;
  if (!input.generalPresent() && next.lossTimer === 0) {
    next = patchK01MissionResultState(next, { lossTimer: next.clockMilliseconds });
  }

  const beacon = input.runBeacon();
  if (isBeaconDirectVictory(beacon)) {
    return output(next, 1, false, "beacon-direct-victory", { result: 1, winningTimer: undefined });
  }

  if (!input.heroAlive(76) && next.lossTimer === 0) {
    next = patchK01MissionResultState(next, { lossTimer: next.clockMilliseconds });
  }
  if (!input.heroAlive(78) && next.lossTimer === 0) {
    next = patchK01MissionResultState(next, { lossTimer: next.clockMilliseconds });
  }

  return output(next, 0, false, "running", { result: 0, winningTimer: undefined });
}

function isBeaconDirectVictory(beacon: K01BeaconResult): boolean {
  if (beacon === 1) {
    return true;
  }
  return beacon !== 0 && beacon.triggerFlag === 1 && beacon.scriptPostState === 0;
}

function isStrictlyMature(clockMilliseconds: number, timer: number): boolean {
  const delta = (clockMilliseconds - timer) >>> 0;
  const signedDelta = delta | 0;
  const signedAbsolute = signedDelta === -0x80000000 ? -0x80000000 : Math.abs(signedDelta);
  return signedAbsolute > K01_MISSION_RESULT_TIMER_THRESHOLD_MILLISECONDS;
}

function output(
  state: K01MissionResultState,
  result: -1 | 0 | 1,
  skipped: boolean,
  reason: AdvanceK01MissionResultOutput["reason"],
  timerResolution: K01MissionTimerResolution,
): AdvanceK01MissionResultOutput {
  return { state, result, skipped, reason, timerResolution };
}

function validateGate(value: number, label: string): 0 | 1 {
  assertDword(value, `K01 ${label}`);
  return value === 1 ? 1 : 0;
}

function assertDword(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be an unsigned DWORD.`);
  }
}

function assertPlainRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new TypeError(`${label} has unsupported or missing fields.`);
  }
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new TypeError(`${label} has unsupported field '${key}'.`);
    }
  }
}
