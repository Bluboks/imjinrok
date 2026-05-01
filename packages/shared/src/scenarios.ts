import type { GridPoint } from "./commands.js";
import type { UnitDefinitionId } from "./content.js";
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
  type: "survive" | "defeat-opponents" | "collect-resources" | "custom";
  required: boolean;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  scenarioType: ScenarioType;
  mapId: string;
  startingResources: ResourceAmountSet;
  startingUnits: StartingUnitDefinition[];
  objectives: ScenarioObjectiveDefinition[];
  tags: string[];
}

export const defaultSkirmishScenario = {
  id: "default-skirmish",
  name: "Default Skirmish",
  description: "Standard skirmish starting conditions for the river-crossing battlefield.",
  scenarioType: "skirmish",
  mapId: "river-crossing",
  startingResources: {
    food: 200,
    wood: 200,
    gold: 100,
    stone: 100,
  },
  startingUnits: [
    { kind: "town-center", idSuffix: "town-center", offset: { x: 0, y: 0 } },
    { kind: "villager", idSuffix: "villager-1", offset: { x: 3, y: 0 } },
    { kind: "villager", idSuffix: "villager-2", offset: { x: 0, y: 3 } },
    { kind: "villager", idSuffix: "villager-3", offset: { x: 3, y: 3 } },
  ],
  objectives: [
    {
      id: "defeat-opponents",
      label: "Defeat Opponents",
      description: "Eliminate all opposing players.",
      type: "defeat-opponents",
      required: true,
    },
  ],
  tags: ["skirmish", "default-start"],
} as const satisfies ScenarioDefinition;
