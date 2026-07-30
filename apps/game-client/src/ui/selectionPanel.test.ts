import assert from "node:assert/strict";
import test from "node:test";
import { getSelectionPortraitFit } from "./selectionPortrait.js";

test("selection portraits are contained without distortion", () => {
  assert.deepEqual(getSelectionPortraitFit(200, 100, 80), { width: 80, height: 40 });
  assert.deepEqual(getSelectionPortraitFit(100, 200, 80), { width: 40, height: 80 });
  assert.deepEqual(getSelectionPortraitFit(120, 120, 80), { width: 80, height: 80 });
});

test("selection portrait fitting rejects invalid source dimensions", () => {
  assert.equal(getSelectionPortraitFit(0, 100, 80), null);
  assert.equal(getSelectionPortraitFit(100, Number.NaN, 80), null);
  assert.equal(getSelectionPortraitFit(100, 100, -1), null);
});
