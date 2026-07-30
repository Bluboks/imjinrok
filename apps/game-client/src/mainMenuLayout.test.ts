import assert from "node:assert/strict";
import test from "node:test";

import {
  getMainMenuPreferenceControlsLayout,
  getMainMenuTop,
  getMenuOptionStepY,
} from "./mainMenuLayout.js";

test("main menu reserves a distinct vertical block for gameplay preferences", () => {
  for (const height of [480, 600, 900]) {
    const titleY = Math.max(62, height * 0.14);
    const preferences = getMainMenuPreferenceControlsLayout(titleY);
    const menuTop = getMainMenuTop(height, titleY);

    assert.ok(menuTop > preferences.bottom, `${height}px menu must start below preference controls`);
  }
  assert.equal(getMainMenuTop(900, 126), 261);
});

test("seven main-menu options compact only when the viewport needs it", () => {
  assert.equal(getMenuOptionStepY(900, 262, 7), 46);
  assert.ok(getMenuOptionStepY(480, 203, 7) < 34);
  assert.equal(getMenuOptionStepY(900, 262, 4), 46);
});
