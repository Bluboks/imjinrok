import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, defaultSkirmishScenario } from "../../shared/src/index.js";
import {
  advanceWorldTick,
  canAdmitPlayerCapacity,
  canCompleteQueuedPlayerCapacity,
  createCapacityPolicy,
  createCategoryCapacityConstraint,
  createFixedBudgetCapacityPolicy,
  createKindCapacityConstraint,
  createProviderSupplyCapacityPolicy,
  createTotalCountCapacityConstraint,
  createUncappedCapacityPolicy,
  createInitialWorldState,
  evaluatePlayerCapacity,
  getPlayerPopulationState,
  getProviderSupplyCapacityState,
  issueCommand,
  registerCapacityPolicy,
  toWorldSnapshot,
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

test("completion transfers exactly one pending entry without double-counting it", () => {
  const state = createCapacityFixture();
  const townCenter = addUnit(state, "town-center", "town-center");
  addUnit(state, "live-swordsman", "swordsman");
  townCenter.productionQueue = [
    { id: "complete-swordsman", unit: "swordsman", remainingTicks: 0, totalTicks: 1 },
    { id: "other-swordsman", unit: "swordsman", remainingTicks: 1, totalTicks: 1 },
  ];
  const policy = createFixedBudgetCapacityPolicy({
    id: "test:completion-transfer",
    cap: 3,
    costForKind: (kind) => (kind === "swordsman" ? 1 : 0),
  });

  const completion = canCompleteQueuedPlayerCapacity(
    state,
    "p1",
    townCenter.id,
    "complete-swordsman",
    "swordsman",
    policy,
  );

  assert.equal(completion.admitted, true);
  assert.deepEqual(completion.evaluation.constraints[0], {
    constraintId: "fixed-budget",
    used: 2,
    pending: 1,
    requested: 0,
    cap: 3,
    unlimited: false,
    available: 0,
    admitted: true,
  });
  assert.throws(
    () => canCompleteQueuedPlayerCapacity(state, "p1", townCenter.id, "missing", "swordsman", policy),
    /unknown queue item 'missing'/,
  );
});

test("provider supply completion ignores other queued reservations while respecting a reduced cap", () => {
  const state = createCapacityFixture();
  const townCenter = addUnit(state, "town-center", "town-center");
  addUnit(state, "live-swordsman", "swordsman");
  addUnit(state, "second-live-swordsman", "swordsman");
  townCenter.productionQueue = [
    { id: "complete-swordsman", unit: "swordsman", remainingTicks: 0, totalTicks: 1 },
    { id: "later-swordsman", unit: "swordsman", remainingTicks: 1, totalTicks: 1 },
  ];
  const policy = createProviderSupplyCapacityPolicy({ id: "test:legacy-completion", limit: 3 });

  const admitted = canCompleteQueuedPlayerCapacity(
    state,
    "p1",
    townCenter.id,
    "complete-swordsman",
    "swordsman",
    policy,
  );
  assert.equal(admitted.admitted, true);
  assert.deepEqual(admitted.evaluation.constraints[0], {
    constraintId: "provider-supply",
    used: 3,
    pending: 1,
    requested: 0,
    cap: 3,
    unlimited: false,
    available: 0,
    admitted: true,
  });

  const blocked = canCompleteQueuedPlayerCapacity(
    state,
    "p1",
    townCenter.id,
    "complete-swordsman",
    "swordsman",
    createProviderSupplyCapacityPolicy({ id: "test:legacy-completion-reduced", limit: 2 }),
  );
  assert.equal(blocked.admitted, false);
  assert.equal(blocked.rejection?.reason, "capacity-exceeded");
});

test("zero-cost heroes remain subject to independent total-count constraints", () => {
  const state = createCapacityFixture();
  const policy = createFixedBudgetCapacityPolicy({
    id: "test:zero-cost-hero-count",
    cap: 0,
    costForKind: () => 0,
    constraints: [createTotalCountCapacityConstraint({ id: "total", cap: 0 })],
  });

  const admission = canAdmitPlayerCapacity(state, "p1", "gwon-yul", policy);
  assert.equal(admission.admitted, false);
  assert.deepEqual(admission.rejection, { constraintId: "total", reason: "capacity-exceeded" });
});

test("world capacity policy selection is registry-validated and snapshots retain only its stable id", () => {
  const policyId = "test:world-capacity";
  const unregister = registerCapacityPolicy(createUncappedCapacityPolicy({ id: policyId }));
  try {
    const scenario = { ...defaultSkirmishScenario, id: "world-capacity", capacityPolicyId: policyId };
    const state = createInitialWorldState(createBlankMap(), ["p1"], scenario);
    const snapshot = toWorldSnapshot(state);

    assert.equal(state.capacityPolicyId, policyId);
    assert.equal(snapshot.capacityPolicyId, policyId);
    assert.equal(JSON.stringify(snapshot).includes("evaluate"), false);
    assert.throws(
      () => createInitialWorldState(createBlankMap(), ["p1"], { ...scenario, capacityPolicyId: "missing:capacity" }),
      /Unknown capacity policy 'missing:capacity'/,
    );
  } finally {
    unregister();
  }
});

test("selected fixed budget policy rejects queue admission through the command runtime", () => {
  const policyId = "test:runtime-queue-rejection";
  const unregister = registerCapacityPolicy(createFixedBudgetCapacityPolicy({
    id: policyId,
    cap: 0,
    costForKind: (kind) => (kind === "villager" ? 1 : 0),
  }));
  try {
    const scenario = { ...defaultSkirmishScenario, id: "runtime-queue-rejection", capacityPolicyId: policyId };
    const state = createInitialWorldState(createBlankMap({ width: 20, height: 20 }), ["p1"], scenario);
    const townCenter = createUnitState("p1-town-center", "p1", "town-center", { x: 4, y: 4 });
    state.units = { [townCenter.id]: townCenter };

    const result = issueCommand(state, {
      sessionId: "capacity-test",
      playerId: "p1",
      issuedAtTick: state.tick,
      command: { type: "train-unit", buildingUnitId: townCenter.id, unit: "villager" },
    });

    assert.deepEqual(result, { ok: false, reason: "population cap reached" });
    assert.equal(townCenter.productionQueue, undefined);
  } finally {
    unregister();
  }
});

test("runtime completion uses the selected fixed budget policy's pending-to-live transfer", () => {
  const policyId = "test:runtime-completion";
  const unregister = registerCapacityPolicy(createFixedBudgetCapacityPolicy({
    id: policyId,
    cap: 1,
    costForKind: (kind) => (kind === "swordsman" ? 1 : 0),
  }));
  try {
    const scenario = { ...defaultSkirmishScenario, id: "runtime-completion", capacityPolicyId: policyId };
    const state = createInitialWorldState(createBlankMap({ width: 20, height: 20 }), ["p1"], scenario);
    const barracks = createUnitState("p1-barracks", "p1", "barracks", { x: 4, y: 4 });
    barracks.productionQueue = [{ id: "pending-swordsman", unit: "swordsman", remainingTicks: 1, totalTicks: 1 }];
    state.units = { [barracks.id]: barracks };

    advanceWorldTick(state);

    assert.equal(state.units["p1-barracks"]?.productionQueue, undefined);
    assert.equal(state.units["p1-swordsman-1"]?.kind, "swordsman");
  } finally {
    unregister();
  }
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

test("count constraints can explicitly exclude pending production", () => {
  const state = createCapacityFixture();
  const townCenter = addUnit(state, "town-center", "town-center");
  addUnit(state, "swordsman", "swordsman");
  queueUnit(townCenter, "queued-swordsman", "swordsman");

  const includesPending = createUncappedCapacityPolicy({
    id: "test:total-with-pending",
    constraints: [createTotalCountCapacityConstraint({ id: "total", cap: 3 })],
  });
  const excludesPending = createUncappedCapacityPolicy({
    id: "test:total-without-pending",
    constraints: [createTotalCountCapacityConstraint({ id: "total", cap: 3, includePending: false })],
  });

  assert.equal(canAdmitPlayerCapacity(state, "p1", "archer", includesPending).admitted, false);
  const admission = canAdmitPlayerCapacity(state, "p1", "archer", excludesPending);
  assert.equal(admission.admitted, true);
  assert.deepEqual(admission.evaluation.constraints[1], {
    constraintId: "total",
    used: 2,
    pending: 0,
    requested: 1,
    cap: 3,
    unlimited: false,
    available: 1,
    admitted: true,
  });
});

test("composed budget, total, and category constraints use their declared pending rules", () => {
  const state = createCapacityFixture();
  const townCenter = addUnit(state, "town-center", "town-center");
  addUnit(state, "house", "house");
  addUnit(state, "swordsman", "swordsman");
  queueUnit(townCenter, "queued-swordsman", "swordsman");
  const policy = createFixedBudgetCapacityPolicy({
    id: "test:composed-constraints",
    cap: 2,
    costForKind: (kind) => (kind === "swordsman" ? 1 : 0),
    constraints: [
      createTotalCountCapacityConstraint({ id: "total-live", cap: 3, includePending: false }),
      createCategoryCapacityConstraint({ id: "buildings-live", category: "building", cap: 2, includePending: false }),
    ],
  });

  const admission = canAdmitPlayerCapacity(state, "p1", "gwon-yul", policy);
  assert.equal(admission.admitted, false);
  assert.deepEqual(admission.rejection, { constraintId: "total-live", reason: "capacity-exceeded" });
  assert.deepEqual(admission.evaluation.constraints.map((constraint) => [constraint.constraintId, constraint.used, constraint.pending, constraint.requested]), [
    ["fixed-budget", 1, 1, 0],
    ["total-live", 3, 0, 1],
    ["buildings-live", 2, 0, 0],
  ]);
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
