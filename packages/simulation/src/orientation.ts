import { getGridFacing, type Facing, type GridPoint } from "../../shared/src/index.js";
import type { UnitState } from "./types.js";

export interface SourceOrientationProfile {
  /** Stable serialized id. Mod-defined profiles may use their own ids. */
  id: string;
  /** Ordered raw WORD values used by the source turn helper. */
  ring: readonly number[];
  /** The lossless raw-grid-to-render-facing boundary for this profile. */
  gridFacingByRaw: Readonly<Record<number, Facing>>;
  defaultCadenceLimit: number;
  /** Product spawn default; this is not a recovered original spawn mapping. */
  defaultInitialRaw16: number;
}

/**
 * Serializable state deliberately keeps the extended raw direction separate
 * from the last grid-facing attack direction. `originalAcceptedUpdate` is an
 * unsigned ordinal in the port adapter; it is not the original scheduler's
 * global counter until a future clock adapter can supply one.
 */
export interface SourceOrientationState {
  profileId: string;
  originalAcceptedUpdate: number;
  movementRaw16: number;
  attackGrid8: Facing;
  cadenceCounter: number;
  cadenceLimit: number;
  turnPending: number;
  dirty: number;
}

export const K01_TURTLE_TANK_ORIENTATION_PROFILE = {
  id: "k01-japanese-turtle-tank-raw16",
  ring: [1, 1000, 5, 1001, 4, 1002, 20, 1003, 16, 1004, 80, 1005, 64, 1006, 65, 1007],
  gridFacingByRaw: {
    1: "s",
    5: "sw",
    4: "w",
    20: "nw",
    16: "n",
    80: "ne",
    64: "e",
    65: "se",
  },
  defaultCadenceLimit: 2,
  defaultInitialRaw16: 1,
} as const satisfies SourceOrientationProfile;

const profilesById = new Map<string, SourceOrientationProfile>([
  [K01_TURTLE_TANK_ORIENTATION_PROFILE.id, K01_TURTLE_TANK_ORIENTATION_PROFILE],
]);
const profileIdByUnitKind = new Map<string, string>([
  ["japanese-turtle-tank", K01_TURTLE_TANK_ORIENTATION_PROFILE.id],
]);

/** Registers a profile and unit binding for source-backed or mod-defined units. */
export function registerSourceOrientationProfile(
  unitKind: string,
  profile: SourceOrientationProfile,
): () => void {
  validateProfile(profile);
  if (profilesById.has(profile.id) || profileIdByUnitKind.has(unitKind)) {
    throw new Error(`source orientation profile or unit binding already exists: ${profile.id}/${unitKind}`);
  }

  profilesById.set(profile.id, profile);
  profileIdByUnitKind.set(unitKind, profile.id);
  return () => {
    profilesById.delete(profile.id);
    profileIdByUnitKind.delete(unitKind);
  };
}

export function getSourceOrientationProfileForUnit(unit: Pick<UnitState, "kind">): SourceOrientationProfile | undefined {
  const profileId = profileIdByUnitKind.get(unit.kind);
  return profileId ? profilesById.get(profileId) : undefined;
}

export function createSourceOrientationState(profile: SourceOrientationProfile): SourceOrientationState {
  validateProfile(profile);
  const attackGrid8 = profile.gridFacingByRaw[profile.defaultInitialRaw16];

  if (!attackGrid8) {
    throw new Error(`source orientation profile ${profile.id} initial raw direction must be a grid direction`);
  }

  return {
    profileId: profile.id,
    originalAcceptedUpdate: 0,
    movementRaw16: profile.defaultInitialRaw16,
    attackGrid8,
    cadenceCounter: 0,
    cadenceLimit: profile.defaultCadenceLimit,
    turnPending: 0,
    dirty: 0,
  };
}

/**
 * Exact raw-ring behavior for one caller-approved orientation update. The
 * caller decides whether an update reaches this helper.
 */
export function advanceSourceOrientation(
  state: SourceOrientationState,
  profile: SourceOrientationProfile,
  targetRaw16: number,
): SourceOrientationState {
  validateProfile(profile);
  validateState(state, profile);
  validateRawDirection(targetRaw16, profile, "targetRaw16");

  const next: SourceOrientationState = {
    ...state,
    originalAcceptedUpdate: (state.originalAcceptedUpdate + 1) >>> 0,
  };

  if (state.movementRaw16 === targetRaw16) {
    next.turnPending = 0;
    return next;
  }

  const incrementedCadence = (state.cadenceCounter + 1) & 0xff;
  if (incrementedCadence < state.cadenceLimit) {
    next.cadenceCounter = incrementedCadence;
    return next;
  }

  const currentIndex = profile.ring.indexOf(state.movementRaw16);
  const targetIndex = profile.ring.indexOf(targetRaw16);
  const forwardDistance = (targetIndex - currentIndex + profile.ring.length) % profile.ring.length;
  const nextIndex = forwardDistance < profile.ring.length / 2
    ? (currentIndex + 1) % profile.ring.length
    : (currentIndex + profile.ring.length - 1) % profile.ring.length;
  const movementRaw16 = profile.ring[nextIndex]!;

  next.movementRaw16 = movementRaw16;
  next.cadenceCounter = 0;
  next.turnPending = 1;
  next.dirty = 1;

  const attackGrid8 = profile.gridFacingByRaw[movementRaw16];
  if (attackGrid8) {
    next.attackGrid8 = attackGrid8;
  }

  return next;
}

/**
 * Project-tick adapter. Its target choice and one-call-per-tick cadence are a
 * source-backed adaptation, not an assertion about original scheduler timing
 * or every original class-14 action path.
 */
export function advanceUnitOrientationForProjectTarget(
  unit: UnitState,
  target: GridPoint,
): void {
  const profile = getSourceOrientationProfileForUnit(unit);
  if (!profile) {
    return;
  }

  const state = unit.sourceOrientation ?? createSourceOrientationState(profile);
  const targetFacing = getGridFacing(target.x - unit.position.x, target.y - unit.position.y, state.attackGrid8);
  const targetRaw16 = getRawDirectionForFacing(profile, targetFacing);

  unit.sourceOrientation = advanceSourceOrientation(state, profile, targetRaw16);
}

export function getRawDirectionForFacing(profile: SourceOrientationProfile, facing: Facing): number {
  validateProfile(profile);
  const entry = Object.entries(profile.gridFacingByRaw).find(([, candidate]) => candidate === facing);
  if (!entry) {
    throw new Error(`source orientation profile ${profile.id} does not define raw direction for facing ${facing}`);
  }
  return Number(entry[0]);
}

function validateProfile(profile: SourceOrientationProfile): void {
  if (!profile.id) {
    throw new TypeError("source orientation profile id must be non-empty");
  }
  if (profile.ring.length < 2 || profile.ring.length % 2 !== 0 || new Set(profile.ring).size !== profile.ring.length) {
    throw new RangeError("source orientation profile ring must contain unique entries with an even length of at least two");
  }
  for (const direction of profile.ring) {
    validateUnsignedWord(direction, "source orientation profile ring direction");
  }
  validateUnsignedByte(profile.defaultCadenceLimit, "source orientation profile defaultCadenceLimit");
  validateRawDirection(profile.defaultInitialRaw16, profile, "source orientation profile defaultInitialRaw16");
  for (const rawDirection of Object.keys(profile.gridFacingByRaw)) {
    validateRawDirection(Number(rawDirection), profile, "source orientation profile grid raw direction");
  }
}

function validateState(state: SourceOrientationState, profile: SourceOrientationProfile): void {
  if (state.profileId !== profile.id) {
    throw new Error(`source orientation state profile ${state.profileId} does not match ${profile.id}`);
  }
  validateUnsignedDword(state.originalAcceptedUpdate, "originalAcceptedUpdate");
  validateRawDirection(state.movementRaw16, profile, "movementRaw16");
  if (!Object.values(profile.gridFacingByRaw).includes(state.attackGrid8)) {
    throw new RangeError(`attackGrid8 must be a grid facing for source orientation profile ${profile.id}`);
  }
  validateUnsignedByte(state.cadenceCounter, "cadenceCounter");
  validateUnsignedByte(state.cadenceLimit, "cadenceLimit");
  validateUnsignedByte(state.turnPending, "turnPending");
  validateUnsignedByte(state.dirty, "dirty");
}

function validateRawDirection(direction: number, profile: SourceOrientationProfile, label: string): void {
  validateUnsignedWord(direction, label);
  if (!profile.ring.includes(direction)) {
    throw new RangeError(`${label} must be a member of source orientation profile ${profile.id}`);
  }
}

function validateUnsignedByte(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${label} must be an unsigned BYTE`);
  }
}

function validateUnsignedWord(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${label} must be an unsigned WORD`);
  }
}

function validateUnsignedDword(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be an unsigned DWORD`);
  }
}
