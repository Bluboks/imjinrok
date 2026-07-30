import assert from "node:assert/strict";
import test from "node:test";
import {
  MAIN_MENU_RESOURCE_PLAN,
  MainMenuDeferredActionQueue,
  requiresDeferredMainMenuResources,
} from "./mainMenuDeferredLoad.js";

test("main menu resource plan keeps landing paint critical and defers follow-up resources", () => {
  assert.deepEqual(
    MAIN_MENU_RESOURCE_PLAN.critical.images.map(({ key }) => key),
    ["main-menu:landing"],
  );
  assert.deepEqual(MAIN_MENU_RESOURCE_PLAN.critical.audioCueKeys, []);
  assert.deepEqual(
    MAIN_MENU_RESOURCE_PLAN.deferred.images.map(({ key }) => key),
    [
      "main-menu:menu-border",
      "main-menu:menu-button",
      "main-menu:nation-button",
      "main-menu:stage-border",
      "main-menu:stage",
      "main-menu:stage-korea",
      "main-menu:select-box",
    ],
  );
  assert.deepEqual(MAIN_MENU_RESOURCE_PLAN.deferred.audioCueKeys, [
    "audio:menu:background-music",
    "audio:menu:button",
    "audio:menu:country-select",
  ]);
});

test("early menu requests await the latest intent and release it only once", () => {
  const queue = new MainMenuDeferredActionQueue<string>();

  assert.equal(queue.request("show-campaign-country"), null);
  assert.equal(queue.request("show-preferences"), null);
  assert.equal(queue.markReady(), "show-preferences");
  assert.equal(queue.markReady(), null);
  assert.equal(queue.request("show-random"), "show-random");
});

test("reset drops pending actions during scene shutdown or recreation", () => {
  const queue = new MainMenuDeferredActionQueue<string>();

  queue.request("show-random");
  queue.reset();
  assert.equal(queue.markReady(), null);
});

test("only first-level screens needing deferred art are gated", () => {
  assert.equal(requiresDeferredMainMenuResources("show-campaign-country"), true);
  assert.equal(requiresDeferredMainMenuResources("show-random"), true);
  assert.equal(requiresDeferredMainMenuResources("show-preferences"), true);
  assert.equal(requiresDeferredMainMenuResources("load-latest-save"), false);
  assert.equal(requiresDeferredMainMenuResources("back"), false);
});
