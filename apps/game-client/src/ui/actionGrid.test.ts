import test from "node:test";
import assert from "node:assert/strict";
import { getActionSlots, resolveActionGridSlotRects, resolveActionIconVisual } from "./actionGrid";
import { IMJINROK_SOURCE_COMMAND_ICON_PROFILE, ORIGINAL_COMMAND_ICON_ASSETS } from "./sourceFogAndCommandAssets";

test("keeps the generic command grid's twelve-slot default", () => {
  assert.equal(getActionSlots([], null).length, 12);
  assert.deepEqual(resolveActionGridSlotRects({ x: 100, y: 200, width: 360, height: 178 }), [
    { x: 114, y: 246, width: 77, height: 34 },
    { x: 199, y: 246, width: 77, height: 34 },
    { x: 284, y: 246, width: 77, height: 34 },
    { x: 369, y: 246, width: 77, height: 34 },
    { x: 114, y: 288, width: 77, height: 34 },
    { x: 199, y: 288, width: 77, height: 34 },
    { x: 284, y: 288, width: 77, height: 34 },
    { x: 369, y: 288, width: 77, height: 34 },
    { x: 114, y: 330, width: 77, height: 34 },
    { x: 199, y: 330, width: 77, height: 34 },
    { x: 284, y: 330, width: 77, height: 34 },
    { x: 369, y: 330, width: 77, height: 34 },
  ]);
});

test("uses a loaded source icon record when supplied and otherwise retains glyph fallback", () => {
  assert.deepEqual(resolveActionIconVisual({ icon: "M", sourceIcon: ORIGINAL_COMMAND_ICON_ASSETS[0] }), {
    kind: "source",
    icon: ORIGINAL_COMMAND_ICON_ASSETS[0],
  });
  assert.deepEqual(resolveActionIconVisual({ icon: "M" }), { kind: "glyph", glyph: "M" });
});

test("generic action grids retain glyph fallback without an opted-in source profile", () => {
  const slots = getActionSlots([{ id: "unit", kind: "villager", construction: false }], null);
  const move = slots.find(({ actionId }) => actionId === "move");
  assert.equal(move?.sourceIcon, undefined);
  assert.deepEqual(resolveActionIconVisual(move!), { kind: "glyph", glyph: "M" });
});

test("the Imjinrok profile supplies its source-backed bindings without changing the 4×3 grid", () => {
  const slots = getActionSlots(
    [{ id: "unit", kind: "villager", construction: false }],
    null,
    IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
  );

  assert.equal(slots.length, 12);
  assert.deepEqual(
    slots
      .filter(({ sourceIcon }) => sourceIcon)
      .map(({ actionId, sourceIcon }) => [actionId, sourceIcon?.sourceFrameIndex, sourceIcon?.evidenceStatus]),
    [
      ["move", 6, "exact-source-control-binding"],
      ["build", 16, "source-backed-adaptation"],
      ["stop", 43, "exact-source-control-binding"],
      ["attack-move", 4, "source-backed-adaptation"],
      ["patrol", 10, "exact-source-control-binding"],
      ["repair", 12, "exact-source-control-binding"],
      ["hold", 39, "exact-source-control-binding"],
    ],
  );
});
