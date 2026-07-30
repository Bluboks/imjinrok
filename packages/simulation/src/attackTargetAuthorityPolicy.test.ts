import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, defaultSkirmishScenario, imjinrokCampaignScenarios } from "../../shared/src/index.js";
import {
  advanceWorldTick,
  CORE_CURRENT_VISIBILITY_STOP_AUTHORITY_POLICY_ID,
  CORE_EXPLICIT_TARGET_TRACKING_AUTHORITY_POLICY_ID,
  createInitialWorldState,
  issueCommand,
  registerAttackTargetAuthorityPolicy,
  toWorldSnapshot,
} from "./index.js";
import { createUnitState } from "./entities.js";

test("default skirmish selects the fair preset while K01 retains compatibility", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1", "p2"]);

  assert.equal(state.attackTargetAuthorityPolicyId, CORE_CURRENT_VISIBILITY_STOP_AUTHORITY_POLICY_ID);
  assert.equal(toWorldSnapshot(state).attackTargetAuthorityPolicyId, CORE_CURRENT_VISIBILITY_STOP_AUTHORITY_POLICY_ID);
  assert.equal(JSON.stringify(toWorldSnapshot(state)).includes("authorizesTarget"), false);

  const k01 = createInitialWorldState(createBlankMap(), [], imjinrokCampaignScenarios[0]);
  assert.equal(k01.attackTargetAuthorityPolicyId, CORE_EXPLICIT_TARGET_TRACKING_AUTHORITY_POLICY_ID);
});

test("current-visibility authority rejects an explicit order to a hidden target", () => {
  const { state, attacker, target } = createDayNightAttackWorld(CORE_CURRENT_VISIBILITY_STOP_AUTHORITY_POLICY_ID);

  const result = issueAttackOrder(state, attacker.id, target.id);

  assert.deepEqual(result, { ok: false, reason: "attack target is not authorized by the current policy" });
  assert.equal(attacker.currentOrder, undefined);
  assert.equal(attacker.movementTarget, undefined);
});

test("current-visibility authority cancels a prior explicit order before a hidden target can guide movement or combat", () => {
  const { state, attacker, target } = createDayNightAttackWorld(CORE_CURRENT_VISIBILITY_STOP_AUTHORITY_POLICY_ID);

  advanceToDay(state);
  const issued = issueAttackOrder(state, attacker.id, target.id);
  assert.equal(issued.ok, true);
  assert.equal(attacker.currentOrder?.type, "attack-unit");
  const positionBeforeNight = { ...attacker.position };
  const healthBeforeNight = target.health.current;

  advanceWorldTick(state);

  assert.equal(state.environment.dayPhase, "night");
  assert.equal(attacker.currentOrder, undefined);
  assert.equal(attacker.movementTarget, undefined);
  assert.equal(attacker.movementPath, undefined);
  assert.deepEqual(attacker.position, positionBeforeNight);
  assert.equal(target.health.current, healthBeforeNight);
  assert.deepEqual(state.combatEvents, []);
});

test("explicit-target tracking compatibility preserves existing hidden-target orders", () => {
  const { state, attacker, target } = createDayNightAttackWorld(CORE_EXPLICIT_TARGET_TRACKING_AUTHORITY_POLICY_ID);

  const issued = issueAttackOrder(state, attacker.id, target.id);
  assert.equal(issued.ok, true);

  advanceWorldTick(state);

  assert.equal(state.environment.dayPhase, "night");
  assert.equal(attacker.currentOrder?.type, "attack-unit");
  assert.equal(attacker.currentOrder?.type === "attack-unit" ? attacker.currentOrder.targetUnitId : undefined, target.id);
});

test("unknown attack-target authority ids fail at world creation and snapshot execution boundaries", () => {
  assert.throws(
    () => createInitialWorldState(createBlankMap(), ["p1"], {
      ...defaultSkirmishScenario,
      id: "unknown-authority-policy",
      attackTargetAuthorityPolicyId: "mod:missing-authority",
      objectives: [],
    }),
    /Unknown attack target authority policy 'mod:missing-authority'/,
  );

  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  state.attackTargetAuthorityPolicyId = "mod:missing-authority";

  assert.throws(() => advanceWorldTick(state), /Unknown attack target authority policy 'mod:missing-authority'/);
});

test("legacy snapshots without an authority id retain explicit-target tracking", () => {
  const { state, attacker, target } = createDayNightAttackWorld(CORE_EXPLICIT_TARGET_TRACKING_AUTHORITY_POLICY_ID);
  delete state.attackTargetAuthorityPolicyId;

  const issued = issueAttackOrder(state, attacker.id, target.id);
  assert.equal(issued.ok, true);
  advanceWorldTick(state);

  assert.equal(attacker.currentOrder?.type, "attack-unit");
});

test("a modded authority policy receives cached visibility without serializing its executable", () => {
  const observedVisibility: object[] = [];
  const unregister = registerAttackTargetAuthorityPolicy({
    id: "test:deny-explicit-targets",
    authorizesTarget: ({ attacker, getCurrentVisibility }) => {
      observedVisibility.push(getCurrentVisibility(attacker.playerId));
      return false;
    },
  });

  try {
    const { state, attacker, target } = createDayNightAttackWorld("test:deny-explicit-targets");
    advanceToDay(state);

    assert.equal(toWorldSnapshot(state).attackTargetAuthorityPolicyId, "test:deny-explicit-targets");
    assert.deepEqual(issueAttackOrder(state, attacker.id, target.id), {
      ok: false,
      reason: "attack target is not authorized by the current policy",
    });
    const secondAttacker = createUnitState("p1-second-attacker", "p1", "swordsman", { x: 29, y: 30 });
    attacker.currentOrder = { type: "attack-unit", targetUnitId: target.id };
    secondAttacker.currentOrder = { type: "attack-unit", targetUnitId: target.id };
    state.units[secondAttacker.id] = secondAttacker;

    advanceWorldTick(state);

    assert.equal(observedVisibility.length, 3);
    assert.strictEqual(observedVisibility[1], observedVisibility[2]);
  } finally {
    unregister();
  }
});

function createDayNightAttackWorld(authorityPolicyId: string) {
  const map = createBlankMap({ width: 64, height: 64 });
  map.environment = {
    dayNight: {
      cycleTicks: 10,
      nightStartTick: 7,
      dayStartTick: 6,
      nightSightMultiplier: 0.5,
    },
  };
  const state = createInitialWorldState(map, ["p1", "p2"], {
    ...defaultSkirmishScenario,
    id: `authority-${authorityPolicyId}`,
    attackTargetAuthorityPolicyId: authorityPolicyId,
    objectives: [],
  });
  const attacker = createUnitState("p1-attacker", "p1", "swordsman", { x: 30, y: 30 });
  const target = createUnitState("p2-target", "p2", "villager", { x: 36, y: 30 });
  state.units = { [attacker.id]: attacker, [target.id]: target };

  return { state, attacker, target };
}

function advanceToDay(state: ReturnType<typeof createInitialWorldState>): void {
  state.tick = 5;
  advanceWorldTick(state);
  assert.equal(state.environment.dayPhase, "day");
  for (const unit of Object.values(state.units)) {
    delete unit.currentOrder;
    delete unit.movementTarget;
    delete unit.movementPath;
  }
  state.combatEvents = [];
}

function issueAttackOrder(
  state: ReturnType<typeof createInitialWorldState>,
  unitId: string,
  targetUnitId: string,
) {
  return issueCommand(state, {
    sessionId: "attack-target-authority-test",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: { type: "attack-unit", unitId, targetUnitId },
  });
}
