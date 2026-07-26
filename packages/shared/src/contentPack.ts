import {
  actionDefinitions,
  factionDefinitions,
  resourceDefinitions,
  terrainDefinitions,
  unitDefinitions,
  type ActionDefinition,
  type FactionDefinition,
  type ResourceDefinition,
  type TerrainDefinition,
  type UnitDefinition,
} from "./content.js";

const KNOWN_DAMAGE_TYPES = new Set(["physical", "fire", "lightning", "drowning"]);

export interface ContentPackDefinition {
  id: string;
  displayName: string;
  version: string;
  terrains: Record<string, TerrainDefinition>;
  factions: Record<string, FactionDefinition>;
  resources: Record<string, ResourceDefinition>;
  actions: Record<string, ActionDefinition>;
  units: Record<string, UnitDefinition>;
}

export interface ContentRegistry {
  packs: readonly ContentPackDefinition[];
  terrains: Record<string, TerrainDefinition>;
  factions: Record<string, FactionDefinition>;
  resources: Record<string, ResourceDefinition>;
  actions: Record<string, ActionDefinition>;
  units: Record<string, UnitDefinition>;
}

export interface ContentValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ContentValidationResult {
  ok: boolean;
  issues: ContentValidationIssue[];
}

export const coreContentPack = {
  id: "isorts-core",
  displayName: "ISORTS Core",
  version: "0.1.0",
  terrains: terrainDefinitions,
  factions: factionDefinitions,
  resources: resourceDefinitions,
  actions: actionDefinitions,
  units: unitDefinitions,
} as const satisfies ContentPackDefinition;

export function createContentRegistry(packs: readonly ContentPackDefinition[] = [coreContentPack]): ContentRegistry {
  return {
    packs,
    terrains: mergeDefinitions(packs.map((pack) => pack.terrains)),
    factions: mergeDefinitions(packs.map((pack) => pack.factions)),
    resources: mergeDefinitions(packs.map((pack) => pack.resources)),
    actions: mergeDefinitions(packs.map((pack) => pack.actions)),
    units: mergeDefinitions(packs.map((pack) => pack.units)),
  };
}

export function validateContentRegistry(registry: ContentRegistry): ContentValidationResult {
  const issues: ContentValidationIssue[] = [];

  registry.packs.forEach((pack, index) => {
    issues.push(...validateContentPackMetadata(pack, `packs[${index}]`));
  });

  validateDefinitionIds(registry.terrains, "terrains", issues);
  validateDefinitionIds(registry.factions, "factions", issues);
  validateDefinitionIds(registry.resources, "resources", issues);
  validateDefinitionIds(registry.actions, "actions", issues);
  validateDefinitionIds(registry.units, "units", issues);
  validateResourceDefinitions(registry, issues);
  validateUnitDefinitions(registry, issues);

  return toValidationResult(issues);
}

export function validateContentPack(pack: ContentPackDefinition): ContentValidationResult {
  return validateContentRegistry(createContentRegistry([pack]));
}

function mergeDefinitions<TDefinition>(definitionSets: readonly Record<string, TDefinition>[]): Record<string, TDefinition> {
  return Object.assign({}, ...definitionSets);
}

function validateContentPackMetadata(pack: ContentPackDefinition, path: string): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];

  if (!pack.id.trim()) {
    issues.push(createIssue(`${path}.id`, "Content pack id is required."));
  }

  if (!pack.displayName.trim()) {
    issues.push(createIssue(`${path}.displayName`, "Content pack display name is required."));
  }

  if (!pack.version.trim()) {
    issues.push(createIssue(`${path}.version`, "Content pack version is required."));
  }

  return issues;
}

function validateDefinitionIds(
  definitions: Record<string, { id: string }>,
  path: string,
  issues: ContentValidationIssue[],
): void {
  for (const [key, definition] of Object.entries(definitions)) {
    if (!definition.id.trim()) {
      issues.push(createIssue(`${path}.${key}.id`, "Definition id is required."));
      continue;
    }

    if (definition.id !== key) {
      issues.push(createIssue(`${path}.${key}.id`, `Definition id '${definition.id}' must match key '${key}'.`));
    }
  }
}

const knownBankResourceKinds = new Set(["food", "wood", "gold", "stone"]);

function validateResourceDefinitions(registry: ContentRegistry, issues: ContentValidationIssue[]): void {
  for (const [resourceId, definition] of Object.entries(registry.resources)) {
    if (!definition.displayName.trim()) {
      issues.push(createIssue(`resources.${resourceId}.displayName`, "Resource display name is required."));
    }

    if (!definition.category.trim()) {
      issues.push(createIssue(`resources.${resourceId}.category`, "Resource category is required."));
    }

    if (!knownBankResourceKinds.has(definition.yieldResource)) {
      issues.push(createIssue(`resources.${resourceId}.yieldResource`, `Unknown bank resource '${definition.yieldResource}'.`));
    }

    if (!Number.isFinite(definition.capacity) || definition.capacity <= 0) {
      issues.push(createIssue(`resources.${resourceId}.capacity`, "Resource capacity must be a positive number."));
    }

    if (!Number.isFinite(definition.gatherAmountPerTick) || definition.gatherAmountPerTick <= 0) {
      issues.push(createIssue(`resources.${resourceId}.gatherAmountPerTick`, "Gather amount per tick must be a positive number."));
    }

    validateResourcePlaceholderVisual(definition, resourceId, issues);
    validateResourceOccupancy(definition.activeOccupancy, `resources.${resourceId}.activeOccupancy`, issues);

    if (definition.depletion.mode === "stay" && !definition.depletion.depletedOccupancy) {
      issues.push(createIssue(`resources.${resourceId}.depletion.depletedOccupancy`, "Persistent depleted resources must define depleted occupancy."));
    }

    if (definition.depletion.depletedOccupancy) {
      validateResourceOccupancy(definition.depletion.depletedOccupancy, `resources.${resourceId}.depletion.depletedOccupancy`, issues);
    }

    if (!definition.regrowth) {
      continue;
    }

    if (definition.depletion.mode !== "stay") {
      issues.push(createIssue(`resources.${resourceId}.regrowth`, "Regrowing resources must stay on the tile when depleted."));
    }

    if (definition.regrowth.trigger !== "rain") {
      issues.push(createIssue(`resources.${resourceId}.regrowth.trigger`, `Unknown regrowth trigger '${definition.regrowth.trigger}'.`));
    }

    if (!Number.isFinite(definition.regrowth.requiredTicks) || definition.regrowth.requiredTicks <= 0) {
      issues.push(createIssue(`resources.${resourceId}.regrowth.requiredTicks`, "Regrowth ticks must be a positive number."));
    }

    if (typeof definition.regrowth.restoreAmount === "number" && (!Number.isFinite(definition.regrowth.restoreAmount) || definition.regrowth.restoreAmount <= 0)) {
      issues.push(createIssue(`resources.${resourceId}.regrowth.restoreAmount`, "Numeric restore amount must be a positive number."));
    }
  }
}

function validateResourcePlaceholderVisual(
  definition: ResourceDefinition,
  resourceId: string,
  issues: ContentValidationIssue[],
): void {
  const visual = definition.placeholderVisual;

  if (!visual.glyph.trim()) {
    issues.push(createIssue(`resources.${resourceId}.placeholderVisual.glyph`, "Resource placeholder glyph is required."));
  }

  for (const colorKey of ["worldColor", "outlineColor", "minimapColor"] as const) {
    const color = visual[colorKey];

    if (!Number.isInteger(color) || color < 0x000000 || color > 0xffffff) {
      issues.push(createIssue(`resources.${resourceId}.placeholderVisual.${colorKey}`, "Resource placeholder color must be a 24-bit integer."));
    }
  }
}

function validateResourceOccupancy(
  occupancy: ResourceDefinition["activeOccupancy"],
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (typeof occupancy.blocksMovement !== "boolean") {
    issues.push(createIssue(`${path}.blocksMovement`, "Resource movement blocking must be boolean."));
  }

  if (typeof occupancy.blocksBuilding !== "boolean") {
    issues.push(createIssue(`${path}.blocksBuilding`, "Resource building blocking must be boolean."));
  }
}

function validateUnitDefinitions(registry: ContentRegistry, issues: ContentValidationIssue[]): void {
  for (const [unitId, definition] of Object.entries(registry.units)) {
    if (!Number.isFinite(definition.footprint.width) || definition.footprint.width <= 0) {
      issues.push(createIssue(`units.${unitId}.footprint.width`, "Footprint width must be a positive number."));
    }

    if (!Number.isFinite(definition.footprint.height) || definition.footprint.height <= 0) {
      issues.push(createIssue(`units.${unitId}.footprint.height`, "Footprint height must be a positive number."));
    }

    if (definition.combat) {
      validatePositiveNumber(definition.combat.damage, `units.${unitId}.combat.damage`, issues);
      validatePositiveNumber(definition.combat.range, `units.${unitId}.combat.range`, issues);
      validatePositiveNumber(definition.combat.cooldownTicks, `units.${unitId}.combat.cooldownTicks`, issues);
      validatePositiveNumber(definition.combat.aggroRange, `units.${unitId}.combat.aggroRange`, issues);

      if (definition.combat.damageType !== undefined && !KNOWN_DAMAGE_TYPES.has(definition.combat.damageType)) {
        issues.push(createIssue(`units.${unitId}.combat.damageType`, `Unknown damage type '${definition.combat.damageType}'.`));
      }

      if (definition.combat.aggroRange < definition.combat.range) {
        issues.push(createIssue(`units.${unitId}.combat.aggroRange`, "Aggro range must be at least attack range."));
      }
    }

    for (const [resource, amount] of Object.entries(definition.cost ?? {})) {
      if (!knownBankResourceKinds.has(resource)) {
        issues.push(createIssue(`units.${unitId}.cost.${resource}`, `Unknown bank resource '${resource}'.`));
        continue;
      }

      validatePositiveNumber(amount, `units.${unitId}.cost.${resource}`, issues);
    }

    const hotkeysByActionId = new Map<string, string>();

    for (const actionId of definition.actionIds) {
      const action = registry.actions[actionId];

      if (!action) {
        issues.push(createIssue(`units.${unitId}.actionIds`, `Unknown action '${actionId}'.`));
        continue;
      }

      const hotkey = action.hotkey.trim().toUpperCase();

      if (!hotkey) {
        issues.push(createIssue(`actions.${actionId}.hotkey`, "Action hotkey is required."));
        continue;
      }

      const conflictingActionId = hotkeysByActionId.get(hotkey);

      if (conflictingActionId) {
        issues.push(createIssue(
          `units.${unitId}.actionIds`,
          `Actions '${conflictingActionId}' and '${actionId}' share hotkey '${hotkey}'.`,
        ));
        continue;
      }

      hotkeysByActionId.set(hotkey, actionId);
    }

    if (definition.category === "building" && !definition.placement) {
      issues.push(createIssue(`units.${unitId}.placement`, "Building units should define placement rules.", "warning"));
    }

    for (const terrainId of definition.placement?.allowedTerrain ?? []) {
      if (!registry.terrains[terrainId]) {
        issues.push(createIssue(`units.${unitId}.placement.allowedTerrain`, `Unknown terrain '${terrainId}'.`));
      }
    }
  }
}

function validatePositiveNumber(value: number, path: string, issues: ContentValidationIssue[]): void {
  if (!Number.isFinite(value) || value <= 0) {
    issues.push(createIssue(path, "Value must be a positive number."));
  }
}

function createIssue(
  path: string,
  message: string,
  severity: ContentValidationIssue["severity"] = "error",
): ContentValidationIssue {
  return { path, message, severity };
}

function toValidationResult(issues: ContentValidationIssue[]): ContentValidationResult {
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
