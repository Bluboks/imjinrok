#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage } from "./pe-image.mjs";
import { assertEqual, sha256, verifyEvidencePoint, verifyRawCodeRange } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_EXECUTABLE_PATH = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const DEFAULT_MOUSE_SPRITE_PATH = resolve(repositoryRoot, "original/imjinrok2/yfnt/mouseinterface.spr");

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_MOUSE_SPRITE_SHA256 = "d2f65790f34feca12a28e0f047a76473dd5b2abac108a0627ee2e058a33fd6f4";

const RAW_CODE_RANGES = [
  ["game-speed-visual-groups", 0x004ac4c0, 0x004ac5bc, "cfb6e7a2706bdb96bd51c6faa87fb473cb4b2743e227f8e3f8011f2c9c3bb511"],
  ["game-speed-interval", 0x0043f580, 0x0043f5c7, "a47422310fbb420b780cfcb7d69d965c5ff0bf4d68cf55ff82189c3bb60cfa6e"],
  ["mouse-interface-setup", 0x004a5180, 0x004a5265, "e8f3861e1022a757a42b6a2896c8bab689e4290d3d257b40118cc14bf60c925f"],
  ["mouse-interface-read-write", 0x004a52a0, 0x004a530b, "31092daffbb0fd7d20cf46c7234c4eab16331b2f495a6ec86ad0c7cf40647154"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE_POINTS = [
  [0x0043f580, "66 83 3d 20 6e c0 00 01", "FUN_0043f580 returns the base interval when the alternate scheduler WORD is exactly one"],
  [0x0043f590, "a1 cc 4a 63 00 83 f8 03 77 24", "FUN_0043f580 reads DWORD[0x00634acc], dispatches states 0..3, and sends state four or outside the range to the final branch"],
  [0x0043f5a1, "a1 bc df 4b 00 83 c0 0e", "state zero returns DWORD[0x004bdfbc] plus 14"],
  [0x0043f5aa, "8b 0d bc df 4b 00 8d 41 0a", "state one returns DWORD[0x004bdfbc] plus 10"],
  [0x0043f5b4, "8b 15 bc df 4b 00 8d 42 f6", "state three returns DWORD[0x004bdfbc] minus 10"],
  [0x0043f5be, "a1 bc df 4b 00 83 c0 ec", "state four and outside the 0..3 jump table return DWORD[0x004bdfbc] minus 20"],
  [0x004ac4c3, "0f bf 41 10", "FUN_004ac4c0 reads its speed state from signed WORD[ECX+0x10]"],
  [0x004ac4e4, "3b c3", "FUN_004ac4c0 bounds its five visual groups at state four"],
  [0x004ac54e, "66 89 6c 24 10 66 89 6c 24 12 66 89 6c 24 14", "visual state zero replaces its first three-frame group with frame one"],
  [0x004ac592, "66 89 54 24 28 66 89 54 24 2a 66 89 54 24 2c", "visual state four replaces its final three-frame group with frame thirteen"],
  [0x004a5238, "a1 b8 4a 63 00 83 f8 01", "FUN_004a5180 reads DWORD[0x00634ab8] and compares it with source mode one"],
  [0x004a5251, "83 f8 02", "FUN_004a5180 selects the second mouse-interface control only for source mode two"],
  [0x004a52a0, "33 c0 66 39 41 10 0f 94 c0", "first mouse control reads true exactly when WORD[ECX+0x10] is zero"],
  [0x004a52b0, "33 c0 66 83 79 10 01 0f 94 c0", "second mouse control reads true exactly when WORD[ECX+0x10] is one"],
  [0x004a52c0, "66 c7 41 10 00 00", "first mouse control writes zero to WORD[ECX+0x10]"],
  [0x004a52d0, "66 c7 41 10 01 00", "second mouse control writes one to WORD[ECX+0x10]"],
  [0x004a52e7, "83 f8 01 75 07 a3 b8 4a 63 00", "mouse control synchronization writes global source mode one only after the first control returns exact one"],
  [0x004a52fa, "83 f8 01 75 0a c7 05 b8 4a 63 00 02 00 00 00", "mouse control synchronization writes global source mode two only after the second control returns exact one"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

export function reproduceSourceGameSpeed({ sourceState, baseIntervalMs }) {
  assertInteger(sourceState, "sourceState");
  assertPositiveInteger(baseIntervalMs, "baseIntervalMs");
  if (sourceState === 0) return baseIntervalMs + 14;
  if (sourceState === 1) return baseIntervalMs + 10;
  if (sourceState === 2) return baseIntervalMs;
  if (sourceState === 3) return baseIntervalMs - 10;
  return baseIntervalMs - 20;
}

export function extractGameplayInputSpeedSettingsEvidence({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  mouseSpritePath = DEFAULT_MOUSE_SPRITE_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const mouseSpriteBytes = readFileSync(mouseSpritePath);
  assertEqual(sha256(mouseSpriteBytes), EXPECTED_MOUSE_SPRITE_SHA256, `${mouseSpritePath} SHA-256`);
  const mouseSprite = parseSpriteLikeHeader(mouseSpriteBytes, mouseSpritePath);
  assertEqual(mouseSprite.width, 54, "mouseinterface.spr width");
  assertEqual(mouseSprite.height, 24, "mouseinterface.spr height");
  assertEqual(mouseSprite.frameCount, 18, "mouseinterface.spr frame count");

  const baseIntervalMs = 50;
  const speedStates = [0, 1, 2, 3, 4].map((state) => ({
    state,
    intervalMs: reproduceSourceGameSpeed({ sourceState: state, baseIntervalMs }),
    visualFrames: [1 + state * 3, 1 + state * 3, 1 + state * 3],
  }));

  return {
    question: "Which source-backed five-state game-speed interval/visual rules and mouse-interface resource/state controls can be ported without claiming web pointer semantics?",
    analysisStatus: "static-confirmed-for-game-speed-state-and-mouse-interface-control-state",
    reproductionStatus: "reproduction-complete-for-speed-interval-vectors-and-bounded-mouse-control-state",
    implementationStatus: "game-speed-preference-foundation-is-source-backed;-browser-storage-and-web-pointer-semantics-are-product-adaptations",
    sources: {
      executable: { path: relative(repositoryRoot, executablePath), sha256: EXPECTED_EXECUTABLE_SHA256 },
      mouseSprite: { path: relative(repositoryRoot, mouseSpritePath), sha256: EXPECTED_MOUSE_SPRITE_SHA256, width: mouseSprite.width, height: mouseSprite.height, frameCount: mouseSprite.frameCount },
    },
    gameSpeed: {
      intervalFunction: "FUN_0043f580 (0x0043f580-0x0043f5c6)",
      visualFunction: "FUN_004ac4c0 (0x004ac4c0-0x004ac5bb)",
      baseIntervalDword: "DWORD[0x004bdfbc]",
      baseIntervalMs,
      stateDword: "DWORD[0x00634acc]",
      states: speedStates,
      outsideStateIntervalMs: reproduceSourceGameSpeed({ sourceState: 5, baseIntervalMs }),
      productFixed50MsTickMultipliers: speedStates.map(({ state, intervalMs }) => ({ state, multiplier: baseIntervalMs / intervalMs })),
    },
    mouseInterface: {
      setupFunction: "FUN_004a5180 (0x004a5180-0x004a5264)",
      controls: [
        { sourceGlobalMode: 1, sourceControlState: 0, spriteFrames: [0, 1, 2], setter: "FUN_004a52c0", reader: "FUN_004a52a0" },
        { sourceGlobalMode: 2, sourceControlState: 1, spriteFrames: [3, 4, 5], setter: "FUN_004a52d0", reader: "FUN_004a52b0" },
      ],
      synchronizationFunction: "FUN_004a52e0 (0x004a52e0-0x004a530a)",
      unresolved: "The recovered controls establish only resource/state selection. Their player-facing labels and browser pointer routing are not source claims in this slice.",
    },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point)),
    testVectors: {
      baseIntervalMs,
      states: [...speedStates, { state: 5, intervalMs: reproduceSourceGameSpeed({ sourceState: 5, baseIntervalMs }) }],
    },
  };
}

function assertInteger(value, label) {
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
}

function assertPositiveInteger(value, label) {
  assertInteger(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractGameplayInputSpeedSettingsEvidence(), null, 2));
}
