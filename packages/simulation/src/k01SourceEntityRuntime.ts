import {
  k01SourceOpeningAdapter,
  unitDefinitions,
  type GridPoint,
  type MapDefinition,
  type UnitDefinitionId,
} from "../../shared/src/index.js";

export const K01_SOURCE_ENTITY_TABLE_SIZE = 1200;
export const K01_SOURCE_ENTITY_SLOT_MIN = 1;
export const K01_SOURCE_ENTITY_SLOT_MAX = K01_SOURCE_ENTITY_TABLE_SIZE - 1;
export const K01_SOURCE_GENERATION_MIN = 0;
export const K01_SOURCE_GENERATION_MAX = 0xffff;
export const K01_SOURCE_HEALTH_MIN = -0x8000;
export const K01_SOURCE_HEALTH_MAX = 0x7fff;
export const K01_SOURCE_OWNER_RELATION_MIN = -0x80;
export const K01_SOURCE_OWNER_RELATION_MAX = 0x7f;
export const K01_SOURCE_CLASS_MIN = 0;
export const K01_SOURCE_CLASS_MAX = 0xff;
export const K01_SOURCE_BYTE_MIN = 0;
export const K01_SOURCE_BYTE_MAX = 0xff;
export const K01_SOURCE_PROGRESS_COMPLETE = 0x64;
export const K01_SOURCE_WORD_MIN = 0;
export const K01_SOURCE_WORD_MAX = 0xffff;
export const K01_SOURCE_COORDINATE_MIN = -0x8000;
export const K01_SOURCE_COORDINATE_MAX = 0x7fff;

export type K01SourceFootprintEvidence = "static-confirmed" | "project-adaptation";

export interface K01SourceEntityHandle {
  readonly slot: number;
  readonly generation: number;
}

export interface K01SourceEntityFootprint {
  readonly width: number;
  readonly height: number;
  readonly evidence: K01SourceFootprintEvidence;
}

/**
 * The fields in this record are deliberately the smallest production view of
 * the source record fields closed by the static evidence. `ownerRelation` is
 * the raw signed byte at +0x38; it has no person-facing ownership meaning.
 */
export interface K01SourceEntityRecord extends K01SourceEntityHandle {
  readonly semanticUnitId: string;
  /** Stable adapter order, not an invented raw map-array offset. */
  readonly sourceRecordIndex: number;
  readonly originalClass: number;
  readonly ownerRelation: number;
  readonly progress: number;
  readonly active: boolean;
  readonly health: number;
  readonly position: GridPoint;
  readonly footprint: K01SourceEntityFootprint;
}

export interface K01SourceEntityRuntimeState {
  /** WORD global generation counter; incremented before each admitted record. */
  readonly generationCounter: number;
  /** WORD active-table values indexed by source slot; slot 0 remains failure/empty. */
  readonly activeTable: readonly number[];
  /** Active-list WORD slots in source insertion order. Release is swap-last. */
  readonly activeList: readonly number[];
  /** Signed-WORD reuse ages indexed by source slot. */
  readonly reuseAges: readonly number[];
  /** Inactive records are retained so stale fields remain observable, as in source release. */
  readonly entities: readonly K01SourceEntityRecord[];
}

export interface K01SourceOccupancyState {
  readonly width: number;
  readonly height: number;
  /** WORD owner cells. Generation is intentionally not stored in an occupancy cell. */
  readonly ownerSlots: readonly number[];
}

export interface K01SourceRuntimeStateV2 {
  readonly [key: string]: unknown;
  readonly acceptedUpdateCount: number;
  readonly entityRuntime: K01SourceEntityRuntimeState;
  readonly occupancy: K01SourceOccupancyState;
}

interface MutableK01SourceEntityRuntimeState {
  generationCounter: number;
  activeTable: number[];
  activeList: number[];
  reuseAges: number[];
  entities: K01SourceEntityRecord[];
}

interface MutableK01SourceOccupancyState {
  width: number;
  height: number;
  ownerSlots: number[];
}

export interface K01SourceEntityAdmissionRequest {
  readonly semanticUnitId: string;
  readonly sourceRecordIndex: number;
  readonly originalClass: number;
  readonly ownerRelation: number;
  readonly progress: number;
  readonly health: number;
  readonly position: GridPoint;
  readonly footprint: K01SourceEntityFootprint;
}

export interface K01CompletedConstructionAdmissionRequest {
  readonly semanticUnitId: string;
  readonly sourceRecordIndex: number;
  readonly originalClass: number;
  readonly ownerRelation: number;
  readonly health: number;
  readonly position: GridPoint;
  readonly footprint: K01SourceEntityFootprint;
  /** ConstructionCompleted-time admission is a project timing adaptation. */
  readonly timingClassification: "intentional-adaptation";
}

export interface K01SourceEntityAdmissionResult {
  readonly state: K01SourceRuntimeStateV2;
  readonly handle: K01SourceEntityHandle;
}

export interface K01SourceOpeningSeedUnit {
  readonly id: string;
  readonly kind: UnitDefinitionId;
  readonly position: GridPoint;
  readonly health: number;
}

export interface K01SourceOpeningSeedRequest {
  readonly map: MapDefinition;
  readonly units: Readonly<Record<string, K01SourceOpeningSeedUnit>>;
}

export function createEmptyK01EntityRuntimeState(): K01SourceEntityRuntimeState {
  return {
    generationCounter: 0,
    activeTable: Array.from({ length: K01_SOURCE_ENTITY_TABLE_SIZE }, () => 0),
    activeList: [],
    reuseAges: Array.from({ length: K01_SOURCE_ENTITY_TABLE_SIZE }, () => 0),
    entities: [],
  };
}

export function createEmptyK01OccupancyState(): K01SourceOccupancyState {
  return { width: 0, height: 0, ownerSlots: [] };
}

export function createK01SourceRuntimeStateV2(): K01SourceRuntimeStateV2 {
  return {
    acceptedUpdateCount: 0,
    entityRuntime: createEmptyK01EntityRuntimeState(),
    occupancy: createEmptyK01OccupancyState(),
  };
}

export function cloneK01SourceRuntimeStateV2(value: unknown): K01SourceRuntimeStateV2 {
  validateK01SourceRuntimeStateV2(value);
  const state = value as K01SourceRuntimeStateV2;
  return {
    acceptedUpdateCount: state.acceptedUpdateCount,
    entityRuntime: {
      generationCounter: state.entityRuntime.generationCounter,
      activeTable: [...state.entityRuntime.activeTable],
      activeList: [...state.entityRuntime.activeList],
      reuseAges: [...state.entityRuntime.reuseAges],
      entities: state.entityRuntime.entities.map(cloneEntityRecord),
    },
    occupancy: {
      width: state.occupancy.width,
      height: state.occupancy.height,
      ownerSlots: [...state.occupancy.ownerSlots],
    },
  };
}

export function validateK01SourceRuntimeStateV2(value: unknown): asserts value is K01SourceRuntimeStateV2 {
  assertPlainRecord(value, "K01 source runtime v2 state");
  assertExactKeys(value, ["acceptedUpdateCount", "entityRuntime", "occupancy"], "K01 source runtime v2 state");
  assertIntegerInRange(value.acceptedUpdateCount, 0, 0xffffffff, "K01 source runtime acceptedUpdateCount");

  validateEntityRuntime(value.entityRuntime);
  validateOccupancy(value.occupancy, value.entityRuntime);
}

export function updateK01SourceRuntimeStateV2(
  state: K01SourceRuntimeStateV2,
  patch: Partial<Pick<K01SourceRuntimeStateV2, "acceptedUpdateCount" | "entityRuntime" | "occupancy">>,
): K01SourceRuntimeStateV2 {
  validateK01SourceRuntimeStateV2(state);
  assertPlainRecord(patch, "K01 source runtime v2 state patch");
  assertAllowedKeys(patch, ["acceptedUpdateCount", "entityRuntime", "occupancy"], "K01 source runtime v2 state patch");
  return cloneK01SourceRuntimeStateV2({
    acceptedUpdateCount: patch.acceptedUpdateCount ?? state.acceptedUpdateCount,
    entityRuntime: patch.entityRuntime ?? state.entityRuntime,
    occupancy: patch.occupancy ?? state.occupancy,
  });
}

/**
 * Replays the source allocator's bounded selection: inactive slots are
 * scanned 1..1199, every visited age increments with signed-WORD wrap, and
 * equal non-negative ages prefer the later slot. Slot 0 is never a candidate.
 */
export function allocateK01SourceEntity(
  state: K01SourceRuntimeStateV2,
  request: K01SourceEntityAdmissionRequest,
): K01SourceEntityAdmissionResult {
  validateK01SourceRuntimeStateV2(state);
  validateAdmissionRequest(request);
  assertUniqueAdmissionKeys(state, request);

  const runtime = cloneRuntime(state.entityRuntime);
  let bestSlot = 0;
  let bestAge = 0;

  for (let slot = K01_SOURCE_ENTITY_SLOT_MIN; slot <= K01_SOURCE_ENTITY_SLOT_MAX; slot += 1) {
    if (runtime.activeTable[slot] !== 0) {
      continue;
    }

    const age = runtime.reuseAges[slot]!;
    if (age >= bestAge) {
      bestSlot = slot;
      bestAge = age;
    }
    runtime.reuseAges[slot] = wrapSignedWord(age + 1);
  }

  if (bestSlot === 0) {
    throw new Error("K01 source entity allocation failed: no inactive slot with a non-negative reuse age (slot 0 is failure).");
  }

  const generation = wrapUnsignedWord(runtime.generationCounter + 1);
  runtime.generationCounter = generation;
  runtime.activeTable[bestSlot] = 1;
  runtime.activeList.push(bestSlot);
  runtime.entities.push({
    slot: bestSlot,
    generation,
    semanticUnitId: request.semanticUnitId,
    sourceRecordIndex: request.sourceRecordIndex,
    originalClass: request.originalClass,
    ownerRelation: request.ownerRelation,
    progress: request.progress,
    active: true,
    health: request.health,
    position: { ...request.position },
    footprint: { ...request.footprint },
  });
  runtime.entities.sort((left, right) => left.slot - right.slot);

  const next = cloneK01SourceRuntimeStateV2({
    acceptedUpdateCount: state.acceptedUpdateCount,
    entityRuntime: runtime,
    occupancy: state.occupancy,
  });

  return { state: next, handle: { slot: bestSlot, generation } };
}

/** Allocate and atomically write the owner cells after all collision/bounds checks pass. */
export function admitK01SourceEntity(
  state: K01SourceRuntimeStateV2,
  request: K01SourceEntityAdmissionRequest,
): K01SourceEntityAdmissionResult {
  const allocated = allocateK01SourceEntity(state, request);
  return {
    state: writeSourceOccupancy(allocated.state, allocated.handle),
    handle: allocated.handle,
  };
}

/**
 * ConstructionCompleted is intentionally not consumed here. The caller must
 * opt into this explicit adapter and provide its proven/source-adapted record
 * identity, so a missing mapping fails instead of allocating an invented one.
 */
export function admitCompletedK01Construction(
  state: K01SourceRuntimeStateV2,
  request: K01CompletedConstructionAdmissionRequest,
): K01SourceEntityAdmissionResult {
  assertPlainRecord(request, "completed K01 construction admission");
  if (request.originalClass !== 52) {
    throw new Error(`K01 completed construction admission expected class 52 beacon; got ${String(request.originalClass)}.`);
  }
  if (request.timingClassification !== "intentional-adaptation") {
    throw new Error("K01 completed construction admission requires intentional-adaptation timing classification.");
  }
  return admitK01SourceEntity(state, {
    semanticUnitId: request.semanticUnitId,
    sourceRecordIndex: request.sourceRecordIndex,
    originalClass: request.originalClass,
    ownerRelation: request.ownerRelation,
    progress: K01_SOURCE_PROGRESS_COMPLETE,
    health: request.health,
    position: request.position,
    footprint: request.footprint,
  });
}

export function validateK01SourceEntityHandle(
  state: K01SourceRuntimeStateV2,
  handle: K01SourceEntityHandle,
): K01SourceEntityRecord {
  validateK01SourceRuntimeStateV2(state);
  assertHandle(handle);
  const record = state.entityRuntime.entities.find((candidate) => candidate.slot === handle.slot);
  if (!record || state.entityRuntime.activeTable[handle.slot] === 0 || !record.active || record.generation !== handle.generation) {
    throw new Error(`K01 source entity handle is stale or inactive: slot ${handle.slot}, generation ${handle.generation}.`);
  }
  return record;
}

export function getK01SourceEntityHandleBySemanticUnitId(
  state: K01SourceRuntimeStateV2,
  semanticUnitId: string,
): K01SourceEntityHandle | undefined {
  validateK01SourceRuntimeStateV2(state);
  assertSemanticUnitId(semanticUnitId);
  const record = state.entityRuntime.entities.find(
    (candidate) => candidate.semanticUnitId === semanticUnitId && candidate.active,
  );
  return record === undefined ? undefined : { slot: record.slot, generation: record.generation };
}

/** Writes mask-independent owner WORDs only after bounds and collision checks. */
export function writeSourceOccupancy(
  state: K01SourceRuntimeStateV2,
  handle: K01SourceEntityHandle,
): K01SourceRuntimeStateV2 {
  const record = validateK01SourceEntityHandle(state, handle);
  const occupancy = cloneOccupancy(state.occupancy);
  const tiles = footprintTiles(record.position, record.footprint);
  assertTilesInBounds(occupancy, tiles, record.semanticUnitId);

  for (const tile of tiles) {
    const index = occupancyIndex(occupancy.width, tile);
    const owner = occupancy.ownerSlots[index];
    if (owner !== 0 && owner !== record.slot) {
      throw new Error(
        `K01 source occupancy collision for '${record.semanticUnitId}' at (${tile.x},${tile.y}); owner slot ${owner}.`,
      );
    }
  }

  for (const tile of tiles) {
    occupancy.ownerSlots[occupancyIndex(occupancy.width, tile)] = record.slot;
  }

  return cloneK01SourceRuntimeStateV2({
    acceptedUpdateCount: state.acceptedUpdateCount,
    entityRuntime: state.entityRuntime,
    occupancy,
  });
}

/** Clear only this slot's owner WORDs; generation is never present in a cell. */
export function clearSourceOccupancy(
  state: K01SourceRuntimeStateV2,
  handle: K01SourceEntityHandle,
): K01SourceRuntimeStateV2 {
  const record = validateK01SourceEntityHandle(state, handle);
  const occupancy = cloneOccupancy(state.occupancy);
  for (const tile of footprintTiles(record.position, record.footprint)) {
    if (!isTileInBounds(occupancy, tile)) {
      continue;
    }
    const index = occupancyIndex(occupancy.width, tile);
    if (occupancy.ownerSlots[index] === record.slot) {
      occupancy.ownerSlots[index] = 0;
    }
  }

  return cloneK01SourceRuntimeStateV2({
    acceptedUpdateCount: state.acceptedUpdateCount,
    entityRuntime: state.entityRuntime,
    occupancy,
  });
}

/** Release follows source cleanup then active-list swap-last and table/age clear. */
export function releaseK01SourceEntity(
  state: K01SourceRuntimeStateV2,
  handle: K01SourceEntityHandle,
): K01SourceRuntimeStateV2 {
  const cleared = clearSourceOccupancy(state, handle);
  const runtime = cloneRuntime(cleared.entityRuntime);
  const recordIndex = runtime.entities.findIndex((candidate) => candidate.slot === handle.slot);
  const listIndex = runtime.activeList.indexOf(handle.slot);
  if (recordIndex < 0 || listIndex < 0) {
    throw new Error(`K01 source entity release cannot find active slot ${handle.slot}.`);
  }

  const lastIndex = runtime.activeList.length - 1;
  const lastSlot = runtime.activeList[lastIndex];
  if (lastSlot === undefined) {
    throw new Error(`K01 source entity release has an empty active list for slot ${handle.slot}.`);
  }
  runtime.activeList[listIndex] = lastSlot;
  runtime.activeList.pop();
  runtime.activeTable[handle.slot] = 0;
  runtime.reuseAges[handle.slot] = 0;
  const record = runtime.entities[recordIndex];
  if (!record) {
    throw new Error(`K01 source entity release cannot find record ${handle.slot}.`);
  }
  runtime.entities[recordIndex] = { ...record, active: false };

  return cloneK01SourceRuntimeStateV2({
    acceptedUpdateCount: cleared.acceptedUpdateCount,
    entityRuntime: runtime,
    occupancy: cleared.occupancy,
  });
}

/**
 * Seed the units already admitted by P01. Missing records are not invented:
 * this permits a one-player test launch while the canonical two-player K01
 * launch admits all 36 adapter records in their stable order.
 */
export function seedK01SourceOpeningRuntime(
  state: K01SourceRuntimeStateV2,
  request: K01SourceOpeningSeedRequest,
): K01SourceRuntimeStateV2 {
  validateK01SourceRuntimeStateV2(state);
  if (state.entityRuntime.entities.length > 0 || state.entityRuntime.activeList.length > 0) {
    throw new Error("K01 source opening seed requires an empty source entity runtime.");
  }
  assertMapDimensions(request.map.width, request.map.height);
  const seeded = cloneK01SourceRuntimeStateV2({
    ...state,
    occupancy: {
      width: request.map.width,
      height: request.map.height,
      ownerSlots: Array.from({ length: request.map.width * request.map.height }, () => 0),
    },
  });
  let next = seeded;
  const units = Object.values(request.units);
  const seenUnitIds = new Set<string>();
  for (const [sourceRecordIndex, sourceRecord] of k01SourceOpeningAdapter.entries()) {
    const suffix = `-${sourceRecord.idSuffix}`;
    const candidates = units.filter((unit) => unit.id.endsWith(suffix));
    if (candidates.length === 0) {
      continue;
    }
    if (candidates.length !== 1) {
      throw new Error(`K01 source opening seed has ambiguous semantic mapping for '${sourceRecord.idSuffix}'.`);
    }
    const unit = candidates[0]!;
    if (seenUnitIds.has(unit.id)) {
      throw new Error(`K01 source opening seed has duplicate semantic unit '${unit.id}'.`);
    }
    seenUnitIds.add(unit.id);
    const isBuilding = unitDefinitions[unit.kind].category === "building";
    const footprint = sourceRecord.sourceFootprint === undefined || !isBuilding
      ? { width: 1, height: 1, evidence: "project-adaptation" as const }
      : sourceRecord.sourceFootprint;
    const admitted = admitK01SourceEntity(next, {
      semanticUnitId: unit.id,
      sourceRecordIndex,
      originalClass: sourceRecord.originalClass,
      ownerRelation: sourceRecord.rawOwnerWord,
      progress: K01_SOURCE_PROGRESS_COMPLETE,
      health: unit.health,
      position: unit.position,
      footprint,
    });
    next = admitted.state;
  }

  for (const unit of units) {
    if (unit.id.includes("-source-") && !seenUnitIds.has(unit.id)) {
      throw new Error(`K01 source opening seed has no proven adapter mapping for semantic unit '${unit.id}'.`);
    }
  }

  return next;
}

function validateAdmissionRequest(request: K01SourceEntityAdmissionRequest): void {
  assertPlainRecord(request, "K01 source entity admission");
  assertSemanticUnitId(request.semanticUnitId);
  assertIntegerInRange(request.sourceRecordIndex, K01_SOURCE_WORD_MIN, K01_SOURCE_WORD_MAX, "K01 source record index");
  assertIntegerInRange(request.originalClass, K01_SOURCE_CLASS_MIN, K01_SOURCE_CLASS_MAX, "K01 source entity class");
  assertIntegerInRange(request.ownerRelation, K01_SOURCE_OWNER_RELATION_MIN, K01_SOURCE_OWNER_RELATION_MAX, "K01 source owner/relation");
  assertIntegerInRange(request.progress, K01_SOURCE_BYTE_MIN, K01_SOURCE_BYTE_MAX, "K01 source progress");
  assertIntegerInRange(request.health, K01_SOURCE_HEALTH_MIN, K01_SOURCE_HEALTH_MAX, "K01 source health");
  assertSignedCoordinate(request.position.x, "K01 source x");
  assertSignedCoordinate(request.position.y, "K01 source y");
  validateFootprint(request.footprint);
}

function assertUniqueAdmissionKeys(state: K01SourceRuntimeStateV2, request: K01SourceEntityAdmissionRequest): void {
  if (state.entityRuntime.entities.some((entity) => entity.semanticUnitId === request.semanticUnitId)) {
    throw new Error(`K01 source semantic mapping already exists for '${request.semanticUnitId}'.`);
  }
  if (state.entityRuntime.entities.some((entity) => entity.sourceRecordIndex === request.sourceRecordIndex)) {
    throw new Error(`K01 source record mapping already exists for index ${request.sourceRecordIndex}.`);
  }
}

function validateEntityRuntime(value: unknown): asserts value is K01SourceEntityRuntimeState {
  assertPlainRecord(value, "K01 source entity runtime");
  assertExactKeys(value, ["generationCounter", "activeTable", "activeList", "reuseAges", "entities"], "K01 source entity runtime");
  assertIntegerInRange(value.generationCounter, K01_SOURCE_GENERATION_MIN, K01_SOURCE_GENERATION_MAX, "K01 source generation counter");
  validateWordTable(value.activeTable, "K01 source active table");
  validateSignedWordTable(value.reuseAges, "K01 source reuse ages");
  if (value.activeTable[0] !== 0 || value.reuseAges[0] !== 0) {
    throw new RangeError("K01 source slot 0 must remain the allocator failure/empty sentinel.");
  }
  if (!Array.isArray(value.activeList)) {
    throw new TypeError("K01 source active list must be an array");
  }
  const activeList = new Set<number>();
  for (const slot of value.activeList) {
    assertIntegerInRange(slot, K01_SOURCE_ENTITY_SLOT_MIN, K01_SOURCE_ENTITY_SLOT_MAX, "K01 source active-list slot");
    if (activeList.has(slot)) {
      throw new RangeError(`K01 source active list contains duplicate slot ${slot}.`);
    }
    activeList.add(slot);
    if (value.activeTable[slot] === 0) {
      throw new RangeError(`K01 source active list slot ${slot} is not active in the table.`);
    }
  }
  if (!Array.isArray(value.entities)) {
    throw new TypeError("K01 source entities must be an array");
  }
  let previousSlot = 0;
  const sourceIndexes = new Set<number>();
  const semanticIds = new Set<string>();
  for (const entity of value.entities) {
    validateEntityRecord(entity);
    if (entity.slot <= previousSlot) {
      throw new RangeError("K01 source entities must be strictly ordered by unique slot.");
    }
    previousSlot = entity.slot;
    if (sourceIndexes.has(entity.sourceRecordIndex)) {
      throw new RangeError(`K01 source entities contain duplicate source record index ${entity.sourceRecordIndex}.`);
    }
    sourceIndexes.add(entity.sourceRecordIndex);
    if (semanticIds.has(entity.semanticUnitId)) {
      throw new RangeError(`K01 source entities contain duplicate semantic id '${entity.semanticUnitId}'.`);
    }
    semanticIds.add(entity.semanticUnitId);
    const tableActive = value.activeTable[entity.slot] !== 0;
    if (entity.active !== tableActive) {
      throw new RangeError(`K01 source entity slot ${entity.slot} active flag disagrees with active table.`);
    }
    if (entity.active !== activeList.has(entity.slot)) {
      throw new RangeError(`K01 source entity slot ${entity.slot} active flag disagrees with active list.`);
    }
  }
  for (const slot of activeList) {
    if (!value.entities.some((entity) => entity.slot === slot && entity.active)) {
      throw new RangeError(`K01 source active list slot ${slot} has no active entity record.`);
    }
  }
}

function validateOccupancy(value: unknown, runtime: K01SourceEntityRuntimeState): asserts value is K01SourceOccupancyState {
  assertPlainRecord(value, "K01 source occupancy");
  assertExactKeys(value, ["width", "height", "ownerSlots"], "K01 source occupancy");
  assertIntegerInRange(value.width, 0, 0x7fff, "K01 source occupancy width");
  assertIntegerInRange(value.height, 0, 0x7fff, "K01 source occupancy height");
  if ((value.width === 0) !== (value.height === 0)) {
    throw new RangeError("K01 source occupancy width and height must both be zero or both be positive.");
  }
  if (value.width * value.height > 0x1000000) {
    throw new RangeError("K01 source occupancy dimensions are too large.");
  }
  if (!Array.isArray(value.ownerSlots) || value.ownerSlots.length !== value.width * value.height) {
    throw new TypeError("K01 source occupancy ownerSlots length does not match width × height.");
  }
  for (const owner of value.ownerSlots) {
    assertIntegerInRange(owner, 0, K01_SOURCE_ENTITY_SLOT_MAX, "K01 source occupancy owner slot");
  }
  void runtime;
}

function validateEntityRecord(value: unknown): asserts value is K01SourceEntityRecord {
  assertPlainRecord(value, "K01 source entity record");
  assertExactKeys(value, ["slot", "generation", "semanticUnitId", "sourceRecordIndex", "originalClass", "ownerRelation", "progress", "active", "health", "position", "footprint"], "K01 source entity record");
  assertIntegerInRange(value.slot, K01_SOURCE_ENTITY_SLOT_MIN, K01_SOURCE_ENTITY_SLOT_MAX, "K01 source entity slot");
  assertIntegerInRange(value.generation, K01_SOURCE_GENERATION_MIN, K01_SOURCE_GENERATION_MAX, "K01 source entity generation");
  assertSemanticUnitId(value.semanticUnitId);
  assertIntegerInRange(value.sourceRecordIndex, K01_SOURCE_WORD_MIN, K01_SOURCE_WORD_MAX, "K01 source record index");
  assertIntegerInRange(value.originalClass, K01_SOURCE_CLASS_MIN, K01_SOURCE_CLASS_MAX, "K01 source entity class");
  assertIntegerInRange(value.ownerRelation, K01_SOURCE_OWNER_RELATION_MIN, K01_SOURCE_OWNER_RELATION_MAX, "K01 source owner/relation");
  assertIntegerInRange(value.progress, K01_SOURCE_BYTE_MIN, K01_SOURCE_BYTE_MAX, "K01 source progress");
  if (typeof value.active !== "boolean") {
    throw new TypeError("K01 source entity active must be a boolean");
  }
  assertIntegerInRange(value.health, K01_SOURCE_HEALTH_MIN, K01_SOURCE_HEALTH_MAX, "K01 source health");
  assertPlainRecord(value.position, "K01 source entity position");
  assertExactKeys(value.position, ["x", "y"], "K01 source entity position");
  assertSignedCoordinate(value.position.x, "K01 source entity x");
  assertSignedCoordinate(value.position.y, "K01 source entity y");
  validateFootprint(value.footprint);
}

function validateFootprint(value: unknown): asserts value is K01SourceEntityFootprint {
  assertPlainRecord(value, "K01 source footprint");
  assertExactKeys(value, ["width", "height", "evidence"], "K01 source footprint");
  assertIntegerInRange(value.width, 1, 0x7f, "K01 source footprint width");
  assertIntegerInRange(value.height, 1, 0x7f, "K01 source footprint height");
  if (value.evidence !== "static-confirmed" && value.evidence !== "project-adaptation") {
    throw new TypeError("K01 source footprint evidence must be static-confirmed or project-adaptation");
  }
}

function cloneRuntime(value: K01SourceEntityRuntimeState): MutableK01SourceEntityRuntimeState {
  return {
    generationCounter: value.generationCounter,
    activeTable: [...value.activeTable],
    activeList: [...value.activeList],
    reuseAges: [...value.reuseAges],
    entities: value.entities.map(cloneEntityRecord),
  };
}

function cloneOccupancy(value: K01SourceOccupancyState): MutableK01SourceOccupancyState {
  return { width: value.width, height: value.height, ownerSlots: [...value.ownerSlots] };
}

function cloneEntityRecord(value: K01SourceEntityRecord): K01SourceEntityRecord {
  return { ...value, position: { ...value.position }, footprint: { ...value.footprint } };
}

function footprintTiles(position: GridPoint, footprint: K01SourceEntityFootprint): readonly GridPoint[] {
  const tiles: GridPoint[] = [];
  const originX = position.x - Math.floor(footprint.width / 2);
  const originY = position.y - Math.floor(footprint.height / 2);
  for (let y = 0; y < footprint.height; y += 1) {
    for (let x = 0; x < footprint.width; x += 1) {
      tiles.push({ x: originX + x, y: originY + y });
    }
  }
  return tiles;
}

function assertTilesInBounds(occupancy: K01SourceOccupancyState, tiles: readonly GridPoint[], semanticUnitId: string): void {
  for (const tile of tiles) {
    if (!isTileInBounds(occupancy, tile)) {
      throw new Error(`K01 source occupancy footprint for '${semanticUnitId}' is outside map at (${tile.x},${tile.y}).`);
    }
  }
}

function isTileInBounds(occupancy: K01SourceOccupancyState, tile: GridPoint): boolean {
  return tile.x >= 0 && tile.x < occupancy.width && tile.y >= 0 && tile.y < occupancy.height;
}

function occupancyIndex(width: number, tile: GridPoint): number {
  return tile.y * width + tile.x;
}

function validateWordTable(value: unknown, label: string): asserts value is number[] {
  if (!Array.isArray(value) || value.length !== K01_SOURCE_ENTITY_TABLE_SIZE) {
    throw new TypeError(`${label} must contain exactly ${K01_SOURCE_ENTITY_TABLE_SIZE} WORD entries.`);
  }
  for (const entry of value) {
    assertIntegerInRange(entry, 0, K01_SOURCE_WORD_MAX, `${label} entry`);
  }
}

function validateSignedWordTable(value: unknown, label: string): asserts value is number[] {
  if (!Array.isArray(value) || value.length !== K01_SOURCE_ENTITY_TABLE_SIZE) {
    throw new TypeError(`${label} must contain exactly ${K01_SOURCE_ENTITY_TABLE_SIZE} signed-WORD entries.`);
  }
  for (const entry of value) {
    assertIntegerInRange(entry, -0x8000, 0x7fff, `${label} entry`);
  }
}

function assertHandle(value: unknown): asserts value is K01SourceEntityHandle {
  assertPlainRecord(value, "K01 source entity handle");
  assertExactKeys(value, ["slot", "generation"], "K01 source entity handle");
  assertIntegerInRange(value.slot, K01_SOURCE_ENTITY_SLOT_MIN, K01_SOURCE_ENTITY_SLOT_MAX, "K01 source handle slot");
  assertIntegerInRange(value.generation, K01_SOURCE_GENERATION_MIN, K01_SOURCE_GENERATION_MAX, "K01 source handle generation");
}

function assertSemanticUnitId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new TypeError("K01 source semanticUnitId must be a non-empty string without surrounding whitespace.");
  }
}

function assertSignedCoordinate(value: unknown, label: string): asserts value is number {
  assertIntegerInRange(value, K01_SOURCE_COORDINATE_MIN, K01_SOURCE_COORDINATE_MAX, label);
}

function assertMapDimensions(width: number, height: number): void {
  assertIntegerInRange(width, 1, 0x7fff, "K01 source map width");
  assertIntegerInRange(height, 1, 0x7fff, "K01 source map height");
  if (width * height > 0x1000000) {
    throw new RangeError("K01 source map dimensions are too large.");
  }
}

function wrapUnsignedWord(value: number): number {
  return ((value % 0x10000) + 0x10000) % 0x10000;
}

function wrapSignedWord(value: number): number {
  const unsigned = wrapUnsignedWord(value);
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function assertIntegerInRange(value: unknown, min: number, max: number, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer in ${min}..${max}; got ${String(value)}`);
  }
}

function assertPlainRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
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
    throw new TypeError(`${label} has unsupported field '${unsupported}'.`);
  }
}
