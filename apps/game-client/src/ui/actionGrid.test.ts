import test from "node:test";
import assert from "node:assert/strict";
import { getActionSlots, resolveActionGridSlotRects, resolveActionIconVisual } from "./actionGrid";
import { ORIGINAL_COMMAND_ICON_ASSETS } from "./sourceFogAndCommandAssets";

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

test("current product actions have no unproven original icon mapping", () => {
  const slots = getActionSlots([{ id: "unit", kind: "villager", construction: false }], null);
  const move = slots.find(({ actionId }) => actionId === "move");
  assert.equal(move?.sourceIcon, undefined);
  assert.deepEqual(resolveActionIconVisual(move!), { kind: "glyph", glyph: "M" });
});
