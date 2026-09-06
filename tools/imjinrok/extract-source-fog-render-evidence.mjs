#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { EXPECTED_EXECUTABLE_SHA256, extractImjinrokTilesetLoaderBoundary } from "./extract-imjinrok-tileset-loader-boundary.mjs";
import { parseMapHeader } from "./map-codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readVaRange, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_EXECUTABLE_PATH = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const DEFAULT_NORMAL_TILE_DIRECTORY = resolve(repositoryRoot, "original/imjinrok2/tile/normal");
const DEFAULT_K01_MAP_PATH = resolve(repositoryRoot, "original/imjinrok2/stagemap/k01.map");
const LOADER_RECORD_BASE = 0x00bcdff8;
const LOADER_RECORD_STRIDE = 0x0bf8;
const FOG_RESOURCE_INDEX_START = 60;
const BLACK_RESOURCE_INDEX = 75;
const FOG_MASK_LOOKUP_ADDRESS = 0x004bf9c4;
const FOG_MASK_LOOKUP = [0, 9, 8, 2, 10, 1, 12, 5, 11, 13, 3, 6, 0, 4, 7, 0];
const FOG_FRAME_WIDTH_OFFSET = 0x04;
const FOG_FRAME_HEIGHT_OFFSET = 0x08;
const FOG_FRAME_COUNT_OFFSET = 0x0c;
const FOG_ATLAS_WIDTH_OFFSET = 0x0bcc;
const FOG_ATLAS_HEIGHT_OFFSET = 0x0bd0;
const FOG_ATLAS_COLUMNS = 32;
const FOG_HALF_COLUMNS = 16;
const CALLER_SELECTOR_DOMAIN = Array.from({ length: 14 }, (_value, index) => index);
const FOG_STATE8_CHANNEL_LIMITS = { red: 32, green: 64, blue: 32 };
const FAMILY_BYTE_MAP_OFFSET = 0x4a0c4;
const LOW_NIBBLE_MAP_OFFSET = 0x32514;
const PLACEMENT_SELECTOR_MAP_OFFSET = 0x79824;
const PLACEMENT_LOOKUP_MAP_OFFSET = 0x51f54;
const PLACEMENT_LOOKUP_SELECTOR_STRIDE = 0x7e90;
const MAP_X_STRIDE = 180;
const EXPECTED_K01_MAP = { size: 1_097_100, sha256: "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb", width: 60, height: 60 };
const K01_PLACEMENT_VIEWPORT = { left: 0, right: 639, top: 0, bottom: 479 };

const FOG_SOURCE_HASHES = [
  "98c4f138a47503e112b7fd78fd13c0cc6cb9593ef37c18209cbf88bc7f4e4759",
  "0e64374263ceedb1253d7a55fc96681d3e2787e876021134747521bf88bf5701",
  "114fa8aab39b45423a3fe6b3574a194fbc056877ee02f3c2b32b10c8d867b1a0",
  "c5db36d2e772d2309d086911e96eba91b2052d221e8d67b3e7d7ddaeb1009065",
  "c08dd146b67fe85d17900471273c7b6d3feaa06080d8fe83dda5b74b63892e79",
  "26ea4a1ed4a0865ace99e22639df0d513a508da54f73b956c60e2dc9d3a646ca",
  "5670c1940397a807e10ffe132d472613508800671f1aa3da3e1f54b46133c5a0",
  "798f6d69678c7b9c40decbc220199219c9e17cfc6ae76470daebd49d0af99b55",
  "4064773e38a13f43ede3f06975c61bb3405337eb6fcb90ccc3d7b4425eaf5f59",
  "22ba6fc52a03bbed16f063dcd16fdf47437bdab642ecbcb58af2c0aff03676be",
  "bf6b260f412305fd29b0a6a8454fb6bb112e0344ac2f96b465f6f62923437c7c",
  "3633f57e785791c0f5e9e6f632fed1575b23fbf7756177be2162dbd6ce602e47",
  "3ed4ced064f3998f143a344f0f17cac528d91953fd41a97deb3add1b7330ba5d",
  "b363feaf9cd89b964a7d306f0638f2f41cc57bf8b8efd0e1d8dd818c9aee5ee7",
  "efb2eb836d4552a9bea57a37f97370cb2de1e1a55d4f34271889ad0a083fc669",
];

const RAW_CODE_RANGES = [
  ["FUN_00467de0", 0x00467de0, 0x004689ce, "1a2c8ddfb7e2801514c0848d1c7ecb18628df35b5cf4785ecd2507c2b5a74604"],
  ["FUN_00467de0 center/low-nibble dispatch window", 0x004686e2, 0x00468987, "7fc7126448394a8f9c93ceba2f5b74a375ce4b47b82f6a24d23c3f2bdc80ddca"],
  ["FUN_0046a530", 0x0046a530, 0x0046a8e8, "b4dc5ba4f0d8be3cac135ccfd02a372173dfcf01dad79f262cf8468572ea8e7a"],
  ["FUN_00467de0 caller projection window", 0x00468634, 0x004686aa, "5a88c41d80dfd2f871d90266fbf3e9a5c978a6cdaa7575d15b337c94bd0a7849"],
  ["FUN_0046a530 placement prologue and vertical adjustment", 0x0046a530, 0x0046a5c8, "23bbcbfa9bc0ec79a979e3271a3251b8eab669d4a7767ae0de86054016284813"],
  ["FUN_00452b30 state-8 palette remap", 0x00452b30, 0x00452c96, "3dd28a807d474960f9578c724c01523853b404071b9856d7f3c692b9250a3f55"],
  ["FUN_0044b680 palette LUT initializer", 0x0044b680, 0x0044b734, "ed47b21cd562a59214d614d4490cdbd2192382d3e1599498ce00f9cdad885e90"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE = [
  [0x004686e2, "8d 84 ad 5d 16 00 00 8d 04 c0 8d 0c 82 8a 04 31", "FUN_00467de0 derives the low-nibble map address as map+0x32514+x*180+y before the center-state and neighbor-mask dispatch."],
  [0x004686f2, "24 0f 66 0f be c0 66 85 c0 0f 84 86 02 00 00", "The low nibble from map+0x32514+x*180+y is masked to 0..15; zero jumps directly to the end of this cell's fog dispatch pass."],
  [0x0046870f, "8a 80 5e 4d 7d 00 66 0f be c8 66 83 f9 08 75 1c", "The center fog byte at 0x007d4d5e+x*180+y is sign-extended and compared with literal state 8."],
  [0x0046871f, "8b 54 24 18 8b 44 24 14 6a 01 6a 08 52 50 57 53 8b ce e8 da 0d 00 00 e9 4c 02 00 00", "Center state 8 calls FUN_00469510 with literal selector 1 and state 8, then jumps past both edge-mask paths to the cell-pass continuation."],
  [0x0046873b, "84 c0 0f 85 26 01 00 00", "For a nonzero center state other than 8, the zero-state-4 mask path is skipped and control enters the state-8 mask path; center state 0 falls through to state 4 first."],
  [0x00468634, "66 8b 8e 9c 2d 00 00 66 8b be 98 2d 00 00 8b 54 24 18 8b 44 24 14 8b 2d 00 40 aa 00 8b d9 2b df 2b da 03 d8 a1 08 40 aa 00 2b c5 c1 e3 05 40 89 5c 24 28 99 2b c2 8b d8 8b 44 24 28 d1 fb 03 e8 a1 0c 40 aa 00 03 dd 8b 6c 24 14 8b d5 2b d7 2b d1 8b 4c 24 18 03 d1 8b 0d 04 40 aa 00 2b c1 c1 e2 04 40 89 54 24 28 99 2b c2 8b 54 24 28 8b f8 03 ca d1 ff 03 f9", "FUN_00467de0 reads cell x/y from [esp+0x14]/[esp+0x18], camera tile x/y from map+0x2d98/+0x2d9c, and forms the two viewport-centered isometric projected arguments."],
  [0x00468848, "0f bf c0 8b 54 24 18 66 0f b6 88 c4 f9 4b 00 8b 44 24 14 51 6a 04 52 50 57 53 8b ce e8 c7 1c 00 00", "The state-4 dispatch pushes lookup selector, literal 4, cell y, cell x, projected y, then projected x before the direct call to FUN_0046a530."],
  [0x00468966, "0f bf c0 8b 54 24 18 66 0f b6 88 c4 f9 4b 00 8b 44 24 14 51 6a 08 52 50 57 53 8b ce e8 a9 1b 00 00", "The state-8 dispatch preserves the same six-argument ordering and changes only the literal state to 8."],
  [0x0046a530, "83 ec 30 8b 44 24 34 53 8b 5c 24 44 55 56 57 8b 7c 24 4c 8d 68 e0", "FUN_0046a530 reads argument 1 as projected x, saves argument 3 as cell x after its register saves, and derives draw-left as projected x minus 32."],
  [0x0046a587, "66 3d 02 00 75 18 53 57 8b ce e8 ba 30 00 00 8b 4c 24 48 c1 e0 04 2b c8 89 4c 24 44 eb 23 53 57 8b ce e8 a2 30 00 00 0f bf c0 99 33 c2 2b c2 40 c1 e0 04 8b d0 8b 44 24 48 2b c2 89 44 24 44 8b c8", "FUN_0046a530 takes the low-nibble-equals-2 branch only in-bounds, calls FUN_0046d650(map, cellX, cellY), subtracts helper<<4 there, and otherwise subtracts (abs(int16(helper))+1)<<4 from argument 2."],
  [0x00468743, "8d 4a ff 33 c0 85 c9 7c 12 8b 4c 24 1c 80 b9 5d 4d 7d 00 04 75 05 b8 03 00 00 00 8b 8e a4 2d 00 00 42 3b d1 7d 0f 8b 54 24 1c 80 ba 5f 4d 7d 00 04 75 02 0c 0c", "FUN_00467de0 begins the state-4 neighbor mask and sets the vertical-neighbor bit pairs only after in-bounds checks."],
  [0x0046883d, "66 85 c0 74 27 66 3d 0f 00 74 21", "The state-4 mask path skips both mask zero and mask 0x0f before its lookup and compositor call."],
  [0x00468842, "66 3d 0f 00 74 21 0f bf c0 8b 54 24 18 66 0f b6 88 c4 f9 4b 00 8b 44 24 14 51 6a 04 52 50 57 53 8b ce e8 c7 1c 00 00", "The nonzero/non-0x0f state-4 mask indexes 0x004bf9c4, then calls FUN_0046a530 with literal state 4."],
  [0x00468869, "0f bf 4c 24 18 33 c0 8d 51 ff 85 d2 89 54 24 10 7c 12 8b 54 24 1c 80 ba 5d 4d 7d 00 08 75 05 b8 03 00 00 00", "FUN_00467de0 starts a separate mask accumulation path by comparing neighbors to literal state 8."],
  [0x0046895b, "66 85 c0 74 27 66 3d 0f 00 74 21 0f bf c0 8b 54 24 18 66 0f b6 88 c4 f9 4b 00 8b 44 24 14 51 6a 08 52 50 57 53 8b ce e8 a9 1b 00 00", "The nonzero/non-0x0f state-8 mask uses the same lookup table and calls FUN_0046a530 with literal state 8."],
  [0x0046a5c8, "0f bf c7 05 95 06 00 00 0f bf d3 8d 04 80 03 f2 8d 54 24 34 8d 04 c0 0f bf f9 66 0f b6 04 86 83 c0 3c", "FUN_0046a530 forms map + 0x4a0c4 + mapX*180 + mapY, reads its family byte, and adds 0x3c before selecting a loader record."],
  [0x0046a5f1, "8d 1c 76 50 c1 e3 07 2b de 8d 44 24 3c c1 e3 03 52 50 8b 83 00 e0 bc 00", "The selected family plus 0x3c is scaled by record stride 0x0bf8 and reads the common loader record."],
  [0x0046a634, "8b 83 c4 eb bc 00 66 8b ab fc df bc 00 99 f7 bb fc df bc 00 66 8b 8b 00 e0 bc 00", "FUN_0046a530 loads record+0x0bcc atlas width, divides it by record+0x04 frame width, and loads record+0x08 frame height."],
  [0x0046a64f, "66 83 7c 24 54 04 89 6c 24 28 89 4c 24 1c c7 44 24 48 00 00 00 00 89 44 24 50 0f 85 2b 01 00 00", "FUN_0046a530 branches on literal state 4 before entering its first 3-by-2 composition loop."],
  [0x0046a6c0, "0f bf 44 24 50 0f bf 6c 24 58 99 2b c2 68 68 44 53 00 8b f8 8b c5 99 d1 ff f7 ff 8b 54 24 4c 8b c8 8d 04 4a 03 c8 8b c5 99 0f af 4c 24 54 f7 ff", "The state-4 path uses signed IDIV with halfColumns and combines quotient, remainder, outer, and inner loop values into the subframe index."],
  [0x0046a71e, "52 8b 54 24 54 50 8b 44 24 50 51 52 50 b9 18 94 55 00 e8 8b 3c fe ff", "The state-4 composition path calls FUN_0044e3c0 after the common preceding path succeeds."],
  [0x0046a74a, "66 83 f9 02 89 4c 24 54 89 44 24 1c 89 7c 24 44 0f 8c 41 ff ff ff 8b 44 24 48 8b 4c 24 18 8b 7c 24 10 8b 54 24 4c 40 03 f9 03 d1 66 3d 03 00 89 44 24 48 89 7c 24 10 89 54 24 4c 0f 8c fe fe ff ff", "The state-4 path repeats its inner loop while index < 2 and outer loop while index < 3, for six subframes."],
  [0x0046a79a, "8b 54 24 44 89 7c 24 18 0f bf c9 0f bf c5 8d 4c 39 ff 89 54 24 20", "The non-state-4 branch initializes a distinct composition path."],
  [0x0046a850, "52 8b 54 24 24 50 8b 44 24 18 51 52 50 b9 18 94 55 00 e8 c9 82 fe ff", "The distinct non-state-4 composition path calls FUN_00452b30 after the common preceding path succeeds."],
  [0x0046a889, "66 83 f9 02 89 4c 24 54 89 54 24 4c 89 7c 24 10 0f 8c 35 ff ff ff 0f bf 4c 24 1c 8b 7c 24 14 8b 54 24 48 03 f9 42 89 7c 24 14 8b 7c 24 18 03 f9 8b 4c 24 1c 89 7c 24 18 8b 7c 24 20 03 f9 66 83 fa 03 89 54 24 48 89 7c 24 20 0f 8c db fe ff ff", "The non-state-4 path also has inner <2 and outer <3 loop bounds, but its call target differs from the state-4 path."],
  [0x00452b89, "8a 04 18 3c fe 75 19 46 0f bf c6 66 0f b6 04 18 03 d0 46", "FUN_00452b30 reads the source indexed pixel at 0x00452b89; source byte 0xfe enters its encoded skip/run path before ordinary palette remapping."],
  [0x00452bb9, "8a 1a 8b f3 33 db 8d 14 71 8d 3c 16 8d 14 41 8a 9c 10 a0 19 02 00 8d 2c 10 33 d2 8a 97 a0 19 02 00 c1 e2 05 03 d3 33 db 8a 9f a1 19 02 00", "FUN_00452b30 reads the destination indexed pixel and source/destination palette channel bytes from object+0x219a0 with a three-byte palette stride, then indexes the red/blue 32x32 LUT at object+0x864a0."],
  [0x00452bef, "8b fb 33 db 8a 9d a1 19 02 00 66 8b 6c 24 24 c1 e7 06 03 fb 33 db c1 e2 06 0f bf bc 79 a0 6c 08 00 03 d7 8d bc 71 6c 66 01 00 c1 e2 05 8a 9c 3e 36 b3 00 00 8d b4 41 6c 66 01 00 8b fb 33 db 8a 9c 30 36 b3 00 00 8b 74 24 10 c1 e7 05 03 fb 8b 5c 24 2c 0f bf 84 79 a0 64 08 00 03 d0 8b 44 24 14 8b 7c 24 1c", "FUN_00452b30 indexes the green 64x64 LUT at object+0x86ca0 and the blue 32x32 LUT at object+0x864a0, combines the three remapped channels into a packed 5:6:5 index, and prepares the final palette lookup."],
  [0x00452c54, "8a 94 51 a0 19 00 00 88 10", "The state-8 path maps the packed 5:6:5 index through object+0x19a0 (two-byte table stride) and writes the resulting byte to the destination pixel."],
  [0x0044b680, "53 55 56 57 33 ff 8d 81 a0 64 08 00 33 f6 8b e8 66 3b fe 8b c7 7f 02 8b c6 66 3b fe 8b df 7c 02 8b de 0f bf d0 b8 20 00 00 00 2b c2 99 83 e2 1f 03 c2 8b d7 c1 f8 05 0f af c3 66 3b fe 7c 02 8b d6 03 d0 46 66 89 55 00 83 c5 02 66 83 fe 20 7c bf", "FUN_0044b680 fills object+0x864a0 as a 32x32 WORD table using max/min channel values and the limit 0x20; valid entries equal the minimum channel value."],
  [0x0044b6dc, "8d 81 a0 6c 08 00 33 c9 8b d8 66 3b f1 8b c6 7f 02 8b c1 66 3b f1 8b fe 7c 02 8b f9 0f bf d0 b8 40 00 00 00 2b c2 99 83 e2 3f 03 c2 8b d6 c1 f8 06 0f af c7 66 3b f1 7c 02 8b d1 03 d0 41 66 89 13 83 c3 02 66 83 f9 40 7c c0 46 8b c3 66 83 fe 40 7c b3 5f 5e 5d 5b c3", "FUN_0044b680 fills object+0x86ca0 as a 64x64 WORD table using the same max/min arithmetic and the limit 0x40; valid entries equal the minimum channel value."],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

export function lookupFogNeighborMask(mask) {
  if (!Number.isInteger(mask) || mask < 0 || mask >= 16) throw new RangeError("fog neighbor mask must be an integer in 0..15");
  return FOG_MASK_LOOKUP[mask];
}

/**
 * Pure replay of the state-8 blitter's channel LUT initializer. The source
 * uses sign-adjusted arithmetic right shift (the power-of-two equivalent of
 * truncation toward zero), but every valid channel pair is nonnegative and
 * below its table limit, so truncation is explicit here rather than relying
 * on bitwise coercion.
 */
export function reproduceFogState8LutValue({ source, destination, limit } = {}) {
  if (!Number.isInteger(limit) || ![32, 64].includes(limit)) throw new RangeError("fog state-8 LUT limit must be 32 or 64");
  for (const [value, label] of [[source, "source"], [destination, "destination"]]) {
    if (!Number.isInteger(value) || value < 0 || value >= limit) throw new RangeError(`${label} must be an integer in 0..${limit - 1}`);
  }
  const maximum = Math.max(source, destination);
  const minimum = Math.min(source, destination);
  const quotient = Math.trunc((limit - maximum) / limit);
  return minimum + quotient * minimum;
}

/**
 * Pure channel/pixel reference for the state-8 indexed-pixel remap. The
 * final object+0x19a0 palette-index lookup is intentionally left as an
 * explicit boundary because its runtime palette lifecycle is not closed by
 * this evidence unit.
 */
export function reproduceFogState8PaletteRemap({ source, destination } = {}) {
  if (!source || typeof source !== "object" || !destination || typeof destination !== "object") {
    throw new TypeError("source and destination channel objects are required");
  }
  const remapped = {};
  for (const channel of Object.keys(FOG_STATE8_CHANNEL_LIMITS)) {
    const limit = FOG_STATE8_CHANNEL_LIMITS[channel];
    remapped[channel] = reproduceFogState8LutValue({ source: source[channel], destination: destination[channel], limit });
  }
  const packed565 = (remapped.red << 11) | (remapped.green << 5) | remapped.blue;
  return { source: { ...source }, destination: { ...destination }, remapped, packed565 };
}

/**
 * Pure replay of FUN_00467de0's low-nibble and center-state dispatch guards.
 * Direction labels describe the eight neighboring inputs to this reference;
 * they do not assign a human meaning to the source bit positions.
 */
export function reproduceFogCellDispatch({ centerState, lowNibble, neighbors } = {}) {
  assertByte(centerState, "centerState");
  if (!Number.isInteger(lowNibble) || lowNibble < 0 || lowNibble > 15) {
    throw new RangeError("lowNibble must be an integer in 0..15");
  }
  if (!neighbors || typeof neighbors !== "object") throw new TypeError("neighbors must be an object");
  const directions = [
    ["top", 0x03], ["bottom", 0x0c], ["left", 0x05], ["right", 0x0a],
    ["topLeft", 0x01], ["topRight", 0x02], ["bottomLeft", 0x04], ["bottomRight", 0x08],
  ];
  for (const [direction] of directions) assertByte(neighbors[direction], `neighbors.${direction}`);

  const makePass = (state) => {
    const mask = directions.reduce((value, [direction, bit]) => (
      neighbors[direction] === state ? value | bit : value
    ), 0);
    const skipped = mask === 0 || mask === 0x0f;
    return {
      state,
      mask,
      selector: skipped ? null : lookupFogNeighborMask(mask),
      skipped,
      skipReason: skipped ? (mask === 0 ? "mask-zero" : "mask-all-neighbors") : null,
    };
  };

  if (lowNibble === 0) {
    return { centerState, lowNibble, branch: "low-nibble-zero", baseCall: null, passes: [], calls: [] };
  }
  if (centerState === 8) {
    return {
      centerState,
      lowNibble,
      branch: "center-state-8-base",
      baseCall: { function: "FUN_00469510", state: 8, selector: 1 },
      passes: [],
      calls: [],
    };
  }
  const passes = centerState === 0 ? [makePass(4), makePass(8)] : [makePass(8)];
  return {
    centerState,
    lowNibble,
    branch: centerState === 0 ? "center-state-0-boundary" : "center-nonzero-state-8-boundary",
    baseCall: null,
    passes,
    calls: passes.filter(({ skipped }) => !skipped).map(({ state, mask, selector }) => ({ state, mask, selector })),
  };
}

export function reproduceFogSubframeIndices(selector) {
  if (!Number.isInteger(selector) || !CALLER_SELECTOR_DOMAIN.includes(selector)) {
    throw new RangeError("fog selector must be an integer in the caller-proven domain 0..13");
  }
  const quotient = Math.trunc(selector / FOG_HALF_COLUMNS);
  const remainder = selector % FOG_HALF_COLUMNS;
  const indices = [];
  for (let outer = 0; outer < 3; outer += 1) {
    for (let inner = 0; inner < 2; inner += 1) {
      indices.push(inner + (outer + 3 * quotient) * FOG_ATLAS_COLUMNS + 2 * remainder);
    }
  }
  return indices;
}

/**
 * Pure reference for the narrow projected-coordinate preparation in the
 * FUN_00467de0 caller window. Viewport bounds are an explicit caller input;
 * this does not identify their UI owner or establish a general renderer pivot.
 */
export function reproduceFogCallerProjection({
  x,
  y,
  cameraX,
  cameraY,
  viewportLeft,
  viewportRight,
  viewportTop,
  viewportBottom,
} = {}) {
  for (const [value, label] of [[x, "x"], [y, "y"], [cameraX, "cameraX"], [cameraY, "cameraY"]]) {
    assertSignedWord(value, label);
  }
  for (const [value, label] of [
    [viewportLeft, "viewportLeft"], [viewportRight, "viewportRight"],
    [viewportTop, "viewportTop"], [viewportBottom, "viewportBottom"],
  ]) {
    assertSignedInt32(value, label);
  }
  if (viewportLeft > viewportRight || viewportTop > viewportBottom) {
    throw new RangeError("viewport bounds must be ordered left <= right and top <= bottom");
  }

  const projectedX = (x - y + cameraY - cameraX) * 32 + viewportLeft + Math.trunc((viewportRight - viewportLeft + 1) / 2);
  const projectedY = (x + y - cameraX - cameraY) * 16 + viewportTop + Math.trunc((viewportBottom - viewportTop + 1) / 2);
  assertSignedInt32(projectedX, "projectedX");
  assertSignedInt32(projectedY, "projectedY");
  return { projectedX, projectedY };
}

/**
 * Pure reference for FUN_0046a530's caller-visible draw rectangle adjustment.
 * The helper result is explicit because this extractor only establishes the
 * K01 selector-indexed result distribution, not its human meaning or runtime owner.
 */
export function reproduceFogCompositorPlacement({ projectedX, projectedY, x, y, lowNibble, helperReturn } = {}) {
  assertSignedInt32(projectedX, "projectedX");
  assertSignedInt32(projectedY, "projectedY");
  assertSignedWord(x, "x");
  assertSignedWord(y, "y");
  if (!Number.isInteger(lowNibble) || lowNibble < 0 || lowNibble > 15) {
    throw new RangeError("lowNibble must be an integer in 0..15");
  }
  assertSignedWord(helperReturn, "helperReturn");

  const lowNibbleEquals2 = lowNibble === 2;
  const verticalShift = lowNibbleEquals2
    ? helperReturn << 4
    : (Math.abs(helperReturn) + 1) << 4;
  const drawLeft = projectedX - 32;
  const drawTop = projectedY - verticalShift;
  assertSignedInt32(drawLeft, "drawLeft");
  assertSignedInt32(drawTop, "drawTop");
  return {
    x,
    y,
    lowNibble,
    helperReturn,
    placementBranch: lowNibbleEquals2 ? "low-nibble-equals-2" : "other-low-nibble",
    verticalShift,
    drawLeft,
    drawTop,
  };
}

export function extractSourceFogRenderEvidence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  normalTileDirectory = DEFAULT_NORMAL_TILE_DIRECTORY,
  mapPath = DEFAULT_K01_MAP_PATH,
} = {}) {
  const { buffer: executable, image } = readPeImage(executablePath);
  assertEqual(sha256(executable), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const loader = extractImjinrokTilesetLoaderBoundary({ executablePath, tileDirectory: normalTileDirectory });
  const fogResources = extractFogResources(loader, normalTileDirectory);
  const k01FamilyBytes = extractK01FamilyBytes(mapPath);
  const k01Placement = extractK01PlacementVectors(mapPath);
  const lookupBytes = readVaRange(executable, image, FOG_MASK_LOOKUP_ADDRESS, FOG_MASK_LOOKUP_ADDRESS + 16);
  assertEqual(JSON.stringify([...lookupBytes]), JSON.stringify(FOG_MASK_LOOKUP), "fog neighbor lookup vector");

  return {
    question: "What source-backed fog resource, low-nibble/center-state dispatch, neighbor lookup, caller projection/argument ordering, placement adjustment, six-subframe composition, and state-8 palette remap contract do FUN_00467de0, FUN_0046a530, and FUN_00452b30 establish?",
    analysisStatus: "정적 확정 (resource family, low-nibble/center-state dispatch, lookup, caller projection/argument ordering, bounded placement arithmetic, six-subframe composition, state-8 palette/LUT arithmetic, and frame algebra only)",
    reproductionStatus: "재현 완료 (hash-bound extraction, resource records, dispatch/LUT/frame/placement vectors, exhaustive 32x32/64x64 LUT replay, loop bounds, and fail-closed reference inputs)",
    implementationStatus: "없음",
    sources: {
      executable: { path: relative(repositoryRoot, executablePath), sha256: EXPECTED_EXECUTABLE_SHA256 },
      normalTileDirectory: relative(repositoryRoot, normalTileDirectory),
      k01Map: { path: relative(repositoryRoot, mapPath), size: EXPECTED_K01_MAP.size, sha256: EXPECTED_K01_MAP.sha256 },
    },
    functions: {
      caller: { name: "FUN_00467de0", address: toHex(0x00467de0) },
      compositor: { name: "FUN_0046a530", address: toHex(0x0046a530) },
    },
    resources: {
      loaderRecordBase: toHex(LOADER_RECORD_BASE),
      loaderRecordStride: "0x0bf8",
      familyByteAddress: "map + 0x4a0c4 + mapX * 180 + mapY",
      familyToResourceIndex: "resourceIndex = familyByte + 0x3c",
      k01FamilyBytes,
      fog: fogResources.slice(0, 15),
      black: fogResources[15],
    },
    neighborLookup: {
      address: toHex(FOG_MASK_LOOKUP_ADDRESS),
      rawOffset: toHex(image.vaToRawOffset(FOG_MASK_LOOKUP_ADDRESS)),
      byteRange: `${toHex(FOG_MASK_LOOKUP_ADDRESS)}-${toHex(FOG_MASK_LOOKUP_ADDRESS + 16)} (end exclusive)`,
      sha256: sha256(lookupBytes),
      inputRange: "0..15",
      values: [...lookupBytes],
      vectors: FOG_MASK_LOOKUP.map((output, input) => ({ input, output })),
    },
    callerContract: {
      separateNeighborStateValues: [4, 8],
      skippedMaskValues: [0, 15],
      lookupThenCompositorCall: true,
      argumentOrder: ["projectedX", "projectedY", "cellX", "cellY", "literalState", "lookupSelector"],
      dispatch: {
        byteRange: "0x004686e2-0x00468987 (end exclusive)",
        lowNibbleAddress: "map + 0x32514 + x * 180 + y",
        centerStateAddress: "0x007d4d5e + x * 180 + y",
        lowNibbleZero: "skip all center/base and edge-mask calls for this cell pass",
        centerStateZero: "run state-4 edge mask then state-8 edge mask in that order",
        centerStateNonzeroExcept8: "skip state-4 edge mask and run state-8 edge mask",
        centerState8: "call FUN_00469510 with literal state 8 and selector 1, then skip both edge-mask paths",
        maskConstruction: { state4: "neighbor byte equals 4", state8: "neighbor byte equals 8" },
        syntheticVectors: [
          { id: "visible-center-ordered-state4-then-state8", input: { centerState: 0, lowNibble: 1, neighbors: { top: 4, bottom: 0, left: 0, right: 8, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } }, output: reproduceFogCellDispatch({ centerState: 0, lowNibble: 1, neighbors: { top: 4, bottom: 0, left: 0, right: 8, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } }) },
          { id: "explored-center-only-state8", input: { centerState: 4, lowNibble: 1, neighbors: { top: 4, bottom: 0, left: 0, right: 8, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } }, output: reproduceFogCellDispatch({ centerState: 4, lowNibble: 1, neighbors: { top: 4, bottom: 0, left: 0, right: 8, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } }) },
          { id: "unseen-center-base-path", input: { centerState: 8, lowNibble: 1, neighbors: { top: 4, bottom: 0, left: 0, right: 8, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } }, output: reproduceFogCellDispatch({ centerState: 8, lowNibble: 1, neighbors: { top: 4, bottom: 0, left: 0, right: 8, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } }) },
          { id: "zero-low-nibble-skips-all", input: { centerState: 0, lowNibble: 0, neighbors: { top: 4, bottom: 0, left: 0, right: 8, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } }, output: reproduceFogCellDispatch({ centerState: 0, lowNibble: 0, neighbors: { top: 4, bottom: 0, left: 0, right: 8, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } }) },
          { id: "all-neighbor-mask-omits-edge-calls", input: { centerState: 0, lowNibble: 1, neighbors: { top: 4, bottom: 4, left: 4, right: 4, topLeft: 4, topRight: 4, bottomLeft: 4, bottomRight: 4 } }, output: reproduceFogCellDispatch({ centerState: 0, lowNibble: 1, neighbors: { top: 4, bottom: 4, left: 4, right: 4, topLeft: 4, topRight: 4, bottomLeft: 4, bottomRight: 4 } }) },
        ],
      },
      projection: {
        callerRange: { label: "FUN_00468600 caller range within FUN_00467de0", address: "0x00468600" },
        callerWindow: { function: "FUN_00467de0", byteRange: "0x00468634-0x004686aa (end exclusive)" },
        inputs: {
          cellX: "int16([esp+0x14])",
          cellY: "int16([esp+0x18])",
          cameraX: "int16(map+0x2d98)",
          cameraY: "int16(map+0x2d9c)",
          viewport: { left: "DAT_00aa4000", top: "DAT_00aa4004", right: "DAT_00aa4008", bottom: "DAT_00aa400c" },
        },
        formulas: {
          projectedX: "(x - y + cameraY - cameraX) * 32 + viewportLeft + trunc((viewportRight - viewportLeft + 1) / 2)",
          projectedY: "(x + y - cameraX - cameraY) * 16 + viewportTop + trunc((viewportBottom - viewportTop + 1) / 2)",
        },
        syntheticVectors: [
          { input: { x: 3, y: 5, cameraX: 1, cameraY: 2, viewportLeft: 10, viewportRight: 109, viewportTop: 20, viewportBottom: 79 }, output: reproduceFogCallerProjection({ x: 3, y: 5, cameraX: 1, cameraY: 2, viewportLeft: 10, viewportRight: 109, viewportTop: 20, viewportBottom: 79 }) },
          { input: { x: -2, y: 4, cameraX: -3, cameraY: 5, viewportLeft: -100, viewportRight: 100, viewportTop: -50, viewportBottom: 50 }, output: reproduceFogCallerProjection({ x: -2, y: 4, cameraX: -3, cameraY: 5, viewportLeft: -100, viewportRight: 100, viewportTop: -50, viewportBottom: 50 }) },
        ],
      },
    },
    placement: {
      compositor: { function: "FUN_0046a530", byteRange: "0x0046a530-0x0046a5c8 (end exclusive)" },
      drawLeft: "argument1(projectedX) - 32",
      drawTop: {
        lowNibbleEquals2: "argument2(projectedY) - (int16(helperReturn) << 4)",
        other: "argument2(projectedY) - ((abs(int16(helperReturn)) + 1) << 4)",
      },
      syntheticVectors: [
        { input: { projectedX: 200, projectedY: 100, x: 2, y: 3, lowNibble: 2, helperReturn: 3 }, output: reproduceFogCompositorPlacement({ projectedX: 200, projectedY: 100, x: 2, y: 3, lowNibble: 2, helperReturn: 3 }) },
        { input: { projectedX: 200, projectedY: 100, x: 2, y: 3, lowNibble: 1, helperReturn: -1 }, output: reproduceFogCompositorPlacement({ projectedX: 200, projectedY: 100, x: 2, y: 3, lowNibble: 1, helperReturn: -1 }) },
      ],
      k01: k01Placement,
      localCompositePlacement: {
        compositeSize: { width: 64, height: 48 },
        imageAnchor: { x: 32, y: 0 },
        formula: "drawLeft = projectedX - 32; drawTop = projectedY - rawVerticalShift",
        K01RawVerticalShift: "derived per cell by the branch formulas above; observed values are 0, 16, 32, 48, and 64",
        boundary: "This caller/callee-local image anchor does not assign renderer-wide pivot semantics, viewport ownership, clip/mode, alpha/blend, or web placement policy.",
      },
      boundary: "The low-nibble==2 versus other arithmetic is static-confirmed/reproduced, but the corrected selector-indexed helper stream's human meaning and any terrain/visibility interpretation remain unresolved.",
    },
    composition: {
      subframeGrid: { columns: 3, rows: 2, subframeCount: 6 },
      state4: { stateValue: 4, blitFunction: "FUN_0044e3c0" },
      state8: { stateValue: 8, blitFunction: "FUN_00452b30" },
      boundary: "The byte-proven branch distinguishes literal state 4 from the non-4 path reached by caller literal state 8; no human visibility meaning is assigned.",
    },
    state8PaletteRemap: extractState8PaletteEvidence(),
    frameSelection: {
      resourceHeaderOffsets: { frameWidth: "0x04", frameHeight: "0x08", frameCount: "0x0c", atlasWidth: "0x0bcc", atlasHeight: "0x0bd0" },
      normalFogAtlas: { frameWidth: 32, frameHeight: 16, frameCount: 96, atlasWidth: 1024, atlasHeight: 48, atlasColumns: FOG_ATLAS_COLUMNS, halfColumns: FOG_HALF_COLUMNS },
      signedDivision: "x86 signed IDIV; for the caller-proven nonnegative selector domain 0..13, quotient = trunc(selector / halfColumns) and remainder = selector % halfColumns.",
      callerSelectorDomain: CALLER_SELECTOR_DOMAIN,
      formula: "frame = inner + (outer + 3 * trunc(selector / halfColumns)) * atlasColumns + 2 * (selector % halfColumns), with outer = 0..2 and inner = 0..1.",
      vectors: [0, 9, 13].map((selector) => ({ selector, frames: reproduceFogSubframeIndices(selector) })),
      frameBounds: { minimum: 0, maximum: 91, withinFrameCount: 96 },
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(executable, image, range)),
    evidencePoints: EVIDENCE.map((point) => verifyEvidencePoint(executable, image, point)),
    callEdges: [
      verifyDirectCall(executable, image, { from: 0x00468864, to: 0x0046a530, label: "state-4 caller dispatch" }),
      verifyDirectCall(executable, image, { from: 0x00468982, to: 0x0046a530, label: "state-8 caller dispatch" }),
      verifyDirectCall(executable, image, { from: 0x00468731, to: 0x00469510, label: "center-state-8 base path" }),
      verifyDirectCall(executable, image, { from: 0x0046a591, to: 0x0046d650, label: "low-nibble-equals-2 placement helper" }),
      verifyDirectCall(executable, image, { from: 0x0046a5a9, to: 0x0046d650, label: "other-low-nibble placement helper" }),
      verifyDirectCall(executable, image, { from: 0x0044b158, to: 0x0044b680, label: "palette LUT initializer" }),
    ],
    unresolvedBoundary: "The arithmetic in this caller/compositor/state-8 palette slice is static-confirmed and reproduced, but state 4/8 human meaning, visibility mapping, browser alpha/opacity equivalence, runtime palette lifecycle, final object+0x19a0 palette-index contents, web chunk scheduling, generic map-file provenance, family-byte runtime producer/lifetime, helper human meaning, and original renderer-wide pivot/placement semantics remain unresolved or explicit product adaptation. K01's hash-bound static byte distribution is recorded only as a bounded map-data observation. The frame algebra is confined to the caller-proven selector domain and normal fog header contract; it does not assign a human meaning to either state or selector.",
  };
}

function extractK01FamilyBytes(mapPath) {
  const map = readFileSync(mapPath);
  assertEqual(map.length, EXPECTED_K01_MAP.size, `${mapPath} size`);
  assertEqual(sha256(map), EXPECTED_K01_MAP.sha256, `${mapPath} SHA-256`);
  const header = parseMapHeader(map, mapPath);
  assertEqual(header.width, EXPECTED_K01_MAP.width, "K01 family-byte map width");
  assertEqual(header.height, EXPECTED_K01_MAP.height, "K01 family-byte map height");
  const lastOffset = FAMILY_BYTE_MAP_OFFSET + (header.width - 1) * MAP_X_STRIDE + (header.height - 1);
  if (lastOffset >= map.length) throw new RangeError(`K01 family-byte grid ending at 0x${lastOffset.toString(16)} exceeds map size`);
  const values = [];
  for (let x = 0; x < header.width; x += 1) {
    for (let y = 0; y < header.height; y += 1) values.push(map[FAMILY_BYTE_MAP_OFFSET + x * MAP_X_STRIDE + y]);
  }
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return {
    scope: "K01 hash-bound map bytes only; this neither identifies the runtime producer nor generalizes to other maps.",
    mapOffset: "0x4a0c4",
    coordinateStorage: "map + 0x4a0c4 + x * 180 + y",
    dimensions: { width: header.width, height: header.height },
    cellCount: values.length,
    valueStreamSha256: sha256(Buffer.from(values)),
    domain: [...counts.keys()].sort((left, right) => left - right),
    distribution: [...counts.entries()].sort(([left], [right]) => left - right).map(([value, count]) => ({ value, count })),
  };
}

function extractK01PlacementVectors(mapPath) {
  const map = readFileSync(mapPath);
  assertEqual(map.length, EXPECTED_K01_MAP.size, `${mapPath} size`);
  assertEqual(sha256(map), EXPECTED_K01_MAP.sha256, `${mapPath} SHA-256`);
  const header = parseMapHeader(map, mapPath);
  assertEqual(header.width, EXPECTED_K01_MAP.width, "K01 placement map width");
  assertEqual(header.height, EXPECTED_K01_MAP.height, "K01 placement map height");
  const cameraX = readSignedWord(map, 0x2d98, "K01 camera x");
  const cameraY = readSignedWord(map, 0x2d9c, "K01 camera y");
  const helperReturnCounts = new Map();
  const lowNibbleCounts = new Map();
  const verticalShiftCounts = new Map();
  const cells = [];

  for (let x = 0; x < header.width; x += 1) {
    for (let y = 0; y < header.height; y += 1) {
      const storageOffset = x * MAP_X_STRIDE + y;
      const selector = map[PLACEMENT_SELECTOR_MAP_OFFSET + storageOffset];
      const lookup = map[PLACEMENT_LOOKUP_MAP_OFFSET + selector * PLACEMENT_LOOKUP_SELECTOR_STRIDE + storageOffset];
      const helperReturn = reproduceK01PlacementHelper(selector, lookup);
      const lowNibble = map[LOW_NIBBLE_MAP_OFFSET + storageOffset] & 0x0f;
      const verticalShift = lowNibble === 2 ? helperReturn << 4 : (Math.abs(helperReturn) + 1) << 4;
      incrementCount(helperReturnCounts, helperReturn);
      incrementCount(lowNibbleCounts, lowNibble);
      incrementCount(verticalShiftCounts, verticalShift);
      cells.push({ x, y, storageOffset, lowNibble, selector, lookup, helperReturn, verticalShift });
    }
  }

  const input = { cameraX, cameraY, viewportLeft: K01_PLACEMENT_VIEWPORT.left, viewportRight: K01_PLACEMENT_VIEWPORT.right, viewportTop: K01_PLACEMENT_VIEWPORT.top, viewportBottom: K01_PLACEMENT_VIEWPORT.bottom };
  return {
    scope: "K01 hash-bound map cell fields plus an explicit synthetic 640x480 viewport input; the viewport is not claimed to be stored by the K01 map.",
    mapCamera: { x: cameraX, y: cameraY, source: "int16(map+0x2d98), int16(map+0x2d9c)" },
    viewportInput: K01_PLACEMENT_VIEWPORT,
    allCellDistribution: {
      cellCount: cells.length,
      helperReturn: countEntries(helperReturnCounts),
      lowNibble: countEntries(lowNibbleCounts),
      verticalShift: countEntries(verticalShiftCounts),
      streamSha256: sha256(Buffer.from(cells.flatMap((cell) => [cell.lowNibble, cell.selector, cell.lookup, cell.helperReturn & 0xff, cell.verticalShift]))),
    },
    vectors: [[0, 0], [0, 1], [6, 6], [59, 59]].map(([x, y]) => {
      const cell = cells.find((candidate) => candidate.x === x && candidate.y === y);
      const projection = reproduceFogCallerProjection({ x, y, ...input });
      return {
        input: { x, y, ...input },
        mapFields: {
          familyByte: map[FAMILY_BYTE_MAP_OFFSET + cell.storageOffset],
          lowNibble: cell.lowNibble,
          placementSelector: cell.selector,
          placementLookup: cell.lookup,
          helperReturn: cell.helperReturn,
        },
        projection,
        draw: reproduceFogCompositorPlacement({ ...projection, x, y, lowNibble: cell.lowNibble, helperReturn: cell.helperReturn }),
      };
    }),
  };
}

function reproduceK01PlacementHelper(selector, lookup) {
  if (lookup === 15) return selector;
  if (lookup !== 0) return selector - 1;
  return 0;
}

function incrementCount(counts, value) {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function countEntries(counts) {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left - right));
}

function extractState8PaletteEvidence() {
  const channelTables = Object.entries(FOG_STATE8_CHANNEL_LIMITS).map(([channel, limit]) => {
    const values = [];
    let allEntriesEqualMinimum = true;
    for (let destination = 0; destination < limit; destination += 1) {
      for (let source = 0; source < limit; source += 1) {
        const value = reproduceFogState8LutValue({ source, destination, limit });
        values.push(value);
        if (value !== Math.min(source, destination)) allEntriesEqualMinimum = false;
      }
    }
    return {
      channel,
      limit,
      dimensions: { destination: limit, source: limit },
      entryCount: limit * limit,
      valuesSha256: sha256(Buffer.from(values)),
      allEntriesEqualMinimum,
    };
  });
  const representative = reproduceFogState8PaletteRemap({
    source: { red: 8, green: 40, blue: 30 },
    destination: { red: 24, green: 48, blue: 16 },
  });
  return {
    compositor: { function: "FUN_00452b30", byteRange: "0x00452b30-0x00452c96 (end exclusive)" },
    paletteChannels: { address: "object + 0x219a0", stride: 3, order: ["red", "green", "blue"] },
    channelTables: [
      { ...channelTables.find(({ channel }) => channel === "red"), address: "object + 0x864a0" },
      { ...channelTables.find(({ channel }) => channel === "green"), address: "object + 0x86ca0" },
      { ...channelTables.find(({ channel }) => channel === "blue"), address: "object + 0x864a0" },
    ],
    formula: "maximum=max(source,destination); minimum=min(source,destination); q=trunc((limit-maximum)/limit); output=minimum+q*minimum",
    representative: {
      ...representative,
      packed565Formula: "(red << 11) | (green << 5) | blue",
      finalPaletteLookup: { address: "object + 0x19a0", entryStride: 2, output: "destination indexed byte" },
    },
    boundedInterpretation: "For valid channel pairs, the LUT output caps each destination channel at the source channel minimum; an opaque gray source therefore acts as an intensity cap, not a uniformly dark opaque overlay.",
    boundary: "The source maps indexed pixels through palette channel bytes, the 32x32/64x64 channel LUTs, a packed 5:6:5 index, and an object+0x19a0 lookup. Browser alpha/opacity is not claimed equivalent to this native remap.",
  };
}

function readSignedWord(buffer, offset, label) {
  if (offset < 0 || offset + 2 > buffer.length) throw new RangeError(`${label} at 0x${offset.toString(16)} exceeds map size`);
  return buffer.readInt16LE(offset);
}

function verifyDirectCall(executable, image, { from, to, label }) {
  const bytes = readVaRange(executable, image, from, from + 5);
  if (bytes[0] !== 0xe8) throw new Error(`${label} at ${toHex(from)} is not a direct near call`);
  const destination = from + 5 + bytes.readInt32LE(1);
  assertEqual(destination, to, `${label} call target`);
  return { from: toHex(from), to: toHex(to), bytes: [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" "), label };
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${label} must be a signed 16-bit integer`);
  }
}

function assertByte(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${label} must be an unsigned byte`);
  }
}

function assertSignedInt32(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
    throw new RangeError(`${label} must be a signed 32-bit integer`);
  }
}

function extractFogResources(loader, normalTileDirectory) {
  const expected = [
    ...Array.from({ length: 15 }, (_value, index) => ({ index: FOG_RESOURCE_INDEX_START + index, fileName: `fog${index}.spr`, sha256: FOG_SOURCE_HASHES[index], header: { width: 32, height: 16, frameCount: 96, atlasWidth: 1024, atlasHeight: 48 } })),
    { index: BLACK_RESOURCE_INDEX, fileName: "black.spr", sha256: "9ef53a565bfe804e8a272f73f9749c05681b6b9e3af4090f7e4eea61237292d0", header: { width: 64, height: 32, frameCount: 1 } },
  ];
  return expected.map((source) => {
    const tableEntry = loader.loader.filenameTable.entries[source.index];
    assertEqual(tableEntry?.fileName, source.fileName, `tileset loader record ${source.index} filename`);
    const path = resolve(normalTileDirectory, source.fileName);
    const bytes = readFileSync(path);
    assertEqual(sha256(bytes), source.sha256, `${path} SHA-256`);
    const header = parseSpriteLikeHeader(bytes, path);
    const actualHeader = source.index === BLACK_RESOURCE_INDEX
      ? { width: header.width, height: header.height, frameCount: header.frameCount }
      : readFogHeaderFields(bytes, header);
    assertEqual(JSON.stringify(actualHeader), JSON.stringify(source.header), `${path} header`);
    return {
      resourceIndex: source.index,
      recordAddress: toHex(LOADER_RECORD_BASE + source.index * LOADER_RECORD_STRIDE),
      fileName: source.fileName,
      sourcePath: relative(repositoryRoot, path),
      sha256: source.sha256,
      header: source.header,
      ...(source.index === BLACK_RESOURCE_INDEX ? {} : { headerFieldSha256: fogHeaderFieldSha256(bytes) }),
    };
  });
}

function readFogHeaderFields(bytes, header) {
  return {
    width: header.width,
    height: header.height,
    frameCount: header.frameCount,
    atlasWidth: bytes.readUInt32LE(FOG_ATLAS_WIDTH_OFFSET),
    atlasHeight: bytes.readUInt32LE(FOG_ATLAS_HEIGHT_OFFSET),
  };
}

function fogHeaderFieldSha256(bytes) {
  return sha256(Buffer.concat([
    bytes.subarray(FOG_FRAME_WIDTH_OFFSET, FOG_FRAME_COUNT_OFFSET + 4),
    bytes.subarray(FOG_ATLAS_WIDTH_OFFSET, FOG_ATLAS_HEIGHT_OFFSET + 4),
  ]));
}

function parseArgs(argv) {
  const outputIndex = argv.indexOf("--output");
  if (outputIndex === -1) return {};
  const output = argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a path");
  return { output: resolve(repositoryRoot, output) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output } = parseArgs(process.argv.slice(2));
  const rendered = `${JSON.stringify(extractSourceFogRenderEvidence(), null, 2)}\n`;
  if (output) writeFileSync(output, rendered);
  else process.stdout.write(rendered);
}
