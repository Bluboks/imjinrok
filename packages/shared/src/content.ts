import type { DamageType } from "./damage.js";

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
  blue: { id: "blue", displayName: "청군", unitColor: 0x4d9be6, minimapColor: 0x4d9be6 },
  red: { id: "red", displayName: "홍군", unitColor: 0xd36454, minimapColor: 0xd36454 },
  green: { id: "green", displayName: "녹군", unitColor: 0x91e0a1, minimapColor: 0x91e0a1 },
  yellow: { id: "yellow", displayName: "황군", unitColor: 0xe0c15f, minimapColor: 0xe0c15f },
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
    displayName: "논",
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
    displayName: "감자밭",
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
    displayName: "나무",
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
    displayName: "대나무",
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
    displayName: "금광",
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
    displayName: "석재",
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
    displayName: "열매 덤불",
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
  move: { id: "move", icon: "M", hotkey: "M", label: "이동" },
  gather: { id: "gather", icon: "G", hotkey: "G", label: "채집" },
  build: { id: "build", icon: "H", hotkey: "Q", label: "조선 방앗간 건설" },
  "build-town-center": { id: "build-town-center", icon: "TC", hotkey: "T", label: "조선 본영 건설" },
  "build-barracks": { id: "build-barracks", icon: "Bk", hotkey: "K", label: "조선 훈련소 건설" },
  "build-beacon": { id: "build-beacon", icon: "BF", hotkey: "F", label: "조선 봉화대 건설" },
  stop: { id: "stop", icon: "S", hotkey: "S", label: "정지" },
  "attack-move": { id: "attack-move", icon: "A", hotkey: "A", label: "공격 이동" },
  patrol: { id: "patrol", icon: "P", hotkey: "P", label: "순찰" },
  repair: { id: "repair", icon: "R", hotkey: "R", label: "수리" },
  hold: { id: "hold", icon: "H", hotkey: "H", label: "위치 사수" },
  "train-villager": { id: "train-villager", icon: "V", hotkey: "V", label: "농민 훈련" },
  "train-swordsman": { id: "train-swordsman", icon: "Sp", hotkey: "W", label: "조선 창병 훈련" },
  "train-archer": { id: "train-archer", icon: "Ar", hotkey: "A", label: "조선 궁수 훈련" },
  "cancel-production": { id: "cancel-production", icon: "X", hotkey: "X", label: "대기열 취소" },
  "cancel-construction": { id: "cancel-construction", icon: "X", hotkey: "X", label: "건설 취소" },
  demolish: { id: "demolish", icon: "D", hotkey: "D", label: "해체" },
  "rally-point": { id: "rally-point", icon: "R", hotkey: "R", label: "집결지" },
  "research-loom": { id: "research-loom", icon: "L", hotkey: "L", label: "방직 연구" },
  "town-bell": { id: "town-bell", icon: "B", hotkey: "B", label: "경보 소집" },
  "set-gather": { id: "set-gather", icon: "G", hotkey: "G", label: "채집 집결" },
} as const satisfies Record<string, ActionDefinition>;

export type ActionDefinitionId = keyof typeof actionDefinitions;

const workerActionIds = ["move", "gather", "build", "build-town-center", "build-barracks", "build-beacon", "stop", "attack-move", "patrol", "repair", "hold"] as const satisfies readonly ActionDefinitionId[];
const townCenterActionIds = ["train-villager", "cancel-production", "rally-point", "research-loom", "stop", "town-bell", "set-gather", "demolish"] as const satisfies readonly ActionDefinitionId[];
const barracksActionIds = ["train-swordsman", "train-archer", "cancel-production", "rally-point", "stop", "demolish"] as const satisfies readonly ActionDefinitionId[];
const passiveBuildingActionIds = ["stop", "demolish"] as const satisfies readonly ActionDefinitionId[];
const infantryActionIds = ["move", "stop", "attack-move", "patrol", "hold"] as const satisfies readonly ActionDefinitionId[];
const evacuationActionIds = ["move", "stop", "hold"] as const satisfies readonly ActionDefinitionId[];

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
  category: "building" | "worker" | "infantry";
  actionIds: readonly ActionDefinitionId[];
  cost?: Partial<Record<BankResourceKind, number>>;
  trainTimeTicks?: number;
  buildTimeTicks?: number;
  populationCost?: number;
  populationProvided?: number;
  resourceGatherCapacity?: number;
  resourceDropoff?: readonly BankResourceKind[];
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
  combat?: {
    damage: number;
    damageType?: DamageType;
    range: number;
    cooldownTicks: number;
    aggroRange: number;
    /**
     * Optional product/mod delivery selection. This stays a stable data id so
     * shared content never imports executable simulation policies.
     */
    projectileProfileId?: string;
  };
  renderRadius: number;
  selectionRadius: number;
  hitRadius: number;
  sightRadius: number;
  minimapShape: "square" | "circle";
  minimapRadius: number;
  selectedMinimapRadius: number;
}

// Project gameplay adapters shared by several distinct source-backed Japanese identities.
// These values, including portrait glyph/colors and group-border color, are project gameplay/UI
// fallbacks, not evidence for the original classes' stats, category, collision, behavior, or UI.
const japaneseSwordsmanAdaptedGameplay = {
  category: "infantry",
  actionIds: infantryActionIds,
  populationCost: 1,
  footprint: { width: 1, height: 1, blocksMovement: true },
  baseAttributes: { health: 55, mana: 0, movementSpeed: 4.0 },
  portraitGlyph: "JS",
  portraitColor: 0xbc7b6f,
  groupBorderColor: 0xd69b8e,
  combat: { damage: 9, range: 1.5, cooldownTicks: 18, aggroRange: 7 },
  renderRadius: 6,
  selectionRadius: 6,
  hitRadius: 16,
  sightRadius: 7,
  minimapShape: "circle",
  minimapRadius: 2.9,
  selectedMinimapRadius: 4.2,
} as const satisfies Omit<UnitDefinition, "id" | "displayName">;

const japaneseGunnerAdaptedGameplay = {
  category: "infantry",
  actionIds: infantryActionIds,
  populationCost: 1,
  footprint: { width: 1, height: 1, blocksMovement: true },
  baseAttributes: { health: 38, mana: 0, movementSpeed: 3.8 },
  portraitGlyph: "JG",
  portraitColor: 0xbd8c62,
  groupBorderColor: 0xd6ae7f,
  combat: { damage: 7, range: 5.5, cooldownTicks: 24, aggroRange: 8 },
  renderRadius: 6,
  selectionRadius: 6,
  hitRadius: 16,
  sightRadius: 8,
  minimapShape: "circle",
  minimapRadius: 2.9,
  selectedMinimapRadius: 4.2,
} as const satisfies Omit<UnitDefinition, "id" | "displayName">;

// K01 class 11 has a separate source identity and sprite mapping. These values intentionally
// reuse the project swordsman fallback; source stats, behavior, and UI are not recovered.
const koreanMonkAdaptedGameplay = {
  category: "infantry",
  actionIds: infantryActionIds,
  cost: { food: 60, gold: 20 },
  trainTimeTicks: 300,
  populationCost: 1,
  footprint: { width: 1, height: 1, blocksMovement: true },
  baseAttributes: { health: 55, mana: 0, movementSpeed: 4.0 },
  portraitGlyph: "Sp",
  portraitColor: 0x9dada2,
  groupBorderColor: 0xb7c4bb,
  combat: { damage: 9, range: 1.5, cooldownTicks: 18, aggroRange: 7 },
  renderRadius: 6,
  selectionRadius: 6,
  hitRadius: 16,
  sightRadius: 7,
  minimapShape: "circle",
  minimapRadius: 2.9,
  selectedMinimapRadius: 4.2,
} as const satisfies Omit<UnitDefinition, "id" | "displayName">;

// K01 class 51 has a separate source identity and base-frame binding. Its stats, commands,
// construction, and behavior are not recovered, so it deliberately retains the house adapter.
const houseAdaptedGameplay = {
  category: "building",
  actionIds: passiveBuildingActionIds,
  buildTimeTicks: 180,
  populationProvided: 5,
  footprint: { width: 2, height: 2, blocksMovement: true },
  placement: grassPlacement,
  cost: { wood: 30 },
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
} as const satisfies Omit<UnitDefinition, "id" | "displayName">;

// K01 class 58 has a separate source identity and base-frame binding. Its gameplay continues
// to use the Japanese camp barracks adapter rather than infer original HQ mechanics.
const japaneseCampBarracksAdaptedGameplay = {
  category: "building",
  actionIds: passiveBuildingActionIds,
  footprint: { width: 3, height: 3, blocksMovement: true },
  placement: grassPlacement,
  baseAttributes: { health: 1200, mana: 0, movementSpeed: 0 },
  portraitGlyph: "JB",
  portraitColor: 0xa3604d,
  groupBorderColor: 0xd08a72,
  renderRadius: 10,
  selectionRadius: 10,
  hitRadius: 22,
  sightRadius: 6,
  minimapShape: "square",
  minimapRadius: 3.5,
  selectedMinimapRadius: 4.5,
} as const satisfies Omit<UnitDefinition, "id" | "displayName">;

export const unitDefinitions = {
  "town-center": {
    id: "town-center",
    displayName: "조선 본영",
    category: "building",
    actionIds: townCenterActionIds,
    buildTimeTicks: 600,
    populationProvided: 10,
    resourceDropoff: ["food", "wood", "gold", "stone"],
    footprint: { width: 4, height: 4, blocksMovement: true },
    placement: grassPlacement,
    cost: { wood: 150, stone: 50 },
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
    displayName: "조선 방앗간",
    ...houseAdaptedGameplay,
  },
  "korean-training-command": {
    id: "korean-training-command",
    displayName: "조선 훈련도감",
    ...houseAdaptedGameplay,
  },
  barracks: {
    id: "barracks",
    displayName: "조선 훈련소",
    category: "building",
    actionIds: barracksActionIds,
    buildTimeTicks: 420,
    footprint: { width: 3, height: 3, blocksMovement: true },
    placement: grassPlacement,
    cost: { wood: 175 },
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
  beacon: {
    id: "beacon",
    displayName: "조선 봉화대",
    category: "building",
    actionIds: passiveBuildingActionIds,
    buildTimeTicks: 300,
    footprint: { width: 2, height: 2, blocksMovement: true },
    placement: grassPlacement,
    cost: { wood: 80, stone: 20 },
    baseAttributes: { health: 760, mana: 0, movementSpeed: 0 },
    portraitGlyph: "BF",
    portraitColor: 0xc48f57,
    groupBorderColor: 0xd0b46a,
    combat: { damage: 8, damageType: "fire", range: 7, cooldownTicks: 24, aggroRange: 7 },
    renderRadius: 8,
    selectionRadius: 8,
    hitRadius: 18,
    sightRadius: 8,
    minimapShape: "square",
    minimapRadius: 3.2,
    selectedMinimapRadius: 4.2,
  },
  villager: {
    id: "villager",
    displayName: "조선 농부",
    category: "worker",
    actionIds: workerActionIds,
    cost: { food: 50 },
    trainTimeTicks: 240,
    populationCost: 1,
    resourceGatherCapacity: 10,
    footprint: { width: 1, height: 1, blocksMovement: true },
    baseAttributes: { health: 25, mana: 0, movementSpeed: 4.2 },
    portraitGlyph: "V",
    portraitColor: 0x77a78a,
    groupBorderColor: 0x77a78a,
    combat: { damage: 3, range: 1.5, cooldownTicks: 20, aggroRange: 5 },
    renderRadius: 6,
    selectionRadius: 6,
    hitRadius: 16,
    sightRadius: 6,
    minimapShape: "circle",
    minimapRadius: 2.8,
    selectedMinimapRadius: 4,
  },
  swordsman: {
    id: "swordsman",
    displayName: "조선 창병",
    category: "infantry",
    actionIds: infantryActionIds,
    cost: { food: 60, gold: 20 },
    trainTimeTicks: 300,
    populationCost: 1,
    footprint: { width: 1, height: 1, blocksMovement: true },
    baseAttributes: { health: 55, mana: 0, movementSpeed: 4.0 },
    portraitGlyph: "Sp",
    portraitColor: 0x9dada2,
    groupBorderColor: 0xb7c4bb,
    combat: { damage: 9, range: 1.5, cooldownTicks: 18, aggroRange: 7 },
    renderRadius: 6,
    selectionRadius: 6,
    hitRadius: 16,
    sightRadius: 7,
    minimapShape: "circle",
    minimapRadius: 2.9,
    selectedMinimapRadius: 4.2,
  },
  "korean-monk": {
    id: "korean-monk",
    displayName: "조선 승병",
    ...koreanMonkAdaptedGameplay,
  },
  archer: {
    id: "archer",
    displayName: "조선 궁수",
    category: "infantry",
    actionIds: infantryActionIds,
    cost: { food: 45, wood: 35 },
    trainTimeTicks: 300,
    populationCost: 1,
    footprint: { width: 1, height: 1, blocksMovement: true },
    baseAttributes: { health: 38, mana: 0, movementSpeed: 3.9 },
    portraitGlyph: "Ar",
    portraitColor: 0x86b78e,
    groupBorderColor: 0xaed29e,
    combat: { damage: 6, range: 5.5, cooldownTicks: 22, aggroRange: 8 },
    renderRadius: 6,
    selectionRadius: 6,
    hitRadius: 16,
    sightRadius: 8,
    minimapShape: "circle",
    minimapRadius: 2.9,
    selectedMinimapRadius: 4.2,
  },
  "japanese-swordsman": {
    id: "japanese-swordsman",
    displayName: "일본 창병",
    ...japaneseSwordsmanAdaptedGameplay,
  },
  "japanese-samurai": {
    id: "japanese-samurai",
    displayName: "일본 사무라이",
    ...japaneseSwordsmanAdaptedGameplay,
  },
  "japanese-turtle-tank": {
    id: "japanese-turtle-tank",
    displayName: "일본 귀갑차",
    ...japaneseSwordsmanAdaptedGameplay,
  },
  "japanese-gunner": {
    id: "japanese-gunner",
    displayName: "일본 조총병",
    ...japaneseGunnerAdaptedGameplay,
  },
  "japanese-farmer": {
    id: "japanese-farmer",
    displayName: "일본 농부",
    // K01 class 31 has a source identity and core visual mapping only. Keep the existing
    // Japanese-gunner project adapter unchanged; it is not evidence for farmer mechanics.
    ...japaneseGunnerAdaptedGameplay,
  },
  "japanese-shrine-maiden": {
    id: "japanese-shrine-maiden",
    displayName: "일본 무녀",
    ...japaneseGunnerAdaptedGameplay,
  },
  "japanese-konishi": {
    id: "japanese-konishi",
    displayName: "일본 고니시",
    ...japaneseGunnerAdaptedGameplay,
  },
  "japanese-camp-house": {
    id: "japanese-camp-house",
    displayName: "일본 시장",
    category: "building",
    actionIds: passiveBuildingActionIds,
    footprint: { width: 2, height: 2, blocksMovement: true },
    placement: grassPlacement,
    baseAttributes: { health: 550, mana: 0, movementSpeed: 0 },
    portraitGlyph: "JH",
    portraitColor: 0x9b7060,
    groupBorderColor: 0xc18c77,
    renderRadius: 8,
    selectionRadius: 8,
    hitRadius: 18,
    sightRadius: 4,
    minimapShape: "square",
    minimapRadius: 3,
    selectedMinimapRadius: 4,
  },
  "japanese-camp-barracks": {
    id: "japanese-camp-barracks",
    displayName: "일본 훈련소",
    ...japaneseCampBarracksAdaptedGameplay,
  },
  "japanese-hq": {
    id: "japanese-hq",
    displayName: "일본 본영",
    ...japaneseCampBarracksAdaptedGameplay,
  },
  "japanese-camp-tower": {
    id: "japanese-camp-tower",
    displayName: "일본 망루",
    category: "building",
    actionIds: passiveBuildingActionIds,
    footprint: { width: 2, height: 2, blocksMovement: true },
    placement: grassPlacement,
    baseAttributes: { health: 760, mana: 0, movementSpeed: 0 },
    portraitGlyph: "JT",
    portraitColor: 0xb27454,
    groupBorderColor: 0xd69b7c,
    combat: { damage: 8, damageType: "fire", range: 7, cooldownTicks: 24, aggroRange: 7 },
    renderRadius: 8,
    selectionRadius: 8,
    hitRadius: 18,
    sightRadius: 8,
    minimapShape: "square",
    minimapRadius: 3.2,
    selectedMinimapRadius: 4.2,
  },
  "japanese-camp-firehouse": {
    id: "japanese-camp-firehouse",
    displayName: "일본 관측소",
    category: "building",
    actionIds: passiveBuildingActionIds,
    footprint: { width: 3, height: 3, blocksMovement: true },
    placement: grassPlacement,
    baseAttributes: { health: 1000, mana: 0, movementSpeed: 0 },
    portraitGlyph: "JF",
    portraitColor: 0xa96d53,
    groupBorderColor: 0xd49376,
    renderRadius: 10,
    selectionRadius: 10,
    hitRadius: 22,
    sightRadius: 6,
    minimapShape: "square",
    minimapRadius: 3.5,
    selectedMinimapRadius: 4.5,
  },
  "japanese-camp-advanced-tower": {
    id: "japanese-camp-advanced-tower",
    displayName: "왜군 강화 망루",
    category: "building",
    actionIds: passiveBuildingActionIds,
    footprint: { width: 2, height: 2, blocksMovement: true },
    placement: grassPlacement,
    baseAttributes: { health: 920, mana: 0, movementSpeed: 0 },
    portraitGlyph: "JA",
    portraitColor: 0xbc805d,
    groupBorderColor: 0xe0a985,
    combat: { damage: 10, damageType: "fire", range: 8, cooldownTicks: 24, aggroRange: 8 },
    renderRadius: 8,
    selectionRadius: 8,
    hitRadius: 18,
    sightRadius: 9,
    minimapShape: "square",
    minimapRadius: 3.2,
    selectedMinimapRadius: 4.2,
  },
  "ryu-seong-ryong": {
    id: "ryu-seong-ryong",
    displayName: "조선 유성룡",
    category: "infantry",
    actionIds: infantryActionIds,
    populationCost: 1,
    footprint: { width: 1, height: 1, blocksMovement: true },
    baseAttributes: { health: 140, mana: 0, movementSpeed: 4.0 },
    portraitGlyph: "Ry",
    portraitColor: 0x8fb4d8,
    groupBorderColor: 0xd0b46a,
    // Only the class-78 normal-attack subtype-0c route/motion is source-backed.
    // Combat numbers and delivery scheduling remain product policy.
    combat: {
      damage: 10,
      range: 1.5,
      cooldownTicks: 18,
      aggroRange: 7,
      projectileProfileId: "k01-ryu-subtype-0c-static-port",
    },
    renderRadius: 6,
    selectionRadius: 6,
    hitRadius: 16,
    sightRadius: 9,
    minimapShape: "circle",
    minimapRadius: 3.2,
    selectedMinimapRadius: 4.5,
  },
  "gwon-yul": {
    id: "gwon-yul",
    displayName: "조선 권율",
    category: "infantry",
    actionIds: infantryActionIds,
    populationCost: 1,
    footprint: { width: 1, height: 1, blocksMovement: true },
    baseAttributes: { health: 170, mana: 0, movementSpeed: 4.1 },
    portraitGlyph: "Gy",
    portraitColor: 0xd0b46a,
    groupBorderColor: 0xf1dfaa,
    combat: { damage: 12, range: 1.5, cooldownTicks: 17, aggroRange: 7 },
    renderRadius: 6,
    selectionRadius: 6,
    hitRadius: 16,
    sightRadius: 9,
    minimapShape: "circle",
    minimapRadius: 3.2,
    selectedMinimapRadius: 4.5,
  },
  "royal-cart": {
    id: "royal-cart",
    displayName: "조선 선조의 어가",
    category: "infantry",
    actionIds: evacuationActionIds,
    populationCost: 1,
    footprint: { width: 1, height: 1, blocksMovement: true },
    baseAttributes: { health: 180, mana: 0, movementSpeed: 3.2 },
    portraitGlyph: "RC",
    portraitColor: 0x94a5b8,
    groupBorderColor: 0xd0b46a,
    renderRadius: 8,
    selectionRadius: 8,
    hitRadius: 18,
    sightRadius: 8,
    minimapShape: "circle",
    minimapRadius: 3.4,
    selectedMinimapRadius: 4.6,
  },
} as const satisfies Record<string, UnitDefinition>;

export type UnitDefinitionId = keyof typeof unitDefinitions;

export interface ResearchDefinition {
  id: string;
  displayName: string;
  actionId: ActionDefinitionId;
  cost: Partial<Record<BankResourceKind, number>>;
  researchTimeTicks: number;
  sourceBuildings: readonly UnitDefinitionId[];
}

export const researchDefinitions = {
  loom: {
    id: "loom",
    displayName: "방직",
    actionId: "research-loom",
    cost: { food: 80, gold: 40 },
    researchTimeTicks: 180,
    sourceBuildings: ["town-center"],
  },
} as const satisfies Record<string, ResearchDefinition>;

export type ResearchDefinitionId = keyof typeof researchDefinitions;

export function unitCanPerformAction(kind: UnitDefinitionId, actionId: ActionDefinitionId): boolean {
  const actionIds: readonly ActionDefinitionId[] = unitDefinitions[kind].actionIds;

  return actionIds.includes(actionId);
}

export const buildingDefinitionIds = ["town-center", "house", "barracks", "beacon"] as const satisfies readonly UnitDefinitionId[];
export type BuildingDefinitionId = (typeof buildingDefinitionIds)[number];
