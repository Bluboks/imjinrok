import assert from "node:assert/strict";
import test from "node:test";
import { imjinrokK01Scenario } from "@shared";
import { collectMissionBriefingBackdropFrames } from "./missionBriefingBackdrop.js";

test("K01 briefing backdrop paths preserve the converted ybriefingfnt asset contract", () => {
  const firstFrame = collectMissionBriefingBackdropFrames(imjinrokK01Scenario.briefing)[0];

  assert.deepEqual(firstFrame, {
    key: "image:mission-briefing-backdrop:k01-k01",
    url: "assets/themes/default/ui/briefing/k01/k01_0000.png",
    durationMs: 500,
  });
});
