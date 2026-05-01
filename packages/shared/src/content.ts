export interface TerrainDefinition {
  id: string;
  worldColor: number;
  minimapColor: number;
  editorColor: number;
}

export const terrainDefinitions = {
  grass: { id: "grass", worldColor: 0x7aa35a, minimapColor: 0x6f9b54, editorColor: 0x82ae63 },
  forest: { id: "forest", worldColor: 0x3f6f48, minimapColor: 0x355f3d, editorColor: 0x49784c },
  water: { id: "water", worldColor: 0x346c88, minimapColor: 0x2f6680, editorColor: 0x3c7895 },
  cliff: { id: "cliff", worldColor: 0x837362, minimapColor: 0x756858, editorColor: 0x7d6f62 },
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

export interface ResourceDefinition {
  id: string;
}

export const resourceDefinitions = {
  tree: { id: "tree" },
  gold: { id: "gold" },
  stone: { id: "stone" },
  berry: { id: "berry" },
} as const satisfies Record<string, ResourceDefinition>;

export type ResourceDefinitionId = keyof typeof resourceDefinitions;

export interface UnitDefinition {
  id: string;
  displayName: string;
  category: "building" | "worker";
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
  minimapShape: "square" | "circle";
  minimapRadius: number;
  selectedMinimapRadius: number;
}

export const unitDefinitions = {
  "town-center": {
    id: "town-center",
    displayName: "Town Center",
    category: "building",
    baseAttributes: { health: 2400, mana: 0, movementSpeed: 0 },
    portraitGlyph: "TC",
    portraitColor: 0xc2a95e,
    groupBorderColor: 0xd0b46a,
    renderRadius: 12,
    selectionRadius: 12,
    hitRadius: 24,
    minimapShape: "square",
    minimapRadius: 4,
    selectedMinimapRadius: 5,
  },
  house: {
    id: "house",
    displayName: "House",
    category: "building",
    baseAttributes: { health: 550, mana: 0, movementSpeed: 0 },
    portraitGlyph: "H",
    portraitColor: 0xb99a6a,
    groupBorderColor: 0xb99a6a,
    renderRadius: 8,
    selectionRadius: 8,
    hitRadius: 18,
    minimapShape: "square",
    minimapRadius: 3,
    selectedMinimapRadius: 4,
  },
  barracks: {
    id: "barracks",
    displayName: "Barracks",
    category: "building",
    baseAttributes: { health: 1200, mana: 0, movementSpeed: 0 },
    portraitGlyph: "B",
    portraitColor: 0xa77855,
    groupBorderColor: 0xa77855,
    renderRadius: 10,
    selectionRadius: 10,
    hitRadius: 22,
    minimapShape: "square",
    minimapRadius: 3.5,
    selectedMinimapRadius: 4.5,
  },
  villager: {
    id: "villager",
    displayName: "Villager",
    category: "worker",
    baseAttributes: { health: 25, mana: 0, movementSpeed: 4.2 },
    portraitGlyph: "V",
    portraitColor: 0x77a78a,
    groupBorderColor: 0x77a78a,
    renderRadius: 6,
    selectionRadius: 6,
    hitRadius: 16,
    minimapShape: "circle",
    minimapRadius: 2.8,
    selectedMinimapRadius: 4,
  },
} as const satisfies Record<string, UnitDefinition>;

export type UnitDefinitionId = keyof typeof unitDefinitions;

export const buildingDefinitionIds = ["town-center", "house", "barracks"] as const satisfies readonly UnitDefinitionId[];
export type BuildingDefinitionId = (typeof buildingDefinitionIds)[number];
