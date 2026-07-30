import type { MapDefinition, MinimapAvailabilityPolicyId } from "@shared";
import { isUnitUnderConstruction, type UnitState } from "@simulation";

export const CORE_ALWAYS_ENABLED_MINIMAP_AVAILABILITY_POLICY_ID = "core:always-enabled";
export const K01_LOCAL_COMPLETED_BEACON_MINIMAP_AVAILABILITY_POLICY_ID = "imjinrok:k01-local-completed-beacon";

export interface MinimapAvailabilityPolicyContext {
  readonly localPlayerId: string;
  readonly units: Readonly<Record<string, UnitState>>;
}

/** A pure product/mod decision about HUD presentation, never source parity. */
export interface MinimapAvailabilityPolicy {
  readonly id: MinimapAvailabilityPolicyId;
  isEnabled(context: MinimapAvailabilityPolicyContext): boolean;
}

export interface RegisterMinimapAvailabilityPolicyOptions {
  /** Replaces the policy currently registered under this exact stable id. */
  replace?: boolean;
}

/**
 * Caller-owned policy boundary so a mod can provide an availability rule without
 * making a map id a rendering or input conditional.
 */
export class MinimapAvailabilityPolicyRegistry {
  private readonly policies = new Map<MinimapAvailabilityPolicyId, MinimapAvailabilityPolicy>();

  constructor(policies: readonly MinimapAvailabilityPolicy[] = []) {
    for (const policy of policies) {
      this.register(policy);
    }
  }

  register(policy: MinimapAvailabilityPolicy, options: RegisterMinimapAvailabilityPolicyOptions = {}): void {
    assertMinimapAvailabilityPolicy(policy);

    if (this.policies.has(policy.id) && options.replace !== true) {
      throw new Error(`Minimap availability policy '${policy.id}' is already registered.`);
    }

    this.policies.set(policy.id, policy);
  }

  require(id: MinimapAvailabilityPolicyId): MinimapAvailabilityPolicy {
    assertMinimapAvailabilityPolicyId(id);
    const policy = this.policies.get(id);

    if (!policy) {
      throw new Error(`Unknown minimap availability policy '${id}'. Register its policy before starting the scene.`);
    }

    return policy;
  }
}

/** Existing generic-map behavior. */
export const coreAlwaysEnabledMinimapAvailabilityPolicy: MinimapAvailabilityPolicy = {
  id: CORE_ALWAYS_ENABLED_MINIMAP_AVAILABILITY_POLICY_ID,
  isEnabled: () => true,
};

/**
 * Intentional K01 product policy. It is not an original-game parity claim:
 * original HUD-gate producer/alias reachability is still unresolved.
 */
export const k01LocalCompletedBeaconMinimapAvailabilityPolicy: MinimapAvailabilityPolicy = {
  id: K01_LOCAL_COMPLETED_BEACON_MINIMAP_AVAILABILITY_POLICY_ID,
  isEnabled: ({ localPlayerId, units }) => Object.values(units).some((unit) => isLiveCompletedLocalBeacon(unit, localPlayerId)),
};

export const defaultMinimapAvailabilityPolicyRegistry = new MinimapAvailabilityPolicyRegistry([
  coreAlwaysEnabledMinimapAvailabilityPolicy,
  k01LocalCompletedBeaconMinimapAvailabilityPolicy,
]);

export function requireMinimapAvailabilityPolicyForMap(
  map: Pick<MapDefinition, "minimapAvailabilityPolicyId">,
  registry: MinimapAvailabilityPolicyRegistry = defaultMinimapAvailabilityPolicyRegistry,
): MinimapAvailabilityPolicy {
  return registry.require(map.minimapAvailabilityPolicyId ?? CORE_ALWAYS_ENABLED_MINIMAP_AVAILABILITY_POLICY_ID);
}

export function evaluateMinimapAvailability(
  map: Pick<MapDefinition, "minimapAvailabilityPolicyId">,
  context: MinimapAvailabilityPolicyContext,
  registry: MinimapAvailabilityPolicyRegistry = defaultMinimapAvailabilityPolicyRegistry,
): boolean {
  const policy = requireMinimapAvailabilityPolicyForMap(map, registry);
  const enabled = policy.isEnabled(context);

  if (typeof enabled !== "boolean") {
    throw new Error(`Minimap availability policy '${policy.id}' must return a boolean enabled state.`);
  }

  return enabled;
}

function isLiveCompletedLocalBeacon(unit: UnitState, localPlayerId: string): boolean {
  return unit.playerId === localPlayerId && unit.kind === "beacon" && unit.health.current > 0 && !isUnitUnderConstruction(unit);
}

function assertMinimapAvailabilityPolicyId(id: string): void {
  if (!id.trim()) {
    throw new Error("Minimap availability policy id must not be empty.");
  }
  if (id !== id.trim()) {
    throw new Error(`Minimap availability policy id '${id}' must not have surrounding whitespace.`);
  }
}

function assertMinimapAvailabilityPolicy(policy: MinimapAvailabilityPolicy): void {
  assertMinimapAvailabilityPolicyId(policy.id);

  if (typeof policy.isEnabled !== "function") {
    throw new Error(`Minimap availability policy '${policy.id}' must define an isEnabled function.`);
  }
}
