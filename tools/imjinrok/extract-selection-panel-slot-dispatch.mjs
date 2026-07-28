#!/usr/bin/env node
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const SLOT_RECTS = [
  { left: 26, top: 49, right: 156, bottom: 169 },
  { left: 490, top: 49, right: 620, bottom: 169 },
  { left: 26, top: 210, right: 156, bottom: 330 },
  { left: 490, top: 210, right: 620, bottom: 330 },
];
const BASE_RECT = { left: 188, top: 100, right: 466, bottom: 280 };
const FIELD_0X568_RECT = {
  left: 188,
  top: 290,
  right: 466,
  bottom: 376,
};
const FIELD_0X564_RECT = {
  left: 188,
  top: 65,
  right: 466,
  bottom: 95,
};

const RAW_CODE_RANGES = [
  ["surface-initializer", 0x0043fcd0, 0x0043ffbe, "f512273a51382a063adcb4f8fdfa0a45b0ea294115cc84133d963a56be4b7023"],
  ["surface-teardown", 0x0043ffc0, 0x0044008f, "afe74089af8b08b1075ecd5e66df5c2072e9bc79e56de010f6178252dfc39283"],
  ["main-owner-caller", 0x004475a0, 0x00447bb9, "81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c"],
  ["alternate-owner-caller", 0x0047f300, 0x0047f431, "bc2645a3a95bd67c2cc5e5e0e1ac178704d76485fab2c63527753ed3ea44e715"],
  ["visibility-gate", 0x004a7de0, 0x004a7e2d, "e93088fd1bc116ab5267ebe8107848359bc425b5a57246ff7ec045b5cdac7702"],
  ["progress-renderer", 0x004a7880, 0x004a79c5, "3c4b11e74c8c35d2b39bd6dbb3ed64668385e70c9d6791edfe74b37a8e514c70"],
  ["slot-owner-update", 0x004a8030, 0x004a812a, "a61dae0e8a6916bf6ac02da5198d96edc728d39187c0f20b41c83a4fc533e42f"],
  ["label-renderer", 0x004a81f0, 0x004a83f4, "bff626a9f16d345a3be965c6678e2a3805e53c89794774da181e84fb048f04f1"],
  ["slot-rectangle", 0x004a8410, 0x004a846f, "c7f7fbb967b4bb23893c1b0842d36f8335c137dcd713cefd9578a475d774da1d"],
  ["base-rectangle", 0x004a8480, 0x004a84a2, "5e38a4aa22198bbf775b7b53626b2381662defa05ca2f801fc9301bfd681ef66"],
  ["slot-dispatcher", 0x004a84e0, 0x004a8607, "99b27288bd3e851b53f9ab153ce68af73de34675c263f2f8df5fc3883f1bd09e"],
].map(([id, start, endExclusive, sha256Digest]) => ({
  id,
  start,
  endExclusive,
  sha256: sha256Digest,
}));

const FUNCTION_CATALOG = [
  ["0x0043fcd0", "0x0043fcd0-0x0043ffbd", 750, 208, "6f67f729672432fbf7def4cfe5b977be484bbf1e1b7121b254dd4969f49d5362"],
  ["0x0043ffc0", "0x0043ffc0-0x0044008e", 207, 76, "2b07eea4a0aebf3f358b5fa94689ae4288159a671466707e62a9aef84e279311"],
  ["0x004475a0", "0x004475a0-0x00447bb8", 1561, 418, "fab8bfe9d6a10a75b13e22823ab820abe6deecaa08ed3ae460ca2b9fd87e3cff"],
  ["0x0047f300", "0x0047f300-0x0047f430", 305, 87, "64f2e3f70c9cc874af3d3fa8715b02ae1c9434e3fd957ff8801c32f93728d3a5"],
  ["0x004a7880", "0x004a7880-0x004a79c4", 325, 110, "ec132462c818047b9119bb5b9a6042f3942c4b5e9dc7844d795e28f6f9853d8a"],
  ["0x004a7de0", "0x004a7de0-0x004a7e2c", 77, 24, "1fefb64edf8dac4350af0d19553d1907301f073697d866d36d07aebaa705587f"],
  ["0x004a8030", "0x004a8030-0x004a8129", 250, 78, "105ebdbc36f5e73e733007b24e9403bc8960990949026cf30ae53bcad1a3e3ae"],
  ["0x004a81f0", "0x004a81f0-0x004a83f3", 516, 175, "05ba92e05deaa1a9a2d4804ab33126996826c5c7651f15dc8cfe3a50f94499d6"],
  ["0x004a8410", "0x004a8410-0x004a846e", 95, 22, "d25957bb5f9f1825aca71c2acffdcaa7f8923763bdb9e28fa0d1936973beaf7e"],
  ["0x004a8480", "0x004a8480-0x004a84a1", 34, 6, "a14956aafc6409392b4288bd5d19b1b6a2bed8ea438f736f15aa3317db85b424"],
  ["0x004a84e0", "0x004a84e0-0x004a8606", 295, 103, "aee7b66ad3c47ac38ad8690c14dc4a147ac4a764f47ef8a4831c4966a2f37d2d"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({
  entry,
  bodyRange,
  bodySize,
  instructionCount,
  instructionSha256,
}));

const STATIC_EVIDENCE = [
  [
    0x0043fd80,
    "a1 20 94 55 00 8b 0d 1c 94 55 00 6a 00 6a 01 50 51 68 7c 92 54 00 b9 18 94 55 00 e8 f0 ab 00 00 85 c0 75 17 68 f4 b9 4b 00 68 ec b9 4b 00 68 18 94 55 00 e8 88 b2 00 00 83 c4 0c",
    "the screen-sized DAT_0054927c source surface allocation reports failure and continues",
  ],
  [
    0x0043fe3e,
    "56 57 be 88 95 54 00 bf 04 00 00 00 6a 00 6a 01 6a 78 68 82 00 00 00 56 b9 18 94 55 00 e8 30 ab 00 00 85 c0 75 17 68 d8 b9 4b 00 68 ec b9 4b 00 68 18 94 55 00 e8 c8 b1 00 00 83 c4 0c 83 c6 04 4f 75 c9",
    "four consecutive DAT_00549588 slot surfaces are allocated at 130 by 120 and each failure is reported before continuing",
  ],
  [
    0x00440002,
    "a1 7c 92 54 00 3b c7 74 0c 8b 10 50 ff 52 08 89 3d 7c 92 54 00 53 56 be 88 95 54 00 bb 04 00 00 00 8b 06 3b c7 74 08 8b 08 50 ff 51 08 89 3e 83 c6 04 4b 75 ec",
    "teardown null-checks, releases, and clears DAT_0054927c and all four slot surfaces",
  ],
  [
    0x00447b00,
    "b9 80 36 5e 00 e8 d6 02 06 00 3b c3 75 10 a1 80 95 54 00 b9 80 36 5e 00 50 e8 c2 09 06 00",
    "the main owner caller invokes the dispatcher with destination DAT_00549580 only when FUN_004a7de0 returns one",
  ],
  [
    0x0047f37a,
    "b9 80 36 5e 00 e8 5c 8a 02 00 83 f8 01 75 10 a1 38 a9 55 00 b9 80 36 5e 00 50 e8 47 91 02 00",
    "the alternate owner caller applies the same gate and passes destination DAT_0055a938",
  ],
  [
    0x004a7de0,
    "56 33 c0 8d 91 e8 00 00 00 be 04 00 00 00 83 3a 01 75 05 b8 01 00 00 00 83 c2 04 4e 75 f0 8b 91 f8 00 00 00 85 d2 5e 74 05 b8 01 00 00 00 8b 91 68 05 00 00 85 d2 74 05 b8 01 00 00 00 8b 91 64 05 00 00 85 d2 74 05 b8 01 00 00 00 c3",
    "the caller gate returns one for any exact-one slot active DWORD or any nonzero field_0xf8, field_0x568, or field_0x564",
  ],
  [
    0x004a7880,
    "8b 44 24 08 83 ec 18 85 c0 53 55 56 57 8b f1 75 17 68 24 92 4c 00 68 b0 ab 4b 00 68 18 94 55 00 e8 9b 37 fa ff 83 c4 0c",
    "the progress renderer reports a null destination but continues toward later dereference",
  ],
  [
    0x004a78c9,
    "66 8b 84 7e 3c 01 00 00 66 3d 64 00 7d 0d 83 c0 05 66 89 84 7e 3c 01 00 00 eb 0b c7 84 be c8 00 00 00 00 00 00 00",
    "signed progress below 100 advances by five; progress at least 100 clears the slot kind DWORD",
  ],
  [
    0x004a78ef,
    "8d 57 10 b8 1f 85 eb 51 c1 e2 04 8b 1b 6a 00 8b 2c 32 68 00 80 00 01 0f bf b4 7e 3c 01 00 00 8b ce 6a 00 c1 e1 06 03 ce 8d 34 76 d1 e1 f7 e9 c1 fa 05 8b c2 8d 0c b6 c1 e8 1f 03 d0 b8 1f 85 eb 51 c1 e1 03 89 54 24 38 f7 e9",
    "the progress renderer derives signed truncated 130-percent and 120-percent rectangle dimensions from the updated WORD",
  ],
  [
    0x004a7939,
    "8b 74 24 20 c1 fa 05 8b 86 04 01 00 00 8b ca c1 e9 1f 03 d1 03 c3 89 54 24 1c 99 2b c2 8b 54 24 38 8b c8 8d 04 1a 2b c3 99 2b c2 d1 f9 d1 f8 2b c8 8b 86 08 01 00 00 03 c5 89 4c 24 24 99 2b c2 8b f0 8b 44 24 1c 03 c5 2b c5 99 2b c2 8b 54 24 38 d1 fe d1 f8 2b f0 8b 44 24 1c 03 d1 03 c6 89 54 24 2c 8b 14 bd 88 95 54 00 89 44 24 30 8b 44 24 3c 52 8d 54 24 28 8b 08 52 50 89 74 24 34 ff 51 14 5f 5e 5d 5b 83 c4 18 c2 08 00",
    "the progress rectangle is centered in the fixed slot and passed with its indexed slot surface to destination vtable plus 0x14",
  ],
  [
    0x004a81f0,
    "8b 44 24 08 83 ec 1c 8d 54 24 00 55 8b e9 8b 08 52 50 ff 51 44 85 c0 0f 85 e0 01 00 00",
    "label HDC acquisition failure returns before font selection, table lookup, measurement, text output, or release",
  ],
  [
    0x004a823f,
    "8b 74 24 30 8d 44 24 14 0f bf de 50 33 c0 0f bf 4c 5d 10 8b 14 8d 44 3e c8 00 83 c9 ff 8b fa f2 ae f7 d1 49 51 8b 4c 24 18 52 51 ff 15 58 70 4b 00 8d 54 24 1c 8b cd 52 56 e8 93 01 00 00",
    "the label renderer sign-extends the slot and its WORD record index, measures the selected byte string, and asks FUN_004a8410 for the slot rectangle",
  ],
  [
    0x004a827d,
    "8b 7c 24 14 83 fb 03 77 4b ff 24 9d f4 83 4a 00 8b c7 b9 41 00 00 00 99 2b c2 d1 f8 2b c8 8b 44 24 1c 03 c1 89 44 24 1c 8b 44 24 28 89 44 24 20 eb 26 8b c7 99 2b c2 ba 41 00 00 00 d1 f8 2b d0 8b 44 24 1c 03 c2 89 44 24 1c 8b 44 24 28 89 44 24 20 eb 04 8b 44 24 20 8b 4c 24 1c 85 c9 7d 06 33 c9 89 4c 24 1c 85 c0 7d 06 33 c0 89 44 24 20",
    "slots zero through three share horizontal centering by measured width and place text at the slot bottom before nonnegative clamping",
  ],
  [
    0x004a82ed,
    "8b d3 c7 84 dd a8 00 00 00 01 00 00 00 c1 e2 05 8d 34 2a 8d 51 01 03 cf 89 56 28 8d 50 01 89 56 2c 8b 54 24 18 03 d0 89 4e 30 89 56 34 a1 1c 94 55 00 3b c8 7e 09 2b c7 0f bf c0 89 44 24 1c a1 20 94 55 00 3b d0 7e 0b 2b 44 24 18 0f bf c8 89 4c 24 20",
    "the clamped pre-overflow x and y create stored shadow bounds first; only then right or bottom overflow rewrites local x or y from signed low-WORD screen differences",
  ],
  [
    0x004a8340,
    "0f bf 54 5d 10 83 c9 ff 33 c0 8b 14 95 44 3e c8 00 8b fa f2 ae 8b 46 2c f7 d1 49 51 8b 4e 28 52 8b 54 24 18 50 51 52 ff 15 50 70 4b 00 8b 44 24 10 68 fa fa fa 00 50 ff 15 48 70 4b 00 8b 44 24 1c 8b 54 24 14 8b 4c 24 20 c7 84 dd ac 00 00 00 01 00 00 00 89 46 38 03 c2 8d 53 02 89 4e 3c c1 e2 05 89 04 2a 8b 44 24 18 03 c1 89 46 44 33 c0 0f bf 4c 5d 10 8b 14 8d 44 3e c8 00 83 c9 ff 8b fa f2 ae 8b 46 38 f7 d1 49 51 8b 4c 24 14 52 8b 56 3c 52 50 51 ff 15 50 70 4b 00 8b 44 24 34 8b 4c 24 10 51 50 8b 10 ff 52 68 5f 5e 5b 5d 83 c4 1c c2 08 00",
    "the first TextOutA uses pre-overflow stored shadow coordinates while the second uses post-overflow local main coordinates before HDC release; GDI return values are ignored",
  ],
  [
    0x004a8410,
    "0f bf 4c 24 04 8b 44 24 08 83 f9 03 77 3a ff 24 8d 70 84 4a 00 c7 00 1a 00 00 00 c7 40 04 31 00 00 00 eb 24 c7 00 ea 01 00 00 c7 40 04 31 00 00 00 eb 15 c7 00 1a 00 00 00 eb 06 c7 00 ea 01 00 00 c7 40 04 d2 00 00 00 8b 08 8b 50 04 81 c1 82 00 00 00 83 c2 78 89 48 08 89 50 0c c2 08 00",
    "signed slots zero through three select four 130 by 120 rectangles; out-of-range slots leave origin words supplied by the caller before adding right and bottom",
  ],
  [
    0x004a8480,
    "8b 44 24 04 c7 00 bc 00 00 00 c7 40 04 64 00 00 00 c7 40 08 d2 01 00 00 c7 40 0c 18 01 00 00 c2 04 00",
    "FUN_004a8480 only initializes the fixed rectangle 188,100,466,280 and performs no clear operation",
  ],
  [
    0x004a84e0,
    "83 ec 10 53 55 56 8d 44 24 0c 57 8b f9 50 e8 8d ff ff ff a1 7c 92 54 00 8b 74 24 24 8d 54 24 10 6a 11 8b 0e 52 8b 54 24 1c 50 8b 44 24 1c 52 50 56 ff 51 1c",
    "the dispatcher always draws the fixed DAT_0054927c base rectangle through destination vtable plus 0x1c once invoked",
  ],
  [
    0x004a8514,
    "8d 87 c8 00 00 00 33 db bd 88 95 54 00 89 44 24 24 83 78 20 01 75 3e 83 38 01 75 0b 56 53 8b cf e8 47 f3 ff ff eb 2e 8d 4c 24 10 51 53 8b cf e8 c8 fe ff ff 8b 45 00 8b 4c 24 14 8b 16 6a 11 6a 00 50 8b 44 24 1c 51 50 56 ff 52 1c 56 53 8b cf e8 87 fc ff ff 8b 44 24 24 83 c5 04 43 83 c0 04 81 fd 98 95 54 00 89 44 24 24 7c a5",
    "four slots are visited in order; active must equal one, kind one calls progress, and every other kind draws the slot surface then calls the label renderer",
  ],
  [
    0x004a8580,
    "8b 87 68 05 00 00 bd bc 00 00 00 83 f8 01 bb d2 01 00 00 75 31 a1 7c 92 54 00 8b 0e 8d 54 24 10 6a 11 52 50 68 22 01 00 00 55 56 89 6c 24 28 c7 44 24 2c 22 01 00 00 89 5c 24 30 c7 44 24 34 78 01 00 00 ff 51 1c 83 bf 64 05 00 00 01 75 2e a1 7c 92 54 00 8b 0e 8d 54 24 10 6a 11 52 50 6a 41 55 56 89 6c 24 28 c7 44 24 2c 41 00 00 00 89 5c 24 30 c7 44 24 34 5f 00 00 00 ff 51 1c 5f 5e 5d 5b 83 c4 10 c2 04 00",
    "field_0x568 and field_0x564 draw their fixed rectangles only when exactly one, in that order",
  ],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SETS = [
  ["FUN_004a84e0 callers", "to", "0x004a84e0", 2, "e9a86971370d64aff3ec02577108bd638b3830ff6f516e16d12d9fbba7782cda"],
  ["FUN_004a7880 callers", "to", "0x004a7880", 1, "d026d93de8f847a6c67d5eb840a69283878ccb5c52a72408ffedfd43a966a005"],
  ["FUN_004a81f0 callers", "to", "0x004a81f0", 2, "df622e0c4baf09f29800d28bbda59c49c3308d656f083b77c7e691a6941107d2"],
  ["FUN_004a8410 callers", "to", "0x004a8410", 4, "db1e967922d1a9ca1b87012da4e0bd5b3ab77252af0d2e500e2aa2c696cb0119"],
  ["FUN_004a8480 callers", "to", "0x004a8480", 1, "4d943acf7fb497cf7d9b2509746ddd15ea45e7c55d389379abdc3af5ae548a28"],
  ["FUN_0043fcd0 callers", "to", "0x0043fcd0", 1, "885bbf7f73ab841d26539d5fdd74639a005ef63b940e68efc53929eb7a29ce8b"],
  ["FUN_0043ffc0 callers", "to", "0x0043ffc0", 1, "841aa55cc755ebddd8170eab7b05b89da5f8e6bb9eb75d07b6731eb985d0bc7d"],
  ["FUN_004a84e0 outgoing references", "fromFunctionEntry", "0x004a84e0", 16, "abcc36278d6b346b6a8386bd8a26b7d773918ca412f171e39f1f05e3a72e0992"],
].map(([label, field, value, count, digest]) => ({
  label,
  field,
  value,
  count,
  digest,
}));

export function extractSelectionPanelSlotDispatch({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(
    executableSha256,
    EXPECTED_EXECUTABLE_SHA256,
    `${executablePath} SHA-256`,
  );
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  assertEqual(
    functions.sourceSha256,
    executableSha256,
    `${functionsPath} sourceSha256`,
  );
  assertEqual(
    references.sourceSha256,
    executableSha256,
    `${referencesPath} sourceSha256`,
  );

  return {
    question:
      "원본 선택 패널 슬롯 dispatcher FUN_004a84e0 전체가 어떤 입력·전역·slot 상태를 읽고 어떤 분기·좌표·slot 경계·실패 또는 no-op 조건으로 FUN_004a7880·FUN_004a81f0·FUN_004a8410·FUN_004a8480을 호출하는가? 기존 탐색 후보명 progress·production/text·slot draw·clear 중 무엇을 전체 정적 경계로 검증하거나 교정해야 하며, 현재 apps/game-client/src/ui/selectionPanel.ts의 건설·생산·연구 표시와 의미상 호환되는 범위만 원본 기반 compatibility slice로 분류할 수 있는가?",
    sourceExecutableSha256: executableSha256,
    analysisStatus: "static-confirmed",
    reproductionStatus: "scoped-reproduction-complete",
    implementationStatus: "analysis-only-no-production-change",
    dispatcher: {
      entry: "0x004a84e0",
      owner: "ECX object rooted at 0x005e3680 in both direct callers",
      argument:
        "one destination surface pointer at [entry ESP+4], callee cleanup RET 4",
      visibilityGate:
        "FUN_004a7de0 returns one for an exact-one active DWORD at owner+0xe8+slot*4 or any nonzero owner+0xf8/+0x568/+0x564",
      slots:
        "four ordered slots 0..3; active DWORD owner+0xe8+slot*4 must equal one",
      kind:
        "DWORD owner+0xc8+slot*4 equal to one selects FUN_004a7880; every other DWORD selects slot surface draw then FUN_004a81f0",
      fixedDrawOrder: [
        "base rectangle",
        "slots 0 through 3",
        "field_0x568 rectangle when exactly one",
        "field_0x564 rectangle when exactly one",
      ],
    },
    geometry: {
      base: BASE_RECT,
      slots: SLOT_RECTS,
      field_0x568: FIELD_0X568_RECT,
      field_0x564: FIELD_0X564_RECT,
    },
    fields: [
      {
        location: "owner+0xc8+slot*4",
        width: "DWORD, canonical reproduction input 0..0xffffffff",
        role: "raw slot kind selector; only exact value one is distinguished",
      },
      {
        location: "owner+0xe8+slot*4",
        width: "DWORD, canonical reproduction input 0..0xffffffff",
        role: "raw slot active selector; only exact value one enters a slot branch",
      },
      {
        location: "owner+0x13c+slot*2",
        width: "signed WORD",
        role: "progress input advanced by five below signed 100",
      },
      {
        location: "owner+0x10+slot*2",
        width: "signed WORD",
        role: "index into the label byte-string pointer table at 0x00c83e44",
      },
      {
        location: "owner+0xf8, owner+0x564, owner+0x568",
        width: "DWORD, canonical reproduction input 0..0xffffffff",
        role: "raw visibility/draw fields; semantic names remain unresolved",
      },
      {
        location: "DAT_0054927c",
        width: "surface pointer",
        role: "screen-sized base and optional-rectangle source surface",
      },
      {
        location: "DAT_00549588..DAT_00549594",
        width: "four consecutive surface pointers",
        role: "130 by 120 slot surfaces",
      },
    ],
    indirectCalls: [
      {
        offset: "destination vtable+0x1c",
        role: "base, non-progress slot, field_0x568, and field_0x564 blits",
        returnHandling: "ignored",
      },
      {
        offset: "destination vtable+0x14",
        role: "progress rectangle blit",
        returnHandling: "ignored",
      },
      {
        offset: "destination vtable+0x44",
        role: "label HDC acquisition",
        returnHandling: "nonzero returns early",
      },
      {
        offset: "destination vtable+0x68",
        role: "label HDC release",
        returnHandling: "ignored",
      },
    ],
    correctedCandidates: [
      "FUN_004a8480 initializes a RECT and does not clear a surface",
      "FUN_004a8410 initializes slot rectangles and does not itself draw",
      "FUN_004a81f0 draws a table-selected label; no production or research semantic discriminator is read in its complete body",
    ],
    compatibilityConclusion:
      "No construction, production, or research semantic binding is closed. The current responsive multi-selection selectionPanel remains a project superset; no production UI behavior is changed.",
    excludedScope: [
      "actual GDI font realization, label bytes, glyph pixels, and measured values",
      "semantic identities of raw slot kind values other than the exact-one branch distinction",
      "upstream binding from original slot records to construction, production, or research mechanics",
      "downstream behavior of indirect blits when a reported surface allocation failure left a null source or destination",
    ],
    rawCodeRanges: RAW_CODE_RANGES.map((range) =>
      verifyRawCodeRange(buffer, image, range),
    ),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) =>
      verifyEvidencePoint(buffer, image, point),
    ),
    referenceSets: REFERENCE_SETS.map((expected) =>
      verifyReferenceSet(references, expected),
    ),
  };
}

export function reproduceSelectionPanelSlotDispatch(input) {
  validateCommonInput(input);
  const slots = input.slots.map(({ activeState, kindState, progressWord }) => ({
    activeState,
    kindState,
    progressWord,
  }));
  const visible =
    slots.some(({ activeState }) => activeState === 1) ||
    input.field_0xf8 !== 0 ||
    input.field_0x568 !== 0 ||
    input.field_0x564 !== 0;

  if (!visible) {
    return {
      dispatcherInvoked: false,
      finalSlots: slots,
      operations: [],
    };
  }
  validateReachedSurfaceInputs(input);
  if (!input.destinationSurfaceAvailable) {
    throw new Error(
      `${input.callerDestination} is unavailable: both original callers pass it to FUN_004a84e0, which dereferences the destination vtable without a null guard`,
    );
  }

  const operations = [
    surfaceDrawOperation({
      role: "base",
      methodOffset: "0x1c",
      destination: input.callerDestination,
      source: "DAT_0054927c",
      sourceAvailable: input.baseSourceAvailable,
      rect: BASE_RECT,
      sourceRect: BASE_RECT,
    }),
  ];

  for (let slot = 0; slot < 4; slot += 1) {
    const rawSlot = input.slots[slot];
    const finalSlot = slots[slot];
    if (rawSlot.activeState !== 1) {
      continue;
    }
    assertUnsignedDword(rawSlot.kindState, `slots[${slot}].kindState`);
    if (rawSlot.kindState === 1) {
      reproduceProgressSlot({
        slot,
        rawSlot,
        finalSlot,
        input,
        operations,
      });
      continue;
    }

    const rect = SLOT_RECTS[slot];
    operations.push(
      surfaceDrawOperation({
        role: "slot-frame",
        methodOffset: "0x1c",
        destination: input.callerDestination,
        source: slotSurfaceName(slot),
        sourceAvailable: input.slotSourceAvailability[slot],
        rect,
        sourceRect: null,
        slot,
      }),
    );
    reproduceLabelSlot({ slot, rawSlot, input, operations });
  }

  if (input.field_0x568 === 1) {
    operations.push(
      surfaceDrawOperation({
        role: "field_0x568",
        methodOffset: "0x1c",
        destination: input.callerDestination,
        source: "DAT_0054927c",
        sourceAvailable: input.baseSourceAvailable,
        rect: FIELD_0X568_RECT,
        sourceRect: FIELD_0X568_RECT,
      }),
    );
  }
  if (input.field_0x564 === 1) {
    operations.push(
      surfaceDrawOperation({
        role: "field_0x564",
        methodOffset: "0x1c",
        destination: input.callerDestination,
        source: "DAT_0054927c",
        sourceAvailable: input.baseSourceAvailable,
        rect: FIELD_0X564_RECT,
        sourceRect: FIELD_0X564_RECT,
      }),
    );
  }

  return {
    dispatcherInvoked: true,
    finalSlots: slots,
    operations,
  };
}

export function reproduceSelectionSlotRectangle(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("slot rectangle input must be an object");
  }
  assertSignedWord(input.slot, "slot");
  let left;
  let top;
  if (input.slot >= 0 && input.slot < SLOT_RECTS.length) {
    ({ left, top } = SLOT_RECTS[input.slot]);
  } else {
    if (
      !input.callerRect ||
      typeof input.callerRect !== "object" ||
      Array.isArray(input.callerRect)
    ) {
      throw new TypeError(
        "callerRect must be an object for an out-of-range signed slot",
      );
    }
    assertSignedDword(input.callerRect.left, "callerRect.left");
    assertSignedDword(input.callerRect.top, "callerRect.top");
    left = input.callerRect.left;
    top = input.callerRect.top;
  }
  return {
    left,
    top,
    right: wrapSignedDword(left + 130),
    bottom: wrapSignedDword(top + 120),
  };
}

function reproduceProgressSlot({
  slot,
  rawSlot,
  finalSlot,
  input,
  operations,
}) {
  assertSignedWord(rawSlot.progressWord, `slots[${slot}].progressWord`);
  let progress = rawSlot.progressWord;
  if (progress < 100) {
    progress = wrapSignedWord(progress + 5);
    finalSlot.progressWord = progress;
    operations.push({
      type: "state-write",
      role: "advance-progress-word",
      slot,
      value: progress,
    });
  } else {
    finalSlot.kindState = 0;
    operations.push({
      type: "state-write",
      role: "clear-kind-at-progress-boundary",
      slot,
      value: 0,
    });
  }

  const slotRect = SLOT_RECTS[slot];
  const width = truncatingDivide(progress * 130, 100);
  const height = truncatingDivide(progress * 120, 100);
  const left =
    truncatingDivide(slotRect.left + slotRect.right, 2) -
    truncatingDivide(width, 2);
  const top =
    truncatingDivide(slotRect.top + slotRect.bottom, 2) -
    truncatingDivide(height, 2);
  operations.push(
    surfaceDrawOperation({
      role: "progress",
      methodOffset: "0x14",
      destination: input.callerDestination,
      source: slotSurfaceName(slot),
      sourceAvailable: input.slotSourceAvailability[slot],
      rect: { left, top, right: left + width, bottom: top + height },
      sourceRect: null,
      slot,
      options: [0, "0x01008000", 0],
    }),
  );
}

function reproduceLabelSlot({ slot, rawSlot, input, operations }) {
  if (!rawSlot.label || typeof rawSlot.label !== "object") {
    throw new TypeError(
      `slots[${slot}].label must be an object when an active non-progress slot reaches FUN_004a81f0`,
    );
  }
  assertBoolean(
    rawSlot.label.hdcAcquisitionSucceeded,
    `slots[${slot}].label.hdcAcquisitionSucceeded`,
  );
  if (!rawSlot.label.hdcAcquisitionSucceeded) {
    operations.push({
      type: "label-render",
      status: "hdc-acquisition-failed",
      slot,
      hdcReleased: false,
      textDraws: [],
    });
    return;
  }

  assertSignedWord(
    rawSlot.textRecordIndex,
    `slots[${slot}].textRecordIndex`,
  );
  assertBoolean(
    rawSlot.label.labelPointerAvailable,
    `slots[${slot}].label.labelPointerAvailable`,
  );
  if (!rawSlot.label.labelPointerAvailable) {
    throw new Error(
      `slots[${slot}] signed WORD textRecordIndex does not resolve to an available pointer in the original 0x00c83e44 table; strlen and TextOutA behavior are not deterministic`,
    );
  }
  if (rawSlot.label.gdiMeasurementSucceeded !== true) {
    throw new Error(
      `slots[${slot}].label.gdiMeasurementSucceeded must be true: FUN_004a81f0 ignores GetTextExtentPoint32A failure and consumes undefined SIZE fields`,
    );
  }
  assertSignedDword(
    rawSlot.label.suppliedMeasuredWidth,
    `slots[${slot}].label.suppliedMeasuredWidth`,
  );
  assertSignedDword(
    rawSlot.label.suppliedMeasuredHeight,
    `slots[${slot}].label.suppliedMeasuredHeight`,
  );
  assertSignedDword(input.screenWidth, "screenWidth");
  assertSignedDword(input.screenHeight, "screenHeight");

  const rect = SLOT_RECTS[slot];
  const width = rawSlot.label.suppliedMeasuredWidth;
  const height = rawSlot.label.suppliedMeasuredHeight;
  let x = subtractSignedDword(
    addSignedDword(rect.left, 65),
    truncatingDivide(width, 2),
  );
  let y = rect.bottom;
  if (x < 0) {
    x = 0;
  }
  if (y < 0) {
    y = 0;
  }

  const shadowX = addSignedDword(x, 1);
  const shadowY = addSignedDword(y, 1);
  const shadowRight = addSignedDword(x, width);
  const shadowBottom = addSignedDword(y, height);

  if (addSignedDword(x, width) > input.screenWidth) {
    x = wrapSignedWord(subtractSignedDword(input.screenWidth, width));
  }
  if (addSignedDword(y, height) > input.screenHeight) {
    y = wrapSignedWord(subtractSignedDword(input.screenHeight, height));
  }
  const mainRight = addSignedDword(x, width);
  const mainBottom = addSignedDword(y, height);

  operations.push({
    type: "label-render",
    status: "rendered",
    slot,
    textRecordIndex: rawSlot.textRecordIndex,
    suppliedMeasurement: { width, height },
    selectObjectReturnIgnored: true,
    hdcReleased: true,
    shadowBounds: {
      left: shadowX,
      top: shadowY,
      right: shadowRight,
      bottom: shadowBottom,
    },
    mainBounds: {
      left: x,
      top: y,
      right: mainRight,
      bottom: mainBottom,
    },
    textDraws: [
      { x: shadowX, y: shadowY, color: "0x00010101" },
      { x, y, color: "0x00fafafa" },
    ],
  });
}

function surfaceDrawOperation({
  role,
  methodOffset,
  destination,
  source,
  sourceAvailable,
  rect,
  sourceRect,
  slot,
  options,
}) {
  return {
    type: "surface-draw",
    role,
    methodOffset,
    destination,
    source,
    sourceAvailable,
    destinationPoint: { x: rect.left, y: rect.top },
    sourceRect,
    rect,
    ...(slot === undefined ? {} : { slot }),
    ...(options === undefined ? { flags: "0x11" } : { options }),
    returnValueIgnored: true,
  };
}

function validateCommonInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("selection-panel dispatch input must be an object");
  }
  if (!Array.isArray(input.slots) || input.slots.length !== 4) {
    throw new RangeError("slots must contain exactly four slot records");
  }
  input.slots.forEach((slot, index) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      throw new TypeError(`slots[${index}] must be an object`);
    }
    assertUnsignedDword(slot.activeState, `slots[${index}].activeState`);
  });
  for (const field of ["field_0xf8", "field_0x568", "field_0x564"]) {
    assertUnsignedDword(input[field], field);
  }
}

function validateReachedSurfaceInputs(input) {
  if (
    input.callerDestination !== "DAT_00549580" &&
    input.callerDestination !== "DAT_0055a938"
  ) {
    throw new RangeError(
      `callerDestination must be DAT_00549580 or DAT_0055a938 once the dispatcher is reached; got ${String(input.callerDestination)}`,
    );
  }
  assertBoolean(
    input.destinationSurfaceAvailable,
    "destinationSurfaceAvailable",
  );
  assertBoolean(input.baseSourceAvailable, "baseSourceAvailable");
  if (
    !Array.isArray(input.slotSourceAvailability) ||
    input.slotSourceAvailability.length !== 4
  ) {
    throw new RangeError(
      "slotSourceAvailability must contain exactly four entries once the dispatcher is reached",
    );
  }
  input.slots.forEach((slot, index) => {
    if (slot.activeState === 1) {
      assertBoolean(
        input.slotSourceAvailability[index],
        `slotSourceAvailability[${index}]`,
      );
    }
  });
}

function verifyFunctionCatalog(functions) {
  if (!Array.isArray(functions.functions)) {
    throw new TypeError("functions.json must contain a functions array");
  }
  return FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions.find(
      (candidate) => candidate.entry === expected.entry,
    );
    if (!actual) {
      throw new Error(`functions.json is missing ${expected.entry}`);
    }
    assertEqual(
      actual.bodyRanges?.length,
      1,
      `${expected.entry} function-catalog body range count`,
    );
    assertEqual(
      actual.bodyRanges[0],
      expected.bodyRange,
      `${expected.entry} function-catalog body range`,
    );
    assertEqual(
      actual.bodySize,
      expected.bodySize,
      `${expected.entry} function-catalog body size`,
    );
    assertEqual(
      actual.instructionCount,
      expected.instructionCount,
      `${expected.entry} function-catalog instruction count`,
    );
    assertEqual(
      actual.instructionSha256,
      expected.instructionSha256,
      `${expected.entry} function-catalog instruction SHA-256`,
    );
    return expected;
  });
}

function verifyReferenceSet(references, expected) {
  if (!Array.isArray(references.references)) {
    throw new TypeError("references.json must contain a references array");
  }
  const projection = references.references
    .filter((reference) => reference[expected.field] === expected.value)
    .map(({ from, to, type, fromFunctionEntry }) => ({
      from,
      to,
      type,
      fromFunctionEntry,
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const digest = createHash("sha256")
    .update(JSON.stringify(projection))
    .digest("hex");
  assertEqual(
    projection.length,
    expected.count,
    `${expected.label} structured reference count`,
  );
  assertEqual(
    digest,
    expected.digest,
    `${expected.label} structured reference digest`,
  );
  return {
    label: expected.label,
    field: expected.field,
    value: expected.value,
    count: projection.length,
    sha256: digest,
    references: projection,
  };
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean; got ${String(value)}`);
  }
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(
      `${label} must be a signed WORD (-32768..32767); got ${String(value)}`,
    );
  }
}

function assertSignedDword(value, label) {
  if (
    !Number.isInteger(value) ||
    value < -0x80000000 ||
    value > 0x7fffffff
  ) {
    throw new RangeError(
      `${label} must be a signed DWORD (-2147483648..2147483647); got ${String(value)}`,
    );
  }
}

function assertUnsignedDword(value, label) {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0xffffffff
  ) {
    throw new RangeError(
      `${label} must be one canonical unsigned DWORD (0..4294967295); got ${String(value)}`,
    );
  }
}

function wrapSignedWord(value) {
  const unsigned = ((value % 0x10000) + 0x10000) % 0x10000;
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function wrapSignedDword(value) {
  return Number(BigInt.asIntN(32, BigInt(value)));
}

function addSignedDword(left, right) {
  return wrapSignedDword(left + right);
}

function subtractSignedDword(left, right) {
  return wrapSignedDword(left - right);
}

function truncatingDivide(dividend, divisor) {
  return Math.trunc(dividend / divisor);
}

function slotSurfaceName(slot) {
  return `DAT_${toHex(0x00549588 + slot * 4).slice(2)}`;
}

function parseArgs(argv) {
  const parsed = {};
  const paths = new Map([
    ["--input", "executablePath"],
    ["--functions", "functionsPath"],
    ["--references", "referencesPath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    const key = paths.get(arg);
    if (!key) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a path`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`source: ${report.sourceExecutableSha256}`);
  console.log(`analysis: ${report.analysisStatus}`);
  console.log(`reproduction: ${report.reproductionStatus}`);
  console.log(`dispatcher: ${report.dispatcher.entry}`);
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { json, ...options } = parseArgs(process.argv.slice(2));
  printReport(extractSelectionPanelSlotDispatch(options), json);
}
