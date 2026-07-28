#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";
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
const DEFAULT_K01_SCRIPT_PATH = "original/imjinrok2/script/K0110";
const DEFAULT_K02_SCRIPT_PATH = "original/imjinrok2/script/K0210";
const DEFAULT_K01_MAP_PATH = "original/imjinrok2/stagemap/k01.map";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_K01_SCRIPT_SHA256 = "d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8";
export const EXPECTED_K02_SCRIPT_SHA256 = "53a0a6f03b6ff7bc8d2456b5c66712054a73a2c4b921fff6c62f765552bd4331";
export const EXPECTED_K01_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";

const RECORD_OBJECT_BASE = 0x00abf068;
const MODAL_RECORD_BASE = 0x00abf0e8;
const RECORD_STRIDE = 0x80;

const K01_OBJECTIVE = Object.freeze([
  "1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)",
  "",
]);
const K02_OBJECTIVE = Object.freeze([
  "1. 어가를 평양성까지 대피시킨다. (유성룡은 살아 남아야 한다.)",
  "",
]);

const SEEDED_FUNCTIONS = [
  ["0x0043e620", "0x0043e620-0x0043e870", 34, 154, "7ec4a7ccac509d278207549f8d9c3d2b068d16fa355d663be32cbc4dd612d33f"],
  ["0x00449090", "0x00449090-0x00449260", 26, 118, "a963a03e97b2278f665504e93237ce958f132844d3e0a1646db9a6f08ea6e5ab"],
  ["0x004495e0", "0x004495e0-0x004498f3", 31, 228, "d72804831f858fce9cf201b09c307a922a4483d325cdde1649402d1c3cca4d0b"],
  ["0x0045f9c0", "0x0045f9c0-0x004607ac", 209, 801, "7081ada042adc4fa3a7d7b838f717c52bbd63fae2c45be566b0351cfd12dc022"],
  ["0x004838f0", "0x004838f0-0x0048399f", 9, 68, "2f3c22c303aa3a713a4319e2bd573b5297553cd853a2138fd26e907f44d4a180"],
  ["0x0048a5c0", "0x0048a5c0-0x0048a878", 32, 181, "0b78f8d459c6fa6d316d00bfa07148949a9156d182d3428726623749a0d9eed8"],
  ["0x0048d030", "0x0048d030-0x0048d401", 1, 371, "10efc29371f2e0a4e488cac2ed9060e408a16c3502340160c8c091572ad422eb"],
  ["0x0048d410", "0x0048d410-0x0048d594", 31, 110, "5a153fda4bbb050636e176ae5c301bede924f74901c5c700a3a8843cfd83f131"],
  ["0x0048d610", "0x0048d610-0x0048d650", 7, 24, "afa02728ff2f330da6f50482812855c89e70c69bac12707cd538fffb99da01e9"],
  ["0x0048d660", "0x0048d660-0x0048d681", 6, 13, "749dfcbdd07bf0688ef6024cb2602ed455ee184291cc874b422ba8f91bc442ca"],
  ["0x0048d690", "0x0048d690-0x0048d6e4", 7, 22, "46f8294bffae94c6a70030b03f41c28cac289d09eecfa10177b5747e28553491"],
  ["0x0048dbe0", "0x0048dbe0-0x0048dda9", 21, 147, "cae832cc2a5ec11a0edb02a33dac3ee255d9d392861e4408f2eea21f0ad16bd2"],
  ["0x0048ddb0", "0x0048ddb0-0x0048deca", 36, 105, "e89b585faafbb8b3b64f26fbdf8bf1aaa634116ea6de093f91652658fb0aa8f1"],
  ["0x004a5730", "0x004a5730-0x004a5977", 13, 157, "84cccf7daf0e07f6a0e58041034a86be6fbc07937c768240426632bb7e8855e9"],
  ["0x004aafa0", "0x004aafa0-0x004ab2ac", 12, 170, "4bf067a1d6bec6f24cf7f98d43db3cf05a16c770f6a1df87c290f99eab76af56"],
  ["0x004ab630", "0x004ab630-0x004ab6b5", 8, 58, "8542edca08465064c5d0fa6b408ef22baa927af455335dbf8246766ce7f433aa"],
].map(([entry, bodyRange, blockCount, instructionCount, bodySha256]) => ({
  entry,
  bodyRange,
  blockCount,
  instructionCount,
  bodySha256,
}));

const RAW_CODE_RANGES = [
  {
    id: "stage-title-record-loader",
    start: 0x004ab4f0,
    endExclusive: 0x004ab62d,
    sha256: "3c02ea5bd0c671671e50b5d7e14b7c86be7b8dda32bb639feb48fa7dc2e48209",
  },
];

const STATIC_EVIDENCE = [
  [0x004496a5, "56 b9 b0 27 55 00 e8 00 86 fc ff 83 f8 01 75 05 bf f0 03 00 00", "control 0x005527b0 produces return value 0x3f0"],
  [0x004496ba, "56 b9 f8 28 55 00 e8 eb 85 fc ff 83 f8 01 75 05 bf ee 03 00 00", "control 0x005528f8 independently sets the pending state to 0x3ee"],
  [0x004496fd, "56 b9 e0 2a 55 00 e8 a8 85 fc ff 83 f8 01 75 05 bf ec 03 00 00", "control 0x00552ae0 independently sets the pending state to 0x3ec after the 0x3ee control"],
  [0x00449712, "56 b9 50 28 55 00 e8 93 85 fc ff 83 f8 01 75 05 bf ea 03 00 00", "control 0x00552850 independently sets the pending state to 0x3ea after the 0x3ec control"],
  [0x004498ec, "66 8b c7 5f 83 c4 14 c3", "FUN_004495e0 returns the selected WORD through AX"],
  [0x004490ed, "e8 ee 04 00 00 8b f0 83 c4 04 66 85 f6", "state owner calls FUN_004495e0 and tests its WORD return"],
  [0x00449100, "e8 fb 07 00 00 66 89 35 98 29 55 00", "nonzero handler return is written to signed WORD DAT_00552998"],
  [0x004491bc, "e8 6f c5 05 00 66 c7 05 98 29 55 00 f1 03", "state 0x3f0 calls the objective modal initializer and advances to 0x3f1"],
  [0x004602c8, "e8 23 8d fe ff 66 c7 05 c8 df 4b 00 17 00", "application loop initializes the common UI and enters owner state 0x17"],
  [0x004602db, "66 39 35 20 6e c0 00 75 05 e8 d7 78 fe ff e8 a2 8d fe ff", "state 0x17 calls the common UI owner"],
  [0x0043e784, "66 89 0d 44 2b 53 00 51 66 8b 0d 5c 02 53 00 51 b9 68 f0 ab 00 e8 f2 ee 04 00", "selected stage and country feed FUN_0048d690"],
  [0x0045f1d0, "b9 68 f0 ab 00 e8 56 de 02 00", "record object at 0x00abf068 is initialized by FUN_0048d030"],
  [0x0048d03e, "8d 9a 00 01 00 00 f3 ab 83 c9 ff bf b8 31 4c 00", "first populated record destination is object+0x100 and source is embedded script K0110"],
  [0x0048d05d, "8d 9a 80 01 00 00", "second populated record destination is object+0x180"],
  [0x0048d071, "bf a8 31 4c 00", "second populated record source is embedded script K0210"],
  [0x0048d410, "0f bf 44 24 04 48 56 83 f8 1b 8b f1 0f 87 f8 00 00 00", "mission map dispatcher accepts signed WORD indices 1 through 28"],
  [0x0048d610, "0f bf 44 24 04 48 74 2b 48 74 18 48 74 05 33 c0 c2 08 00", "record selector rejects countries outside signed WORD values 1 through 3"],
  [0x0048d690, "66 8b 4c 24 04 0f bf c1 48 74 35 48 74 1a 48 75 41", "country selector branches on signed WORD values 1, 2, and 3"],
  [0x0048d6d0, "66 8b 44 24 08 66 89 0d ce af 88 00 66 a3 cc af 88 00", "country 1 stores the selected stage directly in DAT_0088afcc"],
  [0x004a57fa, "0f bf 0d cc af 88 00 8d 44 24 18 c1 e1 07 50 81 c1 e8 f0 ab 00", "objective modal sign-extends DAT_0088afcc and selects base+index*128"],
  [0x0048dc4c, "66 a1 cc af 88 00", "mission map loader reads DAT_0088afcc"],
  [0x0048ddfa, "0f bf 05 cc af 88 00 48 83 f8 1a 0f 87 a8 00 00 00", "mission handler dispatcher reads DAT_0088afcc and bounds indices 1 through 27"],
  [0x0048de12, "e8 a9 c7 ff ff 5e c3", "mission index 1 dispatches to FUN_0048a5c0"],
  [0x0048a6cf, "68 48 2f 4c 00", "K01 handler references script K0115"],
  [0x0048a78a, "68 38 2f 4c 00", "K01 handler references script K0120"],
  [0x004ab54d, "b9 68 f0 ab 00 e8 b9 20 fe ff", "stage-title loader resolves each country/stage through FUN_0048d610"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const RECORDS = new Map([
  [
    1,
    {
      recordPath: "script\\k0110",
      modalTextInputs: K01_OBJECTIVE,
      mapPath: "stagemap\\k01.map",
      missionHandler: "0x0048a5c0",
      isK01Runtime: true,
      selectsK01ObjectiveText: true,
    },
  ],
  [
    2,
    {
      recordPath: "script\\k0210",
      modalTextInputs: K02_OBJECTIVE,
      mapPath: "stagemap\\k02.map",
      missionHandler: "0x0048a880",
      isK01Runtime: false,
      selectsK01ObjectiveText: false,
    },
  ],
]);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractObjectiveModalK01Binding({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    k01ScriptPath: args.k01Script ?? DEFAULT_K01_SCRIPT_PATH,
    k02ScriptPath: args.k02Script ?? DEFAULT_K02_SCRIPT_PATH,
    k01MapPath: args.k01Map ?? DEFAULT_K01_MAP_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

export function extractObjectiveModalK01Binding({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  k01ScriptPath = DEFAULT_K01_SCRIPT_PATH,
  k02ScriptPath = DEFAULT_K02_SCRIPT_PATH,
  k01MapPath = DEFAULT_K01_MAP_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const k01Script = verifyScript(k01ScriptPath, EXPECTED_K01_SCRIPT_SHA256, K01_OBJECTIVE);
  const k02Script = verifyScript(k02ScriptPath, EXPECTED_K02_SCRIPT_SHA256, K02_OBJECTIVE);
  const k01MapBuffer = readFileSync(k01MapPath);
  assertEqual(sha256(k01MapBuffer), EXPECTED_K01_MAP_SHA256, `${k01MapPath} SHA-256`);

  const seeds = readJson(seedsPath);
  assertEqual(seeds.sourceSha256, executableSha256, `${seedsPath} source SHA-256`);
  const functions = SEEDED_FUNCTIONS.map((expected) =>
    verifySeededFunction(executableBuffer, image, seeds, expected),
  );
  const rawCodeRanges = RAW_CODE_RANGES.map((range) =>
    verifyRawCodeRange(executableBuffer, image, range),
  );
  const evidencePoints = STATIC_EVIDENCE.map((point) =>
    verifyEvidencePoint(executableBuffer, image, point),
  );

  const embedded = {
    k01Script: readEmbeddedPath(executableBuffer, image, 0x004c31b8, "script\\k0110"),
    k02Script: readEmbeddedPath(executableBuffer, image, 0x004c31a8, "script\\k0210"),
    k01Map: readEmbeddedPath(executableBuffer, image, 0x004c31c8, "stagemap\\k01.map"),
    k02Map: readEmbeddedPath(executableBuffer, image, 0x004c31dc, "stagemap\\k02.map"),
  };

  const k01Binding = reproduceObjectiveModalBinding(1);
  assertEqual(k01Binding.recordPath, embedded.k01Script.value, "K01 modal record path");
  assertEqual(k01Binding.mapPath, embedded.k01Map.value, "K01 map path");
  assertEqual(
    JSON.stringify(k01Binding.modalTextInputs),
    JSON.stringify(k01Script.objectiveArgs),
    "K01 modal text inputs",
  );
  const k02Binding = reproduceObjectiveModalBinding(2);
  assertEqual(k02Binding.recordPath, embedded.k02Script.value, "K02 modal record path");
  assertEqual(k02Binding.mapPath, embedded.k02Map.value, "K02 map path");
  assertEqual(
    JSON.stringify(k02Binding.modalTextInputs),
    JSON.stringify(k02Script.objectiveArgs),
    "K02 modal text inputs",
  );

  return {
    selectedQuestion:
      "Which upstream return-value or indirect producer makes signed WORD DAT_00552998 equal 0x3f0, and does the DAT_0088afcc-selected 128-byte record statically bind the common objective modal to K01 objective text?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "analysis-only; no client scene integration",
    conclusion:
      "K01 is statically bound to the common objective modal: Korean campaign stage 1 stores DAT_0088afcc=1, which selects script\\k0110 and its two OBJECTIVE arguments while mission index 1 dispatches to stagemap\\k01.map and FUN_0048a5c0; in common UI state 0x17, a return of 1 from control 0x005527b0 sets FUN_004495e0's pending return to 0x3f0, and when no later state control overwrites it FUN_00449090 writes that WORD to DAT_00552998.",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      k01Script: { path: k01ScriptPath, sha256: k01Script.sha256 },
      k02Script: { path: k02ScriptPath, sha256: k02Script.sha256 },
      k01Map: { path: k01MapPath, sha256: EXPECTED_K01_MAP_SHA256 },
      seeds: { path: seedsPath, sourceSha256: seeds.sourceSha256 },
    },
    functions,
    rawCodeRanges,
    evidencePoints,
    staticEvidencePointCount: evidencePoints.length,
    stateProducer: {
      controlObject: "0x005527b0",
      controlMatchCall: "0x004496ab to FUN_00411cb0",
      literalReturnProducer: "0x004496b5 sets EDI to 0x3f0",
      functionReturn: "0x004498ec copies DI to AX",
      ownerCall: "0x004490ed to FUN_004495e0",
      ownerWrite: "0x00449105 writes SI to signed WORD DAT_00552998",
      modalConsumer: "0x004491bc in FUN_00449090",
      reproductionScope:
        "earlier one-shot and state-3 controls in FUN_004495e0 are inactive; the model begins at the objective control and reproduces every following state-producing control in original order",
      applicationOwnerPath: {
        initializer: "0x004602c8 calls FUN_00448ff0",
        applicationState: "0x17",
        ownerCall: "0x004602e9 to FUN_00449090",
      },
      precondition:
        "the objective control returns 1 and no later return-producing control in FUN_004495e0 overwrites EDI",
      orderedLaterControls: [
        { controlObject: "0x005528f8", pendingState: "0x3ee", call: "0x004496c0" },
        { controlObject: "0x00552ae0", pendingState: "0x3ec", call: "0x00449703" },
        { controlObject: "0x00552850", pendingState: "0x3ea", call: "0x00449718" },
      ],
    },
    recordSelection: {
      indexStorage: { address: "0x0088afcc", width: "signed WORD" },
      objectBase: toHex(RECORD_OBJECT_BASE),
      modalRecordBase: toHex(MODAL_RECORD_BASE),
      recordStride: RECORD_STRIDE,
      consumerRange: "0x004a57fa-0x004a581a",
      k01: k01Binding,
      neighborCheck: k02Binding,
      embedded,
    },
    k01Binding: {
      campaign: 1,
      selectedStage: 1,
      stageWriterCall: "0x0043e799 to FUN_0048d690",
      indexWrite: "0x0048d6dc stores AX=1 to DAT_0088afcc",
      ...k01Binding,
    },
    unresolvedFields: [
      "the user-facing Korean label or semantic name of control object 0x005527b0 is not recovered in this question; its exact 0x3f0 return behavior is confirmed",
      "the complete upstream user action and display conditions that produce application state 0x16 are not recovered in this question",
      "the historical reason the record object reserves its zero record is not recovered; K01 index 1 is unaffected",
      "font face, font size, and Korean line-wrapping rules remain outside this binding question",
    ],
  };
}

export function reproduceObjectiveStateProducer({
  objectiveControlActivated,
  state3eeControlActivated,
  state3ecControlActivated,
  state3eaControlActivated,
}) {
  assertBoolean(objectiveControlActivated, "objectiveControlActivated");
  assertBoolean(state3eeControlActivated, "state3eeControlActivated");
  assertBoolean(state3ecControlActivated, "state3ecControlActivated");
  assertBoolean(state3eaControlActivated, "state3eaControlActivated");

  let handlerReturn = 0;
  const events = [];
  if (objectiveControlActivated) {
    handlerReturn = 0x3f0;
    events.push("objective-control-set-pending-0x3f0");
  }
  const orderedLaterControls = [
    [state3eeControlActivated, 0x3ee],
    [state3ecControlActivated, 0x3ec],
    [state3eaControlActivated, 0x3ea],
  ];
  for (const [activated, pendingState] of orderedLaterControls) {
    if (!activated) {
      continue;
    }
    if (handlerReturn === 0) {
      events.push(`later-control-set-pending-${formatState(pendingState)}`);
    } else {
      events.push(
        `later-control-overwrite-${formatState(handlerReturn)}-with-${formatState(pendingState)}`,
      );
    }
    handlerReturn = pendingState;
  }
  if (handlerReturn !== 0) {
    events.push("write-handler-return-to-DAT_00552998");
  }
  return {
    handlerReturn,
    ownerStateAfterReturnWrite: handlerReturn === 0 ? null : handlerReturn,
    events,
  };
}

export function reproduceSelectedStageIndex({ country, stage, previousIndex }) {
  assertSignedWord(country, "country");
  assertSignedWord(stage, "stage");
  assertSignedWord(previousIndex, "previousIndex");
  if (country < 1 || country > 3) {
    return { wrote: false, nextIndex: previousIndex };
  }
  return {
    wrote: true,
    nextIndex: wrapSignedWord(stage + (country - 1) * 10),
  };
}

export function reproduceObjectiveModalBinding(stageIndex) {
  assertSignedWord(stageIndex, "stageIndex");
  const recordAddress = MODAL_RECORD_BASE + stageIndex * RECORD_STRIDE;
  const record = RECORDS.get(stageIndex);
  return {
    recordAddress: toHex(recordAddress),
    recordPath: record?.recordPath ?? null,
    modalTextInputs: record ? [...record.modalTextInputs] : null,
    mapPath: record?.mapPath ?? null,
    missionHandler: record?.missionHandler ?? null,
    isK01Runtime: record?.isK01Runtime ?? false,
    selectsK01ObjectiveText: record?.selectsK01ObjectiveText ?? false,
  };
}

function verifyScript(path, expectedSha256, expectedObjective) {
  const buffer = readFileSync(path);
  const digest = sha256(buffer);
  assertEqual(digest, expectedSha256, `${path} SHA-256`);
  const text = new TextDecoder("windows-949", { fatal: true }).decode(buffer);
  const matches = [...text.matchAll(/\[OBJECTIVE\]\[([^\]]*)\]\[([^\]]*)\]/gu)];
  assertEqual(matches.length, 1, `${path} OBJECTIVE command count`);
  const objectiveArgs = [matches[0][1], matches[0][2]];
  assertEqual(
    JSON.stringify(objectiveArgs),
    JSON.stringify(expectedObjective),
    `${path} OBJECTIVE arguments`,
  );
  return { sha256: digest, objectiveArgs };
}

function readEmbeddedPath(buffer, image, va, expected) {
  const value = readCString(buffer, requireRawOffset(image, va));
  assertEqual(value, expected, `${toHex(va)} embedded path`);
  return { address: toHex(va), value };
}

function wrapSignedWord(value) {
  const unsigned = value & 0xffff;
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${label} must be a signed WORD value (-32768..32767); got ${String(value)}`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean; got ${String(value)}`);
  }
}

function formatState(value) {
  return `0x${value.toString(16)}`;
}

function parseArgs(argv) {
  const parsed = {};
  const pathOptions = new Map([
    ["--input", "input"],
    ["--k01-script", "k01Script"],
    ["--k02-script", "k02Script"],
    ["--k01-map", "k01Map"],
    ["--seeds", "seeds"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    const key = pathOptions.get(arg);
    if (key) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      parsed[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function formatReport(report) {
  return [
    `Objective modal K01 binding: ${report.analysisStatus}/${report.reproductionStatus}`,
    `  DAT_00552998 producer: ${report.stateProducer.literalReturnProducer}`,
    `  K01 stage index: ${report.k01Binding.selectedStage}`,
    `  K01 record: ${report.k01Binding.recordPath} at ${report.k01Binding.recordAddress}`,
    `  K01 map/handler: ${report.k01Binding.mapPath} / ${report.k01Binding.missionHandler}`,
  ].join("\n");
}
