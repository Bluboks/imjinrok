import {
  buildOriginalRyuProjectileRoute,
  ORIGINAL_RYU_PROJECTILE_EFFECT_KIND,
} from "./originalRyuProjectile.js";

export interface ProjectilePoint {
  x: number;
  y: number;
}

export type ProjectileJson = null | boolean | number | string | readonly ProjectileJson[] | ProjectileJsonRecord;

export interface ProjectileJsonRecord {
  readonly [key: string]: ProjectileJson;
}

export type ProjectilePolicyData = ProjectileJsonRecord;

export interface ProjectilePolicyBinding {
  policyId: string;
  data: ProjectilePolicyData;
}

/** Snapshot data: executable behavior is selected by this stable policy id. */
export interface ProjectileMotionState extends ProjectilePolicyBinding {}

export interface ProjectileProfile {
  id: string;
  motion: ProjectilePolicyBinding;
  collision: ProjectilePolicyBinding;
  impact: ProjectilePolicyBinding;
}

export interface ProjectileTargetReference {
  id: string;
  generation?: number;
}

export interface ProjectileState {
  id: string;
  profileId: string;
  sourceId?: string;
  targetId?: string;
  targetReference?: ProjectileTargetReference;
  payload: ProjectilePolicyData;
  start: ProjectilePoint;
  destination: ProjectilePoint;
  position: ProjectilePoint;
  motion: ProjectileMotionState;
}

export interface ProjectileSystemState {
  /** Null is a terminal, serialized allocation state after the final stable id. */
  nextProjectileSequence: number | null;
  /** Canonically ordered by generated id, never object iteration order. */
  projectiles: readonly ProjectileState[];
}

export interface SpawnProjectileRequest {
  profileId: string;
  start: ProjectilePoint;
  destination: ProjectilePoint;
  sourceId?: string;
  targetId?: string;
  targetReference?: ProjectileTargetReference;
  payload?: ProjectilePolicyData;
}

export interface ProjectileImpactEvent {
  projectileId: string;
  profileId: string;
  eventId: string;
  sourceId?: string;
  targetId?: string;
  targetReference?: ProjectileTargetReference;
  payload: ProjectilePolicyData;
  position: ProjectilePoint;
}

/** Serialized world-facing impact history entry. Executable policies are never stored here. */
export interface ProjectileImpactLogEntry extends ProjectileImpactEvent {
  tick: number;
}

export interface ProjectileMotionAdvance {
  position: ProjectilePoint;
  motion: ProjectileMotionState;
  arrived: boolean;
}

export type ProjectileCollisionOutcome = "continue" | "impact" | "expire";

export interface ProjectileMotionPolicy {
  id: string;
  createState(input: Readonly<{
    profile: ProjectileProfile;
    start: ProjectilePoint;
    destination: ProjectilePoint;
    coordinateTransform?: ProjectileCoordinateTransform;
  }>): ProjectileMotionState;
  advance(input: Readonly<{
    projectile: ProjectileState;
    profile: ProjectileProfile;
    coordinateTransform?: ProjectileCoordinateTransform;
  }>): ProjectileMotionAdvance;
  validateState(input: Readonly<{
    projectile: ProjectileState;
    profile: ProjectileProfile;
    coordinateTransform?: ProjectileCoordinateTransform;
  }>): void;
}

/**
 * Product-owned bridge between world coordinates and a source-scoped motion
 * port. A profile may select one by stable id; registries can replace it.
 */
export interface ProjectileCoordinateTransform {
  id: string;
  toSourcePoint(input: Readonly<{ point: ProjectilePoint; profile: ProjectileProfile }>): ProjectilePoint;
  toProductPoint(input: Readonly<{ point: ProjectilePoint; profile: ProjectileProfile }>): ProjectilePoint;
}

export interface ProjectileCollisionPolicy {
  id: string;
  validateProjectile(input: Readonly<{ projectile: ProjectileState; profile: ProjectileProfile }>): void;
  resolve(input: Readonly<{ projectile: ProjectileState; profile: ProjectileProfile; arrived: boolean }>): ProjectileCollisionOutcome;
}

export interface ProjectileImpactPolicy {
  id: string;
  createEvent(input: Readonly<{ projectile: ProjectileState; profile: ProjectileProfile }>): ProjectileImpactEvent | undefined;
}

type MotionPolicyInput = Readonly<{
  projectile: ProjectileState;
  profile: ProjectileProfile;
  coordinateTransform?: ProjectileCoordinateTransform;
}>;
type MotionPolicyCreateInput = Readonly<{
  profile: ProjectileProfile;
  start: ProjectilePoint;
  destination: ProjectilePoint;
  coordinateTransform?: ProjectileCoordinateTransform;
}>;
type CollisionPolicyInput = Readonly<{ projectile: ProjectileState; profile: ProjectileProfile }>;
type CollisionResolveInput = Readonly<{ projectile: ProjectileState; profile: ProjectileProfile; arrived: boolean }>;
type ImpactPolicyInput = Readonly<{ projectile: ProjectileState; profile: ProjectileProfile }>;

/** The maps are encapsulated; profiles and policy wrappers are copied and frozen. */
export interface ProjectileRegistry {
  getProfile(id: string): ProjectileProfile | undefined;
  getMotionPolicy(id: string): ProjectileMotionPolicy | undefined;
  getCollisionPolicy(id: string): ProjectileCollisionPolicy | undefined;
  getImpactPolicy(id: string): ProjectileImpactPolicy | undefined;
  /** Optional for compatibility with registries that contain no coordinate-bridged profiles. */
  getCoordinateTransform?(id: string): ProjectileCoordinateTransform | undefined;
}

export interface CreateProjectileRegistryInput {
  profiles: readonly ProjectileProfile[];
  motionPolicies: readonly ProjectileMotionPolicy[];
  collisionPolicies: readonly ProjectileCollisionPolicy[];
  impactPolicies: readonly ProjectileImpactPolicy[];
  coordinateTransforms?: readonly ProjectileCoordinateTransform[];
}

export interface AdvanceProjectileSystemResult {
  state: ProjectileSystemState;
  impacts: readonly ProjectileImpactEvent[];
}

export const PRODUCT_IMMEDIATE_MOTION_POLICY_ID = "product-motion-immediate-v1";
export const PRODUCT_LINEAR_MOTION_POLICY_ID = "product-motion-linear-v1";
export const K01_RYU_SUBTYPE_0C_MOTION_POLICY_ID = "k01-ryu-subtype-0c-motion-static-port";
export const PRODUCT_COORDINATE_ROUND_TRANSFORM_ID = "product-coordinate-round-v1";
export const PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID = "product-collision-target-at-arrival-v1";
export const PRODUCT_NO_COLLISION_POLICY_ID = "product-collision-none-v1";
export const PRODUCT_EVENT_IMPACT_POLICY_ID = "product-impact-event-v1";
export const PRODUCT_NO_IMPACT_POLICY_ID = "product-impact-none-v1";

export const PRODUCT_IMMEDIATE_PROJECTILE_PROFILE = freezeProfile({
  id: "product-immediate-targeted-v1",
  motion: { policyId: PRODUCT_IMMEDIATE_MOTION_POLICY_ID, data: {} },
  collision: { policyId: PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID, data: {} },
  impact: { policyId: PRODUCT_EVENT_IMPACT_POLICY_ID, data: { eventId: "product-generic-impact" } },
});

export const PRODUCT_LINEAR_PROJECTILE_PROFILE = freezeProfile({
  id: "product-linear-targeted-v1",
  motion: { policyId: PRODUCT_LINEAR_MOTION_POLICY_ID, data: { durationSteps: 3 } },
  collision: { policyId: PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID, data: {} },
  impact: { policyId: PRODUCT_EVENT_IMPACT_POLICY_ID, data: { eventId: "product-generic-impact" } },
});

/**
 * Opt-in adapter for only the audited subtype 0x0c route and target-arrival
 * event. Callers choose pool advances; this makes no 24 Hz or damage claim.
 */
export const K01_RYU_SUBTYPE_0C_PROJECTILE_PROFILE = freezeProfile({
  id: "k01-ryu-subtype-0c-static-port",
  motion: {
    policyId: K01_RYU_SUBTYPE_0C_MOTION_POLICY_ID,
    data: { coordinateTransformId: PRODUCT_COORDINATE_ROUND_TRANSFORM_ID },
  },
  collision: { policyId: PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID, data: {} },
  impact: {
    policyId: PRODUCT_EVENT_IMPACT_POLICY_ID,
    data: { eventId: `original-effect-kind-${ORIGINAL_RYU_PROJECTILE_EFFECT_KIND}` },
  },
});

const MAX_PROJECTILE_SEQUENCE = 999_999_999_999;

/**
 * Temporary product coordinate policy: round finite world endpoints before
 * the source port enforces its audited 0..32767 integer subset. This is not
 * an original coordinate-scale claim and is replaceable through the registry.
 */
const productCoordinateRoundTransform: ProjectileCoordinateTransform = Object.freeze({
  id: PRODUCT_COORDINATE_ROUND_TRANSFORM_ID,
  toSourcePoint: ({ point }: Readonly<{ point: ProjectilePoint; profile: ProjectileProfile }>) => {
    validatePoint(point, "product coordinate endpoint");
    return { x: Math.round(point.x), y: Math.round(point.y) };
  },
  toProductPoint: ({ point }: Readonly<{ point: ProjectilePoint; profile: ProjectileProfile }>) => {
    validatePoint(point, "source route point");
    return copyPoint(point);
  },
});

const immediateMotionPolicy: ProjectileMotionPolicy = Object.freeze({
  id: PRODUCT_IMMEDIATE_MOTION_POLICY_ID,
  createState: () => ({ policyId: PRODUCT_IMMEDIATE_MOTION_POLICY_ID, data: {} }),
  advance: ({ projectile }: MotionPolicyInput) => ({
    position: copyPoint(projectile.destination),
    motion: projectile.motion,
    arrived: true,
  }),
  validateState: ({ projectile }: MotionPolicyInput) => validateEmptyData(projectile.motion.data, "immediate motion"),
});

const linearMotionPolicy: ProjectileMotionPolicy = Object.freeze({
  id: PRODUCT_LINEAR_MOTION_POLICY_ID,
  createState: ({ profile }: MotionPolicyCreateInput) => ({
    policyId: PRODUCT_LINEAR_MOTION_POLICY_ID,
    data: { durationSteps: readPositiveInteger(profile.motion.data, "durationSteps"), elapsedSteps: 0 },
  }),
  advance: ({ projectile }: MotionPolicyInput) => {
    const durationSteps = readPositiveInteger(projectile.motion.data, "durationSteps");
    const elapsedSteps = readNonNegativeInteger(projectile.motion.data, "elapsedSteps") + 1;
    const fraction = Math.min(1, elapsedSteps / durationSteps);
    return {
      position: interpolate(projectile.start, projectile.destination, fraction),
      motion: {
        policyId: PRODUCT_LINEAR_MOTION_POLICY_ID,
        data: { durationSteps, elapsedSteps },
      },
      arrived: elapsedSteps >= durationSteps,
    };
  },
  validateState: ({ projectile, profile }: MotionPolicyInput) => {
    const durationSteps = readPositiveInteger(projectile.motion.data, "durationSteps");
    if (durationSteps !== readPositiveInteger(profile.motion.data, "durationSteps")) {
      throw new Error(`projectile ${projectile.id} linear duration does not match profile ${profile.id}`);
    }
    readNonNegativeInteger(projectile.motion.data, "elapsedSteps");
  },
});

const ryuSubtype0cMotionPolicy: ProjectileMotionPolicy = Object.freeze({
  id: K01_RYU_SUBTYPE_0C_MOTION_POLICY_ID,
  createState: ({ profile, start, destination, coordinateTransform }: MotionPolicyCreateInput) => {
    const coordinateTransformId = readStableId(profile.motion.data, "coordinateTransformId");
    if (!coordinateTransform || coordinateTransform.id !== coordinateTransformId) {
      throw new Error(`Ryu profile ${profile.id} requires coordinate transform ${coordinateTransformId}`);
    }
    const sourceStart = coordinateTransform.toSourcePoint(Object.freeze({ point: copyPoint(start), profile }));
    const sourceDestination = coordinateTransform.toSourcePoint(Object.freeze({ point: copyPoint(destination), profile }));
    validatePoint(sourceStart, "transformed Ryu start");
    validatePoint(sourceDestination, "transformed Ryu destination");
    const route = buildOriginalRyuProjectileRoute({
      startX: sourceStart.x,
      startY: sourceStart.y,
      endX: sourceDestination.x,
      endY: sourceDestination.y,
    });
    return {
      policyId: K01_RYU_SUBTYPE_0C_MOTION_POLICY_ID,
      data: { sourceRoute: route.points.map((point) => [point.x, point.y]), routeIndex: 0 },
    };
  },
  advance: ({ projectile, profile, coordinateTransform }: MotionPolicyInput) => {
    const coordinateTransformId = readStableId(profile.motion.data, "coordinateTransformId");
    if (!coordinateTransform || coordinateTransform.id !== coordinateTransformId) {
      throw new Error(`Ryu profile ${profile.id} requires coordinate transform ${coordinateTransformId}`);
    }
    const route = readRyuSourceRoute(projectile.motion.data);
    const routeIndex = readNonNegativeInteger(projectile.motion.data, "routeIndex");
    const sourcePoint = route[routeIndex];
    if (!sourcePoint) {
      throw new Error(`projectile ${projectile.id} has an invalid Ryu route index`);
    }
    const point = coordinateTransform.toProductPoint(Object.freeze({ point: sourcePoint, profile }));
    validatePoint(point, "transformed Ryu route point");
    if (routeIndex === route.length - 1) {
      return { position: point, motion: projectile.motion, arrived: true };
    }
    return {
      position: point,
      motion: {
        policyId: K01_RYU_SUBTYPE_0C_MOTION_POLICY_ID,
        data: { sourceRoute: projectile.motion.data.sourceRoute!, routeIndex: routeIndex + 1 },
      },
      arrived: false,
    };
  },
  validateState: ({ projectile }: MotionPolicyInput) => {
    const route = readRyuSourceRoute(projectile.motion.data);
    const routeIndex = readNonNegativeInteger(projectile.motion.data, "routeIndex");
    if (routeIndex >= route.length) {
      throw new RangeError("Ryu routeIndex must address a route point");
    }
  },
});

const targetAtArrivalCollisionPolicy: ProjectileCollisionPolicy = Object.freeze({
  id: PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID,
  validateProjectile: ({ projectile }: CollisionPolicyInput) => {
    if (!projectile.targetId && !projectile.targetReference) {
      throw new Error(`projectile ${projectile.id} requires targetId or targetReference`);
    }
  },
  resolve: ({ arrived }: CollisionResolveInput) => arrived ? "impact" : "continue",
});

const noCollisionPolicy: ProjectileCollisionPolicy = Object.freeze({
  id: PRODUCT_NO_COLLISION_POLICY_ID,
  validateProjectile: () => {},
  resolve: ({ arrived }: CollisionResolveInput) => arrived ? "expire" : "continue",
});

const eventImpactPolicy: ProjectileImpactPolicy = Object.freeze({
  id: PRODUCT_EVENT_IMPACT_POLICY_ID,
  createEvent: ({ projectile, profile }: ImpactPolicyInput) => ({
    projectileId: projectile.id,
    profileId: profile.id,
    eventId: readStableId(profile.impact.data, "eventId"),
    ...(projectile.sourceId ? { sourceId: projectile.sourceId } : {}),
    ...(projectile.targetId ? { targetId: projectile.targetId } : {}),
    ...(projectile.targetReference ? { targetReference: copyTargetReference(projectile.targetReference) } : {}),
    payload: cloneJsonRecord(projectile.payload),
    position: copyPoint(projectile.position),
  }),
});

const noImpactPolicy: ProjectileImpactPolicy = Object.freeze({
  id: PRODUCT_NO_IMPACT_POLICY_ID,
  createEvent: () => undefined,
});

const builtInMotionPolicies = [immediateMotionPolicy, linearMotionPolicy, ryuSubtype0cMotionPolicy];
const builtInCollisionPolicies = [targetAtArrivalCollisionPolicy, noCollisionPolicy];
const builtInImpactPolicies = [eventImpactPolicy, noImpactPolicy];

export function createProjectileRegistry(input: CreateProjectileRegistryInput): ProjectileRegistry {
  const motionPolicies = createMotionPolicyMap(input.motionPolicies);
  const collisionPolicies = createCollisionPolicyMap(input.collisionPolicies);
  const impactPolicies = createImpactPolicyMap(input.impactPolicies);
  const coordinateTransforms = createCoordinateTransformMap(input.coordinateTransforms ?? []);
  const profiles = new Map<string, ProjectileProfile>();
  for (const candidate of input.profiles) {
    const profile = freezeProfile(candidate);
    if (profiles.has(profile.id)) {
      throw new Error(`duplicate projectile profile id: ${profile.id}`);
    }
    if (!motionPolicies.has(profile.motion.policyId) || !collisionPolicies.has(profile.collision.policyId) || !impactPolicies.has(profile.impact.policyId)) {
      throw new Error(`projectile profile ${profile.id} references an unknown policy id`);
    }
    if ("coordinateTransformId" in profile.motion.data) {
      const coordinateTransformId = readStableId(profile.motion.data, "coordinateTransformId");
      if (!coordinateTransforms.has(coordinateTransformId)) {
        throw new Error(`projectile profile ${profile.id} references an unknown coordinate transform: ${coordinateTransformId}`);
      }
    }
    profiles.set(profile.id, profile);
  }
  return Object.freeze({
    getProfile: (id: string) => profiles.get(id),
    getMotionPolicy: (id: string) => motionPolicies.get(id),
    getCollisionPolicy: (id: string) => collisionPolicies.get(id),
    getImpactPolicy: (id: string) => impactPolicies.get(id),
    getCoordinateTransform: (id: string) => coordinateTransforms.get(id),
  });
}

export const PRODUCT_PROJECTILE_REGISTRY = createProjectileRegistry({
  profiles: [PRODUCT_IMMEDIATE_PROJECTILE_PROFILE, PRODUCT_LINEAR_PROJECTILE_PROFILE, K01_RYU_SUBTYPE_0C_PROJECTILE_PROFILE],
  motionPolicies: builtInMotionPolicies,
  collisionPolicies: builtInCollisionPolicies,
  impactPolicies: builtInImpactPolicies,
  coordinateTransforms: [productCoordinateRoundTransform],
});

export function createProjectileRegistryWithK01RyuSubtype0c(): ProjectileRegistry {
  return createProjectileRegistry({
    profiles: [PRODUCT_IMMEDIATE_PROJECTILE_PROFILE, PRODUCT_LINEAR_PROJECTILE_PROFILE, K01_RYU_SUBTYPE_0C_PROJECTILE_PROFILE],
    motionPolicies: builtInMotionPolicies,
    collisionPolicies: builtInCollisionPolicies,
    impactPolicies: builtInImpactPolicies,
    coordinateTransforms: [productCoordinateRoundTransform],
  });
}

export function createProjectileSystemState(): ProjectileSystemState {
  return { nextProjectileSequence: 1, projectiles: [] };
}

/**
 * Parses persisted projectile lifecycle data without requiring a particular
 * executable registry. Profile and policy availability remains an explicit
 * runtime concern when a caller advances the system with its registry.
 */
export function parseSerializedProjectileSystemState(value: unknown): ProjectileSystemState | null {
  if (!isPlainRecord(value) || !isValidSequenceOrNull(value.nextProjectileSequence) || !Array.isArray(value.projectiles)) {
    return null;
  }

  const projectiles: ProjectileState[] = [];
  let previousSequence = 0;
  for (const candidate of value.projectiles) {
    const projectile = parseSerializedProjectile(candidate);
    if (!projectile) return null;
    const sequence = tryParseProjectileId(projectile.id);
    if (sequence === null || sequence <= previousSequence) return null;
    previousSequence = sequence;
    projectiles.push(projectile);
  }

  if (value.nextProjectileSequence !== null && previousSequence >= value.nextProjectileSequence) {
    return null;
  }

  return Object.freeze({
    nextProjectileSequence: value.nextProjectileSequence,
    projectiles: Object.freeze(projectiles),
  });
}

/** Parses deterministic impact history independently of a projectile registry. */
export function parseSerializedProjectileImpactLog(value: unknown): ProjectileImpactLogEntry[] | null {
  if (!Array.isArray(value)) return null;

  const entries: ProjectileImpactLogEntry[] = [];
  let previousTick = -1;
  let previousProjectileId = "";
  for (const candidate of value) {
    const entry = parseSerializedProjectileImpactLogEntry(candidate);
    if (!entry) return null;
    if (entry.tick < previousTick || (entry.tick === previousTick && entry.projectileId <= previousProjectileId)) {
      return null;
    }
    previousTick = entry.tick;
    previousProjectileId = entry.projectileId;
    entries.push(entry);
  }

  return entries;
}

export function spawnProjectile(state: ProjectileSystemState, registry: ProjectileRegistry, request: SpawnProjectileRequest): { state: ProjectileSystemState; projectile: ProjectileState } {
  validateSystemState(state, registry);
  if (state.nextProjectileSequence === null) {
    throw new RangeError("projectile id sequence is exhausted");
  }
  const profile = getRequiredProfile(registry, request.profileId);
  validatePoint(request.start, "start");
  validatePoint(request.destination, "destination");
  validateOptionalStableId(request.sourceId, "sourceId");
  validateOptionalStableId(request.targetId, "targetId");
  validateTargetReference(request.targetReference, "targetReference");
  if (request.targetId && request.targetReference && request.targetId !== request.targetReference.id) {
    throw new Error("targetId must match targetReference.id when both are supplied");
  }
  const motionPolicy = getRequiredMotionPolicy(registry, profile.motion.policyId);
  const coordinateTransform = getProfileCoordinateTransform(registry, profile);
  const projectile: ProjectileState = {
    id: formatProjectileId(state.nextProjectileSequence),
    profileId: profile.id,
    ...(request.sourceId ? { sourceId: request.sourceId } : {}),
    ...(request.targetId ? { targetId: request.targetId } : {}),
    ...(request.targetReference ? { targetReference: copyTargetReference(request.targetReference) } : {}),
    payload: cloneJsonRecord(request.payload ?? {}),
    start: copyPoint(request.start),
    destination: copyPoint(request.destination),
    position: copyPoint(request.start),
    motion: cloneBinding(motionPolicy.createState(Object.freeze({
      profile,
      start: copyPoint(request.start),
      destination: copyPoint(request.destination),
      ...(coordinateTransform ? { coordinateTransform } : {}),
    }))),
  };
  validateProjectile(projectile, registry);
  return {
    state: {
      nextProjectileSequence: state.nextProjectileSequence === MAX_PROJECTILE_SEQUENCE ? null : state.nextProjectileSequence + 1,
      projectiles: [...state.projectiles, freezeProjectile(projectile)],
    },
    projectile: freezeProjectile(projectile),
  };
}

/** Advances all projectiles once in canonical id order; cadence remains caller-owned. */
export function advanceProjectileSystem(state: ProjectileSystemState, registry: ProjectileRegistry): AdvanceProjectileSystemResult {
  validateSystemState(state, registry);
  const projectiles: ProjectileState[] = [];
  const impacts: ProjectileImpactEvent[] = [];
  for (const storedProjectile of state.projectiles) {
    const projectile = freezeProjectile(storedProjectile);
    const profile = getRequiredProfile(registry, projectile.profileId);
    const motionPolicy = getRequiredMotionPolicy(registry, profile.motion.policyId);
    const coordinateTransform = getProfileCoordinateTransform(registry, profile);
    const advanced = motionPolicy.advance(Object.freeze({
      projectile,
      profile,
      ...(coordinateTransform ? { coordinateTransform } : {}),
    }));
    if (!advanced || typeof advanced !== "object" || typeof advanced.arrived !== "boolean") {
      throw new TypeError(`motion policy ${motionPolicy.id} must return a boolean arrived flag`);
    }
    validatePoint(advanced.position, "advanced projectile position");
    const nextProjectile = freezeProjectile({ ...projectile, position: copyPoint(advanced.position), motion: cloneBinding(advanced.motion) });
    validateProjectile(nextProjectile, registry);
    const collisionPolicy = getRequiredCollisionPolicy(registry, profile.collision.policyId);
    const outcome = collisionPolicy.resolve(Object.freeze({ projectile: nextProjectile, profile, arrived: advanced.arrived }));
    validateCollisionOutcome(outcome, collisionPolicy.id);
    if (outcome === "continue") {
      projectiles.push(nextProjectile);
      continue;
    }
    if (outcome === "impact") {
      const event = getRequiredImpactPolicy(registry, profile.impact.policyId).createEvent(Object.freeze({ projectile: nextProjectile, profile }));
      if (event) {
        impacts.push(freezeImpactEvent(event, nextProjectile, profile));
      }
    }
  }
  return {
    state: Object.freeze({ nextProjectileSequence: state.nextProjectileSequence, projectiles }),
    impacts: Object.freeze(impacts),
  };
}

function parseSerializedProjectile(value: unknown): ProjectileState | null {
  if (!isPlainRecord(value) || typeof value.id !== "string" || tryParseProjectileId(value.id) === null || !isStableId(value.profileId)) {
    return null;
  }
  if (!isPlainRecord(value.start) || !isFinitePoint(value.start) || !isPlainRecord(value.destination) || !isFinitePoint(value.destination) || !isPlainRecord(value.position) || !isFinitePoint(value.position)) {
    return null;
  }
  if ("sourceId" in value && !isStableId(value.sourceId)) return null;
  if ("targetId" in value && !isStableId(value.targetId)) return null;
  const targetReference = "targetReference" in value ? parseTargetReference(value.targetReference) : undefined;
  if ("targetReference" in value && !targetReference) return null;
  if (typeof value.targetId === "string" && targetReference && value.targetId !== targetReference.id) return null;
  const payload = parseJsonRecord(value.payload);
  const motion = parsePolicyBinding(value.motion);
  if (!payload || !motion) return null;

  return freezeProjectile({
    id: value.id,
    profileId: value.profileId,
    ...(typeof value.sourceId === "string" ? { sourceId: value.sourceId } : {}),
    ...(typeof value.targetId === "string" ? { targetId: value.targetId } : {}),
    ...(targetReference ? { targetReference } : {}),
    payload,
    start: { x: value.start.x, y: value.start.y },
    destination: { x: value.destination.x, y: value.destination.y },
    position: { x: value.position.x, y: value.position.y },
    motion,
  });
}

function parseSerializedProjectileImpactLogEntry(value: unknown): ProjectileImpactLogEntry | null {
  if (!isPlainRecord(value) || !isNonNegativeSafeInteger(value.tick) || typeof value.projectileId !== "string" || tryParseProjectileId(value.projectileId) === null || !isStableId(value.profileId) || !isStableId(value.eventId)) {
    return null;
  }
  if ("sourceId" in value && !isStableId(value.sourceId)) return null;
  if ("targetId" in value && !isStableId(value.targetId)) return null;
  const targetReference = "targetReference" in value ? parseTargetReference(value.targetReference) : undefined;
  if ("targetReference" in value && !targetReference) return null;
  if (typeof value.targetId === "string" && targetReference && value.targetId !== targetReference.id) return null;
  if (!isPlainRecord(value.position) || !isFinitePoint(value.position)) return null;
  const payload = parseJsonRecord(value.payload);
  if (!payload) return null;

  return Object.freeze({
    tick: value.tick,
    projectileId: value.projectileId,
    profileId: value.profileId,
    eventId: value.eventId,
    ...(typeof value.sourceId === "string" ? { sourceId: value.sourceId } : {}),
    ...(typeof value.targetId === "string" ? { targetId: value.targetId } : {}),
    ...(targetReference ? { targetReference } : {}),
    payload,
    position: Object.freeze({ x: value.position.x, y: value.position.y }),
  });
}

function parsePolicyBinding(value: unknown): ProjectilePolicyBinding | null {
  if (!isPlainRecord(value) || !isStableId(value.policyId)) return null;
  const data = parseJsonRecord(value.data);
  return data ? Object.freeze({ policyId: value.policyId, data }) : null;
}

function parseTargetReference(value: unknown): ProjectileTargetReference | null {
  if (!isPlainRecord(value) || !isStableId(value.id)) return null;
  if ("generation" in value && !isNonNegativeSafeInteger(value.generation)) return null;
  return Object.freeze({ id: value.id, ...(typeof value.generation === "number" ? { generation: value.generation } : {}) });
}

const INVALID_JSON = Symbol("invalid projectile JSON");

function parseJsonRecord(value: unknown): ProjectilePolicyData | null {
  if (!isPlainRecord(value)) return null;
  const copy: Record<string, ProjectileJson> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") return null;
    const parsed = parseJson(entry);
    if (parsed === INVALID_JSON) return null;
    copy[key] = parsed;
  }
  return Object.freeze(copy);
}

function parseJson(value: unknown): ProjectileJson | typeof INVALID_JSON {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID_JSON;
  if (Array.isArray(value)) {
    const entries: ProjectileJson[] = [];
    for (const entry of value) {
      const parsed = parseJson(entry);
      if (parsed === INVALID_JSON) return INVALID_JSON;
      entries.push(parsed);
    }
    return Object.freeze(entries);
  }
  return parseJsonRecord(value) ?? INVALID_JSON;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFinitePoint(value: Record<string, unknown>): value is Record<string, unknown> & ProjectilePoint {
  return typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y);
}

function isValidSequenceOrNull(value: unknown): value is number | null {
  return value === null || isNonNegativeSafeInteger(value) && value >= 1 && value <= MAX_PROJECTILE_SEQUENCE;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value === value.trim();
}

function tryParseProjectileId(id: string): number | null {
  if (!/^projectile-[0-9]{12}$/.test(id)) return null;
  const sequence = Number(id.slice("projectile-".length));
  return sequence >= 1 && sequence <= MAX_PROJECTILE_SEQUENCE && formatProjectileId(sequence) === id ? sequence : null;
}

function validateSystemState(state: ProjectileSystemState, registry: ProjectileRegistry): void {
  if (state.nextProjectileSequence !== null) {
    validateSequence(state.nextProjectileSequence, "nextProjectileSequence");
  }
  let previousSequence = 0;
  for (const projectile of state.projectiles) {
    const sequence = parseProjectileId(projectile.id);
    if (sequence <= previousSequence) {
      throw new Error("projectiles must be strictly sorted by canonical generated id");
    }
    previousSequence = sequence;
    validateProjectile(projectile, registry);
  }
  if (state.nextProjectileSequence !== null && previousSequence >= state.nextProjectileSequence) {
    throw new Error("nextProjectileSequence must allocate after every active projectile id");
  }
}

function validateProjectile(projectile: ProjectileState, registry: ProjectileRegistry): void {
  parseProjectileId(projectile.id);
  const profile = getRequiredProfile(registry, projectile.profileId);
  validatePoint(projectile.start, "projectile start");
  validatePoint(projectile.destination, "projectile destination");
  validatePoint(projectile.position, "projectile position");
  validateOptionalStableId(projectile.sourceId, "projectile sourceId");
  validateOptionalStableId(projectile.targetId, "projectile targetId");
  validateTargetReference(projectile.targetReference, "projectile targetReference");
  if (projectile.targetId && projectile.targetReference && projectile.targetId !== projectile.targetReference.id) {
    throw new Error(`projectile ${projectile.id} targetId must match targetReference.id`);
  }
  validateJsonRecord(projectile.payload, "projectile payload");
  if (projectile.motion.policyId !== profile.motion.policyId) {
    throw new Error(`projectile ${projectile.id} motion does not match profile ${profile.id}`);
  }
  const coordinateTransform = getProfileCoordinateTransform(registry, profile);
  getRequiredMotionPolicy(registry, projectile.motion.policyId).validateState(Object.freeze({
    projectile,
    profile,
    ...(coordinateTransform ? { coordinateTransform } : {}),
  }));
  getRequiredCollisionPolicy(registry, profile.collision.policyId).validateProjectile(Object.freeze({ projectile, profile }));
}

function freezeProfile(profile: ProjectileProfile): ProjectileProfile {
  validateStableId(profile.id, "projectile profile id");
  return Object.freeze({
    id: profile.id,
    motion: cloneBinding(profile.motion),
    collision: cloneBinding(profile.collision),
    impact: cloneBinding(profile.impact),
  });
}

function cloneBinding(binding: ProjectilePolicyBinding): ProjectilePolicyBinding {
  validateStableId(binding.policyId, "projectile policy id");
  return Object.freeze({ policyId: binding.policyId, data: cloneJsonRecord(binding.data) });
}

function cloneJsonRecord(record: ProjectilePolicyData): ProjectilePolicyData {
  validateJsonRecord(record, "projectile policy data");
  const copy: Record<string, ProjectileJson> = {};
  for (const [key, value] of Object.entries(record)) {
    copy[key] = cloneJson(value);
  }
  return Object.freeze(copy);
}

function cloneJson(value: ProjectileJson): ProjectileJson {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneJson));
  }
  if (isJsonRecord(value)) {
    return cloneJsonRecord(value);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError("projectile JSON numbers must be finite");
  }
  return value;
}

function validateJsonRecord(record: ProjectilePolicyData, label: string): void {
  if (!isJsonRecord(record)) {
    throw new TypeError(`${label} must be a plain JSON record`);
  }
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} objects must be plain JSON records`);
  }
  for (const key of Object.keys(record)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new RangeError(`${label} must not contain dangerous object keys`);
    }
  }
  for (const value of Object.values(record)) {
    validateJson(value, label);
  }
}

function validateJson(value: ProjectileJson, label: string): void {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError(`${label} numbers must be finite`);
  }
  if (typeof value === "number") return;
  if (Array.isArray(value)) {
    for (const entry of value) validateJson(entry, label);
    return;
  }
  if (isJsonRecord(value)) {
    validateJsonRecord(value, label);
    return;
  }
  throw new TypeError(`${label} must contain JSON-compatible values`);
}

function isJsonRecord(value: ProjectileJson): value is ProjectileJsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createMotionPolicyMap(policies: readonly ProjectileMotionPolicy[]): Map<string, ProjectileMotionPolicy> {
  const result = new Map<string, ProjectileMotionPolicy>();
  for (const policy of policies) {
    validateStableId(policy.id, "motion policy id");
    if (typeof policy.createState !== "function" || typeof policy.advance !== "function" || typeof policy.validateState !== "function") {
      throw new TypeError(`motion policy ${policy.id} must provide createState, advance, and validateState`);
    }
    if (result.has(policy.id)) throw new Error(`duplicate motion policy id: ${policy.id}`);
    result.set(policy.id, Object.freeze({ id: policy.id, createState: policy.createState, advance: policy.advance, validateState: policy.validateState }));
  }
  return result;
}

function createCollisionPolicyMap(policies: readonly ProjectileCollisionPolicy[]): Map<string, ProjectileCollisionPolicy> {
  const result = new Map<string, ProjectileCollisionPolicy>();
  for (const policy of policies) {
    validateStableId(policy.id, "collision policy id");
    if (typeof policy.validateProjectile !== "function" || typeof policy.resolve !== "function") {
      throw new TypeError(`collision policy ${policy.id} must provide validateProjectile and resolve`);
    }
    if (result.has(policy.id)) throw new Error(`duplicate collision policy id: ${policy.id}`);
    result.set(policy.id, Object.freeze({ id: policy.id, validateProjectile: policy.validateProjectile, resolve: policy.resolve }));
  }
  return result;
}

function createImpactPolicyMap(policies: readonly ProjectileImpactPolicy[]): Map<string, ProjectileImpactPolicy> {
  const result = new Map<string, ProjectileImpactPolicy>();
  for (const policy of policies) {
    validateStableId(policy.id, "impact policy id");
    if (typeof policy.createEvent !== "function") throw new TypeError(`impact policy ${policy.id} must provide createEvent`);
    if (result.has(policy.id)) throw new Error(`duplicate impact policy id: ${policy.id}`);
    result.set(policy.id, Object.freeze({ id: policy.id, createEvent: policy.createEvent }));
  }
  return result;
}

function createCoordinateTransformMap(
  transforms: readonly ProjectileCoordinateTransform[],
): Map<string, ProjectileCoordinateTransform> {
  const result = new Map<string, ProjectileCoordinateTransform>();
  for (const transform of transforms) {
    validateStableId(transform.id, "coordinate transform id");
    if (typeof transform.toSourcePoint !== "function" || typeof transform.toProductPoint !== "function") {
      throw new TypeError(`coordinate transform ${transform.id} must provide toSourcePoint and toProductPoint`);
    }
    if (result.has(transform.id)) throw new Error(`duplicate coordinate transform id: ${transform.id}`);
    result.set(transform.id, Object.freeze({
      id: transform.id,
      toSourcePoint: transform.toSourcePoint,
      toProductPoint: transform.toProductPoint,
    }));
  }
  return result;
}

function getRequiredProfile(registry: ProjectileRegistry, id: string): ProjectileProfile {
  validateStableId(id, "projectile profileId");
  const profile = registry.getProfile(id);
  if (!profile) throw new Error(`unknown projectile profile: ${id}`);
  return profile;
}

function getProfileCoordinateTransform(
  registry: ProjectileRegistry,
  profile: ProjectileProfile,
): ProjectileCoordinateTransform | undefined {
  if (!("coordinateTransformId" in profile.motion.data)) {
    return undefined;
  }
  const id = readStableId(profile.motion.data, "coordinateTransformId");
  const transform = registry.getCoordinateTransform?.(id);
  if (!transform) throw new Error(`unknown projectile coordinate transform: ${id}`);
  if (transform.id !== id) throw new Error(`projectile coordinate transform lookup returned ${transform.id} for ${id}`);
  return transform;
}

function getRequiredMotionPolicy(registry: ProjectileRegistry, id: string): ProjectileMotionPolicy {
  const policy = registry.getMotionPolicy(id);
  if (!policy) throw new Error(`unknown projectile motion policy: ${id}`);
  return policy;
}

function getRequiredCollisionPolicy(registry: ProjectileRegistry, id: string): ProjectileCollisionPolicy {
  const policy = registry.getCollisionPolicy(id);
  if (!policy) throw new Error(`unknown projectile collision policy: ${id}`);
  return policy;
}

function getRequiredImpactPolicy(registry: ProjectileRegistry, id: string): ProjectileImpactPolicy {
  const policy = registry.getImpactPolicy(id);
  if (!policy) throw new Error(`unknown projectile impact policy: ${id}`);
  return policy;
}

function freezeProjectile(projectile: ProjectileState): ProjectileState {
  return Object.freeze({
    ...projectile,
    ...(projectile.sourceId ? { sourceId: projectile.sourceId } : {}),
    ...(projectile.targetId ? { targetId: projectile.targetId } : {}),
    ...(projectile.targetReference ? { targetReference: copyTargetReference(projectile.targetReference) } : {}),
    payload: cloneJsonRecord(projectile.payload),
    start: Object.freeze(copyPoint(projectile.start)),
    destination: Object.freeze(copyPoint(projectile.destination)),
    position: Object.freeze(copyPoint(projectile.position)),
    motion: cloneBinding(projectile.motion),
  });
}

function freezeImpactEvent(
  event: ProjectileImpactEvent,
  projectile: ProjectileState,
  profile: ProjectileProfile,
): ProjectileImpactEvent {
  if (event.projectileId !== projectile.id || event.profileId !== profile.id) {
    throw new Error("projectile impact event must identify the current projectile and profile");
  }
  validateStableId(event.eventId, "projectile impact eventId");
  validateOptionalStableId(event.sourceId, "projectile impact sourceId");
  validateOptionalStableId(event.targetId, "projectile impact targetId");
  if (event.sourceId !== projectile.sourceId || event.targetId !== projectile.targetId) {
    throw new Error("projectile impact event sourceId and targetId must match the projectile");
  }
  validateTargetReference(event.targetReference, "projectile impact targetReference");
  if (!targetReferencesMatch(event.targetReference, projectile.targetReference)) {
    throw new Error("projectile impact event targetReference must match the projectile");
  }
  validateJsonRecord(event.payload, "projectile impact payload");
  validatePoint(event.position, "projectile impact position");
  return Object.freeze({
    ...event,
    ...(event.targetReference ? { targetReference: copyTargetReference(event.targetReference) } : {}),
    payload: cloneJsonRecord(event.payload),
    position: Object.freeze(copyPoint(event.position)),
  });
}

function validateCollisionOutcome(outcome: ProjectileCollisionOutcome, policyId: string): void {
  if (outcome !== "continue" && outcome !== "impact" && outcome !== "expire") {
    throw new RangeError(`collision policy ${policyId} returned an invalid lifecycle outcome`);
  }
}

function readPositiveInteger(data: ProjectilePolicyData, key: string): number {
  const value = data[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new RangeError(`${key} must be a positive safe integer`);
  return value;
}

function readNonNegativeInteger(data: ProjectilePolicyData, key: string): number {
  const value = data[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new RangeError(`${key} must be a non-negative safe integer`);
  return value;
}

function readStableId(data: ProjectilePolicyData, key: string): string {
  const value = data[key];
  if (typeof value !== "string") throw new TypeError(`${key} must be a stable id string`);
  validateStableId(value, key);
  return value;
}

function readRyuSourceRoute(data: ProjectilePolicyData): ProjectilePoint[] {
  const rawRoute = data.sourceRoute;
  if (!Array.isArray(rawRoute) || rawRoute.length === 0) {
    throw new RangeError("Ryu source route must contain at least one point");
  }
  return rawRoute.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || !Number.isInteger(entry[0]) || !Number.isInteger(entry[1]) || entry[0] < 0 || entry[0] > 0x7fff || entry[1] < 0 || entry[1] > 0x7fff) {
      throw new RangeError("Ryu source route points must use the audited 0..32767 subset");
    }
    return { x: entry[0], y: entry[1] };
  });
}

function validateEmptyData(data: ProjectilePolicyData, label: string): void {
  if (Object.keys(data).length !== 0) throw new Error(`${label} does not accept policy data`);
}

function parseProjectileId(id: string): number {
  if (!/^projectile-[0-9]{12}$/.test(id)) throw new RangeError("projectile id must use canonical projectile-############ format");
  const sequence = Number(id.slice("projectile-".length));
  if (sequence < 1 || sequence > MAX_PROJECTILE_SEQUENCE || formatProjectileId(sequence) !== id) {
    throw new RangeError("projectile id must be a canonical generated sequence");
  }
  return sequence;
}

function formatProjectileId(sequence: number): string {
  validateSequence(sequence, "projectile sequence");
  return `projectile-${String(sequence).padStart(12, "0")}`;
}

function validateSequence(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PROJECTILE_SEQUENCE) {
    throw new RangeError(`${label} must be a positive safe integer no greater than ${MAX_PROJECTILE_SEQUENCE}`);
  }
}

function interpolate(start: ProjectilePoint, destination: ProjectilePoint, fraction: number): ProjectilePoint {
  return { x: start.x + (destination.x - start.x) * fraction, y: start.y + (destination.y - start.y) * fraction };
}

function copyPoint(point: ProjectilePoint): ProjectilePoint {
  return { x: point.x, y: point.y };
}

function validatePoint(point: ProjectilePoint, label: string): void {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError(`${label} must contain finite x and y coordinates`);
}

function validateOptionalStableId(value: string | undefined, label: string): void {
  if (value !== undefined) validateStableId(value, label);
}

function validateTargetReference(value: ProjectileTargetReference | undefined, label: string): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object") throw new TypeError(`${label} must be a target reference`);
  validateStableId(value.id, `${label}.id`);
  if (value.generation !== undefined && (!Number.isSafeInteger(value.generation) || value.generation < 0)) {
    throw new RangeError(`${label}.generation must be a non-negative safe integer`);
  }
}

function targetReferencesMatch(
  left: ProjectileTargetReference | undefined,
  right: ProjectileTargetReference | undefined,
): boolean {
  return left?.id === right?.id && left?.generation === right?.generation;
}

function copyTargetReference(reference: ProjectileTargetReference): ProjectileTargetReference {
  return Object.freeze({
    id: reference.id,
    ...(reference.generation === undefined ? {} : { generation: reference.generation }),
  });
}

function validateStableId(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new TypeError(`${label} must be a non-empty trimmed string`);
  }
}
