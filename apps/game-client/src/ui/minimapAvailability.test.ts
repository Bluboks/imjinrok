import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, type MapDefinition } from "@shared";
import type { UnitState } from "@simulation";
import {
  CORE_ALWAYS_ENABLED_MINIMAP_AVAILABILITY_POLICY_ID,
  K01_LOCAL_COMPLETED_BEACON_MINIMAP_AVAILABILITY_POLICY_ID,
  MinimapAvailabilityPolicyRegistry,
  coreAlwaysEnabledMinimapAvailabilityPolicy,
  evaluateMinimapAvailability,
} from "./minimapAvailability.js";

const k01Map: Pick<MapDefinition, "minimapAvailabilityPolicyId"> = {
  minimapAvailabilityPolicyId: K01_LOCAL_COMPLETED_BEACON_MINIMAP_AVAILABILITY_POLICY_ID,
};

test("K01 product policy enables only after a live local beacon completes", () => {
  const incomplete = beacon({ construction: { remainingTicks: 1, totalTicks: 300, builderUnitId: "worker-1" } });

  assert.equal(evaluateMinimapAvailability(k01Map, context({ beacon: incomplete })), false);
  incomplete.construction!.remainingTicks = 0;
  assert.equal(evaluateMinimapAvailability(k01Map, context({ beacon: incomplete })), true);
});

test("K01 product policy remains enabled until the final live local completed beacon is gone", () => {
  const first = beacon({ id: "beacon-1" });
  const second = beacon({ id: "beacon-2" });

  assert.equal(evaluateMinimapAvailability(k01Map, context({ first, second })), true);
  first.health.current = 0;
  assert.equal(evaluateMinimapAvailability(k01Map, context({ first, second })), true);
  second.health.current = 0;
  assert.equal(evaluateMinimapAvailability(k01Map, context({ first, second })), false);
});

test("K01 product policy excludes wrong-owner, dead, and removed beacons", () => {
  assert.equal(evaluateMinimapAvailability(k01Map, context({ wrongOwner: beacon({ playerId: "cpu-1" }) })), false);
  assert.equal(evaluateMinimapAvailability(k01Map, context({ wrongKind: beacon({ kind: "town-center" }) })), false);
  assert.equal(evaluateMinimapAvailability(k01Map, context({ dead: beacon({ health: { current: 0, max: 760 } }) })), false);
  assert.equal(evaluateMinimapAvailability(k01Map, context({})), false);
});

test("generic maps retain always-enabled minimap behavior", () => {
  const map = createBlankMap();

  assert.equal(map.minimapAvailabilityPolicyId, CORE_ALWAYS_ENABLED_MINIMAP_AVAILABILITY_POLICY_ID);
  assert.equal(evaluateMinimapAvailability(map, context({})), true);
});

test("unknown minimap availability policy ids fail during evaluation/setup", () => {
  assert.throws(
    () => evaluateMinimapAvailability({ minimapAvailabilityPolicyId: "mod:missing" }, context({})),
    /Unknown minimap availability policy 'mod:missing'/,
  );
});

test("mods can replace or extend the minimap availability registry", () => {
  const registry = new MinimapAvailabilityPolicyRegistry([coreAlwaysEnabledMinimapAvailabilityPolicy]);
  registry.register({ id: "mod:requires-unit", isEnabled: ({ units }) => Object.keys(units).length > 0 });
  registry.register({ id: CORE_ALWAYS_ENABLED_MINIMAP_AVAILABILITY_POLICY_ID, isEnabled: () => false }, { replace: true });

  assert.equal(evaluateMinimapAvailability({ minimapAvailabilityPolicyId: "mod:requires-unit" }, context({}), registry), false);
  assert.equal(evaluateMinimapAvailability({ minimapAvailabilityPolicyId: "mod:requires-unit" }, context({ beacon: beacon() }), registry), true);
  assert.equal(evaluateMinimapAvailability(createBlankMap(), context({}), registry), false);
});

test("registry rejects policies without callable availability evaluators", () => {
  const registry = new MinimapAvailabilityPolicyRegistry();

  assert.throws(
    () => {
      // @ts-expect-error The failure-path fixture intentionally supplies a non-callable evaluator.
      registry.register({ id: "mod:invalid-evaluator", isEnabled: true });
    },
    /Minimap availability policy 'mod:invalid-evaluator' must define an isEnabled function/,
  );
});

test("evaluation rejects policies that return non-boolean availability states", () => {
  const registry = new MinimapAvailabilityPolicyRegistry();
  // @ts-expect-error The failure-path fixture intentionally returns a non-boolean state.
  registry.register({ id: "mod:invalid-result", isEnabled: () => "enabled" });

  assert.throws(
    () => evaluateMinimapAvailability({ minimapAvailabilityPolicyId: "mod:invalid-result" }, context({}), registry),
    /Minimap availability policy 'mod:invalid-result' must return a boolean enabled state/,
  );
});

function context(units: Record<string, UnitState>) {
  return { localPlayerId: "local-player", units };
}

function beacon(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: "beacon-1",
    playerId: "local-player",
    kind: "beacon",
    position: { x: 10, y: 10 },
    movementSpeed: 0,
    health: { current: 760, max: 760 },
    mana: { current: 0, max: 0 },
    ...overrides,
  };
}
