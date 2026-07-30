#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeSpriteFrame, parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const defaultExecutablePath = resolve(defaultOriginalRoot, "imjinrok2.exe");

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const SOURCE_ASSETS = [
  ["stage-default", "yfnt/titlestartstage.spr", "d457f6409dab0697b5434f49315a3bed3b552278b42619fc3719ed355e1ed1ba"],
  ["stage-korea", "yfnt/titlestartstagekorea.spr", "65e6758ccf575925b9b20b346a786eeeae39fcc9bd8a96d2ec4c6c0916909c53"],
  ["stage-japan", "yfnt/titlestartstagejapan.spr", "29f202d78c67df2515643c38fc2608a27b5530ec4611380127acac456540bd45"],
  ["stage-china", "yfnt/titlestartstagechina.spr", "f570f95741097955a1fbdc7cff48682588043d00aa18d816cb82b0cc7e96311c"],
  ["stage-to-select", "yfnt/titlestartstagetoselect.spr", "98f0b6f38e7fc341f7a869fb4488c852d394093a2bc455c11a74ce843fa404ca"],
  ["nation-buttons", "yfnt/NationButtons.spr", "98304a61e4d8bd4017e7da6763e4194c4d55422a4891c5cf534ab5dd6c362885"],
];

const RAW_CODE_RANGES = [
  ["country-screen-asset-loader", 0x0043e920, 0x0043ec13, "591a912a53e155193bc38e2585ad3713ff6c2a790aa1b3bd94991d2d4ab5d5ea"],
  ["country-hover-selection", 0x0043ec70, 0x0043ede0, "c8938d351a2a887fc164d49e4742cbd9ee39342ae5a161ce43ca8199f2189f83"],
  ["country-selection-stage-routing", 0x0043e620, 0x0043e7bf, "541d09e179dc2a1fc70fecb5720d283a4e773e82570b4a70de21bcba204780d7"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE_POINTS = [
  [0x0043e933, "68 44 b0 4b 00", "FUN_0043e920 loads titlestartstagetoselect.spr before the three country screens"],
  [0x0043e99d, "68 f8 af 4b 00", "FUN_0043e920 loads titlestartstagekorea.spr into the first selectable screen slot"],
  [0x0043ea06, "68 ac af 4b 00", "FUN_0043e920 loads titlestartstagejapan.spr into the second selectable screen slot"],
  [0x0043ea6f, "68 60 af 4b 00", "FUN_0043e920 loads titlestartstagechina.spr into the third selectable screen slot"],
  [0x0043eb5c, "6a 44", "the first selectable screen slot is keyed by selection-mask color index 0x44"],
  [0x0043eb87, "6a 46", "the second selectable screen slot is keyed by selection-mask color index 0x46"],
  [0x0043ebbd, "6a 45", "the third selectable screen slot is keyed by selection-mask color index 0x45"],
  [0x0043ec75, "83 be e4 25 00 00 01", "FUN_0043ec70 switches between hover scan and an already-selected country"],
  [0x0043ed17, "66 c7 86 e8 25 00 00 02 00", "the third selectable slot stores country selection index two"],
  [0x0043ed47, "66 c7 86 e8 25 00 00 01 00", "the second selectable slot stores country selection index one"],
  [0x0043ed6f, "66 c7 86 e8 25 00 00 00 00", "the first selectable slot stores country selection index zero"],
  [0x0043e6a9, "66 c7 05 5c 02 53 00 01 00", "selection index zero routes to source nation value one"],
  [0x0043e695, "b8 02 00 00 00", "selection index one routes to source nation value two"],
  [0x0043e67f, "66 c7 05 5c 02 53 00 03 00", "selection index two routes to source nation value three"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const NATIONS = [
  { id: "korea", sourceMaskIndex: 0x44, selectedScreen: "stage-korea", selectionIndex: 0, sourceNationValue: 1 },
  { id: "japan", sourceMaskIndex: 0x46, selectedScreen: "stage-japan", selectionIndex: 1, sourceNationValue: 2 },
  { id: "china", sourceMaskIndex: 0x45, selectedScreen: "stage-china", selectionIndex: 2, sourceNationValue: 3 },
];

export function resolveSourceCountryMaskIndex(index) {
  return NATIONS.find((nation) => nation.sourceMaskIndex === index)?.id ?? null;
}

export function extractCampaignCountrySelectionEvidence({
  originalRoot = defaultOriginalRoot,
  executablePath = defaultExecutablePath,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const assets = Object.fromEntries(
    SOURCE_ASSETS.map(([id, sourcePath, expectedSha256]) => {
      const path = resolve(originalRoot, sourcePath);
      const bytes = readFileSync(path);
      assertEqual(sha256(bytes), expectedSha256, `${sourcePath} SHA-256`);
      const header = parseSpriteLikeHeader(bytes, sourcePath);
      return [id, { path: relative(repositoryRoot, path), sha256: expectedSha256, width: header.width, height: header.height, frameCount: header.frameCount, bytes, header }];
    }),
  );
  const mask = assets["stage-to-select"];
  const pixels = decodeSpriteFrame(mask.bytes, mask.header, 0);
  assertEqual(mask.width, 640, "titlestartstagetoselect.spr width");
  assertEqual(mask.height, 480, "titlestartstagetoselect.spr height");
  assertEqual(mask.frameCount, 1, "titlestartstagetoselect.spr frame count");

  const maskRegions = NATIONS.map((nation) => ({
    ...nation,
    pixelCount: countMaskPixels(pixels, nation.sourceMaskIndex),
    bounds: getMaskBounds(pixels, mask.width, mask.height, nation.sourceMaskIndex),
  }));

  return {
    question: "Which exact source pixels select and highlight Korea, Japan, and Ming on the country-selection screen, and how are those selections routed to the mission screen?",
    analysisStatus: "static-confirmed-for-screen-assets-mask-colors-hover-selection-and-country-routing",
    reproductionStatus: "reproduction-complete-for-mask-pixel-and-country-routing-vectors",
    implementationStatus: "classic-screen-art-and-mask-hit-testing-are-source-backed; browser-pointer-event-semantics-and-unimplemented-Japan-Ming-mission-lists-remain-product-adaptations",
    sources: {
      executable: { path: relative(repositoryRoot, executablePath), sha256: EXPECTED_EXECUTABLE_SHA256 },
      assets: Object.fromEntries(Object.entries(assets).map(([id, asset]) => [id, { path: asset.path, sha256: asset.sha256, width: asset.width, height: asset.height, frameCount: asset.frameCount }])),
    },
    maskRegions,
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point)),
    unresolved: "The bounded path confirms selection-mask colors, the three selected screens, selection indices, and subsequent country routing. It does not name the virtual input methods or prove a browser pointerup event is the original physical activation gesture.",
  };
}

export function createCampaignCountrySelectionFixture() {
  return {
    sourceExecutableSha256: EXPECTED_EXECUTABLE_SHA256,
    analysisStatus: "static-confirmed-for-screen-assets-mask-colors-hover-selection-and-country-routing",
    reproductionStatus: "reproduction-complete-for-mask-pixel-and-country-routing-vectors",
    vectors: [
      { id: "korea-mask-color-selects-korea", input: { maskIndex: 0x44 }, expected: "korea" },
      { id: "japan-mask-color-selects-japan", input: { maskIndex: 0x46 }, expected: "japan" },
      { id: "china-mask-color-selects-china", input: { maskIndex: 0x45 }, expected: "china" },
      { id: "transparent-mask-pixel-clears-selection", input: { maskIndex: 0xfe }, expected: null },
      { id: "unrelated-mask-pixel-clears-selection", input: { maskIndex: 0 }, expected: null },
    ],
  };
}

function countMaskPixels(pixels, index) {
  return pixels.reduce((count, pixel) => count + (pixel === index ? 1 : 0), 0);
}

function getMaskBounds(pixels, width, height, index) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[y * width + x] !== index) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error(`selection-mask color ${index} has no pixels`);
  return { minX, minY, maxX, maxY };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractCampaignCountrySelectionEvidence(), null, 2));
}
