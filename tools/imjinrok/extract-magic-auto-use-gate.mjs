#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { extractActionDefinitions } from "./extract-hero-priority-queue-gate.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SEEDS_SHA256 =
  "325cef518b8ad459d2d1ddfefd3cb5dc960dba060e75a291736049d569b4a329";
export const EXPECTED_FUNCTIONS_SHA256 =
  "c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3";
export const EXPECTED_REFERENCES_SHA256 =
  "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c";
export const EXPECTED_JUMP_TABLES_SHA256 =
  "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f";

const QUESTION =
  "selection-count-zero HUD slot 0의 controls 0x21/0x22와 actions 61/62가 제어하는 인접 player-scoped WORD gate의 전체 writer/read/reset/consumer 경로와 영향 집합을 원본 EXE·generated static evidence에서 복원해, 사용자가 기억한 플레이어 글로벌 마법 자동사용 활성/비활성 UX와 정확히 일치하는가?";

const PLAYER_RECORD_BASE = 0x0082c480;
const PLAYER_RECORD_STRIDE = 0x2c10;
const PLAYER_COUNT = 8;
const MAGIC_AUTO_USE_OFFSET = 0x254c;
const MAGIC_AUTO_USE_PLAYER_ZERO = PLAYER_RECORD_BASE + MAGIC_AUTO_USE_OFFSET;
const AUTO_USE_DISPATCHER = 0x004196e0;

const CASES = [
  {
    internalClass: 11,
    caseEntry: "0x004197b0",
    gateRead: "0x004197c5",
    cadence: "updated global 0x007c5f8c remainder low two bits equal zero",
    directCalls: ["0x00424d80"],
    returnBoundary: "always returns 0 after the optional helper call",
  },
  {
    internalClass: 16,
    caseEntry: "0x00419810",
    gateRead: "0x00419825",
    cadence:
      "updated global 0x007c5f8c remainder low two bits 0 calls 0x0041c870, 1 calls 0x00424d80, 2/3 no-op",
    directCalls: ["0x00424d80", "0x0041c870"],
    returnBoundary: "returns 1 only when 0x0041c870 returns exact 1; otherwise 0",
  },
  {
    internalClass: 20,
    caseEntry: "0x00419880",
    gateRead: "0x00419895",
    cadence:
      "updated global 0x007c5f8c remainder modulo 3: 0 calls 0x0042d550, 1 calls 0x00424d80, 2 no-op",
    directCalls: ["0x00424d80", "0x0042d550"],
    returnBoundary: "returns 1 only when 0x0042d550 returns exact 1; otherwise 0",
  },
  {
    internalClass: 36,
    caseEntry: "0x004198f0",
    gateRead: "0x00419905",
    cadence: "none after the nonzero player gate",
    directCalls: ["0x0041c3c0"],
    returnBoundary: "normalizes exact helper return 1 to 1 and every other return to 0",
  },
  {
    internalClass: 78,
    caseEntry: "0x00419930",
    gateRead: "0x00419948",
    cadence: "updated global 0x007c5f8c remainder modulo 3 equals zero",
    directCalls: ["0x0041c870", "0x004784c0", "0x004788b0"],
    returnBoundary:
      "returns 1 after either reached delivery call; target/type rejection returns 0",
  },
  {
    internalClass: 79,
    caseEntry: "0x00419a10",
    gateRead: "0x00419a25",
    cadence: "updated global 0x007c5f8c remainder modulo 3 equals zero",
    directCalls: ["0x00425210"],
    returnBoundary: "normalizes exact helper return 1 to 1 and every other return to 0",
  },
  {
    internalClass: 80,
    caseEntry: "0x00419a80",
    gateRead: "0x00419a95",
    cadence: "updated global 0x007c5f8c remainder modulo 3 equals zero",
    directCalls: ["0x0041cf20"],
    returnBoundary: "normalizes exact helper return 1 to 1 and every other return to 0",
  },
  {
    internalClass: 85,
    caseEntry: "0x00419af0",
    gateRead: "0x00419b10",
    cadence:
      "the wrapped DWORD sum of sign-extended entity WORD +0x1b6 and global 0x007c5f90 has unsigned remainder zero modulo 3",
    directCalls: [
      "0x00437400",
      "0x00441e40",
      "0x00437570",
      "0x0048e3a0",
      "0x0048e4a0",
      "0x004788e0",
      "0x004237d0",
      "0x004426a0",
      "0x00478440",
    ],
    returnBoundary:
      "gate/cadence failure returns 0; the admitted scan/delivery branch returns 1",
  },
  {
    internalClass: 89,
    caseEntry: "0x00419e90",
    gateRead: "0x00419ea8",
    cadence: "updated global 0x007c5f8c remainder modulo 3 equals zero",
    directCalls: [
      "0x00414880",
      "0x00439f50",
      "0x00478500",
      "0x0042d920",
      "0x00478540",
    ],
    returnBoundary:
      "returns 1 after either reached delivery call; validation/helper rejection returns 0",
  },
];

const RAW_CODE_RANGES = [
  ["auto-use-caller", 0x00416c70, 0x0041737f, "64a73cde6d1acefe57c3490898765095069c5daa7dce7f7ac96543e11f765451"],
  ["auto-use-dispatcher-and-tables", 0x004196e0, 0x0041a019, "bc055ca6f3b2a6be6ea04f4b08d6e6e817c197fdd90c730b045196cbff83b6ff"],
  ["control-record-writer", 0x004576c0, 0x004576f9, "ec5599a94d3add2e24c2ddaf431d9340f6e58028c478425c02e9a909a89b04ec"],
  ["control-record-initializer", 0x00457700, 0x004590ab, "0a5ab739311f3a5a9f34bc40130e4f920eca24c9a7d0338346858c2a898117c3"],
  ["action-slot-hit-test", 0x00459110, 0x004591d0, "429eb7383706ecf059aa238c04e1fb12af22c4f154f265d1dcd3906cea339566"],
  ["hud-input-and-rebuild", 0x00459490, 0x0045acfd, "f6d20a3bbc4426f27cd430a743eb24e75812a544a034f85b3551b7fadfbec202"],
  ["no-selection-toggle-producer", 0x0045b3a0, 0x0045b41a, "782d749759dac1060c16b04fb2bf7388530bfd02245b663f92be3f247931514e"],
  ["root-owner-reset", 0x00460ba0, 0x00460e21, "47f5f8e1743260ffdbc0f378f46510ec4126c2accc74cc41e2464dd77a5f3b32"],
  ["action-definition-writer", 0x004767a0, 0x004767d2, "54c30133efc5064982113731b24551cb0722544b7a860b84faf50de41df7c7a7"],
  ["action-definition-initializer", 0x00476820, 0x00477cb6, "560fffd80c7690646e58fa46a662eea0f18bacb329f5ad067287176c2dc5aad4"],
  ["gate-command-consumer", 0x00477f50, 0x00478247, "e6ddd9ed5fd10ea374e4d37b349234f6a1ee638978350e7fa82b1015f574a4ca"],
  ["player-record-reset", 0x0047df30, 0x0047e041, "9caa28a318ca161e0c859536ce6a4135e5b08f4fbc1e3668149f599d798c93db"],
  ["runtime-label-initializer", 0x0048ea90, 0x004924b3, "55b7a67bd8d391eda3cc97f4eeaa1117334917ad0e7b0da8b129d15d1a6be92a"],
].map(([id, start, endExclusive, digest]) => ({
  id,
  start,
  endExclusive,
  sha256: digest,
}));

const FUNCTION_CATALOG = [
  ["0x00416c70", ["0x00416c70-0x0041737e"], 1807, 555, "1aa33927309774ef7f107445f4678d1ffa5998447b7b76f2e7bd51d9f297ba57"],
  ["0x004196e0", ["0x004196e0-0x0041972b", "0x004197b0-0x00419800", "0x00419810-0x00419878", "0x00419880-0x004198e8", "0x004198f0-0x00419924", "0x00419930-0x00419a07", "0x00419a10-0x00419a7a", "0x00419a80-0x00419ae3", "0x00419af0-0x00419e85", "0x00419e90-0x0041a018"], 2154, 665, "7f47169185d935011244d7291327fb4c6e99c76c375fd40ccca284e04a6a192e"],
  ["0x004576c0", ["0x004576c0-0x004576f8"], 57, 15, "f6af7b1ff1aa0a6fb2fc921d23a6afc7ff79bc9b65c74412182c4bc87f56b315"],
  ["0x00457700", ["0x00457700-0x004590aa"], 6571, 1918, "237adb95491fabec00340debf993531625623c87c5fb487694f446575533ad1f"],
  ["0x00459110", ["0x00459110-0x004591cf"], 192, 63, "a40c568416d927cb4b36a9d6ab683c55a100edb05bb0fdc5256a7ed987dc5f1f"],
  ["0x00459490", ["0x00459490-0x0045acfc"], 6253, 1566, "dbbec91b48e85ad1a0a926613751bba4367fba7774ecf2550c02170948a25d8a"],
  ["0x0045b3a0", ["0x0045b3a0-0x0045b419"], 122, 40, "a3cc2ecbb2925866234102bbd1ff0584cf3c01694c926e1399168139d87e9ace"],
  ["0x00460ba0", ["0x00460ba0-0x00460e20"], 641, 144, "248c49519c1c692efde84ee3aac2159912097dca7ed46fe3f93ab7b7048b748e"],
  ["0x004767a0", ["0x004767a0-0x004767d1"], 50, 13, "cfce59d0fbe3479afc5b04d700cf3612176777c1ecd97c238e5023556080a34e"],
  ["0x00476820", ["0x00476820-0x00477cb5"], 5270, 1833, "734391831f41724301afe12e7b5949fdb5e35ec9b0790b04712f959136207a89"],
  ["0x00477f50", ["0x00477f50-0x00478246"], 759, 231, "9b2f23088fd45345e924f4f27848920e5a1cae8f227b582b192adb74f8407f12"],
  ["0x0047df30", ["0x0047df30-0x0047e040"], 273, 65, "89b196471e8036b3402fc7a8905cd573330831ac51d9dd6fdffe5a3e24c05a16"],
  ["0x0048ea90", ["0x0048ea90-0x004924b2"], 14883, 5587, "ddec5f281d2f822115ef10035fce8a8a2c7ca61c23b94cee6993082cb44089e2"],
].map(([entry, bodyRanges, bodySize, instructionCount, instructionSha256]) => ({
  entry,
  bodyRanges,
  bodySize,
  instructionCount,
  instructionSha256,
}));

const STATIC_EVIDENCE = [
  [0x00416f6c, "8b ce e8 6d 27 00 00 3b c5", "the general attack updater calls the automatic special-action dispatcher and compares its return with exact 1"],
  [0x004196e0, "33 c0 8a 41 37 83 c0 f5 83 f8 4e 77 3c", "the dispatcher reads entity internal-class BYTE +0x37 and bounds classes 11 through 89"],
  [0x004196ed, "33 d2 8a 90 54 97 41 00 ff 24 95 2c 97 41 00", "the dispatcher uses the recovered 79-byte selector and ten-entry target table"],
  [0x004197c2, "c1 e0 04 66 83 b8 cc e9 82 00 00 74 2f", "class 11 derives player stride and requires the player-scoped WORD gate to be nonzero"],
  [0x00419902, "c1 e0 04 66 83 b8 cc e9 82 00 00 75 03", "class 36 uses the same nonzero WORD gate without the random cadence step"],
  [0x00419b0d, "c1 e1 04 66 39 a9 cc e9 82 00 75 0a 5f 5e 5d 33 c0", "class 85 compares the same player-scoped WORD against zero held in EBP"],
  [0x00419ea5, "c1 e0 04 66 83 b8 cc e9 82 00 00 0f 84 5f 01 00 00", "class 89 uses the same player-scoped nonzero gate"],
  [0x004594a0, "e8 8b ff ff ff 66 a1 2a 66 7c 00 bb 01 00 00 00 66 3b c5 75 0f e8 e6 1e 00 00 e8 61 1f 00 00", "the HUD rebuild reaches both no-selection controls only when selectionCount raw WORD is zero"],
  [0x0045b3a0, "0f bf 0d 44 cc bc 00 6a 00 6a 01 8d 04 49 6a 00 c1 e0 04 2b c1 8d 04 40 8d 04 80 c1 e0 04", "the no-selection producer derives the current player's 0x2c10-byte record"],
  [0x0045b3be, "66 83 b8 cc e9 82 00 00 75 04 6a 21 eb 02 6a 22", "gate zero chooses control 0x21 and gate nonzero chooses control 0x22 in slot 0"],
  [0x004579f5, "6a 00 6a 00 6a 00 6a 1b 6a 3d b9 10 41 5e 00 e8 b7 fc ff ff", "control 0x21 maps to action 61 and frame/resource index 27"],
  [0x00457a13, "6a 00 6a 00 6a 00 6a 1a 6a 3e b9 20 41 5e 00 e8 99 fc ff ff", "control 0x22 maps to action 62 and frame/resource index 26"],
  [0x0048f5eb, "8d 9a f0 0d 00 00 c1 e9 02 f3 a5 8b c8 33 c0 83 e1 03 f3 a4 bf 38 84 4c 00 83 c9 ff f2 ae f7 d1 2b f9 8b c1 8b f7 8b fb", "the runtime label initializer fixes destination 0x00aa4e08, then selects source 0x004c8438 for the next copy"],
  [0x0048f613, "8d 9a 10 0e 00 00 c1 e9 02 f3 a5 8b c8 33 c0 83 e1 03 f3 a4 bf 28 84 4c 00 83 c9 ff f2 ae f7 d1 2b f9 8b c1 8b f7 8b fb", "the runtime label initializer fixes destination 0x00aa4e28, then selects source 0x004c8428 for the next copy"],
  [0x0049193e, "8d 9a 90 37 00 00 f3 a5 8b c8 33 c0 83 e1 03 f3 a4 bf 4c 76 4c 00 83 c9 ff f2 ae f7 d1 2b f9 8b c1 8b f7 8b fb", "the runtime text initializer fixes destination 0x00aa77a8, then selects the disable-description source 0x004c764c"],
  [0x00491963, "8d 9a d0 37 00 00 c1 e9 02 f3 a5 8b c8 33 c0 83 e1 03 f3 a4 bf 1c 76 4c 00 83 c9 ff f2 ae f7 d1 2b f9 8b c1 8b f7 8b fb", "the runtime text initializer fixes destination 0x00aa77e8, then selects the enable-description source 0x004c761c"],
  [0x004c8428, "c0 da b5 bf b8 b6 b9 fd c7 d8 c1 a6 00", "the CP949 source bytes decode exactly to 자동마법해제"],
  [0x004c8438, "c0 da b5 bf b8 b6 b9 fd bc b3 c1 a4 00", "the CP949 source bytes decode exactly to 자동마법설정"],
  [0x00476c67, "e8 34 fb ff ff 6a 00 6a 00 6a 04 6a 02 6a 00 6a 01 b9 e8 82 94 00", "action definitions 61 and 62 are adjacent initialized records with the same raw fields except their record address"],
  [0x00477fd4, "be ce e9 82 00 bb 40 6b 7c 00 89 74 24 10 33 ff c7 44 24 18 32 00 00 00", "the command consumer starts from the adjacent +0x254e gate pointer and reaches +0x254c as [ESI-2]"],
  [0x0047804b, "66 3d 3d 00 75 11 33 ff 66 c7 46 fe 01 00 66 89 7b fc", "action 61 writes exact WORD 1 to +0x254c and consumes the command"],
  [0x00478062, "66 3d 3e 00 75 0f 66 89 7e fe 33 ff 66 89 7b fc", "action 62 writes WORD zero to +0x254c and consumes the command"],
  [0x00478209, "8b 44 24 18 83 c3 68 48 89 44 24 18 0f 85 d1 fd ff ff 81 c6 10 2c 00 00", "the writer scans 50 command records and advances one 0x2c10-byte player record"],
  [0x00460bfb, "8d ae a8 65 06 00 57 8b cd e8 27 d3 01 00 47 81 c5 10 2c 00 00 83 ff 08 7c ec", "the root owner initializes exactly eight player records"],
  [0x0047df35, "b9 04 0b 00 00 33 c0 8b fe f3 ab", "player reset zeroes all 0x2c10 bytes, including the gate"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SET_SPECS = [
  ["magic auto-use gate complete direct references", "to", "0x0082e9cc", undefined, 12, "c04fcc37281a965043a26220e93723cf0dcb3a988488daf9f2bf71285a1cdea5"],
  ["FUN_004196e0 callers", "to", "0x004196e0", "UNCONDITIONAL_CALL", 1, "22c19e337849d706b3c4c69307fda5359895b7912caf4c4946952d5e705256bc"],
  ["FUN_004196e0 outgoing calls", "fromFunctionEntry", "0x004196e0", "UNCONDITIONAL_CALL", 27, "d13736d5c1c820a7737d38fc9a2717b4e3a753c88da78699b1b53bb8fcd9fdae"],
  ["FUN_0045b3a0 callers", "to", "0x0045b3a0", "UNCONDITIONAL_CALL", 1, "cf5ed9d1cdc370fd7fe4b2098aaea61d08edcb924a1fd293c91ca2066c16708a"],
  ["FUN_00477f50 callers", "to", "0x00477f50", "UNCONDITIONAL_CALL", 1, "49a162f57cc0900f1139c22584b925f5619b77925ff52bf93b858e1607066232"],
  ["FUN_0047df30 callers", "to", "0x0047df30", "UNCONDITIONAL_CALL", 1, "8641aa5405554936b103584f987953b10bd0f58acf5af9c8e6ee595ef323ded3"],
].map(([label, key, value, type, count, digest]) => ({
  label,
  key,
  value,
  type,
  count,
  digest,
}));

const AFFECTED_CLASS_IDS = new Set(CASES.map(({ internalClass }) => internalClass));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractMagicAutoUseGate({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    functionsPath: args.functions ?? DEFAULT_FUNCTIONS_PATH,
    referencesPath: args.references ?? DEFAULT_REFERENCES_PATH,
    jumpTablesPath: args.jumpTables ?? DEFAULT_JUMP_TABLES_PATH,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : summarize(report));
}

export function extractMagicAutoUseGate({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sourceBytes = {
    seeds: readFileSync(seedsPath),
    functions: readFileSync(functionsPath),
    references: readFileSync(referencesPath),
    jumpTables: readFileSync(jumpTablesPath),
  };
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  assertEqual(sha256(sourceBytes.seeds), EXPECTED_SEEDS_SHA256, `${seedsPath} SHA-256`);
  assertEqual(sha256(sourceBytes.functions), EXPECTED_FUNCTIONS_SHA256, `${functionsPath} SHA-256`);
  assertEqual(sha256(sourceBytes.references), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  assertEqual(sha256(sourceBytes.jumpTables), EXPECTED_JUMP_TABLES_SHA256, `${jumpTablesPath} SHA-256`);

  const seeds = parseJsonBytes(sourceBytes.seeds, seedsPath);
  const functions = parseJsonBytes(sourceBytes.functions, functionsPath);
  const references = parseJsonBytes(sourceBytes.references, referencesPath);
  const jumpTables = parseJsonBytes(sourceBytes.jumpTables, jumpTablesPath);
  for (const [label, document] of Object.entries({ seeds, functions, references, jumpTables })) {
    assertEqual(document.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${label} source SHA-256`);
  }

  const typeCatalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const gateActionDefinitions = extractActionDefinitions(buffer, image, references)
    .filter(({ actionId }) => actionId === 61 || actionId === 62);
  assertEqual(gateActionDefinitions.length, 2, "magic auto-use action definition count");
  const namesByClass = new Map(
    typeCatalog.types.map(({ internalClass, originalGameplayName }) => [
      internalClass,
      originalGameplayName,
    ]),
  );
  const affectedEntities = CASES.map((entry) => {
    const originalGameplayName = namesByClass.get(entry.internalClass);
    if (typeof originalGameplayName !== "string" || originalGameplayName.length === 0) {
      throw new Error(`Affected internal class ${entry.internalClass} has no original catalog name`);
    }
    return { ...entry, originalGameplayName };
  });
  const jumpTable = verifyJumpTable(jumpTables);
  const controlTexts = [
    verifyCp949ControlText(buffer, image, {
      sourceAddress: 0x004c8438,
      runtimeAddress: 0x00aa4e08,
      label: "자동마법설정",
      descriptionSourceAddress: 0x004c761c,
      descriptionRuntimeAddress: 0x00aa77e8,
      description: "캐릭터 스스로 마법을 사용하도록 설정 합니다.",
      controlIdentifier: 0x21,
    }),
    verifyCp949ControlText(buffer, image, {
      sourceAddress: 0x004c8428,
      runtimeAddress: 0x00aa4e28,
      label: "자동마법해제",
      descriptionSourceAddress: 0x004c764c,
      descriptionRuntimeAddress: 0x00aa77a8,
      description: "캐릭터 스스로 마법을 사용하지 못하게 설정 합니다.",
      controlIdentifier: 0x22,
    }),
  ];

  return {
    schemaVersion: 1,
    question: QUESTION,
    analysisStatus: "static-confirmed-player-global-magic-auto-use-toggle",
    reproductionStatus:
      "partial-reproduction-complete-for-control-writer-reset-and-consumer-case-admission",
    implementationStatus: "analysis-only-no-product-change",
    source: {
      executablePath,
      executableSha256: EXPECTED_EXECUTABLE_SHA256,
      seedsPath,
      seedsSha256: EXPECTED_SEEDS_SHA256,
      functionsPath,
      functionsSha256: EXPECTED_FUNCTIONS_SHA256,
      referencesPath,
      referencesSha256: EXPECTED_REFERENCES_SHA256,
      jumpTablesPath,
      jumpTablesSha256: EXPECTED_JUMP_TABLES_SHA256,
    },
    gate: {
      playerRecordBase: toHex(PLAYER_RECORD_BASE),
      playerRecordStride: PLAYER_RECORD_STRIDE,
      playerCount: PLAYER_COUNT,
      fieldOffset: toHex(MAGIC_AUTO_USE_OFFSET),
      playerZeroAddress: toHex(MAGIC_AUTO_USE_PLAYER_ZERO),
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
        texts: controlTexts,
      },
    },
    actionDefinitions: gateActionDefinitions,
    consumer: {
      function: toHex(AUTO_USE_DISPATCHER),
      soleCaller: { callSite: "0x00416f6e", function: "0x00416c70" },
      entityClassField: "BYTE +0x37",
      playerIndexField: "signed BYTE +0x38, bounded to runtime players 0..7 in reproduction",
      selectorDomain: "classes 11..89; every nonlisted selector returns 0 before gate read",
      affectedClassCount: affectedEntities.length,
      affectedEntities,
      jumpTable,
      deeperBoundary:
        "The complete dispatcher body and all 27 direct outgoing calls are statically fixed. Reproduction stops after class selection and nonzero-gate admission; random cadence, target validation, world scans, helper returns, and delivery side effects remain static-only.",
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) =>
      verifyRawCodeRange(buffer, image, range)),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) =>
      verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SET_SPECS.map((spec) =>
      verifyReferenceSet(references, spec)),
    completenessBoundary:
      "Static closure covers the player-scoped WORD gate at +0x254c, its 12-entry complete structured direct-reference set, reset, actions 61/62 writes, no-selection slot-0 control choice and exact CP949 labels 자동마법설정/자동마법해제, the sole FUN_004196e0 caller, the full dispatcher body, its complete 27-call outgoing set, the exact switch table, and the exact nine affected internal classes with original catalog names. Bounded reproduction covers no-selection control visibility/hit, command writes, reset value, and unsupported/disabled/admitted consumer case selection. Cadence and deeper per-class side effects are static-only, so overall reproduction is partial.",
    semanticConclusion:
      "Confirmed: controls 0x21/0x22 and actions 61/62 are the player-global magic auto-use enable/disable UX remembered by the user. The zero-selection slot writes a per-player WORD; nonzero enables an automatic special-action dispatcher called from the general attack updater for exactly nine internal classes with original catalog names, while every other internal class returns before reading the gate. This narrow original compatibility slice is independent of the hero-production-priority gate.",
    unresolvedBoundary:
      "Original resource filenames and pixels behind frame/resource indices 26/27, the generic pointer-release command transport, alias/save-load writers beyond the complete structured direct-reference set and full record reset, and the per-class cadence/target/delivery helpers' complete world side effects remain unresolved or static-only. Production-button right-click persistent HUD reservation/pinning remains a separate unresolved lead. No original raw gate enters a project public contract.",
  };
}

export function reproduceMagicAutoUseControlSurface(input) {
  assertRecord(input, "input");
  const selectionCount = assertInteger(input.selectionCount, 0, 0xffff, "selectionCount");
  const result = {
    control: null,
    operations: [{ type: "clear-nine-action-slots" }],
  };
  if (selectionCount !== 0) {
    return result;
  }
  const currentPlayerIndex = assertInteger(
    input.currentPlayerIndex,
    0,
    PLAYER_COUNT - 1,
    "currentPlayerIndex",
  );
  const gateWord = assertInteger(input.gateWord, 0, 0xffff, "gateWord");
  const control = gateWord === 0
    ? {
        slotIndex: 0,
        controlIdentifier: 0x21,
        actionWord: 61,
        frameOrResourceIndex: 0x1b,
      }
    : {
        slotIndex: 0,
        controlIdentifier: 0x22,
        actionWord: 62,
        frameOrResourceIndex: 0x1a,
      };
  result.operations.push({ type: "add-no-selection-control", ...control });
  result.control = {
    ...control,
    playerIndex: currentPlayerIndex,
    rect: null,
    hit: null,
  };
  if (input.layout === undefined) {
    return result;
  }
  const layout = validateSyntheticLayout(input.layout);
  const rect = {
    x: layout.originX,
    y: layout.originY,
    width: layout.cellWidth,
    height: layout.cellHeight,
  };
  let hit = null;
  if (input.pointer !== undefined) {
    assertRecord(input.pointer, "pointer");
    const x = assertInteger(input.pointer.x, -0x80000000, 0x7fffffff, "pointer.x");
    const y = assertInteger(input.pointer.y, -0x80000000, 0x7fffffff, "pointer.y");
    hit =
      x > rect.x
      && x < rect.x + rect.width
      && y > rect.y
      && y < rect.y + rect.height;
  }
  result.control = { ...result.control, rect, hit };
  return result;
}

export function reproduceMagicAutoUseGateCommand(input) {
  assertRecord(input, "input");
  const initialGateWord = assertInteger(
    input.initialGateWord,
    0,
    0xffff,
    "initialGateWord",
  );
  const commandReached = assertBoolean(input.commandReached, "commandReached");
  const result = {
    finalGateWord: initialGateWord,
    commandConsumed: false,
    operations: [],
  };
  if (!commandReached) {
    return result;
  }
  const actionWord = assertInteger(input.actionWord, 0, 0xffff, "actionWord");
  if (actionWord !== 61 && actionWord !== 62) {
    throw new RangeError(
      `actionWord ${actionWord} is outside the bounded magic auto-use writer actions 61/62`,
    );
  }
  result.finalGateWord = actionWord === 61 ? 1 : 0;
  result.commandConsumed = true;
  result.operations.push({
    type: actionWord === 61
      ? "enable-player-magic-auto-use-gate"
      : "disable-player-magic-auto-use-gate",
    actionWord,
    writtenWord: result.finalGateWord,
  });
  return result;
}

export function reproduceMagicAutoUseConsumerAdmission(input) {
  assertRecord(input, "input");
  const internalClass = assertInteger(
    input.internalClass,
    0,
    0xff,
    "internalClass BYTE",
  );
  const matched = CASES.find((entry) => entry.internalClass === internalClass);
  const result = {
    internalClass,
    matchedCaseEntry: matched?.caseEntry ?? null,
    gateEnabled: false,
    admittedToClassBehavior: false,
    operations: [],
  };
  if (!matched) {
    result.operations.push({ type: "return-zero-before-player-gate-read" });
    return result;
  }
  const playerIndex = assertInteger(
    input.playerIndex,
    0,
    PLAYER_COUNT - 1,
    "playerIndex",
  );
  const gateWord = assertInteger(input.gateWord, 0, 0xffff, "gateWord");
  result.operations.push({
    type: "read-player-magic-auto-use-word",
    playerIndex,
    fieldOffset: toHex(MAGIC_AUTO_USE_OFFSET),
    value: gateWord,
  });
  if (gateWord === 0) {
    result.operations.push({ type: "return-zero-gate-disabled" });
    return result;
  }
  result.gateEnabled = true;
  result.admittedToClassBehavior = true;
  result.operations.push({
    type: "enter-static-only-class-behavior",
    internalClass,
    caseEntry: matched.caseEntry,
  });
  return result;
}

function verifyJumpTable(jumpTables) {
  const actual = jumpTables.tables?.find(
    ({ functionEntry, switchAddress }) =>
      functionEntry === "0x004196e0" && switchAddress === "0x004196f5",
  );
  if (!actual) {
    throw new Error("jump-tables.json missing FUN_004196e0 switch 0x004196f5");
  }
  assertEqual(actual.cases?.length, 79, "FUN_004196e0 jump-table case count");
  const selected = actual.cases
    .filter(({ destination }) => destination !== "0x00419729")
    .map(({ label, destination }) => ({ label, destination }));
  assertEqual(
    JSON.stringify(selected),
    JSON.stringify([
      { label: 11, destination: "0x004196fc" },
      { label: 16, destination: "0x00419701" },
      { label: 20, destination: "0x0041970b" },
      { label: 36, destination: "0x00419706" },
      { label: 78, destination: "0x00419710" },
      { label: 79, destination: "0x00419715" },
      { label: 80, destination: "0x0041971a" },
      { label: 85, destination: "0x0041971f" },
      { label: 89, destination: "0x00419724" },
    ]),
    "FUN_004196e0 nondefault jump-table cases",
  );
  const projection = actual.cases.map(({ label, destination }) => ({
    label,
    destination,
  }));
  return {
    functionEntry: actual.functionEntry,
    switchAddress: actual.switchAddress,
    caseCount: projection.length,
    nondefaultCases: selected,
    digest: createHash("sha256")
      .update(JSON.stringify(projection))
      .digest("hex"),
  };
}

function verifyCp949ControlText(buffer, image, expected) {
  const label = readCStringAtVa(buffer, image, expected.sourceAddress, "euc-kr");
  const description = readCStringAtVa(
    buffer,
    image,
    expected.descriptionSourceAddress,
    "euc-kr",
  );
  assertEqual(label, expected.label, `${toHex(expected.sourceAddress)} CP949 label`);
  assertEqual(
    description,
    expected.description,
    `${toHex(expected.descriptionSourceAddress)} CP949 description`,
  );
  return {
    controlIdentifier: expected.controlIdentifier,
    label: {
      sourceAddress: toHex(expected.sourceAddress),
      runtimeAddress: toHex(expected.runtimeAddress),
      value: label,
    },
    description: {
      sourceAddress: toHex(expected.descriptionSourceAddress),
      runtimeAddress: toHex(expected.descriptionRuntimeAddress),
      value: description,
    },
  };
}

function verifyFunctionCatalog(functions) {
  return FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions?.find(({ entry }) => entry === expected.entry);
    if (!actual) {
      throw new Error(`functions.json missing ${expected.entry}`);
    }
    assertEqual(
      JSON.stringify(actual.bodyRanges),
      JSON.stringify(expected.bodyRanges),
      `${expected.entry} body ranges`,
    );
    assertEqual(actual.bodySize, expected.bodySize, `${expected.entry} body size`);
    assertEqual(
      actual.instructionCount,
      expected.instructionCount,
      `${expected.entry} instruction count`,
    );
    assertEqual(
      actual.instructionSha256,
      expected.instructionSha256,
      `${expected.entry} instruction SHA-256`,
    );
    return expected;
  });
}

function verifyReferenceSet(references, spec) {
  const projected = (references.references ?? [])
    .filter(
      (reference) =>
        reference[spec.key] === spec.value
        && (spec.type === undefined || reference.type === spec.type),
    )
    .map(({ from, to, type, fromFunctionEntry }) => ({
      from,
      to,
      type,
      fromFunctionEntry,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const digest = createHash("sha256").update(JSON.stringify(projected)).digest("hex");
  assertEqual(projected.length, spec.count, `${spec.label} count`);
  assertEqual(digest, spec.digest, `${spec.label} SHA-256`);
  return {
    label: spec.label,
    key: spec.key,
    value: spec.value,
    count: projected.length,
    digest,
    references: projected,
  };
}

function validateSyntheticLayout(value) {
  assertRecord(value, "layout");
  return {
    cellWidth: assertInteger(value.cellWidth, 1, 0x7fff, "layout.cellWidth"),
    cellHeight: assertInteger(value.cellHeight, 1, 0x7fff, "layout.cellHeight"),
    originX: assertInteger(value.originX, -0x8000, 0x7fff, "layout.originX"),
    originY: assertInteger(value.originY, -0x8000, 0x7fff, "layout.originY"),
  };
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean`);
  }
  return value;
}

function assertInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer in ${minimum}..${maximum}; got ${value}`);
  }
  return value;
}

function parseJsonBytes(bytes, path) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

function readCStringAtVa(buffer, image, va, encoding) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new RangeError(`${toHex(va)} is outside the executable image`);
  }
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }
  if (end === buffer.length) {
    throw new Error(`${toHex(va)} string is not NUL-terminated`);
  }
  const bytes = buffer.subarray(offset, end);
  return encoding === "euc-kr"
    ? new TextDecoder(encoding, { fatal: true }).decode(bytes)
    : bytes.toString(encoding);
}

function parseArgs(argv) {
  const result = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      result.json = true;
      continue;
    }
    const key = {
      "--input": "input",
      "--seeds": "seeds",
      "--functions": "functions",
      "--references": "references",
      "--jump-tables": "jumpTables",
    }[argument];
    if (!key) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${argument} requires a path`);
    }
    result[key] = value;
    index += 1;
  }
  return result;
}

function summarize(report) {
  return [
    report.question,
    `analysis=${report.analysisStatus}`,
    `reproduction=${report.reproductionStatus}`,
    `gate=${report.gate.playerZeroAddress} ${report.gate.consumerComparison}`,
    `affectedClasses=${report.consumer.affectedEntities.map(({ internalClass }) => internalClass).join(",")}`,
  ].join("\n");
}

export function isMagicAutoUseAffectedClass(internalClass) {
  return AFFECTED_CLASS_IDS.has(internalClass);
}
