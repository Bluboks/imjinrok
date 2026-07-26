import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  deriveOriginalEffectiveInterval,
  deriveOriginalFeedbackAdjustment,
  evaluateOriginalMainLoopIteration,
  evaluateOriginalSchedulerAttempt,
  evaluateOriginalWallClockGate,
  extractK01ProjectilePoolCadence,
  selectOriginalBaseInterval,
  traceOriginalSchedulerCalls,
} from "./extract-k01-projectile-pool-cadence.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("recovers the sole projectile-pool scheduling chain and integration gate", () => {
  const report = extractK01ProjectilePoolCadence();

  assert.equal(
    report.question,
    "How often is original projectile-pool updater 0x00447360 invoked, what static scheduling/call-chain controls that cadence, and can that cadence be mapped exactly to this project's fixed simulation tick without an inferred multiplier?",
  );
  assert.equal(
    report.evidenceStatus,
    "static-proven-original-pool-invocation-scheduling",
  );
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.integrationStatus, "gated-no-exact-24hz-rule");
  assert.match(report.exactScope, /raw input\/return/);
  assert.deepEqual(report.invocationCount, {
    perAcceptedOriginalStep: 1,
    perRejectedSchedulerAttempt: 0,
    perPoolInvocationSlotPasses: 1,
    slotsVisitedPerPass: 100,
    backlogBehavior:
      "the timestamp is advanced or caught up once; no loop emits additional accepted steps or pool calls",
  });
  assert.equal(report.wallClock.fixedFramesPerSecond, null);
  assert.deepEqual(
    report.wallClock.selectorBaseIntervalsMilliseconds,
    {
      "0": 64,
      "1": 60,
      "2": 50,
      "3": 40,
      "unsigned-greater-than-3": 30,
    },
  );
  assert.equal(report.projectTickComparison.projectTickHz, 24);
  assert.equal(
    report.projectTickComparison.nominalBaseIntervalToProjectTicks,
    "6/5",
  );
  assert.equal(report.projectTickComparison.exactDirectMultiplier, null);
  assert.equal(report.callEdges.length, 20);
  assert.deepEqual(
    report.callEdges
      .filter((edge) => edge.caller === "0x00447bc0")
      .map((edge) => `${edge.callsite}->${edge.callee}`),
    [
      "0x00447bc8->0x00406af0",
      "0x00447bf6->0x0046f870",
      "0x00447c00->0x004400b0",
      "0x00447c18->0x004464c0",
      "0x00447c39->0x00447ed0",
      "0x00447c56->0x0043dc90",
      "0x00447c60->0x004676e0",
      "0x00447c65->0x00447e10",
      "0x00447c7c->0x00477f50",
      "0x00447c9e->0x00443080",
      "0x00447cb0->0x004430b0",
      "0x00447cb8->0x00447360",
      "0x00447ce9->0x0046feb0",
    ],
  );
  assert.equal(report.analyzedFunctions.length, 15);
  assert.equal(report.codeAnchors.length, 21);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.deepEqual(
    report.imports,
    [
      {
        dll: "KERNEL32.dll",
        name: "GetModuleHandleA",
        iatVa: "0x004b7170",
      },
      {
        dll: "USER32.dll",
        name: "PeekMessageA",
        iatVa: "0x004b7244",
      },
      {
        dll: "WINMM.dll",
        name: "timeGetTime",
        iatVa: "0x004b7270",
      },
    ],
  );
  assert.deepEqual(
    report.testVectors.map((vector) => vector.id),
    [
      "base-selector-boundaries",
      "mode-one-ignores-selector",
      "fiftieth-step-high-counter-increments",
      "fiftieth-step-low-counter-decrements",
      "message-feedback-writes-minus-plus-or-unchanged",
      "clock-rejects-before-boundary",
      "clock-accepts-at-boundary",
      "clock-drops-backlog-to-one-call",
      "clock-dword-wrap-boundary",
      "scheduler-pre-update-failure",
      "scheduler-command-readiness-failure",
      "accepted-twentieth-step-calls-pool-once",
      "complete-accepted-scheduler-direct-call-order",
      "queued-message-prevents-scheduler-attempt",
      "state-twenty-three-mode-gate-failure",
    ],
  );
  for (const vector of report.testVectors) {
    if ("results" in vector) {
      assert.deepEqual(vector.results, vector.expected, vector.id);
    } else {
      assert.deepEqual(vector.result, vector.expected, vector.id);
    }
  }
});

test("replays selector and exact fixed-width feedback boundaries", () => {
  assert.equal(
    selectOriginalBaseInterval({
      modeWord: 0,
      selector: 3,
      baseInterval: 5,
    }),
    0xfffffffb,
  );
  assert.equal(
    selectOriginalBaseInterval({
      modeWord: 1,
      selector: 0xffffffff,
      baseInterval: 0xffffffff,
    }),
    0xffffffff,
  );
  assert.deepEqual(
    deriveOriginalEffectiveInterval({
      modeWord: 0,
      selector: 2,
      feedbackAdjustment: 0xffffffff,
      acceptedStepCounter: 49,
      periodicCounterWord: 0xffff,
    }),
    {
      selectedBaseInterval: 50,
      effectiveInterval: 49,
      feedbackAdjustmentAfter: 0,
      periodicCounterWordAfter: 0xffff,
    },
  );
  assert.deepEqual(
    deriveOriginalEffectiveInterval({
      modeWord: 0,
      selector: 2,
      feedbackAdjustment: 20,
      acceptedStepCounter: 50,
      periodicCounterWord: 11,
    }),
    {
      selectedBaseInterval: 50,
      effectiveInterval: 70,
      feedbackAdjustmentAfter: 0,
      periodicCounterWordAfter: 0,
    },
  );
  assert.deepEqual(
    deriveOriginalEffectiveInterval({
      modeWord: 0,
      selector: 2,
      feedbackAdjustment: -1,
      acceptedStepCounter: 50,
      periodicCounterWord: 3,
    }),
    {
      selectedBaseInterval: 50,
      effectiveInterval: 49,
      feedbackAdjustmentAfter: 0,
      periodicCounterWordAfter: 0,
    },
  );
  assert.equal(
    deriveOriginalFeedbackAdjustment({
      historyReadyDword: 0,
      comparisonInput: 100,
      matchingRecordFound: true,
      selectedTimestamp: 101,
      previousAdjustment: 0xffffffff,
    }),
    0xffffffff,
  );
  assert.equal(
    deriveOriginalFeedbackAdjustment({
      historyReadyDword: 1,
      comparisonInput: 100,
      matchingRecordFound: false,
      selectedTimestamp: 101,
      previousAdjustment: 5,
    }),
    5,
  );
  assert.equal(
    deriveOriginalFeedbackAdjustment({
      historyReadyDword: 1,
      comparisonInput: 100,
      matchingRecordFound: true,
      selectedTimestamp: 100,
      previousAdjustment: -1,
    }),
    0xffffffff,
  );
});

test("replays millisecond threshold, backlog, and DWORD wrap branches", () => {
  assert.deepEqual(
    evaluateOriginalWallClockGate({
      currentMilliseconds: 1075,
      lastAcceptedMilliseconds: 1000,
      effectiveInterval: 50,
    }),
    {
      accepted: true,
      elapsed: 75,
      lastAcceptedMilliseconds: 1050,
    },
  );
  assert.deepEqual(
    evaluateOriginalWallClockGate({
      currentMilliseconds: 0x21,
      lastAcceptedMilliseconds: 0xfffffff0,
      effectiveInterval: 50,
    }),
    {
      accepted: false,
      elapsed: 49,
      lastAcceptedMilliseconds: 0xfffffff0,
    },
  );
  assert.deepEqual(
    evaluateOriginalWallClockGate({
      currentMilliseconds: 5,
      lastAcceptedMilliseconds: 5,
      effectiveInterval: 0x80000000,
    }),
    {
      accepted: true,
      elapsed: 0,
      lastAcceptedMilliseconds: 5,
    },
  );
  assert.throws(
    () =>
      evaluateOriginalWallClockGate({
        currentMilliseconds: -1,
        lastAcceptedMilliseconds: 0,
        effectiveInterval: 50,
      }),
    /currentMilliseconds must be an integer in 0\.\.4294967295/,
  );
});

test("replays every scheduler rejection and exact call count", () => {
  const base = {
    transitionGuardWord: 0,
    mainStateWord: 3,
    preUpdateReturn: 0,
    clockGateReturn: 1,
    commandGateModeWord: 0,
    commandReadinessReturn: 1,
    acceptedStepCounter: 20,
  };
  assert.deepEqual(
    evaluateOriginalSchedulerAttempt({
      ...base,
      clockGateReturn: 0,
    }),
    {
      accepted: false,
      rejection: "clock-gate-returned-zero",
      acceptedStepCounter: 20,
      timestampHistoryCall: null,
      projectilePoolCallCount: 0,
    },
  );
  assert.deepEqual(
    evaluateOriginalSchedulerAttempt(base),
    {
      accepted: true,
      rejection: null,
      acceptedStepCounter: 21,
      timestampHistoryCall: "update",
      projectilePoolCallCount: 1,
    },
  );
  assert.deepEqual(
    evaluateOriginalSchedulerAttempt({
      ...base,
      transitionGuardWord: 1,
    }),
    {
      accepted: false,
      rejection: "early-transition",
      acceptedStepCounter: 20,
      timestampHistoryCall: null,
      projectilePoolCallCount: 0,
    },
  );
  assert.deepEqual(
    evaluateOriginalMainLoopIteration({
      messagePending: false,
      idleBlocked: false,
      mainStateWord: 23,
      modeWord: 1,
    }),
    {
      clockSampled: true,
      schedulerAttemptCount: 1,
    },
  );
  assert.deepEqual(
    traceOriginalSchedulerCalls({
      transitionGuardWord: 1,
      mainStateWord: 3,
      preUpdateReturn: 0,
      commandGateModeWord: 0,
      preClockInitializedDword: 0,
      clockGateReturn: 1,
      commandReadinessReturn: 1,
      acceptedStepCounter: 19,
      postPoolSideEffectModeDword: 1,
    }),
    {
      preClockAndGateCalls: [
        "0x00406af0",
        "0x0046f870",
        "0x004400b0",
      ],
      acceptedStepCalls: [],
      postPoolCalls: [],
    },
  );
  assert.deepEqual(
    traceOriginalSchedulerCalls({
      transitionGuardWord: 0,
      mainStateWord: 3,
      preUpdateReturn: 0,
      commandGateModeWord: 0,
      preClockInitializedDword: 1,
      clockGateReturn: 0,
      commandReadinessReturn: 1,
      acceptedStepCounter: 19,
      postPoolSideEffectModeDword: 1,
    }),
    {
      preClockAndGateCalls: [
        "0x00406af0",
        "0x004464c0",
        "0x0043dc90",
        "0x004676e0",
        "0x00447e10",
      ],
      acceptedStepCalls: [],
      postPoolCalls: [],
    },
  );
  assert.deepEqual(
    traceOriginalSchedulerCalls({
      transitionGuardWord: 0,
      mainStateWord: 3,
      preUpdateReturn: 0,
      commandGateModeWord: 1,
      preClockInitializedDword: 0,
      clockGateReturn: 1,
      commandReadinessReturn: 0,
      acceptedStepCounter: 0,
      postPoolSideEffectModeDword: 0,
    }),
    {
      preClockAndGateCalls: [
        "0x00406af0",
        "0x004464c0",
        "0x004676e0",
        "0x00447e10",
      ],
      acceptedStepCalls: ["0x00447360"],
      postPoolCalls: [],
    },
  );
  assert.throws(
    () =>
      evaluateOriginalMainLoopIteration({
        messagePending: 1,
        idleBlocked: false,
        mainStateWord: 3,
        modeWord: 1,
      }),
    /messagePending must be a boolean/,
  );
});

test("rejects a changed executable and stale static-analysis input loudly", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-projectile-cadence-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const originalExecutable = readFileSync(
    join(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
  );
  const changedExecutable = Buffer.from(originalExecutable);
  changedExecutable[0x47cb8] ^= 0xff;
  const changedExecutablePath = join(temporaryDirectory, "changed.exe");
  writeFileSync(changedExecutablePath, changedExecutable);
  assert.throws(
    () =>
      extractK01ProjectilePoolCadence({
        executablePath: changedExecutablePath,
      }),
    /original EXE SHA-256/,
  );

  const references = JSON.parse(
    readFileSync(
      join(
        repositoryRoot,
        "analysis/generated/imjinrok2/references.json",
      ),
      "utf8",
    ),
  );
  references.sourceSha256 = "0".repeat(64);
  const staleReferencesPath = join(temporaryDirectory, "references.json");
  writeFileSync(
    staleReferencesPath,
    `${JSON.stringify(references)}\n`,
  );
  assert.throws(
    () =>
      extractK01ProjectilePoolCadence({
        referencesPath: staleReferencesPath,
      }),
    /references\.json source SHA-256/,
  );
});
