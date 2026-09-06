import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_EXE_SHA256,
  EXPECTED_K0120_SHA256,
  extractK01BeaconK0120Trigger,
  runK01BeaconTrigger,
} from "./extract-k01-beacon-k0120-trigger.mjs";
import {
  advanceK01BeaconPolicy,
  createInitialWorldState,
} from "../../packages/simulation/src/index.ts";
import { createUnitState } from "../../packages/simulation/src/entities.ts";
import { appendConstructionCompletedEvent } from "../../packages/simulation/src/events.ts";
import { removeUnitFromWorld } from "../../packages/simulation/src/units.ts";
import {
  createImjinrokMapScaffold,
  imjinrokK01Scenario,
  k01ReinforcementAdapter,
  unitDefinitions,
} from "../../packages/shared/src/index.ts";

const SOURCE_RECORD = {
  index: 7,
  slotTableWord: 1,
  healthSignedWord: 1,
  activeByte: 1,
  ownerSignedByte: -1,
  classByte: 52,
  progressByte: 100,
};

/**
 * This is a bounded adapter comparison. Raw slot identity, source clock units,
 * and the product's semantic owner relation are intentionally projected out.
 * It does not claim full original-game parity.
 */
test("K01 K0120 static vectors agree with the production beacon adapter", () => {
  const report = extractK01BeaconK0120Trigger();
  assert.equal(report.sources.executable.sha256, EXPECTED_EXE_SHA256);
  assert.equal(report.sources.script.sha256, EXPECTED_K0120_SHA256);
  assert.equal(report.evidenceStatus, "static-proven-k01-beacon-k0120-trigger");
  assert.equal(report.reproductionStatus, "reproduction-complete");

  const vectors = [
    {
      id: "blocked",
      source: {
        blockerPresent: true,
        initialFlagWord: 0,
        scriptBusyResults: [],
        loadResults: [],
        descriptorAllocationResults: [],
        scriptPostState: 0,
      },
      product: { blocker: 1 },
    },
    {
      id: "idle-loader-zero",
      source: {
        blockerPresent: false,
        initialFlagWord: 0,
        scriptBusyResults: [0],
        loadResults: [0],
        descriptorAllocationResults: Array.from({ length: 9 }, (_, index) => index + 1),
        scriptPostState: 0,
      },
      product: { scriptBusy: false, scriptLoaderResult: 0, scriptPostState: 0 },
    },
    {
      id: "idle-loader-one",
      source: {
        blockerPresent: false,
        initialFlagWord: 0,
        scriptBusyResults: [0],
        loadResults: [1],
        descriptorAllocationResults: Array.from({ length: 9 }, (_, index) => index + 1),
        scriptPostState: 0,
      },
      product: { scriptBusy: false, scriptLoaderResult: 1, scriptPostState: 0 },
    },
    {
      id: "busy-post-state-four",
      source: {
        blockerPresent: false,
        initialFlagWord: 0,
        scriptBusyResults: [1],
        loadResults: [],
        descriptorAllocationResults: Array.from({ length: 9 }, (_, index) => index + 1),
        scriptPostState: 4,
      },
      product: { scriptBusy: true, scriptLoaderResult: 0, scriptPostState: 4 },
    },
    {
      id: "already-flagged",
      source: {
        blockerPresent: false,
        initialFlagWord: 1,
        scriptBusyResults: [],
        loadResults: [],
        descriptorAllocationResults: [],
        scriptPostState: 0,
      },
      product: { scriptPostState: 0, initialFlagWord: 1 },
    },
  ];

  for (const vector of vectors) {
    const sourceResult = runK01BeaconTrigger({
      ...vector.source,
      currentPlayer: -1,
      records: [SOURCE_RECORD],
    });
    const world = createK01ParityWorld();
    if (vector.product.initialFlagWord !== undefined) {
      const sourceEnvelope = world.sourceRuntimeProfile;
      assert.ok(sourceEnvelope);
      sourceEnvelope.state = {
        ...sourceEnvelope.state,
        policies: {
          ...sourceEnvelope.state.policies,
          beacon: {
            ...sourceEnvelope.state.policies.beacon,
            triggerFlag: vector.product.initialFlagWord,
          },
        },
      };
    }
    const productResult = advanceK01BeaconPolicy(world, vector.product);
    const policy = world.sourceRuntimeProfile?.state?.policies.beacon;

    assert.ok(policy, `${vector.id}: production policy state`);
    assert.equal(policy.triggerFlag, sourceResult.flagWord, `${vector.id}: flag`);
    assert.equal(productResult.matchedBeaconCount, sourceResult.matches.length, `${vector.id}: match count`);
    assert.equal(policy.lastReturnValue, sourceResult.returnValue, `${vector.id}: return`);

    const sourceCreations = sourceResult.events
      .find((event) => event.kind === "descriptor-create-helper")?.creations ?? [];
    const productCreations = k01ReinforcementAdapter.map(({ originalClass, offset, idSuffix }) => ({
      originalClass,
      x: 55 + offset.x,
      y: 53 + offset.y,
      idSuffix,
    }));
    const expectedProductCreations = sourceCreations.length === 0 ? [] : productCreations;
    const projectedSourceCreations = sourceCreations.map(({ entityClass, x, y }, index) => ({
      originalClass: entityClass,
      x,
      y,
      idSuffix: productCreations[index]?.idSuffix,
    }));
    assert.deepEqual(projectedSourceCreations, expectedProductCreations, `${vector.id}: native creation identity/order/coordinates`);
    assert.equal(productResult.nativeSuccessCount, expectedProductCreations.length, `${vector.id}: native success count`);
    for (const creation of productCreations) {
      const unit = world.units[`cpu-1-${creation.idSuffix}`];
      if (sourceCreations.length === 0) {
        assert.equal(unit, undefined, `${vector.id}: blocked/flagged vector must not spawn ${creation.idSuffix}`);
      } else {
        assert.deepEqual(unit?.position, { x: creation.x, y: creation.y }, `${vector.id}: ${creation.idSuffix} position`);
        assert.equal(unit?.kind, k01ReinforcementAdapter.find(({ idSuffix }) => idSuffix === creation.idSuffix)?.projectKind, `${vector.id}: ${creation.idSuffix} project identity`);
        const sourceRecord = world.sourceRuntimeProfile?.state.entityRuntime.entities.find(
          (record) => record.semanticUnitId === unit?.id && record.active,
        );
        assert.equal(sourceRecord?.originalClass, creation.originalClass, `${vector.id}: ${creation.idSuffix} source class`);
        assert.deepEqual(sourceRecord?.position, { x: creation.x, y: creation.y }, `${vector.id}: ${creation.idSuffix} source position`);
      }
    }
  }
});

function createK01ParityWorld() {
  const map = createImjinrokMapScaffold(imjinrokK01Scenario.mapId);
  assert.ok(map, "canonical K01 map scaffold");
  const world = createInitialWorldState(map, ["local-player", "cpu-1"], imjinrokK01Scenario);
  const beacon = createUnitState("parity-beacon", "local-player", "beacon", { x: 20, y: 20 });
  world.units[beacon.id] = beacon;
  appendConstructionCompletedEvent(world, beacon);

  for (const unit of Object.values(world.units)) {
    if (unit.playerId === "cpu-1" && unitDefinitions[unit.kind].category === "building") {
      removeUnitFromWorld(world, unit.id);
    }
  }
  return world;
}
