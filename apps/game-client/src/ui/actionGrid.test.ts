import test from "node:test";
import assert from "node:assert/strict";
import { getActionSlots, resolveActionGridSlotRects } from "./actionGrid";
import { resolveOriginalGameplayCommandGridLayout } from "../originalGameplayCommandGridLayout";

test("keeps the generic command grid's twelve-slot default when no original layout is supplied", () => {
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

test("uses exactly the nine resolved original rectangles when opted in", () => {
  const originalLayout = resolveOriginalGameplayCommandGridLayout(640, 480);

  assert.deepEqual(
    resolveActionGridSlotRects({ x: 100, y: 200, width: 360, height: 178 }, originalLayout),
    originalLayout.slots,
  );
});
