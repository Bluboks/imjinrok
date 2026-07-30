import assert from "node:assert/strict";
import test from "node:test";
import { shouldPublishSerializableView } from "./serializableViewPublication.js";

test("serializable HUD publication always publishes the first view and suppresses an identical repeat", () => {
  const first = shouldPublishSerializableView(null, { resources: { food: 30 }, selection: ["unit-1"] });
  const repeat = shouldPublishSerializableView(first.signature, { resources: { food: 30 }, selection: ["unit-1"] });

  assert.equal(first.shouldPublish, true);
  assert.equal(repeat.shouldPublish, false);
});

test("serializable HUD publication observes every rendered economy, selection, queue, and automation field", () => {
  const view = {
    resources: { food: 30, wood: 20, gold: 10, stone: 5 },
    population: { used: 4, cap: 10 },
    research: { completed: ["research-1"], pending: ["research-2"] },
    selection: [{
      id: "unit-1",
      hp: 50,
      mana: 10,
      currentOrder: { type: "move", target: { x: 3, y: 4 } },
      portrait: { textureKey: "portrait-a", mirrorX: false },
      construction: { remainingTicks: 8, totalTicks: 10 },
      productionQueue: [{ id: "queue-1", unit: "worker", remainingTicks: 4, totalTicks: 8 }],
      researchQueue: [{ id: "research-queue-1", research: "research-2", remainingTicks: 5, totalTicks: 8 }],
    }, { id: "unit-2", hp: 60, mana: 0 }],
    magicAutoUse: false,
  };
  const baseline = shouldPublishSerializableView(null, view);
  const variations = [
    { ...view, resources: { ...view.resources, food: 31 } },
    { ...view, population: { ...view.population, used: 5 } },
    { ...view, research: { ...view.research, completed: ["research-3"] } },
    { ...view, selection: [...view.selection].reverse() },
    { ...view, selection: [{ ...view.selection[0]!, hp: 49 }, view.selection[1]! ] },
    { ...view, selection: [{ ...view.selection[0]!, mana: 9 }, view.selection[1]! ] },
    { ...view, selection: [{ ...view.selection[0]!, currentOrder: { type: "move", target: { x: 4, y: 4 } } }, view.selection[1]! ] },
    { ...view, selection: [{ ...view.selection[0]!, portrait: { textureKey: "portrait-b", mirrorX: false } }, view.selection[1]! ] },
    { ...view, selection: [{ ...view.selection[0]!, construction: { remainingTicks: 7, totalTicks: 10 } }, view.selection[1]! ] },
    { ...view, selection: [{ ...view.selection[0]!, productionQueue: [{ id: "queue-1", unit: "worker", remainingTicks: 3, totalTicks: 8 }] }, view.selection[1]! ] },
    { ...view, selection: [{ ...view.selection[0]!, researchQueue: [{ id: "research-queue-1", research: "research-2", remainingTicks: 4, totalTicks: 8 }] }, view.selection[1]! ] },
    { ...view, magicAutoUse: true },
  ];

  for (const variation of variations) {
    assert.equal(shouldPublishSerializableView(baseline.signature, variation).shouldPublish, true);
  }
});
