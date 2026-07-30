import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTheme,
  K01_BUILDING_VISUAL_EVIDENCE,
  K01_UNIT_ANIMATION_EVIDENCE,
  type EntityVisual,
  type Facing,
} from "@shared";
import { getEntityAnimationStateKey, type EntityAnimationStateUnit } from "./entityAnimationState.js";
import { resolveEntityAnimationSelection } from "./sourceOrientationAnimation.js";
import { getGroundContactPlacement } from "./visualScale.js";

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

const FACINGS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"] as const satisfies readonly Facing[];
const TURTLE_GRID_RAW_DIRECTION_BY_FACING = {
  s: 1,
  sw: 5,
  w: 4,
  nw: 20,
  n: 16,
  ne: 80,
  e: 64,
  se: 65,
} as const satisfies Record<Facing, number>;
const GROUND_CONTACT = { x: 191, y: 307 } as const;

test("K01 runtime routing resolves every guarded clip without fallback or frame-driven ground-contact drift", () => {
  const states: Record<"idle" | "move" | "attack", EntityAnimationStateUnit> = {
    idle: unit(),
    move: unit({ movementTarget: { x: 1, y: 1 } }),
    attack: unit({ attackCooldownTicks: 1 }),
  };

  for (const evidence of K01_UNIT_ANIMATION_EVIDENCE) {
    const visual = defaultTheme.visuals[defaultTheme.entityBindings[evidence.kind]] as EntityVisual;
    const turtleProfile = evidence.sourceOrientation;

    assert.equal(visual.defaults.pivot.liftPx, undefined, `${evidence.kind} has no source-backed visual lift`);

    for (const stateKey of evidence.runtimeStates) {
      assert.equal(getEntityAnimationStateKey(states[stateKey], visual), stateKey);

      for (const facing of FACINGS) {
        const sourceOrientation = turtleProfile
          ? {
              profileId: turtleProfile.profileId,
              movementRaw16: TURTLE_GRID_RAW_DIRECTION_BY_FACING[facing],
              attackGrid8: facing,
            }
          : undefined;
        const resolved = resolveEntityAnimationSelection(visual, stateKey, facing, sourceOrientation);
        const expected = visual.states[stateKey]?.clips[facing];

        assert.ok(expected, `${evidence.kind}/${stateKey}/${facing} must retain its directional source clip`);
        assert.equal(resolved?.clip, expected, `${evidence.kind}/${stateKey}/${facing} must not fall back to another facing`);

        for (const frame of resolved?.clip.frames ?? []) {
          assert.equal(frame.pivot, undefined, `${evidence.kind}/${stateKey}/${facing} has no recovered per-frame pivot`);
          assert.deepEqual(
            getGroundContactPlacement(visual, frame, GROUND_CONTACT).position,
            GROUND_CONTACT,
            `${evidence.kind}/${stateKey}/${facing} frame placement must preserve UnitState.position ground contact`,
          );
        }
      }
    }

    if (!turtleProfile) {
      continue;
    }

    for (const rawDirection of turtleProfile.rawDirections) {
      const resolved = resolveEntityAnimationSelection(visual, turtleProfile.state, "s", {
        profileId: turtleProfile.profileId,
        movementRaw16: rawDirection,
        attackGrid8: "s",
      });
      const expected = visual.states[turtleProfile.state]?.sourceOrientationClips?.[turtleProfile.profileId]?.[rawDirection];

      assert.equal(resolved?.clip, expected, `${evidence.kind}/raw-${rawDirection} must not fall back to a grid clip`);
      for (const frame of resolved?.clip.frames ?? []) {
        assert.deepEqual(
          getGroundContactPlacement(visual, frame, GROUND_CONTACT).position,
          GROUND_CONTACT,
          `${evidence.kind}/raw-${rawDirection} frame placement must preserve UnitState.position ground contact`,
        );
      }
    }
  }
});

test("K01 opening buildings select their evidenced base frame without moving ground contact", () => {
  for (const evidence of K01_BUILDING_VISUAL_EVIDENCE) {
    const visual = defaultTheme.visuals[defaultTheme.entityBindings[evidence.kind]] as EntityVisual;
    const resolvedState = getEntityAnimationStateKey(unit(), visual);
    const clip = resolvedState ? resolveEntityAnimationSelection(visual, resolvedState, "s")?.clip : null;

    assert.equal(resolvedState, "idle", `${evidence.kind} must select the K01 base-frame adapter`);
    assert.equal(clip, visual.states.idle?.clips.default, `${evidence.kind} must not fall back to another building clip`);
    assert.equal(clip?.frames[0]?.fileName, evidence.defaultFrameFileName);
    assert.equal(visual.defaults.pivot.liftPx, undefined, `${evidence.kind} has no source-backed visual lift`);

    for (const frame of clip?.frames ?? []) {
      assert.equal(frame.pivot, undefined, `${evidence.kind} has no recovered per-frame pivot`);
      assert.deepEqual(
        getGroundContactPlacement(visual, frame, GROUND_CONTACT).position,
        GROUND_CONTACT,
        `${evidence.kind} base frame must preserve UnitState.position ground contact`,
      );
    }
  }
});
