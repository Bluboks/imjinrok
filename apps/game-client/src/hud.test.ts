import assert from "node:assert/strict";
import test from "node:test";
import type { UnitState } from "@simulation";
import { createMagicAutoUseView, createMinimapAvailabilityView, toSelectedEntityView } from "./hud.js";

test("selected entity views clone serializable portrait render metadata", () => {
  const unit: UnitState = {
    id: "unit-1",
    playerId: "local-player",
    kind: "villager",
    position: { x: 4, y: 7 },
    movementSpeed: 1,
    health: { current: 40, max: 40 },
    mana: { current: 0, max: 0 },
  };
  const portrait = { textureKey: "theme_entity_villager", frameName: "idle", mirrorX: true };
  const view = toSelectedEntityView(unit, portrait);

  portrait.textureKey = "mutated";
  portrait.frameName = "mutated";
  portrait.mirrorX = false;

  assert.deepEqual(view.portrait, {
    textureKey: "theme_entity_villager",
    frameName: "idle",
    mirrorX: true,
  });
});

test("selected entity views publish serializable demolition progress", () => {
  const unit: UnitState = {
    id: "building-1",
    playerId: "local-player",
    kind: "barracks",
    position: { x: 4, y: 7 },
    movementSpeed: 0,
    health: { current: 480, max: 1_200 },
    mana: { current: 0, max: 0 },
    demolition: { progress: 48, phase: 4 },
  };

  assert.deepEqual(toSelectedEntityView(unit).demolition, { progress: 48, phase: 4 });
});

test("magic auto-use HUD views initialize legacy or missing player state as disabled", () => {
  assert.deepEqual(createMagicAutoUseView("p1", undefined), { playerId: "p1", enabled: false });
  assert.deepEqual(createMagicAutoUseView("p1", false), { playerId: "p1", enabled: false });
  assert.deepEqual(createMagicAutoUseView("p1", true), { playerId: "p1", enabled: true });
});

test("minimap availability HUD views expose a typed enabled state", () => {
  assert.deepEqual(createMinimapAvailabilityView(false), { enabled: false });
  assert.deepEqual(createMinimapAvailabilityView(true), { enabled: true });
});
