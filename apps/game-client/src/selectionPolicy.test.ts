import assert from "node:assert/strict";
import test from "node:test";

import { isSameUnitSelectionDoubleClick, resolveSelectionPolicy } from "./selectionPolicy.js";

test("visible local entities are inspectable, selectable, and commandable", () => {
  assert.deepEqual(resolveSelectionPolicy({ relationship: "local", visible: true }), {
    inspectable: true,
    selectable: true,
    commandable: true,
  });
});

test("visible allied and enemy entities are inspectable/selectable but not commandable", () => {
  for (const relationship of ["allied", "enemy"] as const) {
    assert.deepEqual(resolveSelectionPolicy({ relationship, visible: true }), {
      inspectable: true,
      selectable: true,
      commandable: false,
    });
  }
});

test("fog-hidden entities are not inspectable, selectable, or commandable", () => {
  for (const relationship of ["local", "allied", "enemy"] as const) {
    assert.deepEqual(resolveSelectionPolicy({ relationship, visible: false }), {
      inspectable: false,
      selectable: false,
      commandable: false,
    });
  }
});

test("same-kind clicks from different owners are not a double-click", () => {
  const local = { kind: "swordsman", playerId: "local", time: 100 };
  assert.equal(isSameUnitSelectionDoubleClick(local, { kind: "swordsman", playerId: "enemy" }, 180, 250), false);
  assert.equal(isSameUnitSelectionDoubleClick(local, { kind: "swordsman", playerId: "local" }, 180, 250), true);
});
