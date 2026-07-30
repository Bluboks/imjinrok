import { unitDefinitions, type DamageType, type GridPoint, type UnitDefinition, type UnitDefinitionId } from "../../shared/src/index.js";
import { resolveDamageAmount } from "./damage.js";
import { arePlayersEnemies } from "./diplomacy.js";
import { spawnProjectile, type ProjectileImpactEvent, type ProjectilePolicyData, type ProjectileRegistry } from "./projectiles.js";
import type { UnitState, WorldState } from "./types.js";
import { removeUnitFromWorld } from "./units.js";

export const COMBAT_PROJECTILE_PAYLOAD_SCHEMA = "simulation:combat-damage";
export const COMBAT_PROJECTILE_PAYLOAD_VERSION = 1;

interface ParsedCombatProjectilePayload {
  sourceUnitId: string;
  sourcePlayerId: string;
  sourceKind: UnitDefinitionId;
  sourcePosition: GridPoint;
  targetUnitId: string;
  targetPlayerId: string;
  targetKind: UnitDefinitionId;
  damageAmount: number;
  damageType: DamageType;
}

/** Resolves content first, with the saved unit override taking precedence for mods and tests. */
export function resolveProjectileDeliveryProfileId(
  unit: UnitState,
  combat: NonNullable<UnitDefinition["combat"]>,
): string | undefined {
  return unit.projectileProfileId ?? combat.projectileProfileId;
}

/**
 * Captures the launch-time combat information as a strict, versioned JSON
 * payload. The current product boundary has no serialized entity generation,
 * so target owner and kind are captured and revalidated. This deliberately
 * does not synthesize a generation; same-owner/same-kind id reuse remains an
 * explicit residual limitation until a real generation is serialized.
 */
export function spawnCombatProjectile(
  state: WorldState,
  registry: ProjectileRegistry,
  input: Readonly<{
    profileId: string;
    source: UnitState;
    target: UnitState;
    combat: NonNullable<UnitDefinition["combat"]>;
  }>,
): void {
  const { profileId, source, target, combat } = input;
  const spawned = spawnProjectile(state.projectileSystem, registry, {
    profileId,
    sourceId: source.id,
    targetId: target.id,
    start: source.position,
    destination: target.position,
    payload: createCombatProjectilePayload(source, target, combat),
  });
  state.projectileSystem = spawned.state;
}

/**
 * Consumes only lifecycle impacts supplied by the current tick. Retained
 * impact history is presentation/debug data and is intentionally not read.
 */
export function resolveCombatProjectileImpacts(
  state: WorldState,
  impacts: readonly ProjectileImpactEvent[],
): void {
  for (const impact of impacts) {
    const payload = parseCombatProjectilePayload(impact);
    if (!payload) {
      continue;
    }

    const target = state.units[payload.targetUnitId];
    if (
      !target ||
      target.health.current <= 0 ||
      target.playerId !== payload.targetPlayerId ||
      target.kind !== payload.targetKind ||
      !arePlayersEnemies(state, payload.sourcePlayerId, target.playerId)
    ) {
      continue;
    }

    const damage = state.playerCheats[target.playerId]?.invincible
      ? 0
      : resolveDamageAmount({ amount: payload.damageAmount, type: payload.damageType }, state);
    target.health.current = Math.max(0, target.health.current - damage);
    state.combatEvents.push({
      id: `${state.tick}:${payload.sourceUnitId}:${target.id}:${impact.projectileId}`,
      tick: state.tick,
      sourceUnitId: payload.sourceUnitId,
      targetUnitId: target.id,
      sourcePlayerId: payload.sourcePlayerId,
      targetPlayerId: target.playerId,
      sourceKind: payload.sourceKind,
      targetKind: target.kind,
      sourcePosition: { ...payload.sourcePosition },
      targetPosition: { ...target.position },
      damage,
      killed: target.health.current <= 0,
    });

    if (target.health.current <= 0) {
      removeUnitFromWorld(state, target.id);
    }
  }
}

function createCombatProjectilePayload(
  source: UnitState,
  target: UnitState,
  combat: NonNullable<UnitDefinition["combat"]>,
): ProjectilePolicyData {
  return {
    schema: COMBAT_PROJECTILE_PAYLOAD_SCHEMA,
    version: COMBAT_PROJECTILE_PAYLOAD_VERSION,
    sourceUnitId: source.id,
    sourcePlayerId: source.playerId,
    sourceKind: source.kind,
    sourcePosition: { x: source.position.x, y: source.position.y },
    targetUnitId: target.id,
    targetPlayerId: target.playerId,
    targetKind: target.kind,
    damageAmount: combat.damage,
    damageType: combat.damageType ?? "physical",
  };
}

function parseCombatProjectilePayload(impact: ProjectileImpactEvent): ParsedCombatProjectilePayload | null {
  const payload = impact.payload;
  if (!hasExactKeys(payload, [
    "schema",
    "version",
    "sourceUnitId",
    "sourcePlayerId",
    "sourceKind",
    "sourcePosition",
    "targetUnitId",
    "targetPlayerId",
    "targetKind",
    "damageAmount",
    "damageType",
  ])) {
    return null;
  }
  if (
    payload.schema !== COMBAT_PROJECTILE_PAYLOAD_SCHEMA ||
    payload.version !== COMBAT_PROJECTILE_PAYLOAD_VERSION ||
    typeof payload.sourceUnitId !== "string" ||
    typeof payload.sourcePlayerId !== "string" ||
    !isUnitDefinitionId(payload.sourceKind) ||
    typeof payload.targetUnitId !== "string" ||
    typeof payload.targetPlayerId !== "string" ||
    !isUnitDefinitionId(payload.targetKind) ||
    typeof payload.damageAmount !== "number" ||
    !Number.isFinite(payload.damageAmount) ||
    !isDamageType(payload.damageType) ||
    !isFinitePoint(payload.sourcePosition) ||
    impact.sourceId !== payload.sourceUnitId ||
    impact.targetId !== payload.targetUnitId
  ) {
    return null;
  }

  return {
    sourceUnitId: payload.sourceUnitId,
    sourcePlayerId: payload.sourcePlayerId,
    sourceKind: payload.sourceKind,
    sourcePosition: { x: payload.sourcePosition.x, y: payload.sourcePosition.y },
    targetUnitId: payload.targetUnitId,
    targetPlayerId: payload.targetPlayerId,
    targetKind: payload.targetKind,
    damageAmount: payload.damageAmount,
    damageType: payload.damageType,
  };
}

function hasExactKeys(value: ProjectilePolicyData, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isFinitePoint(value: unknown): value is GridPoint {
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 2 && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function isDamageType(value: unknown): value is DamageType {
  return value === "physical" || value === "fire" || value === "lightning" || value === "drowning";
}

function isUnitDefinitionId(value: unknown): value is UnitDefinitionId {
  return typeof value === "string" && Object.hasOwn(unitDefinitions, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
