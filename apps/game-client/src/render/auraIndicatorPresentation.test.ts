import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuraIndicatorPresentation } from "./auraIndicatorPresentation.js";

test("aura indicator presentation requires an explicit opt-in indicator", () => {
  assert.equal(resolveAuraIndicatorPresentation({
    support: { auraDefinitionId: "mod:support", providerUnitId: "hero", attackDamageMultiplier: 1.2 },
  }), null);
});

test("aura indicator presentation has stable stacking-key precedence and color", () => {
  assert.deepEqual(resolveAuraIndicatorPresentation({
    zeta: { auraDefinitionId: "mod:zeta", providerUnitId: "zeta", attackDamageMultiplier: 1.2, indicatorId: "mod:zeta-mark" },
    alpha: { auraDefinitionId: "mod:alpha", providerUnitId: "alpha", attackDamageMultiplier: 1.1, indicatorId: "mod:alpha-mark" },
  }), { indicatorId: "mod:alpha-mark", color: 16639425 });
});
