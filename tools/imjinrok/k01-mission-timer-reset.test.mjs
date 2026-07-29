import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  ZERO_FILL,
  describeDwordZeroFill,
  extractK01MissionTimerReset,
  locateDwordInZeroFill,
  replaySparseDwordZeroFill,
  replayStandardMissionEntry,
} from "./extract-k01-mission-timer-reset.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const analysisDirectory = join(
  repositoryRoot,
  "analysis/generated/imjinrok2",
);
const executablePath = join(
  repositoryRoot,
  "original/imjinrok2/imjinrok2.exe",
);

test("extracts the exact standard K01 mission-entry timer reset chain", () => {
  const report = extractK01MissionTimerReset();

  assert.equal(report.analysisStatus, "static-proven");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "none");
  assert.equal(report.canonicalAnalysis.seedCount, 199);
  assert.equal(report.canonicalAnalysis.seedFunctionCount, 191);
  assert.equal(report.analyzedFunctions.length, 5);
  assert.equal(report.callEdges.length, 6);
  assert.equal(report.codeAnchors.length, 7);
  assert.ok(report.codeAnchors.every(({ matched }) => matched));
  assert.deepEqual(
    report.analyzedFunctions.map(
      ({ entry, instructionCount, basicBlockCount }) => [
        entry,
        instructionCount,
        basicBlockCount,
      ],
    ),
    [
      ["0x0045f9c0", 801, 209],
      ["0x00460ba0", 144, 17],
      ["0x0048dbe0", 147, 21],
      ["0x0048d410", 110, 31],
      ["0x0048d740", 20, 1],
    ],
  );
  assert.deepEqual(report.jumpTables.main, {
    switchAddress: "0x0045fd56",
    caseCount: 35,
    rawState: 1,
    normalizedLabel: 0,
    destination: "0x004600cb",
  });
  assert.equal(report.jumpTables.stage.caseCount, 28);
  assert.equal(report.jumpTables.stage.stageWord, 1);
  assert.equal(report.jumpTables.stage.destination, "0x0048d429");
  assert.deepEqual(report.jumpTables.stage.k01DestinationLabels, [1]);
  assert.equal(report.k01MapSource.value, "stagemap\\k01.map");
  assert.equal(report.k01MapSource.copiedByteLengthIncludingNul, 17);
  assert.deepEqual(
    report.timerReferences.map(
      ({ directReferenceCount, directWriteCount }) => [
        directReferenceCount,
        directWriteCount,
      ],
    ),
    [
      [20, 9],
      [70, 33],
    ],
  );
});

test("locks the exact half-open DWORD range and tracked offsets", () => {
  assert.deepEqual(describeDwordZeroFill(), ZERO_FILL);

  assert.deepEqual(
    pickLocation(locateDwordInZeroFill({ address: 0x007c5ed8 })),
    {
      covered: true,
      offset: 0,
      dwordIndex: 0,
    },
  );
  assert.deepEqual(
    pickLocation(locateDwordInZeroFill({ address: 0x0084373c })),
    {
      covered: true,
      offset: 0x7d864,
      dwordIndex: 0x1f619,
    },
  );
  assert.deepEqual(
    pickLocation(locateDwordInZeroFill({ address: 0x00843740 })),
    {
      covered: true,
      offset: 0x7d868,
      dwordIndex: 0x1f61a,
    },
  );
  assert.deepEqual(
    pickLocation(locateDwordInZeroFill({ address: 0x008438dc })),
    {
      covered: true,
      offset: 0x7da04,
      dwordIndex: 0x1f681,
    },
  );
  assert.equal(
    locateDwordInZeroFill({ address: 0x0084397c }).covered,
    true,
  );
  assert.deepEqual(
    pickLocation(locateDwordInZeroFill({ address: 0x00843980 })),
    {
      covered: false,
      offset: null,
      dwordIndex: null,
    },
  );
});

test("sparsely replays nonzero timers and the exclusive boundary", () => {
  const replay = replaySparseDwordZeroFill({
    trackedDwords: [
      { address: 0x007c5ed8, value: 0xffffffff },
      { address: 0x00843738, value: 7 },
      { address: 0x0084373c, value: 0xffffffff },
      { address: 0x00843740, value: 0x80000000 },
      { address: 0x008438dc, value: 0x12345678 },
      { address: 0x0084397c, value: 9 },
      { address: 0x00843980, value: 10 },
    ],
  });

  assert.deepEqual(
    replay.dwords.map(({ address, after, covered }) => [
      address,
      after,
      covered,
    ]),
    [
      [0x007c5ed8, 0, true],
      [0x00843738, 0, true],
      [0x0084373c, 0, true],
      [0x00843740, 0, true],
      [0x008438dc, 0, true],
      [0x0084397c, 0, true],
      [0x00843980, 10, false],
    ],
  );
});

test("replays reset before the stage-one K01 map copy in exact order", () => {
  const replay = replayStandardMissionEntry({
    stageWord: 1,
    trackedDwords: [
      { address: 0x0084373c, value: 0xffffffff },
      { address: 0x00843740, value: 0xffffffff },
    ],
    mapDestinationBefore: "stale.map",
  });

  assert.equal(replay.k01MapCopyRan, true);
  assert.equal(replay.mapDestinationAfter, "stagemap\\k01.map");
  assert.equal(replay.mapDestinationAfterKnown, true);
  assert.equal(
    replay.mapDestinationOutcomeScope,
    "stage 1 exact K01 source copy is statically proven",
  );
  assert.deepEqual(
    replay.zeroFill.dwords.map(({ after }) => after),
    [0, 0],
  );
  assert.deepEqual(
    replay.events.map(({ kind, target, site }) => [
      kind,
      target ?? null,
      site ?? null,
    ]),
    [
      ["call", "0x00445770", "0x004600cb"],
      ["call", "0x0048dbe0", "0x004600d0"],
      ["call", "0x00460ba0", "0x0048dbe9"],
      ["dword-zero-fill", null, "0x00460baf"],
      ["read-word", null, "0x0048dc4c"],
      ["call", "0x0048d410", "0x0048dc6d"],
      ["call", "0x0048d740", "0x0048d42b"],
      ["copy-nul-terminated-string", null, null],
      ["return", "0x0048dbe0", null],
      ["call", "0x004457d0", "0x004600d5"],
      ["write-word-from-register", null, "0x004600da"],
    ],
  );
  assert.ok(
    replay.events.findIndex(({ kind }) => kind === "dword-zero-fill") <
      replay.events.findIndex(
        ({ kind }) => kind === "copy-nul-terminated-string",
      ),
  );
});

test("keeps stage-two reset but leaves its destination outcome unknown", () => {
  const replay = replayStandardMissionEntry({
    stageWord: 2,
    trackedDwords: [
      { address: 0x0084373c, value: 1 },
      { address: 0x00843740, value: 2 },
    ],
    mapDestinationBefore: "not-a-proven-postcondition",
  });

  assertUnknownNonK01MapOutcome(replay, 2);
});

test("keeps reset unconditional across non-stage-one WORD boundaries", () => {
  for (const stageWord of [0, 0x7fff, 0x8000, 0xffff]) {
    const replay = replayStandardMissionEntry({
      stageWord,
      trackedDwords: [
        { address: 0x0084373c, value: 1 },
        { address: 0x00843740, value: 2 },
      ],
      mapDestinationBefore: "not-a-proven-postcondition",
    });
    assertUnknownNonK01MapOutcome(replay, stageWord);
  }
});

test("rejects malformed widths, alignment, range overflow, and sparse inputs", () => {
  assert.throws(
    () => describeDwordZeroFill({ startAddress: 1, dwordCount: 1 }),
    /startAddress must be DWORD-aligned/,
  );
  assert.throws(
    () =>
      describeDwordZeroFill({
        startAddress: 0xfffffffc,
        dwordCount: 2,
      }),
    /exceeds unsigned 32-bit address space/,
  );
  assert.throws(
    () => locateDwordInZeroFill({ address: 0x0084373d }),
    /address must be DWORD-aligned/,
  );
  assert.throws(
    () =>
      replaySparseDwordZeroFill({
        trackedDwords: [
          { address: 0x0084373c, value: 1 },
          { address: 0x0084373c, value: 2 },
        ],
      }),
    /duplicate address 0x0084373c/,
  );
  assert.throws(
    () =>
      replaySparseDwordZeroFill({
        trackedDwords: [{ address: 0x0084373c, value: -1 }],
      }),
    /trackedDwords\[0\]\.value must be an integer in 0\.\.4294967295/,
  );
  assert.throws(
    () =>
      replayStandardMissionEntry({
        stageWord: 0x10000,
        trackedDwords: [],
      }),
    /stageWord must be an integer in 0\.\.65535/,
  );
  assert.throws(
    () =>
      replayStandardMissionEntry({
        stageWord: 1,
        trackedDwords: [],
        mapDestinationBefore: null,
      }),
    /mapDestinationBefore must be a string/,
  );
});

test("rejects stale, missing, or tampered canonical evidence", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-mission-timer-reset-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const staleSeeds = readJson("seeds.json");
  staleSeeds.sourceSha256 = "0".repeat(64);
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        seeds: writeJson(temporaryDirectory, "stale-seeds.json", staleSeeds),
      }),
    /seeds canonical analysis source SHA-256/,
  );

  const missingFunction = readJson("seeds.json");
  missingFunction.functions = missingFunction.functions.filter(
    ({ entry }) => entry !== "0x00460ba0",
  );
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        seeds: writeJson(
          temporaryDirectory,
          "missing-function.json",
          missingFunction,
        ),
      }),
    /Ghidra seeds omit function 0x00460ba0/,
  );

  const tamperedInstruction = readJson("seeds.json");
  const zeroFill = tamperedInstruction.functions.find(
    ({ entry }) => entry === "0x00460ba0",
  );
  zeroFill.instructions.find(
    ({ address }) => address === "0x00460baf",
  ).text = "STOSB.REP ES:EDI";
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        seeds: writeJson(
          temporaryDirectory,
          "tampered-instruction.json",
          tamperedInstruction,
        ),
      }),
    /Missing instruction 0x00460baf/,
  );

  const tamperedCall = readJson("seeds.json");
  tamperedCall.functions
    .find(({ entry }) => entry === "0x0048dbe0")
    .instructions.find(
      ({ address }) => address === "0x0048dbe9",
    ).text = "CALL 0x00460b70";
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        seeds: writeJson(
          temporaryDirectory,
          "tampered-call.json",
          tamperedCall,
        ),
      }),
    /Missing instruction 0x0048dbe9/,
  );

  const tamperedFunctionHash = readJson("functions.json");
  tamperedFunctionHash.functions.find(
    ({ entry }) => entry === "0x00460ba0",
  ).instructionSha256 = "0".repeat(64);
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        functions: writeJson(
          temporaryDirectory,
          "tampered-function-hash.json",
          tamperedFunctionHash,
        ),
      }),
    /0x00460ba0 instruction SHA-256/,
  );

  const tamperedMainJump = readJson("jump-tables.json");
  tamperedMainJump.tables
    .find(({ switchAddress }) => switchAddress === "0x0045fd56")
    .cases.find(({ label }) => label === 0).destination = "0x004600e6";
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        jumpTables: writeJson(
          temporaryDirectory,
          "tampered-main-jump.json",
          tamperedMainJump,
        ),
      }),
    /raw state 1 normalized label 0/,
  );

  const tamperedStageJump = readJson("jump-tables.json");
  tamperedStageJump.tables
    .find(({ switchAddress }) => switchAddress === "0x0048d422")
    .cases.find(({ label }) => label === 1).destination = "0x0048d435";
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        jumpTables: writeJson(
          temporaryDirectory,
          "tampered-stage-jump.json",
          tamperedStageJump,
        ),
      }),
    /stage 1 map initializer case/,
  );

  const duplicatedK01Destination = readJson("jump-tables.json");
  duplicatedK01Destination.tables
    .find(({ switchAddress }) => switchAddress === "0x0048d422")
    .cases.find(({ label }) => label === 2).destination = "0x0048d429";
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        jumpTables: writeJson(
          temporaryDirectory,
          "duplicated-k01-destination.json",
          duplicatedK01Destination,
        ),
      }),
    /K01 stage-map destination exclusivity/,
  );

  const missingTimerReference = readJson("references.json");
  const index = missingTimerReference.references.findIndex(
    ({ to }) => to === "0x0084373c",
  );
  missingTimerReference.references.splice(index, 1);
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        references: writeJson(
          temporaryDirectory,
          "missing-timer-reference.json",
          missingTimerReference,
        ),
      }),
    /win-timer direct reference count/,
  );

  const tamperedString = readJson("strings.json");
  tamperedString.strings.find(
    ({ address }) => address === "0x004c31c8",
  ).value = "stagemap\\k02.map";
  assert.throws(
    () =>
      extractK01MissionTimerReset({
        strings: writeJson(
          temporaryDirectory,
          "tampered-string.json",
          tamperedString,
        ),
      }),
    /K01 stage-map source/,
  );
});

test("rejects a modified original executable", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "k01-mission-timer-reset-exe-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );
  const badExecutable = join(temporaryDirectory, "imjinrok2.exe");
  copyFileSync(executablePath, badExecutable);
  const buffer = readFileSync(badExecutable);
  buffer[0x100] ^= 0xff;
  writeFileSync(badExecutable, buffer);

  assert.throws(
    () => extractK01MissionTimerReset({ input: badExecutable }),
    /original executable SHA-256/,
  );
});

function pickLocation({ covered, offset, dwordIndex }) {
  return { covered, offset, dwordIndex };
}

function assertUnknownNonK01MapOutcome(replay, stageWord) {
  assert.deepEqual(
    replay.zeroFill.dwords.map(({ after }) => after),
    [0, 0],
  );
  assert.equal(replay.k01MapCopyRan, false);
  assert.equal(replay.mapDestinationAfter, null);
  assert.equal(replay.mapDestinationAfterKnown, false);
  assert.match(
    replay.mapDestinationOutcomeScope,
    /non-stage-1 destination outcome is outside this focused model/,
  );
  assert.equal(
    replay.events.some(({ target }) => target === "0x0048d740"),
    false,
  );
  assert.deepEqual(
    replay.events.find(
      ({ kind }) => kind === "stage-map-destination-unmodeled",
    ),
    {
      kind: "stage-map-destination-unmodeled",
      stageWord,
      reason:
        "non-stage-1 destination outcome is outside this focused model; only absence of the K01 copier call is proven",
    },
  );
}

function readJson(name) {
  return JSON.parse(readFileSync(join(analysisDirectory, name), "utf8"));
}

function writeJson(directory, name, value) {
  const path = join(directory, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}
