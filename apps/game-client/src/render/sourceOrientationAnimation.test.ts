import assert from "node:assert/strict";
import test from "node:test";
import { defaultTheme, type EntityVisual, type Facing } from "@shared";
import { selectTurtleTankFrame, TURTLE_TANK_INTERMEDIATE_TURN_PROFILES } from "../../../../tools/imjinrok/extract-k01-turtle-tank-animation-pilot.mjs";
import {
  resolveEntityAnimationClip,
  resolveEntityAnimationSelection,
  type SourceOrientationAnimationState,
} from "./sourceOrientationAnimation.js";

const turtleVisual = defaultTheme.visuals[defaultTheme.entityBindings["japanese-turtle-tank"]] as EntityVisual;
const turtleProfileId = "k01-japanese-turtle-tank-raw16";

const sourceOrientation = (
  overrides: Partial<SourceOrientationAnimationState> = {},
): SourceOrientationAnimationState => ({
  profileId: turtleProfileId,
  movementRaw16: 1000,
  attackGrid8: "s",
  ...overrides,
});

test("turtle movement clips match every statically extracted intermediate turn vector", () => {
  for (const profile of TURTLE_TANK_INTERMEDIATE_TURN_PROFILES) {
    const resolved = resolveEntityAnimationClip(
      turtleVisual,
      "move",
      "se",
      sourceOrientation({ movementRaw16: profile.direction, attackGrid8: "e" }),
    );
    const extracted = Array.from({ length: 8 }, (_value, phase) =>
      selectTurtleTankFrame({ state: 1, direction: profile.direction, phase }),
    );

    assert.equal(resolved?.source, "source-orientation");
    assert.equal(resolved?.clipKey, `japanese-turtle-tank:move:source:${turtleProfileId}:${profile.direction}`);
    assert.deepEqual(
      resolved?.clip.frames.map(({ fileName }) => fileName),
      extracted.map(({ frameIndex }) => `ghosttankj_${String(frameIndex).padStart(4, "0")}.png`),
    );
    assert.equal(resolved?.clip.mirrorX ?? false, extracted[0]?.mirrorX ?? false);
    assert.equal(resolved?.clip.fps, turtleVisual.states.move?.clips.s?.fps);
    assert.equal(resolved?.clip.loop, turtleVisual.states.move?.clips.s?.loop);
  }
});

test("grid landings and unsupported source directions retain ordinary directional clips", () => {
  const gridLanding = resolveEntityAnimationClip(
    turtleVisual,
    "move",
    "s",
    sourceOrientation({ movementRaw16: 65, attackGrid8: "se" }),
  );
  assert.equal(gridLanding?.source, "directional");
  assert.equal(gridLanding?.clip, turtleVisual.states.move?.clips.se);

  const unknownRaw = resolveEntityAnimationClip(
    turtleVisual,
    "walk",
    "s",
    sourceOrientation({ movementRaw16: 999, attackGrid8: "w" }),
  );
  assert.equal(unknownRaw?.source, "directional");
  assert.equal(unknownRaw?.clip, turtleVisual.states.walk?.clips.w);

  const profileMismatch = resolveEntityAnimationClip(
    turtleVisual,
    "move",
    "s",
    sourceOrientation({ profileId: "mod-unknown-profile", movementRaw16: 1000, attackGrid8: "e" }),
  );
  assert.equal(profileMismatch?.source, "directional");
  assert.equal(profileMismatch?.clip, turtleVisual.states.move?.clips.e);
});

test("idle and attack retain the source state last grid direction", () => {
  const orientation = sourceOrientation({ movementRaw16: 1000, attackGrid8: "w" });
  const idle = resolveEntityAnimationClip(turtleVisual, "idle", "s", orientation);
  const attack = resolveEntityAnimationClip(turtleVisual, "attack", "s", orientation);

  assert.equal(idle?.source, "directional");
  assert.equal(idle?.clip, turtleVisual.states.idle?.clips.w);
  assert.equal(attack?.source, "directional");
  assert.equal(attack?.clip, turtleVisual.states.attack?.clips.w);
});

test("a mod-defined profile can opt its own movement state into raw clips", () => {
  const rawClip = { frames: [{ textureKey: "mod-raw", frameName: "turn" }], fps: 9, loop: false, mirrorX: true };
  const directionalClip = { frames: [{ textureKey: "mod-grid" }], fps: 4, loop: true };
  const visual: EntityVisual = {
    id: "mod-unit",
    kind: "entity",
    assetPath: "entities/mod-unit",
    render: { srcPxPerWu: 32 },
    defaults: { size: { w: 32, h: 32 }, pivot: { anchor: { x: 16, y: 16 } } },
    states: {
      move: {
        clips: { s: directionalClip },
        sourceOrientationClips: { "mod-turn-ring": { 42: rawClip } },
      },
    },
  };
  const resolved = resolveEntityAnimationClip(
    visual,
    "move",
    "s" as Facing,
    { profileId: "mod-turn-ring", movementRaw16: 42, attackGrid8: "s" },
  );

  assert.deepEqual(resolved, {
    clip: rawClip,
    clipKey: "mod-unit:move:source:mod-turn-ring:42",
    source: "source-orientation",
  });
});

test("scene selection bridge preserves ordinary output and changes its tracker key for a raw turn", () => {
  const ordinary = resolveEntityAnimationSelection(turtleVisual, "move", "se");
  assert.deepEqual(ordinary, {
    key: "japanese-turtle-tank:move:se",
    clip: turtleVisual.states.move?.clips.se,
  });

  const rawTurn = resolveEntityAnimationSelection(
    turtleVisual,
    "move",
    "se",
    sourceOrientation({ movementRaw16: 1003, attackGrid8: "w" }),
  );
  assert.equal(rawTurn?.key, `japanese-turtle-tank:move:source:${turtleProfileId}:1003`);
  assert.equal(
    rawTurn?.clip,
    turtleVisual.states.move?.sourceOrientationClips?.[turtleProfileId]?.[1003],
  );
});
