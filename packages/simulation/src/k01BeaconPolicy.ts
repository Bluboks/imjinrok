import {
  k01SourceFootprintByOriginalClass,
  k01ReinforcementAdapter,
  k01ReinforcementOwnerAdapter,
  unitDefinitions,
} from "../../shared/src/index.js";
import { originalEntityTypeProfilesByClass } from "../../shared/src/originalEntityTypeProfiles.generated.js";
import {
  admitCompletedK01ConstructionRuntime,
  admitK01NativeSourceEntityRuntime,
  validateK01SourceRuntimeState,
  type K01SourceRuntimeState,
} from "./k01SourceRuntimeProfile.js";
import { getEntityBlockingTiles } from "./collision.js";
import {
  cloneK01BeaconPolicyState,
  type K01BeaconPolicyState,
  type K01BeaconPolicyTraceEntry,
} from "./k01BeaconPolicyState.js";
import type { ConstructionCompletedEvent } from "./events.js";
import { createUnitState } from "./entities.js";
import { getUnitFootprintTiles } from "./footprints.js";
import type { WorldState } from "./types.js";

export const K01_BEACON_ORIGINAL_CLASS = 52;
export const K01_BEACON_ORIGINAL_OWNER_RELATION = 0;
export const K01_BEACON_NATIVE_ORIGIN = Object.freeze({ x: 55, y: 53 });
export const K01_BEACON_SCRIPT_LOADER_DEFAULT_RESULT = 1 as const;
export const K01_BEACON_NATIVE_SOURCE_INDEX_BASE = 0x6000;
export const K01_BEACON_CONSTRUCTION_SOURCE_INDEX_BASE = 0x5200;

const K01_BEACON_BLOCKER_TYPE_FLAGS_MASK = 0x00020002;
const K01_RELATION_TO_PLAYER_ID: Readonly<Record<number, string>> = Object.freeze({
  0: "local-player",
  1: "cpu-1",
});
const K01_ORIGINAL_ENTITY_PROFILE_BY_CLASS = new Map(
  Object.entries(originalEntityTypeProfilesByClass).map(([originalClass, profile]) => [Number(originalClass), profile]),
);

export interface K01BeaconPolicyAdvanceOptions {
  /** Raw relation blocker result: zero permits the source scan. */
  readonly blocker?: number;
  /** Raw current-player owner/relation byte consumed by the source gate. */
  readonly currentOwnerRelation?: number;
  /** Explicit script context +4 input. */
  readonly scriptBusy?: boolean;
  /** Explicit loader 0/1 outcome; it never gates native effects. */
  readonly scriptLoaderResult?: 0 | 1;
  /** Explicit script context +8 post-state input. */
  readonly scriptPostState?: number;
}

export interface K01BeaconPolicyAdvanceResult {
  readonly state: K01SourceRuntimeState | undefined;
  readonly matchedBeaconCount: number;
  readonly nativeSuccessCount: number;
}

interface MutablePolicyRun {
  source: K01SourceRuntimeState;
  policy: K01BeaconPolicyState;
  matchedBeaconCount: number;
  nativeSuccessCount: number;
}

/**
 * Product liveness bridge for the source general-presence predicate. The
 * source record and generated original-class flags remain the authority;
 * semantic units only retire stale or destroyed records.
 */
export function evaluateK01GeneralPresence(
  world: WorldState,
  source: K01SourceRuntimeState,
  currentOwnerRelation = K01_BEACON_ORIGINAL_OWNER_RELATION,
): boolean {
  const recordsBySlot = new Map(source.entityRuntime.entities.map((record) => [record.slot, record]));

  for (const slot of source.entityRuntime.activeList) {
    const record = recordsBySlot.get(slot);
    if (record === undefined || source.entityRuntime.activeTable[slot] === 0 || !record.active || record.health <= 0 || record.ownerRelation !== currentOwnerRelation) {
      continue;
    }

    const profile = K01_ORIGINAL_ENTITY_PROFILE_BY_CLASS.get(record.originalClass);
    if (profile === undefined || !Number.isInteger(profile.flags) || profile.flags < 0 || profile.flags > 0xffffffff) {
      throw new Error(`K01 general-presence adapter has unsupported original class metadata ${String(record.originalClass)}.`);
    }
    if ((profile.flags & K01_BEACON_BLOCKER_TYPE_FLAGS_MASK) === 0) {
      continue;
    }

    const semanticUnit = world.units[record.semanticUnitId];
    if (semanticUnit !== undefined && semanticUnit.health.current > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Bounded class-76/78 hero liveness adapter. Active-list order is the
 * deterministic source identity adapter; any valid live matching record is
 * sufficient for liveness.
 */
export function evaluateK01HeroAlive(
  world: WorldState,
  source: K01SourceRuntimeState,
  originalClass: 76 | 78,
  currentOwnerRelation = K01_BEACON_ORIGINAL_OWNER_RELATION,
): boolean {
  const recordsBySlot = new Map(source.entityRuntime.entities.map((record) => [record.slot, record]));
  for (const slot of source.entityRuntime.activeList) {
    const record = recordsBySlot.get(slot);
    if (
      record === undefined ||
      source.entityRuntime.activeTable[slot] === 0 ||
      !record.active ||
      record.health <= 0 ||
      record.ownerRelation !== currentOwnerRelation ||
      record.originalClass !== originalClass
    ) {
      continue;
    }

    const semanticUnit = world.units[record.semanticUnitId];
    if (semanticUnit !== undefined && semanticUnit.health.current > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Consumes ConstructionCompleted events and runs the narrow K0120 source
 * policy at one accepted update boundary. No objective, dialogue, or result
 * state is touched here.
 */
export function advanceK01BeaconPolicy(
  world: WorldState,
  options: K01BeaconPolicyAdvanceOptions = {},
): K01BeaconPolicyAdvanceResult {
  validatePolicyOptions(options);
  const envelope = world.sourceRuntimeProfile;
  if (!envelope || envelope.profileId !== "k01:source-runtime") {
    return { state: undefined, matchedBeaconCount: 0, nativeSuccessCount: 0 };
  }

  validateK01SourceRuntimeState(envelope.state);
  const source = envelope.state;
  const policy = cloneK01BeaconPolicyState(source.policies.beacon);
  const nextAcceptedUpdateCount = source.acceptedUpdateCount + 1;
  if (!Number.isSafeInteger(nextAcceptedUpdateCount) || nextAcceptedUpdateCount > 0xffffffff) {
    throw new RangeError("K01 source runtime accepted update count is exhausted");
  }

  const run: MutablePolicyRun = {
    source: {
      ...source,
      acceptedUpdateCount: nextAcceptedUpdateCount,
      policies: { ...source.policies, beacon: policy },
    },
    policy,
    matchedBeaconCount: 0,
    nativeSuccessCount: 0,
  };

  const scriptBusy = options.scriptBusy ?? policy.scriptBusy;
  const scriptPostState = options.scriptPostState ?? policy.scriptPostState;
  run.policy = {
    ...run.policy,
    scriptBusy,
    scriptPostState,
    lastLoaderResult: null,
    lastReturnValue: null,
  };
  run.source = withPolicy(run.source, run.policy);

  consumeConstructionEvents(world, run);

  const currentOwnerRelation = options.currentOwnerRelation ?? K01_BEACON_ORIGINAL_OWNER_RELATION;
  const blocker = options.blocker ?? deriveK01BeaconBlocker(world, run.source, currentOwnerRelation);
  if (blocker !== 0) {
    appendTrace(run, world.tick, { type: "scan-skipped-blocker", reason: `blocker=${String(blocker)}` });
  } else if (run.policy.triggerFlag !== 0) {
    appendTrace(run, world.tick, { type: "scan-skipped-flag", reason: `flag=${String(run.policy.triggerFlag)}` });
  } else {
    scanSourceEntities(world, run, currentOwnerRelation, options.scriptLoaderResult ?? K01_BEACON_SCRIPT_LOADER_DEFAULT_RESULT);
  }

  if (options.scriptPostState !== undefined) {
    run.policy = { ...run.policy, scriptPostState: options.scriptPostState };
  }
  const returnValue = run.policy.triggerFlag === 1 && run.policy.scriptPostState === 0 ? 1 : 0;
  run.policy = { ...run.policy, lastReturnValue: returnValue };
  if (run.policy.triggerFlag === 1) {
    appendTrace(run, world.tick, { type: "post-state-return", returnValue });
  }
  run.source = withPolicy(run.source, run.policy);
  world.sourceRuntimeProfile = {
    ...envelope,
    state: run.source,
  };
  return { state: run.source, matchedBeaconCount: run.matchedBeaconCount, nativeSuccessCount: run.nativeSuccessCount };
}

/**
 * Reproduces FUN_00487fa0 over the source active list. Source records remain
 * the scan authority, while semantic UnitState liveness prevents stale seeded
 * health from keeping a removed or destroyed building in the blocker gate.
 */
function deriveK01BeaconBlocker(
  world: WorldState,
  source: K01SourceRuntimeState,
  currentOwnerRelation: number,
): number {
  const currentPlayerId = resolveK01RelationPlayerId(currentOwnerRelation);
  if (currentPlayerId === undefined || world.players[currentPlayerId] === undefined) {
    return 1;
  }

  const recordsBySlot = new Map(source.entityRuntime.entities.map((record) => [record.slot, record]));
  for (const slot of source.entityRuntime.activeList) {
    const record = recordsBySlot.get(slot);
    if (record === undefined || source.entityRuntime.activeTable[slot] === 0 || !record.active) {
      continue;
    }

    const semanticUnit = world.units[record.semanticUnitId];
    if (semanticUnit === undefined || semanticUnit.health.current <= 0) {
      continue;
    }

    const profile = K01_ORIGINAL_ENTITY_PROFILE_BY_CLASS.get(record.originalClass);
    if (profile === undefined || !Number.isInteger(profile.flags) || profile.flags < 0 || profile.flags > 0xffffffff) {
      return 1;
    }
    if ((profile.flags & K01_BEACON_BLOCKER_TYPE_FLAGS_MASK) === 0) {
      continue;
    }
    // A live semantic unit paired with a non-positive source health is an
    // unresolved source/world mismatch. Do not let that ambiguity open the
    // mission gate; only semantic death/removal may retire stale source data.
    if (record.health <= 0) {
      return 1;
    }

    const ownerPlayerId = resolveK01RelationPlayerId(record.ownerRelation);
    if (ownerPlayerId === undefined || world.players[ownerPlayerId] === undefined) {
      return 1;
    }
    const ownerTeamId = world.players[ownerPlayerId]?.teamId ?? ownerPlayerId;
    const currentTeamId = world.players[currentPlayerId]?.teamId ?? currentPlayerId;
    if (ownerTeamId !== currentTeamId) {
      return 1;
    }
  }
  return 0;
}

function consumeConstructionEvents(world: WorldState, run: MutablePolicyRun): void {
  const events = [...world.simulationEvents]
    .filter((event): event is ConstructionCompletedEvent => event.type === "construction-completed" && event.sequence > run.policy.eventCursorSequence)
    .sort((left, right) => left.sequence - right.sequence);

  for (const event of events) {
    appendTrace(run, world.tick, { type: "construction-event-consumed", eventSequence: event.sequence });
    run.policy = { ...run.policy, eventCursorSequence: event.sequence };
    run.source = withPolicy(run.source, run.policy);
    if (event.kind !== "beacon") {
      continue;
    }

    const ownerRelation = resolveConstructionOwnerRelation(event.ownerId);
    if (ownerRelation === undefined) {
      appendTrace(run, world.tick, {
        type: "construction-admission-failure",
        eventSequence: event.sequence,
        reason: "unknown-semantic-owner-mapping",
      });
      continue;
    }
    const building = world.units[event.buildingId];
    const sourceRecordIndex = K01_BEACON_CONSTRUCTION_SOURCE_INDEX_BASE + event.sequence;
    if (sourceRecordIndex > 0xffff || !building) {
      appendTrace(run, world.tick, {
        type: "construction-admission-failure",
        eventSequence: event.sequence,
        reason: !building ? "missing-building" : "source-record-index-overflow",
      });
      continue;
    }
    try {
      const preparedSource = prepareK01BeaconConstructionSource(world, run.source, event.position, building.id);
      const admitted = admitCompletedK01ConstructionRuntime(preparedSource, {
        semanticUnitId: building.id,
        sourceRecordIndex,
        originalClass: K01_BEACON_ORIGINAL_CLASS,
        ownerRelation,
        health: clampSourceHealth(building.health.current),
        position: event.position,
        footprint: requireK01BeaconSourceFootprint(),
        timingClassification: "intentional-adaptation",
      });
      run.source = admitted.state;
      appendTrace(run, world.tick, {
        type: "construction-admission-success",
        eventSequence: event.sequence,
        slot: admitted.handle.slot,
        generation: admitted.handle.generation,
      });
    } catch (error) {
      appendTrace(run, world.tick, {
        type: "construction-admission-failure",
        eventSequence: event.sequence,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * The source occupancy mirror is intentionally adapted at construction
 * completion because semantic movement does not yet update every raw cell.
 * Clear only stale owner cells proven to belong to a live semantic unit whose
 * current effective footprint no longer covers the cell. Unknown owners,
 * missing semantic units, and current occupants remain blockers.
 */
function prepareK01BeaconConstructionSource(
  world: WorldState,
  source: K01SourceRuntimeState,
  position: { readonly x: number; readonly y: number },
  semanticUnitId: string,
): K01SourceRuntimeState {
  const requestedTiles = getUnitFootprintTiles(world, "beacon", position);
  if (requestedTiles.length === 0) {
    return source;
  }

  const currentBlockers = getEntityBlockingTiles(world, semanticUnitId);
  const currentBlocker = requestedTiles.find((tile) => currentBlockers.has(toTileKey(tile)));
  if (currentBlocker !== undefined) {
    throw new Error(`K01 beacon source footprint overlaps current semantic occupancy at (${currentBlocker.x},${currentBlocker.y}).`);
  }

  const occupancy = source.occupancy;
  const ownerSlots = [...occupancy.ownerSlots];
  const recordsBySlot = new Map(source.entityRuntime.entities.map((record) => [record.slot, record]));

  for (const tile of requestedTiles) {
    if (tile.x < 0 || tile.x >= occupancy.width || tile.y < 0 || tile.y >= occupancy.height) {
      continue;
    }

    const index = tile.y * occupancy.width + tile.x;
    const ownerSlot = ownerSlots[index];
    if (ownerSlot === undefined || ownerSlot === 0) {
      continue;
    }

    const record = recordsBySlot.get(ownerSlot);
    const semanticUnit = record !== undefined &&
      source.entityRuntime.activeTable[ownerSlot] !== 0 &&
      record.active
      ? world.units[record.semanticUnitId]
      : undefined;
    if (semanticUnit === undefined) {
      continue;
    }

    const currentTiles = getUnitFootprintTiles(world, semanticUnit.kind, semanticUnit.position);
    if (currentTiles.length === 0) {
      continue;
    }
    if (!currentTiles.some((currentTile) => currentTile.x === tile.x && currentTile.y === tile.y)) {
      ownerSlots[index] = 0;
    }
  }

  return {
    ...source,
    occupancy: {
      ...occupancy,
      ownerSlots,
    },
  };
}

function toTileKey(tile: { readonly x: number; readonly y: number }): string {
  return `${tile.x},${tile.y}`;
}

function requireK01BeaconSourceFootprint() {
  const footprint = k01SourceFootprintByOriginalClass[K01_BEACON_ORIGINAL_CLASS];
  if (footprint === undefined || footprint.width !== 3 || footprint.height !== 3 || footprint.evidence !== "static-confirmed") {
    throw new Error("K01 beacon source footprint evidence is missing or invalid.");
  }
  return footprint;
}

function scanSourceEntities(
  world: WorldState,
  run: MutablePolicyRun,
  currentOwnerRelation: number,
  loaderResult: 0 | 1,
): void {
  const candidates = [...run.source.entityRuntime.entities].sort((left, right) => left.slot - right.slot);
  for (const record of candidates) {
    const valid = run.source.entityRuntime.activeTable[record.slot] !== 0 &&
      record.active &&
      record.health > 0 &&
      record.ownerRelation === currentOwnerRelation &&
      record.originalClass === K01_BEACON_ORIGINAL_CLASS &&
      record.progress === 0x64;
    if (!valid) {
      // Keep the trace useful without turning the bounded policy log into an
      // O(ticks × 1,200) snapshot payload for ordinary non-beacon entities.
      if (record.originalClass === K01_BEACON_ORIGINAL_CLASS || record.ownerRelation === currentOwnerRelation) {
        appendTrace(run, world.tick, { type: "scan-candidate-rejected", slot: record.slot, reason: rejectionReason(run.source, record, currentOwnerRelation) });
      }
      continue;
    }

    run.matchedBeaconCount += 1;
    run.policy = { ...run.policy, triggerFlag: 1 };
    appendTrace(run, world.tick, { type: "trigger-flag-write", slot: record.slot });
    if (run.policy.scriptBusy) {
      appendTrace(run, world.tick, { type: "script-busy", slot: record.slot });
    } else {
      appendTrace(run, world.tick, { type: "script-load-request", slot: record.slot });
      run.policy = { ...run.policy, lastLoaderResult: loaderResult };
      appendTrace(run, world.tick, { type: "script-load-result", slot: record.slot, loaderResult });
      if (loaderResult === 1) {
        run.policy = {
          ...run.policy,
          scriptBusy: true,
          ...(run.policy.scriptPostState === 0 ? { scriptPostState: 1 } : {}),
        };
      }
      appendTrace(run, world.tick, { type: "script-start-request", slot: record.slot });
    }
    run.source = withPolicy(run.source, run.policy);
    createNativeReinforcements(world, run, run.matchedBeaconCount);
  }
}

function createNativeReinforcements(world: WorldState, run: MutablePolicyRun, matchOrdinal: number): void {
  for (const [descriptorIndex, descriptor] of k01ReinforcementAdapter.entries()) {
    const suffix = matchOrdinal === 1 ? descriptor.idSuffix : `${descriptor.idSuffix}-match${matchOrdinal}`;
    const semanticUnitId = `${k01ReinforcementOwnerAdapter.projectPlayerId}-${suffix}`;
    const position = { x: K01_BEACON_NATIVE_ORIGIN.x + descriptor.offset.x, y: K01_BEACON_NATIVE_ORIGIN.y + descriptor.offset.y };
    appendTrace(run, world.tick, { type: "reinforcement-attempt", descriptorIndex, semanticUnitId });
    if (!world.players[k01ReinforcementOwnerAdapter.projectPlayerId]) {
      appendTrace(run, world.tick, { type: "reinforcement-failure", descriptorIndex, semanticUnitId, reason: "unknown-semantic-owner-mapping" });
      continue;
    }
    if (world.units[semanticUnitId]) {
      appendTrace(run, world.tick, { type: "reinforcement-failure", descriptorIndex, semanticUnitId, reason: "semantic-unit-id-collision" });
      continue;
    }

    const sourceRecordIndex = K01_BEACON_NATIVE_SOURCE_INDEX_BASE + (matchOrdinal - 1) * k01ReinforcementAdapter.length + descriptorIndex;
    try {
      const unit = createUnitState(semanticUnitId, k01ReinforcementOwnerAdapter.projectPlayerId, descriptor.projectKind, position);
      const admitted = admitK01NativeSourceEntityRuntime(run.source, {
        semanticUnitId,
        sourceRecordIndex,
        originalClass: descriptor.originalClass,
        ownerRelation: descriptor.rawOwnerWord,
        progress: 0x64,
        health: clampSourceHealth(unitDefinitions[descriptor.projectKind].baseAttributes.health),
        position,
        footprint: { width: 1, height: 1, evidence: "static-confirmed" },
        mapWidth: world.map.width,
        mapHeight: world.map.height,
      });
      run.source = admitted.state;
      if (admitted.outcome === "slot-exhausted") {
        appendTrace(run, world.tick, { type: "reinforcement-failure", descriptorIndex, semanticUnitId, reason: "slot-exhaustion" });
        return;
      }
      if (admitted.outcome === "out-of-bounds") {
        appendTrace(run, world.tick, { type: "reinforcement-failure", descriptorIndex, semanticUnitId, slot: admitted.slot, reason: "out-of-bounds" });
        continue;
      }
      world.units[semanticUnitId] = unit;
      run.nativeSuccessCount += 1;
      appendTrace(run, world.tick, { type: "reinforcement-success", descriptorIndex, semanticUnitId, slot: admitted.slot, generation: admitted.handle.generation });
    } catch (error) {
      appendTrace(run, world.tick, { type: "reinforcement-failure", descriptorIndex, semanticUnitId, reason: error instanceof Error ? error.message : String(error) });
    }
  }
}

function appendTrace(run: MutablePolicyRun, tick: number, entry: Omit<K01BeaconPolicyTraceEntry, "id" | "tick">): void {
  const traceSequence = run.policy.traceSequence + 1;
  if (traceSequence > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("K01 beacon trace sequence is exhausted");
  }
  const id = `k01-beacon:${traceSequence}`;
  run.policy = {
    ...run.policy,
    traceSequence,
    trace: [...run.policy.trace, { ...entry, id, tick }].slice(-512),
  };
  run.source = withPolicy(run.source, run.policy);
}

function withPolicy(source: K01SourceRuntimeState, policy: K01BeaconPolicyState): K01SourceRuntimeState {
  return { ...source, policies: { ...source.policies, beacon: cloneK01BeaconPolicyState(policy) } };
}

function resolveConstructionOwnerRelation(ownerId: string): number | undefined {
  if (ownerId === "local-player") return 0;
  if (ownerId === "cpu-1") return 1;
  return undefined;
}

function resolveK01RelationPlayerId(relation: number): string | undefined {
  return K01_RELATION_TO_PLAYER_ID[relation];
}

function rejectionReason(source: K01SourceRuntimeState, record: K01SourceRuntimeState["entityRuntime"]["entities"][number], currentOwnerRelation: number): string {
  if (source.entityRuntime.activeTable[record.slot] === 0 || !record.active) return "inactive";
  if (record.health <= 0) return "non-positive-health";
  if (record.ownerRelation !== currentOwnerRelation) return "owner-relation-mismatch";
  if (record.originalClass !== K01_BEACON_ORIGINAL_CLASS) return "class-mismatch";
  return "progress-mismatch";
}

function clampSourceHealth(value: number): number {
  return Math.max(-0x8000, Math.min(0x7fff, Math.trunc(value)));
}

function validatePolicyOptions(options: K01BeaconPolicyAdvanceOptions): void {
  if (options.blocker !== undefined && (!Number.isInteger(options.blocker) || !Number.isFinite(options.blocker))) {
    throw new RangeError("K01 beacon blocker must be a finite integer");
  }
  if (options.currentOwnerRelation !== undefined && (!Number.isInteger(options.currentOwnerRelation) || options.currentOwnerRelation < -0x80 || options.currentOwnerRelation > 0x7f)) {
    throw new RangeError("K01 beacon current owner relation must be a signed BYTE");
  }
  if (options.scriptLoaderResult !== undefined && options.scriptLoaderResult !== 0 && options.scriptLoaderResult !== 1) {
    throw new RangeError("K01 beacon loader result must be 0 or 1");
  }
  if (options.scriptPostState !== undefined && (!Number.isSafeInteger(options.scriptPostState) || options.scriptPostState < 0 || options.scriptPostState > 0xffffffff)) {
    throw new RangeError("K01 beacon script post-state must be a DWORD");
  }
  if (options.scriptBusy !== undefined && typeof options.scriptBusy !== "boolean") {
    throw new TypeError("K01 beacon scriptBusy must be a boolean");
  }
}
