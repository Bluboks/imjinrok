#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_EXECUTABLE_SHA256 } from "./extract-entity-type-catalog.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";

const FUNCTION_CONTRACTS = [
  [0x00425b20, "0x00425b20-0x004262df", 506, "088a31ecaf83338b1823a4a21e14bb859690289d56f8bc53338145492a8e24c7"],
  [0x0043c9c0, "0x0043c9c0-0x0043d35f", 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  [0x0043b2d0, "0x0043b2d0-0x0043b4cd", 157, "c786f3bdbb59cd8e26ec6701baede222c2b8f756ae26dfc1acddc48e2e1f285d"],
  [0x0043c300, "0x0043c300-0x0043c9b1", 524, "7b235cc2bd3826f8cc3e6d7c69cd7dd063cbd753a09e2cd2ee6904d4d17900ee"],
  [0x0043ad30, "0x0043ad30-0x0043b2c0", 399, "73e365929407986912a6ab530245b134f87af2d5a65290b2137ffedef90acdfa"],
  [0x0043ac50, "0x0043ac50-0x0043ad21", 74, "bc64656f61574d2f6ad65590c9ee8b565f34b99fd5be10bb72d6ee5c311583bb"],
  [0x004651b0, "0x004651b0-0x00465206", 25, "e6d8ffb30a8a925132578ce7c128fecc49f90e0d5a4d3a58dc42a33b02a0fd26"],
];

const BYTE_ANCHORS = [
  {
    id: "mobile-release-owner-zero",
    va: 0x0043b35a,
    bytes: "66 c7 04 4d a4 2d ac 00 00 00",
    meaning: "the mode-1 predecessor writes WORD zero to the current footprint owner-slot grid.",
  },
  {
    id: "mobile-release-mask-clear",
    va: 0x004651ee,
    bytes: "66 81 a4 51 f4 27 02 00 ff 0f",
    meaning: "FUN_004651b0 clears entity high-nibble occupancy bits with WORD &= 0x0fff.",
  },
  {
    id: "next-tile-mask-consumer",
    va: 0x0043acd8,
    bytes: "66 8b 04 4d e4 27 ae 00 8b 4c 24 28 23 c1 66 85 c0 75 1c",
    meaning: "FUN_0043ac50 loads WORD cells from 0x00ae27e4, ANDs the supplied mask, and returns nonzero on any hit.",
  },
  {
    id: "mask-producer",
    va: 0x0043ada9,
    bytes: "66 8b 96 ec 01 00 00 03 c7 0f bf c0 0f bf c9 8d 04 80 8d 04 c0 8d 04 81 66 09 14 45 e4 27 ae 00",
    meaning: "FUN_0043ad30 ORs WORD record +0x1ec into the 0x00ae27e4 footprint mask grid.",
  },
  {
    id: "mobile-clear-mode-gate",
    va: 0x0043b2d0,
    bytes: "56 8b f1 8a 86 f0 01 00 00 84 c0 75 04 33 c0 5e c3 8a 46 68",
    meaning: "FUN_0043b2d0 reads BYTE record +0x68 after its active gate.",
  },
  {
    id: "mobile-old-grid-zero-store",
    va: 0x0043b330,
    bytes: "86 bc 01 00 00 d1 fa 2b c2 03 c5 78 27 3b 05 90 2d ac 00 7d 1f 85 c9 7c 1b 3b 0d 94 2d ac 00 7d 13 8d 04 80 8d 04 c0 8d 0c 81 66 c7 04 4d a4 2d ac 00 00 00",
    meaning: "the mode-1 predecessor loops signed footprint extents and writes WORD zero to the prior occupancy grid cell.",
  },
  {
    id: "mobile-write-mode-gate",
    va: 0x0043ad30,
    bytes: "56 8b f1 8a 86 f0 01 00 00 84 c0 75 04 33 c0 5e c3 66 83 be f2 04 00 00 00 8a 46 68",
    meaning: "FUN_0043ad30 reaches a separate mobile-mode branch after its active and state gates.",
  },
  {
    id: "mobile-write-no-occupant-test",
    va: 0x0043adf9,
    bytes: "03 c7 66 85 c0 7c 37 8b 15 90 2d ac 00 0f bf c0 3b c2 7d 2a 66 85 c9 7c 25 8b 15 94 2d ac 00 0f bf c9 3b ca 7d 18 66 8b 96 b6 01 00 00 8d 04 80 8d 04 c0 8d 0c 81 66 89 14 4d a4 2d ac 00",
    meaning: "the mode-1 writer bounds-checks coordinates and stores WORD record +0x1b6 without loading or testing the previous occupant.",
  },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractK01MobileOccupancyBoundary(parseArgs(process.argv.slice(2))), null, 2));
}

export function extractK01MobileOccupancyBoundary({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, "original executable SHA-256");
  const functions = readArtifact(functionsPath, executableSha256, "functions");
  const seeds = readArtifact(seedsPath, executableSha256, "seeds");
  const dispatcher = requireSeedFunction(seeds, 0x0043c9c0);
  const normalMovement = requireSeedFunction(seeds, 0x00425b20);
  const actionOneCalls = [
    requireCall(dispatcher, 0x0043cdac, 0x0043b2d0),
    requireCall(dispatcher, 0x0043cdb3, 0x0043c300),
    requireCall(dispatcher, 0x0043cdba, 0x0043ad30),
  ];

  return {
    id: "k01-mobile-occupancy-boundary",
    question: "For K01 mobile 1x1 records after create, how does action-1 movement clear old occupancy, choose/check a destination, and record an occupied destination?",
    source: {
      executable: { path: executablePath, sha256: executableSha256 },
      functions: sourceRecord(functionsPath, functions),
      seeds: sourceRecord(seedsPath, seeds),
    },
    analysisStatus: "unconfirmed",
    reproductionStatus: "not-reproduced",
    implementationStatus: "none",
    functions: FUNCTION_CONTRACTS.map((contract) => validateFunction(functions.functions, contract)),
    byteAnchors: BYTE_ANCHORS.map((anchor) => readAnchor(buffer, image, anchor)),
    actionOneCallOrder: actionOneCalls,
    normalMovementBlockedCall: requireCall(normalMovement, 0x00425e1e, 0x0043ac50),
    fields: [
      { offset: "+0x68", width: "BYTE", role: "mobile occupancy mode branch input" },
      { offset: "+0x1b0", width: "WORD", role: "dispatcher action switch input" },
      { offset: "+0x1b6", width: "WORD", role: "occupancy slot value" },
      { offset: "+0x1ec", width: "WORD", role: "occupancy collision-mask producer" },
      { offset: "+0x1ed", width: "BYTE", role: "constructor-set high byte; bit 0x10 establishes +0x1ec bit 0x1000 in the clear-flag path" },
      { offset: "+0x1ee", width: "WORD", role: "next-tile collision-mask consumer input" },
      { offset: "+0x4d8/+0x4da", width: "WORD + WORD", role: "normal-movement next-tile candidate" },
      { offset: "+0x1e3", width: "BYTE", role: "footprint width" },
      { offset: "+0x1e4", width: "BYTE", role: "footprint height" },
    ],
    confirmedBoundary: {
      actionOneOrder: "FUN_0043c9c0 action 1 calls FUN_0043b2d0, then FUN_0043c300, then FUN_0043ad30.",
      oldOccupancy: "The mobile-mode predecessor contains a bounded footprint loop with a WORD-zero old-grid store.",
      oldMask: "The predecessor calls the mask clear helper, whose cell operation is WORD &= 0x0fff, removing entity high-nibble occupancy.",
      occupiedDestinationWrite: "The mobile-mode writer stores the record WORD slot after bounds checks without an existing-occupant load/test in that store path.",
      normalMovementMask: "FUN_00425b20 passes next-tile coordinates and WORD(+0x1ee)|0x2000 to FUN_0043ac50; that helper returns blocked on a nonzero 0x00ae27e4 cell-mask intersection.",
      maskWrite: "FUN_0043ad30 ORs WORD +0x1ec into the same 0x00ae27e4 footprint mask grid before slot-grid storage.",
    },
    vectors: [
      {
        id: "action-one-order",
        input: { actionWord: 1, mobileModeByte: 1 },
        expected: "clear helper precedes movement helper, which precedes occupancy writer",
      },
      {
        id: "occupied-destination-store",
        input: { mobileModeByte: 1, destinationInBounds: true, destinationAlreadyContainsSlot: true },
        expected: "writer path itself has no previous-slot rejection branch",
      },
      {
        id: "unresolved-destination-coordinate",
        input: { actionWord: 1, mobileModeByte: 1 },
        expected: "next tile and mask check are recovered, but per-tick clear/scheduler order and class +0x1ec/+0x1ee meanings remain unresolved",
      },
    ],
    unresolvedEdge: {
      firstUnresolvedFunction: "per-tick occupancy-grid clear and scheduler ordering",
      reason: "The next-tile mask producer/consumer path is recovered, but the complete per-tick clear lifecycle, scheduler order across entities, and class-specific +0x1ec/+0x1ee mask meanings are not; those omissions prevent a full overlap/order rule.",
      consequence: "No original-profile movement occupancy adapter is exported or used by the simulation.",
    },
  };
}

function requireCall(functionRecord, callSite, callee) {
  const instruction = functionRecord.instructions.find(
    ({ address, text }) => Number.parseInt(address, 16) === callSite && text === `CALL ${toHex(callee)}`,
  );
  if (!instruction) throw new Error(`missing call ${toHex(callSite)} -> ${toHex(callee)}`);
  return { callSite: toHex(callSite), callee: toHex(callee) };
}

function requireSeedFunction(seeds, entry) {
  const record = seeds.functions?.find((candidate) => candidate.entry === toHex(entry));
  if (!record?.instructions) throw new Error(`seeds artifact is missing ${toHex(entry)}`);
  return record;
}

function validateFunction(functions, [entry, range, instructionCount, instructionSha256]) {
  const record = functions.find((candidate) => candidate.entry === toHex(entry));
  if (!record) throw new Error(`functions artifact is missing ${toHex(entry)}`);
  assertEqual(JSON.stringify(record.bodyRanges), JSON.stringify([range]), `${toHex(entry)} body range`);
  assertEqual(record.instructionCount, instructionCount, `${toHex(entry)} instruction count`);
  assertEqual(record.instructionSha256, instructionSha256, `${toHex(entry)} instruction SHA-256`);
  return { entry: record.entry, bodyRange: range, instructionCount, instructionSha256 };
}

function readAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) throw new Error(`${toHex(anchor.va)} is not file-backed`);
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  if (!buffer.subarray(rawOffset, rawOffset + expected.length).equals(expected)) {
    throw new Error(`byte anchor ${anchor.id} mismatch at ${toHex(anchor.va)}`);
  }
  return { ...anchor, va: toHex(anchor.va), rawOffset: toHex(rawOffset) };
}

function readArtifact(path, executableSha256, label) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  assertEqual(artifact.sourceSha256, executableSha256, `${label} source SHA-256`);
  return artifact;
}

function sourceRecord(path, value) {
  return { path, sha256: sha256(readFileSync(path)), sourceSha256: value.sourceSha256 };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function parseArgs(argv) {
  const options = {};
  const names = new Map([["--input", "executablePath"], ["--functions", "functionsPath"], ["--seeds", "seedsPath"]]);
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--json") continue;
    const key = names.get(argv[index]);
    if (!key || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${argv[index]}`);
    options[key] = argv[++index];
  }
  return options;
}
