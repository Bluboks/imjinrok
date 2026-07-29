import test from "node:test";
import assert from "node:assert/strict";
import { createBlankMap } from "../../shared/src/index.js";
import { advanceWorldTick, createInitialWorldState, createPlayerVisibility, getEnvironmentLightLevel, getTileVisibility, TileVisibility, toWorldSnapshot, updatePlayerVisibility } from "./index.js";

test("initial world defaults to clear day environment", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);

  assert.deepEqual(state.environment, {
    weather: "clear",
    timeOfDay01: 0,
    dayPhase: "day",
  });
});

test("no day/night preset keeps environment unchanged as ticks advance", () => {
  const state = createInitialWorldState(createBlankMap({ id: "rain-fixed" }), ["p1"]);
  const initialEnvironment = structuredClone(state.environment);

  for (let i = 0; i < 20; i += 1) {
    advanceWorldTick(state);
  }

  assert.deepEqual(state.environment, initialEnvironment);
});

test("day/night cycle transitions and wraps at expected ticks", () => {
  const map = createBlankMap();
  map.environment = {
    dayNight: {
      cycleTicks: 10,
      nightStartTick: 6,
      dayStartTick: 2,
    },
  };
  const state = createInitialWorldState(map, ["p1"]);

  assert.equal(state.environment.dayPhase, "night");
  assert.equal(state.environment.timeOfDay01, 0);

  advanceWorldTick(state);
  assert.equal(state.environment.dayPhase, "night");
  assert.equal(state.environment.timeOfDay01, 0.1);

  advanceWorldTick(state);
  assert.equal(state.environment.dayPhase, "day");
  assert.equal(state.environment.timeOfDay01, 0.2);

  for (let i = 0; i < 4; i += 1) {
    advanceWorldTick(state);
  }
  assert.equal(state.tick, 6);
  assert.equal(state.environment.dayPhase, "night");
  assert.equal(state.environment.timeOfDay01, 0.6);

  for (let i = 0; i < 4; i += 1) {
    advanceWorldTick(state);
  }
  assert.equal(state.tick, 10);
  assert.equal(state.environment.dayPhase, "night");
  assert.equal(state.environment.timeOfDay01, 0);
});

test("identical worlds advanced equally produce identical environment state", () => {
  const map = createBlankMap();
  map.environment = {
    weather: "rain",
    dayNight: {
      cycleTicks: 12,
      nightStartTick: 3,
      dayStartTick: 9,
    },
  };
  const a = createInitialWorldState(map, ["p1"]);
  const b = createInitialWorldState(structuredClone(map), ["p1"]);

  for (let i = 0; i < 25; i += 1) {
    advanceWorldTick(a);
    advanceWorldTick(b);
  }

  assert.deepEqual(a.environment, b.environment);
});

test("opt-in light curves expose deterministic dawn, day, dusk, and night output", () => {
  const map = createBlankMap();
  map.environment = {
    dayNight: {
      cycleTicks: 16,
      nightStartTick: 12,
      dayStartTick: 4,
      nightSightMultiplier: 0.5,
      lightCurve: [
        { tick: 0, phase: "night", lightLevel01: 0.25 },
        { tick: 4, phase: "dawn", lightLevel01: 0.5 },
        { tick: 6, phase: "day", lightLevel01: 1 },
        { tick: 10, phase: "dusk", lightLevel01: 0.5 },
        { tick: 12, phase: "night", lightLevel01: 0.25 },
      ],
    },
  };
  const state = createInitialWorldState(map, ["p1"]);

  assert.deepEqual(pickLight(state), { phase: "night", light: 0.25 });
  advanceTicks(state, 4);
  assert.deepEqual(pickLight(state), { phase: "dawn", light: 0.5 });
  advanceTicks(state, 2);
  assert.deepEqual(pickLight(state), { phase: "day", light: 1 });
  advanceTicks(state, 4);
  assert.deepEqual(pickLight(state), { phase: "dusk", light: 0.5 });
  advanceTicks(state, 2);
  assert.deepEqual(pickLight(state), { phase: "night", light: 0.25 });
});

test("light curve interpolation changes sight deterministically without changing legacy presets", () => {
  const map = createBlankMap();
  map.environment = {
    dayNight: {
      cycleTicks: 8,
      nightStartTick: 6,
      dayStartTick: 2,
      nightSightMultiplier: 0.5,
      lightCurve: [
        { tick: 0, phase: "night", lightLevel01: 0 },
        { tick: 4, phase: "day", lightLevel01: 1 },
      ],
    },
  };
  const state = createInitialWorldState(map, ["p1"]);

  assert.equal(state.environment.lightLevel01, 0);
  assert.equal(getEnvironmentLightLevel(state.environment), 0);
  advanceTicks(state, 2);
  assert.equal(state.environment.lightLevel01, 0.5);
  assert.equal(getEnvironmentLightLevel(state.environment), 0.5);
});

test("world snapshot includes environment state", () => {
  const state = createInitialWorldState(createBlankMap(), ["p1"]);
  const snapshot = toWorldSnapshot(state);

  assert.deepEqual(snapshot.environment, state.environment);
});

test("default visibility keeps full sight without environment preset", () => {
  const map = createBlankMap({ width: 64, height: 64 });
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyUnit(state, "p1-villager-1");
  state.units["p1-villager-1"]!.position = { x: 30, y: 30 };

  const visibility = updatePlayerVisibility(createPlayerVisibility(map), state, "p1");

  assert.equal(getTileVisibility(visibility, { x: 36, y: 30 }), TileVisibility.Visible);
});

test("night sight multiplier shrinks visibility when enabled", () => {
  const map = createBlankMap({ width: 64, height: 64 });
  map.environment = {
    dayNight: {
      cycleTicks: 10,
      nightStartTick: 1,
      dayStartTick: 6,
      nightSightMultiplier: 0.5,
    },
  };
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyUnit(state, "p1-villager-1");
  state.units["p1-villager-1"]!.position = { x: 30, y: 30 };
  advanceWorldTick(state);

  const visibility = updatePlayerVisibility(createPlayerVisibility(map), state, "p1");

  assert.equal(state.environment.dayPhase, "night");
  assert.equal(getTileVisibility(visibility, { x: 33, y: 30 }), TileVisibility.Visible);
  assert.equal(getTileVisibility(visibility, { x: 36, y: 30 }), TileVisibility.Unexplored);
});

test("day phase and missing multiplier use full sight", () => {
  const map = createBlankMap({ width: 64, height: 64 });
  map.environment = {
    dayNight: {
      cycleTicks: 10,
      nightStartTick: 6,
      dayStartTick: 9,
    },
  };
  const state = createInitialWorldState(map, ["p1"]);
  keepOnlyUnit(state, "p1-villager-1");
  state.units["p1-villager-1"]!.position = { x: 30, y: 30 };

  const visibility = updatePlayerVisibility(createPlayerVisibility(map), state, "p1");

  assert.equal(state.environment.dayPhase, "day");
  assert.equal(getTileVisibility(visibility, { x: 36, y: 30 }), TileVisibility.Visible);
});

function keepOnlyUnit(state: ReturnType<typeof createInitialWorldState>, keptUnitId: string): void {
  for (const unitId of Object.keys(state.units)) {
    if (unitId !== keptUnitId) {
      delete state.units[unitId];
    }
  }
}

function advanceTicks(state: ReturnType<typeof createInitialWorldState>, count: number): void {
  for (let index = 0; index < count; index += 1) {
    advanceWorldTick(state);
  }
}

function pickLight(state: ReturnType<typeof createInitialWorldState>): { phase: string; light: number | undefined } {
  return { phase: state.environment.dayPhase, light: state.environment.lightLevel01 };
}
