import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlankMap,
  createImjinrokMapScaffold,
  defaultSkirmishScenario,
  imjinrokK01Scenario,
  imjinrokK02Scenario,
  k01SourceOpeningAdapter,
  unitDefinitions,
  type ScenarioDefinition,
} from "../../shared/src/index.js";
import {
  createInitialWorldState,
  getUnitFootprintTiles,
  k01SourceExactOpeningPlacementPolicy,
  toWorldSnapshot,
} from "./index.js";
import { createUnitState } from "./entities.js";
import { advanceWorldTick } from "./tick.js";

test("K01 exact opening creates every source record at its semantic coordinate in stable order", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);

  const first = createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  const second = createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  const expectedUnits = [
    ...(imjinrokK01Scenario.playerStarts?.["local-player"]?.startingUnits ?? []).map((definition) => ({
      playerId: "local-player",
      definition,
      spawn: { x: 6, y: 6 },
    })),
    ...(imjinrokK01Scenario.playerStarts?.["cpu-1"]?.startingUnits ?? []).map((definition) => ({
      playerId: "cpu-1",
      definition,
      spawn: { x: 52, y: 52 },
    })),
  ];

  assert.equal(expectedUnits.length, 36);
  assert.deepEqual(
    Object.values(first.units).map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      playerId: unit.playerId,
      position: unit.position,
    })),
    expectedUnits.map(({ playerId, definition, spawn }) => ({
      id: `${playerId}-${definition.idSuffix}`,
      kind: definition.kind,
      playerId,
      position: { x: spawn.x + definition.offset.x, y: spawn.y + definition.offset.y },
    })),
  );

  const sourceBuildingCells = new Set<string>();
  const class49Cells = new Set<string>();
  let sourceFootprintCount = 0;
  let sourceBuildingCount = 0;
  for (const { playerId, definition, spawn } of expectedUnits) {
    const record = k01SourceOpeningAdapter.find(({ idSuffix }) => idSuffix === definition.idSuffix);
    assert.ok(record);
    if (!record.sourceFootprint) {
      continue;
    }
    sourceFootprintCount += 1;
    if (unitDefinitions[definition.kind].category === "building") {
      sourceBuildingCount += 1;
    }
    const center = { x: spawn.x + definition.offset.x, y: spawn.y + definition.offset.y };
    for (const tile of deriveSourceFootprintTiles(center, record.sourceFootprint.width, record.sourceFootprint.height)) {
      const key = `${tile.x},${tile.y}`;
      assert.equal(sourceBuildingCells.has(key), false, `${playerId}-${definition.idSuffix} source overlap at ${key}`);
      sourceBuildingCells.add(key);
      if (record.originalClass === 49) {
        class49Cells.add(key);
      }
    }
  }
  assert.equal(sourceBuildingCount, 15);
  assert.equal(sourceFootprintCount, 17);
  assert.equal(class49Cells.has("7,6"), false, "class-7 control is outside class-49 source footprint");
  assert.deepEqual(toWorldSnapshot(first), toWorldSnapshot(second));
});

test("K01 exact opening uses the source 3x3 town-center footprint and remains operable", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const state = createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  const townCenter = state.units["local-player-source-0x31-5-4"];
  const villager = state.units["local-player-source-0x07-7-6"];
  assert.ok(townCenter);
  assert.ok(villager);
  assert.deepEqual(townCenter.position, { x: 5, y: 4 });
  assert.deepEqual(villager.position, { x: 7, y: 6 });
  assert.deepEqual(getUnitFootprintTiles(state, townCenter.kind, townCenter.position), [
    { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 },
    { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
    { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 },
  ]);
  assert.equal(getUnitFootprintTiles(state, townCenter.kind, townCenter.position).some((tile) =>
    tile.x === villager.position.x && tile.y === villager.position.y), false);

  const tickBefore = state.tick;
  advanceWorldTick(state);
  assert.equal(state.tick, tickBefore + 1);
});

test("K01 exact opening fails closed for occupied, OOB, invalid identity, and unsupported footprint inputs", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const localStart = imjinrokK01Scenario.playerStarts?.["local-player"]?.startingUnits ?? [];
  const townCenter = localStart[0];
  assert.ok(townCenter);

  const occupied = createUnitState("same-owner-blocker", "local-player", "villager", { x: 5, y: 4 });
  assert.throws(
    () => k01SourceExactOpeningPlacementPolicy.resolveStartingPositions({
      map,
      players: [{ playerId: "local-player", spawn: { x: 6, y: 6 }, startingUnits: [townCenter] }],
      existingUnits: { [occupied.id]: occupied },
    }),
    /occupied by 'same-owner-blocker'/,
  );

  assert.throws(
    () => createInitialWorldState(createBlankMap({ id: "imjinrok-k01", width: 5, height: 5 }), ["local-player"], imjinrokK01Scenario),
    /outside map/,
  );

  assert.throws(
    () => k01SourceExactOpeningPlacementPolicy.resolveStartingPositions({
      map,
      players: [{ playerId: "local-player", spawn: { x: 32768, y: 32768 }, startingUnits: [townCenter] }],
    }),
    /source footprint produced no valid tiles/,
  );

  const invalidKindScenario = structuredClone(imjinrokK01Scenario) as ScenarioDefinition;
  const invalidKindStart = invalidKindScenario.playerStarts?.["local-player"]?.startingUnits;
  assert.ok(invalidKindStart);
  invalidKindStart[0] = { ...invalidKindStart[0], kind: "villager" };
  assert.throws(
    () => createInitialWorldState(map, ["local-player"], invalidKindScenario),
    /kind mapping mismatch/,
  );

  const unknownRecordScenario = structuredClone(imjinrokK01Scenario) as ScenarioDefinition;
  const unknownRecordStart = unknownRecordScenario.playerStarts?.["local-player"]?.startingUnits;
  assert.ok(unknownRecordStart);
  unknownRecordStart[0] = { ...unknownRecordStart[0], idSuffix: "tampered-source-record" };
  assert.throws(
    () => createInitialWorldState(map, ["local-player"], unknownRecordScenario),
    /unsupported source record identity/,
  );

  const footprintRecord = k01SourceOpeningAdapter.find(({ idSuffix }) => idSuffix === townCenter.idSuffix);
  assert.ok(footprintRecord?.sourceFootprint);
  const originalFootprint = footprintRecord.sourceFootprint;
  footprintRecord.sourceFootprint = { width: 0, height: 3, evidence: "static-confirmed" };
  try {
    assert.throws(
      () => createInitialWorldState(map, ["local-player"], imjinrokK01Scenario),
      /unsupported or invalid source footprint extent/,
    );
  } finally {
    footprintRecord.sourceFootprint = originalFootprint;
  }
});

test("exact placement failure does not mutate the input map or expose a partial profile state", () => {
  const map = createImjinrokMapScaffold("imjinrok-k01");
  assert.ok(map);
  const before = JSON.stringify(map);
  const tampered = structuredClone(imjinrokK01Scenario) as ScenarioDefinition;
  const starts = tampered.playerStarts?.["local-player"]?.startingUnits;
  assert.ok(starts);
  starts[1] = { ...starts[1], offset: { x: -100, y: -100 } };

  assert.throws(() => createInitialWorldState(map, ["local-player", "cpu-1"], tampered), /coordinate offset mismatch/);
  assert.equal(JSON.stringify(map), before);
});

test("generic and K02 worlds retain radius-search placement and profile isolation", () => {
  const genericScenario = {
    ...defaultSkirmishScenario,
    startingUnits: [
      { kind: "villager", idSuffix: "first", offset: { x: 0, y: 0 } },
      { kind: "villager", idSuffix: "second", offset: { x: 0, y: 0 } },
    ],
    playerStarts: undefined,
  } as ScenarioDefinition;
  const generic = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["p1"], genericScenario);
  assert.notDeepEqual(generic.units["p1-second"]?.position, { x: 3, y: 3 });
  assert.equal(generic.sourceRuntimeProfile, undefined);

  const k02Map = createImjinrokMapScaffold("imjinrok-k02");
  assert.ok(k02Map);
  const k02 = createInitialWorldState(k02Map, ["local-player", "cpu-1", "ally-1"], imjinrokK02Scenario);
  assert.equal(k02.sourceRuntimeProfile, undefined);
  assert.equal(k02.units["local-player-source-0x34-70-3"]?.position.x, 70);
});

function deriveSourceFootprintTiles(center: GridPointLike, width: number, height: number): GridPointLike[] {
  const tiles: GridPointLike[] = [];
  const originX = center.x - Math.floor(width / 2);
  const originY = center.y - Math.floor(height / 2);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      tiles.push({ x: originX + column, y: originY + row });
    }
  }
  return tiles;
}

interface GridPointLike {
  x: number;
  y: number;
}
