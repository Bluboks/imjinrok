import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sceneSource = readFileSync(
  fileURLToPath(new URL("./MainMenuScene.ts", import.meta.url)),
  "utf8",
);

test("campaign-stage Back is a clean project-adaptation button", () => {
  assert.doesNotMatch(sceneSource, /stageMenuButton:/u);
  assert.doesNotMatch(
    sceneSource,
    /stage\/menu-button\/gamemenubutton_0000\.png/u,
  );
  const stageMenu = sceneSource.slice(
    sceneSource.indexOf("private drawCampaignStageMenu"),
    sceneSource.indexOf("private drawRandomMenu"),
  );
  assert.match(stageMenu, /this\.addProjectAdaptationButton\([\s\S]*?"돌아가기"/u);
  assert.doesNotMatch(stageMenu, /MAIN_MENU_ASSETS\.stageMenuButton/u);

  const projectAdaptationButton = sceneSource.slice(
    sceneSource.indexOf("private addProjectAdaptationButton"),
    sceneSource.indexOf("private addStageBorder"),
  );
  assert.match(projectAdaptationButton, /fillRoundedRect\(rect\.x, rect\.y, rect\.width, rect\.height, 4\)/u);
  assert.doesNotMatch(projectAdaptationButton, /addSourceImage\(/u);

});

test("campaign country screen uses the source map mask instead of a project list", () => {
  const countryMenu = sceneSource.slice(
    sceneSource.indexOf("private drawCampaignCountryMenu"),
    sceneSource.indexOf("private drawCampaignStageMenu"),
  );

  assert.match(countryMenu, /this\.addCampaignCountrySelectionMap\(\)/u);
  assert.doesNotMatch(countryMenu, /countryEntries|addNationEntry/u);
  assert.match(sceneSource, /pointermove/u);
  assert.match(sceneSource, /pointerout/u);
  assert.match(sceneSource, /pointerup/u);
  assert.match(sceneSource, /resolveCampaignNationMissionAction/u);
});
