#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpriteLikeHeader } from "./codec.mjs";
import {
  EXPECTED_EXECUTABLE_SHA256 as OBJECTIVE_BINDING_EXECUTABLE_SHA256,
  reproduceObjectiveStateProducer,
} from "./extract-objective-modal-k01-binding.mjs";
import { readCString, readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  requireRawOffset,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
  verifySeededFunction,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_BUTTON_SPRITE_PATH = "original/imjinrok2/yfnt/buttons201.spr";
const DEFAULT_MENU_BORDER_SPRITE_PATH = "original/imjinrok2/yfnt/gamemenuborder.spr";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 = OBJECTIVE_BINDING_EXECUTABLE_SHA256;
export const EXPECTED_BUTTONS201_SHA256 =
  "4e55d6592b515fe8a9ebcc059fc6e2a487a3ed5db6affd0f516537a392741eec";
export const EXPECTED_GAME_MENU_BORDER_SHA256 =
  "48f60d170a8305fbfc2a08d41b3de96bf19dfe99d9d3460996037df41ed6a8ed";

export const GAMEPLAY_PANEL_RECTANGLE = Object.freeze({
  left: 138,
  top: 457,
  right: 166,
  bottom: 472,
  width: 28,
  height: 15,
});

export const OBJECTIVE_CONTROL_RECTANGLE = Object.freeze({
  left: 264,
  top: 110,
  right: 376,
  bottom: 138,
  width: 112,
  height: 28,
});

const SEEDED_FUNCTIONS = [
  ["0x00411290", "0x00411290-0x004112e2", 1, 20, "a81cd39359e4d2358d186eebd6135911d7c98f28fe52c29e73af4da2b0c628f4"],
  ["0x004113a0", "0x004113a0-0x0041146d", 6, 56, "0113951333de2f5a7241007e9e1b34849e2b062033dd4c71fa6e4804ae40b39d"],
  ["0x004114d0", "0x004114d0-0x004114ef", 3, 12, "549f270f4d8d4b49f13098e04d0f18a5c398d0cdc2dc96161188cacf13b8e6be"],
  ["0x004119f0", "0x004119f0-0x00411a20", 1, 17, "1bf8b1d93a8f6a2054d126d8fb6b2b537f26afe4c1c68f7bccef21c1c07ba8f6"],
  ["0x00411cb0", "0x00411cb0-0x00411ccc", 1, 9, "ae93752e165bb59a2cd95d1bdfc2efc3887ef04b77265e36e2e40bf1cd926318"],
  ["0x00411cd0", "0x00411cd0-0x00411d86", 14, 57, "cc43d4f06b9e2731c3bd3520f1de43c9ef659545f7ad8fcf18369122e927d5f3"],
  ["0x00412e40", "0x00412e40-0x00412fbf", 7, 94, "e69102f24137d2c3df7c15964a200c8a957b0a76f66a1614f4464392b402ee11"],
  ["0x004434a0", "0x004434a0-0x0044357e", 7, 77, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["0x00445730", "0x00445730-0x00445760", 5, 15, "60154ee3e03cd441e521d9ecd08e51dc602dcec10e05b47a1f0c2581b2db7d25"],
  ["0x00445770", "0x00445770-0x004457c4", 1, 17, "f2a8d3a8e0ca3daedac42775a954e5eb372ef27e498f16e04abc84604997ee85"],
  ["0x004457d0", "0x004457d0-0x0044598d", 23, 135, "66537bcb8f5bd236d289bcc7585d443ca5ab2d90063965be9f01ff7d7b7c8648"],
  ["0x004464c0", "0x004464c0-0x0044735e", 224, 988, "a245329c5a23cf47c5890f2f50fa3a7bfdaa0eaf8e0d77a05eb20b8986067a53"],
  ["0x00447bc0", "0x00447bc0-0x00447cfa", 21, 75, "2e11d987f92c0eb624d7ebf7e7adc02ab0aab3726278294b16e6fe77e07f3aa4"],
  ["0x004481d0", "0x004481d0-0x00448225", 6, 21, "71c86b2d7e19eaf1e73cb6e014b8492d5c1de3d4f0830a37f555d917c53a8a2d"],
  ["0x00449090", "0x00449090-0x00449260", 26, 118, "a963a03e97b2278f665504e93237ce958f132844d3e0a1646db9a6f08ea6e5ab"],
  ["0x00449320", "0x00449320-0x004495dd", 13, 184, "d696d96b71017602a5c28b552a2c92f50c2484a81e3c5a8d19e77f3ec4693c07"],
  ["0x004495e0", "0x004495e0-0x004498f3", 31, 228, "d72804831f858fce9cf201b09c307a922a4483d325cdde1649402d1c3cca4d0b"],
  ["0x004590b0", "0x004590b0-0x0045910b", 7, 26, "7f1c16780541946bdca827b5561b68178bae0d65769651150ca52703d302878d"],
  ["0x00459490", "0x00459490-0x0045acfc", 313, 1566, "f6d20a3bbc4426f27cd430a743eb24e75812a544a034f85b3551b7fadfbec202"],
  ["0x0045bb50", "0x0045bb50-0x0045bc45", 14, 61, "a4d518177cefa80c5bb758dca872cb8e8f85b80824ab658752bc9a5338b8354a"],
  ["0x0045f320", "0x0045f320-0x0045f928", 110, 479, "0e1f7677a947bb9499881bb308a55adced0c1cbf516408a3fb1056428d60c469"],
  ["0x0045f9c0", "0x0045f9c0-0x004607ac", 209, 801, "7081ada042adc4fa3a7d7b838f717c52bbd63fae2c45be566b0351cfd12dc022"],
  ["0x00460a10", "0x00460a10-0x00460b4e", 5, 90, "f80926393b04d31dc84b1a969bd7cbfb2acb557f7a0d47dc85b132f0d2001f68"],
  ["0x004700b0", "0x004700b0-0x0047056d", 65, 350, "51eaabc39a221a1b67112069a5fd696e7391328e2627539393722cd1d13bf8bf"],
  ["0x00481ee0", "0x00481ee0-0x00481fce", 1, 45, "e354e42cf17dd8ed5316d764d265f973666897f46e48571ae0b1349e589a6946"],
].map(([entry, bodyRange, blockCount, instructionCount, bodySha256]) => ({
  entry,
  bodyRange,
  blockCount,
  instructionCount,
  bodySha256,
}));

const RAW_CODE_RANGES = [
  {
    id: "common-control-frame-draw-vtable-target",
    start: 0x00411a30,
    endExclusive: 0x00411b47,
    sha256: "484b535fcfe85b683ccdbb1042d7211e8e7366a912ecacaff6609750113d6b71",
  },
  {
    id: "common-control-strict-hit-test-vtable-target",
    start: 0x00411df0,
    endExclusive: 0x00411e37,
    sha256: "3863eae89c0d3d1848aad35171f43a1eb4da0bc8f5a1299a7d106c84a72b3b55",
  },
  {
    id: "window-key-dispatch-tables",
    start: 0x0045f92c,
    endExclusive: 0x0045f9ba,
    sha256: "3a1a384453c2883c2c151e26017a83c0c882e91241912ba6ffe4f87ad44363bd",
  },
];

const STATIC_EVIDENCE = [
  [0x00411293, "b9 01 00 00 00 33 c0 89 4a 04 89 4a 08", "the control constructor initializes both active DWORD fields to 1"],
  [0x0045f445, "8b 74 24 18 8d 46 f7 83 f8 71 0f 87 e7 01 00 00 33 c9 8a 88 48 f9 45 00 ff 24 8d 2c", "WM_KEYDOWN dispatches supported virtual keys through the complete table"],
  [0x0045f4a1, "be 01 00 00 00 66 39 35 30 6e c0 00 75 0d e8 0c 9e fe ff", "VK_ESCAPE first handles an existing open request"],
  [0x0045f4bc, "b8 03 00 00 00 66 39 05 c8 df 4b 00 75 27 39 05 80 5f 7c 00 76 1f", "VK_ESCAPE requires application state 3 and game time greater than 3"],
  [0x0045f4d2, "b9 08 be bc 00 e8 c4 2e 02 00 85 c0 75 11 6a 02 e8 89 03 01 00 83 c4 04 66 89 35 30 6e c0 00", "VK_ESCAPE requires an idle script, plays sound 2, and writes open request 1"],
  [0x004590b0, "83 3d 70 6e c0 00 01 74 50", "gameplay-panel hit testing is disabled only when DAT_00c06e70 equals 1"],
  [0x004590b9, "66 a1 98 bd 88 00 66 8b 0d c4 df 4b 00 66 3b c1 7d 3e", "gameplay-panel left edge is strict"],
  [0x004590de, "66 a1 9a bd 88 00 66 8b 0d c6 df 4b 00 66 3b c1 7d 19", "gameplay-panel top edge is strict"],
  [0x004457bb, "b9 60 bd 88 00 e9 1b c7 03 00", "gameplay UI initialization tail-calls the complete rectangle-field initializer for 0x0088bd60"],
  [0x00481f9c, "66 c7 41 38 8a 00 66 c7 41 3a c9 01 66 c7 41 3c 1c 00 66 c7 41 3e 0f 00", "gameplay-panel fields are left 138, top 457, width 28, and height 15"],
  [0x0045a18c, "e8 1f ef ff ff 85 c0 74 59 66 39 1d 14 2e 5e 00 75 2b 66 39 1d 16 2e 5e 00 75 4e", "gameplay-panel open request requires both press latches"],
  [0x0045a1a7, "66 39 2d 28 6e c0 00 75 45 83 ca ff 66 89 1d 30 6e c0 00", "release state 0 writes gameplay open request 1"],
  [0x00447be0, "66 83 3d 30 6e c0 00 01 75 2e 66 83 3d c8 df 4b 00 03 75 24", "open request 1 and application state 3 gate the sole direct 0x16 transition"],
  [0x00447bf4, "6a 02 e8 75 7c 02 00 68 b8 20 5e 00 e8 ab 84 ff ff 83 c4 08 66 c7 05 c8 df 4b 00 16 00", "transition side effects precede the application-state 0x16 write"],
  [0x004602bd, "ff 6a 02 e8 ab f5 00 00 83 c4 04 e8 23 8d fe ff 66 c7 05 c8 df 4b 00 17 00", "application state 0x16 initializes common UI and advances to 0x17"],
  [0x00412f31, "be 30 88 52 00 8d 7c 24 0c", "common button resources begin at 0x00528830 and advance by fixed sprite-object slots"],
  [0x00412f75, "56 51 e8 24 05 03 00 83 c4 14 85 c0 75 1f", "common button loader continues after a failed sprite load"],
  [0x00449320, "81 ec 00 04 00 00 8d 44 24 00 50 68 60 ba 94 00 68 9c da 4b 00", "common UI composes yfnt game-menu-border resource path"],
  [0x00449361, "68 d8 af 88 00 51 e8 34 a1 ff ff 83 c4 08 85 c0 75 1c", "game-menu-border loader failure reports an error and continues"],
  [0x004493b6, "8b 15 30 94 52 00 a1 2c 94 52 00 6a 01 6a 01 68 44 ab 4c 00 52 50 6a 6e 68 08 01 00 00 b9 b0 27 55 00", "objective control uses x 264, y 110, and buttons201 width and height"],
  [0x00445730, "66 83 3d cc af 88 00 00 74 05 66 b8 01 00 c3", "a nonzero selected stage, including K01 index 1, selects common UI mode 1"],
  [0x004495a7, "6a 01 b9 b0 27 55 00 e8 1d 7f fc ff", "common UI mode 1 activates control 0x005527b0"],
  [0x004496a5, "56 b9 b0 27 55 00 e8 00 86 fc ff 83 f8 01 75 05 bf f0 03 00 00", "objective-control activation sets pending owner state 0x3f0"],
  [0x00449784, "a1 80 95 54 00 b9 18 94 55 00 50 e8 1c 14 00 00 83 f8 01 0f 85 4f 01 00 00", "surface-lock failure skips all common UI drawing after input updates"],
  [0x0044981c, "6a 01 6a 05 6a 04 6a 03 68 28 94 52 00 b9 b0 27 55 00 e8 bd 81 fc ff", "objective control draws buttons201 frames 3, 4, and 5"],
  [0x00411cd9, "39 5e 04 0f 85 9e 00 00 00 39 5e 08 0f 85 95 00 00 00", "control input requires both active fields to equal 1"],
  [0x00411d21, "a1 3c 6e c0 00 85 c0 75 17 39 5c 24 14 75 2f", "control activation requires current button 0 and previous normalized button 1"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const EXPECTED_REFERENCE_SETS = Object.freeze({
  "0x004bdfc8": {
    count: 90,
    sha256: "4a779148bfc0fb3aad420557a89aaaef2b1134694c9e50b51409baaa172c921c",
  },
  "0x00c06e30": {
    count: 8,
    sha256: "ed254d697398a88e31e9e85491a9ab807385c593d1154c83eccc5ea7593ce4d1",
  },
  "0x005527b0": {
    count: 7,
    sha256: "e946372f3df7fb1d40ad2b59daa2427a9040da58e0a8a284079948405bde1f7a",
  },
  "0x00529428": {
    count: 12,
    sha256: "a246591344922ef12bfbab7db904629f536717ecf6ffe1bae21562946b4dee0b",
  },
});

const OBJECTIVE_DRAW_ORDER = Object.freeze([
  "game-menu-border-frame-0",
  "control-0x005529a0",
  "control-0x005527b0",
  "control-0x005528f8",
  "control-0x00552b88",
  "control-0x00552850",
  "control-0x00552ae0",
  "control-0x00552c28",
  "control-0x00552a40",
]);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractApplicationState16ObjectiveControl({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    buttonSpritePath: args.buttons ?? DEFAULT_BUTTON_SPRITE_PATH,
    menuBorderSpritePath: args.border ?? DEFAULT_MENU_BORDER_SPRITE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    referencesPath: args.references ?? DEFAULT_REFERENCES_PATH,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

export function extractApplicationState16ObjectiveControl({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  buttonSpritePath = DEFAULT_BUTTON_SPRITE_PATH,
  menuBorderSpritePath = DEFAULT_MENU_BORDER_SPRITE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const buttonSprite = verifySprite(
    buttonSpritePath,
    EXPECTED_BUTTONS201_SHA256,
    112,
    28,
    42,
  );
  const menuBorderSprite = verifySprite(
    menuBorderSpritePath,
    EXPECTED_GAME_MENU_BORDER_SHA256,
    172,
    310,
    1,
  );
  const seeds = readJson(seedsPath);
  const references = readJson(referencesPath);
  assertEqual(seeds.sourceSha256, executableSha256, `${seedsPath} source SHA-256`);
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
  const referenceSets = Object.fromEntries(
    Object.entries(EXPECTED_REFERENCE_SETS).map(([address, expected]) => [
      address,
      verifyReferenceSet(references, address, expected),
    ]),
  );

  const buttonResourcePath = readCString(
    executableBuffer,
    requireRawOffset(image, 0x004bac80),
  );
  const menuBorderResourcePath = readCString(
    executableBuffer,
    requireRawOffset(image, 0x004bda9c),
  );
  assertEqual(buttonResourcePath, "yfnt\\buttons201.spr", "buttons201 embedded path");
  assertEqual(menuBorderResourcePath, "yfnt\\gamemenuborder.spr", "game menu border embedded path");

  return {
    selectedQuestion:
      "application state 0x16의 완전한 생산 경로와 컨트롤 객체 0x005527b0의 자원·정확한 사각형·표시/입력 조건을 정적으로 복원하여, K01에서 공통 임무 목표 모달을 여는 정확한 사용자 동작과 표시 조건을 확정할 수 있는가?",
    conclusion:
      "Yes for the complete structured direct-reference and K01 path: either gated VK_ESCAPE or a primary-button press/release inside the gameplay-panel rectangle writes open request 1; the next gameplay update writes application state 0x16, common UI mode 1 activates control 0x005527b0 for K01, and a primary-button release strictly inside its buttons201-backed rectangle produces 0x3f0 when no later state control replaces it.",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "analysis-only; no client scene integration",
    analysisScope:
      "complete structured direct references for application state and its open-request WORD; both statically identified request-value-1 producers; application state 0x16 owner transition; common button and menu-border resource loaders; K01 mode selection; objective-control rectangle, activation, input, draw frames, sound/latches, ordered later-state replacement, and draw-lock failure",
    reproductionScope:
      "Escape and gameplay-panel request production, strict-edge and disabled panel input, state 0x16 transition, K01 control initialization, active/inactive control input, strict-edge press/release activation, frame selection, later-state replacement, and draw-lock failure",
    staticOnlyScope: [
      "runtime SPR loader failure reporting and continue-after-error behavior; extraction rejects altered SPR inputs but does not claim that rejection reproduces a runtime loader failure",
      "indirect memory writes to application state that are absent from the complete structured direct-reference set",
      "control sound calls and internal latches are statically fixed and reproduced only as events/state needed by the input sequence; no audio asset parity is claimed",
    ],
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      buttons201: {
        path: buttonSpritePath,
        embeddedPath: buttonResourcePath,
        ...buttonSprite,
      },
      gameMenuBorder: {
        path: menuBorderSpritePath,
        embeddedPath: menuBorderResourcePath,
        ...menuBorderSprite,
      },
      seeds: { path: seedsPath, sourceSha256: seeds.sourceSha256 },
      references: { path: referencesPath, sourceSha256: references.sourceSha256 },
    },
    functions,
    rawCodeRanges,
    evidencePoints,
    referenceSets,
    applicationState: {
      address: "0x004bdfc8",
      width: "signed WORD",
      directReferenceCount: referenceSets["0x004bdfc8"].count,
      onlyDirectImmediate0x16WriteInStructuredSet:
        "0x00447c08 in FUN_00447bc0",
      transitionConditions: ["DAT_00c06e30 == 1", "DAT_004bdfc8 == 3"],
      state16Owner:
        "0x004602c8 calls FUN_00448ff0 and 0x004602cd writes application state 0x17",
      caveat:
        "the complete structured direct-reference set is verified; indirect memory writes and handler-return values outside that set are not asserted absent",
    },
    openRequest: {
      address: "0x00c06e30",
      width: "signed WORD",
      directReferences: referenceSets["0x00c06e30"],
      valueOneProducers: [
        {
          address: "0x0045f4ea",
          function: "FUN_0045f320",
          action: "VK_ESCAPE WM_KEYDOWN with application state 3, game time > 3, and idle script",
        },
        {
          address: "0x0045a1b3",
          function: "FUN_00459490",
          action:
            "primary-button press then release while strictly inside (138,457)-(166,472), with DAT_00c06e70 != 1",
        },
      ],
      resets: [
        "0x0044596b during gameplay UI initialization",
        "0x0046030a after common UI owner processing while application state remains 0x17",
      ],
    },
    objectiveControl: {
      address: "0x005527b0",
      resourceObject: "0x00529428",
      resourcePath: buttonResourcePath,
      rectangle: OBJECTIVE_CONTROL_RECTANGLE,
      rectangleFields: [
        { offset: "0x8c", width: "signed WORD", value: 264, role: "left" },
        { offset: "0x8e", width: "signed WORD", value: 110, role: "top" },
        { offset: "0x90", width: "signed WORD", value: 112, role: "width" },
        { offset: "0x92", width: "signed WORD", value: 28, role: "height" },
      ],
      strictHitTest: "left < pointerX < left + width; top < pointerY < top + height",
      frames: { normal: 3, hover: 4, held: 5 },
      K01Mode:
        "DAT_0088afcc=1 makes FUN_00445730 return mode 1; 0x004495a7 activates control 0x005527b0",
      inputCondition:
        "both control active fields equal 1, pointer is strictly inside, current primary-button state is 0, and the previous normalized primary-button state is 1",
      drawCondition:
        "FUN_004495e0 reaches the shared draw sequence after every common UI control update; inactive controls use frame 3, while a shared-surface lock failure skips all button draws",
      drawOrder: OBJECTIVE_DRAW_ORDER,
      laterStatePriority: ["0x3ee", "0x3ec", "0x3ea"],
    },
    gameplayPanel: {
      rectangle: GAMEPLAY_PANEL_RECTANGLE,
      rectangleFields: [
        { address: "0x0088bd98", width: "signed WORD", value: 138, role: "left" },
        { address: "0x0088bd9a", width: "signed WORD", value: 457, role: "top" },
        { address: "0x0088bd9c", width: "signed WORD", value: 28, role: "width" },
        { address: "0x0088bd9e", width: "signed WORD", value: 15, role: "height" },
      ],
      disabledCondition: "DAT_00c06e70 == 1",
      action:
        "primary-button state 1 arms DAT_005e2e14 and DAT_005e2e16; a later state 0 while still strictly inside writes open request 1",
      unresolvedSemanticLabel:
        "the original user-facing semantic name of the 0x0088bd80-backed gameplay panel is not inferred from its rectangle or code alone",
    },
    unresolvedFields: [
      "no claim is made that the structured direct-reference export excludes every possible indirect pointer write to DAT_004bdfc8",
      "the user-facing label for the gameplay panel rectangle and the Korean label rendered by control 0x005527b0 remain unresolved",
      "runtime behavior after a common button or game-menu-border SPR load failure remains static-only; the callers report an error and continue",
      "client integration needs an owned gameplay-to-UI input/state contract; restricted simulation and scenario files were not changed",
    ],
  };
}

export function reproduceEscapeOpenRequest({
  message,
  virtualKey,
  openRequestValue,
  applicationState,
  gameTime,
  scriptBusy,
}) {
  requireUnsignedDword(message, "message");
  requireUnsignedDword(virtualKey, "virtualKey");
  requireSignedWord(openRequestValue, "openRequestValue");
  requireSignedWord(applicationState, "applicationState");
  requireUnsignedDword(gameTime, "gameTime");
  requireBoolean(scriptBusy, "scriptBusy");

  const events = [];
  let nextOpenRequestValue = openRequestValue;
  let externalDismissRequested = false;
  if (message !== 0x100 || virtualKey !== 0x1b) {
    return { nextOpenRequestValue, externalDismissRequested, soundIds: [], events };
  }
  events.push("dispatch-VK_ESCAPE");
  if (openRequestValue === 1) {
    externalDismissRequested = true;
    events.push("request-common-ui-external-dismiss");
    return { nextOpenRequestValue, externalDismissRequested, soundIds: [], events };
  }
  if (applicationState !== 3) {
    events.push("reject-application-state-not-3");
    return { nextOpenRequestValue, externalDismissRequested, soundIds: [], events };
  }
  if (gameTime <= 3) {
    events.push("reject-game-time-not-greater-than-3");
    return { nextOpenRequestValue, externalDismissRequested, soundIds: [], events };
  }
  if (scriptBusy) {
    events.push("reject-script-busy");
    return { nextOpenRequestValue, externalDismissRequested, soundIds: [], events };
  }
  nextOpenRequestValue = 1;
  events.push("play-sound-2", "write-open-request-1");
  return { nextOpenRequestValue, externalDismissRequested, soundIds: [2], events };
}

export function reproduceGameplayPanelOpenRequest({
  pointerX,
  pointerY,
  disabledValue,
  primaryButtonState,
  armedLatch,
  pressedInsideLatch,
  openRequestValue,
}) {
  requireSignedWord(pointerX, "pointerX");
  requireSignedWord(pointerY, "pointerY");
  requireDwordInteger(disabledValue, "disabledValue");
  requireSignedWord(primaryButtonState, "primaryButtonState");
  requireSignedWord(armedLatch, "armedLatch");
  requireSignedWord(pressedInsideLatch, "pressedInsideLatch");
  requireSignedWord(openRequestValue, "openRequestValue");

  const hit =
    disabledValue !== 1 && strictContains(GAMEPLAY_PANEL_RECTANGLE, pointerX, pointerY);
  const events = [];
  const soundIds = [];
  let nextArmedLatch = armedLatch;
  let nextPressedInsideLatch = pressedInsideLatch;
  let nextOpenRequestValue = openRequestValue;
  let selectionValue = null;

  if (!hit) {
    nextArmedLatch = 0;
    events.push(disabledValue === 1 ? "disabled-clear-armed-latch" : "outside-clear-armed-latch");
  } else if (armedLatch === 1) {
    if (pressedInsideLatch === 1 && primaryButtonState === 0) {
      nextOpenRequestValue = 1;
      nextArmedLatch = 0;
      selectionValue = -1;
      events.push("release-inside-write-open-request-1", "clear-armed-latch");
    }
  } else if (primaryButtonState === 1) {
    nextPressedInsideLatch = 1;
    nextArmedLatch = 1;
    soundIds.push(14);
    events.push("press-inside-play-sound-14", "arm-panel-release");
  }

  return {
    hit,
    nextOpenRequestValue,
    nextArmedLatch,
    nextPressedInsideLatch,
    selectionValue,
    soundIds,
    events,
  };
}

export function reproduceApplicationState16Transition({
  openRequestValue,
  applicationState,
}) {
  requireSignedWord(openRequestValue, "openRequestValue");
  requireSignedWord(applicationState, "applicationState");
  if (openRequestValue !== 1 || applicationState !== 3) {
    return {
      transitioned: false,
      nextApplicationState: applicationState,
      soundIds: [],
      events: [],
    };
  }
  return {
    transitioned: true,
    nextApplicationState: 0x16,
    soundIds: [2],
    events: [
      "play-sound-2",
      "call-FUN_004400b0-with-0x005e20b8",
      "write-application-state-0x16",
      "return-early-from-FUN_00447bc0",
    ],
  };
}

export function reproduceObjectiveControlInitialization({
  selectedStageIndex,
  alternateModeFlag,
  networkModeWord,
  multiplayerFlag,
}) {
  requireSignedWord(selectedStageIndex, "selectedStageIndex");
  requireDwordInteger(alternateModeFlag, "alternateModeFlag");
  requireSignedWord(networkModeWord, "networkModeWord");
  requireDwordInteger(multiplayerFlag, "multiplayerFlag");

  const mode = selectCommonUiMode({
    selectedStageIndex,
    alternateModeFlag,
    networkModeWord,
  });
  const active = mode === 0 || mode === 1;
  const events = [`select-common-ui-mode-${mode}`];
  if (mode === 0) {
    events.push("preserve-constructor-initialized-active-objective-control");
  } else if (mode === 1) {
    events.push("activate-objective-control");
  } else {
    events.push("deactivate-objective-control");
  }
  if (mode === 3 && multiplayerFlag === 1) {
    events.push("deactivate-multiplayer-only-control-0x00552b88");
  }
  return {
    mode,
    active,
    rectangle: {
      left: 264,
      top: 110,
      right: 376,
      bottom: 138,
      width: 112,
      height: 28,
    },
    events,
  };
}

export function reproduceObjectiveControlUpdate({
  active,
  pointerX,
  pointerY,
  currentPrimaryButton,
  previousPrimaryButton,
  pressSoundLatch,
  insideLatch,
  surfaceLockSucceeded,
  state3eeControlActivated,
  state3ecControlActivated,
  state3eaControlActivated,
}) {
  requireBoolean(active, "active");
  requireSignedWord(pointerX, "pointerX");
  requireSignedWord(pointerY, "pointerY");
  requireDwordInteger(currentPrimaryButton, "currentPrimaryButton");
  requireDwordInteger(previousPrimaryButton, "previousPrimaryButton");
  requireDwordInteger(pressSoundLatch, "pressSoundLatch");
  requireDwordInteger(insideLatch, "insideLatch");
  requireBoolean(surfaceLockSucceeded, "surfaceLockSucceeded");
  requireBoolean(state3eeControlActivated, "state3eeControlActivated");
  requireBoolean(state3ecControlActivated, "state3ecControlActivated");
  requireBoolean(state3eaControlActivated, "state3eaControlActivated");

  const hit = active && strictContains(OBJECTIVE_CONTROL_RECTANGLE, pointerX, pointerY);
  const events = [];
  const soundIds = [];
  let nextPressSoundLatch = pressSoundLatch;
  let nextInsideLatch = insideLatch;
  let activated = false;

  if (!hit) {
    nextPressSoundLatch = 0;
    nextInsideLatch = 0;
    events.push(active ? "outside-clear-control-latches" : "inactive-clear-control-latches");
  } else if (currentPrimaryButton === 0 && previousPrimaryButton === 1) {
    nextPressSoundLatch = 0;
    activated = true;
    events.push("release-inside-activate-objective-control");
  } else {
    if (currentPrimaryButton !== 0 && pressSoundLatch === 0) {
      nextPressSoundLatch = 1;
      soundIds.push(15);
      events.push("press-inside-play-sound-15");
    }
    nextInsideLatch = 1;
    events.push("set-control-inside-latch");
  }

  const stateProducer = reproduceObjectiveStateProducer({
    objectiveControlActivated: activated,
    state3eeControlActivated,
    state3ecControlActivated,
    state3eaControlActivated,
  });
  events.push(...stateProducer.events);

  const frame = hit ? (currentPrimaryButton === 0 ? 4 : 5) : 3;
  if (surfaceLockSucceeded) {
    events.push(`draw-buttons201-frame-${frame}`);
  } else {
    events.push("surface-lock-failed-skip-common-ui-draws");
  }
  return {
    hit,
    activated,
    nextPressSoundLatch,
    nextInsideLatch,
    soundIds,
    handlerReturn: stateProducer.handlerReturn,
    ownerStateAfterReturnWrite: stateProducer.ownerStateAfterReturnWrite,
    draw: {
      surfaceLockAttempted: true,
      surfaceLockSucceeded,
      buttonDrawAttempted: surfaceLockSucceeded,
      buttonDrawn: surfaceLockSucceeded,
      frame: surfaceLockSucceeded ? frame : null,
    },
    events,
  };
}

function verifySprite(path, expectedSha256, width, height, frameCount) {
  const buffer = readFileSync(path);
  const actualSha256 = sha256(buffer);
  assertEqual(actualSha256, expectedSha256, `${path} SHA-256`);
  const header = parseSpriteLikeHeader(buffer, path);
  assertEqual(header.width, width, `${path} width`);
  assertEqual(header.height, height, `${path} height`);
  assertEqual(header.frameCount, frameCount, `${path} frame count`);
  return { sha256: actualSha256, width, height, frameCount };
}

function verifyReferenceSet(references, address, expected) {
  const directReferences = references.references
    .filter((reference) => reference.to === address)
    .map(({ from, type, fromFunctionEntry }) => ({ from, type, fromFunctionEntry }));
  const digest = createHash("sha256")
    .update(JSON.stringify(directReferences))
    .digest("hex");
  assertEqual(directReferences.length, expected.count, `${address} direct reference count`);
  assertEqual(digest, expected.sha256, `${address} direct reference SHA-256`);
  return { count: directReferences.length, sha256: digest, directReferences };
}

function strictContains(rectangle, x, y) {
  return (
    rectangle.left < x &&
    x < rectangle.right &&
    rectangle.top < y &&
    y < rectangle.bottom
  );
}

function selectCommonUiMode({
  selectedStageIndex,
  alternateModeFlag,
  networkModeWord,
}) {
  if (selectedStageIndex !== 0) {
    return 1;
  }
  if (alternateModeFlag === 1) {
    return 2;
  }
  if (networkModeWord === 1) {
    return 3;
  }
  return 0;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean, got ${String(value)}`);
  }
}

function requireSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${label} must be a signed WORD, got ${String(value)}`);
  }
}

function requireUnsignedDword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be an unsigned DWORD, got ${String(value)}`);
  }
}

function requireDwordInteger(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(`${label} must fit the original DWORD field, got ${String(value)}`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      args.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || !["--input", "--buttons", "--border", "--seeds", "--references"].includes(argument)) {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    args[argument.slice(2)] = value;
    index += 1;
  }
  return args;
}

function formatReport(report) {
  return [
    report.selectedQuestion,
    `analysis: ${report.analysisStatus}`,
    `reproduction: ${report.reproductionStatus}`,
    `implementation: ${report.implementationStatus}`,
    report.conclusion,
  ].join("\n");
}
