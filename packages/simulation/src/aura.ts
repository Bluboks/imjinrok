import type { AppliedAuraEffectState, AuraDefinition, AuraProfileId } from "../../shared/src/index.js";
import { arePlayersAllied } from "./diplomacy.js";
import type { UnitState, WorldState } from "./types.js";
import { iterateUnitsOrdered } from "./units.js";

export interface AuraProfile {
  readonly id: AuraProfileId;
  readonly definitions: readonly AuraDefinition[];
}

export interface RegisterAuraProfileOptions {
  /** Replaces the provider currently registered for this exact stable id. */
  replace?: boolean;
}

/**
 * Executable aura definitions are deliberately registry-owned. World snapshots
 * retain only the selected id and derived recipient effects, which makes
 * profile replacement explicit and keeps generic worlds aura-free.
 */
export class AuraProfileRegistry {
  private readonly profiles = new Map<AuraProfileId, AuraProfile>();

  register(profile: AuraProfile, options: RegisterAuraProfileOptions = {}): void {
    validateProfile(profile);
    if (this.profiles.has(profile.id) && options.replace !== true) {
      throw new Error(`Aura profile '${profile.id}' is already registered.`);
    }
    this.profiles.set(profile.id, profile);
  }

  require(id: AuraProfileId): AuraProfile {
    assertId(id, "Aura profile");
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new Error(`Unknown aura profile '${id}'. Register its profile before advancing the world.`);
    }
    return profile;
  }
}

export const defaultAuraProfileRegistry = new AuraProfileRegistry();

export function registerAuraProfile(profile: AuraProfile, options?: RegisterAuraProfileOptions): void {
  defaultAuraProfileRegistry.register(profile, options);
}

/** Rebuilds every derived effect from live units before combat in stable id order. */
export function refreshAuraEffects(state: WorldState, registry = defaultAuraProfileRegistry): void {
  const profileId = state.auraProfileId;

  if (!profileId) {
    // Generic worlds normally have no derived aura state. Do not pay the
    // deterministic unit-ordering cost just to clear a stale legacy effect.
    for (const unit of Object.values(state.units)) {
      if (unit.auraEffects !== undefined) {
        delete unit.auraEffects;
      }
    }
    return;
  }

  const profile = registry.require(profileId);
  const units = iterateUnitsOrdered(state);
  for (const recipient of units) {
    const selected = new Map<string, AppliedAuraEffectState>();

    for (const definition of profile.definitions) {
      for (const provider of units) {
        if (!isCandidate(state, definition, provider, recipient)) {
          continue;
        }

        const candidate: AppliedAuraEffectState = {
          auraDefinitionId: definition.id,
          providerUnitId: provider.id,
          attackDamageMultiplier: definition.attackDamageMultiplier,
          ...(definition.indicatorId !== undefined ? { indicatorId: definition.indicatorId } : {}),
        };
        const current = selected.get(definition.stackingKey);
        if (!current || compareAuraEffects(candidate, current) < 0) {
          selected.set(definition.stackingKey, candidate);
        }
      }
    }

    if (selected.size === 0) {
      delete recipient.auraEffects;
      continue;
    }

    recipient.auraEffects = Object.fromEntries(
      [...selected.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
  }
}

/** Applies independently-selected stacking keys multiplicatively with floor rounding. */
export function applyAuraAttackDamage(unit: UnitState, baseDamage: number): number {
  const normalizedBase = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  const effects = Object.values(unit.auraEffects ?? {}).sort((left, right) =>
    left.auraDefinitionId.localeCompare(right.auraDefinitionId),
  );
  const multiplier = effects.reduce((value, effect) => value * effect.attackDamageMultiplier, 1);
  return Math.floor(normalizedBase * multiplier);
}

function isCandidate(
  state: WorldState,
  definition: AuraDefinition,
  provider: UnitState,
  recipient: UnitState,
): boolean {
  if (provider.health.current <= 0 || recipient.health.current <= 0 || !definition.providerKinds.includes(provider.kind)) {
    return false;
  }
  if (!definition.includeProvider && provider.id === recipient.id) {
    return false;
  }
  if (definition.targetKinds && !definition.targetKinds.includes(recipient.kind)) {
    return false;
  }
  if (definition.relation === "same-player" ? provider.playerId !== recipient.playerId : !arePlayersAllied(state, provider.playerId, recipient.playerId)) {
    return false;
  }
  const distance = Math.max(
    Math.abs(provider.position.x - recipient.position.x),
    Math.abs(provider.position.y - recipient.position.y),
  );
  return distance <= definition.distance.maximum;
}

/** Highest multiplier wins; equal values choose provider id, then definition id. */
function compareAuraEffects(left: AppliedAuraEffectState, right: AppliedAuraEffectState): number {
  if (left.attackDamageMultiplier !== right.attackDamageMultiplier) {
    return right.attackDamageMultiplier - left.attackDamageMultiplier;
  }
  const provider = left.providerUnitId.localeCompare(right.providerUnitId);
  return provider !== 0 ? provider : left.auraDefinitionId.localeCompare(right.auraDefinitionId);
}

function validateProfile(profile: AuraProfile): void {
  assertId(profile.id, "Aura profile");
  const definitionIds = new Set<string>();
  for (const definition of profile.definitions) {
    assertId(definition.id, "Aura definition");
    assertId(definition.stackingKey, "Aura stacking key");
    if (definitionIds.has(definition.id)) {
      throw new Error(`Aura profile '${profile.id}' contains duplicate definition '${definition.id}'.`);
    }
    definitionIds.add(definition.id);
    if (definition.providerKinds.length === 0) {
      throw new Error(`Aura definition '${definition.id}' must name at least one provider kind.`);
    }
    if (definition.distance.metric !== "grid-chebyshev" || !Number.isFinite(definition.distance.maximum) || definition.distance.maximum < 0) {
      throw new Error(`Aura definition '${definition.id}' has an invalid distance rule.`);
    }
    if (!Number.isFinite(definition.attackDamageMultiplier) || definition.attackDamageMultiplier < 0) {
      throw new Error(`Aura definition '${definition.id}' has an invalid attack damage multiplier.`);
    }
  }
}

function assertId(id: string, label: string): void {
  if (!id.trim() || id !== id.trim()) {
    throw new Error(`${label} id must be non-empty and have no surrounding whitespace.`);
  }
}
