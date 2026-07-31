import type { UnitDefinitionId } from "./content.js";

/**
 * Stable, serializable selector for an executable aura profile owned by the
 * simulation host or a mod. Omitting it preserves generic scenarios.
 */
export type AuraProfileId = string;

/**
 * Snapshot state applied to a recipient. This is deliberately data-only so a
 * save or transport peer never needs the registry executable to display the
 * current, authoritative result.
 */
export interface AppliedAuraEffectState {
  auraDefinitionId: string;
  providerUnitId: string;
  attackDamageMultiplier: number;
  /** Opaque client/mod presentation id; it has no original-resource claim. */
  indicatorId?: string;
}

/** Shared data shape for registry-owned, opt-in simulation aura definitions. */
export interface AuraDefinition {
  id: string;
  providerKinds: readonly UnitDefinitionId[];
  /** Omitted means every unit kind is eligible. */
  targetKinds?: readonly UnitDefinitionId[];
  relation: "allied" | "same-player";
  includeProvider: boolean;
  distance: {
    metric: "grid-chebyshev";
    maximum: number;
  };
  /** Candidates sharing this key select exactly one strongest result. */
  stackingKey: string;
  attackDamageMultiplier: number;
  indicatorId?: string;
}
