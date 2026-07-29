import assert from "node:assert/strict";
import test from "node:test";
import type { EntityVisual } from "@shared";
import {
  getEntityAnimationStateKey,
  type EntityAnimationStateUnit,
} from "./entityAnimationState.js";

const visualWithStates = (...stateNames: string[]): Pick<EntityVisual, "states"> => {
  const states: EntityVisual["states"] = {};

  for (const stateName of stateNames) {
    states[stateName] = { clips: {} };
  }

  return { states };
};

const unit = (
  overrides: Partial<EntityAnimationStateUnit> = {},
): EntityAnimationStateUnit => ({
  health: { current: 100, max: 100 },
  ...overrides,
});

const carryingFood = { kind: "food", amount: 1 } as const;
const moveOrder = { type: "move", target: { x: 2, y: 3 } } as const;
const gatherOrder = { type: "gather", resourceId: "rice", target: { x: 2, y: 3 } } as const;
const repairOrder = { type: "repair", targetUnitId: "damaged-building" } as const;
const buildOrder = { type: "build", building: "house", target: { x: 2, y: 3 } } as const;

test("carried resources select carried movement and idle states independently of order type", () => {
  const visual = visualWithStates("carry", "carry-idle", "move", "walk", "gather", "idle");

  assert.equal(
    getEntityAnimationStateKey(
      unit({
        carriedResource: carryingFood,
        currentOrder: moveOrder,
        movementTarget: { x: 2, y: 3 },
      }),
      visual,
    ),
    "carry",
  );
  assert.equal(
    getEntityAnimationStateKey(unit({ carriedResource: carryingFood, currentOrder: moveOrder }), visual),
    "carry-idle",
  );
});

test("carried-resource state selection falls back to existing movement and idle states", () => {
  const visual = visualWithStates("move", "walk", "idle");

  assert.equal(
    getEntityAnimationStateKey(
      unit({ carriedResource: carryingFood, movementPath: [{ x: 2, y: 3 }] }),
      visual,
    ),
    "move",
  );
  assert.equal(getEntityAnimationStateKey(unit({ carriedResource: carryingFood }), visual), "idle");
});

test("stationary repair and build states take priority over carried-resource idle states", () => {
  const visual = visualWithStates("repair", "build", "carry", "carry-idle", "move", "walk", "idle");

  assert.equal(
    getEntityAnimationStateKey(unit({ carriedResource: carryingFood, currentOrder: repairOrder }), visual),
    "repair",
  );
  assert.equal(
    getEntityAnimationStateKey(unit({ carriedResource: carryingFood, currentOrder: buildOrder }), visual),
    "build",
  );
  assert.equal(
    getEntityAnimationStateKey(
      unit({ carriedResource: carryingFood, currentOrder: buildOrder, movementTarget: { x: 2, y: 3 } }),
      visual,
    ),
    "carry",
  );
});

test("empty carried-resource records retain movement and gather selection", () => {
  const visual = visualWithStates("move", "walk", "gather", "idle");
  const emptyCarriedFood = { kind: "food", amount: 0 } as const;

  assert.equal(
    getEntityAnimationStateKey(
      unit({
        carriedResource: emptyCarriedFood,
        currentOrder: gatherOrder,
        movementTarget: { x: 2, y: 3 },
      }),
      visual,
    ),
    "move",
  );
  assert.equal(
    getEntityAnimationStateKey(unit({ carriedResource: emptyCarriedFood, currentOrder: gatherOrder }), visual),
    "gather",
  );
});

test("construction, damage, and attack states retain priority over carried-resource states", () => {
  const visual = visualWithStates("construction", "damaged", "attack", "carry", "carry-idle", "idle");
  const carryingUnit = {
    carriedResource: carryingFood,
    movementTarget: { x: 2, y: 3 },
  } as const;

  assert.equal(
    getEntityAnimationStateKey(
      unit({ ...carryingUnit, construction: { remainingTicks: 1, totalTicks: 2 }, attackCooldownTicks: 1 }),
      visual,
    ),
    "construction",
  );
  assert.equal(
    getEntityAnimationStateKey(
      unit({ ...carryingUnit, health: { current: 49, max: 100 }, attackCooldownTicks: 1 }),
      visual,
    ),
    "damaged",
  );
  assert.equal(
    getEntityAnimationStateKey(unit({ ...carryingUnit, attackCooldownTicks: 1 }), visual),
    "attack",
  );
});
