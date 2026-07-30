import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCampaignNationAtSourcePoint,
  resolveCampaignNationMissionAction,
  type MainMenuCountryMaskPixel,
} from "./mainMenuCountrySelection.js";
import {
  getMainMenuSourcePoint,
  projectMainMenuSourceRect,
  resolveMainMenuCanvasLayout,
  IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY,
} from "./mainMenuLayout.js";

const countryPixels: Record<string, MainMenuCountryMaskPixel> = {
  "470,200": { red: 0, green: 202, blue: 0, alpha: 255 },
  "550,200": { red: 202, green: 202, blue: 0, alpha: 255 },
  "380,200": { red: 202, green: 0, blue: 0, alpha: 255 },
};

function getCountryMaskPixel(x: number, y: number): MainMenuCountryMaskPixel | null {
  return countryPixels[`${x},${y}`] ?? { red: 255, green: 227, blue: 255, alpha: 0 };
}

test("country-selection mask resolves all three source hover states and clears outside a territory", () => {
  assert.equal(resolveCampaignNationAtSourcePoint({ x: 470, y: 200 }, getCountryMaskPixel)?.id, "korea");
  assert.equal(resolveCampaignNationAtSourcePoint({ x: 550, y: 200 }, getCountryMaskPixel)?.id, "japan");
  assert.equal(resolveCampaignNationAtSourcePoint({ x: 380, y: 200 }, getCountryMaskPixel)?.id, "china");
  assert.equal(resolveCampaignNationAtSourcePoint({ x: 445, y: 350 }, getCountryMaskPixel), null);
  assert.equal(resolveCampaignNationAtSourcePoint({ x: Number.NaN, y: 200 }, getCountryMaskPixel), null);
});

test("only supported country missions activate after a country-map click", () => {
  const korea = resolveCampaignNationAtSourcePoint({ x: 470, y: 200 }, getCountryMaskPixel);
  const japan = resolveCampaignNationAtSourcePoint({ x: 550, y: 200 }, getCountryMaskPixel);
  const china = resolveCampaignNationAtSourcePoint({ x: 380, y: 200 }, getCountryMaskPixel);

  assert.equal(resolveCampaignNationMissionAction(korea), "show-campaign-stage");
  assert.equal(resolveCampaignNationMissionAction(japan), null);
  assert.equal(resolveCampaignNationMissionAction(china), null);
  assert.equal(resolveCampaignNationMissionAction(null), null);
});

test("country mask hit testing keeps source coordinates in a wider letterboxed viewport", () => {
  const layout = resolveMainMenuCanvasLayout(1280, 720, IMJINROK_CLASSIC_MAIN_MENU_GEOMETRY);
  const projected = projectMainMenuSourceRect(layout, { x: 470, y: 200, width: 1, height: 1 });
  const sourcePoint = getMainMenuSourcePoint(layout, { x: projected.x, y: projected.y });

  assert.deepEqual(sourcePoint, { x: 470, y: 200 });
  assert.equal(resolveCampaignNationAtSourcePoint(sourcePoint, getCountryMaskPixel)?.id, "korea");
});
