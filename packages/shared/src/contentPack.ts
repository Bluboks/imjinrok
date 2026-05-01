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

function validateUnitDefinitions(registry: ContentRegistry, issues: ContentValidationIssue[]): void {
  for (const [unitId, definition] of Object.entries(registry.units)) {
    if (!Number.isFinite(definition.footprint.width) || definition.footprint.width <= 0) {
      issues.push(createIssue(`units.${unitId}.footprint.width`, "Footprint width must be a positive number."));
    }

    if (!Number.isFinite(definition.footprint.height) || definition.footprint.height <= 0) {
      issues.push(createIssue(`units.${unitId}.footprint.height`, "Footprint height must be a positive number."));
    }

    for (const actionId of definition.actionIds) {
      if (!registry.actions[actionId]) {
        issues.push(createIssue(`units.${unitId}.actionIds`, `Unknown action '${actionId}'.`));
      }
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
