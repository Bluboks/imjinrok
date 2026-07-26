import test from "node:test";
import assert from "node:assert/strict";
import { createFormationTargets } from "./formation.js";

test("formation targets produce unique spread points for larger control groups", () => {
  const targets = createFormationTargets({ x: 20, y: 20 }, 24, { width: 64, height: 64 });
  const uniqueTargets = new Set(targets.map((target) => `${target.x},${target.y}`));

  assert.equal(targets.length, 24);
  assert.equal(uniqueTargets.size, 24);
  assert.deepEqual(targets[0], { x: 20, y: 20 });
});

test("formation targets stay in map bounds near edges", () => {
  const targets = createFormationTargets({ x: -3.4, y: 100.2 }, 18, { width: 8, height: 8 });
  const uniqueTargets = new Set(targets.map((target) => `${target.x},${target.y}`));

  assert.equal(targets.length, 18);
  assert.equal(uniqueTargets.size, 18);
  assert.ok(targets.every((target) => target.x >= 0 && target.x < 8 && target.y >= 0 && target.y < 8));
  assert.deepEqual(targets[0], { x: 0, y: 7 });
});

test("formation targets handle empty groups and invalid bounds", () => {
  assert.deepEqual(createFormationTargets({ x: 3, y: 3 }, 0, { width: 8, height: 8 }), []);
  assert.deepEqual(createFormationTargets({ x: 3, y: 3 }, 4, { width: 0, height: 8 }), []);
  assert.deepEqual(createFormationTargets({ x: 3, y: 3 }, 4, { width: 8, height: -1 }), []);
});
