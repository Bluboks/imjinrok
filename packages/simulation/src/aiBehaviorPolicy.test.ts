import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap } from "../../shared/src/index.js";
import {
  BUILTIN_IDLE_COMBAT_POLICY_ID,
  K01_RYU_ACTION_40_MANA_COST,
  SkirmishAiController,
  advanceWorldTick,
  createInitialWorldState,
  getSkirmishAiStrategy,
  issueCommand,
  registerAutoAbilityPolicy,
  registerIdleCombatPolicy,
  registerSkirmishAiStrategy,
  toWorldSnapshot,
} from "./index.js";
import { createUnitState } from "./entities.js";

function createCombatFixture() {
  const state = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1", "p2"]);
  state.units = {};
  return state;
}

test("default idle policy preserves mobile aggro and stationary in-range guard", () => {
  const state = createCombatFixture();
  const mobile = createUnitState("mobile", "p1", "swordsman", { x: 2, y: 2 });
  const guard = createUnitState("guard", "p1", "town-center", { x: 2, y: 8 });
  const distantEnemy = createUnitState("enemy-mobile", "p2", "villager", { x: 7, y: 2 });
  const guardEnemy = createUnitState("enemy-guard", "p2", "villager", { x: 10, y: 8 });
  state.units = { [mobile.id]: mobile, [guard.id]: guard, [distantEnemy.id]: distantEnemy, [guardEnemy.id]: guardEnemy };

  advanceWorldTick(state);

  assert.equal(mobile.currentOrder?.type, "attack-unit");
  assert.equal(mobile.currentOrder?.type === "attack-unit" ? mobile.currentOrder.targetUnitId : undefined, distantEnemy.id);
  assert.equal(guard.currentOrder, undefined);
  assert.equal(BUILTIN_IDLE_COMBAT_POLICY_ID, "builtin-mobile-aggro-stationary-guard");
});

test("mod idle policy overrides a unit while missing ids safely retain builtin behavior", () => {
  const unregister = registerIdleCombatPolicy({
    id: "test-remote-idle-target",
    selectTarget: ({ state }) => state.units["enemy"] ?? null,
  });
  try {
    const state = createCombatFixture();
    const custom = createUnitState("custom", "p1", "swordsman", { x: 2, y: 2 });
    custom.idleCombatPolicyId = "test-remote-idle-target";
    const legacy = createUnitState("legacy", "p1", "swordsman", { x: 2, y: 5 });
    legacy.idleCombatPolicyId = "missing-profile";
    const enemy = createUnitState("enemy", "p2", "villager", { x: 12, y: 2 });
    state.units = { [custom.id]: custom, [legacy.id]: legacy, [enemy.id]: enemy };

    advanceWorldTick(state);

    assert.equal(custom.currentOrder?.type, "attack-unit");
    assert.equal(custom.currentOrder?.type === "attack-unit" ? custom.currentOrder.targetUnitId : undefined, enemy.id);
    assert.equal(legacy.currentOrder, undefined);
  } finally {
    unregister();
  }
});

test("AI strategies retain builtin behavior and allow deterministic custom lifecycle", () => {
  const builtinState = createInitialWorldState(createBlankMap({ width: 20, height: 20 }), ["p1", "p2"]);
  const builtin = new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } });
  builtinState.tick = 45;
  builtin.update(builtinState);
  assert.equal(builtinState.units["p2-town-center"]?.productionQueue?.[0]?.unit, "villager");
  assert.equal(builtinState.players.p2?.magicAutoUseEnabled, true);

  const explicitOffState = createInitialWorldState(createBlankMap({ width: 20, height: 20 }), ["p1", "p2"]);
  explicitOffState.players.p2!.magicAutoUseEnabled = false;
  explicitOffState.tick = 45;
  new SkirmishAiController(["p2"], { tuning: { maxDefensiveBeacons: 0 } }).update(explicitOffState);
  assert.equal(explicitOffState.players.p2?.magicAutoUseEnabled, false, "AI does not override an explicit setting");

  const calls: string[] = [];
  const unregister = registerSkirmishAiStrategy({
    id: "test-observer-strategy",
    updatePlayer: ({ playerId, state }) => calls.push(`${state.tick}:${playerId}`),
  });
  try {
    const state = createInitialWorldState(createBlankMap({ width: 20, height: 20 }), ["p1", "p2"]);
    const controller = new SkirmishAiController(["p2"], { strategyId: "test-observer-strategy" });
    state.tick = 45;
    controller.update(state);
    assert.deepEqual(calls, ["45:p2"]);
    assert.throws(() => registerSkirmishAiStrategy({ id: "test-observer-strategy", updatePlayer: () => undefined }), /already exists/);
  } finally {
    unregister();
  }

  assert.throws(() => getSkirmishAiStrategy("test-observer-strategy"), /unknown skirmish AI strategy/);
  assert.throws(() => new SkirmishAiController(["p2"], { strategyId: "missing-strategy" }), /unknown skirmish AI strategy/);
});

test("magic automation command defaults off, persists, and is selection independent", () => {
  const state = createCombatFixture();
  assert.equal(state.players.p1?.magicAutoUseEnabled, undefined);
  const result = issueCommand(state, {
    sessionId: "test",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: { type: "set-magic-auto-use", enabled: true },
  });
  assert.equal(result.ok, true);
  assert.equal(state.players.p1?.magicAutoUseEnabled, true);
  assert.equal(toWorldSnapshot(state).players.p1?.magicAutoUseEnabled, true);
  assert.equal(issueCommand(state, {
    sessionId: "test",
    playerId: "missing",
    issuedAtTick: state.tick,
    command: { type: "set-magic-auto-use", enabled: false },
  }).ok, false);
});

test("K01 Ryu action-40 adapter observes off/on cadence mana threshold target and normal-attack gates", () => {
  const autoUseOff = createRyuAction40Fixture();
  autoUseOff.state.tick = 1;
  advanceWorldTick(autoUseOff.state);
  assert.equal(autoUseOff.target.playerId, "p2");
  assert.equal(autoUseOff.state.combatEvents.length, 0);
  assert.equal(autoUseOff.state.projectileSystem.projectiles.length, 1);
  advanceWorldTick(autoUseOff.state);
  assert.equal(autoUseOff.state.combatEvents.length, 1, "normal attack resolves only after projectile impact");

  const cadenceMiss = createRyuAction40Fixture();
  cadenceMiss.ryu.mana.current = K01_RYU_ACTION_40_MANA_COST;
  cadenceMiss.state.players.p1!.magicAutoUseEnabled = true;
  cadenceMiss.state.tick = 1;
  advanceWorldTick(cadenceMiss.state);
  assert.equal(cadenceMiss.target.playerId, "p2", "cadence miss leaves normal combat unchanged");
  assert.equal(cadenceMiss.state.combatEvents.length, 0);
  assert.equal(cadenceMiss.state.projectileSystem.projectiles.length, 1);
  advanceWorldTick(cadenceMiss.state);
  assert.equal(cadenceMiss.state.combatEvents.length, 1, "cadence-miss normal attack resolves on impact");

  const conversion = createRyuAction40Fixture();
  conversion.ryu.mana.current = K01_RYU_ACTION_40_MANA_COST;
  conversion.state.players.p1!.magicAutoUseEnabled = true;
  conversion.state.tick = 2;
  const eventsBeforeConversion = conversion.state.combatEvents.length;
  advanceWorldTick(conversion.state);
  assert.equal(conversion.target.playerId, "p1");
  assert.equal(conversion.ryu.mana.current, 0);
  assert.equal(conversion.ryu.currentOrder, undefined);
  assert.equal(conversion.ryu.movementTarget, undefined);
  assert.equal(conversion.ryu.movementPath, undefined);
  assert.equal(conversion.target.currentOrder, undefined);
  assert.equal(conversion.target.movementTarget, undefined);
  assert.equal(conversion.target.movementPath, undefined);
  assert.equal(conversion.state.projectileSystem.projectiles.length, 0, "successful conversion spawns no normal-attack projectile");
  assert.equal(conversion.state.combatEvents.length, eventsBeforeConversion, "successful conversion skips normal attack");
});

test("K01 Ryu action-40 adapter rejects threshold-equal and building targets", () => {
  const state = createCombatFixture();
  const ryu = createUnitState("ryu", "p1", "ryu-seong-ryong", { x: 2, y: 2 });
  const target = createUnitState("target", "p2", "villager", { x: 3, y: 2 });
  target.health = { current: 60, max: 90 };
  ryu.currentOrder = { type: "attack-unit", targetUnitId: target.id };
  state.units = { [ryu.id]: ryu, [target.id]: target };
  state.players.p1!.magicAutoUseEnabled = true;
  state.tick = 2;
  advanceWorldTick(state);
  assert.equal(target.playerId, "p2");

  const building = createUnitState("building", "p2", "house", { x: 3, y: 2 });
  building.health.current = 1;
  state.units = { [ryu.id]: ryu, [building.id]: building };
  ryu.currentOrder = { type: "attack-unit", targetUnitId: building.id };
  ryu.mana.current = K01_RYU_ACTION_40_MANA_COST;
  state.tick = 5;
  advanceWorldTick(state);
  assert.equal(building.playerId, "p2");
});

function createRyuAction40Fixture() {
  const state = createCombatFixture();
  const ryu = createUnitState("ryu", "p1", "ryu-seong-ryong", { x: 2, y: 2 });
  const target = createUnitState("target", "p2", "villager", { x: 3, y: 2 });
  target.health = { current: 59, max: 90 };
  target.currentOrder = { type: "move", target: { x: 8, y: 8 } };
  target.movementTarget = { x: 4, y: 2 };
  ryu.currentOrder = { type: "attack-unit", targetUnitId: target.id };
  state.units = { [ryu.id]: ryu, [target.id]: target };
  return { state, ryu, target };
}

test("mod auto ability policies bind by unit kind and unregister cleanly", () => {
  const unregister = registerAutoAbilityPolicy("gwon-yul", {
    id: "test-gwon-auto",
    cadenceTicks: 1,
    tryExecute: ({ caster, target }) => {
      caster.mana.current -= 1;
      target.health.current -= 1;
      return true;
    },
  });
  try {
    const state = createCombatFixture();
    const caster = createUnitState("gwon", "p1", "gwon-yul", { x: 2, y: 2 });
    caster.mana = { current: 2, max: 2 };
    const target = createUnitState("target", "p2", "house", { x: 3, y: 2 });
    caster.currentOrder = { type: "attack-unit", targetUnitId: target.id };
    state.units = { [caster.id]: caster, [target.id]: target };
    state.players.p1!.magicAutoUseEnabled = true;

    advanceWorldTick(state);
    assert.equal(caster.mana.current, 1);
    assert.equal(target.health.current, target.health.max - 1);
    assert.equal(state.combatEvents.length, 0);
  } finally {
    unregister();
  }
});
