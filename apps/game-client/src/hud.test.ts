import assert from "node:assert/strict";
import test from "node:test";
import type { UnitState } from "@simulation";
import { createMagicAutoUseView, toSelectedEntityView } from "./hud.js";

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

test("magic auto-use HUD views initialize legacy or missing player state as disabled", () => {
  assert.deepEqual(createMagicAutoUseView("p1", undefined), { playerId: "p1", enabled: false });
  assert.deepEqual(createMagicAutoUseView("p1", false), { playerId: "p1", enabled: false });
  assert.deepEqual(createMagicAutoUseView("p1", true), { playerId: "p1", enabled: true });
});
