import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialWorldState,
  PRODUCT_IMMEDIATE_PROJECTILE_PROFILE,
  PRODUCT_PROJECTILE_REGISTRY,
  spawnProjectile,
  type ProjectileRegistry,
  type WorldState,
} from "../simulation.js";
import { defaultMap, defaultSkirmishScenario, type MapDefinition, type ScenarioDefinition } from "../shared.js";
import { GameSessionService } from "./GameSessionService.js";

test("authoritative server ticks use an injected projectile registry without serializing executables", () => {
  const timer = captureIntervalTick();
  const { registry, profileReads } = createSpyProjectileRegistry();
  const service = new GameSessionService(24, { projectileRegistry: registry });

  try {
    const session = service.createSession(createSessionOptions());
    const state = getActiveWorldState(service);
    state.projectileSystem = spawnProjectile(state.projectileSystem, PRODUCT_PROJECTILE_REGISTRY, {
      profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
      start: { x: 1, y: 1 },
      destination: { x: 2, y: 2 },
      targetId: "p2-target",
    }).state;

    timer.invoke();

    assert.ok(profileReads.count > 0);
    assert.equal(service.getSnapshot(session.id)?.projectileImpactEvents.length, 1);
    assert.equal(JSON.stringify(service.getSnapshot(session.id)).includes("getProfile"), false);
  } finally {
    service.dispose();
    timer.restore();
  }
});

test("authoritative server keeps the product projectile registry as its default", () => {
  const timer = captureIntervalTick();
  const service = new GameSessionService(24);

  try {
    const session = service.createSession(createSessionOptions());
    const state = getActiveWorldState(service);
    state.projectileSystem = spawnProjectile(state.projectileSystem, PRODUCT_PROJECTILE_REGISTRY, {
      profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
      start: { x: 1, y: 1 },
      destination: { x: 2, y: 2 },
      targetId: "p2-target",
    }).state;

    timer.invoke();

    assert.equal(service.getSnapshot(session.id)?.projectileImpactEvents[0]?.profileId, PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id);
  } finally {
    service.dispose();
    timer.restore();
  }
});

test("authoritative server exposes unavailable active projectile profiles as deterministic configuration errors", () => {
  const timer = captureIntervalTick();
  const service = new GameSessionService(24, { projectileRegistry: createUnavailableProjectileRegistry() });

  try {
    service.createSession(createSessionOptions());
    const state = getActiveWorldState(service);
    state.projectileSystem = {
      nextProjectileSequence: 2,
      projectiles: [{
        id: "projectile-000000000001",
        profileId: "mod:unavailable-profile",
        payload: {},
        start: { x: 0, y: 0 },
        destination: { x: 1, y: 1 },
        position: { x: 0, y: 0 },
        motion: { policyId: "mod:unavailable-motion", data: {} },
      }],
    };

    assert.throws(() => timer.invoke(), /unknown projectile profile: mod:unavailable-profile/);
  } finally {
    service.dispose();
    timer.restore();
  }
});

function createSessionOptions(): {
  entryMode: "custom-lobby";
  connectionMode: "hosted";
  scenario: ScenarioDefinition;
  map: MapDefinition;
  playerIds: string[];
} {
  return {
    entryMode: "custom-lobby",
    connectionMode: "hosted",
    scenario: defaultSkirmishScenario,
    map: defaultMap,
    playerIds: ["p1", "p2"],
  };
}

function getActiveWorldState(service: GameSessionService): WorldState {
  const sessions = Reflect.get(service, "sessions") as Map<string, { worldState: WorldState }>;
  const activeSession = sessions.values().next().value;

  assert.ok(activeSession);
  return activeSession.worldState;
}

function createSpyProjectileRegistry(): { registry: ProjectileRegistry; profileReads: { count: number } } {
  const profileReads = { count: 0 };

  return {
    registry: {
      getProfile(id) {
        profileReads.count += 1;
        return PRODUCT_PROJECTILE_REGISTRY.getProfile(id);
      },
      getMotionPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getMotionPolicy(id),
      getCollisionPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getCollisionPolicy(id),
      getImpactPolicy: (id) => PRODUCT_PROJECTILE_REGISTRY.getImpactPolicy(id),
    },
    profileReads,
  };
}

function createUnavailableProjectileRegistry(): ProjectileRegistry {
  return {
    getProfile: () => undefined,
    getMotionPolicy: () => undefined,
    getCollisionPolicy: () => undefined,
    getImpactPolicy: () => undefined,
  };
}

function captureIntervalTick(): { invoke(): void; restore(): void } {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let callback: (() => void) | undefined;

  globalThis.setInterval = ((handler: (...callbackArgs: unknown[]) => void, _timeout?: number, ...args: unknown[]) => {
    callback = () => handler(...args);
    return {} as NodeJS.Timeout;
  }) as typeof setInterval;
  globalThis.clearInterval = (() => undefined) as typeof clearInterval;

  return {
    invoke(): void {
      if (!callback) {
        throw new Error("expected GameSessionService to schedule an authoritative tick");
      }
      callback();
    },
    restore(): void {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    },
  };
}
