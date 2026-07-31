import assert from "node:assert/strict";
import test from "node:test";

import {
  PRE_GAME_KOREAN_FONT_FAMILY,
  normalizePreGameDevicePixelRatio,
  resolvePreGameTextResolution,
  whenPreGameTypographyReady,
} from "./preGameTypography.js";

test("pre-game typography uses a Korean sans family with platform fallbacks", () => {
  assert.equal(
    PRE_GAME_KOREAN_FONT_FAMILY,
    '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  );
});

test("pre-game text resolution caps density and accounts for presentation scale", () => {
  assert.equal(normalizePreGameDevicePixelRatio(0.75), 1);
  assert.equal(normalizePreGameDevicePixelRatio(1.5), 1.5);
  assert.equal(normalizePreGameDevicePixelRatio(3), 2);
  assert.equal(normalizePreGameDevicePixelRatio(Number.NaN), 1);
  assert.equal(resolvePreGameTextResolution(1, 1.25), 1.25);
  assert.equal(resolvePreGameTextResolution(2, 1.5), 3);
  assert.equal(resolvePreGameTextResolution(2, 4), 4);
  assert.equal(resolvePreGameTextResolution(Number.POSITIVE_INFINITY, 2), 2);
});

test("font readiness redraws once and cleanup suppresses an inactive scene redraw", async () => {
  let redrawCount = 0;
  const unsubscribe = whenPreGameTypographyReady(
    () => {
      redrawCount += 1;
    },
    { fonts: { ready: Promise.resolve() } },
  );

  await Promise.resolve();
  assert.equal(redrawCount, 1);
  unsubscribe();

  let resolveFonts: (() => void) | undefined;
  const pendingFonts = new Promise<void>((resolve) => {
    resolveFonts = resolve;
  });
  const unsubscribePending = whenPreGameTypographyReady(
    () => {
      redrawCount += 1;
    },
    { fonts: { ready: pendingFonts } },
  );

  unsubscribePending();
  resolveFonts?.();
  await pendingFonts;
  await Promise.resolve();
  assert.equal(redrawCount, 1);
});

test("font readiness registration is safe without browser document fonts", () => {
  let redrawCount = 0;
  const unsubscribe = whenPreGameTypographyReady(
    () => {
      redrawCount += 1;
    },
    undefined,
  );

  unsubscribe();
  assert.equal(redrawCount, 0);
});
