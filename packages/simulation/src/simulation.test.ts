import test from "node:test";
import assert from "node:assert/strict";
import { createContentRegistry, defaultMap, validateContentRegistry, type CommandEnvelope } from "../../shared/src/index.js";
import {
  advanceWorldTick,
  createInitialWorldState,
  issueCommand,
  validateBuildingPlacement,
} from "./index.js";

test("core content registry validates", () => {
  const result = validateContentRegistry(createContentRegistry());

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test("commands reject units owned by another player", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const envelope: CommandEnvelope = {
    sessionId: "test-session",
    playerId: "p2",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: "p1-villager-1",
      target: { x: 10, y: 10 },
    },
  };

  const result = issueCommand(state, envelope);

  assert.equal(result.ok, false);
});

test("move and stop commands update waypoint movement state", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const moveResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: "p1-villager-1",
      target: { x: 10, y: 10 },
    },
  });

  assert.equal(moveResult.ok, true);
  assert.equal(state.units["p1-villager-1"]?.currentOrder?.type, "move");
  assert.ok((state.units["p1-villager-1"]?.movementPath?.length ?? 0) > 0);

  const stopResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "stop",
      unitId: "p1-villager-1",
    },
  });

  assert.equal(stopResult.ok, true);
  assert.equal(state.units["p1-villager-1"]?.movementTarget, undefined);
  assert.equal(state.units["p1-villager-1"]?.movementPath, undefined);
  assert.equal(state.units["p1-villager-1"]?.currentOrder, undefined);
});

test("building placement rejects occupied footprints and accepts clear grass", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  assert.equal(validateBuildingPlacement(state, "house", { x: 3, y: 3 }).ok, false);
  assert.equal(validateBuildingPlacement(state, "house", { x: 12, y: 12 }).ok, true);
});

test("defeat-opponents objective completes when only one player has units", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["defeat-opponents"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});
