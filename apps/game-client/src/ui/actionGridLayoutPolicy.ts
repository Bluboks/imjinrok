import { ORIGINAL_GAMEPLAY_COMMAND_GRID_SCENARIO_ID } from "../originalGameplayCommandGridLayout.js";

export interface ActionGridLayoutPolicy {
  columns: 4;
  rows: 3;
  slotCount: 12;
}

/**
 * Product layout policy. This responsive 4×3 grid is an intentional web-port
 * adaptation, including for K01; it is not a claim about the original HUD.
 */
export const ADAPTIVE_ACTION_GRID_LAYOUT: ActionGridLayoutPolicy = {
  columns: 4,
  rows: 3,
  slotCount: 12,
};

const PRODUCT_ACTION_GRID_LAYOUTS: Readonly<Record<string, ActionGridLayoutPolicy>> = {
  [ORIGINAL_GAMEPLAY_COMMAND_GRID_SCENARIO_ID]: ADAPTIVE_ACTION_GRID_LAYOUT,
};

export function resolveProductActionGridLayoutForScenario(
  scenarioId: string | undefined,
): ActionGridLayoutPolicy {
  return scenarioId === undefined
    ? ADAPTIVE_ACTION_GRID_LAYOUT
    : PRODUCT_ACTION_GRID_LAYOUTS[scenarioId] ?? ADAPTIVE_ACTION_GRID_LAYOUT;
}
