import { unitDefinitions, type UnitDefinition, type UnitDefinitionId } from "../../shared/src/index.js";
import { isUnitUnderConstruction } from "./construction.js";
import type { WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

export const DEFAULT_POPULATION_LIMIT = 50;
export const CORE_PROVIDER_SUPPLY_CAPACITY_POLICY_ID = "core:provider-supply";
export const CORE_UNCAPPED_CAPACITY_POLICY_ID = "core:uncapped";

export type CapacityRejectionReason = "capacity-exceeded" | "constraint-rejected";
export type CapacityEntryLocation = "live" | "pending";
export type CapacityUnitCategory = UnitDefinition["category"];

export interface CapacityEntry {
  readonly kind: UnitDefinitionId;
  readonly category: CapacityUnitCategory;
  readonly location: CapacityEntryLocation;
  readonly sourceUnitId: string;
  readonly queueItemId?: string;
}

export interface CapacityAdmissionRequest {
  readonly kind: UnitDefinitionId;
}

export interface CapacityPolicyContext {
  readonly state: WorldState;
  readonly playerId: string;
  readonly entries: readonly CapacityEntry[];
  readonly request?: CapacityAdmissionRequest;
}

export interface CapacityConstraintOutcome {
  readonly used: number;
  readonly pending: number;
  readonly requested: number;
  readonly cap: number | null;
  readonly unlimited: boolean;
  readonly available: number | null;
  readonly admitted: boolean;
  readonly rejectionReason?: CapacityRejectionReason;
}

export interface CapacityConstraintResult extends CapacityConstraintOutcome {
  readonly constraintId: string;
}

export interface CapacityConstraint {
  readonly id: string;
  evaluate(context: CapacityPolicyContext): CapacityConstraintOutcome;
}

/**
 * Executable policy definitions live in registries. World snapshots may store
 * stable ids, but never these functions or constraint instances.
 */
export interface CapacityPolicy {
  readonly id: string;
  readonly constraints: readonly CapacityConstraint[];
}

export interface CapacityEvaluation {
  readonly policyId: string;
  readonly liveEntryCount: number;
  readonly pendingEntryCount: number;
  readonly constraints: readonly CapacityConstraintResult[];
}

export interface CapacityRejection {
  readonly constraintId: string;
  readonly reason: CapacityRejectionReason;
}

export interface CapacityAdmissionResult {
  readonly admitted: boolean;
  readonly evaluation: CapacityEvaluation;
  readonly rejection: CapacityRejection | null;
}

export interface ProviderSupplyCapacityState {
  readonly used: number;
  readonly pending: number;
  readonly provided: number;
  readonly cap: number;
  readonly limit: number;
  readonly available: number;
}

export interface CreateProviderSupplyCapacityPolicyOptions {
  readonly id?: string;
  readonly limit?: number;
}

export interface CreateFixedBudgetCapacityPolicyOptions {
  readonly id: string;
  readonly cap: number;
  readonly costForKind?: (kind: UnitDefinitionId) => number;
  readonly constraints?: readonly CapacityConstraint[];
}

export interface CreateUncappedCapacityPolicyOptions {
  readonly id?: string;
  readonly constraints?: readonly CapacityConstraint[];
}

export interface CreateCategoryCapacityConstraintOptions {
  readonly id: string;
  readonly category: CapacityUnitCategory;
  readonly cap: number;
  /** Queued production reserves capacity unless a policy explicitly excludes it. */
  readonly includePending?: boolean;
}

export interface CreateKindCapacityConstraintOptions {
  readonly id: string;
  readonly kind: UnitDefinitionId;
  readonly cap: number;
  /** Queued production reserves capacity unless a policy explicitly excludes it. */
  readonly includePending?: boolean;
}

export interface CreateTotalCountCapacityConstraintOptions {
  readonly id: string;
  readonly cap: number;
  /** Queued production reserves capacity unless a policy explicitly excludes it. */
  readonly includePending?: boolean;
}

export interface RegisterCapacityPolicyOptions {
  /** Replaces the policy currently registered for this exact stable id. */
  readonly replace?: boolean;
}

export class CapacityPolicyRegistry {
  private readonly policies = new Map<string, CapacityPolicy>();

  register(policy: CapacityPolicy, options: RegisterCapacityPolicyOptions = {}): void {
    validatePolicy(policy);

    if (this.policies.has(policy.id) && options.replace !== true) {
      throw new Error(`Capacity policy '${policy.id}' is already registered.`);
    }

    this.policies.set(policy.id, policy);
  }

  require(id: string): CapacityPolicy {
    assertStableId(id, "Capacity policy");
    const policy = this.policies.get(id);

    if (!policy) {
      throw new Error(`Unknown capacity policy '${id}'. Register its policy before evaluation.`);
    }

    return policy;
  }

  has(id: string): boolean {
    return this.policies.has(id);
  }

  unregister(id: string): void {
    this.policies.delete(id);
  }

  ids(): readonly string[] {
    return Object.freeze([...this.policies.keys()].sort());
  }
}

export const coreProviderSupplyCapacityPolicy = createProviderSupplyCapacityPolicy();
export const coreUncappedCapacityPolicy = createUncappedCapacityPolicy();
export const defaultCapacityPolicyRegistry = new CapacityPolicyRegistry();

defaultCapacityPolicyRegistry.register(coreProviderSupplyCapacityPolicy);
defaultCapacityPolicyRegistry.register(coreUncappedCapacityPolicy);

export function registerCapacityPolicy(
  policy: CapacityPolicy,
  options?: RegisterCapacityPolicyOptions,
): () => void {
  defaultCapacityPolicyRegistry.register(policy, options);
  return () => {
    defaultCapacityPolicyRegistry.unregister(policy.id);
  };
}

export function requireCapacityPolicy(id: string): CapacityPolicy {
  return defaultCapacityPolicyRegistry.require(id);
}

export function createProviderSupplyCapacityPolicy(
  options: CreateProviderSupplyCapacityPolicyOptions = {},
): CapacityPolicy {
  const limit = options.limit ?? DEFAULT_POPULATION_LIMIT;
  assertCapacityValue(limit, "Provider supply capacity limit");

  return createCapacityPolicy({
    id: options.id ?? CORE_PROVIDER_SUPPLY_CAPACITY_POLICY_ID,
    constraints: [createProviderSupplyCapacityConstraint(limit)],
  });
}

export function createFixedBudgetCapacityPolicy(
  options: CreateFixedBudgetCapacityPolicyOptions,
): CapacityPolicy {
  assertCapacityValue(options.cap, "Fixed budget capacity cap");
  const costForKind = options.costForKind ?? getPopulationCost;

  return createCapacityPolicy({
    id: options.id,
    constraints: [createCostBudgetCapacityConstraint("fixed-budget", options.cap, costForKind), ...(options.constraints ?? [])],
  });
}

export function createUncappedCapacityPolicy(
  options: CreateUncappedCapacityPolicyOptions = {},
): CapacityPolicy {
  return createCapacityPolicy({
    id: options.id ?? CORE_UNCAPPED_CAPACITY_POLICY_ID,
    constraints: [createUncappedCapacityConstraint(), ...(options.constraints ?? [])],
  });
}

export function createCapacityPolicy(policy: CapacityPolicy): CapacityPolicy {
  validatePolicy(policy);
  return Object.freeze({
    id: policy.id,
    constraints: Object.freeze([...policy.constraints]),
  });
}

export function createCategoryCapacityConstraint(
  options: CreateCategoryCapacityConstraintOptions,
): CapacityConstraint {
  assertStableId(options.id, "Capacity constraint");
  assertCapacityValue(options.cap, "Category capacity cap");

  return createCountCapacityConstraint(
    options.id,
    options.cap,
    options.includePending ?? true,
    (entry) => entry.category === options.category,
    (kind) => unitDefinitions[kind].category === options.category,
  );
}

export function createKindCapacityConstraint(options: CreateKindCapacityConstraintOptions): CapacityConstraint {
  assertStableId(options.id, "Capacity constraint");
  assertCapacityValue(options.cap, "Kind capacity cap");

  return createCountCapacityConstraint(
    options.id,
    options.cap,
    options.includePending ?? true,
    (entry) => entry.kind === options.kind,
    (kind) => kind === options.kind,
  );
}

export function createTotalCountCapacityConstraint(
  options: CreateTotalCountCapacityConstraintOptions,
): CapacityConstraint {
  assertStableId(options.id, "Capacity constraint");
  assertCapacityValue(options.cap, "Total count capacity cap");

  return createCountCapacityConstraint(options.id, options.cap, options.includePending ?? true, () => true, () => true);
}

export function evaluatePlayerCapacity(
  state: WorldState,
  playerId: string,
  policyReference: string | CapacityPolicy = CORE_PROVIDER_SUPPLY_CAPACITY_POLICY_ID,
): CapacityEvaluation {
  return evaluateCapacity(state, playerId, resolvePolicy(policyReference));
}

export function canAdmitPlayerCapacity(
  state: WorldState,
  playerId: string,
  kind: UnitDefinitionId,
  policyReference: string | CapacityPolicy = CORE_PROVIDER_SUPPLY_CAPACITY_POLICY_ID,
): CapacityAdmissionResult {
  const evaluation = evaluateCapacity(state, playerId, resolvePolicy(policyReference), Object.freeze({ kind }));
  const rejectedConstraint = evaluation.constraints.find((constraint) => !constraint.admitted);
  const rejection = rejectedConstraint
    ? Object.freeze({
        constraintId: rejectedConstraint.constraintId,
        reason: rejectedConstraint.rejectionReason ?? "constraint-rejected",
      })
    : null;

  return Object.freeze({
    admitted: rejection === null,
    evaluation,
    rejection,
  });
}

/** Existing provider-supply summary, factored so compatibility wrappers and the policy share one calculation. */
export function getProviderSupplyCapacityState(
  state: WorldState,
  playerId: string,
  limit = DEFAULT_POPULATION_LIMIT,
): ProviderSupplyCapacityState {
  return summarizeProviderSupply(createCapacityContext(state, playerId), limit);
}

export function getPopulationCost(kind: UnitDefinitionId): number {
  return Math.max(0, (unitDefinitions[kind] as UnitDefinition).populationCost ?? 0);
}

export function getPopulationProvided(kind: UnitDefinitionId): number {
  return Math.max(0, (unitDefinitions[kind] as UnitDefinition).populationProvided ?? 0);
}

function evaluateCapacity(
  state: WorldState,
  playerId: string,
  policy: CapacityPolicy,
  request?: CapacityAdmissionRequest,
): CapacityEvaluation {
  const context = createCapacityContext(state, playerId, request);
  const constraints = policy.constraints.map((constraint) => toConstraintResult(constraint, context));
  const liveEntryCount = context.entries.filter((entry) => entry.location === "live").length;

  return Object.freeze({
    policyId: policy.id,
    liveEntryCount,
    pendingEntryCount: context.entries.length - liveEntryCount,
    constraints: Object.freeze(constraints),
  });
}

function createCapacityContext(
  state: WorldState,
  playerId: string,
  request?: CapacityAdmissionRequest,
): CapacityPolicyContext {
  const entries: CapacityEntry[] = [];

  for (const unit of iterateUnitsOrdered(state)) {
    if (unit.playerId !== playerId) {
      continue;
    }

    entries.push(Object.freeze({
      kind: unit.kind,
      category: unitDefinitions[unit.kind].category,
      location: "live",
      sourceUnitId: unit.id,
    }));

    for (const queueItem of unit.productionQueue ?? []) {
      entries.push(Object.freeze({
        kind: queueItem.unit,
        category: unitDefinitions[queueItem.unit].category,
        location: "pending",
        sourceUnitId: unit.id,
        queueItemId: queueItem.id,
      }));
    }
  }

  return Object.freeze({
    state,
    playerId,
    entries: Object.freeze(entries),
    ...(request ? { request } : {}),
  });
}

function createProviderSupplyCapacityConstraint(limit: number): CapacityConstraint {
  return Object.freeze({
    id: "provider-supply",
    evaluate(context: CapacityPolicyContext) {
      const summary = summarizeProviderSupply(context, limit);
      const requested = context.request ? getPopulationCost(context.request.kind) : 0;
      return buildBudgetOutcome(summary.used, summary.pending, requested, summary.cap);
    },
  });
}

function createUncappedCapacityConstraint(): CapacityConstraint {
  return Object.freeze({
    id: "uncapped",
    evaluate() {
      return Object.freeze({
        used: 0,
        pending: 0,
        requested: 0,
        cap: null,
        unlimited: true,
        available: null,
        admitted: true,
      });
    },
  });
}

function createCostBudgetCapacityConstraint(
  id: string,
  cap: number,
  costForKind: (kind: UnitDefinitionId) => number,
): CapacityConstraint {
  return Object.freeze({
    id,
    evaluate(context: CapacityPolicyContext) {
      const used = sumEntryCost(context.entries, "live", costForKind);
      const pending = sumEntryCost(context.entries, "pending", costForKind);
      const requested = context.request ? normalizeCost(costForKind(context.request.kind)) : 0;
      return buildBudgetOutcome(used, pending, requested, cap);
    },
  });
}

function createCountCapacityConstraint(
  id: string,
  cap: number,
  includePending: boolean,
  matchesEntry: (entry: CapacityEntry) => boolean,
  matchesRequest: (kind: UnitDefinitionId) => boolean,
): CapacityConstraint {
  return Object.freeze({
    id,
    evaluate(context: CapacityPolicyContext) {
      const used = context.entries.filter((entry) => entry.location === "live" && matchesEntry(entry)).length;
      const pending = includePending
        ? context.entries.filter((entry) => entry.location === "pending" && matchesEntry(entry)).length
        : 0;
      const requested = context.request && matchesRequest(context.request.kind) ? 1 : 0;
      return buildBudgetOutcome(used, pending, requested, cap);
    },
  });
}

function summarizeProviderSupply(context: CapacityPolicyContext, limit: number): ProviderSupplyCapacityState {
  let used = 0;
  let pending = 0;
  let provided = 0;

  for (const unit of iterateUnitsOrdered(context.state)) {
    if (unit.playerId !== context.playerId) {
      continue;
    }

    used += getPopulationCost(unit.kind);

    if (!isUnitUnderConstruction(unit)) {
      provided += getPopulationProvided(unit.kind);
    }

    for (const queueItem of unit.productionQueue ?? []) {
      pending += getPopulationCost(queueItem.unit);
    }
  }

  const cap = Math.min(Math.max(0, limit), Math.max(0, provided));
  return {
    used,
    pending,
    provided,
    cap,
    limit,
    available: Math.max(0, cap - used - pending),
  };
}

function buildBudgetOutcome(used: number, pending: number, requested: number, cap: number): CapacityConstraintOutcome {
  const available = Math.max(0, cap - used - pending);
  const admitted = requested <= available;

  return Object.freeze({
    used,
    pending,
    requested,
    cap,
    unlimited: false,
    available,
    admitted,
    ...(admitted ? {} : { rejectionReason: "capacity-exceeded" as const }),
  });
}

function sumEntryCost(
  entries: readonly CapacityEntry[],
  location: CapacityEntryLocation,
  costForKind: (kind: UnitDefinitionId) => number,
): number {
  return entries
    .filter((entry) => entry.location === location)
    .reduce((total, entry) => total + normalizeCost(costForKind(entry.kind)), 0);
}

function normalizeCost(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Capacity costs must be finite non-negative numbers.");
  }

  return value;
}

function toConstraintResult(constraint: CapacityConstraint, context: CapacityPolicyContext): CapacityConstraintResult {
  const outcome = constraint.evaluate(context);
  validateConstraintOutcome(constraint.id, outcome);
  return Object.freeze({ constraintId: constraint.id, ...outcome });
}

function resolvePolicy(policyReference: string | CapacityPolicy): CapacityPolicy {
  return typeof policyReference === "string" ? requireCapacityPolicy(policyReference) : createCapacityPolicy(policyReference);
}

function validatePolicy(policy: CapacityPolicy): void {
  assertStableId(policy.id, "Capacity policy");
  const constraintIds = new Set<string>();

  for (const constraint of policy.constraints) {
    assertStableId(constraint.id, "Capacity constraint");
    if (typeof constraint.evaluate !== "function") {
      throw new Error(`Capacity constraint '${constraint.id}' must provide evaluate.`);
    }
    if (constraintIds.has(constraint.id)) {
      throw new Error(`Capacity policy '${policy.id}' contains duplicate constraint '${constraint.id}'.`);
    }
    constraintIds.add(constraint.id);
  }
}

function validateConstraintOutcome(constraintId: string, outcome: CapacityConstraintOutcome): void {
  for (const value of [outcome.used, outcome.pending, outcome.requested]) {
    normalizeCost(value);
  }

  if (outcome.cap !== null) {
    assertCapacityValue(outcome.cap, `Capacity constraint '${constraintId}' cap`);
  }
  if (outcome.available !== null) {
    assertCapacityValue(outcome.available, `Capacity constraint '${constraintId}' available`);
  }
  if (outcome.unlimited && (outcome.cap !== null || outcome.available !== null)) {
    throw new Error(`Unlimited capacity constraint '${constraintId}' must use null cap and available values.`);
  }
}

function assertCapacityValue(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

function assertStableId(id: string, label: string): void {
  if (!id.trim()) {
    throw new Error(`${label} id must not be empty.`);
  }
  if (id !== id.trim()) {
    throw new Error(`${label} id '${id}' must not have surrounding whitespace.`);
  }
}
