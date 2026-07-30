import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveMainMenuKeyboardAction,
  resolveMainMenuPointerAction,
  type MainMenuActionAvailability,
} from "./mainMenuFlow.js";
import { IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY } from "./mainMenuLayout.js";

const locked: MainMenuActionAvailability = {
  hasQuickSave: false,
  isK02Unlocked: false,
  hasLastRandom: false,
};

const available: MainMenuActionAvailability = {
  hasQuickSave: true,
  isK02Unlocked: true,
  hasLastRandom: true,
};

test("main menu leaves unavailable source-art actions inert", () => {
  assert.equal(
    resolveMainMenuPointerAction(
      "main",
      { x: 530, y: 174 },
      locked,
      IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
    ),
    null,
  );
  assert.equal(resolveMainMenuKeyboardAction("main", "TWO", locked), null);
  assert.equal(
    resolveMainMenuPointerAction(
      "campaign-country",
      { x: 105, y: 190 },
      available,
      IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
    ),
    null,
  );
  assert.equal(
    resolveMainMenuPointerAction(
      "campaign-stage",
      { x: 380, y: 159 },
      locked,
      IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
    ),
    null,
  );
  assert.equal(
    resolveMainMenuPointerAction(
      "random",
      { x: 500, y: 254 },
      locked,
      IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
    ),
    null,
  );
});

test("main menu maps active pointer and keyboard actions by screen", () => {
  assert.equal(
    resolveMainMenuPointerAction(
      "main",
      { x: 530, y: 79 },
      available,
      IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
    ),
    "show-campaign-country",
  );
  assert.equal(
    resolveMainMenuKeyboardAction("main", "TWO", available),
    "load-latest-save",
  );
  assert.equal(
    resolveMainMenuPointerAction(
      "campaign-country",
      { x: 105, y: 141 },
      available,
      IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
    ),
    "show-campaign-stage",
  );
  assert.equal(
    resolveMainMenuKeyboardAction("campaign-stage", "ONE", available),
    "launch-k01",
  );
  assert.equal(
    resolveMainMenuPointerAction(
      "campaign-stage",
      { x: 380, y: 160 },
      available,
      IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
    ),
    "launch-k02",
  );
  assert.equal(
    resolveMainMenuKeyboardAction("preferences", "THREE", available),
    "cycle-ai-difficulty",
  );
});

test("escape returns from nested source-art screens without exiting the browser game", () => {
  assert.equal(resolveMainMenuKeyboardAction("main", "ESC", available), null);
  assert.equal(
    resolveMainMenuKeyboardAction("campaign-country", "ESC", available),
    "back",
  );
  assert.equal(
    resolveMainMenuKeyboardAction("campaign-stage", "ESC", available),
    "back",
  );
  assert.equal(
    resolveMainMenuKeyboardAction("random", "ESC", available),
    "back",
  );
});
