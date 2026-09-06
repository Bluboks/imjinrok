import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMap, createImjinrokMapScaffold, imjinrokK01Scenario } from "../../shared/src/index.js";
import {
  advanceWorldTick,
  createSourceRuntimeProfileEnvelope,
  createInitialWorldState,
  getFootprintTiles,
  K01_SOURCE_RUNTIME_PROFILE_ID,
  getUnitFootprintTiles,
  findBuildWorkPath,
  toWorldSnapshot,
  validateBuildingPlacement,
  resolveEffectiveFootprint,
} from "./index.js";
import { createMovementReservationForState, getEntityBlockingTiles, reserveUnitPositionForState } from "./collision.js";
import { createUnitState } from "./entities.js";

test("K01 source profile selects proven building extents and source-center anchor", () => {
  const map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(map);
  const state = createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  const source = resolveEffectiveFootprint(state, "beacon");
  const generic = resolveEffectiveFootprint(undefined, "beacon");

  assert.deepEqual(source, {
    footprint: { width: 3, height: 3, blocksMovement: true },
    anchor: "source-center",
  });
  assert.deepEqual(generic, {
    footprint: { width: 2, height: 2, blocksMovement: true },
    anchor: "project-center",
  });
  assert.deepEqual(getUnitFootprintTiles(state, "beacon", { x: 2, y: 2 }), [
    { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
    { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
    { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
  ]);
  assert.deepEqual(getUnitFootprintTiles(undefined, "beacon", { x: 2, y: 2 }), [
    { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 },
  ]);
});

test("source-center rejects invalid centers and nonfinite extents without unbounded iteration", () => {
  const sourceFootprint = { width: 3, height: 3, blocksMovement: true };
  assert.deepEqual(getFootprintTiles({ x: 1.5, y: 2 }, sourceFootprint, "source-center"), []);
  assert.deepEqual(getFootprintTiles({ x: Number.POSITIVE_INFINITY, y: 2 }, sourceFootprint, "source-center"), []);
  assert.deepEqual(getFootprintTiles({ x: 1, y: 2 }, { ...sourceFootprint, width: Number.POSITIVE_INFINITY }, "source-center"), []);
  assert.deepEqual(getFootprintTiles({ x: -32769, y: 2 }, sourceFootprint, "source-center"), []);
  assert.deepEqual(getFootprintTiles({ x: 32767, y: -32768 }, sourceFootprint, "source-center"), []);
  assert.deepEqual(getFootprintTiles({ x: 32767, y: -32768 }, { width: 1, height: 1, blocksMovement: true }, "source-center"), [
    { x: 32767, y: -32768 },
  ]);
  assert.deepEqual(getFootprintTiles({ x: 1.5, y: 2 }, sourceFootprint), [
    { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
    { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
    { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
  ]);
});

test("generic worlds retain project-center footprint behavior", () => {
  const state = createInitialWorldState(createBlankMap({ width: 8, height: 8 }), ["p1"]);
  assert.equal(state.sourceRuntimeProfile, undefined);
  assert.equal(resolveEffectiveFootprint(state, "town-center").anchor, "project-center");
});

test("source building extents reach placement, work approach, collision, and reservation boundaries", () => {
  const source = createFootprintGameplayState(true);
  const generic = createFootprintGameplayState(false);
  const sourceHeadquarters = addUnit(source, "source-hq", "town-center", { x: 8, y: 8 });
  const genericHeadquarters = addUnit(generic, "generic-hq", "town-center", { x: 8, y: 8 });
  const sourceWorker = addUnit(source, "source-worker", "villager", { x: 6, y: 8 });
  const genericWorker = addUnit(generic, "generic-worker", "villager", { x: 6, y: 8 });

  assert.deepEqual(getUnitFootprintTiles(source, "town-center", sourceHeadquarters.position).at(-1), { x: 9, y: 9 });
  assert.deepEqual(getUnitFootprintTiles(generic, "town-center", genericHeadquarters.position).at(-1), { x: 10, y: 10 });
  assert.equal(getEntityBlockingTiles(source).has("10,8"), false);
  assert.equal(getEntityBlockingTiles(generic).has("10,8"), true);

  const sourceReservation = createMovementReservationForState(source);
  const genericReservation = createMovementReservationForState(generic);
  assert.equal(reserveUnitPositionForState(source, sourceReservation, sourceHeadquarters, sourceHeadquarters.position), true);
  assert.equal(reserveUnitPositionForState(generic, genericReservation, genericHeadquarters, genericHeadquarters.position), true);
  assert.equal(reserveUnitPositionForState(source, sourceReservation, sourceWorker, { x: 10, y: 8 }), true);
  assert.equal(reserveUnitPositionForState(generic, genericReservation, genericWorker, { x: 10, y: 8 }), false);

  delete source.units[sourceHeadquarters.id];
  delete generic.units[genericHeadquarters.id];
  const sourceBeaconBlocker = addUnit(source, "source-beacon-blocker", "villager", { x: 7, y: 8 });
  const genericBeaconBlocker = addUnit(generic, "generic-beacon-blocker", "villager", { x: 7, y: 8 });
  assert.equal(validateBuildingPlacement(source, "beacon", { x: 8, y: 8 }).ok, false);
  delete source.units[sourceBeaconBlocker.id];
  assert.equal(validateBuildingPlacement(generic, "beacon", { x: 8, y: 8 }).ok, true);
  delete generic.units[genericBeaconBlocker.id];

  const sourceBuildPath = findBuildWorkPath(source, sourceWorker, "beacon", { x: 8, y: 8 });
  assert.deepEqual(sourceBuildPath?.at(-1), { x: 8, y: 6 });
  assert.ok(sourceBuildPath && sourceBuildPath.length > 0);
  const genericBuildPath = findBuildWorkPath(generic, genericWorker, "beacon", { x: 8, y: 8 });
  assert.deepEqual(genericBuildPath?.at(-1), { x: 8, y: 7 });
  assert.ok(genericBuildPath && genericBuildPath.length > 0);
});

test("source building extents change attack and repair contact at the same semantic position", () => {
  const sourceAttack = createFootprintGameplayState(true);
  const genericAttack = createFootprintGameplayState(false);
  const sourceTarget = addUnit(sourceAttack, "source-target", "town-center", { x: 8, y: 8 });
  const genericTarget = addUnit(genericAttack, "generic-target", "town-center", { x: 8, y: 8 });
  const sourceAttacker = addUnit(sourceAttack, "source-attacker", "swordsman", { x: 11, y: 8 }, "cpu-1");
  const genericAttacker = addUnit(genericAttack, "generic-attacker", "swordsman", { x: 11, y: 8 }, "cpu-1");
  sourceAttacker.currentOrder = { type: "attack-unit", targetUnitId: sourceTarget.id };
  genericAttacker.currentOrder = { type: "attack-unit", targetUnitId: genericTarget.id };
  const sourceHealth = sourceTarget.health.current;
  const genericHealth = genericTarget.health.current;

  advanceWorldTick(sourceAttack);
  advanceWorldTick(genericAttack);

  assert.equal(sourceTarget.health.current, sourceHealth);
  assert.deepEqual(sourceAttacker.movementTarget, { x: 10, y: 8 });
  assert.ok(genericTarget.health.current < genericHealth);
  assert.equal(genericAttacker.movementTarget, undefined);

  const sourceRepair = createFootprintGameplayState(true);
  const genericRepair = createFootprintGameplayState(false);
  const sourceRepairTarget = addUnit(sourceRepair, "source-repair-target", "town-center", { x: 8, y: 8 });
  const genericRepairTarget = addUnit(genericRepair, "generic-repair-target", "town-center", { x: 8, y: 8 });
  sourceRepairTarget.health.current -= 100;
  genericRepairTarget.health.current -= 100;
  const sourceRepairWorker = addUnit(sourceRepair, "source-repair-worker", "villager", { x: 11, y: 8 });
  const genericRepairWorker = addUnit(genericRepair, "generic-repair-worker", "villager", { x: 11, y: 8 });
  sourceRepairWorker.currentOrder = { type: "repair", targetUnitId: sourceRepairTarget.id };
  genericRepairWorker.currentOrder = { type: "repair", targetUnitId: genericRepairTarget.id };
  const sourceDamaged = sourceRepairTarget.health.current;
  const genericDamaged = genericRepairTarget.health.current;

  advanceWorldTick(sourceRepair);
  advanceWorldTick(genericRepair);

  assert.equal(sourceRepairTarget.health.current, sourceDamaged);
  assert.equal(sourceRepairWorker.movementTarget?.x, 10);
  assert.ok(sourceRepairWorker.movementPath && sourceRepairWorker.movementPath.length > 0);
  assert.ok(genericRepairTarget.health.current > genericDamaged);
  assert.equal(genericRepairWorker.movementTarget, undefined);
});

test("source profile footprints survive JSON snapshots and retain the generic fallback", () => {
  const source = createFootprintGameplayState(true);
  const snapshot = JSON.parse(JSON.stringify(toWorldSnapshot(source))) as typeof source;
  assert.equal(snapshot.sourceRuntimeProfile?.profileId, K01_SOURCE_RUNTIME_PROFILE_ID);
  assert.deepEqual(getUnitFootprintTiles(snapshot, "town-center", { x: 8, y: 8 }).at(-1), { x: 9, y: 9 });

  const generic = createFootprintGameplayState(false);
  const genericSnapshot = JSON.parse(JSON.stringify(toWorldSnapshot(generic))) as typeof generic;
  assert.equal(genericSnapshot.sourceRuntimeProfile, undefined);
  assert.deepEqual(getUnitFootprintTiles(genericSnapshot, "town-center", { x: 8, y: 8 }).at(-1), { x: 10, y: 10 });
});

function createFootprintGameplayState(source: boolean): ReturnType<typeof createInitialWorldState> {
  const state = createInitialWorldState(createBlankMap({ width: 16, height: 16 }), ["local-player", "cpu-1"]);
  state.units = {};
  if (source) {
    state.sourceRuntimeProfile = createSourceRuntimeProfileEnvelope(K01_SOURCE_RUNTIME_PROFILE_ID);
  }
  return state;
}

function addUnit(
  state: ReturnType<typeof createInitialWorldState>,
  id: string,
  kind: Parameters<typeof createUnitState>[2],
  position: { x: number; y: number },
  playerId = "local-player",
) {
  const unit = createUnitState(id, playerId, kind, position);
  state.units[id] = unit;
  return unit;
}
