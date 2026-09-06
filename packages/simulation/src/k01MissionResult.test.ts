import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceK01MissionResult,
  createK01MissionResultState,
  resolveK01MissionTimers,
} from "./k01MissionResult.js";

test("K01 mission timer resolver keeps strict milliseconds, wrap, and INT32_MIN semantics", () => {
  assert.equal(resolveK01MissionTimers({ clockMilliseconds: 2001, winTimer: 1, lossTimer: 0 }).result, 0);
  assert.equal(resolveK01MissionTimers({ clockMilliseconds: 2002, winTimer: 1, lossTimer: 0 }).result, 1);
  assert.equal(resolveK01MissionTimers({ clockMilliseconds: 1, winTimer: 0xfffffffe, lossTimer: 0 }).result, 0);
  assert.equal(resolveK01MissionTimers({ clockMilliseconds: 0x80000001, winTimer: 1, lossTimer: 0 }).result, 0);
  assert.equal(resolveK01MissionTimers({ clockMilliseconds: 2002, winTimer: 1, lossTimer: 1 }).winningTimer, "win");
});

test("K01 result commit caches before callbacks, latches zero loss once, and suppresses updater after maturity", () => {
  let beaconCalls = 0;
  let heroCalls = 0;
  const first = advanceK01MissionResult({
    state: createK01MissionResultState({ clockMilliseconds: 100 }),
    rawTick: 1,
    generalPresent: () => false,
    runBeacon: () => {
      beaconCalls += 1;
      return { triggerFlag: 0, scriptPostState: 0 };
    },
    heroAlive: () => {
      heroCalls += 1;
      return true;
    },
  });
  assert.equal(first.state.lossTimer, 100);
  assert.equal(first.state.cachedRawTick, 1);
  assert.equal(beaconCalls, 1);
  assert.equal(heroCalls, 2);

  const repeated = advanceK01MissionResult({
    state: first.state,
    rawTick: 1,
    generalPresent: () => true,
    runBeacon: () => {
      beaconCalls += 1;
      return 1;
    },
    heroAlive: () => false,
  });
  assert.equal(repeated.skipped, true);
  assert.equal(beaconCalls, 1);

  const matured = advanceK01MissionResult({
    state: createK01MissionResultState({ clockMilliseconds: 3002, lossTimer: 1 }),
    rawTick: 2,
    generalPresent: () => true,
    runBeacon: () => {
      beaconCalls += 1;
      return 1;
    },
    heroAlive: () => true,
  });
  assert.equal(matured.result, -1);
  assert.equal(matured.reason, "matured-timer");
  assert.equal(matured.state.maturedFlag, 1);
  assert.equal(beaconCalls, 1);
});

test("forced gates precede timer and beacon order", () => {
  const calls: string[] = [];
  const result = advanceK01MissionResult({
    state: createK01MissionResultState({ clockMilliseconds: 3002, winTimer: 1 }),
    rawTick: 9,
    forcedVictory: 1,
    generalPresent: () => {
      calls.push("general");
      return true;
    },
    runBeacon: () => {
      calls.push("beacon");
      return 0;
    },
    heroAlive: () => {
      calls.push("hero");
      return true;
    },
  });
  assert.equal(result.result, 1);
  assert.deepEqual(calls, []);
});
