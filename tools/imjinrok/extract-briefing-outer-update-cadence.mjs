#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";
import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_K0110_SHA256,
  reproduceSetDelay,
} from "./extract-briefing-metadata-evidence.mjs";

const DEFAULTS = Object.freeze({
  executablePath: "original/imjinrok2/imjinrok2.exe",
  scriptPath: "original/imjinrok2/script/K0110",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  jumpTablesPath: "analysis/generated/imjinrok2/jump-tables.json",
  seedsPath: "analysis/generated/imjinrok2/seeds.json",
  metadataExtractorPath: "tools/imjinrok/extract-briefing-metadata-evidence.mjs",
  changeTitleExtractorPath: "tools/imjinrok/extract-changetitle-consumer-evidence.mjs",
  metadataFixturePath: "analysis/fixtures/briefing-metadata-evidence-vectors.json",
  changeTitleFixturePath: "analysis/fixtures/changetitle-consumer-evidence-vectors.json",
});

const EXPECTED_SEEDS_SHA256 = "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2";
const EXPECTED_JUMP_TABLES_SHA256 = "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f";

const RAW_CODE_RANGES = [
  ["executable-entry", 0x004ae539, 0x004ae623, "172dac49eb994b9c1d2ecd7265d3316646177ff255497efd6419e905e7a667e4"],
  ["main-message-loop", 0x0045f9c0, 0x004607ad, "7081ada042adc4fa3a7d7b838f717c52bbd63fae2c45be566b0351cfd12dc022"],
  ["briefing-state-14-caller", 0x0047f300, 0x0047f431, "bc2645a3a95bd67c2cc5e5e0e1ac178704d76485fab2c63527753ed3ea44e715"],
  ["script-queue-consumer", 0x004824c0, 0x0048258c, "e3702a7856d2015dd125ebac0e5d52bf45476df74df70928beeebce1b657aa28"],
  ["previous-record-cleanup", 0x004833f0, 0x004834c6, "a17194ccafa0fea463dae57b5ad46b93fe52fb32786408188309277dc93d35cd"],
  ["record-readiness", 0x00483500, 0x00483658, "0bd213e0149996c62b950a55d2973a8e038e60d2b863ca2698b61069b7f7bd3f"],
  ["key-advance-gate", 0x004838b0, 0x004838f0, "4aae631a26f0292d0fe80ff4ddc732cadd0e5183c97fe05076eee5693abc7d6d"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const FUNCTION_CATALOG = [
  ["0x004ae539", "0x004ae539-0x004ae623", 235, 75, "a9c92a3631e498262597565679e4ed3114258758c418552473b1396984d7dbb2"],
  ["0x0045f9c0", "0x0045f9c0-0x004607ac", 3565, 801, "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24"],
  ["0x0047f300", "0x0047f300-0x0047f430", 305, 87, "64f2e3f70c9cc874af3d3fa8715b02ae1c9434e3fd957ff8801c32f93728d3a5"],
  ["0x004824c0", "0x004824c0-0x0048258b", 204, 62, "95f05a63f15937b7c68e7af68969cb1af50005fe2d2030b9319268fb19961281"],
  ["0x004833f0", "0x004833f0-0x004834c5", 214, 74, "138086125d2a443bc84e63191107ffdfa1bd9e2f5f260f673073d16c8cedba46"],
  ["0x00483500", "0x00483500-0x00483657", 344, 107, "c7612339d3bf49b021f8122959e6a6c1d18ada693b4a0fd689ca7234fb2cd1e9"],
  ["0x004838b0", "0x004838b0-0x004838ef", 64, 23, "1b2e552dc07b1c6cc904e1a21f26e6b6f72d7c43584fbcb78d37324cf13c6882"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({ entry, bodyRange, bodySize, instructionCount, instructionSha256 }));

const STATIC_EVIDENCE = [
  [0x0045fc88, "55 55 55 8d 4c 24 20 55 51 ff 15 44 72 4b 00 85 c0 74 2e", "main loop calls PeekMessageA with remove flag zero; a queued message dispatches and restarts before idle update"],
  [0x0045fd02, "8b 15 04 2e 88 00 89 15 b0 c0 88 00 ff 15 70 72 4b 00 a3 04 2e 88 00", "message-free idle path samples timeGetTime into DWORD 0x00882e04 after saving the prior clock"],
  [0x0045fd36, "0f bf 05 c8 df 4b 00 83 f8 28 0f 8f be 06 00 00 0f 84 a5 06 00 00 48 83 f8 22 0f 87 32 ff ff ff ff 24 85 b0 07 46 00", "signed-WORD main-state switch dispatches state 0x14 through the jump table at 0x0045fd56"],
  [0x0045ffb6, "e8 45 f3 01 00", "main state 0x14 branch calls the briefing owner caller FUN_0047f300"],
  [0x0047f300, "56 b9 78 ce c5 00 33 f6 e8 b3 31 00 00", "briefing caller passes owner 0x00c5ce78 to the script queue consumer before render-side work"],
  [0x004824cd, "e8 de 13 00 00 83 f8 01 75 21", "queue consumer consults key/advance gate; only an exact one enters previous-record cleanup"],
  [0x00482514, "e8 e7 0f 00 00 eb 05", "queue consumer checks previous record readiness before attempting the next record"],
  [0x00482539, "8b 86 1c 0c 00 00 8d 0c d0 51 8b ce e8 a6 0b 00 00", "at most one record consumer call is made per queue-consumer invocation"],
  [0x00482545, "e8 a6 0b 00 00 85 c0 75 35", "record consumer failure retains no progression fallback; success returns to the outer caller"],
  [0x00483549, "ff 15 70 72 4b 00 8b 96 20 0c 00 00 8b 8e 24 0c 00 00 2b c2 3b c1 0f 86 cb 00 00 00", "SETDELAYTIME readiness uses DWORD-wrapped elapsed and strict unsigned elapsed > duration; equality retains"],
  [0x004838b0, "56 8b 35 bc 71 4b 00 6a 1b ff d6 66 85 c0 7c 09 6a 0d ff d6 66 85 c0 7d 23", "the separate key gate samples GetAsyncKeyState(VK_ESCAPE=0x1b) and VK_RETURN=0x0d before its 500-unit debounce"],
  [0x004833a5, "66 ff 83 18 0c 00 00 5f 5e b8 01 00 00 00", "every accepted record increments owner+0xc18 exactly once and returns one"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REQUIRED_EDGES = [
  ["entry-to-main-loop", "0x004ae602", "0x004ae539", "0x0045f9c0"],
  ["state-14-to-briefing", "0x0045ffb6", "0x0045f9c0", "0x0047f300"],
  ["briefing-to-queue-consumer", "0x0047f308", "0x0047f300", "0x004824c0"],
  ["queue-to-key-gate", "0x004824cd", "0x004824c0", "0x004838b0"],
  ["queue-to-readiness", "0x00482514", "0x004824c0", "0x00483500"],
  ["queue-to-record-consumer", "0x00482545", "0x004824c0", "0x004830f0"],
  ["queue-to-previous-cleanup", "0x004824f3", "0x004824c0", "0x004833f0"],
];

export function extractBriefingOuterUpdateCadence(paths = {}) {
  const input = { ...DEFAULTS, ...paths };
  const { buffer, image } = readPeImage(input.executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${input.executablePath} SHA-256`);
  assertEqual(sha256(readFileSync(input.scriptPath)), EXPECTED_K0110_SHA256, `${input.scriptPath} SHA-256`);
  const functions = readJson(input.functionsPath);
  const references = readJson(input.referencesPath);
  const jumpTables = readJson(input.jumpTablesPath);
  const seeds = readJson(input.seedsPath);
  for (const [label, artifact] of [["functions", functions], ["references", references], ["jump tables", jumpTables], ["seeds", seeds]]) {
    assertEqual(artifact.sourceSha256, executableSha256, `${label} sourceSha256`);
  }
  assertEqual(sha256(readFileSync(input.jumpTablesPath)), EXPECTED_JUMP_TABLES_SHA256, `${input.jumpTablesPath} SHA-256`);
  assertEqual(sha256(readFileSync(input.seedsPath)), EXPECTED_SEEDS_SHA256, `${input.seedsPath} SHA-256`);
  const stateSwitch = jumpTables.tables?.find((table) => table.functionEntry === "0x0045f9c0" && table.switchAddress === "0x0045fd56");
  if (!stateSwitch) throw new Error("main message-loop state switch 0x0045fd56 is missing");
  assertEqual(stateSwitch.cases.find((entry) => entry.label === 19)?.destination, "0x0045ffb6", "state 0x14 jump-table destination");
  const imports = parsePeImports(buffer, image);
  const importEvidence = [
    requireImport(imports, 0x004b7244, "USER32.dll", "PeekMessageA"),
    requireImport(imports, 0x004b7270, "WINMM.dll", "timeGetTime"),
    requireImport(imports, 0x004b71bc, "USER32.dll", "GetAsyncKeyState"),
  ];
  return {
    question: "Which outer message/update loop visits K0110 SETDELAYTIME and CHANGETITLE consumers, and on which accepted outer update do TITLE/OBJECTIVE/SPEECH transitions occur under strict elapsed > duration and retained-record progression?",
    source: {
      executablePath: input.executablePath,
      executableSha256,
      scriptPath: input.scriptPath,
      scriptSha256: EXPECTED_K0110_SHA256,
      functionsSha256: sha256(readFileSync(input.functionsPath)),
      referencesSha256: sha256(readFileSync(input.referencesPath)),
      jumpTablesSha256: EXPECTED_JUMP_TABLES_SHA256,
      seedsSha256: EXPECTED_SEEDS_SHA256,
      upstreamExtractors: {
        metadataSha256: sha256(readFileSync(input.metadataExtractorPath)),
        changeTitleSha256: sha256(readFileSync(input.changeTitleExtractorPath)),
      },
      upstreamFixtures: {
        metadataSha256: sha256(readFileSync(input.metadataFixturePath)),
        changeTitleSha256: sha256(readFileSync(input.changeTitleFixturePath)),
      },
    },
    analysisStatus: "static-confirmed",
    reproductionStatus: "scoped-reproduction-complete",
    implementationStatus: "analysis-only-no-production-change",
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    callEdges: REQUIRED_EDGES.map(([label, from, caller, callee]) => requireCallEdge(references.references, label, from, caller, callee)),
    queueCallers: requireReferenceProjection(references.references, "record consumer direct callers", "to", "0x004824c0", 3, "0d82d739a6458ab73452c92737dcd36df4cb1d0dd98e4c2551b1e7a6e8774dba"),
    imports: importEvidence,
    jumpTable: { functionEntry: stateSwitch.functionEntry, switchAddress: stateSwitch.switchAddress, state14Label: 19, state14Destination: "0x0045ffb6" },
    outerCallChain: {
      entry: "0x004ae539",
      mainMessageLoop: "0x0045f9c0",
      briefingState: "signed WORD 0x004bdfc8 == 0x14; jump-table label 19 reaches 0x0045ffb6",
      briefingCaller: "0x0047f300",
      queueConsumer: "0x004824c0",
      owner: "0x00c5ce78 (briefing script object; B01 owner/resource object remains 0x005e3680)",
      queueRule: "PeekMessageA-present iterations dispatch and restart before clock sample or briefing queue visit; message-absent idle iterations enter the main-state switch",
      perAcceptedVisit: "0x0047f300 calls 0x004824c0 once; 0x004824c0 can call 0x004830f0 at most once, then caller performs its render-side work",
      alternateQueueCallers: [
        { caller: "0x004888b0", owner: "0x00bcbe08", scope: "mode-specific stage script; not K0110 state-0x14 path" },
        { caller: "0x0048b660", owner: "0x00bcbe08", scope: "mode-specific stage script; not K0110 state-0x14 path" },
      ],
    },
    progression: {
      fields: { active: "owner+0x08 == 1", nextRecordIndex: "signed WORD owner+0xc18", recordCount: "unsigned WORD owner+0xc1a", records: "8-byte records at owner+0xc1c" },
      order: ["key/advance gate", "previous-record cleanup only when key gate returns one", "previous-record readiness", "one current-record consumer", "owner+0xc18 increment", "briefing caller render"],
      retainedBoundary: "previous SETDELAYTIME readiness false returns from 0x004824c0 without calling 0x004830f0; no same-update multi-record loop exists",
      endBoundary: "when nextRecordIndex == recordCount and previous readiness is one, 0x004823d0 teardown runs only while owner+0x0c == 0; owner+0x0c nonzero retains the manager",
      acceptedUpdateUnit: "an accepted outer visit means a message-absent main-loop iteration that reaches state 0x14; it is not a fixed 24 Hz/gameplay scheduler step",
    },
    timing: {
      setDelay: "raw signed WORD is sign-extended to DWORD; duration 0 is immediately ready; otherwise elapsed=(timeGetTime()-start) mod 2^32 and ready iff unsigned elapsed > duration; equality retains and completion clears start/duration",
      rawDurations: [0, 15, 100, 500],
      wallClock: { exactMillisecondsPerAcceptedOuterUpdate: null, exactFps: null, reason: "message availability, key/readiness state, and the separate briefing caller cadence are not fixed by this static CFG" },
      gameplaySchedulerSeparation: "0x00447bc0/0x00447360 gameplay scheduler cadence is not used as a briefing cadence assumption",
    },
    transitions: {
      changetitle: "CHANGETITLE record accepted on one outer update; B01 owner+0xc14 replacement/load lifecycle advances then, but actual sprite compositor remains unresolved",
      title: "TITLE record accepted on one outer update; owner+0x564 is set and the same briefing caller's subsequent ordered draw can include TITLE",
      objective: "OBJECTIVE record accepted on one outer update; owner+0x568 is set and ordered draw checks OBJECTIVE before TITLE in that same caller visit",
      speech: "SPEECH record accepted on one outer update after the preceding retained delay is ready; this packet does not claim SPEECH portrait/compositor details beyond the existing B01/SPEECH slices",
      contract: "For each accepted outer visit, at most one record index advances. A prior non-ready SETDELAYTIME retains index and blocks TITLE/OBJECTIVE/SPEECH until the first later visit whose elapsed DWORD is duration+1 (subject to wrap).",
    },
    uncertainties: [
      "exact wall-clock duration/frame exposure is unresolved; raw 500/15/100 values are not browser milliseconds",
      "actual CHANGETITLE title-sprite draw consumer/compositor remains unresolved per B01",
      "GetAsyncKeyState escape/return debounce is a separate key gate, not a substitute for the Windows outer message queue",
      "alternate 0x004888b0/0x0048b660 record consumers are preserved as non-K0110 mode variants; they are not generalized into the briefing loop",
      "SPEECH resource/portrait lifecycle remains in its existing focused slice",
    ],
  };
}

export function reproduceOuterUpdate(input) {
  const state = normalizeSimulationInput(input);
  if (state.messagePresent) return { acceptedOuterUpdate: false, events: [{ type: "message-dispatch", progression: "retained" }], state: snapshotState(state) };
  const events = [{ type: "briefing-outer-visit", acceptedOuterUpdate: true }];
  if (!state.active) return { acceptedOuterUpdate: true, events: [...events, { type: "inactive-manager" }], state: snapshotState(state) };
  const keyGate = state.escapeDown || state.enterDown;
  if (keyGate && state.nextRecordIndex > 0) events.push({ type: "previous-record-cleanup" });
  let previousReady = true;
  if (state.nextRecordIndex > 0) {
    const previous = state.records[state.nextRecordIndex - 1];
    previousReady = recordReady(previous, state);
    events.push({ type: "previous-readiness", record: previous.type, ready: previousReady });
  }
  if (state.nextRecordIndex < state.records.length && previousReady) {
    const record = state.records[state.nextRecordIndex];
    consumeRecord(record, state);
    events.push({ type: "record-accepted", record: record.type, index: state.nextRecordIndex });
    state.nextRecordIndex += 1;
  } else if (state.nextRecordIndex === state.records.length && previousReady && state.teardownAllowed) {
    state.tornDown = true;
    events.push({ type: "teardown" });
  } else if (!previousReady) {
    events.push({ type: "record-retained", index: state.nextRecordIndex });
  }
  events.push({ type: "briefing-render", frame: renderFrame(state) });
  return { acceptedOuterUpdate: true, events, state: snapshotState(state) };
}

export function reproduceOuterUpdateSequence({ records, updates, active = true, teardownAllowed = true } = {}) {
  if (!Array.isArray(records) || !Array.isArray(updates)) throw new TypeError("records and updates must be arrays");
  const state = { records: records.map(normalizeRecord), updates, active, teardownAllowed, nextRecordIndex: 0, startTick: 0, durationWord: 0, durationDword: 0, titleResource: null, titleActive: 0, objectiveActive: 0, speechActive: 0, tornDown: false };
  const trace = [];
  for (const [outerIndex, update] of updates.entries()) {
    const result = reproduceOuterUpdate({ ...state, ...update });
    Object.assign(state, result.state);
    trace.push({ outerIndex, input: update, ...result });
  }
  return { trace, final: snapshotState(state) };
}

export function validateCanonicalUpstream(fixture, paths = {}) {
  if (!fixture || typeof fixture !== "object" || !fixture.source) throw new TypeError("fixture source closure is required");
  const input = { ...DEFAULTS, ...paths };
  const actual = {
    executableSha256: sha256(readFileSync(input.executablePath)),
    scriptSha256: sha256(readFileSync(input.scriptPath)),
    functionsSha256: sha256(readFileSync(input.functionsPath)),
    referencesSha256: sha256(readFileSync(input.referencesPath)),
    jumpTablesSha256: sha256(readFileSync(input.jumpTablesPath)),
    seedsSha256: sha256(readFileSync(input.seedsPath)),
    upstreamExtractors: {
      metadataSha256: sha256(readFileSync(input.metadataExtractorPath)),
      changeTitleSha256: sha256(readFileSync(input.changeTitleExtractorPath)),
    },
    upstreamFixtures: {
      metadataSha256: sha256(readFileSync(input.metadataFixturePath)),
      changeTitleSha256: sha256(readFileSync(input.changeTitleFixturePath)),
    },
  };
  assertEqual(JSON.stringify(fixture.source), JSON.stringify({ ...fixture.source, ...actual }), "fixture source closure");
  return actual;
}

function normalizeSimulationInput(input) {
  if (!input || typeof input !== "object") throw new TypeError("update input must be an object");
  const state = { ...input };
  if (!Array.isArray(state.records)) state.records = [];
  state.records = state.records.map(normalizeRecord);
  if (!Number.isInteger(state.nextRecordIndex) || state.nextRecordIndex < 0 || state.nextRecordIndex > state.records.length) state.nextRecordIndex = 0;
  state.active = state.active ?? true;
  state.teardownAllowed = state.teardownAllowed ?? true;
  state.messagePresent = Boolean(state.messagePresent);
  state.escapeDown = Boolean(state.escapeDown);
  state.enterDown = Boolean(state.enterDown);
  state.startTick = state.startTick ?? 0;
  state.durationWord = state.durationWord ?? 0;
  state.durationDword = state.durationDword ?? (state.durationWord >>> 0);
  state.nowTick = state.nowTick ?? 0;
  state.titleResource = state.titleResource ?? null;
  state.titleActive = state.titleActive ?? 0;
  state.objectiveActive = state.objectiveActive ?? 0;
  state.speechActive = state.speechActive ?? 0;
  state.tornDown = Boolean(state.tornDown);
  assertUnsignedDword(state.nowTick ?? 0, "nowTick");
  return state;
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object" || typeof record.type !== "string") throw new TypeError("record.type must be a string");
  return { ...record, type: record.type.toUpperCase() };
}

function recordReady(record, state) {
  if (record.type === "SETDELAYTIME") {
    const result = reproduceSetDelay({ startTick: state.startTick, durationWord: state.durationWord, nowTick: state.nowTick });
    if (result.ready) { state.startTick = result.final.startTick; state.durationDword = result.final.durationDword; state.durationWord = 0; }
    return result.ready;
  }
  return record.type !== "SPEECH" || record.ready !== false;
}

function consumeRecord(record, state) {
  switch (record.type) {
    case "SETDELAYTIME":
      assertSignedWord(record.durationWord ?? record.duration ?? 0, "durationWord");
      state.startTick = state.nowTick;
      state.durationWord = record.durationWord ?? record.duration ?? 0;
      state.durationDword = state.durationWord >>> 0;
      break;
    case "CHANGETITLE":
      state.titleResource = record.path ?? null;
      break;
    case "TITLE":
      state.titleActive = 1;
      break;
    case "OBJECTIVE":
      state.objectiveActive = 1;
      break;
    case "SPEECH":
      state.speechActive = 1;
      break;
    default:
      break;
  }
}

function renderFrame(state) {
  return {
    titleResource: state.titleResource,
    titleSpriteCompositor: "unresolved",
    objective: state.objectiveActive === 1,
    title: state.titleActive === 1,
    speech: state.speechActive === 1,
    drawOrder: ["objective", "title"].filter((name) => state[`${name}Active`] === 1),
  };
}

function snapshotState(state) {
  return { nextRecordIndex: state.nextRecordIndex, startTick: state.startTick, durationWord: state.durationWord, durationDword: state.durationDword, titleResource: state.titleResource, titleActive: state.titleActive, objectiveActive: state.objectiveActive, speechActive: state.speechActive, tornDown: state.tornDown };
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

function requireCallEdge(references, label, from, caller, callee) {
  const edge = references.find((reference) => reference.from === from && reference.fromFunctionEntry === caller && reference.to === callee && reference.type.endsWith("CALL"));
  if (!edge) throw new Error(`${label} reference is missing`);
  return { label, from, caller, callee, type: edge.type };
}

function requireReferenceProjection(references, label, field, value, count, expectedDigest) {
  const projection = references.filter((reference) => reference[field] === value).map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assertEqual(projection.length, count, `${label} count`);
  const digest = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
  assertEqual(digest, expectedDigest, `${label} SHA-256`);
  return { label, count, digest, references: projection };
}

function parsePeImports(buffer, image) {
  const peOffset = buffer.readUInt32LE(0x3c);
  const optionalHeaderOffset = peOffset + 24;
  const importDirectoryRva = buffer.readUInt32LE(optionalHeaderOffset + 104);
  const importDirectoryOffset = image.vaToRawOffset(image.imageBase + importDirectoryRva);
  if (importDirectoryOffset === undefined) throw new Error("PE import directory is not file-backed");
  const imports = [];
  for (let descriptorOffset = importDirectoryOffset; buffer.readUInt32LE(descriptorOffset) !== 0 || buffer.readUInt32LE(descriptorOffset + 12) !== 0; descriptorOffset += 20) {
    const originalFirstThunk = buffer.readUInt32LE(descriptorOffset);
    const nameRva = buffer.readUInt32LE(descriptorOffset + 12);
    const firstThunk = buffer.readUInt32LE(descriptorOffset + 16);
    const nameOffset = image.vaToRawOffset(image.imageBase + nameRva);
    const lookupOffset = image.vaToRawOffset(image.imageBase + (originalFirstThunk || firstThunk));
    if (nameOffset === undefined || lookupOffset === undefined) throw new Error("PE import descriptor points outside file-backed data");
    const dll = readCString(buffer, nameOffset);
    for (let index = 0; ; index += 1) {
      const lookup = buffer.readUInt32LE(lookupOffset + index * 4);
      if (lookup === 0) break;
      if ((lookup & 0x80000000) !== 0) continue;
      const hintNameOffset = image.vaToRawOffset(image.imageBase + lookup);
      if (hintNameOffset === undefined) throw new Error("PE import name points outside file-backed data");
      imports.push({ dll, name: readCString(buffer, hintNameOffset + 2), iatVa: image.imageBase + firstThunk + index * 4 });
    }
  }
  return imports;
}

function requireImport(imports, iatVa, expectedDll, expectedName) {
  const imported = imports.find((candidate) => candidate.iatVa === iatVa);
  if (!imported) throw new Error(`PE import ${toHex(iatVa)} is missing`);
  assertEqual(imported.dll, expectedDll, `${toHex(iatVa)} import DLL`);
  assertEqual(imported.name, expectedName, `${toHex(iatVa)} import name`);
  return { dll: imported.dll, name: imported.name, iatVa: toHex(iatVa) };
}

function assertUnsignedDword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`);
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) console.log(JSON.stringify(extractBriefingOuterUpdateCadence(), null, 2));
