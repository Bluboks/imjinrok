import assert from "node:assert/strict";
import test from "node:test";

import { createBlankMap, type AuraDefinition } from "../../shared/src/index.js";
import { AuraProfileRegistry, applyAuraAttackDamage, refreshAuraEffects } from "./aura.js";
import { createUnitState } from "./entities.js";
import { advanceWorldTick } from "./tick.js";
import { removeUnitFromWorld } from "./units.js";
import { createInitialWorldState, toWorldSnapshot } from "./world.js";

const definition: AuraDefinition = {
  id: "test:leader-damage",
  providerKinds: ["gwon-yul"],
  targetKinds: ["swordsman"],
  relation: "allied",
  includeProvider: false,
  distance: { metric: "grid-chebyshev", maximum: 2 },
  stackingKey: "test:damage",
  attackDamageMultiplier: 1.5,
  indicatorId: "test:leader-mark",
};

test("aura refresh is opt-in, inclusive at its Chebyshev boundary, and snapshot-safe", () => {
  const { state, hero, ally } = createAuraWorld();
  refreshAuraEffects(state);
  assert.equal(ally.auraEffects, undefined, "generic worlds do not gain aura state");

  state.auraProfileId = "test:aura";
  const registry = registryFor(definition);
  refreshAuraEffects(state, registry);

  assert.deepEqual(ally.auraEffects, {
    "test:damage": {
      auraDefinitionId: "test:leader-damage",
      providerUnitId: hero.id,
      attackDamageMultiplier: 1.5,
      indicatorId: "test:leader-mark",
    },
  });
  assert.equal(applyAuraAttackDamage(ally, 9), 13, "damage floors after multiplying all selected keys");
  assert.deepEqual(toWorldSnapshot(state).units[ally.id]?.auraEffects, ally.auraEffects);
});

test("aura-free refresh clears stale effects without sorting generic units", () => {
  const { state, ally } = createAuraWorld();
  ally.auraEffects = {
    stale: {
      auraDefinitionId: "test:stale",
      providerUnitId: "hero",
      attackDamageMultiplier: 1.5,
    },
  };
  const originalSort = Array.prototype.sort;
  Array.prototype.sort = function disallowGenericAuraSort() {
    throw new Error("aura-free worlds must not sort units");
  };

  try {
    refreshAuraEffects(state);
  } finally {
    Array.prototype.sort = originalSort;
  }

  assert.equal(ally.auraEffects, undefined);
});

test("aura rejects enemy, wrong-kind, and outside-boundary recipients", () => {
  const { state } = createAuraWorld();
  state.auraProfileId = "test:aura";
  state.units.enemy = createUnitState("enemy", "p2", "swordsman", { x: 3, y: 2 });
  state.units.wrong = createUnitState("wrong", "p1", "villager", { x: 2, y: 4 });
  state.units.outside = createUnitState("outside", "p1", "swordsman", { x: 5, y: 2 });

  refreshAuraEffects(state, registryFor(definition));

  assert.equal(state.units.enemy?.auraEffects, undefined);
  assert.equal(state.units.wrong?.auraEffects, undefined);
  assert.equal(state.units.outside?.auraEffects, undefined);
});

test("overlapping candidates use highest multiplier then lexical provider tie-break and removal clears immediately", () => {
  const { state, ally } = createAuraWorld();
  state.auraProfileId = "test:aura";
  const earlier = createUnitState("a-hero", "p1", "gwon-yul", { x: 3, y: 2 });
  state.units[earlier.id] = earlier;
  const stronger: AuraDefinition = { ...definition, id: "test:stronger", attackDamageMultiplier: 2 };

  refreshAuraEffects(state, registryFor(definition, stronger));
  assert.deepEqual(ally.auraEffects?.["test:damage"], {
    auraDefinitionId: "test:stronger",
    providerUnitId: "a-hero",
    attackDamageMultiplier: 2,
    indicatorId: "test:leader-mark",
  });

  removeUnitFromWorld(state, earlier.id);
  refreshAuraEffects(state, registryFor(definition, stronger));
  assert.equal(ally.auraEffects?.["test:damage"]?.providerUnitId, "hero");
  removeUnitFromWorld(state, "hero");
  assert.equal(ally.auraEffects, undefined);
});

test("aura damage is applied to direct combat and an unknown selected profile fails loudly", () => {
  const { state, ally } = createAuraWorld();
  const target = createUnitState("target", "p2", "villager", { x: 5, y: 2 });
  state.units[target.id] = target;
  ally.currentOrder = { type: "attack-unit", targetUnitId: target.id };
  state.auraProfileId = "test:aura";
  const healthBefore = target.health.current;

  advanceWorldTick(state, { auraProfileRegistry: registryFor(definition) });
  assert.equal(target.health.current, healthBefore - 13);

  state.auraProfileId = "missing:aura";
  assert.throws(() => refreshAuraEffects(state, new AuraProfileRegistry()), /Unknown aura profile/);
});

function createAuraWorld() {
  const state = createInitialWorldState(createBlankMap({ width: 12, height: 12 }), ["p1", "p2"]);
  state.units = {};
  const hero = createUnitState("hero", "p1", "gwon-yul", { x: 2, y: 2 });
  const ally = createUnitState("ally", "p1", "swordsman", { x: 4, y: 2 });
  state.units[hero.id] = hero;
  state.units[ally.id] = ally;
  return { state, hero, ally };
}

function registryFor(...definitions: AuraDefinition[]): AuraProfileRegistry {
  const registry = new AuraProfileRegistry();
  registry.register({ id: "test:aura", definitions });
  return registry;
}
