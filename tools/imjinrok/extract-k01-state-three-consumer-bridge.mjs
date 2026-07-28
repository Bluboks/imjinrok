#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractK01FinalResultTransition, mapPresentationPollWrapperResult } from "./extract-k01-final-result-transition.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import { extractK01StateThreeModeBoundary } from "./extract-k01-state-three-mode-boundary.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const EXPECTED_EXE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const DEFAULTS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: resolve(ROOT, "analysis/generated/imjinrok2/jump-tables.json"),
};
const ARTIFACTS = {
  functions: [1468333, "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e"],
  references: [17206569, "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5"],
  jumpTables: [607724, "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f"],
};
const FUNCTION_CONTRACTS = [
  [0x0045f9c0, 801, "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24"],
  [0x00448ff0, 18, "6237d2069c08647f00f457c462efcd84978dc8f69c6a506a9ed18819aa8908e2"],
  [0x00449090, 118, "7fb4f74394b9f113ca0da3a2fbba16e877572eb06411e733d53cee4c4a30b290"],
  [0x00493290, 5, "1ea8ffe512653b2969ff443fcd05080b27100d289cbb3556cc90c26cb42c2cba"],
  [0x004932a0, 9, "558b261cb05641704769a9486e726df60760519bfd0cb8941c33612622b97159"],
  [0x004932c0, 5, "4696a43d2ed7740cbc445e1fa67882a2f24c1676855bcfecc101edee070d72d0"],
  [0x004932d0, 9, "d19c6d9e3b1783c591a2b4135022ac8c2bac5b182183c4fa91f0d82e23c2dff1"],
];
const REQUIRED_CALLS = [
  [0x004602c0, 0x0045f9c0, 0x0046f870], [0x004602c8, 0x0045f9c0, 0x00448ff0],
  [0x004602e4, 0x0045f9c0, 0x00447bc0], [0x004602e9, 0x0045f9c0, 0x00449090],
  [0x0046032e, 0x0045f9c0, 0x00492630], [0x00460353, 0x0045f9c0, 0x004145b0],
  [0x00460372, 0x0045f9c0, 0x00474ae0], [0x004603ba, 0x0045f9c0, 0x00409790],
  [0x004603cf, 0x0045f9c0, 0x00446420], [0x004603e7, 0x0045f9c0, 0x00446420],
  [0x00460164, 0x0045f9c0, 0x00493290], [0x004601b9, 0x0045f9c0, 0x004932a0],
  [0x004601c3, 0x0045f9c0, 0x004932c0], [0x004601d6, 0x0045f9c0, 0x004932d0],
];
const ANCHORS = [
  ["main-loop-relay-bx", 0x0045fc83, "bb 8c 00 00 00", "main loop initializes EBX to raw relay state 0x8c before the state switch"],
  ["main-loop-scheduler-esi", 0x0045fd1e, "be 01 00 00 00", "main loop initializes ESI to one before the state switch; raw-23 fallback stores SI as target"],
  ["state-minus-one-low-switch", 0x0045fd36, "0f bf 05 c8 df 4b 00 83 f8 28 0f 8f be 06 00 00 0f 84 a5 06 00 00 48 83 f8 22 0f 87 32 ff ff ff ff 24 85 b0", "main switch loads WORD state, decrements it, then indexes table 0x004607b0"],
  ["state-22-to-23", 0x004602be, "6a 02 e8 ab f5 00 00 83 c4 04 e8 23 8d fe ff 66 c7 05 c8 df 4b 00 17 00", "raw 22 calls 0x0046f870 and FUN_00448ff0, then writes raw 23"],
  ["state-23-scheduler-poll-and-guard", 0x004602db, "66 39 35 20 6e c0 00 75 05 e8 d7 78 fe ff e8 a2 8d fe ff 66 83 3d c8 df 4b 00 17 0f bf f0", "raw 23 conditionally calls scheduler, always polls, then requires current state remain 23 before dispatch"],
  ["state-23-secondary-dispatch", 0x00460322, "ff 24 8d 3c 08 46 00", "raw 23 dispatches only the recovered FUN_00449090 source-return labels"],
  ["state-23-target-ten", 0x0046033f, "a1 c0 4a 63 00 be 01 00 00 00 3b c6 75 0b 89 35 74 6e c0 00 e8 58 42 fb ff 39 35 38 6e c0 00 0f 85 12 fd ff ff 66 39 35 20 6e c0 00 75 11 b9 68 b0 a9 00 e8 69 47 01 00 66 89 2d 20 6e c0 00 66 89 2d 14 66 7c 00 66 c7 05 a0 6d c0 00 1c 00 66 89 1d c8 df 4b 00", "source return 10 selects target 10 or 28 and current 0x8c under the exact gates"],
  ["state-23-target-eight-and-32", 0x0046039a, "83 3d 48 c5 4c 00 01 75 36 81 3d 80 5f 7c 00 e8 03 00 00 73 04 6a 03 eb 02 6a 02 b9 b0 af 4c 00 e8 d1 93 fa ff 66 c7 05 a0 6d c0 00 40 01 66 89 1d c8 df 4b 00 e8 4c 60 fe ff e9 af f8 ff ff 66 89 35 a0 6d c0 00 66 89", "source return 8 conditionally selects target 0x140 or falls through to target 8; source return 32 targets 32"],
  ["poll-output-domain", 0x00449242, "ff 24 8d 8c 92 44 00 66 b8 03 00 c3 66 b8 08 00 c3 66 b8 20 00 c3 66 b8 0a 00 c3 66 33 c0", "FUN_00449090 maps source outcomes only to 3, 8, 32, 10, or 0"],
  ["state-24-through-27", 0x00460164, "e8 27 31 03 00 66 a1 cc af 88 00 66 c7 05 c8 df 4b 00 19 00", "raw 24 initializes then writes 25; adjacent raw 25/26/27 wrappers are validated by required calls and final-result contract"],
];

export function extractK01StateThreeConsumerBridge({ executablePath = DEFAULTS.executablePath, functionsPath = DEFAULTS.functionsPath, referencesPath = DEFAULTS.referencesPath, jumpTablesPath = DEFAULTS.jumpTablesPath } = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sourceSha256 = hash(buffer);
  equal(sourceSha256, EXPECTED_EXE_SHA256, "original EXE SHA-256");
  const artifacts = {
    functions: readArtifact(functionsPath, sourceSha256, "functions", ARTIFACTS.functions),
    references: readArtifact(referencesPath, sourceSha256, "references", ARTIFACTS.references),
    jumpTables: readArtifact(jumpTablesPath, sourceSha256, "jump tables", ARTIFACTS.jumpTables),
  };
  const stateThree = extractK01StateThreeModeBoundary({ executablePath, functionsPath, referencesPath, jumpTablesPath });
  const finalResult = extractK01FinalResultTransition();
  const stateSwitches = requireSwitches(artifacts.jumpTables.document);
  return {
    question: "After the active state-three scheduler directly writes raw main state 22, 24, or 26, which direct main-state consumers are reached before the existing final-result relay, and can this bridge directly reach raw state 5 or the mode routines?",
    source: { executablePath: resolve(executablePath), byteLength: buffer.byteLength, sha256: sourceSha256 },
    generatedArtifacts: Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, artifact.provenance])),
    analysisStatus: "static-confirmed-bounded-negative-contract",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none",
    functionEvidence: FUNCTION_CONTRACTS.map(([entry, count, sha]) => requireFunction(artifacts.functions.document.functions, entry, count, sha)),
    stateSwitches,
    callEdges: REQUIRED_CALLS.map(([site, caller, callee]) => requireCall(artifacts.references.document.references, site, caller, callee)),
    codeAnchors: ANCHORS.map(([id, va, bytes, meaning]) => anchor(buffer, image, id, va, bytes, meaning)),
    linkedContracts: {
      stateThreeWrites: stateThree.stateWrites,
      finalResultRelay: finalResult.relay,
      finalResultWrapper: finalResult.presentation.wrapperContract,
    },
    contract: {
      bridge: "The exact direct bridge successors are raw 23/3/24/25/26/27/0x8c and the existing final-result relay/final targets. The direct bridge does not write or dispatch raw state 5 and has no call edge to FUN_00484130 or FUN_00485890.",
      state23: "Raw 23 conditionally calls the scheduler when WORD 0x00c06e20 equals 1, always calls FUN_00449090, and skips secondary result dispatch if the scheduler changed current state away from 23.",
      boundary: "This does not prove absence through indirect calls, aliases, or the whole session. The next unresolved K01 mode question is pre-stage-1/session-entry provenance and persistence of the mode selector/global, including the separate FUN_004a5070 caller of FUN_00485890.",
    },
    testVectors: vectors(),
  };
}

export function mapRaw23PollOutcome(sourceOutcomeDword) {
  dword(sourceOutcomeDword, "sourceOutcomeDword");
  if (sourceOutcomeDword === 3 || sourceOutcomeDword === 8 || sourceOutcomeDword === 10 || sourceOutcomeDword === 32) return sourceOutcomeDword;
  return 0;
}

export function replayRaw23Bridge(input) {
  word(input.currentStateWord, "currentStateWord");
  if (input.currentStateWord !== 23) throw new RangeError("currentStateWord must be raw state 23");
  word(input.schedulerModeWord, "schedulerModeWord");
  const schedulerCalled = input.schedulerModeWord === 1;
  const stateAfterScheduler = schedulerCalled ? readWord(input, "stateAfterSchedulerWord") : 23;
  const pollOutcome = mapRaw23PollOutcome(input.pollSourceOutcomeDword);
  if (stateAfterScheduler !== 23) return { currentStateWord: stateAfterScheduler, targetStateWord: undefined, schedulerCalled, pollOutcome, dispatchSkipped: true };
  if (pollOutcome === 0) return { currentStateWord: 23, targetStateWord: undefined, schedulerCalled, pollOutcome, dispatchSkipped: false };
  if (pollOutcome === 3) return { currentStateWord: 3, targetStateWord: undefined, schedulerCalled, pollOutcome, dispatchSkipped: false };
  if (pollOutcome === 8) return routeEight(input, schedulerCalled, pollOutcome);
  if (pollOutcome === 32) return relay(1, schedulerCalled, pollOutcome, "source-32");
  return routeTen(input, schedulerCalled, pollOutcome);
}

export function replayStateThreeConsumers(input) {
  word(input.currentStateWord, "currentStateWord");
  if (input.currentStateWord === 22) return { currentStateWord: 23, targetStateWord: undefined, branch: "22-to-23" };
  if (input.currentStateWord === 24) return { currentStateWord: 25, targetStateWord: undefined, branch: "24-to-25" };
  if (input.currentStateWord === 26) return { currentStateWord: 27, targetStateWord: undefined, branch: "26-to-27" };
  if (input.currentStateWord !== 25 && input.currentStateWord !== 27) throw new RangeError("currentStateWord must be 22, 24, 25, 26, or 27");
  const wrapperTarget = mapPresentationPollWrapperResult(input.presentationPollResultEax);
  if (wrapperTarget === 0) return { currentStateWord: input.currentStateWord, targetStateWord: undefined, branch: "presentation-pending" };
  return { currentStateWord: 0x8c, targetStateWord: wrapperTarget, branch: "presentation-complete" };
}

function routeEight(input, schedulerCalled, pollOutcome) { dword(input.externalModeDword, "externalModeDword"); if (input.externalModeDword !== 1) return relay(1, schedulerCalled, pollOutcome, "source-8-fallthrough"); dword(input.progressCounterDword, "progressCounterDword"); return relay(0x140, schedulerCalled, pollOutcome, input.progressCounterDword < 1000 ? "source-8-external-low" : "source-8-external-high"); }
function routeTen(input, schedulerCalled, pollOutcome) { dword(input.raw634ac0, "raw634ac0"); dword(input.rawC06e38, "rawC06e38"); if (input.rawC06e38 === 1) return relay(0x1c, schedulerCalled, pollOutcome, input.raw634ac0 === 1 ? "source-10-exact-one-and-1c" : "source-10-1c"); return relay(10, schedulerCalled, pollOutcome, input.raw634ac0 === 1 ? "source-10-exact-one-and-0a" : "source-10-0a"); }
function relay(targetStateWord, schedulerCalled, pollOutcome, branch) { return { currentStateWord: 0x8c, targetStateWord, schedulerCalled, pollOutcome, dispatchSkipped: false, branch }; }
function readWord(input, key) { const value = input[key]; word(value, key); return value; }
function vectors() { return [
  { id: "state-22-to-23", result: replayStateThreeConsumers({ currentStateWord: 22 }), expected: { currentStateWord: 23, targetStateWord: undefined, branch: "22-to-23" } },
  { id: "scheduler-changes-state-before-poll-dispatch", result: replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 1, stateAfterSchedulerWord: 24, pollSourceOutcomeDword: 3 }), expected: { currentStateWord: 24, targetStateWord: undefined, schedulerCalled: true, pollOutcome: 3, dispatchSkipped: true } },
  { id: "poll-domain", result: [3, 8, 10, 32, 5, 0xffffffff].map(mapRaw23PollOutcome), expected: [3, 8, 10, 32, 0, 0] },
  { id: "state-23-secondary-targets", result: [replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, pollSourceOutcomeDword: 3 }), replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, pollSourceOutcomeDword: 8, externalModeDword: 1, progressCounterDword: 999 }), replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, pollSourceOutcomeDword: 10, raw634ac0: 1, rawC06e38: 1 }), replayRaw23Bridge({ currentStateWord: 23, schedulerModeWord: 0, pollSourceOutcomeDword: 32 })], expected: [{ currentStateWord: 3, targetStateWord: undefined, schedulerCalled: false, pollOutcome: 3, dispatchSkipped: false }, { currentStateWord: 0x8c, targetStateWord: 0x140, schedulerCalled: false, pollOutcome: 8, dispatchSkipped: false, branch: "source-8-external-low" }, { currentStateWord: 0x8c, targetStateWord: 0x1c, schedulerCalled: false, pollOutcome: 10, dispatchSkipped: false, branch: "source-10-exact-one-and-1c" }, { currentStateWord: 0x8c, targetStateWord: 1, schedulerCalled: false, pollOutcome: 32, dispatchSkipped: false, branch: "source-32" }] },
  { id: "result-state-consumers-cross-check-final-wrapper", result: [replayStateThreeConsumers({ currentStateWord: 24 }), replayStateThreeConsumers({ currentStateWord: 26 }), replayStateThreeConsumers({ currentStateWord: 25, presentationPollResultEax: 0 }), replayStateThreeConsumers({ currentStateWord: 27, presentationPollResultEax: 1 })], expected: [{ currentStateWord: 25, targetStateWord: undefined, branch: "24-to-25" }, { currentStateWord: 27, targetStateWord: undefined, branch: "26-to-27" }, { currentStateWord: 25, targetStateWord: undefined, branch: "presentation-pending" }, { currentStateWord: 0x8c, targetStateWord: 0x1c, branch: "presentation-complete" }] },
]; }

function readArtifact(path, sourceSha256, label, [byteLength, sha]) { const resolvedPath = resolve(path); const buffer = readFileSync(resolvedPath); equal(buffer.byteLength, byteLength, `${label} artifact byte length`); equal(hash(buffer), sha, `${label} artifact SHA-256`); const document = JSON.parse(buffer.toString("utf8")); equal(document.sourceSha256, sourceSha256, `${label} source SHA-256`); return { document, provenance: { path: resolvedPath, byteLength, sha256: sha } }; }
function requireFunction(functions, entry, count, sha) { const found = functions.find((candidate) => candidate.entry === toHex(entry)); if (!found) throw new Error(`functions artifact is missing ${toHex(entry)}`); equal(found.instructionCount, count, `${toHex(entry)} instruction count`); equal(found.instructionSha256, sha, `${toHex(entry)} instruction SHA-256`); return { entry: found.entry, bodyRanges: found.bodyRanges, instructionCount: count, instructionSha256: sha }; }
function requireCall(references, site, caller, callee) { const found = references.find((reference) => reference.type.endsWith("CALL") && reference.from === toHex(site) && reference.fromFunctionEntry === toHex(caller) && reference.to === toHex(callee)); if (!found) throw new Error(`required call ${toHex(site)} is missing`); return { callsite: found.from, caller: found.fromFunctionEntry, callee: found.to }; }
function requireSwitches(document) { const find = (functionEntry, switchAddress) => Object.values(document.tables).find((candidate) => candidate.functionEntry === functionEntry && candidate.switchAddress === switchAddress); const main = find("0x0045f9c0", "0x0045fd56"); const secondary = find("0x0045f9c0", "0x00460322"); const poll = find("0x00449090", "0x00449242"); if (!main || !secondary || !poll) throw new Error("required bridge switch is missing"); const mainCases = [[21, "0x004602be"], [22, "0x004602db"], [23, "0x00460164"], [24, "0x004601b9"], [25, "0x004601c3"], [26, "0x004601d6"]]; for (const [label, destination] of mainCases) equal(main.cases.find((value) => value.label === label)?.destination, destination, `main raw state ${label + 1} destination`); const secondaryCases = [[3, "0x00460329"], [8, "0x0046039a"], [10, "0x0046033f"], [32, "0x004603d9"]]; for (const [label, destination] of secondaryCases) equal(secondary.cases.find((value) => value.label === label)?.destination, destination, `secondary result ${label} destination`); const pollCases = [[3, "0x00449249"], [8, "0x0044924e"], [10, "0x00449258"], [32, "0x00449253"]]; for (const [label, destination] of pollCases) equal(poll.cases.find((value) => value.label === label)?.destination, destination, `poll result ${label} destination`); return { mainSwitch: main.switchAddress, secondarySwitch: secondary.switchAddress, pollSwitch: poll.switchAddress, rawStates: [22, 23, 24, 25, 26, 27], pollReturnDomain: [0, 3, 8, 10, 32] }; }
function anchor(buffer, image, id, va, bytes, meaning) { const rawOffset = image.vaToRawOffset(va); if (rawOffset === undefined) throw new RangeError(`${toHex(va)} is not file-backed`); const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex"); if (Buffer.compare(buffer.subarray(rawOffset, rawOffset + expected.length), expected) !== 0) throw new Error(`code anchor ${id} mismatch at ${toHex(va)}`); return { id, va: toHex(va), rawOffset: toHex(rawOffset), bytes, meaning, matched: true }; }
function word(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD; got ${value}`); }
function dword(value, label) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD; got ${value}`); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function equal(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(extractK01StateThreeConsumerBridge(), null, 2)}\n`);
