import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap } from "../../shared/src/index.js";
import {
  canAdmitPlayerCapacity,
  createCapacityPolicy,
  createCategoryCapacityConstraint,
  createFixedBudgetCapacityPolicy,
  createKindCapacityConstraint,
  createProviderSupplyCapacityPolicy,
  createUncappedCapacityPolicy,
  createInitialWorldState,
  evaluatePlayerCapacity,
  getPlayerPopulationState,
  getProviderSupplyCapacityState,
  registerCapacityPolicy,
} from "./index.js";
import { createUnitState } from "./entities.js";

function createCapacityFixture() {
  const state = createInitialWorldState(createBlankMap({ width: 20, height: 20 }), ["p1"]);
  state.units = {};
  return state;
}

function addUnit(
  state: ReturnType<typeof createCapacityFixture>,
  id: string,
  kind: "town-center" | "house" | "villager" | "swordsman" | "archer" | "gwon-yul",
) {
  const unit = createUnitState(id, "p1", kind, { x: 2, y: 2 });
  state.units[id] = unit;
  return unit;
}

function queueUnit(unit: ReturnType<typeof addUnit>, id: string, kind: "villager" | "swordsman" | "archer" | "gwon-yul") {
  unit.productionQueue = [{ id, unit: kind, remainingTicks: 1, totalTicks: 1 }];
}

test("provider supply policy retains the exact legacy population summary", () => {
  const state = createCapacityFixture();
  const townCenter = addUnit(state, "town-center", "town-center");
  addUnit(state, "villager", "villager");
  queueUnit(townCenter, "queued-swordsman", "swordsman");

  const legacy = getPlayerPopulationState(state, "p1", 8);
  const providerAdapter = getProviderSupplyCapacityState(state, "p1", 8);
  const policy = createProviderSupplyCapacityPolicy({ id: "test:provider", limit: 8 });
  const evaluation = evaluatePlayerCapacity(state, "p1", policy);

  assert.deepEqual(legacy, providerAdapter);
  assert.deepEqual(legacy, { used: 1, pending: 1, provided: 10, cap: 8, limit: 8, available: 6 });
  assert.deepEqual(evaluation.constraints[0], {
    constraintId: "provider-supply",
    used: 1,
    pending: 1,
    requested: 0,
    cap: 8,
    unlimited: false,
    available: 6,
    admitted: true,
  });
  assert.equal(Object.isFrozen(evaluation), true);
  assert.equal(Object.isFrozen(evaluation.constraints), true);
  assert.equal(Object.isFrozen(evaluation.constraints[0]), true);
  assert.equal(Object.isFrozen(canAdmitPlayerCapacity(state, "p1", "swordsman", policy)), true);
  assert.equal(getPlayerPopulationState(state, "p1", Number.POSITIVE_INFINITY).cap, 10);
});

test("provider supply excludes under-construction providers", () => {
  const state = createCapacityFixture();
  addUnit(state, "town-center", "town-center");
  const house = addUnit(state, "house", "house");
  house.construction = { remainingTicks: 1, totalTicks: 10 };

  assert.deepEqual(getProviderSupplyCapacityState(state, "p1"), {
    used: 0,
    pending: 0,
    provided: 10,
    cap: 10,
    limit: 50,
    available: 10,
  });
});

test("fixed budget counts live and queued costs while allowing a zero-cost hero", () => {
  const state = createCapacityFixture();
  const townCenter = addUnit(state, "town-center", "town-center");
  addUnit(state, "swordsman", "swordsman");
  queueUnit(townCenter, "queued-swordsman", "swordsman");
  const policy = createFixedBudgetCapacityPolicy({
    id: "test:war-expense",
    cap: 2,
    costForKind: (kind) => (kind === "gwon-yul" ? 0 : kind === "swordsman" ? 1 : 0),
  });

  const evaluation = evaluatePlayerCapacity(state, "p1", policy);
  assert.deepEqual(evaluation.constraints[0], {
    constraintId: "fixed-budget",
    used: 1,
    pending: 1,
    requested: 0,
    cap: 2,
    unlimited: false,
    available: 0,
    admitted: true,
  });
  assert.equal(canAdmitPlayerCapacity(state, "p1", "gwon-yul", policy).admitted, true);
  assert.equal(canAdmitPlayerCapacity(state, "p1", "swordsman", policy).admitted, false);
});

test("uncapped policies publish a serializable unlimited result", () => {
  const state = createCapacityFixture();
  const policy = createUncappedCapacityPolicy({ id: "test:uncapped" });
  const result = canAdmitPlayerCapacity(state, "p1", "swordsman", policy);

  assert.equal(result.admitted, true);
  assert.deepEqual(result.evaluation.constraints[0], {
    constraintId: "uncapped",
    used: 0,
    pending: 0,
    requested: 0,
    cap: null,
    unlimited: true,
    available: null,
    admitted: true,
  });
});

test("uncapped policies can impose a building category cap", () => {
  const state = createCapacityFixture();
  addUnit(state, "house", "house");
  const policy = createUncappedCapacityPolicy({
    id: "test:building-cap",
    constraints: [createCategoryCapacityConstraint({ id: "buildings", category: "building", cap: 1 })],
  });

  const admission = canAdmitPlayerCapacity(state, "p1", "town-center", policy);
  assert.equal(admission.admitted, false);
  assert.deepEqual(admission.rejection, { constraintId: "buildings", reason: "capacity-exceeded" });
});

test("exact-kind caps include pending production reservations", () => {
  const state = createCapacityFixture();
  const townCenter = addUnit(state, "town-center", "town-center");
  addUnit(state, "swordsman", "swordsman");
  queueUnit(townCenter, "queued-swordsman", "swordsman");
  const policy = createUncappedCapacityPolicy({
    id: "test:swordsman-cap",
    constraints: [createKindCapacityConstraint({ id: "swordsmen", kind: "swordsman", cap: 2 })],
  });

  assert.equal(canAdmitPlayerCapacity(state, "p1", "swordsman", policy).admitted, false);
  assert.equal(canAdmitPlayerCapacity(state, "p1", "archer", policy).admitted, true);
});

test("multiple constraints reject in declared deterministic order", () => {
  const state = createCapacityFixture();
  addUnit(state, "swordsman", "swordsman");
  const policy = createUncappedCapacityPolicy({
    id: "test:ordered-constraints",
    constraints: [
      createKindCapacityConstraint({ id: "first-kind", kind: "swordsman", cap: 1 }),
      createCategoryCapacityConstraint({ id: "second-category", category: "infantry", cap: 1 }),
    ],
  });

  const admission = canAdmitPlayerCapacity(state, "p1", "swordsman", policy);
  assert.deepEqual(admission.rejection, { constraintId: "first-kind", reason: "capacity-exceeded" });
  assert.equal(admission.evaluation.constraints[2]?.constraintId, "second-category");
  assert.equal(admission.evaluation.constraints[2]?.admitted, false);
});

test("custom registered policies remain registry-owned and deterministic", () => {
  const unregister = registerCapacityPolicy(createCapacityPolicy({
    id: "test:custom-policy",
    constraints: [{
      id: "deny-archers",
      evaluate: ({ request }) => ({
        used: 0,
        pending: 0,
        requested: request?.kind === "archer" ? 1 : 0,
        cap: null,
        unlimited: true,
        available: null,
        admitted: request?.kind !== "archer",
        ...(request?.kind === "archer" ? { rejectionReason: "constraint-rejected" as const } : {}),
      }),
    }],
  }));
  try {
    const state = createCapacityFixture();
    const admission = canAdmitPlayerCapacity(state, "p1", "archer", "test:custom-policy");
    assert.equal(admission.admitted, false);
    assert.deepEqual(admission.rejection, { constraintId: "deny-archers", reason: "constraint-rejected" });
  } finally {
    unregister();
  }
});
