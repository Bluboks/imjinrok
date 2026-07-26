#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpriteLikeHeader } from "./codec.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SPRITE_PATH = "original/imjinrok2/yfnt/objectiveborder.spr";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_OBJECTIVE_BORDER_SHA256 =
  "62552fecc34139e6729b84d4e15dcbe6ea3622eb76b7f443af29fa5322813ea5";

export const ORIGINAL_OBJECTIVE_PANEL_LAYOUT = Object.freeze({
  baseWidth: 640,
  baseHeight: 480,
  resourcePath: "yfnt\\objectiveborder.spr",
  frame: Object.freeze({ x: 112, y: 81, right: 528, bottom: 317, width: 416, height: 236 }),
  content: Object.freeze({ x: 158, y: 135, right: 478, bottom: 259, width: 320, height: 124 }),
  dismissButton: Object.freeze({ x: 415, y: 267, right: 495, bottom: 291, width: 80, height: 24 }),
  text: Object.freeze({
    maxWidth: 320,
    firstCenterY: 166,
    secondCenterY: 228,
  }),
});

const SEEDED_FUNCTIONS = [
  ["0x00449090", "0x00449090-0x00449260", 26, 118, "a963a03e97b2278f665504e93237ce958f132844d3e0a1646db9a6f08ea6e5ab"],
  ["0x004113a0", "0x004113a0-0x0041146d", 6, 56, "0113951333de2f5a7241007e9e1b34849e2b062033dd4c71fa6e4804ae40b39d"],
  ["0x00411cb0", "0x00411cb0-0x00411ccc", 1, 9, "ae93752e165bb59a2cd95d1bdfc2efc3887ef04b77265e36e2e40bf1cd926318"],
  ["0x00411cd0", "0x00411cd0-0x00411d86", 14, 57, "cc43d4f06b9e2731c3bd3520f1de43c9ef659545f7ad8fcf18369122e927d5f3"],
  ["0x004119f0", "0x004119f0-0x00411a20", 1, 17, "1bf8b1d93a8f6a2054d126d8fb6b2b537f26afe4c1c68f7bccef21c1c07ba8f6"],
  ["0x00442dd0", "0x00442dd0-0x00442e23", 1, 30, "f7abf9e54e878d16bbedf57eac5ee7e13c96a4f03721f8d65cb1cb168dacd746"],
  ["0x004434a0", "0x004434a0-0x0044357e", 7, 77, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["0x004492d0", "0x004492d0-0x004492ec", 3, 8, "9a78329f4402df53e57c630f246fad3786f7e0f12045a5b5db042a4080f3edaa"],
  ["0x0044abb0", "0x0044abb0-0x0044ad93", 28, 159, "beba5cc8f9edcf250a3341a9f4ceda5a88d54866419c5153b31ccc39a25b238f"],
  ["0x0044ada0", "0x0044ada0-0x0044addd", 4, 17, "f1a76f10d19dc219d4bb4d87ff0120faa635aedb212904b8c14a2144534c7a6a"],
  ["0x0044ae80", "0x0044ae80-0x0044aeb2", 1, 13, "bb46a302f1d68658fb8b5ac1629eebdd9f1c566949bcdb7e4b106e93d536430c"],
  ["0x0044aef0", "0x0044aef0-0x0044af1a", 1, 9, "6e401ac6839c314d1fa9cf65688b12eb7c73e305dd19d92f0b671d39ed8b8c15"],
  ["0x0044af20", "0x0044af20-0x0044af42", 1, 10, "26f113896dd1964f6a87f388931f97d9ab6ad11acb139ce92ea08977b06653f3"],
  ["0x0044b040", "0x0044b040-0x0044b09e", 3, 27, "6c562893188cec5ce2a87b48a7911e3d3bb7744543f0db3e63b7a2390af64aa8"],
  ["0x0044dfd0", "0x0044dfd0-0x0044e03a", 10, 46, "4fde442cc88adf9f8f0d4328d9cff5c5f723dc3b6728bc093de8ef4a310a42ff"],
  ["0x004838f0", "0x004838f0-0x0048399f", 9, 68, "2f3c22c303aa3a713a4319e2bd573b5297553cd853a2138fd26e907f44d4a180"],
  ["0x004a5730", "0x004a5730-0x004a5977", 13, 157, "84cccf7daf0e07f6a0e58041034a86be6fbc07937c768240426632bb7e8855e9"],
  ["0x004a5980", "0x004a5980-0x004a5ab3", 6, 87, "2289cf5de064b7c64f8d94d5c8d2b94406983934dea499f265f70f2645ee51b2"],
  ["0x004a5ac0", "0x004a5ac0-0x004a5ada", 3, 7, "c63a4ba6ef2c297bff073c2a16e6c1d5d7cfe86699f8b7addc4e8cc4a8d0bb33"],
  ["0x004a5ae0", "0x004a5ae0-0x004a5b29", 3, 18, "016550b760eacb89d4538a7cb82618a4241d4c22c48ce65e0d53b502f3c9f2c7"],
].map(([entry, bodyRange, blockCount, instructionCount, bodySha256]) => ({
  entry,
  bodyRange,
  blockCount,
  instructionCount,
  bodySha256,
}));

const RAW_CODE_RANGES = [
  {
    id: "ui-state-default-initializer",
    start: 0x00448ff0,
    endExclusive: 0x00449027,
    sha256: "75df4660fbf230510adf9006e8c7674fc421a14adb4ba66b58d26d5c104b6a90",
  },
  {
    id: "ui-state-3ed-initializer",
    start: 0x00449030,
    endExclusive: 0x0044908d,
    sha256: "15dfb815b36c2a062a6b8c8acfe58954fd6f7161ef441bdaea87cdcf2266a7ca",
  },
  {
    id: "objective-control-frame-draw-vtable-target",
    start: 0x00411a30,
    endExclusive: 0x00411b47,
    sha256: "484b535fcfe85b683ccdbb1042d7211e8e7366a912ecacaff6609750113d6b71",
  },
  {
    id: "objective-dismiss-hit-test-vtable-target",
    start: 0x00411df0,
    endExclusive: 0x00411e37,
    sha256: "3863eae89c0d3d1848aad35171f43a1eb4da0bc8f5a1299a7d106c84a72b3b55",
  },
  {
    id: "shared-canvas-640x480-initializer",
    start: 0x0044a040,
    endExclusive: 0x0044a071,
    sha256: "c5513d067ff31a55013de73f6dd8399d3fddd4f4ca7adc0dcb79d5ff1dbd7c3b",
  },
];

const STATIC_EVIDENCE = [
  [0x0044900e, "66 c7 05 98 29 55 00 e8 03", "initialize UI state WORD to 0x3e8"],
  [0x00449044, "66 c7 05 98 29 55 00 ed 03", "initialize UI state WORD to 0x3ed"],
  [0x004a5760, "33 f6 50 68 60 ba 94 00 68 dc 90 4c 00 89 b4 24 54 18 00 00 89 35 70 2d 55 00", "resource path and previous-button reset"],
  [0x004a57d4, "6a 01 6a 01 68 44 ab 4c 00 6a 18 6a 50 68 0b 01 00 00 68 9f 01 00 00 b9 48 0f c8 00", "dismiss control x/y/width/height and enabled flags"],
  [0x004a57fa, "0f bf 0d cc af 88 00 8d 44 24 18 c1 e1 07 50 81 c1 e8 f0 ab 00 68 60 ba 94 00 51 e8 b6 d5 f9 ff", "signed stage index selects a 128-byte text-path record"],
  [0x004a581d, "8d 94 24 18 04 00 00 8d 84 24 18 08 00 00 8d 4c 24 18 52 50 51 8d 8c 24 24 0c 00 00 e8 b2 e0 fd ff", "text extractor receives the selected path and two local output buffers"],
  [0x004a583e, "83 f8 01 0f 85 04 01 00 00", "first text-record failure branch"],
  [0x004a5870, "66 3d 40 01 89 74 24 08 89 74 24 0c 7d 09", "first signed text-width clamp at 320"],
  [0x004a58ae, "2b c2 ba a6 00 00 00 d1 f8 8b 19 2b d0", "first text vertical center at 166"],
  [0x004a58f1, "66 3d 40 01 89 74 24 0c 89 74 24 10 5b 7d 09", "second signed text-width clamp at 320"],
  [0x004a5927, "8b d0 b8 e4 00 00 00 d1 fa 2b c2", "second text vertical center at 228"],
  [0x004a5980, "a1 70 2d 55 00 83 ec 20 b9 48 0f c8 00 50 e8 1d c3 f6 ff", "dismiss-control update call"],
  [0x004a599c, "e8 2f 39 fa ff 83 f8 01 0f 84 02 01 00 00", "one-shot external dismissal"],
  [0x004a59aa, "56 8b 74 24 28 56 b9 18 94 55 00 e8 f6 51 fa ff 83 f8 01 0f 85 92 00 00 00", "surface-lock failure branch"],
  [0x004a59eb, "8b 15 98 b4 88 00 a1 cc bb 88 00 8b 0d e0 af 88 00 03 d0 52 8b 15 dc af 88 00 51 52 6a 51 6a 70", "frame sprite source and destination"],
  [0x004a5a55, "a1 7c 92 54 00 8b 0e 8d 54 24 14 6a 11 52 50 68 87 00 00 00 68 9e 00 00 00 56", "content-region presentation call"],
  [0x004a5a6f, "c7 44 24 2c 9e 00 00 00 c7 44 24 30 87 00 00 00 c7 44 24 34 de 01 00 00 c7 44 24 38 03 01 00 00", "exclusive content RECT bounds"],
  [0x004a5a92, "a1 3c 6e c0 00 33 c9 85 c0 0f 95 c1 89 0d 70 2d 55 00", "normalize current button state for the next frame"],
  [0x004a5ac0, "a1 cc bb 88 00 85 c0 74 0d 68 d8 af 88 00 e8 6d d9 f9 ff 83 c4 04 e9 05 00 00 00", "conditionally release the objective sprite, then unconditionally tail-call content clear"],
  [0x004a5ae0, "a1 7c 92 54 00 b9 18 94 55 00 50 e8 c0 50 fa ff 83 f8 01 75 34", "content clear lock branch"],
  [0x004a5af5, "68 fe 00 00 00 68 02 01 00 00 68 dd 01 00 00 68 87 00 00 00 68 9e 00 00 00", "inclusive content clear bounds and transparent index"],
  [0x00411df0, "0f bf 05 12 40 aa 00 8b 54 24 04 3b d0 7d 33", "signed pointer X strict-edge hit test"],
  [0x00411e0e, "0f bf 05 10 40 aa 00 8b 54 24 08 3b d0 7d 15", "signed pointer Y strict-edge hit test"],
  [0x0044a040, "8b c1 ba 80 02 00 00 b9 e0 01 00 00 89 48 08 89 48 14", "shared canvas 640x480 fields"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const EXPECTED_UI_STATE_REFERENCES = [
  ["0x0044900e", "WRITE", "0x00448ff0"],
  ["0x00449044", "WRITE", "0x00449030"],
  ["0x004490b8", "READ", "0x00449090"],
  ["0x004490d9", "WRITE", "0x00449090"],
  ["0x00449105", "WRITE", "0x00449090"],
  ["0x00449116", "WRITE", "0x00449090"],
  ["0x00449143", "WRITE", "0x00449090"],
  ["0x00449160", "WRITE", "0x00449090"],
  ["0x00449188", "WRITE", "0x00449090"],
  ["0x0044919a", "WRITE", "0x00449090"],
  ["0x004491af", "WRITE", "0x00449090"],
  ["0x004491c1", "WRITE", "0x00449090"],
  ["0x004491e0", "WRITE", "0x00449090"],
  ["0x0044921f", "READ", "0x00449090"],
].map(([from, type, fromFunctionEntry]) => ({ from, type, fromFunctionEntry }));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractObjectivePanelLayoutEvidence({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    spritePath: args.sprite ?? DEFAULT_SPRITE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    referencesPath: args.references ?? DEFAULT_REFERENCES_PATH,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

export function extractObjectivePanelLayoutEvidence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  spritePath = DEFAULT_SPRITE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const spriteBuffer = readFileSync(spritePath);
  const spriteSha256 = sha256(spriteBuffer);
  assertEqual(spriteSha256, EXPECTED_OBJECTIVE_BORDER_SHA256, `${spritePath} SHA-256`);
  const sprite = parseSpriteLikeHeader(spriteBuffer, spritePath);
  assertEqual(sprite.width, ORIGINAL_OBJECTIVE_PANEL_LAYOUT.frame.width, "objective border width");
  assertEqual(sprite.height, ORIGINAL_OBJECTIVE_PANEL_LAYOUT.frame.height, "objective border height");
  assertEqual(sprite.frameCount, 1, "objective border frame count");

  const seeds = readJson(seedsPath);
  assertEqual(seeds.sourceSha256, executableSha256, `${seedsPath} source SHA-256`);
  const references = readJson(referencesPath);
  assertEqual(references.sourceSha256, executableSha256, `${referencesPath} source SHA-256`);
  const functions = SEEDED_FUNCTIONS.map((expected) =>
    verifySeededFunction(executableBuffer, image, seeds, expected),
  );
  const rawCodeRanges = RAW_CODE_RANGES.map((range) =>
    verifyRawCodeRange(executableBuffer, image, range),
  );
  const evidencePoints = STATIC_EVIDENCE.map((point) =>
    verifyEvidencePoint(executableBuffer, image, point),
  );

  const resourcePath = readCString(executableBuffer, requireRawOffset(image, 0x004c90dc));
  assertEqual(resourcePath, ORIGINAL_OBJECTIVE_PANEL_LAYOUT.resourcePath, "objective border embedded path");
  const stateReferences = verifyUiStateReferences(references);

  return {
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    analysisScope:
      "objective modal lifecycle and cleanup, exact resource/frame/content/dismiss-control rectangles, strict-edge dismissal hit test, exit/inactive gates, draw and cleanup lock failures, resource-loader failures, and control sound/latch side effects",
    reproductionScope:
      "exact rectangles, update dismissal/consumption/button normalization/draw order, inactive/initialize/display owner states, and successful-resource dismissal cleanup with clear-lock success and failure",
    staticOnlyScope: [
      "runtime objective SPR loader failures and the caller's continue-after-error behavior",
      "control press-sound and internal latch mutations, which do not change this question's dismiss return value",
    ],
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      sprite: {
        path: spritePath,
        embeddedPath: resourcePath,
        sha256: spriteSha256,
        width: sprite.width,
        height: sprite.height,
        frameCount: sprite.frameCount,
      },
      seeds: { path: seedsPath, sourceSha256: seeds.sourceSha256 },
      references: { path: referencesPath, sourceSha256: references.sourceSha256 },
    },
    coordinateSystem: { width: 640, height: 480, origin: "top-left" },
    layout: ORIGINAL_OBJECTIVE_PANEL_LAYOUT,
    dataFields: [
      { owner: "objective control", offset: "0x8c", width: "signed WORD", role: "dismiss control x" },
      { owner: "objective control", offset: "0x8e", width: "signed WORD", role: "dismiss control y" },
      { owner: "objective control", offset: "0x90", width: "signed WORD", role: "dismiss control width" },
      { owner: "objective control", offset: "0x92", width: "signed WORD", role: "dismiss control height" },
      { owner: "objective control", offset: "0x94", width: "DWORD", role: "press-sound latch" },
      { owner: "objective control", offset: "0x98", width: "DWORD", role: "inside/pressed latch" },
      { owner: "global", address: "0x00aa4012", width: "signed WORD", role: "pointer x" },
      { owner: "global", address: "0x00aa4010", width: "signed WORD", role: "pointer y" },
      { owner: "global", address: "0x00c06e3c", width: "DWORD", role: "current primary-button state" },
      { owner: "global", address: "0x00552d70", width: "DWORD", role: "previous normalized primary-button state" },
      { owner: "global", address: "0x00552b80", width: "DWORD", role: "one-shot external dismissal flag" },
    ],
    functions,
    rawCodeRanges,
    evidencePoints,
    pilotBinding: {
      status: "unresolved",
      conclusion:
        "the complete structured direct-reference set contains no direct literal write of state 0x3f0; the upstream return-value/indirect producer and K01 binding remain unresolved",
      stateStorage: {
        address: "0x00552998",
        width: "signed WORD",
        directReferences: stateReferences,
        knownExternalInitializers: [
          { address: "0x0044900e", value: "0x3e8", function: "0x00448ff0" },
          { address: "0x00449044", value: "0x3ed", function: "0x00449030" },
        ],
        handlerReturnValueWrites: [
          { address: "0x00449105", call: "0x004490ed to FUN_004495e0" },
          { address: "0x00449143", call: "0x00449132 to FUN_004aa810" },
          { address: "0x00449188", call: "0x0044917b to FUN_004aa810" },
          { address: "0x004491af", call: "0x004491a5 to FUN_004a6c80" },
        ],
        missingDirectLiteralWrite: "0x3f0",
        unresolved:
          "the upstream handler return-value or indirect producer that yields 0x3f0, and its K01 binding",
        consumer: "0x004491bc in FUN_00449090",
      },
      textRecordSelection: {
        stageIndex: "signed WORD DAT_0088afcc",
        tableBase: "0x00abf0e8",
        recordStride: 128,
        pathSelectionRange: "0x004a57fa-0x004a581a",
        extractorCall: "0x004a5839 to FUN_004838f0",
        outputs:
          "two local buffers copied from the first type-7 record payload at offsets 0x000 and 0x100",
        unresolved:
          "the producer/value that selects a K01 record and the identity of the selected record",
      },
    },
    unresolvedFields: [
      "the upstream handler return-value or indirect producer that yields UI state 0x3f0, and its K01 binding",
      "the DAT_0088afcc value/producer and 128-byte table record that would bind the selected text payload to K01",
      "the producer and semantic name of DAT_00552b80 beyond its exact consume-on-value-1 behavior",
      "the dynamically supplied presentation surface's concrete vtable type at FUN_004a5980 param_1+0x1c",
      "font face, font size, wrapping language rules, and the two objective text strings",
    ],
  };
}

export function reproduceObjectivePanelUpdate({
  controlEnabled = 1,
  controlActive = 1,
  pointerX,
  pointerY,
  currentButtonDown,
  previousButtonDown,
  oneShotDismiss,
  surfaceLockSucceeded,
}) {
  assertSignedWord(pointerX, "pointerX");
  assertSignedWord(pointerY, "pointerY");
  assertDword(controlEnabled, "controlEnabled");
  assertDword(controlActive, "controlActive");
  assertDword(currentButtonDown, "currentButtonDown");
  assertDword(previousButtonDown, "previousButtonDown");
  assertDword(oneShotDismiss, "oneShotDismiss");
  if (typeof surfaceLockSucceeded !== "boolean") {
    throw new TypeError(`surfaceLockSucceeded must be boolean; got ${String(surfaceLockSucceeded)}`);
  }

  const hit = isDismissButtonHit(pointerX, pointerY);
  const releasedInside =
    controlEnabled === 1 &&
    controlActive === 1 &&
    hit &&
    currentButtonDown === 0 &&
    previousButtonDown === 1;
  if (releasedInside) {
    return dismissedUpdate("pointer-release", false, hit);
  }
  if (oneShotDismiss === 1) {
    return dismissedUpdate("external-one-shot", true, hit);
  }

  const drawEvents = surfaceLockSucceeded
    ? ["save-dirty-rect", "expand-dirty-rect", "draw-frame", "draw-dismiss-control", "unlock", "restore-dirty-rect"]
    : [];
  drawEvents.push("present-content-region");
  return {
    dismissed: false,
    dismissReason: null,
    consumeOneShotDismiss: false,
    hitDismissButton: hit,
    nextPreviousButtonDown: currentButtonDown === 0 ? 0 : 1,
    drawEvents,
  };
}

export function reproduceObjectivePanelOwnerFrame({
  ownerEnabled,
  state,
  update,
  cleanupSurfaceLockSucceeded,
}) {
  assertDword(ownerEnabled, "ownerEnabled");
  assertSignedWord(state, "state");
  if (ownerEnabled === 0 || (state !== 0x3f0 && state !== 0x3f1)) {
    return { phase: "inactive", nextState: state, events: [] };
  }
  if (state === 0x3f0) {
    return { phase: "initialize", nextState: 0x3f1, events: ["initialize-objective-modal"] };
  }
  if (!update) {
    throw new TypeError("update input is required for objective-modal state 0x3f1");
  }
  const result = reproduceObjectivePanelUpdate(update);
  if (!result.dismissed) {
    return { phase: "display", nextState: 0x3f1, events: result.drawEvents, update: result };
  }
  if (typeof cleanupSurfaceLockSucceeded !== "boolean") {
    throw new TypeError(
      `cleanupSurfaceLockSucceeded is required for dismissal cleanup and must be boolean; got ${String(cleanupSurfaceLockSucceeded)}`,
    );
  }
  return {
    phase: "dismiss",
    nextState: 1000,
    events: reproduceSuccessfulResourceCleanup(cleanupSurfaceLockSucceeded),
    update: result,
  };
}

export function isOriginalObjectiveDismissButtonHit(pointerX, pointerY) {
  assertSignedWord(pointerX, "pointerX");
  assertSignedWord(pointerY, "pointerY");
  return isDismissButtonHit(pointerX, pointerY);
}

function isDismissButtonHit(pointerX, pointerY) {
  const rect = ORIGINAL_OBJECTIVE_PANEL_LAYOUT.dismissButton;
  return pointerX > rect.x && pointerX < rect.right && pointerY > rect.y && pointerY < rect.bottom;
}

function dismissedUpdate(dismissReason, consumeOneShotDismiss, hitDismissButton) {
  return {
    dismissed: true,
    dismissReason,
    consumeOneShotDismiss,
    hitDismissButton,
    nextPreviousButtonDown: null,
    drawEvents: [],
  };
}

function reproduceSuccessfulResourceCleanup(cleanupSurfaceLockSucceeded) {
  const events = ["release-objective-resource", "attempt-clear-content"];
  if (cleanupSurfaceLockSucceeded) {
    events.push("clear-content-region", "unlock-clear-surface");
  }
  return events;
}

function verifySeededFunction(buffer, image, seeds, expected) {
  const fn = seeds.functions?.find((candidate) => candidate.entry === expected.entry);
  if (!fn) {
    throw new Error(`${seeds.sourceSha256}: missing seeded function ${expected.entry}`);
  }
  assertEqual(fn.bodyRanges?.length, 1, `${expected.entry} body range count`);
  assertEqual(fn.bodyRanges[0], expected.bodyRange, `${expected.entry} body range`);
  assertEqual(fn.basicBlocks?.length, expected.blockCount, `${expected.entry} CFG block count`);
  assertEqual(fn.instructions?.length, expected.instructionCount, `${expected.entry} instruction count`);
  const first = parseAddress(fn.instructions[0].address, `${expected.entry} first instruction`);
  const last = fn.instructions.at(-1);
  const endExclusive =
    parseAddress(last.address, `${expected.entry} last instruction`) + parseInstructionBytes(last.bytes).length;
  const bytes = readVaRange(buffer, image, first, endExclusive);
  assertEqual(sha256(bytes), expected.bodySha256, `${expected.entry} complete body SHA-256`);
  return {
    entry: expected.entry,
    bodyRange: expected.bodyRange,
    byteRange: `${toHex(first)}-${toHex(endExclusive)} (end exclusive)`,
    blockCount: expected.blockCount,
    instructionCount: expected.instructionCount,
    bodySha256: expected.bodySha256,
  };
}

function verifyRawCodeRange(buffer, image, range) {
  const bytes = readVaRange(buffer, image, range.start, range.endExclusive);
  assertEqual(sha256(bytes), range.sha256, `${range.id} SHA-256`);
  return {
    id: range.id,
    byteRange: `${toHex(range.start)}-${toHex(range.endExclusive)} (end exclusive)`,
    bodySha256: range.sha256,
  };
}

function verifyEvidencePoint(buffer, image, point) {
  const expected = parseInstructionBytes(point.bytes);
  const actual = readVaRange(buffer, image, point.va, point.va + expected.length);
  if (Buffer.compare(actual, expected) !== 0) {
    throw new Error(
      `Static evidence mismatch at ${toHex(point.va)} (${point.meaning}): expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    va: toHex(point.va),
    rawOffset: toHex(requireRawOffset(image, point.va)),
    bytes: formatBytes(actual),
    meaning: point.meaning,
  };
}

function verifyUiStateReferences(references) {
  if (!Array.isArray(references.references)) {
    throw new TypeError("references.json must contain a references array");
  }
  const actual = references.references
    .filter((reference) => reference.to === "0x00552998")
    .map(({ from, type, fromFunctionEntry }) => ({ from, type, fromFunctionEntry }));
  assertEqual(
    JSON.stringify(actual),
    JSON.stringify(EXPECTED_UI_STATE_REFERENCES),
    "DAT_00552998 complete direct-reference set",
  );
  return actual;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read static-analysis JSON from ${path}: ${error.message}`, { cause: error });
  }
}

function readVaRange(buffer, image, start, endExclusive) {
  const rawOffset = requireRawOffset(image, start);
  const bytes = buffer.subarray(rawOffset, rawOffset + endExclusive - start);
  if (bytes.length !== endExclusive - start) {
    throw new RangeError(`${toHex(start)}-${toHex(endExclusive)} exceeds the executable`);
  }
  return bytes;
}

function requireRawOffset(image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new RangeError(`${toHex(va)} is not backed by a PE file section`);
  }
  return offset;
}

function parseInstructionBytes(value) {
  return Buffer.from(value.replaceAll(" ", ""), "hex");
}

function parseAddress(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/u.test(value)) {
    throw new TypeError(`${label} is not a hexadecimal address: ${String(value)}`);
  }
  return Number.parseInt(value.slice(2), 16);
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${label} must be a signed WORD value (-32768..32767); got ${String(value)}`);
  }
}

function assertDword(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(`${label} must fit the original 32-bit field; got ${String(value)}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--input" || arg === "--sprite" || arg === "--seeds" || arg === "--references") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      parsed[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function formatReport(report) {
  return [
    `Objective modal: ${report.coordinateSystem.width}x${report.coordinateSystem.height}`,
    `  resource: ${report.sources.sprite.embeddedPath} (${report.sources.sprite.width}x${report.sources.sprite.height})`,
    `  frame: (${report.layout.frame.x}, ${report.layout.frame.y})-(${report.layout.frame.right}, ${report.layout.frame.bottom})`,
    `  content: (${report.layout.content.x}, ${report.layout.content.y})-(${report.layout.content.right}, ${report.layout.content.bottom})`,
    `  dismiss button: (${report.layout.dismissButton.x}, ${report.layout.dismissButton.y})-(${report.layout.dismissButton.right}, ${report.layout.dismissButton.bottom}), strict interior`,
    `  K01 pilot binding: ${report.pilotBinding.status}`,
    `  complete seeded functions: ${report.functions.length}`,
  ].join("\n");
}
