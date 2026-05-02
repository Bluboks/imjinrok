export interface TerrainDefinition {
  id: string;
  blocksMovement: boolean;
  worldColor: number;
  minimapColor: number;
  editorColor: number;
  floodsInRain?: boolean;
}

export const terrainDefinitions = {
  grass: { id: "grass", blocksMovement: false, worldColor: 0x7aa35a, minimapColor: 0x6f9b54, editorColor: 0x82ae63 },
  forest: { id: "forest", blocksMovement: true, worldColor: 0x3f6f48, minimapColor: 0x355f3d, editorColor: 0x49784c },
  shallowWater: { id: "shallowWater", blocksMovement: false, worldColor: 0x4f8fa6, minimapColor: 0x467f99, editorColor: 0x5a9fba, floodsInRain: true },
  water: { id: "water", blocksMovement: true, worldColor: 0x346c88, minimapColor: 0x2f6680, editorColor: 0x3c7895 },
  cliff: { id: "cliff", blocksMovement: true, worldColor: 0x837362, minimapColor: 0x756858, editorColor: 0x7d6f62 },
} as const satisfies Record<string, TerrainDefinition>;

export type TerrainType = keyof typeof terrainDefinitions;
export const terrainTypes = Object.keys(terrainDefinitions) as TerrainType[];

export interface FactionDefinition {
  id: string;
  displayName: string;
  unitColor: number;
  minimapColor: number;
}

export const factionDefinitions = {
  blue: { id: "blue", displayName: "Blue", unitColor: 0x4d9be6, minimapColor: 0x4d9be6 },
  red: { id: "red", displayName: "Red", unitColor: 0xd36454, minimapColor: 0xd36454 },
  green: { id: "green", displayName: "Green", unitColor: 0x91e0a1, minimapColor: 0x91e0a1 },
  yellow: { id: "yellow", displayName: "Yellow", unitColor: 0xe0c15f, minimapColor: 0xe0c15f },
} as const satisfies Record<string, FactionDefinition>;

export type FactionId = keyof typeof factionDefinitions;
export const factions = Object.keys(factionDefinitions) as FactionId[];

export type BankResourceKind = "food" | "wood" | "gold" | "stone";
export type ResourceCategory = "wood" | "grain" | "mineral" | (string & {});
export type ResourceRegrowthTrigger = "rain";

export interface ResourceOccupancyDefinition {
  blocksMovement: boolean;
  blocksBuilding: boolean;
}

export interface ResourceDepletionDefinition {
  mode: "remove" | "stay";
  depletedOccupancy?: ResourceOccupancyDefinition;
}

export interface ResourceRegrowthDefinition {
  trigger: ResourceRegrowthTrigger;
  requiredTicks: number;
  restoreAmount: "full" | number;
}

export interface ResourcePlaceholderVisualDefinition {
  glyph: string;
  worldColor: number;
  outlineColor: number;
  minimapColor: number;
}

export interface ResourceDefinition {
  id: string;
  displayName: string;
  category: ResourceCategory;
  yieldResource: BankResourceKind;
  capacity: number;
  gatherAmountPerTick: number;
  activeOccupancy: ResourceOccupancyDefinition;
  depletion: ResourceDepletionDefinition;
  regrowth?: ResourceRegrowthDefinition;
  placeholderVisual: ResourcePlaceholderVisualDefinition;
}

const passableNoBuild = { blocksMovement: false, blocksBuilding: true } as const satisfies ResourceOccupancyDefinition;
const blockingNoBuild = { blocksMovement: true, blocksBuilding: true } as const satisfies ResourceOccupancyDefinition;

export const resourceDefinitions = {
  rice: {
    id: "rice",
    displayName: "Rice Patch",
    category: "grain",
    yieldResource: "food",
    capacity: 100,
    gatherAmountPerTick: 1,
    activeOccupancy: passableNoBuild,
    depletion: { mode: "remove" },
    placeholderVisual: { glyph: "R", worldColor: 0xe7d47a, outlineColor: 0x6f6a33, minimapColor: 0xe7d47a },
  },
  potato: {
    id: "potato",
    displayName: "Potato Patch",
    category: "grain",
    yieldResource: "food",
    capacity: 100,
    gatherAmountPerTick: 1,
    activeOccupancy: passableNoBuild,
    depletion: { mode: "stay", depletedOccupancy: passableNoBuild },
    regrowth: { trigger: "rain", requiredTicks: 600, restoreAmount: "full" },
    placeholderVisual: { glyph: "P", worldColor: 0xc4864a, outlineColor: 0x5f3b24, minimapColor: 0xc4864a },
  },
  tree: {
    id: "tree",
    displayName: "Tree",
    category: "wood",
    yieldResource: "wood",
    capacity: 100,
    gatherAmountPerTick: 1,
    activeOccupancy: blockingNoBuild,
    depletion: { mode: "remove" },
    placeholderVisual: { glyph: "T", worldColor: 0x3f8f4b, outlineColor: 0x183722, minimapColor: 0x3f8f4b },
  },
  bamboo: {
    id: "bamboo",
    displayName: "Bamboo",
    category: "wood",
    yieldResource: "wood",
    capacity: 100,
    gatherAmountPerTick: 1,
    activeOccupancy: blockingNoBuild,
    depletion: { mode: "stay", depletedOccupancy: passableNoBuild },
    regrowth: { trigger: "rain", requiredTicks: 600, restoreAmount: "full" },
    placeholderVisual: { glyph: "B", worldColor: 0x84c96d, outlineColor: 0x2f5a2a, minimapColor: 0x84c96d },
  },
  gold: {
    id: "gold",
    displayName: "Gold",
    category: "mineral",
    yieldResource: "gold",
    capacity: 800,
    gatherAmountPerTick: 1,
    activeOccupancy: blockingNoBuild,
    depletion: { mode: "remove" },
    placeholderVisual: { glyph: "G", worldColor: 0xd8b852, outlineColor: 0x6d581e, minimapColor: 0xd8b852 },
  },
  stone: {
    id: "stone",
    displayName: "Stone",
    category: "mineral",
    yieldResource: "stone",
    capacity: 800,
    gatherAmountPerTick: 1,
    activeOccupancy: blockingNoBuild,
    depletion: { mode: "remove" },
    placeholderVisual: { glyph: "S", worldColor: 0x9a9c9f, outlineColor: 0x44484d, minimapColor: 0x9a9c9f },
  },
  berry: {
    id: "berry",
    displayName: "Berry Patch",
    category: "grain",
    yieldResource: "food",
    capacity: 100,
    gatherAmountPerTick: 1,
    activeOccupancy: passableNoBuild,
    depletion: { mode: "remove" },
    placeholderVisual: { glyph: "Be", worldColor: 0xad4f6f, outlineColor: 0x582638, minimapColor: 0xad4f6f },
  },
} as const satisfies Record<string, ResourceDefinition>;

export type BuiltInResourceDefinitionId = keyof typeof resourceDefinitions;
export type ResourceDefinitionId = BuiltInResourceDefinitionId | (string & {});

export interface ActionDefinition {
  id: string;
  icon: string;
  hotkey: string;
  label: string;
}

export const actionDefinitions = {
  move: { id: "move", icon: "M", hotkey: "M", label: "Move" },
  gather: { id: "gather", icon: "G", hotkey: "G", label: "Gather" },
  build: { id: "build", icon: "B", hotkey: "B", label: "Build" },
  stop: { id: "stop", icon: "S", hotkey: "S", label: "Stop" },
  "attack-move": { id: "attack-move", icon: "A", hotkey: "A", label: "Attack Move" },
  patrol: { id: "patrol", icon: "P", hotkey: "P", label: "Patrol" },
  repair: { id: "repair", icon: "R", hotkey: "R", label: "Repair" },
  hold: { id: "hold", icon: "H", hotkey: "H", label: "Hold" },
  "train-villager": { id: "train-villager", icon: "V", hotkey: "V", label: "Train Villager" },
  "rally-point": { id: "rally-point", icon: "R", hotkey: "R", label: "Rally Point" },
  "research-loom": { id: "research-loom", icon: "L", hotkey: "L", label: "Research Loom" },
  "town-bell": { id: "town-bell", icon: "B", hotkey: "B", label: "Town Bell" },
  "set-gather": { id: "set-gather", icon: "G", hotkey: "G", label: "Set Gather" },
} as const satisfies Record<string, ActionDefinition>;

export type ActionDefinitionId = keyof typeof actionDefinitions;

const workerActionIds = ["move", "gather", "build", "stop", "attack-move", "patrol", "repair", "hold"] as const satisfies readonly ActionDefinitionId[];
const buildingActionIds = ["train-villager", "rally-point", "research-loom", "stop", "town-bell", "set-gather"] as const satisfies readonly ActionDefinitionId[];

export interface FootprintDefinition {
  width: number;
  height: number;
  blocksMovement: boolean;
}

export interface PlacementDefinition {
  allowedTerrain: readonly TerrainType[];
}

const grassPlacement = { allowedTerrain: ["grass"] } as const satisfies PlacementDefinition;

export interface UnitDefinition {
  id: string;
  displayName: string;
  category: "building" | "worker";
  actionIds: readonly ActionDefinitionId[];
  footprint: FootprintDefinition;
  placement?: PlacementDefinition;
  baseAttributes: {
    health: number;
    mana: number;
    movementSpeed: number;
  };
  portraitGlyph: string;
  portraitColor: number;
  groupBorderColor: number;
  renderRadius: number;
  selectionRadius: number;
  hitRadius: number;
  sightRadius: number;
  minimapShape: "square" | "circle";
  minimapRadius: number;
  selectedMinimapRadius: number;
}

export const unitDefinitions = {
  "town-center": {
    id: "town-center",
    displayName: "Town Center",
    category: "building",
    actionIds: buildingActionIds,
    footprint: { width: 4, height: 4, blocksMovement: true },
    placement: grassPlacement,
    baseAttributes: { health: 2400, mana: 0, movementSpeed: 0 },
    portraitGlyph: "TC",
    portraitColor: 0xc2a95e,
    groupBorderColor: 0xd0b46a,
    renderRadius: 12,
    selectionRadius: 12,
    hitRadius: 24,
    sightRadius: 10,
    minimapShape: "square",
    minimapRadius: 4,
    selectedMinimapRadius: 5,
  },
  house: {
    id: "house",
    displayName: "House",
    category: "building",
    actionIds: buildingActionIds,
    footprint: { width: 2, height: 2, blocksMovement: true },
    placement: grassPlacement,
    baseAttributes: { health: 550, mana: 0, movementSpeed: 0 },
    portraitGlyph: "H",
    portraitColor: 0xb99a6a,
    groupBorderColor: 0xb99a6a,
    renderRadius: 8,
    selectionRadius: 8,
    hitRadius: 18,
    sightRadius: 4,
    minimapShape: "square",
    minimapRadius: 3,
    selectedMinimapRadius: 4,
  },
  barracks: {
    id: "barracks",
    displayName: "Barracks",
    category: "building",
    actionIds: buildingActionIds,
    footprint: { width: 3, height: 3, blocksMovement: true },
    placement: grassPlacement,
    baseAttributes: { health: 1200, mana: 0, movementSpeed: 0 },
    portraitGlyph: "B",
    portraitColor: 0xa77855,
    groupBorderColor: 0xa77855,
    renderRadius: 10,
    selectionRadius: 10,
    hitRadius: 22,
    sightRadius: 6,
    minimapShape: "square",
    minimapRadius: 3.5,
    selectedMinimapRadius: 4.5,
  },
  villager: {
    id: "villager",
    displayName: "Villager",
    category: "worker",
    actionIds: workerActionIds,
    footprint: { width: 1, height: 1, blocksMovement: true },
    baseAttributes: { health: 25, mana: 0, movementSpeed: 4.2 },
    portraitGlyph: "V",
    portraitColor: 0x77a78a,
    groupBorderColor: 0x77a78a,
    renderRadius: 6,
    selectionRadius: 6,
    hitRadius: 16,
    sightRadius: 6,
    minimapShape: "circle",
    minimapRadius: 2.8,
    selectedMinimapRadius: 4,
  },
} as const satisfies Record<string, UnitDefinition>;

export type UnitDefinitionId = keyof typeof unitDefinitions;

export function unitCanPerformAction(kind: UnitDefinitionId, actionId: ActionDefinitionId): boolean {
  const actionIds: readonly ActionDefinitionId[] = unitDefinitions[kind].actionIds;

  return actionIds.includes(actionId);
}

export const buildingDefinitionIds = ["town-center", "house", "barracks"] as const satisfies readonly UnitDefinitionId[];
export type BuildingDefinitionId = (typeof buildingDefinitionIds)[number];
