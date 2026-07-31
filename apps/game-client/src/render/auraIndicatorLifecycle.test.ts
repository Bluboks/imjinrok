import assert from "node:assert/strict";
import test from "node:test";

import { reconcileAuraIndicator, type AuraIndicatorHandle } from "./auraIndicatorLifecycle.js";

interface TestIndicator extends AuraIndicatorHandle {
  redraws: number;
  destroyed: number;
}

const presentation = { indicatorId: "mod:leader-mark", color: 0x7fd0a1 };

test("aura indicator is lazy, reused while present, and destroyed when its presentation disappears", () => {
  let creates = 0;
  const create = (): TestIndicator => {
    creates += 1;
    return {
      redraws: 0,
      destroyed: 0,
      destroy() {
        this.destroyed += 1;
      },
    };
  };
  const redraw = (indicator: TestIndicator) => {
    indicator.redraws += 1;
  };

  let indicator = reconcileAuraIndicator(undefined, null, create, redraw);
  assert.equal(indicator, undefined);
  assert.equal(creates, 0, "units without an aura presentation allocate no indicator");

  indicator = reconcileAuraIndicator(indicator, presentation, create, redraw);
  const created = indicator;
  assert.ok(created);
  assert.equal(creates, 1);
  assert.equal(created.redraws, 1);

  indicator = reconcileAuraIndicator(indicator, presentation, create, redraw);
  assert.equal(indicator, created, "a stable presentation reuses its graphics handle");
  assert.equal(created.redraws, 2);

  indicator = reconcileAuraIndicator(indicator, null, create, redraw);
  assert.equal(indicator, undefined);
  assert.equal(created.destroyed, 1);
});
