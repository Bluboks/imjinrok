import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap } from "../../shared/src/index.js";
import {
  advanceWorldTick,
  createInitialWorldState,
  PRODUCT_IMMEDIATE_PROJECTILE_PROFILE,
  PRODUCT_LINEAR_PROJECTILE_PROFILE,
  PRODUCT_PROJECTILE_REGISTRY,
  parseSerializedProjectileImpactLog,
  parseSerializedProjectileSystemState,
  spawnProjectile,
  toWorldSnapshot,
  type ProjectileRegistry,
} from "./index.js";

test("initial world snapshots include empty serialized projectile lifecycle state", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);

  assert.deepEqual(state.projectileSystem, { nextProjectileSequence: 1, projectiles: [] });
  assert.deepEqual(state.projectileImpactEvents, []);
  assert.deepEqual(toWorldSnapshot(state).projectileSystem, state.projectileSystem);
  assert.deepEqual(toWorldSnapshot(state).projectileImpactEvents, state.projectileImpactEvents);
});

test("world advances linear projectiles exactly once per running tick before combat", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  state.projectileSystem = spawnProjectile(state.projectileSystem, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_LINEAR_PROJECTILE_PROFILE.id,
    start: { x: 0, y: 0 },
    destination: { x: 9, y: 3 },
    targetId: "target:one",
  }).state;

  advanceWorldTick(state);
  assert.deepEqual(state.projectileSystem.projectiles[0]?.position, { x: 3, y: 1 });
  assert.deepEqual(state.projectileSystem.projectiles[0]?.motion.data, { durationSteps: 3, elapsedSteps: 1 });
  assert.deepEqual(state.projectileImpactEvents, []);
  const roundTripped = JSON.parse(JSON.stringify(toWorldSnapshot(state))) as unknown;
  assert.deepEqual(parseSerializedProjectileSystemState((roundTripped as { projectileSystem: unknown }).projectileSystem), state.projectileSystem);
  assert.deepEqual(parseSerializedProjectileImpactLog((roundTripped as { projectileImpactEvents: unknown }).projectileImpactEvents), state.projectileImpactEvents);

  advanceWorldTick(state);
  assert.deepEqual(state.projectileSystem.projectiles[0]?.position, { x: 6, y: 2 });
  assert.deepEqual(state.projectileSystem.projectiles[0]?.motion.data, { durationSteps: 3, elapsedSteps: 2 });

  advanceWorldTick(state);
  assert.deepEqual(state.projectileSystem.projectiles, []);
  assert.deepEqual(state.projectileImpactEvents, [{
    tick: 3,
    projectileId: "projectile-000000000001",
    profileId: PRODUCT_LINEAR_PROJECTILE_PROFILE.id,
    eventId: "product-generic-impact",
    targetId: "target:one",
    payload: {},
    position: { x: 9, y: 3 },
  }]);
});

test("world records immediate impacts once in canonical order and expires retained history deterministically", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  const first = spawnProjectile(state.projectileSystem, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    start: { x: 1, y: 1 }, destination: { x: 2, y: 2 }, targetId: "target:first",
  });
  state.projectileSystem = spawnProjectile(first.state, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    start: { x: 3, y: 3 }, destination: { x: 4, y: 4 }, targetId: "target:second",
  }).state;

  advanceWorldTick(state);
  assert.deepEqual(state.projectileSystem.projectiles, []);
  assert.deepEqual(state.projectileImpactEvents.map((event) => event.projectileId), [
    "projectile-000000000001",
    "projectile-000000000002",
  ]);

  for (let tick = 0; tick < 8; tick += 1) advanceWorldTick(state);
  assert.equal(state.tick, 9);
  assert.equal(state.projectileImpactEvents.length, 2);

  advanceWorldTick(state);
  assert.equal(state.tick, 10);
  assert.deepEqual(state.projectileImpactEvents, []);
});

test("world tick honors an injected projectile registry without serializing it", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  let profileReads = 0;
  const registry: ProjectileRegistry = {
    getProfile(id) {
      profileReads += 1;
      return PRODUCT_PROJECTILE_REGISTRY.getProfile(id);
    },
    getMotionPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getMotionPolicy(id),
    getCollisionPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getCollisionPolicy(id),
    getImpactPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getImpactPolicy(id),
  };
  state.projectileSystem = spawnProjectile(state.projectileSystem, registry, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    start: { x: 1, y: 1 }, destination: { x: 2, y: 2 }, targetId: "target:custom-registry",
  }).state;
  const profileReadsBeforeTick = profileReads;

  advanceWorldTick(state, { projectileRegistry: registry });

  assert.ok(profileReads > profileReadsBeforeTick);
  assert.equal(JSON.stringify(toWorldSnapshot(state)).includes("getProfile"), false);
});
