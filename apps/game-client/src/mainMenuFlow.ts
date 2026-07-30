import {
  isMainMenuSourcePointInRect,
  type MainMenuPresentationGeometry,
  type MainMenuSourcePoint,
  type MainMenuSourceRect,
} from "./mainMenuLayout.js";

export type MainMenuScreen =
  | "main"
  | "campaign-country"
  | "campaign-stage"
  | "random"
  | "preferences";

export type MainMenuAction =
  | "show-campaign-country"
  | "load-latest-save"
  | "show-random"
  | "show-preferences"
  | "show-campaign-stage"
  | "launch-k01"
  | "launch-k02"
  | "start-random-duel"
  | "start-random-four-player"
  | "start-cpu-skirmish"
  | "start-last-random"
  | "cycle-ai-difficulty"
  | "cycle-game-speed"
  | "cycle-mouse-mode"
  | "back";

export interface MainMenuActionAvailability {
  hasQuickSave: boolean;
  isK02Unlocked: boolean;
  hasLastRandom: boolean;
}

export function resolveMainMenuPointerAction(
  screen: MainMenuScreen,
  point: MainMenuSourcePoint,
  availability: MainMenuActionAvailability,
  presentation: MainMenuPresentationGeometry,
): MainMenuAction | null {
  switch (screen) {
    case "main":
      return resolveMainAction(point, availability, presentation);
    case "campaign-country":
      return resolveCountryAction(point, presentation);
    case "campaign-stage":
      return resolveStageAction(point, availability, presentation);
    case "random":
      return resolvePanelAction(point, availability, presentation, [
        "start-random-duel",
        "start-random-four-player",
        "start-cpu-skirmish",
        "start-last-random",
      ]);
    case "preferences":
      return resolvePanelAction(point, availability, presentation, [
        "cycle-game-speed",
        "cycle-mouse-mode",
        "cycle-ai-difficulty",
      ]);
  }
}

export function resolveMainMenuKeyboardAction(
  screen: MainMenuScreen,
  key: string,
  availability: MainMenuActionAvailability,
): MainMenuAction | null {
  if (key === "ESC") {
    return screen === "main" ? null : "back";
  }

  switch (screen) {
    case "main":
      return resolveMainKeyboardAction(key, availability);
    case "campaign-country":
      return key === "ONE" ? "show-campaign-stage" : null;
    case "campaign-stage":
      if (key === "ONE") {
        return "launch-k01";
      }
      return key === "TWO" && availability.isK02Unlocked ? "launch-k02" : null;
    case "random":
      return resolveIndexedAction(key, availability, [
        "start-random-duel",
        "start-random-four-player",
        "start-cpu-skirmish",
        "start-last-random",
      ]);
    case "preferences":
      return resolveIndexedAction(key, availability, [
        "cycle-game-speed",
        "cycle-mouse-mode",
        "cycle-ai-difficulty",
      ]);
  }
}

function resolveMainAction(
  point: MainMenuSourcePoint,
  availability: MainMenuActionAvailability,
  presentation: MainMenuPresentationGeometry,
): MainMenuAction | null {
  const { main } = presentation.projectAdaptationHitRects;
  if (isMainMenuSourcePointInRect(point, main.scenario)) {
    return "show-campaign-country";
  }
  if (
    availability.hasQuickSave &&
    isMainMenuSourcePointInRect(point, main.load)
  ) {
    return "load-latest-save";
  }
  if (isMainMenuSourcePointInRect(point, main.random)) {
    return "show-random";
  }
  return isMainMenuSourcePointInRect(point, main.preferences)
    ? "show-preferences"
    : null;
}

function resolveCountryAction(
  point: MainMenuSourcePoint,
  presentation: MainMenuPresentationGeometry,
): MainMenuAction | null {
  const { country } = presentation.projectAdaptationHitRects;
  if (isMainMenuSourcePointInRect(point, country.korea)) {
    return "show-campaign-stage";
  }
  return isMainMenuSourcePointInRect(point, country.back) ? "back" : null;
}

function resolveStageAction(
  point: MainMenuSourcePoint,
  availability: MainMenuActionAvailability,
  presentation: MainMenuPresentationGeometry,
): MainMenuAction | null {
  const { stage } = presentation.projectAdaptationHitRects;
  if (isMainMenuSourcePointInRect(point, stage.back)) {
    return "back";
  }

  const slot = getSourceSlot(
    point,
    stage.slot,
    stage.firstSlotY,
    stage.slotHeight,
    8,
  );
  if (slot === 0) {
    return "launch-k01";
  }
  return slot === 1 && availability.isK02Unlocked ? "launch-k02" : null;
}

function resolvePanelAction(
  point: MainMenuSourcePoint,
  availability: MainMenuActionAvailability,
  presentation: MainMenuPresentationGeometry,
  actions: readonly MainMenuAction[],
): MainMenuAction | null {
  const { panel } = presentation.projectAdaptationHitRects;
  if (isMainMenuSourcePointInRect(point, panel.back)) {
    return "back";
  }

  const index = getSourceSlot(
    point,
    panel.row,
    panel.firstRowY,
    panel.rowHeight,
    actions.length,
  );
  const action = index === null ? null : (actions[index] ?? null);

  return action === "start-last-random" && !availability.hasLastRandom
    ? null
    : action;
}

function resolveMainKeyboardAction(
  key: string,
  availability: MainMenuActionAvailability,
): MainMenuAction | null {
  if (key === "ONE") {
    return "show-campaign-country";
  }
  if (key === "TWO") {
    return availability.hasQuickSave ? "load-latest-save" : null;
  }
  if (key === "THREE") {
    return "show-preferences";
  }
  if (key === "FOUR") {
    return "show-random";
  }
  return null;
}

function resolveIndexedAction(
  key: string,
  availability: MainMenuActionAvailability,
  actions: readonly MainMenuAction[],
): MainMenuAction | null {
  const index = ["ONE", "TWO", "THREE", "FOUR"].indexOf(key);
  const action = index < 0 ? null : (actions[index] ?? null);

  return action === "start-last-random" && !availability.hasLastRandom
    ? null
    : action;
}

function getSourceSlot(
  point: MainMenuSourcePoint,
  firstRect: MainMenuSourceRect,
  firstY: number,
  slotHeight: number,
  count: number,
): number | null {
  if (point.x < firstRect.x || point.x > firstRect.x + firstRect.width) {
    return null;
  }

  const slot = Math.floor((point.y - firstY) / slotHeight);
  if (slot < 0 || slot >= count) {
    return null;
  }

  const slotRect: MainMenuSourceRect = {
    ...firstRect,
    y: firstY + slot * slotHeight,
  };
  return isMainMenuSourcePointInRect(point, slotRect) ? slot : null;
}
