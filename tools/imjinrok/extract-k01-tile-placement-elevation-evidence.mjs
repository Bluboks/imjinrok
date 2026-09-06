#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractK01SourceTileSelector } from "./extract-k01-source-tile-selector.mjs";
import { parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readVaRange, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_ORIGINAL_ROOT = resolve(repositoryRoot, "original/imjinrok2");
const DEFAULT_EXECUTABLE_PATH = resolve(DEFAULT_ORIGINAL_ROOT, "imjinrok2.exe");
const DEFAULT_MAP_PATH = resolve(DEFAULT_ORIGINAL_ROOT, "stagemap/k01.map");
const DEFAULT_FUNCTIONS_PATH = resolve(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const DEFAULT_REFERENCES_PATH = resolve(repositoryRoot, "analysis/generated/imjinrok2/references.json");

const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const EXPECTED_EXECUTABLE_SIZE = 843_833;
const EXPECTED_K01_MAP_SHA256 = "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb";
const EXPECTED_K01_MAP_SIZE = 1_097_100;
const EXPECTED_FUNCTIONS_SHA256 = "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

const X_STRIDE = 180;
const LOW_NIBBLE_OFFSET = 0x32514;
const OBJECT_OFFSET = 0x3a3a4;
const FRAME_OFFSET = 0x42234;
const FOG_FAMILY_OFFSET = 0x4a0c4;
const PLACEMENT_SELECTOR_OFFSET = 0x79824;
const PLACEMENT_LOOKUP_OFFSET = 0x51f54;
const PLACEMENT_SELECTOR_STRIDE = 0x7e90;
const RUNTIME_WORD_TABLE_ADDRESS = 0x00c06e86;
const RUNTIME_WORD_TABLE_STRIDE = 8;
const RUNTIME_WORD_TABLE_INITIALIZATION_END = 0x00c06efe;

const RAW_CODE_RANGES = [
  ["FUN_00462b80 runtime WORD-table initializer", 0x00462b80, 0x00462bab, "16eccbef8061d2dee5635288d64af3c85535cfb5d96c67347ae1d59ad4b0dc1c"],
  ["FUN_00466f20 source full-map raster loop", 0x00466f20, 0x004676e0, "bafebb7ea1dd47236aaac78fdb969ea463fbf667224fa49e4fdb88dad27c8dfc"],
  ["FUN_00464cc0 complete body", 0x00464cc0, 0x00464dde, "40b41b7ce95c3e7516c0bf2f6d01f1e86bf2848ed0ec5256f63d7858f55a1d10"],
  ["FUN_00464ea0 complete body", 0x00464ea0, 0x00465002, "c80b1952885965178d3093b88d8963de89f43c2c49a6ba414d46847d9e1fba0d"],
  ["FUN_00469330 complete body", 0x00469330, 0x0046950c, "f1a131328d7fe0c85e26b90d4c7d28371f6f9ae41bd56f03dab68c9ab8510ec7"],
  ["FUN_00469510 complete body", 0x00469510, 0x00469917, "1d05579e1c2179989bd1441cb54510de8df4ecb24157dac496fda7f3c6c8f9ce"],
  ["FUN_0046d650 complete body", 0x0046d650, 0x0046d6d8, "bb8e887ed7cd73e5f881f75c033532c60aa7a9f66c5dd755f9e1a05cc12b7e8a"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE_POINTS = [
  [0x00462b80, "b8 86 6e c0 00 33 c9 33 d2 3d 8e 6e c0 00 0f 9d c2 4a", "FUN_00462b80 starts EAX at DAT_00c06e86, clears ECX/EDX, and makes the first-family versus subsequent-family value decision."],
  [0x00462b92, "66 89 48 fe 83 e2 f7 83 c0 08 83 c2 09 3d fe 6e c0 00 66 89 50 f8 7c dd c3", "FUN_00462b80 writes a zero WORD at EAX-2, advances by the exact 8-byte stride, writes DX at EAX-8, and loops while post-increment EAX is below 0x00c06efe."],
  [0x00466f20, "83 ec 30 53 55 56 8b f1 57 8b 9e a4 2d 00 00 8b ae a0 2d 00 00 c1 e3 05 81 c3 c8 00 00 00 c1 e5", "FUN_00466f20 derives width*32+200 source-raster dimensions from map width/height."],
  [0x0046703f, "8b c5 99 2b c2 8b d0 d1 fa 89 54 24 1c 33 c0 eb 04 8b 54 24 1c 0f bf 4c 24 10 8b f8 2b f9 8d 2c 08 c1 e7 05 c1 e5 04 03 fa 81 c5 c8 00 00 00", "FUN_00466f20 inner body forms x/y isometric screen coordinates and the +200 vertical origin before its draw dispatch."],
  [0x00467160, "e8 ab 23 00 00", "FUN_00466f20 calls FUN_00469510 after pushing its bounded screen and cell arguments."],
  [0x00464cc6, "8b 4c 24 14 66 85 c9 7c 23 8b 87 a0 2d 00 00 0f bf f1 3b f0 7d 16 8b 44 24 18 66 85 c0 7c 0d", "FUN_00464cc0 reads signed-word x/y stack arguments and rejects negative or map-boundary coordinates."],
  [0x00464d00, "e8 4b 89 00 00 8d 84 b6 e9 20 00 00 8b 6c 24 24 33 d2 8d 04 c0 8d 0c 83 8b c6 2b c3 8a 14 39", "FUN_00464cc0 calls FUN_0046d650 and reads map +0x4a0c4+x*180+y as the runtime WORD-table index."],
  [0x00464d27, "8d 14 33 c1 e0 05 c1 e2 04 89 01 89 55 00", "FUN_00464cc0 writes (x-y)<<5 and (x+y)<<4 before the relative component."],
  [0x00464d52, "8a 14 39 80 e2 0f 66 0f be c2 66 3d 02 00", "FUN_00464cc0 reads map +0x32514+x*180+y low nibble and compares exactly 2."],
  [0x00464d6a, "50 51 8b cf e8 dd 88 00 00 0f bf d0 8b 44 24 10 c1 e2 04 0f bf 0c c5 86 6e c0 00", "FUN_00464cc0 low-nibble-2 branch calls FUN_0046d650 and combines helper<<4 with a signed WORD table value."],
  [0x00464da7, "52 50 8b cf e8 a0 88 00 00 8b 4c 24 10 0f bf c0 99 33 c2 2b c2 0f bf 14 cd 86 6e c0 00 c1 e0 04", "FUN_00464cc0 other branch calls FUN_0046d650 and combines abs(helper)<<4 with the same signed WORD table."],
  [0x00464f99, "8b 54 24 14 53 52 8b ce e8 aa 86 00 00 8b 4c 24 18 5f c1 e0 04 66 8b 14 cd 86 6e c0 00 5e 66 2b d0 b8 01 00 00 00 83 c2 10 66 01 55 00", "FUN_00464ea0 low-nibble-2 branch reads int16(DAT_00c06e86 + family*8), subtracts helper<<4, adds 16, and adds the result to its output WORD."],
  [0x00464fcb, "8b 44 24 14 53 50 8b ce e8 78 86 00 00 0f bf c0 8b 4c 24 18 5f 99 33 c2 5e 2b c2 66 8b 14 cd 86 6e c0 00 c1 e0 04 66 2b d0 b8 01 00 00 00 66 01 55 00", "FUN_00464ea0 other branch reads the same table WORD, subtracts abs(helper)<<4, and adds the result to its output WORD."],
  [0x00469351, "8b 8e a0 2d 00 00 0f bf c7 3b c1 7d 47 66 85 ed 7c 42 8b 96 a4 2d 00 00 0f bf cd 3b ca 7d 35", "FUN_00469330 signed x/y bounds against map +0x2da0/+0x2da4"],
  [0x00469370, "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 80 e1 0f 66 0f be c1 66 3d 02 00", "FUN_00469330 reads low nibble at map +0x32514+x*180+y and compares exactly 2"],
  [0x0046938d, "55 57 8b ce e8 ba 42 00 00 8b 5c 24 28 c1 e0 04 2b d8", "FUN_00469330 true branch calls helper(map,x,y) then subtracts helper<<4 from argument 2"],
  [0x004693a5, "55 57 8b ce e8 a2 42 00 00 0f bf c0 99 33 c2 2b c2 40 c1 e0 04", "FUN_00469330 other branch subtracts (abs(int16(helper))+1)<<4 from argument 2"],
  [0x0046952c, "66 85 ff 89 44 24 38 7c 52 8b 8e a0 2d 00 00 0f bf c7 3b c1 7d 45 66 85 ed 7c 40 8b 96 a4 2d 00 00 0f bf cd", "FUN_00469510 signed x/y bounds before the low-nibble decision"],
  [0x00469554, "8d 84 80 5d 16 00 00 8d 14 c0 8d 04 91 8a 0c 30 80 e1 0f 66 0f be c1 66 3d 02 00", "FUN_00469510 reads low nibble at map +0x32514+x*180+y and compares exactly 2"],
  [0x00469571, "55 57 8b ce e8 d6 40 00 00 c1 e0 04 8b d0 8b 44 24 3c 2b c2", "FUN_00469510 true branch calls helper(map,x,y) then subtracts helper<<4 from argument 2"],
  [0x00469587, "55 57 8b ce e8 c0 40 00 00 0f bf c0 99 33 c2 2b c2 40 c1 e0 04", "FUN_00469510 other branch subtracts (abs(int16(helper))+1)<<4 from argument 2"],
  [0x004695ab, "8d 84 9b e1 19 00 00 0f bf cd 8d 14 c0 89 4c 24 18 8d 04 91 66 0f b6 14 30", "FUN_00469510 object byte at map +0x3a3a4+x*180+y"],
  [0x004695c4, "8d 84 9b 65 1d 00 00 0f bf fa 8d 04 c0", "FUN_00469510 frame byte address begins at map +0x42234+x*180+y"],
  [0x004695e2, "66 0f b6 04 31 8d 34 7f", "FUN_00469510 reads the unsigned frame byte and scales the selected loader record"],
  [0x0046d650, "66 8b 44 24 04 53 66 85 c0 57 7c 20 0f bf d0 3b 91 a0 2d 00 00 7d 15 66 8b 44 24 10 66 85 c0 7c 0b 0f bf f8 3b b9 a4 2d 00 00 7c 09", "FUN_0046d650 reads signed-word x from stack argument 1 and y from argument 2, returning -1 outside map bounds"],
  [0x0046d685, "8d 84 92 01 36 00 00 56 8d 04 c0 8d 04 87 8a 1c 08", "FUN_0046d650 reads uint8 selector at map +0x79824+x*180+y"],
  [0x0046d696, "8b c3 25 ff 00 00 00 8d 34 80 8d 34 f6 8d 94 b2 49 07 00 00 5e 8d 14 92 8d 14 d2 8d 14 97 8a 0c 0a", "FUN_0046d650 scales the selector by 180*180 and reads lookup at map +0x51f54+selector*0x7e90+x*180+y; the final lea edx,[edi+edx*4] is part of this address calculation"],
  [0x0046d6b7, "80 f9 0f 75 0a 66 33 c0 5f 8a c3 5b c2 08 00 84 c9 74 06 5f 48 5b c2 08 00", "FUN_0046d650 returns selector for lookup 15, selector-1 for other nonzero lookup, otherwise 0"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const FUNCTION_SPECS = [
  { entry: "0x00462b80", bodyRange: "0x00462b80-0x00462baa", bodySize: 43, instructionCount: 14, instructionSha256: "9253551c353dca1e9d1c02a0c3e876ead38d1e7546150087e9062f832e914b1f", callees: [] },
  { entry: "0x00466f20", bodyRange: "0x00466f20-0x004676df", bodySize: 1984, instructionCount: 574, instructionSha256: "b37afc8a5141d906b4b83b08c76ecdc87bdfe43a8f1b9a9a17c4fe095d434e75", callees: ["0x00413fb0", "0x0041d420", "0x0041fdb0", "0x00438aa0", "0x0044aaf0", "0x0044ae80", "0x0044aef0", "0x00469000", "0x00469180", "0x00469510", "0x00469920", "0x00469a50", "0x00469df0", "0x0046a190", "0x004ad7e0", "0x004adcb6"] },
  { entry: "0x00464cc0", bodyRange: "0x00464cc0-0x00464ddd", bodySize: 286, instructionCount: 103, instructionSha256: "0df728460a1833f756c0164f3968eda5de7312a64e87c52edc98aa5a33566781", callees: ["0x0046d650"] },
  { entry: "0x00464ea0", bodyRange: "0x00464ea0-0x00465001", bodySize: 354, instructionCount: 119, instructionSha256: "994b5e5c35e8ed66626f303d725cdf69847adbedd526e645ce2c0c086ea3b946", callees: ["0x0046d650"] },
  { entry: "0x00469330", bodyRange: "0x00469330-0x0046950b", bodySize: 476, instructionCount: 150, instructionSha256: "f94f79c8a00da772f524665f0df56ba09b9bea8a861bd67d99fec4c7b30ec099", callees: ["0x0044af50", "0x0044afa0", "0x00454390", "0x0046d650"] },
  { entry: "0x00469510", bodyRange: "0x00469510-0x00469916", bodySize: 1031, instructionCount: 341, instructionSha256: "28849833f557b0f4863c88318828d72b8039639450bd42b5623927dd8ef036e3", callees: ["0x0044af50", "0x0044afa0", "0x00454250", "0x004542e0", "0x004547c0", "0x00454960", "0x0046d650"] },
  { entry: "0x0046d650", bodyRange: "0x0046d650-0x0046d6d7", bodySize: 136, instructionCount: 50, instructionSha256: "c0ee5121eb2700198c121447334f0b7572d28dce08e9e971020293233036d385", callees: [] },
];

const REQUIRED_CALL_EDGES = [
  ["0x00464d00", "0x00464cc0"], ["0x00464d6e", "0x00464cc0"], ["0x00464dab", "0x00464cc0"],
  ["0x00469391", "0x00469330", "0x0046d650"], ["0x004693a9", "0x00469330", "0x0046d650"], ["0x00469575", "0x00469510", "0x0046d650"], ["0x0046958b", "0x00469510", "0x0046d650"],
  ["0x00467160", "0x00466f20", "0x00469510"],
];

const RUNTIME_WORD_TABLE_DIRECT_REFERENCES = [
  ["0x00462b80", "0x00462b80", "DATA", "ANALYSIS", 1],
  ["0x00462ba4", "0x00462b80", "WRITE", "ANALYSIS", 0],
  ["0x00464d7d", "0x00464cc0", "DATA", "ANALYSIS", 1],
  ["0x00464dbc", "0x00464cc0", "DATA", "ANALYSIS", 1],
  ["0x00464fae", "0x00464ea0", "DATA", "ANALYSIS", 1],
  ["0x00464fe6", "0x00464ea0", "DATA", "ANALYSIS", 1],
];

export function extractK01TilePlacementElevationEvidence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  mapPath = DEFAULT_MAP_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  originalRoot = DEFAULT_ORIGINAL_ROOT,
} = {}) {
  const { buffer: executable, image } = readPeImage(executablePath);
  assertEqual(executable.length, EXPECTED_EXECUTABLE_SIZE, `${executablePath} size`);
  assertEqual(sha256(executable), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const map = readFileSync(mapPath);
  assertEqual(map.length, EXPECTED_K01_MAP_SIZE, `${mapPath} size`);
  assertEqual(sha256(map), EXPECTED_K01_MAP_SHA256, `${mapPath} SHA-256`);
  const header = parseMapHeader(map, mapPath);
  assertEqual(header.width, 60, "K01 width at map +0x2da0");
  assertEqual(header.height, 60, "K01 height at map +0x2da4");

  const staticAnalysis = verifyStaticAnalysis({ executable, image, functionsPath, referencesPath });
  const sourceSelector = extractK01SourceTileSelector({ executablePath, mapPath, originalRoot });
  const cells = collectCells(map, header);
  const lowNibbleCounts = countBy(cells, "lowNibble");
  const selectorCounts = countBy(cells, "placementSelector");
  const lookupCounts = countBy(cells, "placementLookup");
  const helperReturnCounts = countBy(cells, "placementLevel");
  const branchCounts = countBy(cells, "placementBranch");
  const shiftCounts = countBy(cells, "verticalShift");
  const placementLookupStreamSha256 = sha256(Buffer.from(cells.map((cell) => cell.placementLookup)));
  const helperReturnStreamSha256 = sha256(Buffer.from(cells.map((cell) => cell.placementLevel & 0xff)));
  const fogFamilyCounts = countBy(cells.map((cell) => ({ fogFamily: map[FOG_FAMILY_OFFSET + cell.storageOffset] })), "fogFamily");
  const runtimeWordTableInitialization = replayFUN00462b80RuntimeWordTableInitialization();

  return {
    question: "For hash-bound K01 cells, how do FUN_00462b80, FUN_00464cc0/FUN_00464ea0, FUN_00469330/FUN_00469510, and FUN_0046d650 derive bounded runtime WORD adjustments, isometric components, and source object/frame bytes?",
    analysisStatus: "static-confirmed-for-bounded-K01-cell-projection-relative-component-and-source-object-frame-boundary",
    reproductionStatus: "reproduction-complete-for-all-K01-cell-vectors-and-fail-closed-reference-inputs",
    implementationStatus: "source-backed-product-elevation-adaptation-is-separate-from-original-renderer-parity",
    sources: {
      executable: sourceDescriptor(executablePath, executable),
      map: sourceDescriptor(mapPath, map),
      staticAnalysis,
      sourceTileSelector: {
        fixture: "analysis/fixtures/k01-source-tile-selector.json",
        pairStream: sourceSelector.pairStream,
        usedObjectCount: sourceSelector.objects.length,
        allK01ObjectFramesWithinValidatedSourceHeaders: sourceSelector.objects.every((object) => object.frameRange.max < object.frameCount),
      },
    },
    map: {
      dimensions: { width: header.width, height: header.height },
      coordinateContract: "x and y are signed 16-bit stack arguments; valid K01 cells are 0 <= x < width and 0 <= y < height.",
      storageOrder: "x-major address calculation: x * 180 + y",
      fields: {
        lowNibble: "uint8(map + 0x32514 + x * 180 + y) & 0x0f",
        placementSelector: "uint8(map + 0x79824 + x * 180 + y)",
        placementLookup: "uint8(map + 0x51f54 + placementSelector * 0x7e90 + x * 180 + y)",
        objectIndex: "uint8(map + 0x3a3a4 + x * 180 + y)",
        frameIndex: "uint8(map + 0x42234 + x * 180 + y)",
      },
    },
    placement: {
      helper: {
        function: "FUN_0046d650",
        returnRule: "out-of-bounds => int16(-1); lookup == 15 => uint8(selector); lookup != 0 => int16(uint8(selector) - 1); otherwise => 0",
        neutralName: "placement-level selector",
        K01Distribution: {
          placementSelector: selectorCounts,
          placementLookup: lookupCounts,
          placementLevel: helperReturnCounts,
          placementLookupStreamSha256,
          placementLevelStreamSha256: helperReturnStreamSha256,
        },
      },
      lowNibbleBranch: {
        trueCondition: "in-bounds && lowNibble == 2",
        trueAdjustment: "verticalArgument2 - (int16(helperReturn) << 4)",
        otherAdjustment: "verticalArgument2 - ((abs(int16(helperReturn)) + 1) << 4)",
        K01Distribution: { lowNibble: lowNibbleCounts, branch: branchCounts, verticalShift: shiftCounts },
      },
      functionLocalFixedSubtract: {
        FUN_00469330: "argument1 - 31 (0x1f)",
        FUN_00469510: "argument1 - 32 (0x20)",
        boundary: "The raw argument names and screen/world axis meaning are not assigned by this evidence.",
      },
      syntheticHelperBranchVectors: [
        { selector: 4, lookup: 15, result: 4 },
        { selector: 4, lookup: 1, result: 3 },
        { selector: 0, lookup: 1, result: -1 },
        { selector: 4, lookup: 0, result: 0 },
        { selector: 4, lookup: null, result: -1, boundary: "out-of-bounds helper return" },
      ],
    },
    runtimeWordAdjustmentTable: {
      neutralName: "runtime WORD adjustment table",
      address: toHex(RUNTIME_WORD_TABLE_ADDRESS),
      wordStrideBytes: RUNTIME_WORD_TABLE_STRIDE,
      initialization: runtimeWordTableInitialization,
      readerContract: {
        directReaders: ["FUN_00464cc0", "FUN_00464ea0"],
        familyIndex: "uint8(map + 0x4a0c4 + x * 180 + y)",
        tableRead: "int16(DAT_00c06e86 + family * 8)",
        lowNibbleEquals2: "outputY += tableWord + 16 - (int16(helperReturn) << 4)",
        otherLowNibble: "outputY += tableWord - (abs(int16(helperReturn)) << 4)",
        K01FogFamilyDistribution: fogFamilyCounts,
        boundary: "The initializer writes families 0..14. This direct-reference slice does not establish another writer, runtime ordering, alias/computed writers, or the table's human meaning.",
      },
    },
    sourceRaster: {
      function: "FUN_00466f20",
      dimensions: "surfaceWidth = map.width * 64; surfaceHeight = map.height * 32 + 200",
      drawOrder: "y outer, x inner",
      baseScreenPoint: "screenX = (x - y) * 32 + map.width * 32; screenY = (x + y) * 16 + 200",
      dispatch: "FUN_00469510(argument1=screenX, argument2=screenY, argument3=x, argument4=y)",
      drawRectangle: "drawLeft = argument1 - 32; drawTop = argument2 - verticalShift, where verticalShift follows the branch formulas above",
      boundary: "This bounded full-map raster establishes draw order and rectangle arithmetic, not broader pivot, clip/mode, palette, or renderer parity semantics.",
    },
    cellProjection: {
      function: "FUN_00464cc0",
      admission: "signed x/y in bounds => 1 after writing output coordinates; negative or x >= map.width or y >= map.height => 0 without output writes.",
      baseOutput: { x: "(int32(x) - int32(y)) << 5", y: "(int32(x) + int32(y)) << 4" },
      mapByte: "uint8(map + 0x4a0c4 + x * 180 + y); this address is the fog-family byte in FUN_0046a530 and indexes the neutral runtime WORD adjustment table.",
      runtimeWordTable: "int16(DAT_00c06e86 + mapByte * 8)",
      lowNibbleRelativeComponent: {
        lowNibbleEquals2: "tableWord + 16 - (int16(FUN_0046d650(map, x, y)) << 4)",
        other: "tableWord - (abs(int16(FUN_0046d650(map, x, y))) << 4)",
        boundary: "The table and raw-coordinate axis are not named as height/elevation. K01 helper lookup and return streams are reproduced from the full selector-indexed map region; the source-backed product adapter must preserve the resulting raw shift without assigning a physical terrain-height meaning.",
      },
      K01Distribution: {
        helperLookup: lookupCounts,
        helperReturn: helperReturnCounts,
        helperLookupStreamSha256: placementLookupStreamSha256,
        helperReturnStreamSha256,
        sourceBackedRawRelativeComponent: summarizeRawRelativeComponent(cells),
      },
    },
    cellStream: summarizeCells(cells, header),
    representativeCells: [[0, 0], [0, 1], [0, 59], [59, 0], [59, 59]].map(([x, y]) => cells.find((cell) => cell.x === x && cell.y === y)),
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(executable, image, range)),
    evidencePoints: EVIDENCE_POINTS.map((point) => verifyEvidencePoint(executable, image, point)),
    unresolvedBoundary: "The corrected K01 lookup and helper streams are a bounded map-data observation, not a proof that the helper is terrain elevation or height. FUN_00462b80's direct initialization writes recovered values for K01's observed families 0..14, but direct references alone do not exclude alias/computed writers or establish lifetime/order/semantics. It does not establish screen/world axis semantics, pixel anchor/pivot, human terrain/passability/fog meaning, other map/theme behavior, or product renderer parity.",
  };
}

export function reproduceK01PlacementHelper(mapBuffer, x, y) {
  assertMapBuffer(mapBuffer);
  assertSignedWord(x, "x");
  assertSignedWord(y, "y");
  const header = parseMapHeader(mapBuffer, "K01 map buffer");
  if (!isInBounds(header, x, y)) return -1;
  const storageOffset = x * X_STRIDE + y;
  const selector = mapBuffer[PLACEMENT_SELECTOR_OFFSET + storageOffset];
  const lookup = mapBuffer[replayFUN0046d650LookupAddress({ selector, x, y })];
  return reproducePlacementLevel(selector, lookup);
}

/**
 * Replays the address arithmetic instruction-by-instruction from
 * FUN_0046d650. Keeping the intermediate values visible prevents the
 * selector lookup from silently regressing to the old quarter-sized stride.
 */
export function replayFUN0046d650LookupAddress({ selector, x, y } = {}) {
  assertUint8(selector, "selector");
  assertSignedWord(x, "x");
  assertSignedWord(y, "y");
  const selectorMapOffset = (((x + x * 4 + 0x3601) * 9) * 4) + y;
  const selectorMapOffsetExpected = 0x79824 + x * X_STRIDE + y;
  if (selectorMapOffset !== selectorMapOffsetExpected) throw new Error("FUN_0046d650 selector address replay mismatch");
  const selectorScaled = selector * 5;
  const selectorScaledByNine = selectorScaled * 9;
  const lookupOffset = ((x + selectorScaledByNine * 4 + 0x749) * 5 * 9 * 4) + y;
  const canonicalOffset = PLACEMENT_LOOKUP_OFFSET + selector * PLACEMENT_SELECTOR_STRIDE + x * X_STRIDE + y;
  if (lookupOffset !== canonicalOffset) throw new Error("FUN_0046d650 lookup address replay mismatch");
  return lookupOffset;
}

/**
 * Replays only the integer/register arithmetic in the hash-bound
 * FUN_00462b80 byte range. The EAX-2 writes are retained because they are
 * observable WORD writes adjacent to the indexed table, not silently folded
 * into its entries.
 */
export function replayFUN00462b80RuntimeWordTableInitialization() {
  let eax = RUNTIME_WORD_TABLE_ADDRESS;
  let edx = 0;
  const adjacentZeroWordOffsets = [];
  const entries = [];
  do {
    edx = (edx & ~0xff) | (eax >= RUNTIME_WORD_TABLE_ADDRESS + RUNTIME_WORD_TABLE_STRIDE ? 1 : 0);
    edx = (edx - 1) | 0;
    adjacentZeroWordOffsets.push(eax - RUNTIME_WORD_TABLE_ADDRESS - 2);
    edx &= ~0x8;
    eax += RUNTIME_WORD_TABLE_STRIDE;
    edx = (edx + 9) | 0;
    entries.push({ family: (eax - RUNTIME_WORD_TABLE_ADDRESS) / RUNTIME_WORD_TABLE_STRIDE - 1, wordOffset: eax - RUNTIME_WORD_TABLE_ADDRESS - RUNTIME_WORD_TABLE_STRIDE, value: edx & 0xffff });
  } while (eax < RUNTIME_WORD_TABLE_INITIALIZATION_END);
  return {
    function: "FUN_00462b80",
    loop: "EAX starts at DAT_00c06e86; each iteration writes zero at EAX-2, advances EAX by 8, writes DX at EAX-8, and continues while post-increment EAX < 0x00c06efe.",
    indexedFamilyDomain: { first: entries[0].family, last: entries.at(-1).family, count: entries.length },
    indexedWordWrites: entries,
    adjacentZeroWordWrites: { count: adjacentZeroWordOffsets.length, firstWordOffset: adjacentZeroWordOffsets[0], lastWordOffset: adjacentZeroWordOffsets.at(-1), strideBytes: RUNTIME_WORD_TABLE_STRIDE, value: 0 },
  };
}

/**
 * Bounded reference for the shared reader arithmetic. It intentionally accepts
 * only the table domain initialized by FUN_00462b80; the raw readers have no
 * equivalent byte-domain proof in this evidence slice.
 */
export function reproduceRuntimeWordTableOutputYAdjustment(wordValues, { family, lowNibble, helperReturn } = {}) {
  assertInitializedRuntimeWordValues(wordValues);
  assertUint8(family, "family");
  if (family >= wordValues.length) throw new RangeError(`family ${family} is outside the FUN_00462b80 initialized table domain`);
  if (!Number.isInteger(lowNibble) || lowNibble < 0 || lowNibble > 0x0f) throw new TypeError("lowNibble must be a nibble");
  assertSignedWord(helperReturn, "helperReturn");
  const tableWord = wordValues[family];
  const relativeComponent = lowNibble === 2
    ? 16 - (helperReturn << 4)
    : -(Math.abs(helperReturn) << 4);
  return { family, lowNibble, helperReturn, tableWord, relativeComponent, outputYAdjustment: tableWord + relativeComponent };
}

export function reproducePlacementLevel(selector, lookup) {
  assertUint8(selector, "selector");
  if (lookup === null) return -1;
  assertUint8(lookup, "lookup");
  if (lookup === 15) return selector;
  if (lookup !== 0) return selector - 1;
  return 0;
}

export function reproduceFUN00469510Placement(mapBuffer, { argument1, verticalArgument2, x, y } = {}) {
  assertMapBuffer(mapBuffer);
  assertSignedInt32(argument1, "argument1");
  assertSignedInt32(verticalArgument2, "verticalArgument2");
  assertSignedWord(x, "x");
  assertSignedWord(y, "y");
  const header = parseMapHeader(mapBuffer, "K01 map buffer");
  if (!isInBounds(header, x, y)) {
    throw new RangeError(`FUN_00469510 source object/frame access is unsafe outside map bounds: ${x},${y}`);
  }
  const storageOffset = x * X_STRIDE + y;
  const lowNibble = mapBuffer[LOW_NIBBLE_OFFSET + storageOffset] & 0x0f;
  const placementLevel = reproduceK01PlacementHelper(mapBuffer, x, y);
  const placementBranch = lowNibble === 2 ? "low-nibble-equals-2" : "other-low-nibble";
  const verticalShift = placementBranch === "low-nibble-equals-2" ? placementLevel << 4 : (Math.abs(placementLevel) + 1) << 4;
  return {
    x,
    y,
    storageOffset,
    lowNibble,
    placementSelector: mapBuffer[PLACEMENT_SELECTOR_OFFSET + storageOffset],
    placementLookup: mapBuffer[replayFUN0046d650LookupAddress({ selector: mapBuffer[PLACEMENT_SELECTOR_OFFSET + storageOffset], x, y })],
    placementLevel,
    placementBranch,
    verticalShift,
    argument1AfterFixedSubtract: (argument1 - 32) | 0,
    adjustedVerticalArgument2: (verticalArgument2 - verticalShift) | 0,
    objectIndex: mapBuffer[OBJECT_OFFSET + storageOffset],
    frameIndex: mapBuffer[FRAME_OFFSET + storageOffset],
  };
}

/**
 * Independent bounded reference for FUN_00464cc0. The runtime table is an
 * explicit signed-word input because its values and semantic owner are not
 * statically established by this slice.
 */
export function reproduceFUN00464cc0Projection(mapBuffer, { x, y, runtimeWord = 0 } = {}) {
  assertMapBuffer(mapBuffer);
  assertSignedWord(x, "x");
  assertSignedWord(y, "y");
  assertSignedWord(runtimeWord, "runtimeWord");
  const header = parseMapHeader(mapBuffer, "K01 map buffer");
  if (!isInBounds(header, x, y)) return { admitted: false };

  const storageOffset = x * X_STRIDE + y;
  const fogFamily = mapBuffer[FOG_FAMILY_OFFSET + storageOffset];
  const lowNibble = mapBuffer[LOW_NIBBLE_OFFSET + storageOffset] & 0x0f;
  const placementLevel = reproduceK01PlacementHelper(mapBuffer, x, y);
  const rawRelativeComponent = lowNibble === 2
    ? 16 - (placementLevel << 4)
    : -(Math.abs(placementLevel) << 4);
  const relativeComponent = rawRelativeComponent === 0 ? 0 : rawRelativeComponent;
  return {
    admitted: true,
    x,
    y,
    fogFamily,
    lowNibble,
    placementLevel,
    outputX: (x - y) << 5,
    outputY: ((x + y) << 4) + runtimeWord + relativeComponent,
    relativeComponent,
  };
}

function collectCells(map, header) {
  const cells = [];
  for (let x = 0; x < header.width; x += 1) {
    for (let y = 0; y < header.height; y += 1) {
      const placement = reproduceFUN00469510Placement(map, { argument1: 0, verticalArgument2: 0, x, y });
      const { argument1AfterFixedSubtract, adjustedVerticalArgument2, ...cell } = placement;
      cells.push(cell);
    }
  }
  return cells;
}

function summarizeCells(cells, header) {
  const bytes = Buffer.from(cells.flatMap((cell) => [
    cell.lowNibble,
    cell.placementSelector,
    cell.placementLookup,
    cell.placementLevel & 0xff,
    cell.placementBranch === "low-nibble-equals-2" ? 1 : 0,
    cell.verticalShift,
    cell.objectIndex,
    cell.frameIndex,
  ]));
  return {
    coordinateOrder: "x-major: ordinal = x * height + y",
    count: cells.length,
    bytesPerCell: 8,
    sha256: sha256(bytes),
    fieldByteOrder: ["lowNibble", "placementSelector", "placementLookup", "placementLevelInt16LowByte", "lowNibbleEquals2", "verticalShift", "objectIndex", "frameIndex"],
    dimensions: { width: header.width, height: header.height },
  };
}

function summarizeRawRelativeComponent(cells) {
  const bytes = Buffer.from(cells.map((cell) => cell.verticalShift));
  return {
    coordinateOrder: "x-major: ordinal = x * height + y",
    count: bytes.length,
    values: Object.fromEntries([...new Set(bytes)].sort((left, right) => left - right).map((value) => [value, bytes.filter((candidate) => candidate === value).length])),
    sha256: sha256(bytes),
    interpretation: "FUN_00469510 K01 raw source-raster vertical shift retained as original relative placement data; not a physical terrain-height claim.",
  };
}

function verifyStaticAnalysis({ executable, image, functionsPath, referencesPath }) {
  const functionsSource = readVerifiedJson(functionsPath, "static functions", EXPECTED_FUNCTIONS_SHA256);
  const referencesSource = readVerifiedJson(referencesPath, "static references", EXPECTED_REFERENCES_SHA256);
  const functions = functionsSource.parsed.functions;
  const references = referencesSource.parsed.references;
  if (!Array.isArray(functions) || !Array.isArray(references)) throw new Error("Static analysis payload lacks functions or references arrays");
  const functionProvenance = FUNCTION_SPECS.map((specification) => {
    const record = functions.find((candidate) => candidate.entry === specification.entry);
    if (!record || record.bodySize !== specification.bodySize || record.instructionCount !== specification.instructionCount || record.instructionSha256 !== specification.instructionSha256 || JSON.stringify(record.bodyRanges) !== JSON.stringify([specification.bodyRange]) || JSON.stringify(record.callees) !== JSON.stringify(specification.callees)) {
      throw new Error(`Static function provenance mismatch for ${specification.entry}`);
    }
    const start = Number.parseInt(specification.entry, 16);
    const endExclusive = start + specification.bodySize;
    return { entry: specification.entry, bodyRange: specification.bodyRange, instructionCount: specification.instructionCount, instructionSha256: specification.instructionSha256, rawBodySha256: sha256(readVaRange(executable, image, start, endExclusive)), callees: record.callees };
  });
  const requiredCallEdges = REQUIRED_CALL_EDGES.map(([from, fromFunctionEntry, to = "0x0046d650"]) => {
    const matches = references.filter((reference) => reference.from === from && reference.fromFunctionEntry === fromFunctionEntry && reference.to === to && reference.type === "UNCONDITIONAL_CALL");
    if (matches.length !== 1) throw new Error(`Expected exactly one required call edge ${fromFunctionEntry}:${from}->${to}, got ${matches.length}`);
    const reference = matches[0];
    if (reference.source !== "DEFAULT" || reference.operandIndex !== 0 || reference.primary !== true || reference.fromBlock !== ".text" || reference.toBlock !== ".text") throw new Error(`Static call provenance mismatch at ${from}`);
    return { from, fromFunctionEntry, to, type: "UNCONDITIONAL_CALL" };
  });
  const directRuntimeWordTableReferences = references.filter((reference) => reference.to === "0x00c06e86");
  if (directRuntimeWordTableReferences.length !== RUNTIME_WORD_TABLE_DIRECT_REFERENCES.length) {
    throw new Error(`Expected exactly ${RUNTIME_WORD_TABLE_DIRECT_REFERENCES.length} direct DAT_00c06e86 references, got ${directRuntimeWordTableReferences.length}`);
  }
  const runtimeWordTableDirectReferenceInventory = RUNTIME_WORD_TABLE_DIRECT_REFERENCES.map(([from, fromFunctionEntry, type, source, operandIndex]) => {
    const matches = directRuntimeWordTableReferences.filter((reference) => reference.from === from && reference.fromFunctionEntry === fromFunctionEntry && reference.type === type && reference.source === source && reference.operandIndex === operandIndex && reference.primary === true && reference.fromBlock === ".text" && reference.toBlock === ".data" && reference.toSymbol === "DAT_00c06e86");
    if (matches.length !== 1) throw new Error(`Static DAT_00c06e86 direct-reference provenance mismatch at ${from}`);
    return { from, fromFunctionEntry, type, source, operandIndex, primary: true, fromBlock: ".text", toBlock: ".data", toSymbol: "DAT_00c06e86" };
  });
  return {
    functions: { ...sourceDescriptor(functionsPath, functionsSource.buffer), sourceSha256: functionsSource.parsed.sourceSha256, functionProvenance },
    references: {
      ...sourceDescriptor(referencesPath, referencesSource.buffer),
      sourceSha256: referencesSource.parsed.sourceSha256,
      requiredCallEdges,
      runtimeWordTableDirectReferenceInventory,
    },
  };
}

function readVerifiedJson(path, label, expectedSha256) {
  const buffer = readFileSync(path);
  assertEqual(sha256(buffer), expectedSha256, `${label} SHA-256`);
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error.message}`, { cause: error });
  }
  assertEqual(parsed.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${label} source SHA-256`);
  return { buffer, parsed };
}

function sourceDescriptor(path, buffer) {
  return { path: relative(repositoryRoot, path), size: buffer.length, sha256: sha256(buffer) };
}

function countBy(cells, key) {
  const counts = new Map();
  for (const cell of cells) counts.set(cell[key], (counts.get(cell[key]) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => Number(left) - Number(right)).map(([value, count]) => [String(value), count]));
}

function assertMapBuffer(mapBuffer) {
  if (!Buffer.isBuffer(mapBuffer)) throw new TypeError("mapBuffer must be a Buffer");
  const requiredLength = Math.max(FRAME_OFFSET, FOG_FAMILY_OFFSET) + X_STRIDE * 60;
  if (mapBuffer.length < requiredLength) throw new RangeError("mapBuffer is too short for K01 placement, object/frame, and fog-family fields");
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new TypeError(`${label} must be a signed 16-bit integer`);
}

function assertSignedInt32(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) throw new TypeError(`${label} must be a signed 32-bit integer`);
}

function assertInitializedRuntimeWordValues(wordValues) {
  if (!Array.isArray(wordValues)) throw new TypeError("wordValues must be an array");
  const expectedCount = replayFUN00462b80RuntimeWordTableInitialization().indexedFamilyDomain.count;
  if (wordValues.length !== expectedCount) throw new RangeError(`wordValues must contain exactly ${expectedCount} initialized runtime table entries`);
  wordValues.forEach((word, index) => assertSignedWord(word, `wordValues[${index}]`));
}

function assertUint8(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new TypeError(`${label} must be an unsigned byte`);
}

function isInBounds(header, x, y) {
  return x >= 0 && x < header.width && y >= 0 && y < header.height;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const option = { "--executable": "executablePath", "--map": "mapPath", "--functions": "functionsPath", "--references": "referencesPath", "--original-root": "originalRoot", "--output": "output" }[argument];
    if (!option) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a path`);
    args[option] = resolve(repositoryRoot, value);
    index += 1;
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const { output, ...extractorArgs } = args;
  const rendered = `${JSON.stringify(extractK01TilePlacementElevationEvidence(extractorArgs), null, 2)}\n`;
  if (output) writeFileSync(output, rendered);
  else process.stdout.write(rendered);
}
