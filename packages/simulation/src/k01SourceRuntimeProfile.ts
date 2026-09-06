import {
  admitCompletedK01Construction,
  admitK01NativeSourceEntity,
  admitK01SourceEntity,
  allocateK01SourceEntity,
  clearSourceOccupancy,
  cloneK01SourceRuntimeStateV2,
  createK01SourceRuntimeStateV2,
  getK01SourceEntityHandleBySemanticUnitId,
  releaseK01SourceEntity,
  seedK01SourceOpeningRuntime,
  updateK01SourceRuntimeStateV2,
  validateK01SourceEntityHandle,
  validateK01SourceRuntimeStateV2,
  writeSourceOccupancy,
  K01_SOURCE_ENTITY_SLOT_MAX,
  K01_SOURCE_ENTITY_SLOT_MIN,
  K01_SOURCE_GENERATION_MAX,
  K01_SOURCE_GENERATION_MIN,
  K01_SOURCE_HEALTH_MAX,
  K01_SOURCE_HEALTH_MIN,
  K01_SOURCE_PROGRESS_COMPLETE,
  type K01CompletedConstructionAdmissionRequest,
  type K01SourceEntityAdmissionRequest,
  type K01SourceEntityAdmissionResult,
  type K01NativeSourceEntityAdmissionRequest,
  type K01NativeSourceEntityAdmissionResult,
  type K01NativeSourceEntityAdmissionOutcome,
  type K01SourceEntityHandle,
  type K01SourceEntityRecord,
  type K01SourceEntityRuntimeState,
  type K01SourceOccupancyState,
  type K01SourceOpeningSeedRequest,
  type K01SourceRuntimeStateV2,
} from "./k01SourceEntityRuntime.js";
import type { SourceRuntimeProfileEnvelope } from "./types.js";
import { createK01BeaconPolicyState } from "./k01BeaconPolicyState.js";
export {
  K01_BEACON_POLICY_STATE_VERSION,
  cloneK01BeaconPolicyState,
  createK01BeaconPolicyState,
  validateK01BeaconPolicyState,
  type K01BeaconPolicyState,
  type K01BeaconPolicyTraceEntry,
} from "./k01BeaconPolicyState.js";

/** Stable process-local selector for the first source-runtime profile. */
export const K01_SOURCE_RUNTIME_PROFILE_ID = "k01:source-runtime";
export const K01_SOURCE_RUNTIME_STATE_VERSION = 3;
export const K01_SOURCE_RUNTIME_LEGACY_STATE_VERSION = 1;
/** A02 entity-runtime state before the T01 policy namespace was added. */
export const K01_SOURCE_RUNTIME_ENTITY_STATE_VERSION = 2;
export {
  K01_SOURCE_ENTITY_SLOT_MAX,
  K01_SOURCE_ENTITY_SLOT_MIN,
  K01_SOURCE_GENERATION_MAX,
  K01_SOURCE_GENERATION_MIN,
  K01_SOURCE_HEALTH_MAX,
  K01_SOURCE_HEALTH_MIN,
  K01_SOURCE_PROGRESS_COMPLETE,
} from "./k01SourceEntityRuntime.js";
export const K01_ACCEPTED_UPDATE_COUNT_MIN = 0;
export const K01_ACCEPTED_UPDATE_COUNT_MAX = 0xffffffff;

/**
 * The only source entity facts currently closed by E01. Slot/generation are
 * handle identity, while active and signed health are the owning validity
 * fields. They remain inside the K01-owned opaque state and never become
 * generic UnitState fields.
 */
/** Serializable K01 state. Policy flags, scripts, trigger results, and raw
 * clocks intentionally do not belong to this general entity-runtime layer. */
export type K01SourceRuntimeState = K01SourceRuntimeStateV2;
export type K01SourceEntityState = K01SourceEntityRecord;
export type K01SourceRuntimeStatePatch = Partial<Pick<K01SourceRuntimeState, "acceptedUpdateCount" | "entityRuntime" | "occupancy">>;
export type {
  K01CompletedConstructionAdmissionRequest,
  K01SourceEntityAdmissionRequest,
  K01SourceEntityAdmissionResult,
  K01NativeSourceEntityAdmissionRequest,
  K01NativeSourceEntityAdmissionResult,
  K01NativeSourceEntityAdmissionOutcome,
  K01SourceEntityHandle,
  K01SourceEntityRecord,
  K01SourceEntityRuntimeState,
  K01SourceEntityRuntimeState as K01SourceEntityRuntime,
  K01SourceOccupancyState,
  K01SourceOpeningSeedRequest,
  K01SourceRuntimeStateV2,
} from "./k01SourceEntityRuntime.js";

export interface SourceRuntimeProfile {
  readonly id: string;
  readonly stateVersion: number;
  /** Optional process-local initial-placement policy selected with this profile. */
  readonly initialPlacementPolicyId?: string;
  /** Optional pure semantic-unit removal adapter for this profile's state. */
  readonly removeSemanticUnit?: (state: Record<string, unknown>, unitId: string) => Record<string, unknown>;
  createInitialState(): Record<string, unknown>;
  validateState(state: unknown): void;
  cloneState(state: unknown): Record<string, unknown>;
}

export interface RegisterSourceRuntimeProfileOptions {
  readonly replace?: boolean;
}

export class SourceRuntimeProfileRegistry {
  private readonly profiles = new Map<string, SourceRuntimeProfile>();

  register(profile: SourceRuntimeProfile, options: RegisterSourceRuntimeProfileOptions = {}): void {
    validateProfileDefinition(profile);

    if (this.profiles.has(profile.id) && options.replace !== true) {
      throw new Error(`Source runtime profile '${profile.id}' is already registered.`);
    }

    this.profiles.set(profile.id, profile);
  }

  require(id: string): SourceRuntimeProfile {
    assertStableProfileId(id);
    const profile = this.profiles.get(id);

    if (!profile) {
      throw new Error(`Unknown source runtime profile '${id}'. Register its profile before creating or restoring the world.`);
    }

    return profile;
  }

  has(id: string): boolean {
    return this.profiles.has(id);
  }

  ids(): readonly string[] {
    return Object.freeze([...this.profiles.keys()].sort());
  }

  unregister(id: string): void {
    this.profiles.delete(id);
  }
}

const k01SourceRuntimeProfile: SourceRuntimeProfile = {
  id: K01_SOURCE_RUNTIME_PROFILE_ID,
  stateVersion: K01_SOURCE_RUNTIME_STATE_VERSION,
  initialPlacementPolicyId: "k01:source-exact-opening",
  createInitialState: () => cloneK01SourceRuntimeState(createK01SourceRuntimeState()),
  validateState: validateK01SourceRuntimeState,
  cloneState(value) {
    return cloneK01SourceRuntimeState(value);
  },
  removeSemanticUnit(value, unitId) {
    validateK01SourceRuntimeState(value);
    const handle = getK01SourceEntityHandleBySemanticUnitId(value, unitId);
    return handle === undefined ? value : releaseK01SourceEntity(value, handle);
  },
};

export const defaultSourceRuntimeProfileRegistry = new SourceRuntimeProfileRegistry();
defaultSourceRuntimeProfileRegistry.register(k01SourceRuntimeProfile);

export function registerSourceRuntimeProfile(
  profile: SourceRuntimeProfile,
  options?: RegisterSourceRuntimeProfileOptions,
): () => void {
  defaultSourceRuntimeProfileRegistry.register(profile, options);
  return () => defaultSourceRuntimeProfileRegistry.unregister(profile.id);
}

export function requireSourceRuntimeProfile(id: string): SourceRuntimeProfile {
  return defaultSourceRuntimeProfileRegistry.require(id);
}

export function resolveSourceRuntimeInitialPlacementPolicyId(profileId: string | undefined): string | undefined {
  if (profileId === undefined) {
    return undefined;
  }

  return requireSourceRuntimeProfile(profileId).initialPlacementPolicyId;
}

export function resolveSourceRuntimeProfileId(id: string | undefined): string | undefined {
  if (id === undefined) {
    return undefined;
  }

  requireSourceRuntimeProfile(id);
  return id;
}

export function createK01SourceRuntimeState(): K01SourceRuntimeState {
  return createK01SourceRuntimeStateV2();
}

/** Pure replacement API; it never advances a tick or mutates its input. */
export function updateK01SourceRuntimeState(
  state: K01SourceRuntimeState,
  patch: K01SourceRuntimeStatePatch,
): K01SourceRuntimeState {
  return updateK01SourceRuntimeStateV2(state, patch);
}

export function admitK01SourceEntityRuntime(
  state: K01SourceRuntimeState,
  request: K01SourceEntityAdmissionRequest,
): K01SourceEntityAdmissionResult {
  return admitK01SourceEntity(state, request);
}

export function allocateK01SourceEntityRuntime(
  state: K01SourceRuntimeState,
  request: K01SourceEntityAdmissionRequest,
): K01SourceEntityAdmissionResult {
  return allocateK01SourceEntity(state, request);
}

export function admitK01NativeSourceEntityRuntime(
  state: K01SourceRuntimeState,
  request: K01NativeSourceEntityAdmissionRequest,
): K01NativeSourceEntityAdmissionResult {
  return admitK01NativeSourceEntity(state, request);
}

export function admitCompletedK01ConstructionRuntime(
  state: K01SourceRuntimeState,
  request: K01CompletedConstructionAdmissionRequest,
): K01SourceEntityAdmissionResult {
  return admitCompletedK01Construction(state, request);
}

export function validateK01SourceEntityHandleRuntime(
  state: K01SourceRuntimeState,
  handle: K01SourceEntityHandle,
): K01SourceEntityRecord {
  return validateK01SourceEntityHandle(state, handle);
}

export function getK01SourceEntityHandleBySemanticUnitIdRuntime(
  state: K01SourceRuntimeState,
  semanticUnitId: string,
): K01SourceEntityHandle | undefined {
  return getK01SourceEntityHandleBySemanticUnitId(state, semanticUnitId);
}

export function writeK01SourceOccupancy(
  state: K01SourceRuntimeState,
  handle: K01SourceEntityHandle,
): K01SourceRuntimeState {
  return writeSourceOccupancy(state, handle);
}

export function clearK01SourceOccupancy(
  state: K01SourceRuntimeState,
  handle: K01SourceEntityHandle,
): K01SourceRuntimeState {
  return clearSourceOccupancy(state, handle);
}

export function releaseK01SourceEntityRuntime(
  state: K01SourceRuntimeState,
  handle: K01SourceEntityHandle,
): K01SourceRuntimeState {
  return releaseK01SourceEntity(state, handle);
}

export function seedK01SourceOpeningRuntimeState(
  state: K01SourceRuntimeState,
  request: K01SourceOpeningSeedRequest,
): K01SourceRuntimeState {
  return seedK01SourceOpeningRuntime(state, request);
}

export function createSourceRuntimeProfileEnvelope(profileId: string): SourceRuntimeProfileEnvelope {
  const profile = requireSourceRuntimeProfile(profileId);
  const state = profile.createInitialState();
  profile.validateState(state);
  const clonedState = profile.cloneState(state);
  assertJsonSafeRecord(clonedState, "source runtime profile state");

  return {
    profileId: profile.id,
    stateVersion: profile.stateVersion,
    state: clonedState,
  };
}

/**
 * Runs a profile's optional semantic-unit removal adapter against an isolated
 * validated clone. The returned envelope is validated and cloned again so a
 * failed or malformed extension result cannot mutate the caller's world.
 */
export function removeSourceRuntimeProfileUnit(
  envelope: SourceRuntimeProfileEnvelope | undefined,
  unitId: string,
): SourceRuntimeProfileEnvelope | undefined {
  if (envelope === undefined) {
    return undefined;
  }

  const isolated = cloneSourceRuntimeProfileEnvelope(envelope);
  const profile = requireSourceRuntimeProfile(isolated.profileId);
  if (profile.removeSemanticUnit === undefined) {
    return isolated;
  }

  const nextState = profile.removeSemanticUnit(isolated.state, unitId);
  return cloneSourceRuntimeProfileEnvelope({
    profileId: isolated.profileId,
    stateVersion: isolated.stateVersion,
    state: nextState,
  });
}

/**
 * Explicit v1 migration. A v1 entity record did not carry class, owner, map
 * coordinates, footprint, or semantic identity, so only an empty v1 state is
 * safe to migrate. Non-empty v1 saves fail loudly rather than inventing data.
 */
export function migrateK01SourceRuntimeStateV1(value: unknown): K01SourceRuntimeState {
  assertPlainRecord(value, "K01 source runtime v1 state");
  assertExactKeys(value, ["acceptedUpdateCount", "entities"], "K01 source runtime v1 state");
  assertIntegerInRange(value.acceptedUpdateCount, K01_ACCEPTED_UPDATE_COUNT_MIN, K01_ACCEPTED_UPDATE_COUNT_MAX, "K01 source runtime acceptedUpdateCount");
  if (!Array.isArray(value.entities)) {
    throw new TypeError("K01 source runtime v1 entities must be an array");
  }
  if (value.entities.length !== 0) {
    throw new Error("K01 source runtime v1 migration rejected non-empty entities: class/owner/coordinate/identity fields are unavailable.");
  }
  return {
    ...createK01SourceRuntimeStateV2(),
    acceptedUpdateCount: value.acceptedUpdateCount,
  };
}

/** Explicit A02 v2 → T01 v3 migration. General runtime fields are preserved;
 * the new policy namespace starts from its deterministic initial state. */
export function migrateK01SourceRuntimeStateV2(value: unknown): K01SourceRuntimeState {
  assertPlainRecord(value, "K01 source runtime v2 state");
  assertExactKeys(value, ["acceptedUpdateCount", "entityRuntime", "occupancy"], "K01 source runtime v2 state");
  const candidate = {
    ...value,
    policies: { beacon: createK01BeaconPolicyState() },
  };
  validateK01SourceRuntimeStateV2(candidate);
  return cloneK01SourceRuntimeState(candidate);
}

export function migrateSourceRuntimeProfileEnvelope(value: unknown): SourceRuntimeProfileEnvelope {
  assertPlainRecord(value, "source runtime profile envelope");
  assertExactKeys(value, ["profileId", "stateVersion", "state"], "source runtime profile envelope");
  if (value.profileId !== K01_SOURCE_RUNTIME_PROFILE_ID) {
    throw new Error("Only the K01 source runtime profile has an explicit migration path.");
  }
  if (value.stateVersion === K01_SOURCE_RUNTIME_LEGACY_STATE_VERSION) {
    return {
      profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
      stateVersion: K01_SOURCE_RUNTIME_STATE_VERSION,
      state: cloneK01SourceRuntimeState(migrateK01SourceRuntimeStateV1(value.state)),
    };
  }
  if (value.stateVersion === K01_SOURCE_RUNTIME_ENTITY_STATE_VERSION) {
    return {
      profileId: K01_SOURCE_RUNTIME_PROFILE_ID,
      stateVersion: K01_SOURCE_RUNTIME_STATE_VERSION,
      state: cloneK01SourceRuntimeState(migrateK01SourceRuntimeStateV2(value.state)),
    };
  }
  throw new Error(`Unsupported K01 source runtime migration version ${String(value.stateVersion)}.`);
}

/**
 * Validates and deep-clones a serialized envelope. Unknown ids and versions,
 * malformed JSON shapes, and unsupported state data all fail closed.
 */
export function cloneSourceRuntimeProfileEnvelope(value: unknown): SourceRuntimeProfileEnvelope {
  assertPlainRecord(value, "source runtime profile envelope");
  assertExactKeys(value, ["profileId", "stateVersion", "state"], "source runtime profile envelope");

  if (typeof value.profileId !== "string") {
    throw new TypeError("source runtime profile envelope profileId must be a string");
  }

  const profile = requireSourceRuntimeProfile(value.profileId);

  if (!Number.isInteger(value.stateVersion)) {
    throw new TypeError("source runtime profile envelope stateVersion must be an integer");
  }

  if (
    profile.id === K01_SOURCE_RUNTIME_PROFILE_ID &&
    (value.stateVersion === K01_SOURCE_RUNTIME_LEGACY_STATE_VERSION || value.stateVersion === K01_SOURCE_RUNTIME_ENTITY_STATE_VERSION)
  ) {
    return migrateSourceRuntimeProfileEnvelope(value);
  }

  if (value.stateVersion !== profile.stateVersion) {
    throw new RangeError(
      `Source runtime profile '${profile.id}' does not support state version ${String(value.stateVersion)}; expected ${profile.stateVersion}.`,
    );
  }

  profile.validateState(value.state);
  const clonedState = profile.cloneState(value.state);
  assertJsonSafeRecord(clonedState, "source runtime profile state");

  return {
    profileId: profile.id,
    stateVersion: profile.stateVersion,
    state: clonedState,
  };
}

export function validateSourceRuntimeProfileEnvelope(value: unknown): void {
  cloneSourceRuntimeProfileEnvelope(value);
}

/** Compatibility parser for nullable save/load validators. The throwing clone
 * remains the owning boundary for callers that need the exact failure. */
export function parseSourceRuntimeProfileEnvelope(value: unknown): SourceRuntimeProfileEnvelope | null {
  try {
    return cloneSourceRuntimeProfileEnvelope(value);
  } catch {
    return null;
  }
}

export function validateK01SourceRuntimeState(value: unknown): asserts value is K01SourceRuntimeState {
  validateK01SourceRuntimeStateV2(value);
}

function cloneK01SourceRuntimeState(value: unknown): K01SourceRuntimeState {
  return cloneK01SourceRuntimeStateV2(value);
}

function validateProfileDefinition(profile: SourceRuntimeProfile): void {
  assertStableProfileId(profile.id);
  if (profile.initialPlacementPolicyId !== undefined) {
    assertStableProfileId(profile.initialPlacementPolicyId);
  }

  if (!Number.isInteger(profile.stateVersion) || profile.stateVersion <= 0) {
    throw new RangeError(`Source runtime profile '${profile.id}' stateVersion must be a positive integer.`);
  }

  if (typeof profile.createInitialState !== "function" || typeof profile.validateState !== "function" || typeof profile.cloneState !== "function") {
    throw new TypeError(`Source runtime profile '${profile.id}' must provide executable state boundaries.`);
  }
  if (profile.removeSemanticUnit !== undefined && typeof profile.removeSemanticUnit !== "function") {
    throw new TypeError(`Source runtime profile '${profile.id}' removeSemanticUnit must be a function when provided.`);
  }
}

function assertStableProfileId(id: string): void {
  if (typeof id !== "string" || !id.trim()) {
    throw new TypeError("Source runtime profile id must be a non-empty string.");
  }

  if (id !== id.trim()) {
    throw new Error(`Source runtime profile id '${id}' must not have surrounding whitespace.`);
  }
}

function assertIntegerInRange(value: unknown, min: number, max: number, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer in ${min}..${max}; got ${String(value)}`);
  }
}

function assertPlainRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  assertPlainObject(value, label);
}

function assertPlainObject(value: unknown, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();

  if (actual.length !== canonicalExpected.length || actual.some((key, index) => key !== canonicalExpected[index])) {
    throw new TypeError(`${label} has unsupported or missing fields; expected ${canonicalExpected.join(",")}`);
  }
}

function assertAllowedKeys(value: object, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unsupported = Object.keys(value).find((key) => !allowedSet.has(key));

  if (unsupported !== undefined) {
    throw new TypeError(`${label} has unsupported field '${unsupported}'`);
  }
}

function assertJsonSafeRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  assertPlainRecord(value, label);
  assertJsonSafeValue(value, label, new Set<object>());
}

function assertJsonSafeValue(value: unknown, label: string, seen: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${label} contains a non-finite number`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new TypeError(`${label} contains a non-JSON value`);
  }

  if (seen.has(value)) {
    throw new TypeError(`${label} contains a cyclic value`);
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafeValue(item, `${label}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} contains a non-plain object`);
    }

    for (const [key, item] of Object.entries(value)) {
      assertJsonSafeValue(item, `${label}.${key}`, seen);
    }
  }

  seen.delete(value);
}
