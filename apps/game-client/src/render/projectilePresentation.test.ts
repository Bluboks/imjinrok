import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCT_IMMEDIATE_PROJECTILE_PROFILE,
  PRODUCT_LINEAR_PROJECTILE_PROFILE,
  TileVisibility,
  type ProjectileState,
} from "@simulation";
import {
  PRODUCT_PROJECTILE_VISUAL_REGISTRY,
  ProjectilePresentationReconciler,
  createProjectileVisualRegistry,
  filterVisibleProjectiles,
  resolveProjectileVisualPlacement,
  type ProjectilePresentationFactory,
  type ProjectileVisualPlacement,
  type ProjectileVisualDefinition,
} from "./projectilePresentation.js";

const mapOrigin = { x: 320, y: 160 };
const map = { tileWidth: 64, tileHeight: 32 };

function projectile(
  id: string,
  profileId: string,
  position: { x: number; y: number },
  start = { x: 0, y: 0 },
): ProjectileState {
  return {
    id,
    profileId,
    payload: {},
    start,
    destination: { x: 4, y: 2 },
    position,
    motion: { policyId: "test-motion", data: {} },
  };
}

test("product visual registry has explicit product profiles and leaves source-port profile unmapped", () => {
  assert.equal(PRODUCT_PROJECTILE_VISUAL_REGISTRY.get(PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id)?.kind, "product-primitive");
  assert.equal(PRODUCT_PROJECTILE_VISUAL_REGISTRY.get(PRODUCT_LINEAR_PROJECTILE_PROFILE.id)?.trailLengthPx, 13);
  assert.equal(PRODUCT_PROJECTILE_VISUAL_REGISTRY.get("k01-ryu-subtype-0c-static-port"), undefined);
  assert.equal(PRODUCT_PROJECTILE_VISUAL_REGISTRY.get("mod-unknown"), undefined);
});

test("visual registry accepts a mod-defined stable profile and rejects duplicate ids", () => {
  const registry = createProjectileVisualRegistry([{
    profileId: "mod:blue-orb",
    kind: "product-primitive",
    color: 0x2489e6,
    alpha: 0.75,
    radiusPx: 5,
    trailLengthPx: 4,
    liftPx: 9,
    depthBias: 21,
  }]);

  assert.equal(registry.get("mod:blue-orb")?.color, 0x2489e6);
  assert.throws(() => createProjectileVisualRegistry([
    {
      profileId: "mod:duplicate",
      kind: "product-primitive",
      color: 1,
      alpha: 1,
      radiusPx: 1,
      trailLengthPx: 0,
      liftPx: 0,
      depthBias: 0,
    },
    {
      profileId: "mod:duplicate",
      kind: "product-primitive",
      color: 2,
      alpha: 1,
      radiusPx: 1,
      trailLengthPx: 0,
      liftPx: 0,
      depthBias: 0,
    },
  ]), /Duplicate projectile visual profile/);
});

test("visual registry rejects malformed mod definitions instead of accepting invalid render metadata", () => {
  const valid: ProjectileVisualDefinition = {
    profileId: "mod:valid",
    kind: "product-primitive",
    color: 0x2489e6,
    alpha: 0.75,
    radiusPx: 5,
    trailLengthPx: 4,
    liftPx: 9,
    depthBias: 21,
  };
  const invalid: readonly Partial<ProjectileVisualDefinition>[] = [
    { profileId: " " },
    { profileId: " mod:leading-space" },
    { profileId: "mod:trailing-space " },
    { alpha: Number.NaN },
    { alpha: 1.01 },
    { radiusPx: Number.POSITIVE_INFINITY },
    { trailLengthPx: Number.NaN },
    { liftPx: Number.NaN },
    { depthBias: Number.NEGATIVE_INFINITY },
    { color: 0x1_000000 },
    { color: 1.5 },
  ];

  for (const overrides of invalid) {
    assert.throws(
      () => createProjectileVisualRegistry([{ ...valid, ...overrides }]),
      /Projectile visual profile/,
    );
  }
});

test("placement projects authoritative grid coordinates and applies only visual metadata lift", () => {
  const placement = resolveProjectileVisualPlacement(
    projectile("projectile-000000000001", PRODUCT_LINEAR_PROJECTILE_PROFILE.id, { x: 1, y: 0 }),
    PRODUCT_PROJECTILE_VISUAL_REGISTRY,
    mapOrigin,
    map,
  );

  assert.deepEqual(placement?.groundContact, { x: 352, y: 176 });
  assert.deepEqual(placement?.position, { x: 352, y: 163 });
  assert.equal(placement?.depth, 216);
  assert.deepEqual(placement?.travelDirection, { x: 0.8944271909999159, y: 0.4472135954999579 });
});

test("fog filter draws only projectiles at presently visible mechanics positions", () => {
  const visible = projectile("projectile-000000000001", PRODUCT_LINEAR_PROJECTILE_PROFILE.id, { x: 0, y: 0 });
  const explored = projectile("projectile-000000000002", PRODUCT_LINEAR_PROJECTILE_PROFILE.id, { x: 1, y: 0 });
  const unexplored = projectile("projectile-000000000003", PRODUCT_LINEAR_PROJECTILE_PROFILE.id, { x: 0, y: 1 });
  const before = JSON.stringify([visible, explored, unexplored]);

  const filtered = filterVisibleProjectiles([visible, explored, unexplored], {
    width: 2,
    height: 2,
    tiles: Uint8Array.from([
      TileVisibility.Visible,
      TileVisibility.Explored,
      TileVisibility.Unexplored,
      TileVisibility.Visible,
    ]),
  });

  assert.deepEqual(filtered.map(({ id }) => id), ["projectile-000000000001"]);
  assert.equal(JSON.stringify([visible, explored, unexplored]), before);
});

test("reconciler sorts by id, updates existing handles, removes vanished or unmapped projectiles, and never mutates simulation input", () => {
  const creations: string[] = [];
  const updates: string[] = [];
  const destroyed: string[] = [];
  const factory: ProjectilePresentationFactory = {
    create(placement: ProjectileVisualPlacement) {
      creations.push(placement.id);
      return {
        update(next) {
          updates.push(`${next.id}:${next.position.x},${next.position.y}`);
        },
        destroy() {
          destroyed.push(placement.id);
        },
      };
    },
  };
  const reconciler = new ProjectilePresentationReconciler(factory);
  const first = projectile("projectile-000000000002", PRODUCT_LINEAR_PROJECTILE_PROFILE.id, { x: 2, y: 0 });
  const second = projectile("projectile-000000000001", PRODUCT_LINEAR_PROJECTILE_PROFILE.id, { x: 1, y: 0 });
  const input = [first, second];
  const before = JSON.stringify(input);

  reconciler.reconcile(input, PRODUCT_PROJECTILE_VISUAL_REGISTRY, mapOrigin, map);
  assert.deepEqual(creations, ["projectile-000000000001", "projectile-000000000002"]);
  assert.equal(JSON.stringify(input), before);

  reconciler.reconcile([
    projectile("projectile-000000000001", PRODUCT_LINEAR_PROJECTILE_PROFILE.id, { x: 3, y: 0 }),
    projectile("projectile-000000000002", "mod-unmapped", { x: 2, y: 0 }),
  ], PRODUCT_PROJECTILE_VISUAL_REGISTRY, mapOrigin, map);
  assert.deepEqual(creations, ["projectile-000000000001", "projectile-000000000002"]);
  assert.deepEqual(updates, ["projectile-000000000001:416,195"]);
  assert.deepEqual(destroyed, ["projectile-000000000002"]);

  reconciler.destroy();
  assert.deepEqual(destroyed, ["projectile-000000000002", "projectile-000000000001"]);
});
