import type { GridPoint } from "./commands.js";
import type { UnitDefinitionId } from "./content.js";
import type { WeatherKind } from "./environment.js";
import type { ScenarioType } from "./network.js";

export interface ResourceAmountSet {
  food: number;
  wood: number;
  gold: number;
  stone: number;
}

export interface StartingUnitDefinition {
  kind: UnitDefinitionId;
  idSuffix: string;
  offset: GridPoint;
}

export interface ScenarioObjectiveDefinition {
  id: string;
  label: string;
  description: string;
  type: "survive" | "defeat-opponents" | "collect-resources" | "build-building" | "move-unit-to-area" | "protect-units" | "custom";
  required: boolean;
  visibleAfterObjectiveId?: string;
  completionRequiresObjectiveIds?: readonly string[];
  defeatOnFailure?: boolean;
  defeatDelayTicks?: number;
  playerId?: string;
  targetKind?: UnitDefinitionId;
  count?: number;
  area?: ScenarioAreaDefinition;
  routeWaypoints?: readonly GridPoint[];
  routeWaypointLabels?: readonly string[];
  durationTicks?: number;
  resources?: Partial<ResourceAmountSet>;
}

export interface ScenarioAreaDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScenarioPlayerStartDefinition {
  startingResources?: Partial<ResourceAmountSet>;
  startingUnits?: StartingUnitDefinition[];
}

export type OriginalSpeechSlot = 0 | 1 | 2 | 3;

export interface ScenarioBriefingLineDefinition {
  speaker: string;
  portraitId: string;
  voiceId: string;
  text: string;
  speechSlot: OriginalSpeechSlot;
  delayBeforeMs?: number;
}

export interface ScenarioBriefingTitleFrameDefinition {
  sourceAsset: string;
  durationMs: number;
}

export interface ScenarioBriefingDefinition {
  sourceScript: string;
  musicSource?: string;
  noEnd?: boolean;
  title: string;
  location?: string;
  battleType?: string;
  cast?: readonly string[];
  objective: string;
  titleSequence?: readonly ScenarioBriefingTitleFrameDefinition[];
  lines: ScenarioBriefingLineDefinition[];
}

export interface ScenarioMissionDialogueDefinition {
  id: string;
  sourceScript: string;
  trigger: ScenarioTriggerDefinition;
  focusPoint?: GridPoint;
  completeScenarioOnEnd?: "victory" | "defeat";
  lines: ScenarioBriefingLineDefinition[];
}

export type ScenarioTriggerDefinition =
  | { type: "tick"; tick: number }
  | { type: "objective-status"; objectiveId: string; status: "pending" | "completed" | "failed" }
  | { type: "scenario-status"; status: "running" | "victory" | "defeat" }
  | {
      type: "unit-in-area";
      playerId?: string;
      targetKind: UnitDefinitionId;
      area: ScenarioAreaDefinition;
      count?: number;
    };

export type ScenarioMissionDialogueTriggerDefinition = ScenarioTriggerDefinition;

export interface ScenarioScriptedEventDefinition {
  id: string;
  sourceScript?: string;
  trigger: ScenarioTriggerDefinition;
  actions: ScenarioScriptedEventActionDefinition[];
}

export type ScenarioScriptedEventActionDefinition =
  | ScenarioSpawnUnitsActionDefinition
  | ScenarioSpawnScannedUnitsActionDefinition
  | ScenarioSetWeatherActionDefinition
  | ScenarioGrantResourcesActionDefinition
  | ScenarioCompleteObjectiveActionDefinition
  | ScenarioCompleteScenarioActionDefinition;

export interface ScenarioSpawnUnitsActionDefinition {
  type: "spawn-units";
  playerId: string;
  origin: GridPoint;
  units: StartingUnitDefinition[];
  order?: ScenarioUnitOrderDefinition;
}

export interface ScenarioSpawnScannedUnitsActionDefinition {
  type: "spawn-scanned-units";
  playerId: string;
  scan: ScenarioSpawnScanDefinition;
  maxCount: number;
  firstUnit: ScenarioScannedUnitDefinition;
  repeatedUnit: ScenarioRepeatedScannedUnitDefinition;
  order?: ScenarioUnitOrderDefinition;
}

export interface ScenarioSpawnScanDefinition {
  origin: GridPoint;
  width: number;
  height: number;
  xStep?: number;
  yStep?: number;
}

export interface ScenarioScannedUnitDefinition {
  kind: UnitDefinitionId;
  idSuffix: string;
}

export interface ScenarioRepeatedScannedUnitDefinition {
  kind: UnitDefinitionId;
  idSuffixPrefix: string;
  firstIndex?: number;
}

export interface ScenarioGrantResourcesActionDefinition {
  type: "grant-resources";
  playerId: string;
  resources: Partial<ResourceAmountSet>;
}

export interface ScenarioSetWeatherActionDefinition {
  type: "set-weather";
  weather: WeatherKind;
  durationTicks?: number;
}

export interface ScenarioCompleteObjectiveActionDefinition {
  type: "complete-objective";
  objectiveId: string;
}

export interface ScenarioCompleteScenarioActionDefinition {
  type: "complete-scenario";
  status: "victory" | "defeat";
}

export interface ScenarioUnitOrderDefinition {
  type: "move" | "attack-move";
  target: GridPoint;
  allowPartialPath?: boolean;
  repeatMoveWhileInsideArea?: boolean;
  followUpAttackTarget?: ScenarioUnitTargetSelectorDefinition;
  followUpWhenOutsideArea?: ScenarioAreaDefinition;
  followUpCheckIntervalTicks?: number;
}

export interface ScenarioUnitTargetSelectorDefinition {
  playerId?: string;
  targetKind: UnitDefinitionId;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  scenarioType: ScenarioType;
  mapId: string;
  playerIds?: readonly string[];
  playerTeams?: Readonly<Record<string, string>>;
  completionMode?: "objectives" | "scripted";
  startingResources: ResourceAmountSet;
  startingUnits: StartingUnitDefinition[];
  playerStarts?: Record<string, ScenarioPlayerStartDefinition>;
  briefing?: ScenarioBriefingDefinition;
  missionDialogues?: ScenarioMissionDialogueDefinition[];
  scriptedEvents?: ScenarioScriptedEventDefinition[];
  objectives: ScenarioObjectiveDefinition[];
  tags: string[];
}

const defaultDuelPlayerIds = ["local-player", "cpu-1"] as const;

export function getScenarioLaunchPlayerIds(scenario: ScenarioDefinition): string[] {
  return [...(scenario.playerIds ?? defaultDuelPlayerIds)];
}

export function getScenarioLaunchPlayerTeams(scenario: ScenarioDefinition): Record<string, string> {
  if (scenario.playerTeams) {
    return { ...scenario.playerTeams };
  }

  const teams: Record<string, string> = {};

  getScenarioLaunchPlayerIds(scenario).forEach((playerId, index) => {
    teams[playerId] = index === 0 ? "local" : "cpu";
  });

  return teams;
}

const defaultTownStart: StartingUnitDefinition[] = [
  { kind: "town-center", idSuffix: "town-center", offset: { x: 0, y: 0 } },
  { kind: "villager", idSuffix: "villager-1", offset: { x: 3, y: 0 } },
  { kind: "villager", idSuffix: "villager-2", offset: { x: 0, y: 3 } },
  { kind: "villager", idSuffix: "villager-3", offset: { x: 3, y: 3 } },
];

const localCombatStart: StartingUnitDefinition[] = [
  ...defaultTownStart,
  { kind: "barracks", idSuffix: "barracks", offset: { x: 8, y: 1 } },
  { kind: "swordsman", idSuffix: "swordsman-1", offset: { x: 7, y: 4 } },
  { kind: "swordsman", idSuffix: "swordsman-2", offset: { x: 8, y: 5 } },
  { kind: "archer", idSuffix: "archer-1", offset: { x: 6, y: 5 } },
];

// Source map entity arrays are decoded from the original map header slots loaded by the executable
// at 0xac00a4/0xac06e4/0xac0d24/0xac1364. Unsupported source types are left out until their
// mechanics/assets exist locally.
const k01SourceOpeningBaseStart: StartingUnitDefinition[] = [
  { kind: "house", idSuffix: "source-0x31-5-4", offset: { x: -1, y: -2 } },
  { kind: "house", idSuffix: "source-0x30-11-5", offset: { x: 5, y: -1 } },
  { kind: "barracks", idSuffix: "source-0x32-13-10", offset: { x: 7, y: 4 } },
  { kind: "house", idSuffix: "source-0x33-5-8", offset: { x: -1, y: 2 } },
  { kind: "gwon-yul", idSuffix: "source-0x4c-9-8", offset: { x: 3, y: 2 } },
  { kind: "swordsman", idSuffix: "source-0x02-11-11", offset: { x: 5, y: 5 } },
  { kind: "swordsman", idSuffix: "source-0x0b-9-11", offset: { x: 3, y: 5 } },
  { kind: "archer", idSuffix: "source-0x04-14-8", offset: { x: 8, y: 2 } },
  { kind: "villager", idSuffix: "source-0x07-7-6", offset: { x: 1, y: 0 } },
  { kind: "villager", idSuffix: "source-0x07-8-6", offset: { x: 2, y: 0 } },
  { kind: "ryu-seong-ryong", idSuffix: "source-0x4e-7-8", offset: { x: 1, y: 2 } },
  { kind: "swordsman", idSuffix: "source-0x0b-7-10", offset: { x: 1, y: 4 } },
];

const originalCampaignStartingResources: ResourceAmountSet = {
  food: 5000,
  wood: 5000,
  gold: 5000,
  stone: 5000,
};

const k02SourceStartingResources: ResourceAmountSet = {
  food: 0,
  wood: 0,
  gold: 0,
  stone: 0,
};

const missionScriptCpuStartingResources: ResourceAmountSet = {
  food: 0,
  wood: 0,
  gold: 0,
  stone: 0,
};

export const imjinrokOriginalMissionResultDelayTicks = 0x7d0;

// Source-derived K02 opens inside Hanseong, with Pyongyang structures already present.
// The K0220 executable handler creates the royal cart separately at 6,71 on the opening tick.
const k02SourceHanseongEvacuationStart: StartingUnitDefinition[] = [
  { kind: "house", idSuffix: "source-0x30-3-67", offset: { x: -1, y: -3 } },
  { kind: "house", idSuffix: "source-0x30-3-76", offset: { x: -1, y: 6 } },
  { kind: "house", idSuffix: "source-0x2a-6-76", offset: { x: 2, y: 6 } },
  { kind: "house", idSuffix: "source-0x31-3-71", offset: { x: -1, y: 1 } },
  { kind: "beacon", idSuffix: "source-0x34-70-3", offset: { x: 66, y: -67 } },
  { kind: "ryu-seong-ryong", idSuffix: "source-0x4e-5-68", offset: { x: 1, y: -2 } },
  { kind: "villager", idSuffix: "source-0x0a-5-72", offset: { x: 1, y: 2 } },
  { kind: "house", idSuffix: "source-0x2a-74-13", offset: { x: 70, y: -57 } },
  { kind: "house", idSuffix: "source-0x2a-68-5", offset: { x: 64, y: -65 } },
  { kind: "house", idSuffix: "source-0x2a-78-8", offset: { x: 74, y: -62 } },
  { kind: "swordsman", idSuffix: "source-0x02-7-68", offset: { x: 3, y: -2 } },
  { kind: "swordsman", idSuffix: "source-0x02-13-75", offset: { x: 9, y: 5 } },
  { kind: "swordsman", idSuffix: "source-0x02-13-70", offset: { x: 9, y: 0 } },
  { kind: "archer", idSuffix: "source-0x04-15-75", offset: { x: 11, y: 5 } },
  { kind: "archer", idSuffix: "source-0x04-15-74", offset: { x: 11, y: 4 } },
  { kind: "swordsman", idSuffix: "source-0x0b-13-67", offset: { x: 9, y: -3 } },
  { kind: "swordsman", idSuffix: "source-0x0b-14-67", offset: { x: 10, y: -3 } },
];

const k02HanseongOccupiedArea: ScenarioAreaDefinition = { x: 25, y: 0, width: 55, height: 80 };
// The K02 stage handler starts an 800-tick rain/flood effect once the royal cart reaches x>=45.
const k02MidcourseRainArea: ScenarioAreaDefinition = { x: 45, y: 0, width: 35, height: 80 };
// K0227 checks the royal cart inside x=31..35 and y=26..30 before playing the Gwon Yul encounter dialogue.
const k02GwonYulRendezvousArea: ScenarioAreaDefinition = { x: 31, y: 26, width: 5, height: 5 };
const k02PyongyangArrivalArea: ScenarioAreaDefinition = { x: 73, y: 0, width: 7, height: 6 };
const k02RoyalEvacuationRouteWaypoints = [
  { x: 6, y: 71 },
  { x: 33, y: 28 },
  { x: 76, y: 3 },
] as const satisfies readonly GridPoint[];
const k02RoyalEvacuationRouteWaypointLabels = ["한성 출발", "권율 합류", "평양성 도착"] as const;

const joseonBriefingTitleSequence = [
  { sourceAsset: "ybriefingfnt/k01/k01.spr", durationMs: 500 },
  { sourceAsset: "ybriefingfnt/k01/k0101.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0102.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0103.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0104.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0105.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0106.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0107.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0108.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0109.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0110.spr", durationMs: 15 },
  { sourceAsset: "ybriefingfnt/k01/k0111.spr", durationMs: 15 },
] as const satisfies readonly ScenarioBriefingTitleFrameDefinition[];

export type K01ReinforcementIdentityMapping =
  | "exact-static-identity-source"
  | "proxy";

export interface K01ReinforcementAdapterRecord {
  originalClass: 12 | 13 | 14 | 82;
  rawOwnerWord: 1;
  offset: GridPoint;
  projectKind: "japanese-gunner" | "japanese-swordsman";
  identityMapping: K01ReinforcementIdentityMapping;
  idSuffix: string;
}

export const k01ReinforcementOwnerAdapter = {
  rawOwnerWord: 1,
  projectPlayerId: "cpu-1",
} as const;

// K01-only adapter for the native descriptors created at 0x0048a7ae. The owner-to-player,
// trigger, order, and proxy kinds are project adaptations; generic spawn semantics remain unchanged.
export const k01ReinforcementAdapter = [
  { originalClass: 13, rawOwnerWord: 1, offset: { x: -2, y: -2 }, projectKind: "japanese-swordsman", identityMapping: "proxy", idSuffix: "k0120-reinforcement-0x0d-1" },
  { originalClass: 82, rawOwnerWord: 1, offset: { x: 0, y: -2 }, projectKind: "japanese-gunner", identityMapping: "proxy", idSuffix: "k0120-reinforcement-0x52" },
  { originalClass: 13, rawOwnerWord: 1, offset: { x: 2, y: -2 }, projectKind: "japanese-swordsman", identityMapping: "proxy", idSuffix: "k0120-reinforcement-0x0d-2" },
  { originalClass: 14, rawOwnerWord: 1, offset: { x: -2, y: 0 }, projectKind: "japanese-swordsman", identityMapping: "proxy", idSuffix: "k0120-reinforcement-0x0e-1" },
  { originalClass: 14, rawOwnerWord: 1, offset: { x: 0, y: 0 }, projectKind: "japanese-swordsman", identityMapping: "proxy", idSuffix: "k0120-reinforcement-0x0e-2" },
  { originalClass: 14, rawOwnerWord: 1, offset: { x: 2, y: 0 }, projectKind: "japanese-swordsman", identityMapping: "proxy", idSuffix: "k0120-reinforcement-0x0e-3" },
  { originalClass: 12, rawOwnerWord: 1, offset: { x: -2, y: 2 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source", idSuffix: "k0120-reinforcement-0x0c-1" },
  { originalClass: 12, rawOwnerWord: 1, offset: { x: 0, y: 2 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source", idSuffix: "k0120-reinforcement-0x0c-2" },
  { originalClass: 12, rawOwnerWord: 1, offset: { x: 2, y: 2 }, projectKind: "japanese-gunner", identityMapping: "exact-static-identity-source", idSuffix: "k0120-reinforcement-0x0c-3" },
] as const satisfies readonly K01ReinforcementAdapterRecord[];

const k01ReinforcementWave: StartingUnitDefinition[] = k01ReinforcementAdapter.map(
  ({ projectKind: kind, idSuffix, offset }) => ({ kind, idSuffix, offset }),
);

const k02OccupationScan = { origin: { x: 0, y: 65 }, width: 7, height: 13, yStep: 2 } as const;

// K0115 starts with source map enemy troops and production-less camp structures from the owner1 source records.
const k01ForwardJapaneseStart: StartingUnitDefinition[] = [
  { kind: "japanese-swordsman", idSuffix: "source-0x03-19-29", offset: { x: -33, y: -23 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0d-20-29", offset: { x: -32, y: -23 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x03-37-7", offset: { x: -15, y: -45 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x03-14-51", offset: { x: -38, y: -1 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0d-36-26", offset: { x: -16, y: -26 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0c-38-6", offset: { x: -14, y: -46 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0c-50-8", offset: { x: -2, y: -44 } },
  { kind: "japanese-gunner", idSuffix: "source-0x1f-7-48", offset: { x: -45, y: -4 } },
  { kind: "japanese-gunner", idSuffix: "source-0x1f-7-47", offset: { x: -45, y: -5 } },
  { kind: "japanese-gunner", idSuffix: "source-0x1f-48-1", offset: { x: -4, y: -51 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0d-31-44", offset: { x: -21, y: -8 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0c-38-27", offset: { x: -14, y: -25 } },
  { kind: "japanese-gunner", idSuffix: "source-0x10-11-54", offset: { x: -41, y: 2 } },
  { kind: "japanese-camp-house", idSuffix: "source-0x39-12-52", offset: { x: -40, y: 0 } },
  { kind: "japanese-camp-house", idSuffix: "source-0x39-51-5", offset: { x: -1, y: -47 } },
  { kind: "japanese-camp-barracks", idSuffix: "source-0x3a-7-57", offset: { x: -45, y: 5 } },
  { kind: "japanese-camp-barracks", idSuffix: "source-0x3a-56-6", offset: { x: 4, y: -46 } },
  { kind: "japanese-camp-tower", idSuffix: "source-0x3c-6-50", offset: { x: -46, y: -2 } },
  { kind: "japanese-camp-tower", idSuffix: "source-0x3c-55-11", offset: { x: 3, y: -41 } },
  { kind: "japanese-camp-firehouse", idSuffix: "source-0x3e-12-57", offset: { x: -40, y: 5 } },
  { kind: "japanese-camp-advanced-tower", idSuffix: "source-0x3f-18-49", offset: { x: -34, y: -3 } },
  { kind: "japanese-camp-advanced-tower", idSuffix: "source-0x3f-44-5", offset: { x: -8, y: -47 } },
  { kind: "japanese-camp-advanced-tower", idSuffix: "source-0x3f-32-40", offset: { x: -20, y: -12 } },
  { kind: "japanese-camp-advanced-tower", idSuffix: "source-0x3f-35-29", offset: { x: -17, y: -23 } },
];

const k02SourceJapaneseStart: StartingUnitDefinition[] = [
  { kind: "japanese-swordsman", idSuffix: "source-0x03-54-17-a", offset: { x: -18, y: 9 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x03-53-14", offset: { x: -19, y: 6 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x03-54-17-b", offset: { x: -18, y: 9 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0c-56-15", offset: { x: -16, y: 7 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0c-57-17", offset: { x: -15, y: 9 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x0c-54-12", offset: { x: -18, y: 4 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x14-62-61", offset: { x: -10, y: 53 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x14-60-58", offset: { x: -12, y: 50 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x14-61-58", offset: { x: -11, y: 50 } },
  { kind: "japanese-swordsman", idSuffix: "source-0x14-63-61", offset: { x: -9, y: 53 } },
];

const k02SourceGwonYulRendezvousStart: StartingUnitDefinition[] = [
  { kind: "gwon-yul", idSuffix: "source-0x4c-32-27", offset: { x: 0, y: 0 } },
  { kind: "archer", idSuffix: "source-0x04-32-25", offset: { x: 0, y: -2 } },
  { kind: "swordsman", idSuffix: "source-0x02-30-25", offset: { x: -2, y: -2 } },
  { kind: "archer", idSuffix: "source-0x04-29-26", offset: { x: -3, y: -1 } },
];

const cpuSouthEastCombatStart: StartingUnitDefinition[] = [
  { kind: "town-center", idSuffix: "town-center", offset: { x: 0, y: 0 } },
  { kind: "villager", idSuffix: "villager-1", offset: { x: -3, y: 0 } },
  { kind: "villager", idSuffix: "villager-2", offset: { x: 0, y: -3 } },
  { kind: "villager", idSuffix: "villager-3", offset: { x: -3, y: -3 } },
  { kind: "barracks", idSuffix: "barracks", offset: { x: -8, y: -1 } },
  { kind: "swordsman", idSuffix: "swordsman-1", offset: { x: -7, y: -4 } },
  { kind: "swordsman", idSuffix: "swordsman-2", offset: { x: -8, y: -5 } },
  { kind: "swordsman", idSuffix: "swordsman-3", offset: { x: -6, y: -6 } },
  { kind: "archer", idSuffix: "archer-1", offset: { x: -9, y: -4 } },
];

const cpuNorthEastCombatStart: StartingUnitDefinition[] = [
  { kind: "town-center", idSuffix: "town-center", offset: { x: 0, y: 0 } },
  { kind: "villager", idSuffix: "villager-1", offset: { x: -3, y: 0 } },
  { kind: "villager", idSuffix: "villager-2", offset: { x: 0, y: 3 } },
  { kind: "villager", idSuffix: "villager-3", offset: { x: -3, y: 3 } },
  { kind: "barracks", idSuffix: "barracks", offset: { x: -8, y: 4 } },
  { kind: "swordsman", idSuffix: "swordsman-1", offset: { x: -7, y: 7 } },
  { kind: "swordsman", idSuffix: "swordsman-2", offset: { x: -8, y: 8 } },
  { kind: "swordsman", idSuffix: "swordsman-3", offset: { x: -6, y: 6 } },
  { kind: "archer", idSuffix: "archer-1", offset: { x: -9, y: 7 } },
];

const cpuSouthWestCombatStart: StartingUnitDefinition[] = [
  { kind: "town-center", idSuffix: "town-center", offset: { x: 0, y: 0 } },
  { kind: "villager", idSuffix: "villager-1", offset: { x: 3, y: 0 } },
  { kind: "villager", idSuffix: "villager-2", offset: { x: 0, y: -3 } },
  { kind: "villager", idSuffix: "villager-3", offset: { x: 3, y: -3 } },
  { kind: "barracks", idSuffix: "barracks", offset: { x: 8, y: -1 } },
  { kind: "swordsman", idSuffix: "swordsman-1", offset: { x: 7, y: -4 } },
  { kind: "swordsman", idSuffix: "swordsman-2", offset: { x: 8, y: -5 } },
  { kind: "swordsman", idSuffix: "swordsman-3", offset: { x: 6, y: -6 } },
  { kind: "archer", idSuffix: "archer-1", offset: { x: 9, y: -4 } },
];

export const defaultSkirmishScenario = {
  id: "default-skirmish",
  name: "기본 스커미시",
  description: "강을 사이에 둔 전장에서 시작하는 기본 스커미시 조건.",
  scenarioType: "skirmish",
  mapId: "river-crossing",
  startingResources: {
    food: 200,
    wood: 200,
    gold: 100,
    stone: 100,
  },
  startingUnits: defaultTownStart,
  playerStarts: {
    "player-1": {
      startingUnits: localCombatStart,
    },
    "player-2": {
      startingUnits: cpuSouthEastCombatStart,
    },
    "player-3": {
      startingUnits: cpuNorthEastCombatStart,
    },
    "player-4": {
      startingUnits: cpuSouthWestCombatStart,
    },
  },
  objectives: [
    {
      id: "defeat-opponents",
      label: "적군 섬멸",
      description: "모든 적 플레이어를 섬멸하라.",
      type: "defeat-opponents",
      required: true,
    },
  ],
  tags: ["skirmish", "default-start"],
} as const satisfies ScenarioDefinition;

export const imjinrokK01Scenario = {
  id: "imjinrok-k01-opening",
  name: "1. 불안한 전운",
  description: "조선 조정에서 시작되는 첫 한국 캠페인 미션.",
  scenarioType: "campaign",
  mapId: "imjinrok-k01",
  playerIds: ["local-player", "cpu-1"],
  playerTeams: {
    "local-player": "local",
    "cpu-1": "cpu",
  },
  completionMode: "scripted",
  startingResources: originalCampaignStartingResources,
  startingUnits: defaultTownStart,
  playerStarts: {
    "local-player": {
      startingUnits: k01SourceOpeningBaseStart,
    },
    "cpu-1": {
      startingResources: missionScriptCpuStartingResources,
      startingUnits: k01ForwardJapaneseStart,
    },
  },
  briefing: {
    sourceScript: "script/K0110",
    musicSource: "music/briefmusic.yav",
    noEnd: true,
    title: "1. 불안한 전운",
    location: "조선 조정(경복궁)",
    battleType: "육상전",
    cast: ["유성룡", "선조", "권율"],
    objective: "1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)",
    titleSequence: joseonBriefingTitleSequence,
    lines: [
      {
        speaker: "유성룡",
        portraitId: "K3",
        voiceId: "k01010",
        speechSlot: 0,
        delayBeforeMs: 100,
        text: "전하, 왜의 전쟁준비에 대하여 다녀온 통신사들의 이야기는 다르나 만일에 대비하여 준비를 하여야 하옵니다.",
      },
      {
        speaker: "선조",
        portraitId: "K10",
        voiceId: "k01020",
        speechSlot: 1,
        text: "국방을 강화하는 것은 좋으나, 우리에게는 명나라가 있지 않소. 또한 지난 번 여진족을 정벌했던 것처럼 일부 왜의 무리가 쳐들어 온다 할지라도 능히 막을 수 있지 않겠소?",
      },
      {
        speaker: "유성룡",
        portraitId: "K3",
        voiceId: "k01030",
        speechSlot: 0,
        text: "하오나 전하, 왜의 움직임이 심상치 않사옵니다. 잘 훈련된 정병 10만을 준비하여야만 맞서 싸울 수 있을 것이옵니다. 부디 통촉하여 주시옵소서.",
      },
      {
        speaker: "권율",
        portraitId: "K1",
        voiceId: "k01040",
        speechSlot: 2,
        delayBeforeMs: 100,
        text: "전하, 왜군의 대부대가 지금 부산포에 침입하였다 하옵니다.",
      },
      {
        speaker: "선조",
        portraitId: "K10",
        voiceId: "k01050",
        speechSlot: 1,
        text: "아니, 뭐라구? 왜군이 쳐들어 왔단 말인가! 부산포를 지키는 우리 군졸들은 무엇을 하고 있단 말이오?",
      },
      {
        speaker: "권율",
        portraitId: "K1",
        voiceId: "k01060",
        speechSlot: 2,
        text: "왜군의 군세가 워낙 강하고 그들이 지닌 조총이란 무기 또한 우수하여 부산포의 우리 군졸로만 막기에는 역부족이라 하옵니다.",
      },
      {
        speaker: "선조",
        portraitId: "K10",
        voiceId: "k01070",
        speechSlot: 1,
        text: "그렇다면 어서 조선의 전 군졸들을 보내서라도 왜군의 진격을 막도록 하시오.",
      },
      {
        speaker: "유성룡",
        portraitId: "K3",
        voiceId: "k01080",
        speechSlot: 0,
        text: "그러나 전하, 군졸들을 내려보내기 전에 왜군은 한성에 도달할 것이옵니다. 우선 상주에 방어선을 만들고 적의 기세를 꺾어 사태를 수습할 시간을 벌어야 할 줄 아뢰오.",
      },
      {
        speaker: "권율",
        portraitId: "K1",
        voiceId: "k01090",
        speechSlot: 2,
        text: "하오나, 우리의 군세가 왜군에 비해 부족하옵니다. 지금 방어선을 만든다고 하더라도 싸워 이기기는 힘들 것이옵니다. 속히 명에 원군을 청하셔서 도움을 받아야 할 줄로 아옵니다.",
      },
      {
        speaker: "선조",
        portraitId: "K10",
        voiceId: "k01100",
        speechSlot: 1,
        text: "권장군의 말이 옳으나 우선 적의 기세를 꺾는 것이 가장 중요할 것이오. 유성룡을 총사령관으로 임명할 것이니, 서둘러 나가 왜군의 북상을 막도록 하시오.",
      },
      {
        speaker: "유성룡",
        portraitId: "K3",
        voiceId: "k01110",
        speechSlot: 0,
        text: "어명을 받들어 시행하겠사옵니다.",
      },
    ],
  },
  objectives: [
    {
      id: "build-beacon",
      label: "봉화대 건설",
      description: "봉화대를 짓고 적군을 섬멸하라. 유성룡과 권율은 살아남아야 한다.",
      type: "build-building",
      playerId: "local-player",
      targetKind: "beacon",
      count: 1,
      required: true,
    },
    {
      id: "withdraw-after-reinforcements",
      label: "퇴각 명령 대기",
      description: "봉화대를 완성한 뒤 후속 왜군을 확인하고 퇴각하라.",
      type: "custom",
      required: true,
      visibleAfterObjectiveId: "build-beacon",
    },
    {
      id: "protect-ryu-seong-ryong",
      label: "유성룡 생존",
      description: "유성룡을 잃으면 임무에 실패한다.",
      type: "protect-units",
      playerId: "local-player",
      targetKind: "ryu-seong-ryong",
      count: 1,
      required: false,
      defeatOnFailure: true,
      defeatDelayTicks: imjinrokOriginalMissionResultDelayTicks,
    },
    {
      id: "protect-gwon-yul",
      label: "권율 생존",
      description: "권율을 잃으면 임무에 실패한다.",
      type: "protect-units",
      playerId: "local-player",
      targetKind: "gwon-yul",
      count: 1,
      required: false,
      defeatOnFailure: true,
      defeatDelayTicks: imjinrokOriginalMissionResultDelayTicks,
    },
  ],
  missionDialogues: [
    {
      id: "k01-build-beacon-orders",
      sourceScript: "script/K0115",
      trigger: { type: "tick", tick: 3 },
      lines: [
        {
          speaker: "권율",
          portraitId: "K1",
          voiceId: "K01112",
          speechSlot: 0,
          text: "적이 바로 앞에까지 당도했다 하옵니다.",
        },
        {
          speaker: "유성룡",
          portraitId: "K3",
          voiceId: "K01114",
          speechSlot: 1,
          text: "우선 봉화대를 건설하여 지형을 파악하는 것이 급하오.",
        },
        {
          speaker: "권율",
          portraitId: "K1",
          voiceId: "K01116",
          speechSlot: 0,
          text: "예,당장 봉화대를 짓도록 하겠습니다.",
        },
      ],
    },
    {
      id: "k01-reinforcements",
      sourceScript: "script/K0120",
      trigger: { type: "objective-status", objectiveId: "build-beacon", status: "completed" },
      // The original K0120 handler calls the camera helper with x=55, y=53 before the retreat dialogue.
      focusPoint: { x: 55, y: 53 },
      completeScenarioOnEnd: "victory",
      lines: [
        {
          speaker: "권율",
          portraitId: "K1",
          voiceId: "K01120",
          speechSlot: 0,
          text: "왜군의 후속부대가 나타났습니다.",
        },
        {
          speaker: "유성룡",
          portraitId: "K3",
          voiceId: "K01130",
          speechSlot: 1,
          text: "큰일이오. 이대로는 도저히 적의 공격을 막아낼 수 없겠소. 일단 퇴각하시오.",
        },
        {
          speaker: "권율",
          portraitId: "K1",
          voiceId: "K01140",
          speechSlot: 0,
          text: "예, 전군 퇴각하라.",
        },
      ],
    },
  ],
  scriptedEvents: [
    {
      id: "k01-reinforcement-wave",
      sourceScript: "script/K0120",
      trigger: { type: "objective-status", objectiveId: "build-beacon", status: "completed" },
      actions: [
        {
          type: "spawn-units",
          playerId: k01ReinforcementOwnerAdapter.projectPlayerId,
          origin: { x: 55, y: 53 },
          units: k01ReinforcementWave,
          order: { type: "attack-move", target: { x: 10, y: 10 } },
        },
        {
          type: "complete-objective",
          objectiveId: "withdraw-after-reinforcements",
        },
      ],
    },
  ],
  tags: ["campaign", "imjinrok-original", "import-scaffold"],
} as const satisfies ScenarioDefinition;

export const imjinrokK02Scenario = {
  id: "imjinrok-k02-advance",
  name: "2. 불타는 한성",
  description: "어가를 평양성까지 대피시키는 두 번째 한국 캠페인 미션.",
  scenarioType: "campaign",
  mapId: "imjinrok-k02",
  playerIds: ["local-player", "cpu-1", "ally-1"],
  playerTeams: {
    "local-player": "local",
    "cpu-1": "cpu",
    "ally-1": "local",
  },
  completionMode: "scripted",
  startingResources: k02SourceStartingResources,
  startingUnits: defaultTownStart,
  playerStarts: {
    "local-player": {
      startingUnits: k02SourceHanseongEvacuationStart,
    },
    "cpu-1": {
      startingResources: missionScriptCpuStartingResources,
      startingUnits: k02SourceJapaneseStart,
    },
    "ally-1": {
      startingResources: missionScriptCpuStartingResources,
      startingUnits: k02SourceGwonYulRendezvousStart,
    },
  },
  briefing: {
    sourceScript: "script/K0210",
    musicSource: "music/briefmusic.yav",
    noEnd: true,
    title: "2. 불타는 한성",
    location: "조선 조정(경복궁)",
    battleType: "육상전",
    cast: ["유성룡", "선조", "권율"],
    objective: "1. 어가를 평양성까지 대피시킨다. (유성룡은 살아 남아야 한다.)",
    titleSequence: joseonBriefingTitleSequence,
    lines: [
      {
        speaker: "선조",
        portraitId: "K10",
        voiceId: "K02010",
        speechSlot: 0,
        delayBeforeMs: 100,
        text: "상주의 방어군은 어찌되었소?",
      },
      {
        speaker: "유성룡",
        portraitId: "K3",
        voiceId: "K02020",
        speechSlot: 1,
        text: "왜군의 공격을 막아내기에는 역부족이었사옵니다. 그러나 아직 왜군이 한성에 다다르기 까지는 약간의 여유가 있으니 인근의 모든 군졸들을 집결시켜 한성을 지켜내야 하옵니다.",
      },
      {
        speaker: "선조",
        portraitId: "K10",
        voiceId: "K02030",
        speechSlot: 0,
        text: "아! 이일을 어찌해야 할 것인가? 짐이 어리석어 이 땅의 많은 백성들이 고통을 겪게 되다니... 장차 내가 죽어 선대의 대왕님들을 어찌 뵐 수 있겠는가? 200년 종묘사직의 영광이 이제 와서 무너진단 말인가.. 흑흑",
      },
      {
        speaker: "유성룡",
        portraitId: "K3",
        voiceId: "K02040",
        speechSlot: 1,
        text: "전하, 고정하시오소서. 아직 모든 것을 잃은 것은 아니옵니다. 왕실이 건재하고 의로운 백성들이 남아 있는 한 반드시 적을 물리칠 수 있을 것이옵니다. 명을 내리시어 한성을 지키게 하시고 서둘러 평양성으로 피하시는 것이 옳은 줄 아뢰오.",
      },
      {
        speaker: "선조",
        portraitId: "K10",
        voiceId: "K02050",
        speechSlot: 0,
        text: "알겠소. 그대의 말이 맞소. 내 비록 도적을 끌어들인 책임이 있으나, 나라의 큰 위기를 맞아 가만히 있을 수만은 없는 일이오. 총사령관 유성룡은 즉시 전국의 백성들에게 왜적을 맞아 싸울 것을 명하는 교서를 내리도록 하시오.",
      },
      {
        speaker: "유성룡",
        portraitId: "K3",
        voiceId: "K02060",
        speechSlot: 1,
        text: "예, 즉각 실행하겠사옵니다.",
      },
      {
        speaker: "선조",
        portraitId: "K10",
        voiceId: "K02070",
        speechSlot: 0,
        delayBeforeMs: 100,
        text: "통신사들이 왜에 다녀온 후 전쟁에 대비하자던 그대의 말을 따랐더라면....",
      },
      {
        speaker: "유성룡",
        portraitId: "K3",
        voiceId: "K02080",
        speechSlot: 1,
        text: "권율장군, 전하께옵서 무사히 평양성으로 피하실 수 있도록 먼저 가서 안전한지 확인하도록 하시오.",
      },
      {
        speaker: "권율",
        portraitId: "K1",
        voiceId: "K02090",
        speechSlot: 2,
        text: "예, 목숨을 걸고 명을 받들겠습니다.",
      },
    ],
  },
  objectives: [
    {
      id: "evacuate-royal-cart",
      label: "어가를 평양성까지 대피",
      description: "어가를 평양성까지 대피시켜라. 유성룡은 살아남아야 한다.",
      type: "move-unit-to-area",
      playerId: "local-player",
      targetKind: "royal-cart",
      count: 1,
      area: k02PyongyangArrivalArea,
      routeWaypoints: k02RoyalEvacuationRouteWaypoints,
      routeWaypointLabels: k02RoyalEvacuationRouteWaypointLabels,
      required: true,
    },
    {
      id: "protect-ryu-seong-ryong",
      label: "유성룡 생존",
      description: "유성룡을 잃으면 임무에 실패한다.",
      type: "protect-units",
      playerId: "local-player",
      targetKind: "ryu-seong-ryong",
      count: 1,
      required: false,
      defeatOnFailure: true,
    },
  ],
  missionDialogues: [
    {
      id: "k02-royal-evacuation",
      sourceScript: "script/K0220",
      trigger: { type: "tick", tick: 3 },
      lines: [
        {
          speaker: "유성룡",
          portraitId: "K3",
          voiceId: "K02100",
          speechSlot: 0,
          text: "전하, 서둘러 평양성으로 가셔야 하옵니다.",
        },
        {
          speaker: "선조",
          portraitId: "K10",
          voiceId: "K02110",
          speechSlot: 1,
          text: "아니! 도성을 버리고 가다니...",
        },
        {
          speaker: "유성룡",
          portraitId: "K3",
          voiceId: "K02120",
          speechSlot: 0,
          text: "지금은 그런 말씀을 하실 때가 아니옵니다. 우선 옥체를 보존하시고 훗날을 도모하심이 옳은 줄 아뢰오.",
        },
        {
          speaker: "선조",
          portraitId: "K10",
          voiceId: "K02130",
          speechSlot: 1,
          text: "그대의 말이 맞소. 자, 평양성으로 갑시다.",
        },
      ],
    },
    {
      id: "k02-hanseong-occupied",
      sourceScript: "script/K0225",
      trigger: {
        type: "unit-in-area",
        playerId: "local-player",
        targetKind: "royal-cart",
        area: k02HanseongOccupiedArea,
      },
      // K0225 recenters on the Hanseong start area before the occupation line.
      focusPoint: { x: 5, y: 70 },
      lines: [
        {
          speaker: "왜장",
          portraitId: "J1",
          voiceId: "K02140",
          speechSlot: 0,
          text: "한성을 점령했다. 조선의 왕은 어디 있는가? 조선의 왕을 찾아라.",
        },
      ],
    },
    {
      id: "k02-gwon-yul-rendezvous",
      sourceScript: "script/K0227",
      trigger: {
        type: "unit-in-area",
        playerId: "local-player",
        targetKind: "royal-cart",
        area: k02GwonYulRendezvousArea,
      },
      focusPoint: { x: 33, y: 28 },
      lines: [
        {
          speaker: "선조",
          portraitId: "K10",
          voiceId: "K02150",
          speechSlot: 0,
          text: "권장군! 어찌 이곳에 있소?",
        },
        {
          speaker: "권율",
          portraitId: "K1",
          voiceId: "K02160",
          speechSlot: 1,
          text: "전하가 걱정되어 이곳을 지키고 있었사옵니다.",
        },
        {
          speaker: "선조",
          portraitId: "K10",
          voiceId: "K02170",
          speechSlot: 0,
          text: "다행이오. 지금 뒤에 왜군이 바짝 따라오고 있소.",
        },
        {
          speaker: "권율",
          portraitId: "K1",
          voiceId: "K02180",
          speechSlot: 1,
          text: "목숨을 다해 왜적을 저지하겠사옵니다.",
        },
      ],
    },
    {
      id: "k02-arrived-pyongyang",
      sourceScript: "script/K0230",
      trigger: { type: "objective-status", objectiveId: "evacuate-royal-cart", status: "completed" },
      focusPoint: { x: 73, y: 5 },
      completeScenarioOnEnd: "victory",
      lines: [
        {
          speaker: "선조",
          portraitId: "K10",
          voiceId: "K02190",
          speechSlot: 0,
          text: "아! 겨우 평양성으로 피했소. 한성은 어찌되었소?",
        },
        {
          speaker: "유성룡",
          portraitId: "K3",
          voiceId: "K02200",
          speechSlot: 1,
          text: "이미 적의 수중에 넘어 갔다 하옵니다.",
        },
        {
          speaker: "선조",
          portraitId: "K10",
          voiceId: "K02210",
          speechSlot: 0,
          text: "벌써? 그렇다면 여기도 위험하지 않소? 서둘러 의주로 피하여 명의 대군에게 원군을 청해야 겠소.",
        },
        {
          speaker: "유성룡",
          portraitId: "K3",
          voiceId: "K02220",
          speechSlot: 1,
          text: "왜적이 이곳까지 당도하려면 시간이 걸릴 것이옵니다. 우선 흩어진 군졸들을 모아 적의 공격에 대비하는 것이 급한 줄 아뢰오.",
        },
        {
          speaker: "선조",
          portraitId: "K10",
          voiceId: "K02230",
          speechSlot: 0,
          text: "알겠소. 그렇게 하도록 하시오. 그리고 어서 명에 사신을 보내 구원병을 요청하도록 하시오.",
        },
        {
          speaker: "유성룡",
          portraitId: "K3",
          voiceId: "K02260",
          speechSlot: 1,
          text: "예, 전하.",
        },
      ],
    },
  ],
  scriptedEvents: [
    {
      id: "k02-royal-cart-spawn",
      sourceScript: "script/K0220",
      trigger: { type: "tick", tick: 0 },
      actions: [
        {
          type: "spawn-units",
          playerId: "local-player",
          origin: { x: 6, y: 71 },
          units: [
            { kind: "royal-cart", idSuffix: "royal-cart", offset: { x: 0, y: 0 } },
          ],
        },
      ],
    },
    {
      id: "k02-hanseong-occupation-pursuit",
      sourceScript: "script/K0225",
      trigger: {
        type: "unit-in-area",
        playerId: "local-player",
        targetKind: "royal-cart",
        area: k02HanseongOccupiedArea,
      },
      actions: [
        {
          type: "spawn-scanned-units",
          playerId: "cpu-1",
          // K0225 scans x=0..6 and y=65..77, spawns type 0x52 once, then type 0x0c until 20 units exist.
          scan: k02OccupationScan,
          maxCount: 20,
          firstUnit: { kind: "japanese-gunner", idSuffix: "k0225-occupation-0x52" },
          repeatedUnit: { kind: "japanese-swordsman", idSuffixPrefix: "k0225-occupation-0x0c" },
          // The post-occupation loop first moves lower-left pursuers toward x=67,y=59 before retargeting the royal cart.
          order: {
            type: "move",
            target: { x: 67, y: 59 },
            allowPartialPath: true,
            repeatMoveWhileInsideArea: true,
            followUpAttackTarget: { playerId: "local-player", targetKind: "royal-cart" },
            followUpWhenOutsideArea: { x: 0, y: 59, width: 63, height: 21 },
            followUpCheckIntervalTicks: 100,
          },
        },
      ],
    },
    {
      id: "k02-midcourse-rain",
      sourceScript: "exe/K02@0x48aad2",
      trigger: {
        type: "unit-in-area",
        playerId: "local-player",
        targetKind: "royal-cart",
        area: k02MidcourseRainArea,
      },
      actions: [
        {
          type: "set-weather",
          weather: "rain",
          durationTicks: 800,
        },
      ],
    },
  ],
  tags: ["campaign", "imjinrok-original", "import-scaffold"],
} as const satisfies ScenarioDefinition;

export const imjinrokCampaignScenarios = [imjinrokK01Scenario, imjinrokK02Scenario] as const satisfies readonly ScenarioDefinition[];
