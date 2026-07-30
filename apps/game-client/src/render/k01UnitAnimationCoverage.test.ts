import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTheme,
  K01_UNIT_ANIMATION_EVIDENCE,
  type EntityVisual,
} from "@shared";
import { getEntityAnimationStateKey, type EntityAnimationStateUnit } from "./entityAnimationState.js";

const unit = (overrides: Partial<EntityAnimationStateUnit> = {}): EntityAnimationStateUnit => ({
  health: { current: 100, max: 100 },
  ...overrides,
});

test("K01 runtime state selection reaches every non-quarantined source-backed idle, move, and attack clip", () => {
  const states: Record<"idle" | "move" | "attack", EntityAnimationStateUnit> = {
    idle: unit(),
    move: unit({ movementTarget: { x: 1, y: 1 } }),
    attack: unit({ attackCooldownTicks: 1 }),
  };

  for (const evidence of K01_UNIT_ANIMATION_EVIDENCE) {
    const visual = defaultTheme.visuals[defaultTheme.entityBindings[evidence.kind]] as EntityVisual;

    for (const stateKey of evidence.runtimeStates) {
      assert.equal(
        getEntityAnimationStateKey(states[stateKey], visual),
        stateKey,
        `${evidence.kind} should select its source-backed ${stateKey} clip`,
      );
    }
  }
});
