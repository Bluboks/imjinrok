#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_K01_SCRIPT_SHA256 =
  "d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8";

const K01_OBJECTIVE_PRIMARY =
  "1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)";
const K01_OBJECTIVE_PRIMARY_CP949_HEX =
  "312e20bac0c8adb4ebb8a620c1feb0ed20c0fbb1ba20bcb6b8ea2028c0afbcbab7e62c20b1c7c0b2c0ba20bbecbec620b3b2bec6bedf20c7d1b4d92e29";

const SEEDED_FUNCTIONS = [
  [
    "0x004a5730",
    "0x004a5730-0x004a5977",
    13,
    157,
    "84cccf7daf0e07f6a0e58041034a86be6fbc07937c768240426632bb7e8855e9",
  ],
  [
    "0x004a9010",
    "0x004a9010-0x004a9258",
    23,
    189,
    "bf0bc845081af0d33719555f7ed7e735b3bfa2a00f0a5f84586744ac5cb02780",
  ],
].map(([entry, bodyRange, blockCount, instructionCount, bodySha256]) => ({
  entry,
  bodyRange,
  blockCount,
  instructionCount,
  bodySha256,
}));

const RAW_CODE_RANGES = [
  [
    "font-family-initializer",
    0x004402b0,
    0x004404e7,
    "6eeba9911fb4e75c5457b469474a09245bf51ec56908b21cd9d9158608c2ae18",
  ],
  [
    "font-init-owner",
    0x0045f190,
    0x0045f244,
    "b512d4288d72637a244cfbb9485ae6a2b74350414524a5c91e11afcd9f0074be",
  ],
  [
    "font-teardown-owner",
    0x0045f250,
    0x0045f308,
    "9ea10d5aa3a36a6741055fbc2bd07d68b99c417757e5ddc918fd2f0be855ee2a",
  ],
  [
    "scratch-surface-preparer",
    0x004a92f0,
    0x004a9307,
    "0807b2458a2ad20dcf0a6a78bba9841295870472fcf37e5a3180760a0cfb4894",
  ],
  [
    "scratch-surface-clear",
    0x004a9310,
    0x004a9364,
    "0f79789dbc8cf2aab9f887e88aed51fdfb41b35d577de88d9261e8eff5d26169",
  ],
  [
    "font-height-measurer",
    0x004a9370,
    0x004a93bd,
    "10a404bcdeaf01c7975a8d3ba4682355d514e78ccce2fe02f64247e9832dbbf1",
  ],
].map(([id, start, endExclusive, sha256Digest]) => ({
  id,
  start,
  endExclusive,
  sha256: sha256Digest,
}));

const FUNCTION_CATALOG = [
  ["0x004402b0", "0x004402b0-0x004404e6", 567, 189, "1fd1487eb36805a8bf85e3272ae9cce62ee4aab8b1d11851645d6f497b8b2f60"],
  ["0x0045f190", "0x0045f190-0x0045f243", 180, 42, "a69bbff3a7935d129f2786c5e0d56db59441fe460b7951b40e2b8ca637456b8b"],
  ["0x0045f250", "0x0045f250-0x0045f307", 184, 49, "7812f6c4db08302e4cbb110591317aaac9a834995fd9e140a28e22dad618dfe5"],
  ["0x004a5730", "0x004a5730-0x004a5977", 584, 157, "bf74b8c5778e1581bf6ffc0ea4328f289229dc068d8fae6ec489f95a053f21cc"],
  ["0x004a9010", "0x004a9010-0x004a9258", 585, 189, "7d7963daf5135ced7e12acde18571459d319c3b4171d34066653df2cc39c00dc"],
  ["0x004a92f0", "0x004a92f0-0x004a9306", 23, 7, "9729fabec2eb86232549a6ea7bda7e49a707edbc25f9927431d18d1ac2cede30"],
  ["0x004a9310", "0x004a9310-0x004a9363", 84, 26, "70ea8d0a0aa10f9bf7cf33dfcaa0e6339942073c85075d2d6aabe6b652dbcec7"],
  ["0x004a9370", "0x004a9370-0x004a93bc", 77, 31, "4d504681be55233c52f6288660d382f14edde823eec0746df90e4a3c45b3e045"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({
  entry,
  bodyRange,
  bodySize,
  instructionCount,
  instructionSha256,
}));

const STATIC_EVIDENCE = [
  [
    0x00440389,
    "68 98 ba 4b 00 6a 00 6a 00 6a 00 6a 00 68 81 00 00 00 6a 00 6a 00 6a 00 6a 00 6a 00 6a 00 6a 00 6a 0c ff d6 85 c0 a3 38 4e 63 00 75 17",
    "CreateFontA requests Arial at logical height 12 with HANGEUL_CHARSET and stores the handle even when null",
  ],
  [
    0x004403b6,
    "68 78 ba 4b 00 68 70 ba 4b 00 68 18 94 55 00 e8 76 ac 00 00 83 c4 0c",
    "null objective-font creation reports an error and initialization continues",
  ],
  [0x0045f202, "e8 a9 10 fe ff", "the process UI initializer calls the font-family initializer"],
  [
    0x0045f284,
    "8b 0d 9c 6d c0 00 8b 35 5c 70 4b 00 51 ff d6 8b 15 38 4e 63 00 52 ff d6",
    "teardown passes the objective HFONT to DeleteObject and ignores the return",
  ],
  [
    0x004a5847,
    "8d 54 24 04 68 ff ff 00 00 8d 44 24 0a 52 8d 8c 24 20 08 00 00 50 51 68 40 01 00 00 e8 a8 37 00 00",
    "first objective text call pushes color, heightOut, widthOut, CP949 buffer, then requested width 320",
  ],
  [
    0x004a58c8,
    "8d 4c 24 08 68 ff ff 00 00 8d 54 24 0e 51 8d 84 24 24 04 00 00 52 50 68 40 01 00 00 e8 27 37 00 00",
    "second objective text call uses the same recovered five-argument cdecl order",
  ],
  [
    0x004a588f,
    "0f bf 44 24 04 53 8d 54 24 0c 6a 11 52 8b 15 68 92 54 00 89 44 24 20 52 8b 0d 7c 92 54 00 99 2b c2 ba a6 00 00 00 d1 f8 8b 19 2b d0",
    "first measured signed height is halved with truncation toward zero and centered on y 166",
  ],
  [
    0x004a5911,
    "0f bf 44 24 04 89 44 24 14 8b 0d 7c 92 54 00 99 2b c2 8d 74 24 08 8b d0 b8 e4 00 00 00 d1 fa 2b c2",
    "second measured signed height is halved with truncation toward zero and centered on y 228",
  ],
  [
    0x004a9024,
    "e8 c7 02 00 00 66 8b 84 24 b8 02 00 00 89 5c 24 18 66 3d 2c 01 7d 09 0f bf c0 89 44 24 20 eb 08 c7 44 24 20 2c 01 00 00",
    "renderer prepares the scratch surface and clamps the signed requested width to 300",
  ],
  [
    0x004a905e,
    "a1 68 92 54 00 33 ff f7 d1 49 52 89 4c 24 2c 8b 08 50 89 7c 24 24 ff 51 44 85 c0 0f 85 93 01 00 00",
    "scratch HDC acquisition failure jumps directly to deterministic one-by-one outputs",
  ],
  [
    0x004a907f,
    "8b 44 24 10 6a 01 50 ff 15 4c 70 4b 00 8b 0d 38 4e 63 00 8b 54 24 10 51 52 ff 15 54 70 4b 00",
    "successful HDC acquisition sets transparent background mode and selects DAT_00634e38 without checking either result",
  ],
  [
    0x004a909e,
    "8b 84 24 bc 02 00 00 8b 4c 24 10 50 51 e8 c0 02 00 00 83 c4 08 89 44 24 24",
    "font height helper receives HDC and the full CP949 byte string",
  ],
  [
    0x004a90bd,
    "66 3b 74 24 28 7c 09 83 fd 01 0f 85 31 01 00 00 33 c9 85 ed 75 2f 8b 94 24 bc 02 00 00 0f bf c6 0f bf f9 8a 04 10 46 41 3c 20 88 44 3c 34 74 04 84 c0 75 e9",
    "the renderer copies byte chunks through ASCII space or NUL without decoding CP949 characters",
  ],
  [
    0x004a9102,
    "8d 7c 24 34 83 c9 ff 33 c0 8d 54 24 2c f2 ae f7 d1 49 52 51 8b 4c 24 18 8d 44 24 3c 50 51 ff 15 58 70 4b 00 8b 54 24 2c 0f bf 4c 24 20 0f bf f3 8d 04 16 3b c1 7d 7d",
    "GetTextExtentPoint32A measures each chunk and equality with the effective width takes the wrap branch",
  ],
  [
    0x004a9139,
    "8b 54 24 10 68 01 01 01 00 52 ff 15 48 70 4b 00",
    "accepted chunks first select color 0x010101 for a one-pixel shadow",
  ],
  [
    0x004a9175,
    "8b 8c 24 c8 02 00 00 8b 54 24 10 51 52 ff 15 48 70 4b 00",
    "the caller color is restored before the main TextOutA",
  ],
  [
    0x004a91b6,
    "66 3b 5c 24 1c 7e 04 89 5c 24 1c 8b 54 24 18 8b 4c 24 24 33 db 8d 44 0a 01 0f bf c9 0f bf d0 03 ca 89 44 24 18 81 f9 fa 00 00 00",
    "wrap records prior width, advances by lineHeight plus one, and bounds the prospective bottom at 250",
  ],
  [
    0x004a91e7,
    "68 34 92 4c 00 68 b0 ab 4b 00 68 18 94 55 00 e8 45 1e fa ff 83 c4 0c",
    "vertical overflow reports an error before releasing the HDC",
  ],
  [
    0x004a920e,
    "8b 7c 24 1c 8b 44 24 18 8b 4c 24 24 66 3b fb 8d 54 01 01 8b 84 24 c4 02 00 00 66 89 10",
    "heightOut is lineHeight plus current y plus one and widthOut is maximum line width plus one",
  ],
  [
    0x004a92f0,
    "68 fa 00 00 00 68 2c 01 00 00 6a 00 6a 00 e8 0d 00 00 00 83 c4 10 c3",
    "the renderer requests scratch clear bounds 0,0,300,250",
  ],
  [
    0x004a9310,
    "a1 68 92 54 00 85 c0 74 4a 50 b9 18 94 55 00 e8 8c 18 fa ff 83 f8 01 75 3a",
    "missing scratch surface or scratch lock failure returns without preventing later HDC acquisition",
  ],
  [
    0x004a9329,
    "0f bf 44 24 10 0f bf 4c 24 0c 0f bf 54 24 08 48 68 fe 00 00 00 50 49",
    "successful scratch lock converts exclusive 300 by 250 bounds to inclusive 299 by 249 and clears with index 254",
  ],
  [
    0x004a9370,
    "8b 54 24 08 83 ec 08 8d 44 24 00 83 c9 ff 57 50 8b fa 33 c0 f2 ae f7 d1 49 51 8b 4c 24 18 52 51 ff 15 58 70 4b 00",
    "font height helper measures the complete NUL-terminated byte string with GetTextExtentPoint32A",
  ],
  [
    0x004a9396,
    "8b 4c 24 08 5f 8d 04 89 8d 14 80 b8 1f 85 eb 51 d1 e2 f7 ea c1 fa 05 8b c2 c1 e8 1f 03 d0 03 ca 66 8b c1",
    "font height helper returns measured pixel height plus truncating one half",
  ],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const IMPORTS = [
  [0x004b703c, 0x004b9802, 54, "CreateFontA"],
  [0x004b7048, 0x004b97d0, 499, "SetTextColor"],
  [0x004b704c, 0x004b97c4, 462, "SetBkMode"],
  [0x004b7050, 0x004b97b8, 517, "TextOutA"],
  [0x004b7054, 0x004b97a8, 455, "SelectObject"],
  [0x004b7058, 0x004b9790, 366, "GetTextExtentPoint32A"],
  [0x004b705c, 0x004b9780, 83, "DeleteObject"],
].map(([iatVa, hintNameVa, hint, name]) => ({ iatVa, hintNameVa, hint, name }));

const REFERENCE_SETS = [
  [
    "FUN_004a9010 callers",
    "0x004a9010",
    8,
    "4937ac71aa4365a25ca0bfb4549bf172fd2ce9d0d14dda103fbfa969f6c90138",
  ],
  [
    "DAT_00634e38 references",
    "0x00634e38",
    11,
    "041fca1e4c4ae1b2ac7c92d96322ad29752fac958c7aba3f4cd688fc8f857581",
  ],
  [
    "FUN_004a92f0 callers",
    "0x004a92f0",
    2,
    "a0760ac6e6638ceb31230782e8daf3f4757105aa8b69b40156fcdf41572c2a51",
  ],
  [
    "FUN_004a9310 callers",
    "0x004a9310",
    2,
    "8c4f61565452776a44a26bd8fe2a98aa92a79dc04b38ae85895428473a9900d2",
  ],
  [
    "FUN_004a9370 callers",
    "0x004a9370",
    2,
    "fbbf0b33dd3c92fabf6b1975c0ca7ef37a8031fde9143b4bf6cb5a06080b753f",
  ],
  [
    "FUN_004402b0 callers",
    "0x004402b0",
    1,
    "788fb06d65c4fe5dfdec73d46b35e9b2c9431bfa70bb77a3a3504a3d7f897f48",
  ],
  [
    "FUN_0045f190 callers",
    "0x0045f190",
    1,
    "d192458132c3de40d566300fe899dbb465643f584dc6f13b96866926e3d53237",
  ],
  [
    "FUN_0045f250 callers",
    "0x0045f250",
    2,
    "6160edaa19fe36a43950d5ca8ddbc115883f5d777d26a56003e33e00b4d78378",
  ],
].map(([label, target, count, digest]) => ({ label, target, count, digest }));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractObjectiveModalTypography({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    k01ScriptPath: args.k01Script ?? DEFAULT_K01_SCRIPT_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    functionsPath: args.functions ?? DEFAULT_FUNCTIONS_PATH,
    referencesPath: args.references ?? DEFAULT_REFERENCES_PATH,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

export function extractObjectiveModalTypography({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  k01ScriptPath = DEFAULT_K01_SCRIPT_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const k01Script = verifyK01Script(k01ScriptPath);
  const seeds = readJson(seedsPath);
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  for (const [path, artifact] of [
    [seedsPath, seeds],
    [functionsPath, functions],
    [referencesPath, references],
  ]) {
    assertEqual(artifact.sourceSha256, executableSha256, `${path} source SHA-256`);
  }

  const seededFunctions = SEEDED_FUNCTIONS.map((expected) =>
    verifySeededFunction(executableBuffer, image, seeds, expected),
  );
  const rawCodeRanges = RAW_CODE_RANGES.map((range) =>
    verifyRawCodeRange(executableBuffer, image, range),
  );
  const functionCatalog = verifyFunctionCatalog(functions);
  const evidencePoints = STATIC_EVIDENCE.map((point) =>
    verifyEvidencePoint(executableBuffer, image, point),
  );
  const imports = verifyGdiImports(executableBuffer, image);
  const referenceSets = REFERENCE_SETS.map((expected) =>
    verifyReferenceSet(references, expected),
  );

  const fontFace = readCString(
    executableBuffer,
    requireRawOffset(image, 0x004bba98),
  );
  assertEqual(fontFace, "Arial", "objective font face string");

  return {
    selectedQuestion:
      "원본 공통 임무 목표 모달의 두 문자열이 어떤 font resource를 선택하고, 어떤 생성·폭 측정·줄바꿈·수직 배치 호출을 거쳐 content surface에 그려지는지 전체 정적 경계로 복원하여, 현재 project-adapted typography 중 어느 범위만 원본 기반으로 교체할 수 있는가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "partial-reproduction",
    implementationDecision:
      "port only the statically fixed effective 300-pixel base wrap width; retain project-adapted font realization, glyph measurement, Korean wrapping, line spacing, and rendering",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      k01Script: { path: k01ScriptPath, sha256: k01Script.sha256 },
      seeds: { path: seedsPath, sourceSha256: seeds.sourceSha256 },
      functions: { path: functionsPath, sourceSha256: functions.sourceSha256 },
      references: {
        path: referencesPath,
        sourceSha256: references.sourceSha256,
      },
    },
    k01Objective: {
      primaryText: k01Script.objectiveArgs[0],
      primaryCp949Hex: k01Script.objectiveHex[0],
      secondaryText: k01Script.objectiveArgs[1],
      secondaryCp949Hex: k01Script.objectiveHex[1],
    },
    recoveredCallingConvention: {
      function: "FUN_004a9010",
      convention: "cdecl; caller removes 0x14 bytes",
      arguments: [
        "signed WORD requestedMaxWidth",
        "NUL-terminated Windows-949 byte string pointer",
        "signed WORD* widthOut",
        "signed WORD* heightOut",
        "COLORREF textColor",
      ],
      proof:
        "the two FUN_004a5730 call sites push color, heightOut, widthOut, text pointer, and requested width in right-to-left x86 order; both add 0x14 to ESP after return",
      returnValue: "none used; dimensions are written through the two WORD pointers",
    },
    font: {
      storage: { address: "0x00634e38", type: "HFONT" },
      createCall: "0x004403ab indirect through IAT 0x004b703c",
      request: {
        face: fontFace,
        logicalHeight: 12,
        logicalWidth: 0,
        escapement: 0,
        orientation: 0,
        weight: 0,
        italic: false,
        underline: false,
        strikeOut: false,
        charSet: "0x81 HANGEUL_CHARSET",
        outputPrecision: 0,
        clipPrecision: 0,
        quality: 0,
        pitchAndFamily: 0,
      },
      initOwner: "0x0045fa3b -> FUN_0045f190 -> 0x0045f202 -> FUN_004402b0",
      createFailure:
        "the null HFONT is stored, an error is reported, and initialization continues",
      selection:
        "FUN_004a9010 selects DAT_00634e38 into the acquired scratch HDC and ignores SelectObject's return",
      teardown:
        "FUN_0045f250 passes DAT_00634e38 to DeleteObject at 0x0045f29a and ignores its return; direct callers are 0x0045f40f and 0x00460b3b",
      unresolvedRealization:
        "the actual Korean-capable face chosen by the Windows font mapper, its font file/version, and its glyph metrics are external to the EXE/data and therefore not statically reproducible",
    },
    renderer: {
      scratchSurface: "DAT_00549268",
      requestedMaxWidth: 320,
      effectiveMaxWidth: 300,
      scratchClear:
        "FUN_004a92f0 calls FUN_004a9310 for exclusive 0,0,300,250; successful lock clears inclusive 0,0,299,249 with palette index 254; missing surface or lock failure returns and rendering still proceeds",
      hdc:
        "vtable +0x44 acquires the HDC; nonzero failure skips all GDI work and writes width=1,height=1; vtable +0x68 releases only an acquired HDC",
      byteFlow:
        "FUN_004838f0 copies the K0110 OBJECTIVE payloads into local buffers; FUN_004a9010 uses strlen and passes the unchanged Windows-949 bytes to GetTextExtentPoint32A and TextOutA",
      wrapping:
        "chunks end after ASCII byte 0x20 or at NUL, so spaces remain in measured/drawn chunks; no CP949 decoding and no character-break path exists; currentX + chunkWidth must be strictly less than 300, and equality wraps",
      vertical:
        "FUN_004a9370 computes lineHeight = measured SIZE.cy + trunc(SIZE.cy/2); wraps advance lineHeight+1, prospective bottom over 250 reports an error, and output height is currentY+lineHeight+1",
      drawing:
        "each accepted chunk draws color 0x010101 at x+1,y+1, then caller color 0x0000ffff at x,y; GDI draw and color-setting returns are ignored",
      dimensions:
        "widthOut is maximum line width plus one; heightOut is block height plus one; on the no-wrap empty path after a successful HDC measurement, widthOut=1 and heightOut=supplied SIZE.cy+trunc(SIZE.cy/2)+1",
      objectivePlacement:
        "FUN_004a5730 blits the first result at x=158 centered on y=166 and the second at x=158 centered on y=228, using signed WORD dimensions",
    },
    dataFields: [
      {
        location: "FUN_004a9010 argument 1",
        width: "signed WORD",
        role: "requested maximum width",
      },
      {
        location: "GetTextExtentPoint32A SIZE.cx/SIZE.cy",
        width: "signed 32-bit LONG",
        role: "native chunk width and full-string measured SIZE.cy",
      },
      {
        location: "FUN_004a9010 arguments 3/4",
        width: "signed WORD outputs",
        role: "maximum line width plus one and block height plus one",
      },
      {
        location: "FUN_004a9010 source index/current x/current y",
        width: "DWORD locals with repeated signed low-WORD comparisons/conversions",
        role: "byte iteration and layout accumulators",
      },
      {
        location: "K0110 OBJECTIVE payloads",
        width: "NUL-terminated Windows-949 bytes",
        role: "unchanged measurement and TextOutA input",
      },
    ],
    failurePaths: [
      "OBJECTIVE record extraction failure skips both typography calls and their blits",
      "font creation failure reports and continues with a null stored handle",
      "scratch clear surface missing/lock failure returns from clear only and does not prevent HDC acquisition",
      "scratch HDC acquisition failure returns deterministic width=1,height=1 without release",
      "SelectObject, SetBkMode, SetTextColor, TextOutA, GetTextExtentPoint32A, and DeleteObject return values are not checked",
      "GetTextExtentPoint32A failure leaves stack SIZE fields undefined; exact dimensions and subsequent control flow are therefore not statically reproducible",
      "a chunk whose width is greater than or equal to the effective maximum is retried on successive lines until the 250-pixel vertical bound reports an error",
    ],
    reproductionScope:
      "deterministic byte tokenization, 320-to-300 clamp, strict-fit wrapping, line-height arithmetic, empty text, scratch-clear failure continuation, HDC failure outputs, ignored font-selection result, vertical-overflow reporting, and output dimensions under supplied successful GDI measurements",
    unresolvedScope: [
      "realized Arial/HANGEUL_CHARSET Korean face and glyph metrics on the original Windows installation",
      "the actual K0110 chunk widths, line breaks, and rendered pixels",
      "undefined stack SIZE values after GetTextExtentPoint32A failure",
      "whether the original installation bundled or required a particular system font outside the preserved game data",
    ],
    seededFunctions,
    rawCodeRanges,
    functionCatalog,
    evidencePoints,
    imports,
    referenceSets,
  };
}

export function reproduceObjectiveFontInitialization({ createFontSucceeded }) {
  assertBoolean(createFontSucceeded, "createFontSucceeded");
  if (createFontSucceeded) {
    return {
      fontHandleStored: true,
      events: [
        "request-CreateFontA-Arial-height-12-charset-0x81",
        "store-HFONT-DAT_00634e38",
      ],
    };
  }
  return {
    fontHandleStored: false,
    events: [
      "request-CreateFontA-Arial-height-12-charset-0x81",
      "store-null-DAT_00634e38",
      "report-font-create-failure",
      "continue-initialization",
    ],
  };
}

export function reproduceObjectiveTextLayout(input) {
  validateCommonLayoutInput(input);
  const bytes = Buffer.from(input.textCp949Hex, "hex");
  const effectiveMaxWidth =
    input.requestedMaxWidth < 300 ? input.requestedMaxWidth : 300;
  const events = [
    input.surfaceClearLockSucceeded
      ? "clear-scratch-rect-0-0-299-249-index-254"
      : "scratch-clear-lock-failed",
  ];

  if (!input.hdcAcquisitionSucceeded) {
    events.push("scratch-hdc-acquisition-failed");
    return {
      status: "hdc-acquisition-failed",
      effectiveMaxWidth,
      lineHeight: 0,
      measuredWidth: 1,
      measuredHeight: 1,
      lineCount: 0,
      errorReported: false,
      hdcReleased: false,
      events,
      lines: [],
      drawCalls: [],
    };
  }

  validateAcquiredHdcLayoutInput(input);
  events.push(
    "acquire-scratch-hdc",
    "set-transparent-background-mode",
    input.fontSelectionSucceeded
      ? "select-DAT_00634e38"
      : "select-DAT_00634e38-failure-ignored",
    "measure-font-height-with-full-input",
  );

  const chunks = splitOriginalChunks(bytes);
  if (input.chunkWidths.length !== chunks.length) {
    throw new RangeError(
      `chunkWidths must contain exactly ${chunks.length} measurements for the original ASCII-space chunks; got ${input.chunkWidths.length}`,
    );
  }

  const lineHeight =
    input.fullStringMeasuredHeight +
    Math.trunc(input.fullStringMeasuredHeight / 2);
  const lines = [{ y: 0, width: 0, chunkCp949Hex: [] }];
  let currentLine = lines[0];
  let maximumCompletedWidth = 0;
  let chunkIndex = 0;
  let errorReported = false;
  let recordedFirstWrapForChunk = false;
  const drawCalls = [];

  while (chunkIndex < chunks.length) {
    const width = input.chunkWidths[chunkIndex];
    if (currentLine.width + width < effectiveMaxWidth) {
      const x = currentLine.width;
      const y = currentLine.y;
      const chunkCp949Hex = chunks[chunkIndex].toString("hex");
      drawCalls.push({
        chunkCp949Hex,
        x,
        y,
        shadow: { x: x + 1, y: y + 1, color: "0x010101" },
        main: { x, y, color: "0x0000ffff" },
      });
      currentLine.width += width;
      currentLine.chunkCp949Hex.push(chunkCp949Hex);
      chunkIndex += 1;
      recordedFirstWrapForChunk = false;
      continue;
    }

    maximumCompletedWidth = Math.max(
      maximumCompletedWidth,
      currentLine.width,
    );
    const nextY = currentLine.y + lineHeight + 1;
    if (!recordedFirstWrapForChunk) {
      events.push(`wrap-before-chunk-${chunkIndex}`);
      recordedFirstWrapForChunk = true;
    }
    currentLine = { y: nextY, width: 0, chunkCp949Hex: [] };
    lines.push(currentLine);
    if (nextY + lineHeight > 250) {
      events.push("report-vertical-overflow");
      errorReported = true;
      break;
    }
  }

  events.push("release-scratch-hdc");
  const maximumWidth = Math.max(
    maximumCompletedWidth,
    currentLine.width,
  );
  return {
    status: errorReported ? "vertical-overflow" : "rendered",
    effectiveMaxWidth,
    lineHeight,
    measuredWidth: maximumWidth + 1,
    measuredHeight: currentLine.y + lineHeight + 1,
    lineCount: lines.length,
    errorReported,
    hdcReleased: true,
    events,
    lines,
    drawCalls,
  };
}

function verifyK01Script(path) {
  const buffer = readFileSync(path);
  const digest = sha256(buffer);
  assertEqual(digest, EXPECTED_K01_SCRIPT_SHA256, `${path} SHA-256`);
  const decoded = new TextDecoder("windows-949", { fatal: true }).decode(buffer);
  const decodedMatches = [
    ...decoded.matchAll(/\[OBJECTIVE\]\[([^\]]*)\]\[([^\]]*)\]/gu),
  ];
  assertEqual(decodedMatches.length, 1, `${path} OBJECTIVE command count`);
  const objectiveArgs = [decodedMatches[0][1], decodedMatches[0][2]];
  assertEqual(objectiveArgs[0], K01_OBJECTIVE_PRIMARY, `${path} primary OBJECTIVE`);
  assertEqual(objectiveArgs[1], "", `${path} secondary OBJECTIVE`);

  const marker = Buffer.from("[OBJECTIVE][", "ascii");
  const commandStart = buffer.indexOf(marker);
  assertEqual(commandStart >= 0, true, `${path} raw OBJECTIVE marker`);
  const firstStart = commandStart + marker.length;
  const firstEnd = buffer.indexOf(Buffer.from("][", "ascii"), firstStart);
  const secondEnd = buffer.indexOf(0x5d, firstEnd + 2);
  if (firstEnd < 0 || secondEnd < 0) {
    throw new Error(`${path} raw OBJECTIVE command is unterminated`);
  }
  const objectiveHex = [
    buffer.subarray(firstStart, firstEnd).toString("hex"),
    buffer.subarray(firstEnd + 2, secondEnd).toString("hex"),
  ];
  assertEqual(
    objectiveHex[0],
    K01_OBJECTIVE_PRIMARY_CP949_HEX,
    `${path} primary OBJECTIVE CP949 bytes`,
  );
  assertEqual(objectiveHex[1], "", `${path} secondary OBJECTIVE CP949 bytes`);
  return { sha256: digest, objectiveArgs, objectiveHex };
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

function verifyGdiImports(buffer, image) {
  const descriptorVa = 0x004b8f80;
  const descriptorOffset = requireRawOffset(image, descriptorVa);
  const descriptor = {
    originalFirstThunkRva: buffer.readUInt32LE(descriptorOffset),
    timeDateStamp: buffer.readUInt32LE(descriptorOffset + 4),
    forwarderChain: buffer.readUInt32LE(descriptorOffset + 8),
    nameRva: buffer.readUInt32LE(descriptorOffset + 12),
    firstThunkRva: buffer.readUInt32LE(descriptorOffset + 16),
  };
  assertEqual(
    JSON.stringify(descriptor),
    JSON.stringify({
      originalFirstThunkRva: 0x000b90a0,
      timeDateStamp: 0,
      forwarderChain: 0,
      nameRva: 0x000b9862,
      firstThunkRva: 0x000b7030,
    }),
    "GDI32 import descriptor",
  );
  const dllName = readCString(
    buffer,
    requireRawOffset(image, image.imageBase + descriptor.nameRva),
  );
  assertEqual(dllName, "GDI32.dll", "GDI import DLL name");

  return {
    dll: dllName,
    descriptorVa: toHex(descriptorVa),
    functions: IMPORTS.map((expected) => {
      const iatOffset = requireRawOffset(image, expected.iatVa);
      assertEqual(
        buffer.readUInt32LE(iatOffset),
        expected.hintNameVa - image.imageBase,
        `${expected.name} IAT hint/name RVA`,
      );
      const hintNameOffset = requireRawOffset(image, expected.hintNameVa);
      assertEqual(
        buffer.readUInt16LE(hintNameOffset),
        expected.hint,
        `${expected.name} import hint`,
      );
      const name = readCString(buffer, hintNameOffset + 2);
      assertEqual(name, expected.name, `${expected.name} import name`);
      return {
        name,
        iatVa: toHex(expected.iatVa),
        hintNameVa: toHex(expected.hintNameVa),
        hint: expected.hint,
      };
    }),
  };
}

function verifyReferenceSet(references, expected) {
  if (!Array.isArray(references.references)) {
    throw new TypeError("references.json must contain a references array");
  }
  const projection = references.references
    .filter((reference) => reference.to === expected.target)
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
    target: expected.target,
    count: projection.length,
    sha256: digest,
    references: projection,
  };
}

function splitOriginalChunks(bytes) {
  const chunks = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      if (index > start) {
        chunks.push(bytes.subarray(start, index));
      }
      return chunks;
    }
    if (bytes[index] === 0x20) {
      chunks.push(bytes.subarray(start, index + 1));
      start = index + 1;
    }
  }
  if (start < bytes.length) {
    chunks.push(bytes.subarray(start));
  }
  return chunks;
}

function validateCommonLayoutInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("objective text layout input must be an object");
  }
  if (
    typeof input.textCp949Hex !== "string" ||
    !/^(?:[0-9a-f]{2})*$/u.test(input.textCp949Hex)
  ) {
    throw new TypeError("textCp949Hex must be an even-length lowercase hexadecimal byte string");
  }
  assertSignedWord(input.requestedMaxWidth, "requestedMaxWidth");
  assertBoolean(
    input.surfaceClearLockSucceeded,
    "surfaceClearLockSucceeded",
  );
  assertBoolean(
    input.hdcAcquisitionSucceeded,
    "hdcAcquisitionSucceeded",
  );
}

function validateAcquiredHdcLayoutInput(input) {
  assertBoolean(input.fontSelectionSucceeded, "fontSelectionSucceeded");
  if (input.gdiMeasurementsSucceeded !== true) {
    throw new Error(
      "gdiMeasurementsSucceeded must be true: the original ignores GetTextExtentPoint32A failure and then consumes undefined stack SIZE fields, so failed measurements have no deterministic reproduction",
    );
  }
  if (
    !Number.isInteger(input.fullStringMeasuredHeight) ||
    input.fullStringMeasuredHeight < 0 ||
    input.fullStringMeasuredHeight > 0x5555
  ) {
    throw new RangeError(
      `fullStringMeasuredHeight must be the nonnegative GDI LONG SIZE.cy supplied by the full-string GetTextExtentPoint32A measurement, with a derived line height that fits a signed WORD; got ${String(input.fullStringMeasuredHeight)}`,
    );
  }
  if (
    !Array.isArray(input.chunkWidths) ||
    input.chunkWidths.some(
      (width) =>
        !Number.isInteger(width) || width < 0 || width > 0x7fffffff,
    )
  ) {
    throw new RangeError(
      "chunkWidths must contain only nonnegative signed 32-bit GDI LONG measurements",
    );
  }
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(
      `${label} must be a signed WORD value (-32768..32767); got ${String(value)}`,
    );
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean; got ${String(value)}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  const paths = new Map([
    ["--input", "input"],
    ["--k01-script", "k01Script"],
    ["--seeds", "seeds"],
    ["--functions", "functions"],
    ["--references", "references"],
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

function formatReport(report) {
  return [
    `question: ${report.selectedQuestion}`,
    `analysis: ${report.analysisStatus}`,
    `reproduction: ${report.reproductionStatus}`,
    `implementation: ${report.implementationDecision}`,
    `font: ${report.font.request.face}, height ${report.font.request.logicalHeight}, charset ${report.font.request.charSet}`,
    `width: requested ${report.renderer.requestedMaxWidth}, effective ${report.renderer.effectiveMaxWidth}`,
    `functions: ${report.seededFunctions.length + report.rawCodeRanges.length}`,
    `evidence points: ${report.evidencePoints.length}`,
    `imports: ${report.imports.dll} (${report.imports.functions.length})`,
    `reference sets: ${report.referenceSets.length}`,
  ].join("\n");
}
