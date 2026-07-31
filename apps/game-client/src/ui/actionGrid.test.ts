import test from "node:test";
import assert from "node:assert/strict";
import { getActionSlots, resolveActionGridSlotRects, resolveActionIconVisual } from "./actionGrid";
import { IMJINROK_SOURCE_COMMAND_ICON_PROFILE, ORIGINAL_COMMAND_ICON_ASSETS } from "./sourceFogAndCommandAssets";

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

test("generic action grids retain glyph fallback without an opted-in source profile", () => {
  const slots = getActionSlots([{ id: "unit", kind: "villager", construction: false }], null);
  const move = slots.find(({ actionId }) => actionId === "move");
  assert.equal(move?.sourceIcon, undefined);
  assert.deepEqual(resolveActionIconVisual(move!), { kind: "glyph", glyph: "M" });
});

test("completed buildings expose demolition while busy and demolishing buildings fail closed", () => {
  const completed = getActionSlots([{ id: "barracks", kind: "barracks" }], null)
    .find(({ actionId }) => actionId === "demolish");
  assert.deepEqual(completed, {
    actionId: "demolish",
    icon: "D",
    hotkey: "D",
    label: "해체",
    enabled: true,
  });

  const sourceBound = getActionSlots(
    [{ id: "barracks", kind: "barracks" }],
    null,
    IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
  ).find(({ actionId }) => actionId === "demolish");
  assert.deepEqual(sourceBound?.sourceIcon, {
    ...ORIGINAL_COMMAND_ICON_ASSETS.find((asset) => asset.sourceFrameIndex === 13)!,
    sourceActionWord: 13,
    sourceLabel: "해체",
    evidenceStatus: "exact-source-control-binding",
  });

  const busy = getActionSlots([{
    id: "barracks",
    kind: "barracks",
    productionQueue: [{ id: "train", unit: "swordsman", remainingTicks: 1, totalTicks: 2 }],
  }], null).find(({ actionId }) => actionId === "demolish");
  assert.equal(busy?.enabled, false);
  assert.equal(busy?.disabledReason, "진행중");

  const demolishing = getActionSlots([{
    id: "barracks",
    kind: "barracks",
    demolition: { progress: 48, phase: 4 },
  }], null);
  assert.equal(demolishing.filter(({ actionId }) => actionId !== undefined).length, 1);
  assert.deepEqual(demolishing[0], {
    actionId: "demolish",
    icon: "D",
    hotkey: "D",
    label: "해체",
    enabled: false,
    disabledReason: "해체중",
  });
});

test("the Imjinrok profile supplies its source-backed bindings without changing the 4×3 grid", () => {
  const slots = getActionSlots(
    [{ id: "unit", kind: "villager", construction: false }],
    null,
    IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
  );

  assert.equal(slots.length, 12);
  assert.deepEqual(
    slots
      .filter(({ sourceIcon }) => sourceIcon)
      .map(({ actionId, sourceIcon }) => [actionId, sourceIcon?.sourceFrameIndex, sourceIcon?.evidenceStatus]),
    [
      ["move", 6, "exact-source-control-binding"],
      ["build", 16, "source-backed-adaptation"],
      ["stop", 43, "exact-source-control-binding"],
      ["attack-move", 4, "source-backed-adaptation"],
      ["patrol", 10, "exact-source-control-binding"],
      ["repair", 12, "exact-source-control-binding"],
      ["hold", 39, "exact-source-control-binding"],
    ],
  );
});

test("the K01 source profile preserves supported unbound action availability and glyph behavior", () => {
  const k01Slots = getActionSlots(
    [{ id: "unit", kind: "villager", construction: false }],
    null,
    IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
  );
  const gather = k01Slots.find(({ actionId }) => actionId === "gather");

  assert.deepEqual(gather, {
    actionId: "gather",
    icon: "G",
    hotkey: "G",
    label: "채집",
    enabled: true,
  });
  assert.deepEqual(resolveActionIconVisual(gather!), {
    kind: "glyph",
    glyph: "G",
  });
});

test("placeholder packs alter only an unbound action's visual, never its availability", () => {
  const strictPresentationProfile = {
    ...IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
    unboundActionPolicy: "disabled-placeholder" as const,
  };
  const gather = getActionSlots(
    [{ id: "unit", kind: "villager", construction: false }],
    null,
    strictPresentationProfile,
  ).find(({ actionId }) => actionId === "gather");

  assert.deepEqual(gather, {
    actionId: "gather",
    sourceIconPlaceholder: "unconfirmed-source-frame",
    icon: "?",
    hotkey: "G",
    label: "채집",
    enabled: true,
  });
  assert.deepEqual(resolveActionIconVisual(gather!), {
    kind: "placeholder",
    glyph: "?",
  });
});

test("no-selection K01 grid exposes the source-bound magic auto-use toggle in slot zero", () => {
  const disabled = getActionSlots([], null, IMJINROK_SOURCE_COMMAND_ICON_PROFILE, { playerId: "p1", enabled: false });
  const enabled = getActionSlots([], null, IMJINROK_SOURCE_COMMAND_ICON_PROFILE, { playerId: "p1", enabled: true });

  assert.equal(disabled.length, 12);
  assert.deepEqual(disabled[0], {
    globalAction: { type: "toggle-magic-auto-use", enabled: true },
    sourceIcon: {
      ...ORIGINAL_COMMAND_ICON_ASSETS.find((asset) => asset.sourceFrameIndex === 27)!,
      sourceActionWord: 61,
      sourceLabel: "자동마법설정",
      evidenceStatus: "exact-source-control-binding",
    },
    icon: "✦",
    hotkey: "",
    label: "자동마법설정",
    enabled: true,
  });
  assert.equal(enabled[0]?.label, "자동마법해제");
  assert.equal(enabled[0]?.sourceIcon?.sourceActionWord, 62);
  assert.equal(enabled[0]?.sourceIcon?.sourceFrameIndex, 26);
  assert.equal(enabled[0]?.sourceIcon?.evidenceStatus, "exact-source-control-binding");
  assert.deepEqual(disabled.slice(1), Array.from({ length: 11 }, () => ({ icon: "", hotkey: "", label: "", enabled: false })));
});

test("magic auto-use keeps glyph fallback outside the opted-in K01 source profile and never alters selected-unit slots", () => {
  const generic = getActionSlots([], null, undefined, { playerId: "mod-player", enabled: false });
  const selectedWithoutState = getActionSlots([{ id: "unit", kind: "villager", construction: false }], null);
  const selectedWithState = getActionSlots(
    [{ id: "unit", kind: "villager", construction: false }],
    null,
    IMJINROK_SOURCE_COMMAND_ICON_PROFILE,
    { playerId: "p1", enabled: true },
  );

  assert.equal(generic[0]?.sourceIcon, undefined);
  assert.deepEqual(resolveActionIconVisual(generic[0]!), { kind: "glyph", glyph: "✦" });
  assert.deepEqual(
    selectedWithState.map(({ actionId, label }) => [actionId, label]),
    getActionSlots([{ id: "unit", kind: "villager", construction: false }], null, IMJINROK_SOURCE_COMMAND_ICON_PROFILE)
      .map(({ actionId, label }) => [actionId, label]),
  );
  assert.equal(selectedWithoutState[0]?.globalAction, undefined);
});
