import type { UnitDefinitionId } from "../../shared/src/index.js";
import {
  createCategoryCapacityConstraint,
  createFixedBudgetCapacityPolicy,
  createTotalCountCapacityConstraint,
  defaultCapacityPolicyRegistry,
  type CapacityPolicy,
} from "./capacity.js";

export const K01_WAR_EXPENSE_CAPACITY_POLICY_ID = "k01:war-expense";
export const K01_WAR_EXPENSE_WITH_BUILDING_GATE_CAPACITY_POLICY_ID = "k01:war-expense-with-building-gate";
export const K01_WAR_EXPENSE_CAP = 2_500;
export const K01_WAR_EXPENSE_ENTITY_COUNT_CAP = 250;
export const K01_WAR_EXPENSE_BUILDING_COUNT_CAP = 50;

export type K01WarExpenseIdentityMapping = "exact-static-identity-source";
export type K01OriginalBuildingGateMode = "bypass" | "enabled";

/**
 * Runtime-safe identity adapter for the project kinds that currently enter
 * K01 through its source opening, reinforcement, or beacon-build paths.
 * It intentionally omits project-only and ambiguous kinds: the profile fails
 * closed instead of guessing an original class or war-expense value.
 */
export interface K01WarExpenseKindAdapter {
  readonly projectKind: UnitDefinitionId;
  readonly originalClass: number;
  readonly warExpense: number;
  readonly identityMapping: K01WarExpenseIdentityMapping;
}

export const k01WarExpenseKindAdapters = [
  { projectKind: "swordsman", originalClass: 2, warExpense: 13, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-swordsman", originalClass: 3, warExpense: 13, identityMapping: "exact-static-identity-source" },
  { projectKind: "archer", originalClass: 4, warExpense: 15, identityMapping: "exact-static-identity-source" },
  { projectKind: "villager", originalClass: 7, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "korean-monk", originalClass: 11, warExpense: 15, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-gunner", originalClass: 12, warExpense: 17, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-samurai", originalClass: 13, warExpense: 18, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-turtle-tank", originalClass: 14, warExpense: 30, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-shrine-maiden", originalClass: 16, warExpense: 15, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-farmer", originalClass: 31, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "house", originalClass: 48, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "town-center", originalClass: 49, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "barracks", originalClass: 50, warExpense: 15, identityMapping: "exact-static-identity-source" },
  { projectKind: "korean-training-command", originalClass: 51, warExpense: 15, identityMapping: "exact-static-identity-source" },
  // K01's objective/build path binds the project beacon to original class 52.
  { projectKind: "beacon", originalClass: 52, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-camp-house", originalClass: 57, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-hq", originalClass: 58, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-camp-barracks", originalClass: 60, warExpense: 15, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-camp-firehouse", originalClass: 62, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-camp-tower", originalClass: 63, warExpense: 10, identityMapping: "exact-static-identity-source" },
  { projectKind: "gwon-yul", originalClass: 76, warExpense: 0, identityMapping: "exact-static-identity-source" },
  { projectKind: "ryu-seong-ryong", originalClass: 78, warExpense: 0, identityMapping: "exact-static-identity-source" },
  { projectKind: "japanese-konishi", originalClass: 82, warExpense: 0, identityMapping: "exact-static-identity-source" },
] as const satisfies readonly K01WarExpenseKindAdapter[];

const k01WarExpenseByKind = new Map<UnitDefinitionId, K01WarExpenseKindAdapter>(
  k01WarExpenseKindAdapters.map((adapter) => [adapter.projectKind, adapter]),
);

export interface CreateK01WarExpenseCapacityPolicyOptions {
  readonly id?: string;
  /**
   * `enabled` deliberately models only the source gate's post-condition. The
   * original global WORD and player-byte predicates have no WorldState mapping,
   * so default `bypass` must be selected unless a caller opts in explicitly.
   */
  readonly originalBuildingGateMode?: K01OriginalBuildingGateMode;
}

export function getK01WarExpenseKindAdapter(kind: UnitDefinitionId): K01WarExpenseKindAdapter {
  const adapter = k01WarExpenseByKind.get(kind);

  if (!adapter) {
    throw new Error(`K01 war-expense profile has no unambiguous original-class mapping for project kind '${kind}'.`);
  }

  return adapter;
}

export function getK01WarExpenseCost(kind: UnitDefinitionId): number {
  return getK01WarExpenseKindAdapter(kind).warExpense;
}

export function createK01WarExpenseCapacityPolicy(
  options: CreateK01WarExpenseCapacityPolicyOptions = {},
): CapacityPolicy {
  const originalBuildingGateMode = options.originalBuildingGateMode ?? "bypass";
  const id = options.id ?? (
    originalBuildingGateMode === "enabled"
      ? K01_WAR_EXPENSE_WITH_BUILDING_GATE_CAPACITY_POLICY_ID
      : K01_WAR_EXPENSE_CAPACITY_POLICY_ID
  );
  const constraints = [
    createTotalCountCapacityConstraint({
      id: "original-live-entity-count",
      cap: K01_WAR_EXPENSE_ENTITY_COUNT_CAP,
      includePending: false,
    }),
  ];

  if (originalBuildingGateMode === "enabled") {
    constraints.push(createCategoryCapacityConstraint({
      id: "original-building-category-count",
      category: "building",
      cap: K01_WAR_EXPENSE_BUILDING_COUNT_CAP,
      includePending: false,
    }));
  }

  return createFixedBudgetCapacityPolicy({
    id,
    cap: K01_WAR_EXPENSE_CAP,
    costForKind: getK01WarExpenseCost,
    constraints,
  });
}

export const k01WarExpenseCapacityPolicy = createK01WarExpenseCapacityPolicy();
export const k01WarExpenseWithBuildingGateCapacityPolicy = createK01WarExpenseCapacityPolicy({
  originalBuildingGateMode: "enabled",
});

defaultCapacityPolicyRegistry.register(k01WarExpenseCapacityPolicy);
defaultCapacityPolicyRegistry.register(k01WarExpenseWithBuildingGateCapacityPolicy);
