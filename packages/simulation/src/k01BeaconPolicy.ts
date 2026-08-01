import {
  k01ReinforcementAdapter,
  k01ReinforcementOwnerAdapter,
  unitDefinitions,
  type GridPoint,
} from "../../shared/src/index.js";
import {
  admitCompletedK01ConstructionRuntime,
  allocateK01SourceEntityRuntime,
  writeK01SourceOccupancy,
  validateK01SourceRuntimeState,
  type K01SourceRuntimeState,
} from "./k01SourceRuntimeProfile.js";
import {
  cloneK01BeaconPolicyState,
  type K01BeaconPolicyState,
  type K01BeaconPolicyTraceEntry,
} from "./k01BeaconPolicyState.js";
import type { ConstructionCompletedEvent } from "./events.js";
import { createUnitState } from "./entities.js";
import type { WorldState } from "./types.js";

export const K01_BEACON_ORIGINAL_CLASS = 52;
export const K01_BEACON_ORIGINAL_OWNER_RELATION = 0;
export const K01_BEACON_NATIVE_ORIGIN = Object.freeze({ x: 55, y: 53 });
export const K01_BEACON_SCRIPT_LOADER_DEFAULT_RESULT = 1 as const;
export const K01_BEACON_NATIVE_SOURCE_INDEX_BASE = 0x6000;
export const K01_BEACON_CONSTRUCTION_SOURCE_INDEX_BASE = 0x5200;

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
    source: { ...source, acceptedUpdateCount: nextAcceptedUpdateCount, policies: { beacon: policy } },
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

  const blocker = options.blocker ?? 0;
  const currentOwnerRelation = options.currentOwnerRelation ?? K01_BEACON_ORIGINAL_OWNER_RELATION;
  if (blocker !== 0) {
    appendTrace(run, world.tick, { type: "scan-skipped-blocker", reason: `blocker=${String(blocker)}` });
  } else if (run.policy.triggerFlag !== 0) {
    appendTrace(run, world.tick, { type: "scan-skipped-flag", reason: `flag=${String(run.policy.triggerFlag)}` });
  } else {
    scanSourceEntities(world, run, currentOwnerRelation, options.scriptLoaderResult ?? K01_BEACON_SCRIPT_LOADER_DEFAULT_RESULT);
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
      const admitted = admitCompletedK01ConstructionRuntime(run.source, {
        semanticUnitId: building.id,
        sourceRecordIndex,
        originalClass: K01_BEACON_ORIGINAL_CLASS,
        ownerRelation,
        health: clampSourceHealth(building.health.current),
        position: event.position,
        footprint: { width: 1, height: 1, evidence: "project-adaptation" },
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
      const allocated = allocateK01SourceEntityRuntime(run.source, {
        semanticUnitId,
        sourceRecordIndex,
        originalClass: descriptor.originalClass,
        ownerRelation: descriptor.rawOwnerWord,
        progress: 0x64,
        health: clampSourceHealth(unitDefinitions[descriptor.projectKind].baseAttributes.health),
        position,
        footprint: { width: 1, height: 1, evidence: "static-confirmed" },
      });
      run.source = allocated.state;
      if (!isPointInsideMap(world.map.width, world.map.height, position)) {
        appendTrace(run, world.tick, { type: "reinforcement-failure", descriptorIndex, semanticUnitId, slot: allocated.handle.slot, generation: allocated.handle.generation, reason: "out-of-bounds" });
        continue;
      }
      run.source = writeK01SourceOccupancy(run.source, allocated.handle);
      world.units[semanticUnitId] = createUnitState(semanticUnitId, k01ReinforcementOwnerAdapter.projectPlayerId, descriptor.projectKind, position);
      run.nativeSuccessCount += 1;
      appendTrace(run, world.tick, { type: "reinforcement-success", descriptorIndex, semanticUnitId, slot: allocated.handle.slot, generation: allocated.handle.generation });
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

function isPointInsideMap(width: number, height: number, point: GridPoint): boolean {
  return point.x >= 0 && point.x < width && point.y >= 0 && point.y < height;
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
