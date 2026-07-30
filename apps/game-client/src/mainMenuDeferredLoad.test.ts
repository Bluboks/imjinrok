import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_LANDING_RESOURCE_POLICY,
  MAIN_MENU_ASSETS,
  MAIN_MENU_RESOURCE_PLAN,
  MainMenuDeferredActionQueue,
  requiresDeferredMainMenuResources,
} from "./mainMenuDeferredLoad.js";

test("initial landing resource policy keeps boot empty and defers all non-landing menu resources", () => {
  assert.deepEqual(INITIAL_LANDING_RESOURCE_POLICY.boot, {
    images: [],
    audioCueKeys: [],
  });
  assert.equal(INITIAL_LANDING_RESOURCE_POLICY.mainMenu, MAIN_MENU_RESOURCE_PLAN);
  assert.deepEqual(
    MAIN_MENU_RESOURCE_PLAN.critical,
    {
      images: [
        {
          key: "main-menu:landing",
          url: "/assets/themes/default/ui/main-menu/title/title_0000.png",
        },
      ],
      audioCueKeys: [],
    },
  );
  assert.deepEqual(
    MAIN_MENU_RESOURCE_PLAN.deferred,
    {
      images: [
        {
          key: "main-menu:menu-border",
          url: "/assets/themes/default/ui/main-menu/game-menu-border/gamemenuborder_0000.png",
        },
        {
          key: "main-menu:menu-button",
          url: "/assets/themes/default/ui/main-menu/game-menu-buttons/gamemenubutton_0000.png",
        },
        {
          key: "main-menu:nation-button",
          url: "/assets/themes/default/ui/main-menu/nation-buttons/NationButtons_0000.png",
        },
        {
          key: "main-menu:stage-border",
          url: "/assets/themes/default/ui/main-menu/stage-border/selectstageborder_0000.png",
        },
        {
          key: "main-menu:stage",
          url: "/assets/themes/default/ui/main-menu/stage/title/titlestartstage_0000.png",
        },
        {
          key: "main-menu:stage-korea",
          url: "/assets/themes/default/ui/main-menu/stage/korea/titlestartstagekorea_0000.png",
        },
        {
          key: "main-menu:select-box",
          url: "/assets/themes/default/ui/main-menu/stage/select-box/selectbox_0000.png",
        },
      ],
      audioCueKeys: [
        "audio:menu:background-music",
        "audio:menu:button",
        "audio:menu:country-select",
      ],
    },
  );
  assert.deepEqual(Object.values(MAIN_MENU_ASSETS), [
    ...MAIN_MENU_RESOURCE_PLAN.critical.images,
    ...MAIN_MENU_RESOURCE_PLAN.deferred.images,
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
