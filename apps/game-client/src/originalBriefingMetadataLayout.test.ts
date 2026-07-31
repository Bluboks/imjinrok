import assert from "node:assert/strict";
import test from "node:test";

import {
  ORIGINAL_BRIEFING_OBJECTIVE_SOURCE_RECT,
  ORIGINAL_BRIEFING_TITLE_SOURCE_RECT,
  resolveOriginalBriefingMetadataLayout,
} from "./originalBriefingMetadataLayout.js";

test("briefing metadata keeps the proven source coordinates at 640 by 480", () => {
  assert.deepEqual(ORIGINAL_BRIEFING_TITLE_SOURCE_RECT, {
    left: 188,
    top: 65,
    right: 466,
    bottom: 95,
  });
  assert.deepEqual(ORIGINAL_BRIEFING_OBJECTIVE_SOURCE_RECT, {
    left: 188,
    top: 290,
    right: 466,
    bottom: 376,
  });
  assert.deepEqual(resolveOriginalBriefingMetadataLayout(640, 480), {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    title: {
      rect: { x: 188, y: 65, width: 278, height: 30 },
      x: 188,
      centerY: 80,
    },
    objective: {
      rect: { x: 188, y: 290, width: 278, height: 86 },
      x: 188,
      firstStringCenterY: 311,
      secondStringCenterY: 354,
      maxWidth: 278,
    },
  });
});

test("briefing metadata uniformly scales and letterboxes the source canvas", () => {
  assert.deepEqual(resolveOriginalBriefingMetadataLayout(1280, 720), {
    scale: 1.5,
    offsetX: 160,
    offsetY: 0,
    title: {
      rect: { x: 442, y: 97.5, width: 417, height: 45 },
      x: 442,
      centerY: 120,
    },
    objective: {
      rect: { x: 442, y: 435, width: 417, height: 129 },
      x: 442,
      firstStringCenterY: 466.5,
      secondStringCenterY: 531,
      maxWidth: 417,
    },
  });
});

test("briefing metadata rejects invalid viewport dimensions", () => {
  assert.throws(() => resolveOriginalBriefingMetadataLayout(0, 480), /viewportWidth/);
  assert.throws(() => resolveOriginalBriefingMetadataLayout(640, Number.NaN), /viewportHeight/);
});
