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
  EXPECTED_JUMP_TABLES_SHA256,
  EXPECTED_REFERENCES_SHA256,
  EXPECTED_SEEDS_SHA256,
  extractMagicAutoUseGate,
  isMagicAutoUseAffectedClass,
  reproduceMagicAutoUseConsumerAdmission,
  reproduceMagicAutoUseControlSurface,
  reproduceMagicAutoUseGateCommand,
} from "./extract-magic-auto-use-gate.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const jumpTablesPath = join(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json");
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/magic-auto-use-gate-vectors.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("reproduces every bounded control, writer, and consumer-admission vector as a full result", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceSeedsSha256, EXPECTED_SEEDS_SHA256);
  assert.equal(fixture.sourceFunctionsSha256, EXPECTED_FUNCTIONS_SHA256);
  assert.equal(fixture.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  assert.equal(fixture.sourceJumpTablesSha256, EXPECTED_JUMP_TABLES_SHA256);
  assert.match(fixture.scopeNotice, /supplied synthetic signed-WORD layout/u);
  assert.match(fixture.scopeNotice, /do not claim to reproduce the downstream helper/u);

  const groups = [
    [fixture.controlSurfaceVectors, reproduceMagicAutoUseControlSurface],
    [fixture.gateCommandVectors, reproduceMagicAutoUseGateCommand],
    [fixture.consumerAdmissionVectors, reproduceMagicAutoUseConsumerAdmission],
  ];
  for (const [vectors, reproduce] of groups) {
    for (const vector of vectors) {
      const actual = reproduce(vector.input);
      assert.deepEqual(actual, vector.expected, vector.id);
      assert.equal(sha256Json(actual), vector.expectedOutputSha256, vector.id);
    }
  }
});

test("confirms the exact player gate, complete evidence sets, and nine affected classes", () => {
  const report = extract();
  assert.equal(
    report.analysisStatus,
    "static-confirmed-player-global-magic-auto-use-toggle",
  );
  assert.equal(
    report.reproductionStatus,
    "partial-reproduction-complete-for-control-writer-reset-and-consumer-case-admission",
  );
  assert.equal(report.implementationStatus, "analysis-only-no-product-change");
  assert.deepEqual(report.gate, {
    playerRecordBase: "0x0082c480",
    playerRecordStride: 0x2c10,
    playerCount: 8,
    fieldOffset: "0x0000254c",
    playerZeroAddress: "0x0082e9cc",
    storageWidth: "WORD",
    consumerComparison: "nonzero enables; zero disables",
    writerValues: { action61: 1, action62: 0 },
    initialAndResetValue: 0,
    noSelectionControl: {
      owner: "0x007c5ed8",
      slotIndex: 0,
      disabledControlIdentifier: 0x21,
      disabledFrameOrResourceIndex: 0x1b,
      enableActionWord: 61,
      enabledControlIdentifier: 0x22,
      enabledFrameOrResourceIndex: 0x1a,
      disableActionWord: 62,
      availability: "selectionCount raw WORD exactly zero",
      hitRule: "strict interior on all four rectangle edges",
      texts: [
        {
          controlIdentifier: 0x21,
          label: {
            sourceAddress: "0x004c8438",
            runtimeAddress: "0x00aa4e08",
            value: "자동마법설정",
          },
          description: {
            sourceAddress: "0x004c761c",
            runtimeAddress: "0x00aa77e8",
            value: "캐릭터 스스로 마법을 사용하도록 설정 합니다.",
          },
        },
        {
          controlIdentifier: 0x22,
          label: {
            sourceAddress: "0x004c8428",
            runtimeAddress: "0x00aa4e28",
            value: "자동마법해제",
          },
          description: {
            sourceAddress: "0x004c764c",
            runtimeAddress: "0x00aa77a8",
            value: "캐릭터 스스로 마법을 사용하지 못하게 설정 합니다.",
          },
        },
      ],
    },
  });
  assert.equal(report.rawCodeRanges.length, 13);
  assert.equal(report.functionCatalog.length, 13);
  assert.equal(report.evidencePoints.length, 25);
  assert.deepEqual(
    report.referenceSets.map(({ label, count, digest }) => ({ label, count, digest })),
    [
      ["magic auto-use gate complete direct references", 12, "c04fcc37281a965043a26220e93723cf0dcb3a988488daf9f2bf71285a1cdea5"],
      ["FUN_004196e0 callers", 1, "22c19e337849d706b3c4c69307fda5359895b7912caf4c4946952d5e705256bc"],
      ["FUN_004196e0 outgoing calls", 27, "d13736d5c1c820a7737d38fc9a2717b4e3a753c88da78699b1b53bb8fcd9fdae"],
      ["FUN_0045b3a0 callers", 1, "cf5ed9d1cdc370fd7fe4b2098aaea61d08edcb924a1fd293c91ca2066c16708a"],
      ["FUN_00477f50 callers", 1, "49a162f57cc0900f1139c22584b925f5619b77925ff52bf93b858e1607066232"],
      ["FUN_0047df30 callers", 1, "8641aa5405554936b103584f987953b10bd0f58acf5af9c8e6ee595ef323ded3"],
    ].map(([label, count, digest]) => ({ label, count, digest })),
  );
  assert.deepEqual(
    report.consumer.affectedEntities.map(
      ({ internalClass, originalGameplayName, caseEntry }) => ({
        internalClass,
        originalGameplayName,
        caseEntry,
      }),
    ),
    [
      [11, "조선 승병", "0x004197b0"],
      [16, "일본 무녀", "0x00419810"],
      [20, "일본 닌자", "0x00419880"],
      [36, "명 주술사", "0x004198f0"],
      [78, "조선 유성룡", "0x00419930"],
      [79, "조선 사명대사", "0x00419a10"],
      [80, "조선 곽재우", "0x00419a80"],
      [85, "일본 세이쇼오", "0x00419af0"],
      [89, "명 심유경", "0x00419e90"],
    ].map(([internalClass, originalGameplayName, caseEntry]) => ({
      internalClass,
      originalGameplayName,
      caseEntry,
    })),
  );
  assert.equal(report.consumer.jumpTable.caseCount, 79);
  assert.equal(
    report.consumer.jumpTable.digest,
    "668fc95e718fe86693e4c5b295605bc743b8f1701c37e7977175c6a008a4b0ba",
  );
  assert.match(report.semanticConclusion, /^Confirmed:/u);
  assert.match(report.unresolvedBoundary, /right-click persistent HUD reservation\/pinning/u);
});

test("matches switch classification to observable admission for every BYTE value", () => {
  const report = extract();
  const extractedClasses = new Set(
    report.consumer.affectedEntities.map(({ internalClass }) => internalClass),
  );
  assert.equal(extractedClasses.size, 9);
  for (let internalClass = 0; internalClass <= 0xff; internalClass += 1) {
    assert.equal(
      isMagicAutoUseAffectedClass(internalClass),
      extractedClasses.has(internalClass),
      `class ${internalClass}`,
    );
    const actual = reproduceMagicAutoUseConsumerAdmission(
      extractedClasses.has(internalClass)
        ? { internalClass, playerIndex: 0, gateWord: 1 }
        : {
            internalClass,
            playerIndex: "unreachable",
            gateWord: "unreachable",
          },
    );
    assert.equal(
      actual.admittedToClassBehavior,
      extractedClasses.has(internalClass),
      `class ${internalClass}`,
    );
  }
});

test("applies slot-0 strict-interior hit behavior on all four edges", () => {
  const baseInput = {
    selectionCount: 0,
    currentPlayerIndex: 0,
    gateWord: 0,
    layout: {
      cellWidth: 30,
      cellHeight: 24,
      originX: 10,
      originY: 20,
    },
  };
  for (const [label, pointer, expectedHit] of [
    ["interior", { x: 11, y: 21 }, true],
    ["left edge", { x: 10, y: 21 }, false],
    ["right edge", { x: 40, y: 21 }, false],
    ["top edge", { x: 11, y: 20 }, false],
    ["bottom edge", { x: 11, y: 44 }, false],
  ]) {
    const actual = reproduceMagicAutoUseControlSurface({ ...baseInput, pointer });
    assert.equal(actual.control?.hit, expectedHit, label);
  }
});

test("preserves reached-only reads and rejects field-width violations loudly", () => {
  assert.doesNotThrow(() =>
    reproduceMagicAutoUseControlSurface({
      selectionCount: 0xffff,
      currentPlayerIndex: "unreachable",
      gateWord: "unreachable",
    }));
  assert.doesNotThrow(() =>
    reproduceMagicAutoUseGateCommand({
      initialGateWord: 0,
      commandReached: false,
      actionWord: "unreachable",
    }));
  assert.throws(
    () =>
      reproduceMagicAutoUseGateCommand({
        initialGateWord: 0,
        commandReached: true,
        actionWord: 63,
      }),
    /outside the bounded magic auto-use writer actions 61\/62/u,
  );
  assert.doesNotThrow(() =>
    reproduceMagicAutoUseConsumerAdmission({
      internalClass: 95,
      playerIndex: "unreachable",
      gateWord: "unreachable",
    }));
  assert.throws(
    () =>
      reproduceMagicAutoUseConsumerAdmission({
        internalClass: 11,
        playerIndex: 8,
        gateWord: "unreachable",
      }),
    /playerIndex must be an integer in 0\.\.7/u,
  );
  assert.throws(
    () =>
      reproduceMagicAutoUseConsumerAdmission({
        internalClass: 11,
        playerIndex: 0,
        gateWord: 0x10000,
      }),
    /gateWord must be an integer in 0\.\.65535/u,
  );
});

test("rejects stale executable and generated complete-set inputs before reporting", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "magic-auto-use-evidence-"));
  const staleExecutable = join(temporaryDirectory, "imjinrok2.exe");
  copyFileSync(executablePath, staleExecutable);
  const executableBytes = readFileSync(staleExecutable);
  executableBytes[0x100] ^= 0x01;
  writeFileSync(staleExecutable, executableBytes);
  assert.throws(
    () => extractMagicAutoUseGate({ executablePath: staleExecutable }),
    /imjinrok2\.exe SHA-256/u,
  );

  for (const [sourcePath, option] of [
    [seedsPath, "seedsPath"],
    [functionsPath, "functionsPath"],
    [referencesPath, "referencesPath"],
    [jumpTablesPath, "jumpTablesPath"],
  ]) {
    const stalePath = join(temporaryDirectory, option);
    const json = JSON.parse(readFileSync(sourcePath, "utf8"));
    json.sourceSha256 = "0".repeat(64);
    writeFileSync(stalePath, `${JSON.stringify(json)}\n`);
    assert.throws(
      () => extractMagicAutoUseGate({ [option]: stalePath }),
      new RegExp(`${option} SHA-256`, "u"),
    );
  }
});

function extract() {
  return extractMagicAutoUseGate({
    executablePath,
    seedsPath,
    functionsPath,
    referencesPath,
    jumpTablesPath,
  });
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
