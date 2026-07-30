import assert from "node:assert/strict";
import test from "node:test";
import {
  createMapDefinitionFromId,
  imjinrokK01Scenario,
  unitDefinitions,
} from "@shared";
import { getFootprintTiles, toWorldSnapshot, type WorldSnapshot, type WorldState } from "@simulation";

import {
  MISSION_BRIEFING_SCENE_KEY,
  PreGameBriefingLaunchController,
  launchGameWithPreGameBriefing,
  type SceneLaunchPort,
} from "./preGameBriefingLaunch.js";
import { createCampaignMissionLaunchContext, type GameLaunchContext } from "./session.js";
import { NetworkClient } from "./net/NetworkClient.js";
import { createSessionTransport } from "./net/SessionTransport.js";

class RecordingSceneLaunchPort implements SceneLaunchPort {
  readonly calls: Array<{ type: "launch" | "start" | "stop"; key: string; data?: GameLaunchContext }> = [];

  isActive(_key: string): boolean {
    return false;
  }

  launch(key: string, data: GameLaunchContext): void {
    this.calls.push({ type: "launch", key, data });
  }

  start(key: string, data: GameLaunchContext): void {
    this.calls.push({ type: "start", key, data });
  }

  stop(key: string): void {
    this.calls.push({ type: "stop", key });
  }
}

test("K01 fresh campaign lifecycle reaches a deterministic local opening snapshot", () => {
  const map = createMapDefinitionFromId(imjinrokK01Scenario.mapId);
  assert.ok(map, "K01 source map should be available through the public map factory");

  const context = createCampaignMissionLaunchContext(imjinrokK01Scenario, map);
  const scenes = new RecordingSceneLaunchPort();

  launchGameWithPreGameBriefing(scenes, context);

  assert.deepEqual(scenes.calls, [{ type: "start", key: MISSION_BRIEFING_SCENE_KEY, data: context }]);

  const briefing = new PreGameBriefingLaunchController();
  assert.equal(briefing.startGameplay(scenes, context), true);
  assert.equal(briefing.startGameplay(scenes, context), false, "a completed briefing cannot start gameplay twice");
  assert.deepEqual(scenes.calls, [
    { type: "start", key: MISSION_BRIEFING_SCENE_KEY, data: context },
    { type: "start", key: "gameplay-launch", data: context },
  ]);

  const opening = createLocalK01Session(context, map);
  const initial = opening.getSnapshot();

  assert.equal(opening.isRemote, false);
  assert.deepEqual(Object.keys(initial.players), ["local-player", "cpu-1"]);
  assert.deepEqual(initial.players["local-player"]?.teamId, "local");
  assert.deepEqual(initial.players["cpu-1"]?.teamId, "cpu");
  assert.deepEqual(initial.map.sourceInitialView, { x: 13, y: 8 });
  assert.equal(initial.scenario.id, imjinrokK01Scenario.id);
  assert.equal(initial.scenario.status, "running");
  assert.equal(Object.keys(initial.units).length, 36);
  assert.equal(Object.values(initial.units).filter((unit) => unit.playerId === "local-player").length, 12);
  assert.equal(Object.values(initial.units).filter((unit) => unit.playerId === "cpu-1").length, 24);
  assert.deepEqual(initial.units["local-player-source-0x31-5-4"]?.position, { x: 5, y: 4 });
  assert.equal(initial.units["local-player-source-0x31-5-4"]?.kind, "town-center");
  assert.deepEqual(initial.units["local-player-source-0x4e-7-8"]?.position, { x: 7, y: 8 });
  assert.equal(initial.units["local-player-source-0x4e-7-8"]?.kind, "ryu-seong-ryong");
  assert.equal(initial.units["cpu-1-source-0x3a-7-57"]?.kind, "japanese-hq");
  assert.deepEqual(initial.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "pending");
  assertOpeningPlacementSafety(initial);

  advanceOpeningTicks(opening);
  const snapshot = toWorldSnapshot(opening.getSnapshot());

  assert.equal(snapshot.tick, 3);
  assert.equal(snapshot.scenario.status, "running");
  // The source-backed K01 palette schedule is the first opening session side
  // effect exposed through the headless transport; it advances at tick two.
  assert.equal(snapshot.environment.visualPaletteId, "night2");
  assert.deepEqual(
    imjinrokK01Scenario.missionDialogues?.find((dialogue) => dialogue.id === "k01-build-beacon-orders")?.trigger,
    { type: "tick", tick: snapshot.tick },
  );
  assert.equal(snapshot.scenario.scriptedEvents["k01-reinforcement-wave"]?.status, "pending");
  assert.equal(snapshot.units["cpu-1-k0120-reinforcement-0x52"], undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)) as WorldSnapshot, snapshot);
  assertOpeningPlacementSafety(snapshot);

  const replay = createLocalK01Session(context, map);
  advanceOpeningTicks(replay);

  assert.deepEqual(toWorldSnapshot(replay.getSnapshot()), snapshot);
});

function createLocalK01Session(context: GameLaunchContext, map: NonNullable<ReturnType<typeof createMapDefinitionFromId>>) {
  assert.ok(context.playerIds, "campaign context should provide its scenario player ids");
  return createSessionTransport(context, map, context.playerIds, new NetworkClient("http://example.invalid"));
}

function advanceOpeningTicks(transport: ReturnType<typeof createLocalK01Session>): void {
  transport.update(50, 50);
  transport.update(100, 50);
  transport.update(150, 50);
}

function assertOpeningPlacementSafety(snapshot: Pick<WorldState, "map" | "units">): void {
  const occupiedTiles = new Map<string, string>();

  for (const unit of Object.values(snapshot.units)) {
    assert.equal(Number.isInteger(unit.position.x), true, `${unit.id} has an integral x coordinate`);
    assert.equal(Number.isInteger(unit.position.y), true, `${unit.id} has an integral y coordinate`);

    const footprint = unitDefinitions[unit.kind].footprint;
    for (const tile of getFootprintTiles(unit.position, footprint)) {
      assert.equal(tile.x >= 0 && tile.x < snapshot.map.width, true, `${unit.id} footprint is within map x bounds`);
      assert.equal(tile.y >= 0 && tile.y < snapshot.map.height, true, `${unit.id} footprint is within map y bounds`);

      if (!footprint.blocksMovement) {
        continue;
      }

      const key = `${tile.x},${tile.y}`;
      assert.equal(occupiedTiles.get(key), undefined, `${unit.id} collides with ${occupiedTiles.get(key)} at ${key}`);
      occupiedTiles.set(key, unit.id);
    }
  }
}
