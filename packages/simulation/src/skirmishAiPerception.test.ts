import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap } from "../../shared/src/index.js";
import {
  CORE_CURRENT_VISIBILITY_SKIRMISH_AI_PERCEPTION_POLICY_ID,
  CORE_OMNISCIENT_SKIRMISH_AI_PERCEPTION_POLICY_ID,
  SkirmishAiController,
  createInitialWorldState,
  getSkirmishAiPerceptionPolicy,
  registerSkirmishAiPerceptionPolicy,
} from "./index.js";
import { createUnitState } from "./entities.js";

function createSightFixture() {
  const map = createBlankMap({ width: 64, height: 64 });
  map.environment = {
    dayNight: {
      cycleTicks: 10,
      nightStartTick: 0,
      dayStartTick: 6,
      nightSightMultiplier: 0.5,
    },
  };
  const state = createInitialWorldState(map, ["p1", "p2"]);
  const scout = createUnitState("p1-scout", "p1", "villager", { x: 30, y: 30 });
  const firstVisibleEnemy = createUnitState("a-visible", "p2", "villager", { x: 32, y: 30 });
  const secondVisibleEnemy = createUnitState("z-visible", "p2", "villager", { x: 33, y: 30 });
  const hiddenEnemy = createUnitState("m-hidden", "p2", "villager", { x: 36, y: 30 });

  state.units = {
    [scout.id]: scout,
    [firstVisibleEnemy.id]: firstVisibleEnemy,
    [secondVisibleEnemy.id]: secondVisibleEnemy,
    [hiddenEnemy.id]: hiddenEnemy,
  };

  return state;
}

test("current-visibility perception follows current sight and retains no enemy memory", () => {
  const state = createSightFixture();
  const currentVisibility = getSkirmishAiPerceptionPolicy(CORE_CURRENT_VISIBILITY_SKIRMISH_AI_PERCEPTION_POLICY_ID);
  const omniscient = getSkirmishAiPerceptionPolicy(CORE_OMNISCIENT_SKIRMISH_AI_PERCEPTION_POLICY_ID);

  assert.deepEqual(currentVisibility.selectEnemyUnits({ state, playerId: "p1" }).map((unit) => unit.id), ["a-visible", "z-visible"]);
  assert.deepEqual(omniscient.selectEnemyUnits({ state, playerId: "p1" }).map((unit) => unit.id), ["a-visible", "m-hidden", "z-visible"]);

  state.environment.dayPhase = "day";
  assert.deepEqual(currentVisibility.selectEnemyUnits({ state, playerId: "p1" }).map((unit) => unit.id), ["a-visible", "m-hidden", "z-visible"]);

  state.environment.dayPhase = "night";
  assert.deepEqual(currentVisibility.selectEnemyUnits({ state, playerId: "p1" }).map((unit) => unit.id), ["a-visible", "z-visible"]);
});

test("perception policy registration and controller lookup fail clearly for invalid ids", () => {
  assert.throws(
    () => new SkirmishAiController(["p1"], { perceptionPolicyId: "missing-perception-policy" }),
    /unknown skirmish AI perception policy: missing-perception-policy/,
  );
  assert.throws(
    () => getSkirmishAiPerceptionPolicy(""),
    /unknown skirmish AI perception policy: /,
  );
  assert.throws(
    () => registerSkirmishAiPerceptionPolicy({ id: "", selectEnemyUnits: () => [] }),
    /skirmish AI perception policy id must not be empty/,
  );

  const unregister = registerSkirmishAiPerceptionPolicy({
    id: "test:empty-observation",
    selectEnemyUnits: () => [],
  });
  try {
    assert.equal(getSkirmishAiPerceptionPolicy("test:empty-observation").id, "test:empty-observation");
  } finally {
    unregister();
  }
});
