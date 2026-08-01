/**
 * Serializable state owned by the K0120 beacon policy.  Source entity
 * allocation, generation, and occupancy remain in k01SourceEntityRuntime;
 * this namespace only records policy cursor, raw gate inputs, and observable
 * outcomes.
 */
export const K01_BEACON_POLICY_STATE_VERSION = 1;
export const K01_BEACON_TRIGGER_FLAG_MIN = 0;
export const K01_BEACON_TRIGGER_FLAG_MAX = 0xffff;
export const K01_BEACON_SCRIPT_POST_STATE_MIN = 0;
export const K01_BEACON_SCRIPT_POST_STATE_MAX = 0xffffffff;

export type K01BeaconTraceType =
  | "construction-event-consumed"
  | "construction-admission-success"
  | "construction-admission-failure"
  | "scan-skipped-blocker"
  | "scan-skipped-flag"
  | "scan-candidate-rejected"
  | "trigger-flag-write"
  | "script-busy"
  | "script-load-request"
  | "script-load-result"
  | "script-start-request"
  | "reinforcement-attempt"
  | "reinforcement-success"
  | "reinforcement-failure"
  | "post-state-return";

export interface K01BeaconPolicyTraceEntry {
  readonly id: string;
  readonly tick: number;
  readonly type: K01BeaconTraceType;
  readonly eventSequence?: number;
  readonly slot?: number;
  readonly generation?: number;
  readonly descriptorIndex?: number;
  readonly semanticUnitId?: string;
  readonly reason?: string;
  readonly loaderResult?: 0 | 1;
  readonly returnValue?: 0 | 1;
}

export interface K01BeaconPolicyState {
  readonly policyVersion: typeof K01_BEACON_POLICY_STATE_VERSION;
  /** Last ConstructionCompleted sequence consumed by this policy. */
  readonly eventCursorSequence: number;
  /** Raw WORD flag; only exact zero admits a new scan. */
  readonly triggerFlag: number;
  /** Raw script context +4 gate, retained as an explicit policy input. */
  readonly scriptBusy: boolean;
  /** Raw script context +8 post-state gate. */
  readonly scriptPostState: number;
  /** Last loader outcome is diagnostic, not the trigger authority. */
  readonly lastLoaderResult: 0 | 1 | null;
  readonly lastReturnValue: 0 | 1 | null;
  readonly traceSequence: number;
  readonly trace: readonly K01BeaconPolicyTraceEntry[];
}

export function createK01BeaconPolicyState(): K01BeaconPolicyState {
  return {
    policyVersion: K01_BEACON_POLICY_STATE_VERSION,
    eventCursorSequence: 0,
    triggerFlag: 0,
    scriptBusy: false,
    scriptPostState: 0,
    lastLoaderResult: null,
    lastReturnValue: null,
    traceSequence: 0,
    trace: [],
  };
}

export function cloneK01BeaconPolicyState(value: unknown): K01BeaconPolicyState {
  validateK01BeaconPolicyState(value);
  const state = value as K01BeaconPolicyState;
  return {
    policyVersion: state.policyVersion,
    eventCursorSequence: state.eventCursorSequence,
    triggerFlag: state.triggerFlag,
    scriptBusy: state.scriptBusy,
    scriptPostState: state.scriptPostState,
    lastLoaderResult: state.lastLoaderResult,
    lastReturnValue: state.lastReturnValue,
    traceSequence: state.traceSequence,
    trace: state.trace.map((entry) => ({ ...entry })),
  };
}

export function validateK01BeaconPolicyState(value: unknown): asserts value is K01BeaconPolicyState {
  assertPlainRecord(value, "K01 beacon policy state");
  assertExactKeys(value, [
    "policyVersion",
    "eventCursorSequence",
    "triggerFlag",
    "scriptBusy",
    "scriptPostState",
    "lastLoaderResult",
    "lastReturnValue",
    "traceSequence",
    "trace",
  ], "K01 beacon policy state");
  if (value.policyVersion !== K01_BEACON_POLICY_STATE_VERSION) {
    throw new RangeError(`K01 beacon policy state version must be ${K01_BEACON_POLICY_STATE_VERSION}.`);
  }
  assertIntegerInRange(value.eventCursorSequence, 0, Number.MAX_SAFE_INTEGER, "K01 beacon event cursor");
  assertIntegerInRange(value.triggerFlag, K01_BEACON_TRIGGER_FLAG_MIN, K01_BEACON_TRIGGER_FLAG_MAX, "K01 beacon trigger flag");
  if (typeof value.scriptBusy !== "boolean") {
    throw new TypeError("K01 beacon scriptBusy must be a boolean");
  }
  assertIntegerInRange(value.scriptPostState, K01_BEACON_SCRIPT_POST_STATE_MIN, K01_BEACON_SCRIPT_POST_STATE_MAX, "K01 beacon script post-state");
  if (value.lastLoaderResult !== null && value.lastLoaderResult !== 0 && value.lastLoaderResult !== 1) {
    throw new TypeError("K01 beacon lastLoaderResult must be null, 0, or 1");
  }
  if (value.lastReturnValue !== null && value.lastReturnValue !== 0 && value.lastReturnValue !== 1) {
    throw new TypeError("K01 beacon lastReturnValue must be null, 0, or 1");
  }
  assertIntegerInRange(value.traceSequence, 0, Number.MAX_SAFE_INTEGER, "K01 beacon trace sequence");
  if (!Array.isArray(value.trace)) {
    throw new TypeError("K01 beacon policy trace must be an array");
  }
  for (const entry of value.trace) {
    validateTraceEntry(entry);
  }
}

function validateTraceEntry(value: unknown): asserts value is K01BeaconPolicyTraceEntry {
  assertPlainRecord(value, "K01 beacon policy trace entry");
  const allowed = ["id", "tick", "type", "eventSequence", "slot", "generation", "descriptorIndex", "semanticUnitId", "reason", "loaderResult", "returnValue"];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError(`K01 beacon trace has unsupported field '${key}'.`);
  }
  if (typeof value.id !== "string" || !value.id) throw new TypeError("K01 beacon trace id must be non-empty");
  assertIntegerInRange(value.tick, 0, Number.MAX_SAFE_INTEGER, "K01 beacon trace tick");
  if (typeof value.type !== "string" || !K01_TRACE_TYPES.has(value.type)) throw new TypeError("K01 beacon trace type is invalid");
  for (const [key, min, max] of [
    ["eventSequence", 0, Number.MAX_SAFE_INTEGER],
    ["slot", 1, 1199],
    ["generation", 0, 0xffff],
    ["descriptorIndex", 0, 8],
  ] as const) {
    if (value[key] !== undefined) assertIntegerInRange(value[key], min, max, `K01 beacon trace ${key}`);
  }
  if (value.semanticUnitId !== undefined && (typeof value.semanticUnitId !== "string" || !value.semanticUnitId)) throw new TypeError("K01 beacon trace semanticUnitId is invalid");
  if (value.reason !== undefined && typeof value.reason !== "string") throw new TypeError("K01 beacon trace reason is invalid");
  if (value.loaderResult !== undefined && value.loaderResult !== 0 && value.loaderResult !== 1) throw new TypeError("K01 beacon trace loaderResult is invalid");
  if (value.returnValue !== undefined && value.returnValue !== 0 && value.returnValue !== 1) throw new TypeError("K01 beacon trace returnValue is invalid");
}

const K01_TRACE_TYPES = new Set<string>([
  "construction-event-consumed", "construction-admission-success", "construction-admission-failure",
  "scan-skipped-blocker", "scan-skipped-flag", "scan-candidate-rejected", "trigger-flag-write", "script-busy",
  "script-load-request", "script-load-result", "script-start-request", "reinforcement-attempt",
  "reinforcement-success", "reinforcement-failure", "post-state-return",
]);

function assertIntegerInRange(value: unknown, min: number, max: number, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer in ${min}..${max}; got ${String(value)}`);
}

function assertPlainRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) throw new TypeError(`${label} has unsupported or missing fields`);
}
