import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createBlankMap, imjinrokCampaignScenarios, k01ReinforcementAdapter, k01SourceOpeningAdapter } from "../../shared/src/index.js";
import {
  canAdmitPlayerCapacity,
  canCompleteQueuedPlayerCapacity,
  CORE_PROVIDER_SUPPLY_CAPACITY_POLICY_ID,
  createInitialWorldState,
  evaluatePlayerCapacity,
  getK01WarExpenseCost,
  getK01WarExpenseKindAdapter,
  K01_WAR_EXPENSE_CAPACITY_POLICY_ID,
  K01_WAR_EXPENSE_WITH_BUILDING_GATE_CAPACITY_POLICY_ID,
  k01WarExpenseCapacityPolicy,
  k01WarExpenseKindAdapters,
  k01WarExpenseWithBuildingGateCapacityPolicy,
  requireCapacityPolicy,
  toWorldSnapshot,
} from "./index.js";
import { createUnitState } from "./entities.js";

const simulationSourceDirectory = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(simulationSourceDirectory, "../../../analysis/generated/entity-type-catalog.json");
const vectorsPath = join(simulationSourceDirectory, "../../../analysis/fixtures/war-expense-capacity-vectors.json");
const ORIGINAL_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const CATALOG_SHA256 = "485344664b278c97a4ceed0756832abadbf2a71bd4a997b117b85c336d620708";
const VECTORS_SHA256 = "d5119a18166326fb9b6675cd0a24cc9222764df7f3a1328d8d4d226df62dda34";

function createFixture() {
  const state = createInitialWorldState(createBlankMap({ width: 32, height: 32 }), ["p1"]);
  state.units = {};
  return state;
}

function addUnit(
  state: ReturnType<typeof createFixture>,
  id: string,
  kind: (typeof k01WarExpenseKindAdapters)[number]["projectKind"],
) {
  const unit = createUnitState(id, "p1", kind, { x: 2, y: 2 });
  state.units[id] = unit;
  return unit;
}

test("K01 war-expense policies are registered built-ins but K01 scenarios do not opt in yet", () => {
  assert.equal(requireCapacityPolicy(K01_WAR_EXPENSE_CAPACITY_POLICY_ID), k01WarExpenseCapacityPolicy);
  assert.equal(
    requireCapacityPolicy(K01_WAR_EXPENSE_WITH_BUILDING_GATE_CAPACITY_POLICY_ID),
    k01WarExpenseWithBuildingGateCapacityPolicy,
  );

  const k01 = createInitialWorldState(createBlankMap(), [], imjinrokCampaignScenarios[0]);
  assert.equal(k01.capacityPolicyId, CORE_PROVIDER_SUPPLY_CAPACITY_POLICY_ID);
});

test("K01 adapter values remain bound to the catalog, source fixture, and K01 scenario adapters", () => {
  const catalogBytes = readFileSync(catalogPath);
  const vectorsBytes = readFileSync(vectorsPath);
  const catalog = JSON.parse(catalogBytes.toString()) as {
    schemaVersion: number;
    source: { executableSha256: string };
    types: Array<{ internalClass: number; definition: { economy: { warExpense: number } } }>;
  };
  const vectors = JSON.parse(vectorsBytes.toString()) as {
    schemaVersion: number;
    source: { executableSha256: string };
  };

  assert.equal(createHash("sha256").update(catalogBytes).digest("hex"), CATALOG_SHA256);
  assert.equal(createHash("sha256").update(vectorsBytes).digest("hex"), VECTORS_SHA256);
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(vectors.schemaVersion, 1);
  assert.equal(catalog.source.executableSha256, ORIGINAL_EXECUTABLE_SHA256);
  assert.equal(vectors.source.executableSha256, ORIGINAL_EXECUTABLE_SHA256);

  for (const adapter of k01WarExpenseKindAdapters) {
    const catalogType = catalog.types.find((type) => type.internalClass === adapter.originalClass);
    assert.ok(catalogType, `catalog class ${adapter.originalClass} exists for ${adapter.projectKind}`);
    assert.equal(catalogType.definition.economy.warExpense, adapter.warExpense, adapter.projectKind);
    assert.equal(adapter.identityMapping, "exact-static-identity-source");
  }

  const scenarioBindings = [...k01SourceOpeningAdapter, ...k01ReinforcementAdapter];
  for (const sourceBinding of scenarioBindings) {
    const profileBinding = getK01WarExpenseKindAdapter(sourceBinding.projectKind);
    assert.equal(profileBinding.originalClass, sourceBinding.originalClass, sourceBinding.projectKind);
  }

  assert.deepEqual(getK01WarExpenseKindAdapter("beacon"), {
    projectKind: "beacon",
    originalClass: 52,
    warExpense: 10,
    identityMapping: "exact-static-identity-source",
  });
});

test("K01 war-expense policy totals exact live and pending source costs", () => {
  const state = createFixture();
  const barracks = addUnit(state, "p1-barracks", "barracks");
  addUnit(state, "p1-swordsman", "swordsman");
  barracks.productionQueue = [{ id: "pending-archer", unit: "archer", remainingTicks: 1, totalTicks: 1 }];

  const evaluation = evaluatePlayerCapacity(state, "p1", K01_WAR_EXPENSE_CAPACITY_POLICY_ID);

  assert.deepEqual(evaluation.constraints[0], {
    constraintId: "fixed-budget",
    used: 28,
    pending: 15,
    requested: 0,
    cap: 2500,
    unlimited: false,
    available: 2457,
    admitted: true,
  });
  assert.deepEqual(evaluation.constraints[1], {
    constraintId: "original-live-entity-count",
    used: 2,
    pending: 0,
    requested: 0,
    cap: 250,
    unlimited: false,
    available: 248,
    admitted: true,
  });
});

test("K01 war-expense permits zero-cost heroes but rejects a positive cost over 2500", () => {
  const state = createFixture();
  for (let index = 0; index < 192; index += 1) {
    addUnit(state, `p1-swordsman-${index}`, "swordsman");
  }

  assert.equal(getK01WarExpenseCost("gwon-yul"), 0);
  assert.equal(getK01WarExpenseCost("ryu-seong-ryong"), 0);
  assert.equal(canAdmitPlayerCapacity(state, "p1", "gwon-yul", K01_WAR_EXPENSE_CAPACITY_POLICY_ID).admitted, true);
  assert.equal(canAdmitPlayerCapacity(state, "p1", "swordsman", K01_WAR_EXPENSE_CAPACITY_POLICY_ID).admitted, false);
});

test("K01 war-expense applies the 250 live-entity edge to queue and completion without counting pending", () => {
  const state = createFixture();
  const producer = addUnit(state, "p1-town-center", "town-center");
  for (let index = 0; index < 248; index += 1) {
    addUnit(state, `p1-hero-${index}`, "gwon-yul");
  }
  producer.productionQueue = [{ id: "pending-hero", unit: "gwon-yul", remainingTicks: 1, totalTicks: 1 }];

  assert.equal(canAdmitPlayerCapacity(state, "p1", "gwon-yul", K01_WAR_EXPENSE_CAPACITY_POLICY_ID).admitted, true);
  assert.equal(
    canCompleteQueuedPlayerCapacity(state, "p1", producer.id, "pending-hero", "gwon-yul", K01_WAR_EXPENSE_CAPACITY_POLICY_ID).admitted,
    true,
  );

  addUnit(state, "p1-final-live-hero", "gwon-yul");
  assert.equal(canAdmitPlayerCapacity(state, "p1", "gwon-yul", K01_WAR_EXPENSE_CAPACITY_POLICY_ID).admitted, false);
  assert.equal(
    canCompleteQueuedPlayerCapacity(state, "p1", producer.id, "pending-hero", "gwon-yul", K01_WAR_EXPENSE_CAPACITY_POLICY_ID).admitted,
    false,
  );
});

test("the optional original building gate can be explicitly enabled or bypassed", () => {
  const state = createFixture();
  for (let index = 0; index < 50; index += 1) {
    addUnit(state, `p1-house-${index}`, "house");
  }

  assert.equal(canAdmitPlayerCapacity(state, "p1", "house", K01_WAR_EXPENSE_CAPACITY_POLICY_ID).admitted, true);
  const gated = canAdmitPlayerCapacity(
    state,
    "p1",
    "house",
    K01_WAR_EXPENSE_WITH_BUILDING_GATE_CAPACITY_POLICY_ID,
  );
  assert.equal(gated.admitted, false);
  assert.deepEqual(gated.rejection, {
    constraintId: "original-building-category-count",
    reason: "capacity-exceeded",
  });
});

test("unmapped kinds fail closed and snapshots contain only the stable policy id", () => {
  const state = createFixture();
  state.capacityPolicyId = K01_WAR_EXPENSE_CAPACITY_POLICY_ID;

  assert.throws(
    () => canAdmitPlayerCapacity(state, "p1", "royal-cart", K01_WAR_EXPENSE_CAPACITY_POLICY_ID),
    /no unambiguous original-class mapping for project kind 'royal-cart'/,
  );
  const snapshot = toWorldSnapshot(state);
  assert.equal(snapshot.capacityPolicyId, K01_WAR_EXPENSE_CAPACITY_POLICY_ID);
  assert.equal(JSON.stringify(snapshot).includes("evaluate"), false);
});
