import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContentRegistry, defaultMap, validateContentRegistry, type CommandEnvelope } from "../../shared/src/index.js";
import {
  advanceWorldTick,
  createPlayerVisibility,
  createInitialWorldState,
  getTileVisibility,
  issueCommand,
  iterateUnitsOrdered,
  SIM_TICK_SECONDS,
  TileVisibility,
  updatePlayerVisibility,
  updatePlayerVisibilityWithChanges,
  validateBuildingPlacement,
} from "./index.js";

const simulationSrcDirectory = dirname(fileURLToPath(import.meta.url));

test("core content registry validates", () => {
  const result = validateContentRegistry(createContentRegistry());

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test("commands reject units owned by another player", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const envelope: CommandEnvelope = {
    sessionId: "test-session",
    playerId: "p2",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: "p1-villager-1",
      target: { x: 10, y: 10 },
    },
  };

  const result = issueCommand(state, envelope);

  assert.equal(result.ok, false);
});

test("move and stop commands update waypoint movement state", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const moveResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "move",
      unitId: "p1-villager-1",
      target: { x: 10, y: 10 },
    },
  });

  assert.equal(moveResult.ok, true);
  assert.equal(state.units["p1-villager-1"]?.currentOrder?.type, "move");
  assert.ok((state.units["p1-villager-1"]?.movementPath?.length ?? 0) > 0);

  const stopResult = issueCommand(state, {
    sessionId: "test-session",
    playerId: "p1",
    issuedAtTick: state.tick,
    command: {
      type: "stop",
      unitId: "p1-villager-1",
    },
  });

  assert.equal(stopResult.ok, true);
  assert.equal(state.units["p1-villager-1"]?.movementTarget, undefined);
  assert.equal(state.units["p1-villager-1"]?.movementPath, undefined);
  assert.equal(state.units["p1-villager-1"]?.currentOrder, undefined);
});

test("building placement rejects occupied footprints and accepts clear grass", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  assert.equal(validateBuildingPlacement(state, "house", { x: 3, y: 3 }).ok, false);
  assert.equal(validateBuildingPlacement(state, "house", { x: 12, y: 12 }).ok, true);
});

test("defeat-opponents objective completes when only one player has units", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p2") {
      delete state.units[unit.id];
    }
  }

  advanceWorldTick(state);

  assert.equal(state.scenario.objectives["defeat-opponents"]?.status, "completed");
  assert.equal(state.scenario.status, "victory");
});

test("simulation source does not use nondeterministic APIs", () => {
  const bannedPatterns = [
    { label: "Math.random", pattern: /\bMath\.random\s*\(/ },
    { label: "Date.now", pattern: /\bDate\.now\s*\(/ },
    { label: "performance.now", pattern: /\bperformance\.now\s*\(/ },
    { label: "crypto.randomUUID", pattern: /\bcrypto\.randomUUID\s*\(/ },
    { label: "new Date", pattern: /\bnew\s+Date\s*\(/ },
  ];
  const violations: string[] = [];

  for (const filePath of collectSourceFiles(simulationSrcDirectory)) {
    const source = readFileSync(filePath, "utf8");

    for (const banned of bannedPatterns) {
      if (banned.pattern.test(source)) {
        violations.push(`${filePath}: banned ${banned.label}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("unit iteration is canonical by unit id", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const units = Object.values(state.units);

  state.units = {};
  for (const unit of units.reverse()) {
    state.units[unit.id] = unit;
  }

  assert.deepEqual(
    iterateUnitsOrdered(state).map((unit) => unit.id),
    Object.keys(state.units).sort(),
  );
});

test("new player visibility starts unexplored", () => {
  const visibility = createPlayerVisibility(defaultMap);

  assert.equal(visibility.width, defaultMap.width);
  assert.equal(visibility.height, defaultMap.height);
  assert.equal(visibility.tiles.length, defaultMap.width * defaultMap.height);
  assert.equal(visibility.tiles.every((tile) => tile === TileVisibility.Unexplored), true);
});

test("starting player sees own spawn area and unit tile after visibility update", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");

  assert.equal(getTileVisibility(visibility, { x: 3, y: 3 }), TileVisibility.Visible);
  assert.equal(getTileVisibility(visibility, state.units["p1-villager-1"]!.position), TileVisibility.Visible);
});

test("initial visibility update marks dirty chunks", () => {
  const chunkSize = 16;
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const chunksPerRow = Math.ceil(defaultMap.width / chunkSize);
  const chunksPerColumn = Math.ceil(defaultMap.height / chunkSize);
  const dirtyChunks = new Uint8Array(chunksPerRow * chunksPerColumn);

  const update = updatePlayerVisibilityWithChanges(createPlayerVisibility(defaultMap), state, "p1", {
    dirtyChunks,
    chunkSize,
  });

  assert.ok(update.dirtyChunkCount > 0);
  assert.equal(dirtyChunks.some((chunk) => chunk === 1), true);
});

test("unchanged visibility update leaves dirty chunk mask clear", () => {
  const chunkSize = 16;
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const chunksPerRow = Math.ceil(defaultMap.width / chunkSize);
  const chunksPerColumn = Math.ceil(defaultMap.height / chunkSize);
  const dirtyChunks = new Uint8Array(chunksPerRow * chunksPerColumn);
  const firstUpdate = updatePlayerVisibilityWithChanges(createPlayerVisibility(defaultMap), state, "p1", {
    dirtyChunks,
    chunkSize,
  });

  const secondUpdate = updatePlayerVisibilityWithChanges(firstUpdate.visibility, state, "p1", {
    dirtyChunks,
    chunkSize,
  });

  assert.equal(secondUpdate.dirtyChunkCount, 0);
  assert.equal(dirtyChunks.every((chunk) => chunk === 0), true);
});

test("small unit movement dirties only nearby visibility chunks and preserves wrapper behavior", () => {
  const chunkSize = 16;
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const chunksPerRow = Math.ceil(defaultMap.width / chunkSize);
  const chunksPerColumn = Math.ceil(defaultMap.height / chunkSize);
  const dirtyChunks = new Uint8Array(chunksPerRow * chunksPerColumn);

  for (const unitId of Object.keys(state.units)) {
    if (unitId !== "p1-villager-1") {
      delete state.units[unitId];
    }
  }

  state.units["p1-villager-1"]!.position = { x: 30, y: 30 };
  const previous = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");
  state.units["p1-villager-1"]!.position = { x: 31, y: 30 };

  const update = updatePlayerVisibilityWithChanges(previous, state, "p1", {
    dirtyChunks,
    chunkSize,
  });
  const wrapperVisibility = updatePlayerVisibility(previous, state, "p1");

  assert.ok(update.dirtyChunkCount > 0);
  assert.ok(update.dirtyChunkCount <= 6);
  assert.deepEqual(wrapperVisibility.tiles, update.visibility.tiles);
});

test("previously visible tile becomes explored after units move away", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const watchedTile = { x: 3, y: 3 };
  let visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");

  assert.equal(getTileVisibility(visibility, watchedTile), TileVisibility.Visible);

  for (const unit of Object.values(state.units)) {
    if (unit.playerId === "p1") {
      unit.position = { x: 100, y: 100 };
    }
  }

  visibility = updatePlayerVisibility(visibility, state, "p1");

  assert.equal(getTileVisibility(visibility, watchedTile), TileVisibility.Explored);
});

test("enemy unit tile is visible only within local player visibility", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const enemyPosition = state.units["p2-villager-1"]!.position;
  let visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");

  assert.equal(getTileVisibility(visibility, enemyPosition), TileVisibility.Unexplored);

  state.units["p1-villager-1"]!.position = { x: enemyPosition.x - 1, y: enemyPosition.y };
  visibility = updatePlayerVisibility(visibility, state, "p1");

  assert.equal(getTileVisibility(visibility, enemyPosition), TileVisibility.Visible);
});

test("visibility uses the rounded tile for moving units", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);

  for (const unitId of Object.keys(state.units)) {
    if (unitId !== "p1-villager-1") {
      delete state.units[unitId];
    }
  }

  state.units["p1-villager-1"]!.position = { x: 30.4, y: 31.6 };
  const visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");

  assert.equal(getTileVisibility(visibility, { x: 30, y: 32 }), TileVisibility.Visible);
});

test("overlapping vision remains visible when one unit moves away", () => {
  const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
  const watchedTile = { x: 30, y: 30 };

  for (const unitId of Object.keys(state.units)) {
    if (!["p1-villager-1", "p1-villager-2"].includes(unitId)) {
      delete state.units[unitId];
    }
  }

  state.units["p1-villager-1"]!.position = watchedTile;
  state.units["p1-villager-2"]!.position = { x: watchedTile.x + 1, y: watchedTile.y };

  let visibility = updatePlayerVisibility(createPlayerVisibility(defaultMap), state, "p1");
  assert.equal(getTileVisibility(visibility, watchedTile), TileVisibility.Visible);

  state.units["p1-villager-1"]!.position = { x: 100, y: 100 };
  visibility = updatePlayerVisibility(visibility, state, "p1");

  assert.equal(getTileVisibility(visibility, watchedTile), TileVisibility.Visible);
});

test("same command sequence produces identical fixed-tick results", () => {
  const run = () => {
    const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
    const command: CommandEnvelope = {
      sessionId: "test-session",
      playerId: "p1",
      issuedAtTick: state.tick,
      command: {
        type: "move",
        unitId: "p1-villager-1",
        target: { x: 10, y: 10 },
      },
    };

    assert.equal(issueCommand(state, command).ok, true);

    for (let index = 0; index < 20; index += 1) {
      advanceWorldTick(state);
    }

    const unit = state.units["p1-villager-1"];

    assert.ok(unit);

    return {
      tick: state.tick,
      position: unit.position,
      movementTarget: unit.movementTarget,
      pathLength: unit.movementPath?.length ?? 0,
    };
  };

  assert.deepEqual(run(), run());
});

test("fixed tick advancement is independent of outer update cadence", () => {
  const runTicks = (cadenceMilliseconds: readonly number[]) => {
    const state = createInitialWorldState(defaultMap, ["p1", "p2"]);
    let accumulatedMilliseconds = 0;
    const tickMilliseconds = SIM_TICK_SECONDS * 1000;

    assert.equal(issueCommand(state, {
      sessionId: "test-session",
      playerId: "p1",
      issuedAtTick: state.tick,
      command: {
        type: "move",
        unitId: "p1-villager-1",
        target: { x: 10, y: 10 },
      },
    }).ok, true);

    for (const elapsedMilliseconds of cadenceMilliseconds) {
      accumulatedMilliseconds += elapsedMilliseconds;

      while (accumulatedMilliseconds >= tickMilliseconds) {
        advanceWorldTick(state);
        accumulatedMilliseconds -= tickMilliseconds;
      }
    }

    return state.units["p1-villager-1"]?.position;
  };

  assert.deepEqual(runTicks([100, 100, 100, 100]), runTicks([16, 34, 50, 175, 125]));
});

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(filePath);
    }

    if (!entry.isFile() || !filePath.endsWith(".ts") || filePath.endsWith(".test.ts") || filePath.endsWith(".spec.ts")) {
      return [];
    }

    return [filePath];
  });
}
