#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULTS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  jumpTablesPath: resolve(ROOT, "analysis/generated/imjinrok2/jump-tables.json"),
};
const EXPECTED_GENERATED_ARTIFACTS = {
  functions: {
    byteLength: 1468333,
    sha256: "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e",
  },
  references: {
    byteLength: 17206569,
    sha256: "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5",
  },
  jumpTables: {
    byteLength: 607724,
    sha256: "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f",
  },
};

const FUNCTION_CONTRACTS = [
  [0x0043f560, 5, "6b9beb20a706f798049e6891a9ab637878ae09daaa367b804e3cf6c980a540d7"],
  [0x0043f580, 20, "dbdc4447f4bd656a29d55e10f719e29341276c62e4767778dc5decea3671dfc1"],
  [0x004430f0, 30, "e23c64ff754ac83e87662223cf1598ea4a4bfb87320150e9402cd9d6c205b9ce"],
  [0x00447bc0, 75, "c5166177633b255028ae02aa6f7a60350f7e93f09ce5fcf101ac92ba066eefde"],
  [0x00447e10, 66, "75860fcb9a74162cab2cbe0b72b7d0238d774205c7f63f118dd6c5da6af2e4f5"],
  [0x00473b50, 498, "9ceb40f3a8548d1bed0ea93548b724a1054edb5339b28dc3f05700e85a54135f"],
  [0x00474770, 58, "fd1d176b03376f5c5dac2db2cec22ead092d5d17aa788ffad4e5e0b0206cc699"],
  [0x004748f0, 16, "7acacb5b16d0a2eca9305635f69c0063ad1cdc7acb03fc9cf0c5bda4eb2d4c06"],
  [0x00481a80, 102, "168d30d13877ffeb8fab35e1a213f4bdb5a6f67a941a3af8454ee8dade140db1"],
  [0x00481c50, 199, "823cf8ad9d1b831c9183293c68646fa1e1641b0f8074fc3559a4f8d2feade5d8"],
  [0x00484130, 1131, "d44b4995e2906aa527ee362b7f6aee774bef7cd3fdf966aabc09a5fefdd13b73"],
  [0x00485890, 44, "fb53dab9a92b41ace1d6e8c44d158a836f1e3bffdee6301f38361a08a1dbcde1"],
  [0x00486430, 138, "8806df0ba708941c3e177a88ca85e189b4c827dc1aee59876da948c50e8a0845"],
  [0x0045f9c0, 801, "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24"],
  [0x0048dbe0, 147, "f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217"],
  [0x0048d410, 110, "55e9e403f208ea2de9f779cb5176d11db85b33758a30d2310d14504dabd0c13d"],
  [0x004a3d10, 105, "a51d355c64fa30cf35c7ecc8d8a1b661330866f13da1779e0a9f26d0af451f93"],
];

const REQUIRED_CALLS = [
  [0x0046005c, 0x0045f9c0, 0x00484130],
  [0x004844ed, 0x00484130, 0x004a3d10],
  [0x004851a5, 0x00484130, 0x00485890],
  [0x004600d0, 0x0045f9c0, 0x0048dbe0],
  [0x0048dc6d, 0x0048dbe0, 0x0048d410],
  [0x00447c65, 0x00447bc0, 0x00447e10],
  [0x00473c7a, 0x00473b50, 0x004430f0],
  [0x00473d1b, 0x00473b50, 0x004430f0],
  [0x00481af1, 0x00481a80, 0x004ade3a],
  [0x00481cb4, 0x00481c50, 0x004adf44],
];

const GUARD_DIRECT_WRITES = [
  [0x0045fbfc, 0x0045f9c0],
  [0x00474845, 0x00474770],
  [0x00474929, 0x004748f0],
  [0x00486585, 0x00486430],
  [0x004865ca, 0x00486430],
];
const GUARD_DIRECT_WRITE_SET_SHA256 = "9a90b182cdbdf55dbeea5a41ec612115912c210a4daa0c8ddece3a647f0d520d";
const GUARD_SERIALIZATION_REFERENCES = [
  [0x00481aec, 0x00481a80],
  [0x00481caf, 0x00481c50],
];
const GUARD_SERIALIZATION_SET_SHA256 = "fee3fa62b2e6bca56bee04fa4078ae40d73222a5d45bac9daab2e8a5f8cc7040";
const MODE_ROUTINE_DIRECT_CALLERS = [[0x0046005c, 0x0045f9c0]];
const MODE_ROUTINE_DIRECT_CALL_SET_SHA256 = "384cd7bdb004d0920217171e39922de2ea316325a2ad05947920524b14c1e201";

const CODE_ANCHORS = [
  ["interval-selector-setter", 0x0043f560, "8b 44 24 04 89 41 14 e8 14 00 00 00 a3 94 27 55 00 c2 04 00", "writes the passed DWORD to 0x00634ab8+0x14, which is selector DWORD 0x00634acc"],
  ["mode-one-selector-bypass", 0x0043f580, "66 83 3d 20 6e c0 00 01 75 06 a1 bc df 4b 00 c3", "only WORD 0x00c06e20 == 1 bypasses selector 0x00634acc and returns base DWORD 0x004bdfbc"],
  ["selector-table", 0x0043f590, "a1 cc 4a 63 00 83 f8 03 77 24 ff 24 85 c8 f5 43 00", "mode other than one reads selector DWORD 0x00634acc and dispatches unsigned 0..3/default"],
  ["object-word-setter", 0x004ac480, "66 8b 44 24 04 66 89 41 10 c2 04 00", "the option object stores a caller-provided low WORD at object+0x10"],
  ["object-selector-forwarder", 0x004ac490, "0f bf 41 10 50 b9 b8 4a 63 00 e8 c1 30 f9 ff c3", "the vtable target sign-extends object+0x10 WORD and forwards it to 0x0043f560 with ECX 0x00634ab8"],
  ["object-vtable-slot", 0x004b813c, "80 c4 4a 00 70 c4 4a 00 b0 c2 4a 00 d0 c5 4a 00 20 c3 4a 00 90 c4 4a 00", "the sixth vtable slot at 0x004b8150 points to 0x004ac490"],
  ["mode-writer-conditional-one", 0x00485909, "66 8b 44 24 04 66 3d 01 00 75 16 66 a1 14 c8 c5 00 66 c7 05 20 6e c0 00 01 00", "when WORD 0x004bdfF4 is zero and stack WORD argument is one, writes mode WORD 0x00c06e20 = 1"],
  ["mode-writer-conditional-zero", 0x0048593a, "66 83 7c 24 04 01 75 09 66 c7 05 20 6e c0 00 00 00 c3", "when WORD 0x004bdfF4 is nonzero and stack WORD argument is one, writes mode WORD 0x00c06e20 = 0"],
  ["record-local-minus-one", 0x00484157, "c7 44 24 1c ff ff ff ff", "after saving EBX and before later ESI/EDI pushes, FUN_00484130 initializes its DWORD local to -1"],
  ["record-field-eight-to-local", 0x004844ed, "e8 1e f8 01 00 8b 08 89 4c 24 14 8b 50 04 89 54 24 18 33 d2 8b 48 08 66 39 2d 34 b8 c5 00 89 4c 24 1c", "the 0x004a3d10 result record's DWORD +8 is copied into that local"],
  ["esi-edi-preserved-before-local-restore", 0x004841b6, "56 2b c3 57", "FUN_00484130 pushes ESI then EDI, shifting the earlier local from ESP+0x1c to ESP+0x24"],
  ["tail-local-or-two", 0x00484f30, "51 b9 40 a3 c6 00 e8 75 cd f8 ff 83 f8 01 bb 02 00 00 00 74 04 8b 5c 24 24", "0x00411cb0 exact result one leaves EBX=2; every other result restores the record +8 local from ESP+0x24"],
  ["timeout-and-later-ebx-overrides", 0x004850b0, "89 2d 9c 22 4c 00 89 2d 48 ce c5 00 bb 01 00 00 00", "the timeout path writes EBX=1"],
  ["esi-one-and-alternate-two-overrides", 0x004850db, "a1 9c 22 4c 00 be 01 00 00 00 3b c6", "the following path establishes ESI=1"],
  ["esi-to-ebx-and-alternate-two", 0x00485171, "b9 b0 af 4c 00 8b de e8 73 46 f8 ff eb 05 bb 02 00 00 00", "0x00485176 copies ESI=1 into EBX; the alternate branch at 0x0048517f overwrites EBX=2"],
  ["mode-call-low-word-gate", 0x00485197, "66 83 fb ff 89 15 70 2d 55 00 5e 74 09 53 e8 e6 06 00 00", "only low WORD BX=0xffff skips the mode-writer call at 0x004851a5"],
  ["main-init-zeroes-ebp", 0x0045fa40, "33 ed", "main initialization zeroes EBP before its later guard WORD store"],
  ["guard-init-zero", 0x0045fbfc, "66 89 2d f4 df 4b 00", "main initialization stores EBP=0 to guard WORD 0x004bdfF4"],
  ["guard-direct-zero-writers", 0x00474845, "66 89 35 f4 df 4b 00", "FUN_00474770 stores its zero ESI value to the guard; 0x00474929 separately stores AX"],
  ["guard-direct-one-writer", 0x004865ca, "66 c7 05 f4 df 4b 00 01 00", "a reached FUN_00486430 branch stores guard WORD one; its sibling at 0x00486585 stores BP zero"],
  ["guard-serialization-input-a", 0x00481aec, "68 f4 df 4b 00 e8 44 c3 02 00", "FUN_00481a80 passes the guard address to 0x004ade3a"],
  ["guard-serialization-input-b", 0x00481caf, "68 f4 df 4b 00 e8 8b c2 02 00", "FUN_00481c50 passes the guard address to 0x004adf44"],
  ["mode-one-feedback-consumer-a", 0x00473c71, "8b 43 08 8b 4b 04 50 51 52 e8 71 f4 fc ff", "message record fields +8, +4 and derived record index call feedback writer 0x004430f0"],
  ["mode-one-feedback-consumer-b", 0x00473d12, "8b 4b 08 8b 43 04 51 50 52 e8 d0 f3 fc ff", "second message-record case calls the same feedback writer"],
  ["feedback-writer", 0x004430f0, "a1 9c a4 54 00 56 85 c0 74 4b 8b 74 24 10 85 f6 74 43", "guarded producer compares selected and input DWORDs before writing feedback DWORD -1 or +1"],
  ["clock-consumes-and-clears-feedback", 0x00447e10, "53 56 b9 b8 4a 63 00 e8 64 77 ff ff 8b f0 a1 a8 a4 54 00 33 d2 bb 32 00 00 00 8d 0c 30", "wall-clock gate gets base, adds feedback DWORD 0x0054a4a8, then clears it"],
  ["periodic-counter-reset", 0x00447e48, "66 a1 88 27 55 00 66 3d 0a 00 7e 0a 83 c6 14 3b ce 73 14 41 eb 0b 66 3d 04 00 7d 0b 3b ce 72 07 49 89 0d 94 27 55 00 66 c7 05 88 27 55 00 00 00", "on accepted-step modulo 50 zero, reads signed WORD 0x00552788 then resets it to zero"],
  ["k01-stage-one-entry", 0x004600cb, "e8 a0 56 fe ff e8 0b db 02 00 e8 f6 56 fe ff 66 89 3d c8 df 4b 00", "main-state one invokes standard mission entry and writes the next state from DI; it does not write clock mode or selector"],
  ["k01-stage-one-map-case", 0x0048d410, "0f bf 44 24 04 48 56 83 f8 1b 8b f1 0f 87 f8 00 00 00 ff 24 85 98 d5 48 00 8b ce e8 10 03 00 00", "signed stage switch case one calls the K01 map copier at 0x0048d740"],
];

export function extractK01ClockModeProducers({
  executablePath = DEFAULTS.executablePath,
  functionsPath = DEFAULTS.functionsPath,
  referencesPath = DEFAULTS.referencesPath,
  jumpTablesPath = DEFAULTS.jumpTablesPath,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  equal(sha256, EXPECTED_EXE_SHA256, "original EXE SHA-256");
  const functions = readArtifact(functionsPath, sha256, "functions", EXPECTED_GENERATED_ARTIFACTS.functions);
  const references = readArtifact(referencesPath, sha256, "references", EXPECTED_GENERATED_ARTIFACTS.references);
  const jumpTables = readArtifact(jumpTablesPath, sha256, "jump tables", EXPECTED_GENERATED_ARTIFACTS.jumpTables);
  requireDispatchTables(jumpTables.document);
  const guardDirectWrites = requireExactReferenceSet(
    references.document.references.filter((reference) => reference.to === "0x004bdff4" && reference.type === "WRITE"),
    GUARD_DIRECT_WRITES.map(([site, caller]) => ({ site: toHex(site), caller: toHex(caller), target: "0x004bdff4", type: "WRITE" })),
    GUARD_DIRECT_WRITE_SET_SHA256,
    "guard direct-write set",
  );
  const guardSerializationReferences = requireExactReferenceSet(
    references.document.references.filter((reference) => reference.to === "0x004bdff4" && reference.type === "DATA"),
    GUARD_SERIALIZATION_REFERENCES.map(([site, caller]) => ({ site: toHex(site), caller: toHex(caller), target: "0x004bdff4", type: "DATA" })),
    GUARD_SERIALIZATION_SET_SHA256,
    "guard serialization-reference set",
  );
  const modeRoutineDirectCallers = requireExactReferenceSet(
    references.document.references.filter((reference) => reference.to === "0x00484130" && reference.type.endsWith("CALL")),
    MODE_ROUTINE_DIRECT_CALLERS.map(([site, caller]) => ({ site: toHex(site), caller: toHex(caller), target: "0x00484130", type: "UNCONDITIONAL_CALL" })),
    MODE_ROUTINE_DIRECT_CALL_SET_SHA256,
    "FUN_00484130 direct-caller set",
  );

  return {
    question: "For a standard K01 single-player mission, can static producer flow fix scheduler mode WORD 0x00c06e20 or selector DWORD 0x00634acc enough to refine the accepted-update wall-clock interval, without choosing a project timing adapter?",
    source: { executablePath, sha256 },
    generatedArtifacts: {
      functions: functions.provenance,
      references: references.provenance,
      jumpTables: jumpTables.provenance,
    },
    analysisStatus: "static-confirmed-conditional",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none",
    functionEvidence: FUNCTION_CONTRACTS.map(([entry, instructionCount, instructionSha256]) => requireFunction(functions.document.functions, entry, instructionCount, instructionSha256)),
    callEdges: REQUIRED_CALLS.map(([site, caller, callee]) => requireCall(references.document.references, site, caller, callee)),
    codeAnchors: CODE_ANCHORS.map(([id, va, bytes, meaning]) => anchor(buffer, image, { id, va, bytes, meaning })),
    modeRoutineDirectCallers: { entries: modeRoutineDirectCallers, sha256: MODE_ROUTINE_DIRECT_CALL_SET_SHA256 },
    guardBoundary: {
      directWrites: { entries: guardDirectWrites, sha256: GUARD_DIRECT_WRITE_SET_SHA256 },
      serializationAddressReferences: { entries: guardSerializationReferences, sha256: GUARD_SERIALIZATION_SET_SHA256 },
      indirectWriterBoundary: "Passing the guard address to the two serialization functions prevents this direct-reference inventory from proving an alias-free complete writer set.",
    },
    fields: {
      schedulerMode: "WORD 0x00c06e20; equality comparison with 1, writers use WORD stores",
      selector: "DWORD 0x00634acc = 0x00634ab8+0x14; unsigned switch consumer",
      optionObjectValue: "WORD object+0x10; 0x004ac490 reads it with MOVSX before forwarding a signed DWORD",
      feedback: "DWORD 0x0054a4a8; producer writes raw 0xffffffff (-1) or 1, gate consumes then clears",
      periodic: "WORD 0x00552788; gate reads it with signed JLE/JGE comparisons only every accepted-step counter modulo 50 equals zero, then stores zero",
    },
    k01ModeContract: {
      k01Entry: "standard K01 is stage WORD 1 in 0x0048d410 reached from main-state 1 at 0x004600d0",
      independentModePath: "The complete direct caller set has only main-state 5 at 0x0046005c. There, FUN_00484130 initializes a record-derived local to -1, stores 0x004a3d10 result+8 into it, restores it to EBX unless 0x00411cb0 returns exactly 1 (then EBX=2), and can later select EBX=1 or EBX=2 before its low WORD reaches FUN_00485890.",
      result: "this bounded recovered K01 stage-one producer/consumer CFG does not establish an edge proving mode WORD equals 1 or 0 at the subsequent state-3 scheduler; no K01-specific mode value is claimed",
      conditionalModeOne: "if mode WORD is exactly 1 at 0x0043f580, selector DWORD is ignored and base interval is exactly 50 ms",
      conditionalOtherMode: "if mode differs from 1, selector remains a signed-WORD-forwarded, externally produced DWORD and the 64/60/50/40/30 ms selector table remains applicable",
    },
    feedbackContract: {
      producer: "both recovered message-record cases in 0x00473b50 call 0x004430f0; after guards and record match, unsigned selected timestamp > input writes -1, < writes +1, equality/failed guards preserve prior feedback",
      consumer: "0x00447e10 adds feedback to the base interval and clears feedback before its unsigned elapsed-time gate",
      periodicBoundary: "the only direct static references to WORD 0x00552788 are the gate read and its reset store; this unit does not elevate absence of a direct writer to an alias-free global claim",
      result: "even under the conditional 50 ms base, the proven message feedback path permits 49, 50, or 51 ms effective intervals before any periodic adjustment; message arrival and scheduler gates therefore prevent a fixed-Hz claim",
    },
    projectContract: {
      acceptedUpdate: "original accepted updates remain separate from project ticks",
      raw16: "this evidence does not choose a project 24 Hz adapter and does not alter the turtle-tank raw16 contract",
      exactWallClockHz: null,
    },
    testVectors: vectors(),
    uncertainties: [
      "this bounded slice does not establish an edge from K01 stage-one selection to the state-5 record, its EBX overrides, or the 0x004bdfF4 guard consumed by the mode writer",
      "the recovered five direct guard stores are not an alias-free writer-completeness claim because two serialization paths receive the guard address",
      "the object+0x10 value producer is a UI/runtime object path; its K01 reachability and concrete value are not statically closed here",
      "message arrival, raw gate outcomes, and any alias writer of the periodic WORD are not a fixed wall-clock schedule",
    ],
  };
}

export function selectOriginalBaseInterval({ modeWord, selector }) {
  word(modeWord, "modeWord");
  dword(selector, "selector");
  if (modeWord === 1) return 50;
  if (selector === 0) return 64;
  if (selector === 1) return 60;
  if (selector === 2) return 50;
  if (selector === 3) return 40;
  return 30;
}

export function forwardOptionWordToSelector(optionWord) {
  word(optionWord, "optionWord");
  return (optionWord & 0x8000 ? optionWord | 0xffff0000 : optionWord) >>> 0;
}

export function replayModeWriter({ previousModeWord, sessionGateWord, argumentWord }) {
  word(previousModeWord, "previousModeWord");
  word(sessionGateWord, "sessionGateWord");
  word(argumentWord, "argumentWord");
  if (argumentWord !== 1) return previousModeWord;
  return sessionGateWord === 0 ? 1 : 0;
}

export function replayRecordToModeFlow({ previousModeWord, guardWord, recordField8Dword, tailResult, timeoutReached, alternateReached }) {
  word(previousModeWord, "previousModeWord");
  word(guardWord, "guardWord");
  dword(recordField8Dword, "recordField8Dword");
  dword(tailResult, "tailResult");
  bool(timeoutReached, "timeoutReached");
  bool(alternateReached, "alternateReached");
  let ebx = tailResult === 1 ? 2 : recordField8Dword;
  if (timeoutReached) ebx = 1;
  if (alternateReached) ebx = 2;
  const argumentWord = ebx & 0xffff;
  if (argumentWord === 0xffff) return { ebx, argumentWord, invoked: false, modeWord: previousModeWord, write: null };
  if (argumentWord !== 1) return { ebx, argumentWord, invoked: true, modeWord: previousModeWord, write: null };
  const write = guardWord === 0 ? 1 : 0;
  return { ebx, argumentWord, invoked: true, modeWord: write, write };
}

export function deriveFeedback({ historyReady, comparisonInput, recordFound, selectedTimestamp, previousFeedback }) {
  dword(historyReady, "historyReady");
  dword(comparisonInput, "comparisonInput");
  dword(selectedTimestamp, "selectedTimestamp");
  dword(previousFeedback, "previousFeedback");
  if (typeof recordFound !== "boolean") throw new TypeError(`recordFound must be a boolean; got ${recordFound}`);
  if (historyReady === 0 || comparisonInput === 0 || !recordFound || selectedTimestamp === 0 || selectedTimestamp === comparisonInput) return previousFeedback;
  return selectedTimestamp > comparisonInput ? 0xffffffff : 1;
}

export function applyFeedbackToBase({ baseInterval, feedback }) {
  dword(baseInterval, "baseInterval");
  dword(feedback, "feedback");
  return (baseInterval + feedback) >>> 0;
}

function vectors() {
  return [
    { id: "mode-one-ignores-selector", result: selectOriginalBaseInterval({ modeWord: 1, selector: 0xffffffff }), expected: 50 },
    { id: "non-one-selector-table", result: [0, 1, 2, 3, 4].map((selector) => selectOriginalBaseInterval({ modeWord: 0, selector })), expected: [64, 60, 50, 40, 30] },
    { id: "signed-word-forwarder", result: [0x0002, 0xffff, 0x8000].map(forwardOptionWordToSelector), expected: [2, 0xffffffff, 0xffff8000] },
    { id: "mode-writer-branches", result: [replayModeWriter({ previousModeWord: 0, sessionGateWord: 0, argumentWord: 1 }), replayModeWriter({ previousModeWord: 1, sessionGateWord: 1, argumentWord: 1 }), replayModeWriter({ previousModeWord: 1, sessionGateWord: 0, argumentWord: 2 })], expected: [1, 0, 1] },
    { id: "record-local-ebx-and-mode-flow", result: [
      replayRecordToModeFlow({ previousModeWord: 0, guardWord: 0, recordField8Dword: 0xffffffff, tailResult: 0, timeoutReached: false, alternateReached: false }),
      replayRecordToModeFlow({ previousModeWord: 0, guardWord: 0, recordField8Dword: 0x12340001, tailResult: 0, timeoutReached: false, alternateReached: false }),
      replayRecordToModeFlow({ previousModeWord: 1, guardWord: 0, recordField8Dword: 1, tailResult: 1, timeoutReached: false, alternateReached: false }),
      replayRecordToModeFlow({ previousModeWord: 1, guardWord: 7, recordField8Dword: 2, tailResult: 0, timeoutReached: true, alternateReached: false }),
      replayRecordToModeFlow({ previousModeWord: 1, guardWord: 0, recordField8Dword: 1, tailResult: 0, timeoutReached: true, alternateReached: true }),
    ], expected: [
      { ebx: 0xffffffff, argumentWord: 0xffff, invoked: false, modeWord: 0, write: null },
      { ebx: 0x12340001, argumentWord: 1, invoked: true, modeWord: 1, write: 1 },
      { ebx: 2, argumentWord: 2, invoked: true, modeWord: 1, write: null },
      { ebx: 1, argumentWord: 1, invoked: true, modeWord: 0, write: 0 },
      { ebx: 2, argumentWord: 2, invoked: true, modeWord: 1, write: null },
    ] },
    { id: "message-feedback-prevents-fixed-50ms", result: [deriveFeedback({ historyReady: 1, comparisonInput: 100, recordFound: true, selectedTimestamp: 101, previousFeedback: 0 }), deriveFeedback({ historyReady: 1, comparisonInput: 100, recordFound: true, selectedTimestamp: 100, previousFeedback: 0 }), deriveFeedback({ historyReady: 1, comparisonInput: 100, recordFound: true, selectedTimestamp: 99, previousFeedback: 0 })].map((feedback) => applyFeedbackToBase({ baseInterval: 50, feedback })), expected: [49, 50, 51] },
  ];
}

function readArtifact(path, sourceSha256, label, expected) {
  const resolvedPath = resolve(path);
  const buffer = readFileSync(resolvedPath);
  equal(buffer.byteLength, expected.byteLength, `${label} artifact byte length`);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  equal(sha256, expected.sha256, `${label} artifact SHA-256`);
  const document = JSON.parse(buffer.toString("utf8"));
  equal(document.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return {
    document,
    provenance: { path: resolvedPath, byteLength: buffer.byteLength, sha256 },
  };
}

function requireFunction(functions, entry, instructionCount, instructionSha256) {
  const found = functions.find((candidate) => candidate.entry === toHex(entry));
  if (!found) throw new Error(`functions artifact is missing ${toHex(entry)}`);
  equal(found.instructionCount, instructionCount, `${toHex(entry)} instruction count`);
  equal(found.instructionSha256, instructionSha256, `${toHex(entry)} instruction SHA-256`);
  return { entry: found.entry, bodyRanges: found.bodyRanges, instructionCount, instructionSha256 };
}

function requireCall(references, site, caller, callee) {
  const found = references.find((reference) => reference.type.endsWith("CALL") && reference.from === toHex(site) && reference.fromFunctionEntry === toHex(caller) && reference.to === toHex(callee));
  if (!found) throw new Error(`required call edge ${toHex(site)}: ${toHex(caller)} -> ${toHex(callee)} is missing`);
  return { callsite: found.from, caller: found.fromFunctionEntry, callee: found.to };
}

function requireExactReferenceSet(references, expectedEntries, expectedSha256, label) {
  const actual = references.map((reference) => ({ site: reference.from, caller: reference.fromFunctionEntry, target: reference.to, type: reference.type })).sort((left, right) => left.site.localeCompare(right.site));
  const expected = [...expectedEntries].sort((left, right) => left.site.localeCompare(right.site));
  equal(actual.length, expected.length, `${label} count`);
  equal(JSON.stringify(actual), JSON.stringify(expected), `${label} entries`);
  const sha256 = createHash("sha256").update(JSON.stringify(actual)).digest("hex");
  equal(sha256, expectedSha256, `${label} SHA-256`);
  return actual;
}

function requireDispatchTables(jumpTables) {
  const table = Object.values(jumpTables.tables).find((candidate) => candidate.functionEntry === "0x0045f9c0" && candidate.switchAddress === "0x0045fd56");
  if (!table) throw new Error("main-state switch is missing");
  equal(table.cases.find(({ label }) => label === 0)?.destination, "0x004600cb", "main-state one destination");
  equal(table.cases.find(({ label }) => label === 4)?.destination, "0x0046005c", "main-state five destination");
  const stage = Object.values(jumpTables.tables).find((candidate) => candidate.functionEntry === "0x0048d410" && candidate.switchAddress === "0x0048d422");
  if (!stage) throw new Error("stage switch is missing");
  equal(stage.cases.find(({ label }) => label === 1)?.destination, "0x0048d429", "K01 stage-one destination");
  equal(stage.cases.filter(({ destination }) => destination === "0x0048d429").length, 1, "K01 stage-one destination exclusivity");
}

function anchor(buffer, image, { id, va, bytes, meaning }) {
  const rawOffset = image.vaToRawOffset(va);
  if (rawOffset === undefined) throw new RangeError(`${toHex(va)} is not file-backed`);
  const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (Buffer.compare(actual, expected) !== 0) throw new Error(`code anchor ${id} mismatch at ${toHex(va)}`);
  return { id, va: toHex(va), rawOffset: toHex(rawOffset), bytes, meaning, matched: true };
}

function dword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD; got ${value}`);
}

function word(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD; got ${value}`);
}

function bool(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean; got ${value}`);
}

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(extractK01ClockModeProducers(), null, 2)}\n`);
}
