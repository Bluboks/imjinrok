import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, type UnitDefinition } from "../../shared/src/index.js";
import {
  advanceWorldTick,
  createInitialWorldState,
  PRODUCT_IMMEDIATE_PROJECTILE_PROFILE,
  PRODUCT_PROJECTILE_REGISTRY,
  resolveProjectileDeliveryProfileId,
  spawnProjectile,
  type ProjectileRegistry,
} from "./index.js";
import { createUnitState } from "./entities.js";

test("units without a projectile selection retain same-tick instant combat", () => {
  const { state, attacker, target } = createCombatWorld();
  const healthBefore = target.health.current;

  advanceWorldTick(state);

  assert.equal(target.health.current, healthBefore - 9);
  assert.equal(state.projectileSystem.projectiles.length, 0);
  assert.deepEqual(state.combatEvents.map((event) => event.sourceUnitId), [attacker.id]);
});

test("legacy snapshots without a unit projectile selection retain instant combat", () => {
  const { state, attacker, target } = createCombatWorld();
  const legacy = JSON.parse(JSON.stringify(state)) as typeof state;

  assert.equal("projectileProfileId" in legacy.units[attacker.id]!, false);
  advanceWorldTick(legacy);

  assert.equal(legacy.units[target.id]!.health.current, target.health.current - 9);
  assert.equal(legacy.projectileSystem.projectiles.length, 0);
});

test("an opted-in unit delays damage until its next projectile lifecycle phase", () => {
  const { state, attacker, target } = createCombatWorld();
  attacker.projectileProfileId = PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id;
  const healthBefore = target.health.current;

  advanceWorldTick(state);

  assert.equal(target.health.current, healthBefore);
  assert.equal(attacker.attackCooldownTicks, 18);
  assert.equal(state.projectileSystem.projectiles.length, 1);
  assert.equal(state.combatEvents.length, 0);

  advanceWorldTick(state);

  assert.equal(target.health.current, healthBefore - 9);
  assert.equal(state.projectileSystem.projectiles.length, 0);
  assert.equal(state.combatEvents.length, 1);

  advanceWorldTick(state);

  assert.equal(target.health.current, healthBefore - 9);
  assert.equal(state.combatEvents.length, 1);
});

test("combat projectile impacts are consumed once and ignore missing or dead targets", () => {
  const missing = createCombatWorld();
  missing.attacker.projectileProfileId = PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id;
  advanceWorldTick(missing.state);
  delete missing.state.units[missing.target.id];

  advanceWorldTick(missing.state);

  assert.equal(missing.state.projectileSystem.projectiles.length, 0);
  assert.equal(missing.state.combatEvents.length, 0);

  const dead = createCombatWorld();
  dead.attacker.projectileProfileId = PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id;
  advanceWorldTick(dead.state);
  dead.target.health.current = 0;

  advanceWorldTick(dead.state);

  assert.equal(dead.target.health.current, 0);
  assert.equal(dead.state.combatEvents.length, 0);
});

test("combat projectiles do not hit a different replacement reusing a target id", () => {
  const { state, attacker, target } = createCombatWorld();
  attacker.projectileProfileId = PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id;
  advanceWorldTick(state);
  const replacement = createUnitState(target.id, "p2", "town-center", { x: 3, y: 2 });
  state.units[target.id] = replacement;
  const healthBefore = replacement.health.current;

  advanceWorldTick(state);

  assert.equal(replacement.health.current, healthBefore);
  assert.equal(state.combatEvents.length, 0);
});

test("same-tick combat impacts resolve in canonical projectile order", () => {
  const { state, target } = createCombatWorld();
  const second = createUnitState("p1-attacker-b", "p1", "swordsman", { x: 2, y: 3 });
  const first = state.units["p1-attacker"]!;
  first.projectileProfileId = PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id;
  second.projectileProfileId = PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id;
  target.health.current = 50;
  state.units[second.id] = second;

  advanceWorldTick(state);
  advanceWorldTick(state);

  assert.deepEqual(state.combatEvents.map((event) => event.sourceUnitId), [first.id, second.id]);
  assert.deepEqual(state.combatEvents.map((event) => event.id), [
    `2:${first.id}:${target.id}:projectile-000000000001`,
    `2:${second.id}:${target.id}:projectile-000000000002`,
  ]);
});

test("unit override selects an injected registry profile and unknown profiles fail at execution", () => {
  const custom = createCombatWorld();
  custom.attacker.projectileProfileId = "test:combat-immediate";
  let customProfileReads = 0;
  const registry: ProjectileRegistry = {
    getProfile(id) {
      if (id === "test:combat-immediate") {
        customProfileReads += 1;
        return { ...PRODUCT_IMMEDIATE_PROJECTILE_PROFILE, id };
      }
      return PRODUCT_PROJECTILE_REGISTRY.getProfile(id);
    },
    getMotionPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getMotionPolicy(id),
    getCollisionPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getCollisionPolicy(id),
    getImpactPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getImpactPolicy(id),
  };

  advanceWorldTick(custom.state, { projectileRegistry: registry });

  assert.ok(customProfileReads > 0);
  assert.equal(custom.state.projectileSystem.projectiles[0]?.profileId, "test:combat-immediate");

  const unknown = createCombatWorld();
  unknown.attacker.projectileProfileId = "test:unknown-profile";
  assert.throws(() => advanceWorldTick(unknown.state), /unknown projectile profile: test:unknown-profile/);
});

test("unrelated impact payloads remain in lifecycle history without causing combat damage", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1", "p2"]);
  const target = createUnitState("p2-target", "p2", "villager", { x: 2, y: 2 });
  state.units = { [target.id]: target };
  state.projectileSystem = spawnProjectile(state.projectileSystem, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    start: { x: 1, y: 2 },
    destination: { x: 2, y: 2 },
    sourceId: "p1-unrelated",
    targetId: target.id,
    payload: { purpose: "presentation-only" },
  }).state;
  const healthBefore = target.health.current;

  advanceWorldTick(state);

  assert.equal(target.health.current, healthBefore);
  assert.equal(state.combatEvents.length, 0);
  assert.equal(state.projectileImpactEvents.length, 1);
});

test("forged combat payloads with inherited unit-definition names are rejected", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1", "p2"]);
  const target = createUnitState("p2-target", "p2", "house", { x: 2, y: 2 });
  state.units = { [target.id]: target };
  state.projectileSystem = spawnProjectile(state.projectileSystem, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    start: { x: 1, y: 2 },
    destination: { x: 2, y: 2 },
    sourceId: "p1-forged",
    targetId: target.id,
    payload: {
      schema: "simulation:combat-damage",
      version: 1,
      sourceUnitId: "p1-forged",
      sourcePlayerId: "p1",
      sourceKind: "toString",
      sourcePosition: { x: 1, y: 2 },
      targetUnitId: target.id,
      targetPlayerId: target.playerId,
      targetKind: target.kind,
      damageAmount: 99,
      damageType: "physical",
    },
  }).state;
  const healthBefore = target.health.current;

  advanceWorldTick(state);

  assert.equal(target.health.current, healthBefore);
  assert.equal(state.combatEvents.length, 0);
  assert.equal(state.projectileImpactEvents.length, 1);
});

test("legacy units without an override use content delivery selection only when supplied", () => {
  const unit = createUnitState("p1-unit", "p1", "swordsman", { x: 0, y: 0 });
  const contentCombat: NonNullable<UnitDefinition["combat"]> = {
    damage: 1,
    range: 1,
    cooldownTicks: 1,
    aggroRange: 1,
    projectileProfileId: "mod:content-projectile",
  };

  assert.equal(resolveProjectileDeliveryProfileId(unit, contentCombat), "mod:content-projectile");
  unit.projectileProfileId = "mod:legacy-unit-override";
  assert.equal(resolveProjectileDeliveryProfileId(unit, contentCombat), "mod:legacy-unit-override");
});

function createCombatWorld() {
  const state = createInitialWorldState(createBlankMap(), ["p1", "p2"]);
  const attacker = createUnitState("p1-attacker", "p1", "swordsman", { x: 2, y: 2 });
  const target = createUnitState("p2-target", "p2", "house", { x: 3, y: 2 });
  state.units = {
    [attacker.id]: attacker,
    [target.id]: target,
  };
  attacker.currentOrder = { type: "attack-unit", targetUnitId: target.id };
  return { state, attacker, target };
}
