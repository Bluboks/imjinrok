import assert from "node:assert/strict";
import test from "node:test";

import {
  extractK01MissionResultLifecycle,
  resolveMissionTimers,
  runDistinctRawTickResultCommit,
  runK01MissionDispatcher,
  runK01MissionUpdateResultPath,
} from "./extract-k01-mission-result-lifecycle.mjs";
import {
  advanceK01MissionResult,
  createK01MissionResultState,
  resolveK01MissionTimers,
} from "../../packages/simulation/src/k01MissionResult.ts";

const HERO_ALIVE_INPUT = {
  listCount: 1,
  entries: [{ fullReference: 0x00020003, slotTableWord: 1, recordPositiveWord: 1, recordClassByte: 76 }],
  fallbackReference: 0,
  record: { slotTableWord: 1, healthSignedWord: 1, storedFullReference: 0x00020003 },
};

test("production timer kernel matches the independently extracted source vectors", () => {
  const report = extractK01MissionResultLifecycle();
  assert.equal(report.source.sha256, "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e");
  assert.equal(report.evidenceStatus, "static-proven-k01-mission-result-lifecycle");

  for (const vector of report.testVectors) {
    const sourceResult = resolveMissionTimers({
      winTimer: vector.input.winTimer,
      lossTimer: vector.input.lossTimer,
      resultClock: vector.input.resultClock,
    }).result;
    const productResult = resolveK01MissionTimers({
      clockMilliseconds: vector.input.resultClock,
      winTimer: vector.input.winTimer,
      lossTimer: vector.input.lossTimer,
    }).result;
    assert.equal(productResult, sourceResult, vector.id);
  }

  const additionalVectors = [
    { id: "zero-disabled", input: { winTimer: 0, lossTimer: 0, resultClock: 2002 } },
    { id: "wrapped-loss-mature", input: { winTimer: 0, lossTimer: 3000, resultClock: 0 } },
    { id: "simultaneous-win-first", input: { winTimer: 1, lossTimer: 1, resultClock: 2002 } },
  ];
  for (const vector of additionalVectors) {
    const sourceResult = resolveMissionTimers(vector.input).result;
    const productResult = resolveK01MissionResultTimers(vector.input);
    assert.equal(productResult, sourceResult, vector.id);
  }
});

function resolveK01MissionResultTimers(input) {
  return resolveK01MissionTimers({
    clockMilliseconds: input.resultClock,
    winTimer: input.winTimer,
    lossTimer: input.lossTimer,
  }).result;
}

test("production updater preserves source latch order and beacon bypass", () => {
  const sourceInput = {
    lossTimer: 0,
    resultClock: 500,
    currentPlayer: -1,
    activeCount: 0,
    activeEntries: [],
    beaconReturn: 0,
    hero76: HERO_ALIVE_INPUT,
    hero78: { ...HERO_ALIVE_INPUT, entries: [{ ...HERO_ALIVE_INPUT.entries[0], recordClassByte: 78 }] },
  };
  const source = runK01MissionUpdateResultPath(sourceInput);
  const product = advanceK01MissionResult({
    state: createK01MissionResultState({ clockMilliseconds: 500 }),
    rawTick: 1,
    generalPresent: () => false,
    runBeacon: () => 0,
    heroAlive: () => true,
  });
  assert.equal(product.result, 0);
  assert.equal(product.state.lossTimer, source.lossTimer);

  let heroCalled = false;
  const beaconSource = runK01MissionUpdateResultPath({ ...sourceInput, beaconReturn: 1 });
  const beaconProduct = advanceK01MissionResult({
    state: createK01MissionResultState({ clockMilliseconds: 500 }),
    rawTick: 1,
    generalPresent: () => false,
    runBeacon: () => ({ triggerFlag: 1, scriptPostState: 0 }),
    heroAlive: () => {
      heroCalled = true;
      return false;
    },
  });
  assert.equal(beaconProduct.result, beaconSource.returnAx);
  assert.equal(beaconProduct.state.lossTimer, beaconSource.lossTimer);
  assert.equal(heroCalled, false);
});

test("production dispatcher gates and distinct-tick cache match the source helpers", () => {
  const gateVectors = [
    { id: "source-gate", source: { gateC06e34: 1, gate7c627c: 0, gate7c627e: 0 }, product: { c06e34: 1 }, expected: 0 },
    { id: "forced-victory", source: { gateC06e34: 0, gate7c627c: 1, gate7c627e: 0 }, product: { forcedVictory: 1 }, expected: 1 },
    { id: "forced-defeat", source: { gateC06e34: 0, gate7c627c: 0, gate7c627e: 1 }, product: { forcedDefeat: 1 }, expected: -1 },
  ];
  for (const vector of gateVectors) {
    const source = runK01MissionDispatcher({
      ...vector.source,
      winTimer: 0,
      lossTimer: 0,
      resultClock: 1,
      stageSelector: 1,
      runK01Updater: () => ({ returnAx: 0, events: [] }),
    });
    const product = advanceK01MissionResult({
      state: createK01MissionResultState({ clockMilliseconds: 1 }),
      rawTick: 1,
      ...vector.product,
      generalPresent: () => true,
      runBeacon: () => 0,
      heroAlive: () => true,
    });
    assert.equal(product.result, vector.expected, vector.id);
    assert.equal(product.result, source.resultAx === 0xffff ? -1 : source.resultAx, vector.id);
  }

  let productCallbacks = 0;
  const firstProduct = advanceK01MissionResult({
    state: createK01MissionResultState({ clockMilliseconds: 1 }),
    rawTick: 10,
    generalPresent: () => true,
    runBeacon: () => {
      productCallbacks += 1;
      return 0;
    },
    heroAlive: () => true,
  });
  const repeatedProduct = advanceK01MissionResult({
    state: firstProduct.state,
    rawTick: 10,
    generalPresent: () => true,
    runBeacon: () => {
      productCallbacks += 1;
      return 1;
    },
    heroAlive: () => true,
  });
  const sourceRepeated = runDistinctRawTickResultCommit({
    rawGlobalTick: 10,
    cachedGlobalTick: 10,
    runDispatcher: () => ({ resultAx: 1, events: [] }),
  });
  assert.equal(repeatedProduct.skipped, true);
  assert.equal(productCallbacks, 1);
  assert.equal(sourceRepeated.returnValue, 0);

  const zeroState = createK01MissionResultState({ clockMilliseconds: 0 });
  const zeroFirst = advanceK01MissionResult({
    state: zeroState,
    rawTick: 1,
    generalPresent: () => false,
    runBeacon: () => 0,
    heroAlive: () => true,
  });
  const zeroSecond = advanceK01MissionResult({
    state: zeroFirst.state,
    rawTick: 2,
    generalPresent: () => false,
    runBeacon: () => 0,
    heroAlive: () => true,
  });
  const nonzero = advanceK01MissionResult({
    state: { ...zeroSecond.state, clockMilliseconds: 100 },
    rawTick: 3,
    generalPresent: () => false,
    runBeacon: () => 0,
    heroAlive: () => true,
  });
  assert.equal(zeroFirst.state.lossTimer, 0);
  assert.equal(zeroSecond.state.lossTimer, 0);
  assert.equal(nonzero.state.lossTimer, 100);
});
