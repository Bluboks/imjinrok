import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_FUNCTIONS_SHA256,
  EXPECTED_REFERENCES_SHA256,
  EXPECTED_SEEDS_SHA256,
  extractHeroPriorityQueueGate,
  reproduceHeroPriorityControlSurface,
  reproduceHeroPriorityGateCommand,
  reproduceHeroPriorityQueuePump,
} from "./extract-hero-priority-queue-gate.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/hero-priority-queue-gate-vectors.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("reproduces every bounded control, writer, and queue vector as a full result", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceSeedsSha256, EXPECTED_SEEDS_SHA256);
  assert.equal(fixture.sourceFunctionsSha256, EXPECTED_FUNCTIONS_SHA256);
  assert.equal(fixture.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  assert.match(fixture.scopeNotice, /supplied synthetic signed-WORD layout/u);
  assert.match(fixture.scopeNotice, /do not reproduce deeper FUN_00426740/u);

  const groups = [
    [fixture.controlSurfaceVectors, reproduceHeroPriorityControlSurface],
    [fixture.gateCommandVectors, reproduceHeroPriorityGateCommand],
    [fixture.queuePumpVectors, reproduceHeroPriorityQueuePump],
  ];
  for (const [vectors, reproduce] of groups) {
    for (const vector of vectors) {
      const actual = reproduce(vector.input);
      assert.deepEqual(actual, vector.expected, vector.id);
      assert.equal(sha256Json(actual), vector.expectedOutputSha256, vector.id);
    }
  }
});

test("confirms the exact player gate, complete evidence sets, and named hero filter", () => {
  const report = extract();
  assert.equal(report.analysisStatus, "static-confirmed-hero-priority-queue-toggle");
  assert.equal(
    report.reproductionStatus,
    "reproduction-complete-for-bounded-gate-control-and-queue-pop",
  );
  assert.equal(report.implementationStatus, "analysis-only-no-product-change");
  assert.deepEqual(
    report.gate,
    {
      playerRecordBase: "0x0082c480",
      playerRecordStride: 0x2c10,
      playerCount: 8,
      fieldOffset: "0x0000254e",
      playerZeroAddress: "0x0082e9ce",
      storageWidth: "WORD",
      enabledComparison: "exactly 1",
      initialAndResetValue: 0,
      enableActionWord: 63,
      disableActionWord: 64,
      noSelectionControl: {
        owner: "0x007c5ed8",
        slotIndex: 1,
        offControlIdentifier: 0x23,
        offFrameOrResourceIndex: 0x1c,
        onControlIdentifier: 0x24,
        onFrameOrResourceIndex: 0x1d,
        availability: "selectionCount raw WORD exactly zero",
        rectFormula:
          "column=slot%WORD[0x0088bd62], row=trunc(slot/WORD[0x0088bd62]); x=WORD[0x0088bd6c]+column*(WORD[0x0088bd64]+WORD[0x0088bd68]); y=WORD[0x0088bd6e]+row*(WORD[0x0088bd66]+WORD[0x0088bd6a]); w=WORD[0x0088bd64]; h=WORD[0x0088bd66]",
        hitRule: "strict interior on both axes",
      },
    },
  );
  assert.equal(report.rawCodeRanges.length, 21);
  assert.equal(report.functionCatalog.length, 21);
  assert.equal(report.evidencePoints.length, 28);
  assert.deepEqual(
    report.referenceSets.map(({ label, count, digest }) => ({ label, count, digest })),
    [
      ["priority gate complete direct references", 6, "10892d3d70ade33544cf16377e398ee8a3baa8d9852495a0bb2d69e24ceecbac"],
      ["FUN_0045b3a0 callers", 1, "cf5ed9d1cdc370fd7fe4b2098aaea61d08edcb924a1fd293c91ca2066c16708a"],
      ["FUN_00457700 callers", 1, "6c285dadc18e7a8cf6bc177eaa70176853f5f75b431858df4856649c744687ea"],
      ["FUN_004576c0 callers", 213, "85b3b55084c7e5b53fe62c3af8b27081a3423feeee63d1571d853c4b53a86f4b"],
      ["FUN_00477f50 callers", 1, "49a162f57cc0900f1139c22584b925f5619b77925ff52bf93b858e1607066232"],
      ["FUN_0047df30 callers", 1, "8641aa5405554936b103584f987953b10bd0f58acf5af9c8e6ee595ef323ded3"],
      ["FUN_0043c300 callers", 1, "511ee9c058f2d70d7c5b1509b85c0b22030b48e2d75f7d2202f7bba42db8b5fe"],
      ["FUN_00428530 callers", 1, "98c395ace336d81b5579a8c4d50ff3fae53630f3975e7a9984df72b99ac49835"],
      ["FUN_00428580 callers", 1, "13ea87efa571b11679528e08cb1054fb4d7ad39e7b872a93666215ca1d51690b"],
      ["FUN_0047fda0 callers", 1, "97e818f37081180ae9a910cafb361360224696b12918eef4246cd91bf5ef3311"],
      ["FUN_0047fe10 callers", 1, "2ee46265c8423e5bbe7f7fdb1948c9b71b0db8358313b63acd348246ed326cec"],
      ["FUN_004767a0 callers", 229, "a2f09338859687dbc5ec10894af3c24efbab06e55590b952ce87d2f39777af3f"],
      ["FUN_0045bd00 callers", 95, "fff383cbaf779191fa07b02392b16681cd5254f59227dfc474bdfb4a98781181"],
    ].map(([label, count, digest]) => ({ label, count, digest })),
  );
  assert.equal(report.classification.actionRecordCount, 229);
  assert.equal(report.classification.producedTypeRecordCount, 95);
  assert.ok(
    report.classification.filteredActions.every(
      ({ flagsWord, producedTypeField0x20Dword }) =>
        flagsWord === 0x108 && producedTypeField0x20Dword === 0x8,
    ),
  );
  assert.deepEqual(
    report.typeField0x20Definitions
      .filter(({ bit0x8 }) => bit0x8)
      .map(({ internalClass }) => internalClass),
    [76, 77, 78, 79, 80, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 94],
  );
  assert.deepEqual(
    report.classification.filteredActions.map(
      ({ actionId, producedInternalClass, originalProducedTypeName }) => ({
        actionId,
        producedInternalClass,
        originalProducedTypeName,
      }),
    ),
    [
      [115, 76, "조선 권율"],
      [116, 77, "조선 이순신"],
      [117, 78, "조선 유성룡"],
      [118, 79, "조선 사명대사"],
      [119, 80, "조선 곽재우"],
      [120, 94, "조선 허준"],
      [121, 82, "일본 고니시"],
      [122, 83, "일본 가토"],
      [123, 84, "일본 와카자키"],
      [124, 85, "일본 세이쇼오"],
      [125, 86, "일본 우기다"],
      [126, 87, "명 이여송"],
      [127, 88, "명 조승훈"],
      [128, 89, "명 심유경"],
      [129, 90, "명 진린"],
      [130, 91, "명 여여문"],
    ].map(([actionId, producedInternalClass, originalProducedTypeName]) => ({
      actionId,
      producedInternalClass,
      originalProducedTypeName,
    })),
  );
  assert.match(report.semanticConclusion, /^Confirmed:/u);
  assert.match(
    report.unresolvedBoundary,
    /independent static slice confirms the adjacent global magic auto-use/u,
  );
  assert.match(report.unresolvedBoundary, /right-click persistent reservation\/pinning/u);
});

test("matches the extracted hero set to observable queue selection for every bounded action ID", () => {
  const report = extract();
  const extractedHeroActionIds = new Set(
    report.classification.filteredActions.map(({ actionId }) => actionId),
  );
  assert.equal(extractedHeroActionIds.size, 16);
  assert.ok(extractedHeroActionIds.has(120));
  assert.equal(
    report.classification.filteredActions.find(({ actionId }) => actionId === 120)
      ?.producedInternalClass,
    94,
  );

  for (let actionId = 1; actionId <= 303; actionId += 1) {
    const actual = reproduceHeroPriorityQueuePump({
      gateWord: 1,
      queueRecords: [
        [1, 0x11111111, 0x22222222],
        [actionId, 0x33333333, 0x44444444],
      ],
    });
    if (extractedHeroActionIds.has(actionId)) {
      assert.equal(actual.selectionMode, "hero-priority-filter", `action ${actionId}`);
      assert.equal(actual.selectedIndex, 1, `action ${actionId}`);
      assert.deepEqual(
        actual.removedRecord,
        [actionId, 0x33333333, 0x44444444],
        `action ${actionId}`,
      );
      continue;
    }
    assert.equal(actual.selectionMode, "fifo-fallback", `action ${actionId}`);
    assert.equal(actual.selectedIndex, 0, `action ${actionId}`);
    assert.deepEqual(
      actual.removedRecord,
      [1, 0x11111111, 0x22222222],
      `action ${actionId}`,
    );
  }
});

test("applies the strict-interior hit rule on all four slot edges", () => {
  const baseInput = {
    selectionCount: 0,
    currentPlayerIndex: 0,
    adjacentGateWord: 0,
    priorityGateWord: 0,
    layout: {
      columns: 3,
      cellWidth: 30,
      cellHeight: 24,
      horizontalGap: 2,
      verticalGap: 3,
      originX: 10,
      originY: 20,
    },
  };
  const cases = [
    ["interior", { x: 43, y: 21 }, true],
    ["left edge", { x: 42, y: 21 }, false],
    ["right edge", { x: 72, y: 21 }, false],
    ["top edge", { x: 43, y: 20 }, false],
    ["bottom edge", { x: 43, y: 44 }, false],
  ];
  for (const [label, pointer, expectedHit] of cases) {
    const actual = reproduceHeroPriorityControlSurface({
      ...baseInput,
      pointer,
    });
    assert.equal(actual.targetControl?.hit, expectedHit, label);
  }
});

test("preserves reached-only reads and rejects field-width violations loudly", () => {
  assert.doesNotThrow(() =>
    reproduceHeroPriorityControlSurface({
      selectionCount: 1,
      currentPlayerIndex: "unreachable",
      adjacentGateWord: "unreachable",
      priorityGateWord: "unreachable",
    }));
  assert.throws(
    () =>
      reproduceHeroPriorityControlSurface({
        selectionCount: 0,
        currentPlayerIndex: 8,
        adjacentGateWord: 0,
        priorityGateWord: 0,
      }),
    /currentPlayerIndex must be an integer in 0\.\.7/u,
  );
  assert.doesNotThrow(() =>
    reproduceHeroPriorityGateCommand({
      initialGateWord: 0,
      commandReached: false,
      actionWord: "unreachable",
    }));
  assert.throws(
    () =>
      reproduceHeroPriorityGateCommand({
        initialGateWord: 0,
        commandReached: true,
        actionWord: 62,
      }),
    /outside the bounded hero-priority gate writer actions 63\/64/u,
  );
  assert.doesNotThrow(() =>
    reproduceHeroPriorityQueuePump({
      gateWord: 0,
      queueRecords: [[0xffffffff, 0, 0]],
    }));
  assert.throws(
    () =>
      reproduceHeroPriorityQueuePump({
        gateWord: 1,
        queueRecords: [[304, 0, 0]],
      }),
    /action WORD must be an integer in 1\.\.303/u,
  );
  assert.throws(
    () =>
      reproduceHeroPriorityQueuePump({
        gateWord: 1,
        queueRecords: Array.from({ length: 21 }, () => [107, 0, 0]),
      }),
    /at most 20 records/u,
  );
  assert.throws(
    () =>
      reproduceHeroPriorityQueuePump({
        gateWord: 1,
        queueRecords: [[107, -1, 0]],
      }),
    /must be an integer in 0\.\.4294967295/u,
  );
});

test("rejects stale executable and generated-analysis inputs before reporting", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "hero-priority-evidence-"));
  const staleExecutable = join(temporaryDirectory, "imjinrok2.exe");
  copyFileSync(executablePath, staleExecutable);
  const executableBytes = readFileSync(staleExecutable);
  executableBytes[0x100] ^= 0x01;
  writeFileSync(staleExecutable, executableBytes);
  assert.throws(
    () => extractHeroPriorityQueueGate({ executablePath: staleExecutable }),
    /imjinrok2\.exe SHA-256/u,
  );

  for (const [sourcePath, option] of [
    [seedsPath, "seedsPath"],
    [functionsPath, "functionsPath"],
    [referencesPath, "referencesPath"],
  ]) {
    const stalePath = join(temporaryDirectory, option);
    const json = JSON.parse(readFileSync(sourcePath, "utf8"));
    json.sourceSha256 = "0".repeat(64);
    writeFileSync(stalePath, `${JSON.stringify(json)}\n`);
    assert.throws(
      () => extractHeroPriorityQueueGate({ [option]: stalePath }),
      new RegExp(`${option} SHA-256`, "u"),
    );
  }
});

function extract() {
  return extractHeroPriorityQueueGate({
    executablePath,
    seedsPath,
    functionsPath,
    referencesPath,
  });
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
