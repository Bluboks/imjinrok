import test from "node:test";
import assert from "node:assert/strict";
import {
  createCampaignProgressState,
  getCampaignContinueScenario,
  getNextCampaignScenario,
  imjinrokCampaignScenarios,
  imjinrokK01Scenario,
  imjinrokK02Scenario,
  isCampaignComplete,
  isCampaignScenarioUnlocked,
  isCampaignScenarioCompleted,
  markCampaignScenarioCompleted,
  normalizeCampaignProgressState,
} from "./index.js";

test("campaign progress advances continue target through incomplete missions", () => {
  const emptyProgress = createCampaignProgressState(imjinrokCampaignScenarios);

  assert.equal(getCampaignContinueScenario(imjinrokCampaignScenarios, emptyProgress)?.id, imjinrokK01Scenario.id);

  const afterK01 = markCampaignScenarioCompleted(emptyProgress, imjinrokCampaignScenarios, imjinrokK01Scenario.id, "2026-01-01T00:00:00.000Z");

  assert.equal(isCampaignScenarioCompleted(afterK01, imjinrokK01Scenario.id), true);
  assert.equal(afterK01.lastCompletedScenarioId, imjinrokK01Scenario.id);
  assert.equal(afterK01.updatedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(getCampaignContinueScenario(imjinrokCampaignScenarios, afterK01)?.id, imjinrokK02Scenario.id);
  assert.equal(getNextCampaignScenario(imjinrokCampaignScenarios, imjinrokK01Scenario.id)?.id, imjinrokK02Scenario.id);

  const afterK02 = markCampaignScenarioCompleted(afterK01, imjinrokCampaignScenarios, imjinrokK02Scenario.id);

  assert.equal(isCampaignComplete(imjinrokCampaignScenarios, afterK02), true);
  assert.equal(getCampaignContinueScenario(imjinrokCampaignScenarios, afterK02), null);
});

test("campaign progress unlocks missions in campaign order", () => {
  const emptyProgress = createCampaignProgressState(imjinrokCampaignScenarios);

  assert.equal(isCampaignScenarioUnlocked(imjinrokCampaignScenarios, emptyProgress, imjinrokK01Scenario.id), true);
  assert.equal(isCampaignScenarioUnlocked(imjinrokCampaignScenarios, emptyProgress, imjinrokK02Scenario.id), false);

  const afterK01 = markCampaignScenarioCompleted(emptyProgress, imjinrokCampaignScenarios, imjinrokK01Scenario.id);

  assert.equal(isCampaignScenarioUnlocked(imjinrokCampaignScenarios, afterK01, imjinrokK02Scenario.id), true);
  assert.equal(isCampaignScenarioUnlocked(imjinrokCampaignScenarios, afterK01, "missing-scenario"), false);
});

test("campaign progress normalization keeps only known scenarios in campaign order", () => {
  const progress = normalizeCampaignProgressState(
    {
      version: 99,
      completedScenarioIds: ["missing", imjinrokK02Scenario.id, imjinrokK01Scenario.id],
      lastCompletedScenarioId: "missing",
      updatedAt: "bad-date-is-still-display-data",
    },
    imjinrokCampaignScenarios,
  );

  assert.deepEqual(progress.completedScenarioIds, [imjinrokK01Scenario.id, imjinrokK02Scenario.id]);
  assert.equal(progress.lastCompletedScenarioId, undefined);
  assert.equal(progress.updatedAt, "bad-date-is-still-display-data");
  assert.equal(isCampaignComplete(imjinrokCampaignScenarios, progress), true);
  assert.equal(getCampaignContinueScenario(imjinrokCampaignScenarios, progress), null);
});
