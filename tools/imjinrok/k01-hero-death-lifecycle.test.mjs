import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  advanceActionStateSix,
  advanceActionStateSixteen,
  evaluateHealthZeroDeathEntry,
  evaluateOriginalReferenceValidity,
  evaluateStateSevenAndOuterRelease,
  extractK01HeroDeathLifecycle,
  incrementGenerationForCreate,
  reproduceDefaultActionSixTimeline,
  selectPostActionSixState,
} from "./extract-k01-hero-death-lifecycle.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("recovers the scoped K01 hero death, release, and stale-target lifecycle", () => {
  const report = extractK01HeroDeathLifecycle();
  assert.equal(
    report.question,
    "For K01 Gwon Yul and Ryu Seong-ryong, after signed health reaches zero, what exact original update path enters and advances the death state, when is the entity record deactivated or released, and are other entities’ current-target references eagerly cleared or only made invalid by slot/reference lifecycle?",
  );
  assert.equal(
    report.source.sha256,
    "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e",
  );
  assert.equal(
    report.evidenceStatus,
    "static-proven-scoped-original-death-lifecycle",
  );
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(
    report.integrationStatus,
    "gated-no-exact-original-to-project-time-or-lifecycle-map",
  );
  assert.deepEqual(
    report.heroes.map((hero) => ({
      internalClass: hero.internalClass,
      call: hero.typeInitializerCall,
      flags74: hero.creationDefaultFlags74Dword,
      flags84: hero.creationDefaultFlags84Word,
      cadence: hero.creationDefaultPhaseCadenceByte,
      phases: hero.creationDefaultDeathPhaseCount,
      afterSix: hero.creationDefaultStateAfterActionSixCompletion,
      stateSevenReturn: hero.creationDefaultStateSevenDispatcherReturn,
    })),
    [
      {
        internalClass: 76,
        call: "0x0045d998",
        flags74: "0x00880805",
        flags84: "0x00000014",
        cadence: 1,
        phases: 8,
        afterSix: 7,
        stateSevenReturn: 0,
      },
      {
        internalClass: 78,
        call: "0x0045daa1",
        flags74: "0x00882805",
        flags84: "0x00000014",
        cadence: 1,
        phases: 8,
        afterSix: 7,
        stateSevenReturn: 0,
      },
    ],
  );
  assert.equal(report.analyzedFunctions.length, 22);
  assert.equal(report.callEdges.length, 20);
  assert.equal(report.codeAnchors.length, 50);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.deepEqual(report.animationDispatch, [
    {
      internalClass: 76,
      destination: "0x0042a9da",
      countStore: "0x0042aa15",
      switchAddress: "0x004292b3",
      storedDeathPhaseCount: 8,
    },
    {
      internalClass: 78,
      destination: "0x0042ab2a",
      countStore: "0x0042ab65",
      switchAddress: "0x004292b3",
      storedDeathPhaseCount: 8,
    },
  ]);
  assert.deepEqual(report.deathActionDispatch, [
    {
      actionState: 6,
      destination: "0x0043cdfa",
      role: "action-six",
      switchAddress: "0x0043cda3",
    },
    {
      actionState: 7,
      destination: "0x0043ce6e",
      role: "action-seven",
      switchAddress: "0x0043cda3",
    },
    {
      actionState: 0x0f,
      destination: "0x0043d289",
      role: "unrelated-clearer-path",
      switchAddress: "0x0043cda3",
    },
    {
      actionState: 0x16,
      destination: "0x0043ce2e",
      role: "delayed-death",
      switchAddress: "0x0043cda3",
    },
  ]);
  assert.deepEqual(report.targetClearer, {
    function: "0x00426bf0",
    directCallers: ["0x00426c20", "0x0042de00"],
    confirmedScopedDeathReleasePathCallsIt: false,
    limitation:
      "This proves no direct eager clear in the confirmed scoped death/release chain. Alias-based writes and unrelated command paths remain outside this proof.",
  });
  assert.deepEqual(
    report.currentTargetWriteEvidence.confirmedEntityRecordSites.map(
      ({ address, field, width }) => ({ address, field, width }),
    ),
    [
      {
        address: "0x004168b5",
        field: "+0x122/+0x124",
        width: "DWORD",
      },
      { address: "0x00426bf5", field: "+0x122", width: "WORD" },
      { address: "0x00426bfc", field: "+0x124", width: "WORD" },
      { address: "0x004376fd", field: "+0x122", width: "WORD" },
      { address: "0x00437704", field: "+0x124", width: "WORD" },
    ],
  );
  assert.equal(
    report.currentTargetWriteEvidence.scopedDeathReleaseDirectWriteFound,
    false,
  );
  assert.deepEqual(
    report.currentTargetWriteEvidence.contextFilteredRawDisplacementExclusion,
    {
      address: "0x0049523b",
      functionEntry: "0x004950f0",
      containingBodyRange: "0x004950f0-0x00495265",
      reason:
        "DWORD [ESI+0x124] is among contiguous +0x120/+0x128/+0x134 fields in a different record layout, not the 0x558-byte entity current-target record.",
    },
  );
  assert.deepEqual(
    report.currentTargetWriteEvidence.scopedRootDirectWriteScan.map(
      ({ functionEntry, directCurrentTargetWriteFound }) => ({
        functionEntry,
        directCurrentTargetWriteFound,
      }),
    ),
    [
      {
        functionEntry: "0x004233f0",
        directCurrentTargetWriteFound: false,
      },
      {
        functionEntry: "0x00423740",
        directCurrentTargetWriteFound: false,
      },
      {
        functionEntry: "0x0043c9c0",
        directCurrentTargetWriteFound: false,
      },
      {
        functionEntry: "0x00447360",
        directCurrentTargetWriteFound: false,
      },
      {
        functionEntry: "0x00483aa0",
        directCurrentTargetWriteFound: false,
      },
    ],
  );
  assert.deepEqual(
    report.testVectors.map((vector) => vector.id),
    [
      "signed-health-positive-one",
      "signed-health-zero-enters-six",
      "signed-health-minus-one-enters-six",
      "action-6-excluded",
      "action-7-excluded",
      "action-16-excluded",
      "byte-1f0-gate-failure",
      "phase-before-last-advances-to-last",
      "phase-equality-completes",
      "phase-count-wrap-normalizes",
      "runtime-bit-one-action-six-branch",
      "repeat-counter-word-wrap-delays-completion",
      "cadence-byte-no-progress",
      "cadence-byte-signed-wrap-no-progress",
      "default-timeline-incoming-counter-zero",
      "default-timeline-incoming-counter-one",
      "class-flags-select-immediate-seven",
      "zero-flags-select-delayed-sixteen",
      "delay-below-boundary",
      "delay-equality-enters-seven",
      "delay-signed-low-extreme-increments-without-overflow",
      "delay-signed-high-extreme-transitions-without-increment",
      "health-zero-invalidates-stale-reference-before-release",
      "k01-alive-check-health-zero-while-slot-active",
      "generation-mismatch-after-reuse",
      "active-release-boundary",
      "state-seven-runtime-retain-bit-skips-release",
      "already-inactive-slot-skips-release",
      "generation-word-wrap-on-later-create",
    ],
  );
  for (const vector of report.testVectors) {
    assert.deepEqual(vector.result, vector.expected, vector.id);
  }
});

test("hard-codes signed-health entry gates and action exclusions", () => {
  assert.deepEqual(
    evaluateHealthZeroDeathEntry({
      globalHealthGateWord: 1,
      healthWord: 0,
      actionState: 5,
      byte1f0: 1,
      phaseCadenceCounterByte: 0,
    }),
    {
      entered: false,
      reason: "global-health-gate-nonzero",
      actionState: 5,
    },
  );
  assert.deepEqual(
    evaluateHealthZeroDeathEntry({
      globalHealthGateWord: 0,
      healthWord: -1,
      actionState: 0x16,
      byte1f0: 1,
      phaseCadenceCounterByte: 0,
    }),
    {
      entered: false,
      reason: "death-action-excluded",
      actionState: 0x16,
    },
  );
  assert.deepEqual(
    evaluateHealthZeroDeathEntry({
      globalHealthGateWord: 0,
      healthWord: 0,
      actionState: 5,
      byte1f0: 2,
      phaseCadenceCounterByte: 0,
    }),
    {
      entered: false,
      reason: "byte-0x1f0-not-one",
      actionState: 5,
      dispatcherReturn: 0,
    },
  );
});

test("replays action 6 cadence, phase, completion, and raw special branches", () => {
  const common = {
    phaseCadenceByte: 1,
    phaseCountWord: 8,
    repeatCounterWord: 0,
    repeatLimitWord: 0,
    flags84Word: 0x14,
  };
  assert.deepEqual(
    advanceActionStateSix({
      ...common,
      phaseCadenceCounterByte: 0,
      phaseWord: 0,
    }),
    {
      handlerReturn: 0,
      branch: "cadence-no-progress",
      phaseCadenceCounterByte: 1,
      phaseWord: 0,
      repeatCounterWord: 0,
    },
  );
  assert.deepEqual(
    advanceActionStateSix({
      ...common,
      flags84Word: 0x01,
      phaseCadenceCounterByte: 1,
      phaseWord: 4,
    }),
    {
      handlerReturn: 1,
      branch: "raw-bit-one-branch",
      phaseCadenceCounterByte: 1,
      phaseWord: 4,
      repeatCounterWord: 0,
    },
  );
  assert.deepEqual(
    advanceActionStateSix({
      ...common,
      phaseCadenceCounterByte: 1,
      phaseWord: 7,
    }),
    {
      handlerReturn: 1,
      branch: "raw-bit-four-completion",
      visualStateByte: 7,
      phaseCadenceCounterByte: 0,
      phaseWord: 7,
      repeatCounterWord: 0,
    },
  );
  assert.deepEqual(
    advanceActionStateSix({
      ...common,
      flags84Word: 0x0b,
      phaseCadenceCounterByte: 1,
      phaseWord: 4,
    }),
    {
      handlerReturn: 1,
      branch: "raw-bit-two-branch",
      phaseCadenceCounterByte: 1,
      phaseWord: 4,
      repeatCounterWord: 0,
    },
  );
  assert.equal(selectPostActionSixState(0x14), 7);
  assert.equal(selectPostActionSixState(0), 0x16);

  let phaseWord = 0;
  let phaseCadenceCounterByte = 0;
  const observed = [];
  for (let invocation = 1; invocation <= 16; invocation += 1) {
    const result = advanceActionStateSix({
      ...common,
      phaseCadenceCounterByte,
      phaseWord,
    });
    observed.push([invocation, result.phaseWord, result.handlerReturn]);
    phaseWord = result.phaseWord;
    phaseCadenceCounterByte = result.phaseCadenceCounterByte;
  }
  assert.deepEqual(observed, [
    [1, 0, 0],
    [2, 1, 0],
    [3, 1, 0],
    [4, 2, 0],
    [5, 2, 0],
    [6, 3, 0],
    [7, 3, 0],
    [8, 4, 0],
    [9, 4, 0],
    [10, 5, 0],
    [11, 5, 0],
    [12, 6, 0],
    [13, 6, 0],
    [14, 7, 0],
    [15, 7, 0],
    [16, 7, 1],
  ]);
  assert.deepEqual(
    reproduceDefaultActionSixTimeline({
      initialCadenceCounterByte: 0,
    }),
    {
      initialCadenceCounterByte: 0,
      firstVisualSevenWriteInvocation: 2,
      actionSixCompletionInvocation: 16,
      actionSevenProcessedInvocation: 17,
      retainedPhaseWord: 7,
      retainedCadenceCounterByte: 0,
    },
  );
  assert.deepEqual(
    reproduceDefaultActionSixTimeline({
      initialCadenceCounterByte: 1,
    }),
    {
      initialCadenceCounterByte: 1,
      firstVisualSevenWriteInvocation: 1,
      actionSixCompletionInvocation: 15,
      actionSevenProcessedInvocation: 16,
      retainedPhaseWord: 7,
      retainedCadenceCounterByte: 0,
    },
  );
});

test("replays action 0x16 signed-WORD below, equality, and extreme boundaries", () => {
  assert.deepEqual(
    advanceActionStateSixteen({
      counterWord: -1,
      limitWord: 0,
      flags74Dword: 2,
      visualStateByte: 7,
    }),
    {
      actionState: 0x16,
      counterWord: 0,
      visualStateByte: 0x12,
      visualDirtyByte: 1,
      overflowPossible: false,
    },
  );
  assert.deepEqual(
    advanceActionStateSixteen({
      counterWord: 0,
      limitWord: 0,
      flags74Dword: 2,
      visualStateByte: 0x12,
    }),
    {
      actionState: 7,
      counterWord: 0,
      visualStateByte: 0x12,
      visualDirtyByte: 0,
      overflowPossible: false,
    },
  );
  assert.deepEqual(
    advanceActionStateSixteen({
      counterWord: 32767,
      limitWord: -32768,
      flags74Dword: 0,
      visualStateByte: 7,
    }),
    {
      actionState: 7,
      counterWord: 32767,
      visualStateByte: 7,
      visualDirtyByte: 0,
      overflowPossible: false,
    },
  );
});

test("separates immediate health invalidation, release, and later generation mismatch", () => {
  const reference = 0x12340005;
  assert.equal(
    evaluateOriginalReferenceValidity({
      slotTableWord: 1,
      healthWord: 0,
      byte1f0: 1,
      suppliedFullReference: reference,
      recordFullReference: reference,
      requireByte1f0: false,
      requireFullReference: true,
    }),
    false,
  );
  assert.deepEqual(
    evaluateStateSevenAndOuterRelease({
      flags74Dword: 0x00882805,
      slotTableWord: 1,
      activeListContainsSlot: true,
    }),
    {
      stateSevenHelperReturn: 1,
      dispatcherReturn: 0,
      releaseCalled: true,
      activeAfter: false,
      slotTableWordAfter: 0,
      generationMutated: false,
    },
  );
  assert.deepEqual(
    evaluateStateSevenAndOuterRelease({
      flags74Dword: 0x80,
      slotTableWord: 1,
      activeListContainsSlot: true,
    }),
    {
      stateSevenHelperReturn: 1,
      dispatcherReturn: 1,
      releaseCalled: false,
      activeAfter: true,
      slotTableWordAfter: 1,
      generationMutated: false,
    },
  );
  assert.equal(incrementGenerationForCreate(0x1234), 0x1235);
  assert.equal(
    evaluateOriginalReferenceValidity({
      slotTableWord: 1,
      healthWord: 100,
      byte1f0: 1,
      suppliedFullReference: reference,
      recordFullReference: 0x12350005,
      requireByte1f0: true,
      requireFullReference: true,
    }),
    false,
  );
});

test("rejects malformed fixed-width and boolean inputs loudly", () => {
  assert.throws(
    () =>
      evaluateHealthZeroDeathEntry({
        globalHealthGateWord: 0,
        healthWord: 32768,
        actionState: 5,
        byte1f0: 1,
        phaseCadenceCounterByte: 0,
      }),
    /healthWord must be an integer in -32768\.\.32767/,
  );
  assert.throws(
    () =>
      evaluateOriginalReferenceValidity({
        slotTableWord: 1,
        healthWord: 1,
        byte1f0: 1,
        suppliedFullReference: 1,
        recordFullReference: 1,
        requireByte1f0: "yes",
        requireFullReference: true,
      }),
    /requireByte1f0 must be boolean/,
  );
  assert.throws(
    () =>
      reproduceDefaultActionSixTimeline({
        initialCadenceCounterByte: 128,
      }),
    /initialCadenceCounterByte must be an integer in -128\.\.127/,
  );
});

test("rejects stale analysis and tampered original input", (t) => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "k01-death-fixture-"));
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

  const staleSeeds = JSON.parse(
    readFileSync(
      join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json"),
      "utf8",
    ),
  );
  staleSeeds.sourceSha256 = "0".repeat(64);
  const staleSeedsPath = join(fixtureDirectory, "stale-seeds.json");
  writeFileSync(staleSeedsPath, `${JSON.stringify(staleSeeds)}\n`);
  assert.throws(
    () => extractK01HeroDeathLifecycle({ seedsPath: staleSeedsPath }),
    /seed analysis .* source SHA-256 mismatch/,
  );

  const tamperedExecutablePath = join(fixtureDirectory, "tampered.exe");
  cpSync(
    join(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
    tamperedExecutablePath,
  );
  const tampered = readFileSync(tamperedExecutablePath);
  tampered[0x200] ^= 0xff;
  writeFileSync(tamperedExecutablePath, tampered);
  assert.throws(
    () =>
      extractK01HeroDeathLifecycle({
        executablePath: tamperedExecutablePath,
      }),
    /original EXE SHA-256 mismatch/,
  );
});

test("rejects a fixture missing a required seeded function", (t) => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "k01-death-seeds-"));
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));
  const seeds = JSON.parse(
    readFileSync(
      join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json"),
      "utf8",
    ),
  );
  seeds.functions = seeds.functions.filter(
    (candidate) => candidate.entry !== "0x004233f0",
  );
  const path = join(fixtureDirectory, "missing-function.json");
  writeFileSync(path, `${JSON.stringify(seeds)}\n`);
  assert.throws(
    () => extractK01HeroDeathLifecycle({ seedsPath: path }),
    /Seed analysis is missing function 0x004233f0/,
  );
});

test("rejects an unexpected direct current-target write in a scoped root", (t) => {
  const fixtureDirectory = mkdtempSync(
    join(tmpdir(), "k01-death-target-write-"),
  );
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));
  const seeds = JSON.parse(
    readFileSync(
      join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json"),
      "utf8",
    ),
  );
  const actionSix = seeds.functions.find(
    (candidate) => candidate.entry === "0x004233f0",
  );
  actionSix.instructions[0].text =
    "MOV dword ptr [ESI + 0x122],EAX";
  const path = join(fixtureDirectory, "unexpected-target-write.json");
  writeFileSync(path, `${JSON.stringify(seeds)}\n`);
  assert.throws(
    () => extractK01HeroDeathLifecycle({ seedsPath: path }),
    /Scoped root 0x004233f0 directly writes entity current-target field/,
  );

  for (const [mnemonic, text] of [
    ["CMP", "CMP dword ptr [ESI + 0x122],EAX"],
    ["TEST", "TEST word ptr [ESI + 0x124],AX"],
  ]) {
    const readOnlySeeds = JSON.parse(
      readFileSync(
        join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json"),
        "utf8",
      ),
    );
    readOnlySeeds.functions.find(
      (candidate) => candidate.entry === "0x004233f0",
    ).instructions[0].text = text;
    const readOnlyPath = join(
      fixtureDirectory,
      `${mnemonic.toLowerCase()}-target-read.json`,
    );
    writeFileSync(readOnlyPath, `${JSON.stringify(readOnlySeeds)}\n`);
    assert.doesNotThrow(
      () => extractK01HeroDeathLifecycle({ seedsPath: readOnlyPath }),
      `${mnemonic} must remain a read-only current-target operand`,
    );
  }
});

test("rejects missing or mismatched canonical ownership for the raw-displacement exclusion", (t) => {
  const fixtureDirectory = mkdtempSync(
    join(tmpdir(), "k01-death-context-owner-"),
  );
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));
  const originalFunctions = JSON.parse(
    readFileSync(
      join(repositoryRoot, "analysis/generated/imjinrok2/functions.json"),
      "utf8",
    ),
  );

  const missing = structuredClone(originalFunctions);
  missing.functions = missing.functions.filter(
    (candidate) => candidate.entry !== "0x004950f0",
  );
  const missingPath = join(fixtureDirectory, "missing-owner.json");
  writeFileSync(missingPath, `${JSON.stringify(missing)}\n`);
  assert.throws(
    () => extractK01HeroDeathLifecycle({ functionsPath: missingPath }),
    /Function analysis is missing context-exclusion owner 0x004950f0/,
  );

  const mismatched = structuredClone(originalFunctions);
  mismatched.functions.find(
    (candidate) => candidate.entry === "0x004950f0",
  ).bodyRanges = ["0x004950f0-0x0049523a"];
  const mismatchedPath = join(fixtureDirectory, "mismatched-owner.json");
  writeFileSync(mismatchedPath, `${JSON.stringify(mismatched)}\n`);
  assert.throws(
    () => extractK01HeroDeathLifecycle({ functionsPath: mismatchedPath }),
    /0x0049523b is outside canonical body ranges for 0x004950f0/,
  );
});

test("rejects missing or tampered class-to-animation jump-table mappings", (t) => {
  const fixtureDirectory = mkdtempSync(
    join(tmpdir(), "k01-death-jump-tables-"),
  );
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));
  const jumpTables = JSON.parse(
    readFileSync(
      join(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json"),
      "utf8",
    ),
  );
  const animationTable = jumpTables.tables.find(
    (candidate) => candidate.switchAddress === "0x004292b3",
  );
  animationTable.cases.find(
    (candidate) => candidate.label === 76,
  ).destination = "0x0042ab2a";
  const tamperedPath = join(fixtureDirectory, "tampered-jump-tables.json");
  writeFileSync(tamperedPath, `${JSON.stringify(jumpTables)}\n`);
  assert.throws(
    () =>
      extractK01HeroDeathLifecycle({
        jumpTablesPath: tamperedPath,
      }),
    /Animation dispatch for class 76 mismatch/,
  );

  const actionTampered = JSON.parse(
    readFileSync(
      join(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json"),
      "utf8",
    ),
  );
  const actionTable = actionTampered.tables.find(
    (candidate) => candidate.switchAddress === "0x0043cda3",
  );
  actionTable.cases.find(
    (candidate) => candidate.label === 15,
  ).destination = "0x0043cdfa";
  const actionTamperedPath = join(
    fixtureDirectory,
    "tampered-action-jump-tables.json",
  );
  writeFileSync(
    actionTamperedPath,
    `${JSON.stringify(actionTampered)}\n`,
  );
  assert.throws(
    () =>
      extractK01HeroDeathLifecycle({
        jumpTablesPath: actionTamperedPath,
      }),
    /Action dispatch for state 0x0000000f mismatch/,
  );

  const missingAnimation = JSON.parse(
    readFileSync(
      join(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json"),
      "utf8",
    ),
  );
  missingAnimation.tables = missingAnimation.tables.filter(
    (candidate) => candidate.switchAddress !== "0x004292b3",
  );
  const missingPath = join(fixtureDirectory, "missing-jump-tables.json");
  writeFileSync(missingPath, `${JSON.stringify(missingAnimation)}\n`);
  assert.throws(
    () =>
      extractK01HeroDeathLifecycle({
        jumpTablesPath: missingPath,
      }),
    /missing animation initializer switch 0x004292b3/,
  );
});
