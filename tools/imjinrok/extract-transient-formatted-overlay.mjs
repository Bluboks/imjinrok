#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  requireRawOffset,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const QUESTION =
  "what exactly does full function FUN_004567c0 at 0x004567c0-0x00457445 render for owner 0x00bcdd58 when called at the sole structured callsite 0x00447b23 in FUN_004475a0, what gates and field producers control it, and can its semantic identity be statically confirmed as the original gameplay bottom selection panel rather than inferred from current candidate names?";

const RAW_CODE_RANGES = [
  ["sole-frame-caller", 0x004475a0, 0x00447bb9, "81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c"],
  ["owner-field-writer", 0x00456630, 0x004567bd, "0c7e7e46adef48e73a9e7fd49bd60b923ce1ca84753f83edbae427612a1c4187"],
  ["formatted-overlay-renderer", 0x004567c0, 0x00457446, "8b373abab831078972be8d5a5d935e9f80bac32d9dd16e9694b6a3d2a4d04444"],
  ["base-string-helper", 0x00457460, 0x004575a9, "0019b6552638c7b0899513e0b8faa673289f699efadfd8b6ee7cff27bf3bb1f1"],
  ["owner-input-producer", 0x00459490, 0x0045acfd, "f6d20a3bbc4426f27cd430a743eb24e75812a544a034f85b3551b7fadfbec202"],
  ["base-string-helper-caller", 0x0046f140, 0x0046f3b5, "4e50b8b44bb4fbb7364345a5fb1ee848be9d193f5ba882975f5b1be426e004db"],
].map(([id, start, endExclusive, digest]) => ({
  id,
  start,
  endExclusive,
  sha256: digest,
}));

const FUNCTION_CATALOG = [
  ["0x004475a0", "0x004475a0-0x00447bb8", 1561, 418, "fab8bfe9d6a10a75b13e22823ab820abe6deecaa08ed3ae460ca2b9fd87e3cff"],
  ["0x00456630", "0x00456630-0x004567bc", 397, 122, "696c0d347ad4832f5d557ed5ff7ca2d4f9051b7c71c5450e4056f4ca9e9e4103"],
  ["0x004567c0", "0x004567c0-0x00457445", 3206, 1019, "4ada6da9298c76e6691513a66ee40db1dedc8392a625ccbb5cf375f01fe69d12"],
  ["0x00457460", "0x00457460-0x004575a8", 329, 121, "6c8b11743012a9e93108cde35c10109e26b4872601c9f3a567622a14eb166e65"],
  ["0x00459490", "0x00459490-0x0045acfc", 6253, 1566, "dbbec91b48e85ad1a0a926613751bba4367fba7774ecf2550c02170948a25d8a"],
  ["0x0046f140", "0x0046f140-0x0046f3b4", 629, 184, "9513954f3f512f94a20af7102927ff84a9d7d130cb51e6277e2a250ef5809dda"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({
  entry,
  bodyRange,
  bodySize,
  instructionCount,
  instructionSha256,
}));

const STATIC_EVIDENCE = [
  [0x00447b1e, "b9 58 dd bc 00 e8 98 ec 00 00", "the frame caller supplies owner 0x00bcdd58 to the sole direct renderer call"],
  [0x00456630, "66 8b 44 24 04 8b d1 66 8b 4c 24 08 53 66 89 82 82 00 00 00", "the producer stores its first two signed-WORD inputs at owner+0x82 and owner+0x84"],
  [0x00456655, "66 89 82 94 02 00 00 8a 44 24 28 56 57 8b 7c 24 18 66 89 8a 96 02 00 00 66 8b 4c 24 28 88 82 9c 02 00 00 66 8b 44 24 2c bb 01 00 00 00 85 ff 66 89 9a 80 00 00 00 66 89 8a 98 02 00 00 66 89 82 9a 02 00 00", "the producer writes four signed WORD values, the signed byte selector, and dirty WORD one before optional string copies"],
  [0x004566f5, "89 9a 88 00 00 00 eb 0a c7 82 88 00 00 00 00 00 00 00", "the first optional line pointer sets owner+0x88 to exact one or zero"],
  [0x004567d2, "66 39 9e 80 00 00 00 89 5c 24 10 89 5c 24 20 89 5c 24 24 0f 84 50 0c 00 00 66 89 9e 80 00 00 00", "the renderer returns immediately when dirty WORD is zero and otherwise clears it before any surface work"],
  [0x00456848, "8a 86 9c 02 00 00 84 c0 74 22 8b 1d 2c 72 4b 00 8d 4c 24 40 0f be d0 8d 86 94 00 00 00 52 50 68 98 de 4b 00 51 ff d3", "a nonzero signed byte formats owner+0x94 as %s(%c); zero selects %s"],
  [0x004568ba, "66 8b 86 94 02 00 00 8b 4c 24 14 8b 54 24 18 89 4c 24 28 66 85 c0 89 54 24 1c 74 58", "the first optional signed WORD value is admitted only when nonzero after primary-string measurement"],
  [0x00456a6e, "8b 44 24 20 66 39 44 24 28 7d 04 89 44 24 28 8b 4c 24 24 8b 44 24 1c 03 c1", "layout takes the wider of the primary/extra lines and numeric row, then adds the numeric-row height"],
  [0x00456b23, "0f bf dd 0f bf ff 8b cb 8b c7 83 c1 0f 83 c0 0f", "requested transient surface dimensions are total measured height plus 15 and maximum measured width plus 15"],
  [0x00456b19, "33 db 89 5c 24 30 89 5c 24 34 0f bf dd 0f bf ff 8b cb 8b c7 83 c1 0f 83 c0 0f 89 4c 24 3c 8b 0d 74 92 54 00 6a 00 68 00 00 00 01 89 44 24 40 a1 70 92 54 00 6a 00 51 8b 10 8d 4c 24 40 51 50 ff 52 14", "the renderer initializes RECT left/top to zero and right/bottom to requested dimensions, then passes the full RECT to unresolved vtable method +0x14"],
  [0x00456b5f, "66 8b 54 24 3c 66 29 96 84 00 00 00 0f bf c1 99 2b c2 d1 f8 f7 d8 66 01 86 82 00 00 00", "placement subtracts the signed low WORD of post-call RECT.bottom from owner+0x84 and half the signed low WORD of post-call RECT.right from owner+0x82"],
  [0x00456b7c, "66 8b 96 82 00 00 00 a1 1c 94 55 00 0f bf d2 03 d1 8d 68 ff 3b d5 7e 0a 2b c1 48 66 89 86 82 00 00 00", "the first coordinate is bounded against runtime dimension 0x0055941c with a one-pixel far-edge margin"],
  [0x00456be7, "8b c3 99 2b c2 8b e8 8b c1 99 2b c2 8d 54 24 10 8b d8 a1 70 92 54 00 d1 fd 8b 08 52 d1 fb 50 2b dd ff 51 44", "block top is trunc(post-call RECT.bottom/2) minus trunc(totalHeight/2), using separate signed truncations before draw-HDC acquisition"],
  [0x00456c51, "8b c7 99 2b c2 8b c8 8b 44 24 38 99 2b c2 8b e8 8a 86 9c 02 00 00 d1 f9 d1 fd 2b e9", "block left is trunc(post-call RECT.right/2) minus trunc(maxWidth/2), using separate signed truncations"],
  [0x00456c79, "33 d2 c7 44 24 2c 04 00 00 00 89 54 24 1c eb 04", "the nonzero selector draws the formatted primary value as four ordered segments"],
  [0x00456e81, "8b 44 24 38 8b 6c 24 18 8b 4c 24 28 03 dd 99 2b c2 8b e8 d1 fd 2b e9", "the numeric row resets to the same block-left expression after advancing below primary text"],
  [0x00456e98, "66 83 be 94 02 00 00 00 0f 84 23 01 00 00", "each numeric WORD is skipped only when exactly zero"],
  [0x00456ecb, "8b 0d 0c ba 8c 00 8b 15 d8 b2 8c 00 a1 20 ae 8c 00 03 d1 8b 0d 1c ae 8c 00", "a successful first numeric icon lock uses runtime frame offset and icon dimensions before its text"],
  [0x00457358, "8b 44 24 38 8b 6c 24 24 99 2b c2 03 dd 8b d0 8b 44 24 28 d1 fa 2b d0", "the extra-line loop resets every admitted line to the same block-left expression rather than centering each line"],
  [0x0045738b, "8b 44 24 1c 83 38 01 75 49", "each of three additional lines is read and drawn only when its DWORD presence field equals one"],
  [0x00457409, "56 8b ce e8 4f 00 00 00 0f bf 8e 84 00 00 00 0f bf 86 82 00 00 00 8b 15 80 95 54 00 8d 7c 24 30 6a 11 57 8b 3d 70 92 54 00 8b 32 57 51 50 52 ff 56 1c", "after content handling the renderer invokes the cached fixed-coordinate base-string helper and passes the full post-call RECT to the final positioned blit"],
  [0x00457460, "83 ec 08 83 c9 ff 33 c0 55 8b 6c 24 10 56 57 8b fd f2 ae f7 d1 49 0f 84 24 01 00 00 85 ed 0f 84 1c 01 00 00 8b 3d 80 5f 7c 00 a1 c4 2d 5e 00 3b c7 75 3e 53 8b f5 b8 c4 29 5e 00 8a 10 8a 1e 8a ca 3a d3 75 1e 84 c9 74 16 8a 50 01 8a 5e 01 8a ca 3a d3 75 0e 83 c0 02 83 c6 02 84 c9 75 dc 33 c0 eb 05 1b c0 83 d8 ff 85 c0 5b 0f 85 cf 00 00 00", "the helper scans length before its null test, returns for empty input, proceeds directly on context mismatch, proceeds on equal cached bytes, and returns on unequal bytes when context matches"],
  [0x004574d1, "89 3d c4 2d 5e 00 8b fd 83 c9 ff 33 c0 f2 ae f7 d1 2b f9 8d 54 24 18 8b c1 8b f7 bf c4 29 5e 00 52 c1 e9 02 f3 a5 8b c8 a1 80 95 54 00 83 e1 03 50 f3 a4 8b 08 ff 51 44 85 c0 0f 85 8f 00 00 00", "the helper updates context and cached bytes before target 0x00549580 HDC acquisition; acquisition failure retains those mutations"],
  [0x00457511, "a1 9c 6d c0 00 8b 4c 24 18 50 51 ff 15 54 70 4b 00 8b 54 24 18 68 00 00 ff 00 52 ff 15 44 70 4b 00 8b 44 24 18 68 fa fa fa 00 50 ff 15 48 70 4b 00 8b 4c 24 18 6a 01 51 ff 15 4c 70 4b 00", "the helper configures its recovered GDI state after successful HDC acquisition"],
  [0x0045754f, "8b fd 83 c9 ff 33 c0 8d 54 24 0c f2 ae 8b 44 24 18 52 f7 d1 49 51 55 50 ff 15 58 70 4b 00 8b fd 83 c9 ff 33 c0 f2 ae f7 d1 49 51 8b 4c 24 1c 55 68 5e 01 00 00 68 c8 00 00 00 51 ff 15 50 70 4b 00 a1 80 95 54 00 8b 4c 24 18 51 50 8b 10 ff 52 68", "the helper measures the byte string but does not consume SIZE, draws it at x=200 y=350, and releases the target HDC"],
  [0x0045a996, "66 a1 34 4e 63 00 6a 00 6a 00 57", "one producer path begins the 12-argument owner write with two absent trailing lines and one conditional formatted line"],
  [0x0045acab, "8b 54 24 18 8b 86 08 3f 5e 00 6a 00 66 8b 0d 10 40 aa 00 6a 00 57 6a 00 6a 00 52 66 8b 15 12 40 aa 00 53 55 6a 00 50 51 52 b9 58 dd bc 00 e8 52 b9 ff ff", "the second producer path supplies coordinates, primary pointer, three signed values, and one optional line while zeroing the other inputs"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SETS = [
  ["FUN_004567c0 callers", "to", "0x004567c0", 1, "80e9cdf106a698ec6f02a31415e1cb85f9eabd82401568230ecf8460a9cec4a0"],
  ["FUN_00456630 callers", "to", "0x00456630", 2, "e18c3682a28bf08d9c7bd4c4b3ef9a9a3e928dec9a8dac2cfea928297e67fe9a"],
  ["FUN_00457460 callers", "to", "0x00457460", 2, "0b85dc71938c8450ee4f8e7fc44cbb22e9c04cd898d1f291f82975f6420f194a"],
  ["FUN_00459490 callers", "to", "0x00459490", 1, "9d09b0b25b4ecf842b832bfef9ef370a8bb724e53470cc0770ee4cfd8dce310e"],
  ["FUN_004567c0 outgoing", "fromFunctionEntry", "0x004567c0", 212, "9862079da8d5e3a4d6c2e9c0c9344f0f29618d9ece14c0a4a89c9ad8460b1684"],
  ["FUN_00456630 outgoing", "fromFunctionEntry", "0x00456630", 11, "8e6517c81e364d3520ecb13deff2b2e6dccc2f56f0cf957361e051a78249e36f"],
  ["FUN_004475a0 outgoing", "fromFunctionEntry", "0x004475a0", 233, "81f7e6c7c7aba4adaa5ee2e3b18ac6e26672481a6bd8aeb6a68ef4918af07dc9"],
  ["FUN_00459490 outgoing", "fromFunctionEntry", "0x00459490", 848, "eb8e49be85f069a15dfaef4be5c2e7f08caa605bf40ce61dac5d9736f8aeb05f"],
  ["cached context 0x005e2dc4 refs", "to", "0x005e2dc4", 2, "ac549747e647f55a8457758f48d6639db4195ef04b8ebbbcb00c0bff2ce081d7"],
  ["cached bytes 0x005e29c4 refs", "to", "0x005e29c4", 4, "fda82db1ee6ac6c439a75f536da5acf0eebabadf9d543ea0966b0e12a8e847c4"],
  ["FUN_00457460 outgoing", "fromFunctionEntry", "0x00457460", 32, "86d0bbfb0719c73289bb9c4d3b4c20bb15a6e11807f01a03841349f87f50754b"],
  ["owner 0x00bcdd58 direct refs", "to", "0x00bcdd58", 4, "4ae5cf834395b0c1fadfad1714523f8f82bb9f41a373ef406fdb354f13e4656b"],
].map(([label, key, value, count, digest]) => ({ label, key, value, count, digest }));

const IMPORTS = [
  [0x004b7044, 0x004b97f4, 461, "SetBkColor"],
  [0x004b7048, 0x004b97d0, 499, "SetTextColor"],
  [0x004b704c, 0x004b97c4, 462, "SetBkMode"],
  [0x004b7050, 0x004b97b8, 517, "TextOutA"],
  [0x004b7054, 0x004b97a8, 455, "SelectObject"],
  [0x004b7058, 0x004b9790, 366, "GetTextExtentPoint32A"],
  [0x004b716c, 0x004b9354, 776, "lstrlenA"],
  [0x004b722c, 0x004b95e6, 684, "wsprintfA"],
].map(([iatVa, hintNameVa, hint, name]) => ({ iatVa, hintNameVa, hint, name }));

const FORMAT_STRINGS = [
  [0x004bde80, ")"],
  [0x004bde84, "%c"],
  [0x004bde88, "("],
  [0x004bde8c, " %d "],
  [0x004bde94, "%s"],
  [0x004bde98, "%s(%c)"],
].map(([va, value]) => ({ va, value }));

export function extractTransientFormattedOverlay({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sourceExecutableSha256 = sha256(buffer);
  assertEqual(sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  assertEqual(functions.sourceSha256, sourceExecutableSha256, `${functionsPath} sourceSha256`);
  assertEqual(references.sourceSha256, sourceExecutableSha256, `${referencesPath} sourceSha256`);

  return {
    question: QUESTION,
    sourceExecutableSha256,
    analysisStatus: "static-confirmed-render-control-flow-with-bounded-producer-alias-scope",
    reproductionStatus:
      "scoped-reproduction-complete-with-supplied-text-metrics-post-call-rect-and-cache-gated-base-helper",
    implementationStatus: "analysis-only-no-product-change",
    semanticConclusion:
      "the complete data flow disproves the fixed bottom-selection-panel candidate label: FUN_004567c0 builds and blits a one-shot measured surface positioned from producer coordinates, then invokes FUN_00457460, whose unusual cache gate conditionally draws the owner base byte string at fixed target coordinates x=200,y=350. This combined behavior still does not prove a persistent gameplay bottom selection panel, and the report does not promote a tooltip or selection-stat meaning.",
    completenessBoundary:
      "complete for FUN_004567c0 and its sole structured caller, the only structured owner writer FUN_00456630 and both writer callsites, and whole helper FUN_00457460 with its complete two-caller structured set; 0x0046f253/FUN_0046f140 is boundary-only and that second caller's UI meaning is not expanded; arbitrary alias writes and semantic identities behind tables or unresolved indirect resource methods are not globally excluded",
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SETS.map((expected) => verifyReferenceSet(references, expected)),
    imports: verifyImports(buffer, image),
    formatStrings: verifyFormatStrings(buffer, image),
    ownerFields: {
      field_0x00: "NUL-terminated byte string copied into a 128-byte owner region from producer argument 4 (null selects an empty static string); consumed by FUN_00457460, not by the transient surface text rows",
      field_0x80: "WORD one written by FUN_00456630; exact-zero renderer no-op gate; cleared before initial HDC acquisition",
      field_0x82: "signed WORD producer coordinate; renderer subtracts half the signed low WORD of post-call RECT.right, while the far-edge clamp compares the full post-call RECT.right with runtime dimension 0x0055941c",
      field_0x84: "signed WORD producer coordinate; renderer subtracts the signed low WORD of post-call RECT.bottom, while the far-edge clamp compares the full post-call RECT.bottom with runtime dimension 0x00559420",
      field_0x88_to_0x90: "three DWORD exact-one presence flags for byte-string buffers at +0x114/+0x194/+0x214",
      field_0x94: "primary NUL-terminated byte string in a 128-byte owner region; a null producer pointer retains prior buffer bytes",
      field_0x114_to_0x293: "three 128-byte-stride optional NUL-terminated byte-string buffers; inactive buffers are retained but unread",
      field_0x294_to_0x29a: "four signed WORD values; each exact zero suppresses its icon/text branch",
      field_0x29c: "signed byte selector; zero formats %s, nonzero formats and draws %s(%c) in four segments",
    },
    geometry:
      "supplied GDI SIZE values produce maxWidth and totalHeight, each bounded to the supported non-overflow signed-WORD subset before native low-WORD sign extension. RECT starts as {0,0,maxWidth+15,totalHeight+15}; supplied synthetic post-call RECT.right/bottom control placement and block alignment. Block left/top use separate truncations trunc(right/2)-trunc(maxWidth/2) and trunc(bottom/2)-trunc(totalHeight/2); owner screen coordinates use signed low-WORD right/bottom and clamp with the full right/bottom to a one-pixel far-edge margin.",
    baseStringHelper:
      "FUN_00457460 scans input length before its null check. Empty returns. A changed 0x007c5f80 context proceeds; with equal context, equal cached bytes also proceed but different bytes return. Proceeding paths update 0x005e2dc4/0x005e29c4 before HDC acquisition, then on success configure GDI, call GetTextExtentPoint32A without using SIZE, TextOutA at x=200,y=350, and release the HDC.",
    unresolved:
      "post-call RECT mutation and failure convention of indirect vtable method +0x14, actual runtime strings, GDI glyph metrics, font realization, resource-method identities, icon meanings and table-backed producer concepts are not statically bounded by this slice",
  };
}

export function reproduceOverlayProduction(input) {
  const state = copyOwnerState(input.initial);
  assertSignedWord(input.coordinateX, "coordinateX");
  assertSignedWord(input.coordinateY, "coordinateY");
  assertSignedWordArray(input.values, "values", 4);
  assertSignedByte(input.selectorByte, "selectorByte");
  state.coordinateX = input.coordinateX;
  state.coordinateY = input.coordinateY;
  state.values = [...input.values];
  state.selectorByte = input.selectorByte;
  state.dirtyWord = 1;
  if (input.primaryText !== null) {
    state.primaryText = assertBoundedByteString(input.primaryText, "primaryText", 127);
  }
  state.baseText = input.baseText === null
    ? ""
    : assertBoundedByteString(input.baseText, "baseText", 127);
  assertFixedArray(input.extraTexts, "extraTexts", 3);
  state.extraLines = input.extraTexts.map((text, index) => {
    if (text === null) {
      return { activeState: 0, text: state.extraLines[index].text };
    }
    return {
      activeState: 1,
      text: assertBoundedByteString(text, `extraTexts[${index}]`, 127),
    };
  });
  return state;
}

export function reproduceTransientFormattedOverlay(input) {
  const state = copyOwnerState(input.initial);
  assertSignedWord(state.dirtyWord, "initial.dirtyWord");
  if (state.dirtyWord === 0) {
    return { status: "dirty-zero-no-op", operations: [], final: state };
  }
  state.dirtyWord = 0;
  const operations = [{ type: "clear-dirty-word" }];
  assertBoolean(input.initialHdcAcquired, "initialHdcAcquired");
  const measurementQueue = createMeasurementQueue(input.measurements);
  let maxWidth = 0;
  let totalHeight = 0;
  let numericRowWidth = 0;
  let numericRowHeight = 0;
  let formattedPrimary;
  if (input.initialHdcAcquired) {
    validateReachedContent(state);
    formattedPrimary = formatPrimary(state.primaryText, state.selectorByte);
    const primarySize = measurementQueue.measure(formattedPrimary);
    maxWidth = primarySize.width;
    totalHeight = primarySize.height;
    for (const value of state.values) {
      if (value === 0) continue;
      const text = formatNumeric(value);
      const size = measurementQueue.measure(text);
      assertNonnegativeInt32(input.iconWidth, "iconWidth");
      assertNonnegativeInt32(input.iconHeight, "iconHeight");
      numericRowWidth = addSupported(numericRowWidth, addSupported(input.iconWidth, size.width));
      numericRowHeight = Math.max(numericRowHeight, input.iconHeight, size.height);
    }
    for (let index = 0; index < state.extraLines.length; index += 1) {
      const line = state.extraLines[index];
      assertUnsignedDword(line.activeState, `initial.extraLines[${index}].activeState`);
      if (line.activeState !== 1) continue;
      const text = assertBoundedByteString(
        line.text,
        `initial.extraLines[${index}].text`,
        127,
      );
      const size = measurementQueue.measure(text);
      maxWidth = Math.max(maxWidth, size.width);
      totalHeight = addSupported(totalHeight, size.height);
    }
    maxWidth = Math.max(maxWidth, numericRowWidth);
    totalHeight = addSupported(totalHeight, numericRowHeight);
    operations.push({
      type: "measure-content",
      formattedPrimary,
      maxWidth,
      totalHeight,
      numericRowWidth,
      numericRowHeight,
    });
  } else {
    operations.push({ type: "initial-hdc-acquisition-failed" });
  }
  measurementQueue.assertSizingConsumed();

  assertSupportedDerivedWord(maxWidth, "derived maxWidth");
  assertSupportedDerivedWord(totalHeight, "derived totalHeight");
  const requestedWidth = maxWidth + 15;
  const requestedHeight = totalHeight + 15;
  const postCallRect = validatePostCallRect(input.postCallRect);
  assertPositiveSupportedDimension(input.screenWidth, "screenWidth");
  assertPositiveSupportedDimension(input.screenHeight, "screenHeight");
  operations.push({
    type: "request-transient-surface",
    initialRect: { left: 0, top: 0, right: requestedWidth, bottom: requestedHeight },
    postCallRect: structuredClone(postCallRect),
    requestedWidth,
    requestedHeight,
  });
  assertSignedWord(state.coordinateX, "initial.coordinateX");
  assertSignedWord(state.coordinateY, "initial.coordinateY");
  state.coordinateX = clampPosition(
    toSignedWord(state.coordinateX - truncTowardZero(toSignedWord(postCallRect.right) / 2)),
    postCallRect.right,
    input.screenWidth,
  );
  state.coordinateY = clampPosition(
    toSignedWord(state.coordinateY - toSignedWord(postCallRect.bottom)),
    postCallRect.bottom,
    input.screenHeight,
  );
  operations.push({
    type: "position-transient-surface",
    x: state.coordinateX,
    y: state.coordinateY,
    postCallRect: structuredClone(postCallRect),
  });

  assertBoolean(input.drawHdcAcquired, "drawHdcAcquired");
  if (input.drawHdcAcquired) {
    if (!input.initialHdcAcquired) {
      throw new Error("drawHdcAcquired=true after initial HDC failure requires unresolved content dimensions");
    }
    drawContent({
      input,
      state,
      operations,
      measurementQueue,
      formattedPrimary,
      maxWidth,
      totalHeight,
      numericRowHeight,
      postCallRect,
    });
  } else {
    operations.push({ type: "draw-hdc-acquisition-failed" });
  }
  measurementQueue.assertFullyConsumed();
  const baseStringHelper = reproduceBaseStringHelper({
    text: state.baseText,
    currentContext: input.baseTextCurrentContext,
    cache: input.baseTextCache,
    hdcAcquired: input.baseTextHdcAcquired,
  });
  operations.push(...baseStringHelper.operations);
  operations.push({
    type: "blit-transient-surface",
    x: state.coordinateX,
    y: state.coordinateY,
    postCallRect: structuredClone(postCallRect),
  });
  return {
    status: "rendered",
    operations,
    final: state,
    finalBaseTextCache: baseStringHelper.finalCache,
  };
}

function drawContent({
  input,
  state,
  operations,
  measurementQueue,
  formattedPrimary,
  maxWidth,
  totalHeight,
  numericRowHeight,
  postCallRect,
}) {
  const blockLeft =
    truncTowardZero(postCallRect.right / 2) - truncTowardZero(maxWidth / 2);
  let x = blockLeft;
  let y =
    truncTowardZero(postCallRect.bottom / 2) - truncTowardZero(totalHeight / 2);
  if (state.selectorByte === 0) {
    operations.push({ type: "draw-primary-text", text: state.primaryText, x, y });
  } else {
    const segments = [
      { text: state.primaryText, color: "default" },
      { text: "(", color: "default" },
      { text: String.fromCharCode(state.selectorByte & 0xff), color: "highlight-0x00b4dce1" },
      { text: ")", color: "default" },
    ];
    for (const segment of segments) {
      operations.push({ type: "draw-primary-segment", ...segment, x, y });
      x = addSupported(x, measurementQueue.measure(segment.text).width);
    }
  }
  y = addSupported(y, measurementQueue.measure(formattedPrimary).height);
  x = blockLeft;
  let numericInputsReached = false;
  for (let index = 0; index < state.values.length; index += 1) {
    const value = state.values[index];
    if (value === 0) continue;
    if (!numericInputsReached) {
      assertFixedArray(input.numericIconLockSucceeded, "numericIconLockSucceeded", 4);
      assertFixedArray(input.numericHdcReacquired, "numericHdcReacquired", 4);
      numericInputsReached = true;
    }
    assertBoolean(input.numericIconLockSucceeded[index], `numericIconLockSucceeded[${index}]`);
    operations.push({ type: "release-draw-hdc-before-icon", index });
    if (input.numericIconLockSucceeded[index]) {
      operations.push({ type: "draw-runtime-icon", index, x, y });
      x = addSupported(x, input.iconWidth);
    } else {
      operations.push({ type: "numeric-icon-lock-failed", index });
    }
    assertBoolean(input.numericHdcReacquired[index], `numericHdcReacquired[${index}]`);
    operations.push({ type: "reacquire-draw-hdc-after-icon", index });
    if (!input.numericHdcReacquired[index]) {
      return unresolvedFailure(
        operations,
        `numeric HDC reacquisition ${index} failed; the original ignores the result`,
      );
    }
    const text = formatNumeric(value);
    operations.push({ type: "draw-numeric-text", index, text, x, y });
    x = addSupported(x, measurementQueue.measure(text).width);
  }
  y = addSupported(y, numericRowHeight);
  x = blockLeft;
  for (let index = 0; index < state.extraLines.length; index += 1) {
    const line = state.extraLines[index];
    if (line.activeState !== 1) continue;
    operations.push({ type: "draw-extra-line", index, text: line.text, x, y });
    y = addSupported(y, measurementQueue.measure(line.text).height);
  }
}

function unresolvedFailure(operations, detail) {
  operations.push({ type: "unresolved-original-failure-boundary", detail });
  throw new Error(detail);
}

function reproduceBaseStringHelper({ text, currentContext, cache, hdcAcquired }) {
  if (text === null) {
    throw new TypeError(
      "initial.baseText null would be dereferenced by FUN_00457460 length scan before its null guard",
    );
  }
  const baseText = assertBoundedByteString(text, "initial.baseText", 127);
  if (baseText.length === 0) {
    return {
      operations: [{ type: "base-text-empty-no-op" }],
      finalCache: { status: "unread" },
    };
  }
  assertUnsignedDword(currentContext, "baseTextCurrentContext");
  const cachedContext = validateBaseTextCacheContext(cache);
  if (currentContext === cachedContext) {
    const cachedText = assertBoundedByteString(
      cache.text,
      "baseTextCache.text",
      127,
    );
    if (baseText !== cachedText) {
      return {
        operations: [{
          type: "base-text-same-context-different-cache-no-op",
          currentContext,
          text: baseText,
        }],
        finalCache: { context: cachedContext, text: cachedText },
      };
    }
  }
  const finalCache = { context: currentContext, text: baseText };
  const operations = [{
    type: "update-base-text-cache-before-hdc",
    context: currentContext,
    text: baseText,
  }];
  assertBoolean(hdcAcquired, "baseTextHdcAcquired");
  if (!hdcAcquired) {
    operations.push({ type: "base-text-hdc-acquisition-failed" });
    return { operations, finalCache };
  }
  operations.push({
    type: "configure-base-text-gdi",
    font: "global-0x00c06d9c",
    backgroundColor: 0x00ff0000,
    textColor: 0x00fafafa,
    backgroundMode: 1,
  });
  operations.push({
    type: "measure-base-text-result-unused",
    text: baseText,
  });
  operations.push({
    type: "draw-base-text",
    text: baseText,
    x: 200,
    y: 350,
  });
  operations.push({ type: "release-base-text-hdc" });
  return { operations, finalCache };
}

function formatPrimary(primaryText, selectorByte) {
  const formatted = selectorByte === 0
    ? primaryText
    : `${primaryText}(${String.fromCharCode(selectorByte & 0xff)})`;
  return assertBoundedByteString(formatted, "formatted primary text", 127);
}

function formatNumeric(value) {
  return ` ${value} `;
}

function createMeasurementQueue(rawMeasurements) {
  assertFixedArrayMinimum(rawMeasurements, "measurements", 0);
  let index = 0;
  let sizingLimit;
  return {
    measure(expectedText) {
      const measurement = rawMeasurements[index];
      if (measurement === undefined) {
        throw new Error(`missing supplied GDI measurement ${index} for ${JSON.stringify(expectedText)}`);
      }
      if (measurement.text !== expectedText) {
        throw new Error(
          `supplied GDI measurement ${index} text mismatch: expected ${JSON.stringify(expectedText)}, got ${JSON.stringify(measurement.text)}`,
        );
      }
      assertNonnegativeInt32(measurement.width, `measurements[${index}].width`);
      assertNonnegativeInt32(measurement.height, `measurements[${index}].height`);
      index += 1;
      return { width: measurement.width, height: measurement.height };
    },
    assertSizingConsumed() {
      sizingLimit = index;
    },
    assertFullyConsumed() {
      if (index !== rawMeasurements.length) {
        throw new Error(
          `supplied GDI measurement count mismatch: consumed ${index}, received ${rawMeasurements.length}`,
        );
      }
      if (sizingLimit === undefined) {
        throw new Error("measurement sizing boundary was not recorded");
      }
    },
  };
}

function copyOwnerState(value) {
  if (value === null || typeof value !== "object") {
    throw new TypeError("initial must be an owner state object");
  }
  return structuredClone(value);
}

function validateReachedContent(state) {
  state.primaryText = assertBoundedByteString(state.primaryText, "initial.primaryText", 127);
  assertSignedByte(state.selectorByte, "initial.selectorByte");
  assertSignedWordArray(state.values, "initial.values", 4);
  assertFixedArray(state.extraLines, "initial.extraLines", 3);
}

function clampPosition(position, size, limit) {
  let result = position;
  if (result + size > limit - 1) result = limit - size - 1;
  if (result < 0) result = 0;
  return toSignedWord(result);
}

function validatePostCallRect(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("postCallRect must be a RECT object");
  }
  assertSignedDword(value.left, "postCallRect.left");
  assertSignedDword(value.top, "postCallRect.top");
  assertPositiveSupportedDimension(value.right, "postCallRect.right");
  assertPositiveSupportedDimension(value.bottom, "postCallRect.bottom");
  return {
    left: value.left,
    top: value.top,
    right: value.right,
    bottom: value.bottom,
  };
}

function validateBaseTextCacheContext(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("baseTextCache must be a cache object");
  }
  assertUnsignedDword(value.context, "baseTextCache.context");
  return value.context;
}

function addSupported(left, right) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result > 0x7fff_ffff) {
    throw new RangeError(`derived layout value exceeds the supported signed LONG range: ${result}`);
  }
  return result;
}

function assertSupportedDerivedWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fff) {
    throw new RangeError(
      `${label} must fit the scoped nonnegative signed-WORD subset before native low-WORD sign extension`,
    );
  }
}

function truncTowardZero(value) {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

function toSignedWord(value) {
  const bits = value & 0xffff;
  return bits >= 0x8000 ? bits - 0x10000 : bits;
}

function assertBoundedByteString(value, label, maximumBytes) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new TypeError(`${label} must be a NUL-free reproduced byte string`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0xff) {
      throw new RangeError(
        `${label} must use one JavaScript code unit per reproduced source byte`,
      );
    }
  }
  if (value.length > maximumBytes) {
    throw new RangeError(
      `${label} must fit ${maximumBytes} bytes plus NUL in its bounded non-overflow buffer`,
    );
  }
  return value;
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${label} must fit a signed WORD`);
  }
}

function assertSignedDword(value, label) {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new RangeError(`${label} must fit a signed DWORD`);
  }
}

function assertSignedWordArray(value, label, length) {
  assertFixedArray(value, label, length);
  value.forEach((item, index) => assertSignedWord(item, `${label}[${index}]`));
}

function assertSignedByte(value, label) {
  if (!Number.isInteger(value) || value < -0x80 || value > 0x7f) {
    throw new RangeError(`${label} must fit a signed byte`);
  }
}

function assertUnsignedDword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be a canonical unsigned DWORD`);
  }
}

function assertNonnegativeInt32(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) {
    throw new RangeError(`${label} must be a nonnegative signed LONG`);
  }
}

function assertPositiveSupportedDimension(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 0x7fff) {
    throw new RangeError(`${label} must be in the supported positive signed-WORD layout range`);
  }
}

function assertFixedArray(value, label, length) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} must contain exactly ${length} items`);
  }
}

function assertFixedArrayMinimum(value, label, minimum) {
  if (!Array.isArray(value) || value.length < minimum) {
    throw new TypeError(`${label} must be an array with at least ${minimum} items`);
  }
}

function verifyFunctionCatalog(functions) {
  if (!Array.isArray(functions.functions)) {
    throw new TypeError("functions.json must contain a functions array");
  }
  return FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions.find(({ entry }) => entry === expected.entry);
    if (!actual) throw new Error(`functions.json is missing ${expected.entry}`);
    assertEqual(actual.bodyRanges?.length, 1, `${expected.entry} body range count`);
    for (const field of ["bodyRange", "bodySize", "instructionCount", "instructionSha256"]) {
      const actualValue = field === "bodyRange" ? actual.bodyRanges[0] : actual[field];
      assertEqual(actualValue, expected[field], `${expected.entry} ${field}`);
    }
    return expected;
  });
}

function verifyReferenceSet(references, expected) {
  if (!Array.isArray(references.references)) {
    throw new TypeError("references.json must contain a references array");
  }
  const projection = references.references
    .filter((reference) => reference[expected.key] === expected.value)
    .map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const digest = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
  assertEqual(projection.length, expected.count, `${expected.label} structured reference count`);
  assertEqual(digest, expected.digest, `${expected.label} structured reference digest`);
  return {
    label: expected.label,
    key: expected.key,
    value: expected.value,
    count: projection.length,
    sha256: digest,
    references: projection,
  };
}

function verifyImports(buffer, image) {
  return IMPORTS.map((expected) => {
    const iatOffset = requireRawOffset(image, expected.iatVa);
    assertEqual(
      buffer.readUInt32LE(iatOffset),
      expected.hintNameVa - image.imageBase,
      `${expected.name} IAT hint/name RVA`,
    );
    const hintNameOffset = requireRawOffset(image, expected.hintNameVa);
    assertEqual(buffer.readUInt16LE(hintNameOffset), expected.hint, `${expected.name} import hint`);
    const name = readCString(buffer, hintNameOffset + 2);
    assertEqual(name, expected.name, `${expected.name} import name`);
    return { name, iatVa: toHex(expected.iatVa) };
  });
}

function verifyFormatStrings(buffer, image) {
  return FORMAT_STRINGS.map(({ va, value }) => {
    const actual = readCString(buffer, requireRawOffset(image, va));
    assertEqual(actual, value, `${toHex(va)} format string`);
    return { va: toHex(va), value };
  });
}

function readCString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  if (end === buffer.length) throw new Error(`string at raw offset ${toHex(offset)} is not NUL-terminated`);
  return buffer.subarray(offset, end).toString("ascii");
}

function parseArguments(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    const [name, path] = argument.includes("=")
      ? argument.split("=", 2)
      : [argument, argv[index + 1]];
    if (!argument.includes("=")) index += 1;
    if (name === "--executable") options.executablePath = path;
    else if (name === "--functions") options.functionsPath = path;
    else if (name === "--references") options.referencesPath = path;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

const currentPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentPath) {
  const options = parseArguments(process.argv.slice(2));
  const report = extractTransientFormattedOverlay(options);
  process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : report.semanticConclusion}\n`);
}
