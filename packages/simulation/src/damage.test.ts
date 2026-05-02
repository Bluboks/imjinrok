import test from "node:test";
import assert from "node:assert/strict";
import { createBlankMap } from "../../shared/src/index.js";
import { createInitialWorldState, resolveDamageAmount } from "./index.js";

test("clear weather fire damage is unchanged", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);

  assert.equal(resolveDamageAmount({ amount: 10, type: "fire" }, state), 10);
});

test("rain fire damage uses configured multiplier", () => {
  const map = createBlankMap();
  map.environment = {
    weather: "rain",
    rain: { fireDamageMultiplier: 0.5 },
  };
  const state = createInitialWorldState(map, ["p1"]);

  assert.equal(resolveDamageAmount({ amount: 10, type: "fire" }, state), 5);
});

test("rain non-fire damage is unchanged", () => {
  const map = createBlankMap();
  map.environment = {
    weather: "rain",
    rain: { fireDamageMultiplier: 0.5 },
  };
  const state = createInitialWorldState(map, ["p1"]);

  assert.equal(resolveDamageAmount({ amount: 10, type: "physical" }, state), 10);
});

test("missing rain fire multiplier defaults to one", () => {
  const map = createBlankMap();
  map.environment = { weather: "rain" };
  const state = createInitialWorldState(map, ["p1"]);

  assert.equal(resolveDamageAmount({ amount: 10, type: "fire" }, state), 10);
});

test("invalid damage amounts and rain multipliers clamp deterministically", () => {
  const map = createBlankMap();
  map.environment = {
    weather: "rain",
    rain: { fireDamageMultiplier: -1 },
  };
  const state = createInitialWorldState(map, ["p1"]);

  assert.equal(resolveDamageAmount({ amount: -10, type: "fire" }, state), 0);
  assert.equal(resolveDamageAmount({ amount: Number.NaN, type: "fire" }, state), 0);
  assert.equal(resolveDamageAmount({ amount: 10, type: "fire" }, state), 0);

  state.map.environment!.rain!.fireDamageMultiplier = Number.NaN;
  assert.equal(resolveDamageAmount({ amount: 10, type: "fire" }, state), 10);
});
