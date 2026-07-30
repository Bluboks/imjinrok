import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceProjectileSystem,
  createProjectileRegistry,
  createProjectileRegistryWithK01RyuSubtype0c,
  createProjectileSystemState,
  PRODUCT_EVENT_IMPACT_POLICY_ID,
  PRODUCT_IMMEDIATE_MOTION_POLICY_ID,
  PRODUCT_IMMEDIATE_PROJECTILE_PROFILE,
  PRODUCT_LINEAR_PROJECTILE_PROFILE,
  PRODUCT_NO_IMPACT_POLICY_ID,
  PRODUCT_PROJECTILE_REGISTRY,
  PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID,
  spawnProjectile,
  type ProjectileProfile,
  type ProjectileSystemState,
} from "./projectiles.js";

test("product immediate projectiles allocate a stable id and emit their target impact on the next pool advance", () => {
  const spawned = spawnProjectile(createProjectileSystemState(), PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    start: { x: 1, y: 2 }, destination: { x: 4, y: 6 }, sourceId: "unit:archer", targetId: "unit:target",
  });
  assert.equal(spawned.projectile.id, "projectile-000000000001");
  const advanced = advanceProjectileSystem(spawned.state, PRODUCT_PROJECTILE_REGISTRY);
  assert.deepEqual(advanced.state, { nextProjectileSequence: 2, projectiles: [] });
  assert.deepEqual(advanced.impacts, [{
    projectileId: "projectile-000000000001", profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    eventId: "product-generic-impact", sourceId: "unit:archer", targetId: "unit:target", payload: {}, position: { x: 4, y: 6 },
  }]);
});

test("linear projectiles serialize cleanly and advance in stable allocation order", () => {
  const first = spawnProjectile(createProjectileSystemState(), PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_LINEAR_PROJECTILE_PROFILE.id, start: { x: 0, y: 0 }, destination: { x: 9, y: 3 },
    targetId: "unit:first", targetReference: { id: "unit:first", generation: 3 }, payload: { amount: 45, tags: ["source"] },
  });
  const second = spawnProjectile(first.state, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_LINEAR_PROJECTILE_PROFILE.id, start: { x: 4, y: 4 }, destination: { x: 7, y: 7 }, targetId: "unit:second",
  });
  let state = JSON.parse(JSON.stringify(second.state)) as ProjectileSystemState;
  for (let index = 0; index < 2; index += 1) {
    const advanced = advanceProjectileSystem(state, PRODUCT_PROJECTILE_REGISTRY);
    state = advanced.state;
    assert.deepEqual(advanced.impacts, []);
  }
  assert.deepEqual(state.projectiles.map((projectile) => ({ id: projectile.id, position: projectile.position })), [
    { id: "projectile-000000000001", position: { x: 6, y: 2 } },
    { id: "projectile-000000000002", position: { x: 6, y: 6 } },
  ]);
  assert.deepEqual(state.projectiles[0]?.payload, { amount: 45, tags: ["source"] });
  assert.deepEqual(state.projectiles[0]?.targetReference, { id: "unit:first", generation: 3 });
  const completed = advanceProjectileSystem(state, PRODUCT_PROJECTILE_REGISTRY);
  assert.deepEqual(completed.impacts.map((impact) => impact.projectileId), ["projectile-000000000001", "projectile-000000000002"]);
  assert.deepEqual(completed.impacts[0]?.payload, { amount: 45, tags: ["source"] });
  assert.deepEqual(completed.impacts[0]?.targetReference, { id: "unit:first", generation: 3 });
});

test("behavior policies are registry-selected and registry profiles are defensively copied", () => {
  const profile: ProjectileProfile = {
    id: "mod-no-impact", motion: { policyId: PRODUCT_IMMEDIATE_MOTION_POLICY_ID, data: {} },
    collision: { policyId: PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID, data: {} },
    impact: { policyId: PRODUCT_NO_IMPACT_POLICY_ID, data: {} },
  };
  const registry = createProjectileRegistry({
    profiles: [profile],
    motionPolicies: [{
      id: PRODUCT_IMMEDIATE_MOTION_POLICY_ID,
      createState: () => ({ policyId: PRODUCT_IMMEDIATE_MOTION_POLICY_ID, data: {} }),
      advance: ({ projectile }) => ({ position: projectile.destination, motion: projectile.motion, arrived: true }),
      validateState: () => {},
    }],
    collisionPolicies: [{
      id: PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID,
      validateProjectile: ({ projectile }) => { if (!projectile.targetId) throw new Error("target required"); },
      resolve: ({ arrived }) => arrived ? "impact" : "continue",
    }],
    impactPolicies: [{ id: PRODUCT_NO_IMPACT_POLICY_ID, createEvent: () => undefined }],
  });
  profile.impact.data = { eventId: "mutated" };
  const spawned = spawnProjectile(createProjectileSystemState(), registry, {
    profileId: "mod-no-impact", start: { x: 0, y: 0 }, destination: { x: 1, y: 1 }, targetId: "unit:target",
  });
  assert.deepEqual(advanceProjectileSystem(spawned.state, registry).impacts, []);
  assert.equal(registry.getProfile("mod-no-impact")?.impact.policyId, PRODUCT_NO_IMPACT_POLICY_ID);
  assert.throws(() => {
    const stored = registry.getProfile("mod-no-impact");
    if (!stored) throw new Error("missing copied profile");
    stored.impact.policyId = "mutated";
  }, TypeError);
});

test("the opt-in Ryu adapter consumes the audited sampled route without choosing a 24 Hz cadence", () => {
  const registry = createProjectileRegistryWithK01RyuSubtype0c();
  const spawned = spawnProjectile(createProjectileSystemState(), registry, {
    profileId: "k01-ryu-subtype-0c-static-port", start: { x: 0, y: 0 }, destination: { x: 15, y: 8 }, targetId: "unit:target",
  });
  const inFlight = advanceProjectileSystem(spawned.state, registry);
  assert.deepEqual(inFlight.impacts, []);
  assert.deepEqual(inFlight.state.projectiles[0]?.position, { x: 0, y: 0 });
  assert.deepEqual(advanceProjectileSystem(inFlight.state, registry).impacts, [{
    projectileId: "projectile-000000000001", profileId: "k01-ryu-subtype-0c-static-port",
    eventId: "original-effect-kind-9", targetId: "unit:target", payload: {}, position: { x: 14, y: 7 },
  }]);
});

test("a mod collision policy can impact during flight without a WorldState query", () => {
  const motionPolicyId = "mod-motion-step";
  const collisionPolicyId = "mod-collision-first-step";
  const impactPolicyId = "mod-impact-event";
  const profile: ProjectileProfile = {
    id: "mod-mid-flight-impact",
    motion: { policyId: motionPolicyId, data: {} },
    collision: { policyId: collisionPolicyId, data: {} },
    impact: { policyId: impactPolicyId, data: {} },
  };
  const registry = createProjectileRegistry({
    profiles: [profile],
    motionPolicies: [{
      id: motionPolicyId,
      createState: () => ({ policyId: motionPolicyId, data: { step: 0 } }),
      advance: ({ projectile }) => {
        const step = projectile.motion.data.step;
        if (typeof step !== "number") throw new Error("missing step");
        return {
          position: { x: step + 1, y: 0 },
          motion: { policyId: motionPolicyId, data: { step: step + 1 } },
          arrived: false,
        };
      },
      validateState: () => {},
    }],
    collisionPolicies: [{
      id: collisionPolicyId,
      validateProjectile: () => {},
      resolve: ({ projectile, arrived }) => !arrived && projectile.position.x === 1 ? "impact" : "continue",
    }],
    impactPolicies: [{
      id: impactPolicyId,
      createEvent: ({ projectile, profile: impactProfile }) => ({
        projectileId: projectile.id,
        profileId: impactProfile.id,
        eventId: "mod-mid-flight-hit",
        payload: projectile.payload,
        position: projectile.position,
      }),
    }],
  });
  const spawned = spawnProjectile(createProjectileSystemState(), registry, {
    profileId: profile.id, start: { x: 0, y: 0 }, destination: { x: 5, y: 0 }, payload: { spell: "probe" },
  });
  const advanced = advanceProjectileSystem(spawned.state, registry);
  assert.deepEqual(advanced.state.projectiles, []);
  assert.deepEqual(advanced.impacts, [{
    projectileId: "projectile-000000000001", profileId: profile.id, eventId: "mod-mid-flight-hit",
    payload: { spell: "probe" }, position: { x: 1, y: 0 },
  }]);
});

test("restored projectile ids are canonical and sequence exhaustion is explicit", () => {
  const malformed = (id: string): ProjectileSystemState => ({
    nextProjectileSequence: 2,
    projectiles: [{
      id, profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id, targetId: "unit:target",
      start: { x: 0, y: 0 }, destination: { x: 1, y: 1 }, position: { x: 0, y: 0 },
      payload: {},
      motion: { policyId: PRODUCT_IMMEDIATE_MOTION_POLICY_ID, data: {} },
    }],
  });
  assert.throws(() => advanceProjectileSystem(malformed(" projectile-000000000001"), PRODUCT_PROJECTILE_REGISTRY), /canonical projectile/);
  assert.throws(() => advanceProjectileSystem(malformed("projectile-1"), PRODUCT_PROJECTILE_REGISTRY), /canonical projectile/);
  const final = spawnProjectile({ nextProjectileSequence: 999_999_999_999, projectiles: [] }, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id, start: { x: 0, y: 0 }, destination: { x: 1, y: 1 }, targetId: "unit:target",
  });
  assert.equal(final.projectile.id, "projectile-999999999999");
  assert.equal(final.state.nextProjectileSequence, null);
  assert.throws(() => spawnProjectile(final.state, PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id, start: { x: 0, y: 0 }, destination: { x: 1, y: 1 }, targetId: "unit:target",
  }), /sequence is exhausted/);
  assert.throws(() => spawnProjectile(createProjectileSystemState(), PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id, start: { x: 0, y: 0 }, destination: { x: 1, y: 1 },
    targetId: "unit:target", payload: { amount: Number.NaN },
  }), /numbers must be finite/);
  const dangerousPayload = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => spawnProjectile(createProjectileSystemState(), PRODUCT_PROJECTILE_REGISTRY, {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id, start: { x: 0, y: 0 }, destination: { x: 1, y: 1 },
    targetId: "unit:target", payload: dangerousPayload,
  }), /dangerous object keys/);
});

test("registry rejects duplicate and unknown behavior policy ids", () => {
  assert.throws(() => createProjectileRegistry({
    profiles: [], motionPolicies: [], collisionPolicies: [],
    impactPolicies: [{ id: PRODUCT_EVENT_IMPACT_POLICY_ID, createEvent: () => undefined }, { id: PRODUCT_EVENT_IMPACT_POLICY_ID, createEvent: () => undefined }],
  }), /duplicate impact policy id/);
  assert.throws(() => createProjectileRegistry({
    profiles: [{ ...PRODUCT_IMMEDIATE_PROJECTILE_PROFILE, impact: { policyId: "missing-impact", data: {} } }],
    motionPolicies: [], collisionPolicies: [], impactPolicies: [],
  }), /references an unknown policy id/);
});

test("custom impact events must preserve the current projectile identity", () => {
  const profile: ProjectileProfile = {
    id: "mod-invalid-impact",
    motion: { policyId: PRODUCT_IMMEDIATE_MOTION_POLICY_ID, data: {} },
    collision: { policyId: PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID, data: {} },
    impact: { policyId: "mod-invalid-impact-policy", data: {} },
  };
  const registry = createProjectileRegistry({
    profiles: [profile],
    motionPolicies: [{
      id: PRODUCT_IMMEDIATE_MOTION_POLICY_ID,
      createState: () => ({ policyId: PRODUCT_IMMEDIATE_MOTION_POLICY_ID, data: {} }),
      advance: ({ projectile }) => ({ position: projectile.destination, motion: projectile.motion, arrived: true }),
      validateState: () => {},
    }],
    collisionPolicies: [{
      id: PRODUCT_TARGET_AT_ARRIVAL_COLLISION_POLICY_ID,
      validateProjectile: () => {},
      resolve: () => "impact",
    }],
    impactPolicies: [{
      id: "mod-invalid-impact-policy",
      createEvent: ({ projectile, profile: impactProfile }) => ({
        projectileId: "projectile-000000000999",
        profileId: impactProfile.id,
        eventId: "invalid",
        payload: projectile.payload,
        position: projectile.position,
      }),
    }],
  });
  const spawned = spawnProjectile(createProjectileSystemState(), registry, {
    profileId: profile.id, start: { x: 0, y: 0 }, destination: { x: 1, y: 1 }, payload: {},
  });
  assert.throws(() => advanceProjectileSystem(spawned.state, registry), /current projectile and profile/);
});
