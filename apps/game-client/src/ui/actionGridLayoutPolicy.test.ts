import test from "node:test";
import assert from "node:assert/strict";
import { resolveActionGridSlotRects } from "./actionGrid";
import { resolveProductActionGridLayoutForScenario } from "./actionGridLayoutPolicy";

test("keeps K01 on the intentional 12-slot adaptive product grid", () => {
  const layout = resolveProductActionGridLayoutForScenario("imjinrok-k01-opening");

  assert.deepEqual(layout, { columns: 4, rows: 3, slotCount: 12 });
  assert.equal(resolveActionGridSlotRects({ x: 100, y: 200, width: 360, height: 178 }, layout).length, 12);
});
