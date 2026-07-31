#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SCRIPT_PATH = "original/imjinrok2/script/K0110";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_K0110_SHA256 =
  "d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8";

export const OBJECTIVE_RECT = Object.freeze({
  left: 188, top: 290, right: 466, bottom: 376,
});
export const TITLE_RECT = Object.freeze({
  left: 188, top: 65, right: 466, bottom: 95,
});

const COMMAND_ARG_COUNTS = Object.freeze({
  CHANGEMUSIC: 1, CHANGETITLE: 1, SETDELAYTIME: 1, TITLE: 1, OBJECTIVE: 2, SPEECH: 4,
});

const RAW_CODE_RANGES = [
  ["command-lookup", 0x00482590, 0x0048285d, "554cf9b9abd60b96288e42e37c7defb9aa64f385a9b1451299598e24eb32ac33"],
  ["record-dispatcher", 0x00482860, 0x00482edb, "3c7f2ca5e6cbf18ae520d2e5b036771a115ec3758c175600dbbef9aa50a06153"],
  ["record-consumer", 0x004830f0, 0x004833bd, "7550c0a70805130394c37c3f1a1bc5e30dbb34abc5b7da7032321445ad0c6df1"],
  ["record-readiness", 0x00483500, 0x00483658, "0bd213e0149996c62b950a55d2973a8e038e60d2b863ca2698b61069b7f7bd3f"],
  ["objective-overlay", 0x004a88f0, 0x004a89de, "0f793d13f8118a747fd59627f340392d02b1ad1012a9c47fb338d2964940b26e"],
  ["title-overlay", 0x004a89e0, 0x004a8abc, "c6cf2e355d2970b0683d253c32c422a5913525719f542bf116c47bdb0e862e41"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const FUNCTION_CATALOG = [
  ["0x00482590", "0x00482590-0x0048285c", 717, 169, "e34141e233eb0090dfea1c2384c3dddf5257ff237eb62376930ac1dbb57d9ec8"],
  ["0x00482860", "0x00482860-0x00482eda", 1659, 456, "536a838eb9dba533ab3fd11a4b617f20fd75ae5d62a5c0e28db9bb2500d2e5b7"],
  ["0x004830f0", "0x004830f0-0x004833bc", 717, 218, "3f6cb76417e277a4c7c96357e081495e76c553e6ed3064ffeafa904bbc81272a"],
  ["0x00483500", "0x00483500-0x00483657", 344, 107, "c7612339d3bf49b021f8122959e6a6c1d18ada693b4a0fd689ca7234fb2cd1e9"],
  ["0x004a88f0", "0x004a88f0-0x004a89dd", 238, 75, "2ad0d78914605f3393b3d5a11cc25be6bad98b6d8276b6263e08cb6a314b5e4d"],
  ["0x004a89e0", "0x004a89e0-0x004a8abb", 220, 77, "20945c0abdc6e797e257c8390f19b45b40ce1b010f9588d49da1d57b5e1a0dc9"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({ entry, bodyRange, bodySize, instructionCount, instructionSha256 }));

const STATIC_EVIDENCE = [
  [0x00482a50, "8b 8c 24 a4 2e 00 00 8d 54 24 14 51 52 8b cb e8 bc 04 00 00 8b 8b 1c 0c 00 00 33 c0 66 8b 83 1a 0c 00 00 6a 02 66 c7 04 c1 03 00", "dispatcher case 3 allocates a two-byte payload and stores record kind 3"],
  [0x00482d06, "8b ac 24 a4 2e 00 00 8d 54 24 14 55 52 8b cb e8 06 02 00 00 8d 7c 24 14 83 c9 ff 33 c0 8d 94 24 14 10 00 00", "dispatcher case 7 copies two NUL-terminated strings into a 0x200-byte payload"],
  [0x00482e0f, "8b 8c 24 a4 2e 00 00 8d 54 24 14 51 52 8b cb e8 fd 00 00 00 8b 8b 1c 0c 00 00 33 c0 66 8b 83 1a 0c 00 00 6a 40 66 c7 04 c1 09 00", "dispatcher case 9 allocates a 0x40-byte string payload and stores record kind 9"],
  [0x0048324e, "ff 15 70 72 4b 00 0f bf ce 89 83 20 0c 00 00 89 8b 24 0c 00 00", "consumer case 3 calls timeGetTime, stores it at owner+0xc20, and sign-extends the WORD duration into owner+0xc24"],
  [0x0048353b, "8b 86 24 0c 00 00 85 c0 0f 84 dd 00 00 00", "readiness case 3 reads owner+0xc24 and a zero duration jumps directly to its ready return"],
  [0x00483549, "ff 15 70 72 4b 00 8b 96 20 0c 00 00 8b 8e 24 0c 00 00 2b c2 3b c1 0f 86 cb 00 00 00", "nonzero case 3 calls timeGetTime, subtracts owner+0xc20, compares unsigned elapsed with owner+0xc24, and JBE retains the delay"],
  [0x00483565, "c7 86 20 0c 00 00 00 00 00 00 c7 86 24 0c 00 00 00 00 00 00", "completed nonzero case 3 clears owner+0xc20 and owner+0xc24 before returning ready"],
  [0x004a88f0, "83 ec 14 55 56 57 8b f1 e8 03 02 00 00", "objective producer begins by clearing its dedicated source rectangle"],
  [0x004a8959, "8b 29 52 68 bc 00 00 00 51 ff 55 1c", "first objective draw uses x 188 and its vertically centered anchor around y 311"],
  [0x004a89ae, "ba 62 01 00 00 d1 f8 2b d0 c7 44 24 24 16 01 00 00 8b 39 52 68 bc 00 00 00 51 ff 57 1c c7 86 68 05 00 00 01 00 00 00", "second objective draw uses x 188 and anchor around y 354, then sets owner+0x568 to one"],
  [0x004a89e0, "83 ec 0c 53 8b d9 e8 65 01 00 00", "title producer begins by clearing its dedicated source rectangle"],
  [0x004a8a6a, "b9 50 00 00 00 d1 f8 2b c8 8b 44 24 10 0f bf d1 56 52 68 bc 00 00 00 50 ff 15 50 70 4b 00", "title text uses x 188 as a left anchor and is vertically centered around y 80"],
  [0x004a8a99, "c7 83 64 05 00 00 01 00 00 00", "title producer sets owner+0x564 to one after its draw path"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_PROJECTIONS = [
  ["command lookup outgoing", "0x00482590", 40, "691e738cda14d5d35b0a8e6053a9de7546ca78fbd4ed53da7384171a30b26c91"],
  ["record dispatcher outgoing", "0x00482860", 70, "447e8ad4a846ccfd687f971cec7705915b6a9ce6ffbd54f3d2b4f14aab18f182"],
  ["record consumer outgoing", "0x004830f0", 69, "03cf5c0e81061d42296fb991392dfc546e0041a99b4f45a1c7170aec2260af36"],
  ["record readiness outgoing", "0x00483500", 34, "c05ff734656b0d30185307ff30e8579ee7f6ef4e43d5f12a55fce0551e937821"],
].map(([label, fromFunctionEntry, count, digest]) => ({ label, fromFunctionEntry, count, digest }));

export function extractBriefingMetadataEvidence({ executablePath = DEFAULT_EXECUTABLE_PATH, scriptPath = DEFAULT_SCRIPT_PATH, functionsPath = DEFAULT_FUNCTIONS_PATH, referencesPath = DEFAULT_REFERENCES_PATH } = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const script = readFileSync(scriptPath);
  assertEqual(sha256(script), EXPECTED_K0110_SHA256, `${scriptPath} SHA-256`);
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  assertEqual(functions.sourceSha256, executableSha256, `${functionsPath} sourceSha256`);
  assertEqual(references.sourceSha256, executableSha256, `${referencesPath} sourceSha256`);
  const commands = parseK0110Commands(new TextDecoder("euc-kr", { fatal: true }).decode(script));
  const preFirstSpeech = commands.slice(0, commands.findIndex(({ command }) => command === "SPEECH"));
  verifyK0110Prelude(preFirstSpeech);
  return {
    question: "K0110 pre-game TITLE/OBJECTIVE overlays and SETDELAYTIME records have which static payload, state, strict timing, rectangle, and ordered-draw semantics before the first SPEECH?",
    sourceExecutableSha256: executableSha256,
    sourceK0110Sha256: EXPECTED_K0110_SHA256,
    analysisStatus: "static-confirmed",
    reproductionStatus: "scoped-reproduction-complete",
    implementationStatus: "analysis-only-no-production-change",
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceProjections: REFERENCE_PROJECTIONS.map((expected) => verifyReferenceProjection(references, expected)),
    commandMapping: { SETDELAYTIME: 3, OBJECTIVE: 7, TITLE: 9 },
    payloads: { SETDELAYTIME: "signed WORD", OBJECTIVE: "0x200-byte two-string payload", TITLE: "0x40-byte string payload" },
    setDelay: {
      ownerFields: { startTick: "owner+0xc20 DWORD", duration: "owner+0xc24 sign-extended signed WORD stored as DWORD" },
      readiness: "a zero stored duration returns ready immediately without reading or clearing owner+0xc20; otherwise elapsed=(now-start) modulo 2^32 and completion is unsigned elapsed > durationDword, clearing both fields",
      negativeDurationBoundary: "a negative signed WORD becomes 0xffff8000..0xffffffff for the unsigned comparison; it is an extremely long wrap-sensitive wait (and -1 can never complete), so this slice does not classify negative script input as a usable presentation delay",
    },
    overlays: {
      objective: { rectangle: OBJECTIVE_RECT, wrapWidth: 278, textAnchors: [{ x: 188, centerY: 311 }, { x: 188, centerY: 354 }], activationField: "owner+0x568=1" },
      title: { rectangle: TITLE_RECT, textAnchor: { x: 188, centerY: 80 }, activationField: "owner+0x564=1" },
      dispatcherOrder: ["field_0x568", "field_0x564"],
    },
    k0110: { preFirstSpeech, changeTitleRawDelayTotal: 665, preFirstSpeechDelay: 100, timingLimit: "665 is the CHANGETITLE-delay subtotal; the later pre-SPEECH SETDELAYTIME is a separate 100. Strict > comparison and caller/update cadence prevent an exact wall-clock visual-duration claim." },
    excludedScope: ["actual font realization, glyph measurement, and pixel output", "CHANGETITLE display duration", "SPEECH lifecycle and dialogue inter-line gap parity", "runtime caller/update cadence and exact wall-clock overlay duration"],
  };
}

export function reproduceSetDelay({ startTick, durationWord, nowTick }) {
  assertUnsignedDword(startTick, "startTick");
  assertSignedWord(durationWord, "durationWord");
  const durationDword = durationWord >>> 0;
  if (durationWord === 0) {
    return { elapsed: null, durationDword, ready: true, final: { startTick, durationDword } };
  }
  assertUnsignedDword(nowTick, "nowTick");
  const elapsed = (nowTick - startTick) >>> 0;
  const ready = elapsed > durationDword;
  return ready
    ? { elapsed, durationDword, ready: true, final: { startTick: 0, durationDword: 0 } }
    : { elapsed, durationDword, ready: false, final: { startTick, durationDword } };
}

export function reproduceBriefingOverlayDispatch({ field_0x568, field_0x564 }) {
  assertUnsignedDword(field_0x568, "field_0x568");
  assertUnsignedDword(field_0x564, "field_0x564");
  return [
    ...(field_0x568 === 1 ? [{ field: "field_0x568", rectangle: OBJECTIVE_RECT }] : []),
    ...(field_0x564 === 1 ? [{ field: "field_0x564", rectangle: TITLE_RECT }] : []),
  ];
}

function parseK0110Commands(text) {
  const commands = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const tokens = [...line.matchAll(/\[([^\]]*)\]/gu)].map((match) => match[1]);
    for (let cursor = 0; cursor < tokens.length;) {
      const command = tokens[cursor].toUpperCase();
      const count = COMMAND_ARG_COUNTS[command];
      if (count === undefined) { cursor += 1; continue; }
      const args = tokens.slice(cursor + 1, cursor + count + 1);
      if (args.length !== count) throw new Error(`K0110 line ${index + 1}: ${command} is missing an argument`);
      commands.push({ line: index + 1, command, args });
      cursor += count + 1;
    }
  }
  return commands;
}

function verifyK0110Prelude(prelude) {
  const expected = [
    ["CHANGEMUSIC", ["music\\briefmusic.yav"]],
    ["CHANGETITLE", ["ybriefingfnt\\k01\\k01.spr"]], ["SETDELAYTIME", ["500"]],
    ...Array.from({ length: 11 }, (_, index) => ["CHANGETITLE", [`ybriefingfnt\\K01\\k01${String(index + 1).padStart(2, "0")}.spr`]]),
    ...Array.from({ length: 11 }, () => ["SETDELAYTIME", ["15"]]),
    ["TITLE", ["1. 불안한 전운"]],
    ["OBJECTIVE", ["1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)", ""]],
    ["SETDELAYTIME", ["100"]],
  ];
  // The source interleaves each of the 11 CHANGETITLE/15 pairs; preserve that order rather than the grouped display above.
  const normalizedExpected = [expected[0], expected[1], expected[2]];
  for (let index = 0; index < 11; index += 1) normalizedExpected.push(expected[3 + index], expected[14 + index]);
  normalizedExpected.push(expected[25], expected[26], expected[27]);
  assertEqual(JSON.stringify(prelude.map(({ command, args }) => [command, args])), JSON.stringify(normalizedExpected), "K0110 commands before first SPEECH");
}

function verifyFunctionCatalog(functions) {
  if (!Array.isArray(functions.functions)) throw new TypeError("functions.json must contain a functions array");
  return FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions.find((candidate) => candidate.entry === expected.entry);
    if (!actual) throw new Error(`functions.json is missing ${expected.entry}`);
    for (const field of ["bodySize", "instructionCount", "instructionSha256"]) assertEqual(actual[field], expected[field], `${expected.entry} ${field}`);
    assertEqual(actual.bodyRanges?.length, 1, `${expected.entry} body range count`);
    assertEqual(actual.bodyRanges[0], expected.bodyRange, `${expected.entry} body range`);
    return expected;
  });
}

function verifyReferenceProjection(references, expected) {
  if (!Array.isArray(references.references)) throw new TypeError("references.json must contain a references array");
  const projection = references.references.filter((reference) => reference.fromFunctionEntry === expected.fromFunctionEntry).map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assertEqual(projection.length, expected.count, `${expected.label} count`);
  const digest = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
  assertEqual(digest, expected.digest, `${expected.label} SHA-256`);
  return { ...expected, sha256: digest, references: projection };
}

function assertUnsignedDword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`);
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractBriefingMetadataEvidence(), null, 2));
}
