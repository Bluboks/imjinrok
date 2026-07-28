#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_EXECUTABLE_SHA256,
  extractEntityTypeCatalog,
} from "./extract-entity-type-catalog.mjs";
import {
  extractK01BeaconK0120Trigger,
  K01_REINFORCEMENT_DESCRIPTORS,
} from "./extract-k01-beacon-k0120-trigger.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const SLOT_COUNT = 1200;

const FUNCTION_CONTRACTS = [
  [0x00488420, "0x00488420-0x004884b5", 59, "4b4841d6b3756b3d2dd3f3c6621ab98a413ce4608ea3d5c9c737ee1618c3ee8b"],
  [0x00483a60, "0x00483a60-0x00483a9c", 25, "887217ddc12a9bc4dd90c38b9365be9bcaf65f14e1d0c709de86c62479cbd917"],
  [0x00483c50, "0x00483c50-0x00483c9f", 26, "d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e"],
  [0x00437650, "0x00437650-0x00438025", 539, "4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28"],
  [0x0045bd00, "0x0045bd00-0x0045bef8", 103, "6561fe98f630ac5f7f0765426c257c4bc3900aae6d2964afa649447cb5030e8a"],
  [0x0045bf50, "0x0045bf50-0x0045efb9", 5100, "1fcf54f5ad46f30893b04871058a6c307a0ef32e8dab2c689be4cc18fb980133"],
  [0x0043aa80, "0x0043aa80-0x0043ab6f", 52, "4d12a0f4c96872eeba5e2fa89f6bba5176be525322cc6e69fd54f62ff8c2291f"],
  [0x00438790, "0x00438790-0x0043892b", 126, "4f4ef2f14f512d8f16a39acdcd0febb611cd2ec63801f37a4a987f21ecc026da"],
  [0x0043c9c0, "0x0043c9c0-0x0043d35f", 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  [0x0043c300, "0x0043c300-0x0043c9b1", 524, "7b235cc2bd3826f8cc3e6d7c69cd7dd063cbd753a09e2cd2ee6904d4d17900ee"],
  [0x0043ad30, "0x0043ad30-0x0043b2c0", 399, "73e365929407986912a6ab530245b134f87af2d5a65290b2137ffedef90acdfa"],
];

const CODE_ANCHORS = [
  {
    id: "descriptor-allocates-before-bounds",
    va: 0x0048843f,
    bytes: "55 e8 1b b6 ff ff 83 c4 04 66 85 c0 74 56",
    meaning: "the descriptor class is pushed to the allocator before signed coordinate checks",
  },
  {
    id: "descriptor-creates-in-bounds-only",
    va: 0x00488468,
    bytes: "66 85 c9 7c 2f 0f bf f1 3b 35 90 2d ac 00 7d 24",
    meaning: "signed x must be nonnegative and less than the map width before record creation",
  },
  {
    id: "allocator-later-tie-and-increment",
    va: 0x00483a71,
    bytes: "66 83 b9 a0 f6 ff ff 00 75 12 66 8b 31 0f bf d6 3b d3 7c 04 8b da 8b c7 46 66 89 31",
    meaning: "inactive slots with signed age at least the current best win, then increment with WORD wrap",
  },
  {
    id: "record-generation-and-create",
    va: 0x00483c58,
    bytes: "66 a1 98 5f 7c 00 51 8b 4c 24 18 52 8b 54 24 18 51 8b 4c 24 18 66 40 52 51 66 a3 98 5f 7c 00",
    meaning: "generation increments as a WORD before the record initializer call",
  },
  {
    id: "record-slot-generation-and-position",
    va: 0x0043782e,
    bytes: "66 89 86 b6 01 00 00 66 8b 44 24 24 66 89 be b0 01 00 00 88 5e 37 88 5e 38 66 89 8e b8 01 00 00 66 89 96 bc 01 00 00 66 89 86 be 01 00 00",
    meaning: "record initialization writes slot, generation, and exact signed x/y fields",
  },
  {
    id: "record-copies-footprint-and-mobile-mode",
    va: 0x00437bf5,
    bytes: "8a 90 24 2e 88 00 88 96 e3 01 00 00 8a 88 26 2e 88 00 88 8e e4 01 00 00",
    meaning: "type footprint bytes are copied to record +0x1e3/+0x1e4",
  },
  {
    id: "type-writer-1x1-fields",
    va: 0x0045bd4d,
    bytes: "66 8b 54 24 28 66 89 41 14 66 8b 44 24 2c 66 89 51 16",
    meaning: "the type writer maps its paired footprint arguments to type +0x14 and +0x16",
  },
  {
    id: "mobile-occupancy-overwrites-cell",
    va: 0x0043ad30,
    bytes: "56 8b f1 8a 86 f0 01 00 00 84 c0 75 04 33 c0 5e c3 66 83 be f2 04 00 00 00 8a 46 68 53 55 57 0f 85 ec 01 00 00 3c 01",
    meaning: "the occupancy writer selects the mobile +0x68 == 1 branch",
  },
  {
    id: "mobile-occupancy-unconditional-slot-write",
    va: 0x0043adf9,
    bytes: "03 c7 66 85 c0 7c 37 8b 15 90 2d ac 00 0f bf c0 3b c2 7d 2a 66 85 c9 7c 25 8b 15 94 2d ac 00 0f bf c9 3b ca 7d 18 66 8b 96 b6 01 00 00 8d 04 80 8d 04 c0 8d 0c 81 66 89 14 4d a4 2d ac 00",
    meaning: "the mobile footprint loop bounds-checks x/y, loads record slot +0x1b6, and writes it to occupancy without an occupant-zero test",
  },
  {
    id: "constructor-action-one-register",
    va: 0x00437719,
    bytes: "bf 01 00 00 00",
    meaning: "the record constructor establishes EDI as action value 1",
  },
  {
    id: "constructor-action-one-write",
    va: 0x0043783a,
    bytes: "66 89 be b0 01 00 00",
    meaning: "the constructor writes action 1 to record +0x1b0",
  },
  {
    id: "mobile-mode-from-type-flags",
    va: 0x00437d46,
    bytes: "8a 4e 74 f6 c1 08 0f 95 c2 42 88 56 68",
    meaning: "type flag bit 0x08 clear yields record mobile occupancy mode +0x68 equal to 1",
  },
  {
    id: "nearby-empty-search-is-bit-eight-gated",
    va: 0x0043c58c,
    bytes: "f6 43 74 08 0f 84 88 01 00 00",
    meaning: "the nearby-empty search branch is entered only when record flag bit 0x08 is set",
  },
];

const K01_TYPE_CALLS = [
  [12, 0x0045c3be, [0x0045c3a4, 0x0045c3a5], 0x0c082805],
  [13, 0x0045c541, [0x0045c527, 0x0045c528], 0x00089005],
  [14, 0x0045c843, [0x0045c826, 0x0045c827], 0x80143205],
  [82, 0x0045dd2a, [0x0045dd0d, 0x0045dd0e], 0x00880805],
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    JSON.stringify(
      extractK01ReinforcementPlacementPolicy(parseArgs(process.argv.slice(2))),
      null,
      2,
    ),
  );
}

export function selectInactiveReinforcementSlot({ active, reuseAges }) {
  validateSlotArrays(active, reuseAges);
  const nextReuseAges = [...reuseAges];
  let selectedSlot = 0;
  let bestAge = 0;

  for (let slot = 1; slot < SLOT_COUNT; slot += 1) {
    if (active[slot]) continue;
    const age = reuseAges[slot];
    if (age >= bestAge) {
      bestAge = age;
      selectedSlot = slot;
    }
    nextReuseAges[slot] = signedWord(age + 1);
  }

  return { selectedSlot, reuseAges: nextReuseAges };
}

export function replayK01ReinforcementPlacement({
  origin,
  mapWidth,
  mapHeight,
  generation,
  active,
  reuseAges,
  occupancy,
  descriptors = K01_REINFORCEMENT_DESCRIPTORS,
}) {
  validateOrigin(origin);
  validateMapDimensions(mapWidth, mapHeight);
  validateUnsignedWord(generation, "generation");
  validateSlotArrays(active, reuseAges);
  validateOccupancy(occupancy, mapWidth, mapHeight);
  validateDescriptors(descriptors);

  let nextGeneration = generation;
  let nextActive = [...active];
  let nextReuseAges = [...reuseAges];
  let nextOccupancy = [...occupancy];
  const records = [];
  const skippedOutOfBounds = [];
  const allocations = [];

  for (let index = 0; index < descriptors.length; index += 1) {
    const [internalClass, rawOwnerWord, dx, dy] = descriptors[index];
    if (internalClass === 0) {
      return {
        returnValue: 1,
        terminated: true,
        aborted: false,
        generation: nextGeneration,
        active: nextActive,
        reuseAges: nextReuseAges,
        occupancy: nextOccupancy,
        records,
        skippedOutOfBounds,
        allocations,
      };
    }

    const allocation = selectInactiveReinforcementSlot({
      active: nextActive,
      reuseAges: nextReuseAges,
    });
    const slot = allocation.selectedSlot;
    nextReuseAges = allocation.reuseAges;
    allocations.push({ index, slot });
    if (slot === 0) {
      return {
        returnValue: 0,
        terminated: false,
        aborted: true,
        generation: nextGeneration,
        active: nextActive,
        reuseAges: nextReuseAges,
        occupancy: nextOccupancy,
        records,
        skippedOutOfBounds,
        allocations,
      };
    }

    const x = signedWord(origin.x + dx);
    const y = signedWord(origin.y + dy);
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) {
      skippedOutOfBounds.push({ index, internalClass, slot, x, y });
      continue;
    }

    nextGeneration = unsignedWord(nextGeneration + 1);
    nextActive[slot] = true;
    const cell = y * mapWidth + x;
    nextOccupancy[cell] = slot;
    records.push({
      index,
      internalClass,
      rawOwnerWord,
      slot,
      generation: nextGeneration,
      x,
      y,
      footprint: { width: 1, height: 1 },
      occupancyMode: 1,
    });
  }

  throw new Error("descriptors must end with a class-zero terminator");
}

export function extractK01ReinforcementPlacementPolicy({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  beaconOptions,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functions = readArtifact(functionsPath, executableSha256, "functions");
  const seeds = readArtifact(seedsPath, executableSha256, "seeds");
  const beacon = extractK01BeaconK0120Trigger({
    ...(beaconOptions ?? {}),
    input: executablePath,
    functions: functionsPath,
    seeds: seedsPath,
  });
  assertDeepEqual(
    beacon.descriptorCreation.descriptors,
    K01_REINFORCEMENT_DESCRIPTORS,
    "K01 descriptor contract",
  );
  const functionEvidence = FUNCTION_CONTRACTS.map((contract) =>
    validateFunction(functions.functions, contract),
  );
  const anchors = CODE_ANCHORS.map((anchor) => readAnchor(buffer, image, anchor));
  const callEdges = [
    requireCall(seeds, 0x0048a5c0, 0x0048a7ae, 0x00488420),
    requireCall(seeds, 0x00488420, 0x00488440, 0x00483a60),
    requireCall(seeds, 0x00488420, 0x00488494, 0x00483c50),
    requireCall(seeds, 0x00483c50, 0x00483c95, 0x00437650),
    requireCall(seeds, 0x0043c9c0, 0x0043cdac, 0x0043b2d0),
    requireCall(seeds, 0x0043c9c0, 0x0043cdb3, 0x0043c300),
    requireCall(seeds, 0x0043c9c0, 0x0043cdba, 0x0043ad30),
    requireCall(seeds, 0x00437650, 0x00437f9c, 0x0043aa80),
    requireCall(seeds, 0x00437650, 0x00438013, 0x00438790),
    requireCall(seeds, 0x00437650, 0x0043801a, 0x0043c9c0),
  ];
  const typeCatalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const typeFootprints = recoverK01TypeFootprints(seeds, typeCatalog);
  const immediatePositionReads = recoverImmediatePositionReadInventory(seeds);
  const canonicalReplay = replayK01ReinforcementPlacement({
    origin: beacon.descriptorCreation.origin,
    mapWidth: 60,
    mapHeight: 60,
    generation: 0,
    active: Array(SLOT_COUNT).fill(false),
    reuseAges: Array(SLOT_COUNT).fill(0),
    occupancy: Array(60 * 60).fill(0),
  });

  return {
    question:
      "For K01's nine native reinforcement descriptors, which slot is selected, when do descriptor traversal and creation stop, how do signed bounds and exact creation coordinates behave, and how does 1x1 mobile occupancy handle an existing occupant?",
    analysisStatus: "static-proven",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      functions: { path: functionsPath, sourceSha256: functions.sourceSha256 },
      seeds: { path: seedsPath, sourceSha256: seeds.sourceSha256 },
    },
    functionEvidence,
    callEdges,
    byteAnchors: anchors,
    k01Descriptors: beacon.descriptorCreation.descriptors,
    typeFootprints,
    coordinateAndOccupancyPolicy: {
      allocationBeforeBounds: true,
      outOfBounds: "skip create and continue after allocator age updates",
      slotFailure: "abort the remaining descriptor batch and retain prior creates",
      recordCoordinates: "signed origin plus signed descriptor offset, written exactly",
      immediateCreateReturn:
        "constructor action 1 enters 0x0043c9c0 case 1 and calls 0x0043b2d0, 0x0043c300, then 0x0043ad30; 0x0043c300 reads rather than rewrites +0x1bc/+0x1be",
      immediatePositionReads,
      footprint: "classes 12/13/14/82 initialize as 1x1",
      mobileOccupancy:
        "1x1 write uses the new slot without rejecting or relocating an existing occupant; the mode-1 path has no existing-occupant zero check before its occupancy store",
    },
    testVectors: {
      canonicalRequestedCoordinates: canonicalReplay.records.map(({ x, y }) => ({ x, y })),
      canonicalSlots: canonicalReplay.records.map(({ slot }) => slot),
      canonicalGenerations: canonicalReplay.records.map(({ generation }) => generation),
    },
    uncertainties: [
      "scope ends immediately after create-return; later movement and pathfinding are excluded",
      "a later helper may reserve a movement command, but that is outside this create-return scope",
      "raw owner WORD has no human-facing meaning in this evidence",
      "this does not claim a generic all-class rule or port the original 1,200-slot storage",
    ],
  };
}

function recoverK01TypeFootprints(seeds, catalog) {
  const initializer = requireSeedFunction(seeds, 0x0045bf50);
  const instructions = initializer.instructions;
  const esiWrite = instructions.find(({ address }) => address === "0x0045bfda");
  if (esiWrite?.text !== "MOV ESI,0x1") {
    throw new Error("type initializer does not establish ESI as 1");
  }
  const esiWrites = instructions.filter(({ text }) => /^(MOV|XOR|INC|DEC|LEA) ESI/.test(text));
  if (esiWrites.length !== 1 || esiWrites[0].address !== "0x0045bfda") {
    throw new Error("type initializer has an unexpected ESI write inventory");
  }

  return K01_TYPE_CALLS.map(([internalClass, callSite, footprintPushes, flags]) => {
    const call = instructions.find(
      ({ address, text }) =>
        Number.parseInt(address, 16) === callSite && text === "CALL 0x0045bd00",
    );
    if (
      !call ||
      footprintPushes.some((pushSite) =>
        !instructions.some(
          ({ address, text }) =>
            Number.parseInt(address, 16) === pushSite && text === "PUSH ESI",
        ),
      )
    ) {
      throw new Error(`${toHex(callSite)} does not push 1x1 type footprint arguments`);
    }
    const type = catalog.types.find((candidate) => candidate.internalClass === internalClass);
    if (!type) throw new Error(`entity catalog is missing class ${internalClass}`);
    assertEqual(type.definition.flags, toHex(flags), `class ${internalClass} flags`);
    if ((flags & 0x08) !== 0) {
      throw new Error(`class ${internalClass} does not use mobile occupancy mode 1`);
    }
    return {
      internalClass,
      originalGameplayName: type.originalGameplayName,
      typeInitializerCall: toHex(callSite),
      footprintPushes: footprintPushes.map(toHex),
      flags: type.definition.flags,
      flagBit08: "clear",
      width: 1,
      height: 1,
      mobileOccupancyMode: 1,
    };
  });
}

function recoverImmediatePositionReadInventory(seeds) {
  const initializer = requireSeedFunction(seeds, 0x0043c300);
  const directAccesses = initializer.instructions.filter(({ text }) =>
    /\+ 0x1bc|\+ 0x1be/.test(text),
  );
  if (directAccesses.length === 0) {
    throw new Error("immediate create helper has no position access inventory");
  }
  if (
    directAccesses.some(
      ({ text }) =>
        !/^(MOV|MOVSX) [A-Z]+,word ptr \[EBX \+ 0x1b[ce]\]$/.test(text),
    )
  ) {
    throw new Error("immediate create helper rewrites a creation position field");
  }
  return directAccesses.map(({ address, text }) => ({
    va: address,
    instruction: text,
    access: "read",
  }));
}

function validateFunction(functions, [entry, range, instructionCount, instructionSha256]) {
  const record = functions.find((candidate) => candidate.entry === toHex(entry));
  if (!record) throw new Error(`functions artifact is missing ${toHex(entry)}`);
  assertDeepEqual(record.bodyRanges, [range], `${toHex(entry)} body range`);
  assertEqual(record.instructionCount, instructionCount, `${toHex(entry)} instruction count`);
  assertEqual(record.instructionSha256, instructionSha256, `${toHex(entry)} instruction SHA-256`);
  return {
    entry: record.entry,
    bodyRanges: record.bodyRanges,
    instructionCount: record.instructionCount,
    instructionSha256: record.instructionSha256,
  };
}

function requireCall(seeds, functionEntry, callSite, callee) {
  const instruction = requireSeedFunction(seeds, functionEntry).instructions.find(
    ({ address, text }) => Number.parseInt(address, 16) === callSite && text === `CALL ${toHex(callee)}`,
  );
  if (!instruction) {
    throw new Error(`missing call ${toHex(callSite)} -> ${toHex(callee)}`);
  }
  return { caller: toHex(functionEntry), callSite: toHex(callSite), callee: toHex(callee) };
}

function requireSeedFunction(seeds, entry) {
  const value = seeds.functions?.find((candidate) => candidate.entry === toHex(entry));
  if (!value?.instructions) throw new Error(`seeds artifact is missing ${toHex(entry)}`);
  return value;
}

function readAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) throw new Error(`${toHex(anchor.va)} is not file-backed`);
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (!actual.equals(expected)) {
    throw new Error(`byte anchor ${anchor.id} mismatch at ${toHex(anchor.va)}`);
  }
  return {
    id: anchor.id,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    bytes: anchor.bytes,
    meaning: anchor.meaning,
  };
}

function readArtifact(path, executableSha256, label) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  assertEqual(value.sourceSha256, executableSha256, `${label} source SHA-256`);
  return value;
}

function validateSlotArrays(active, reuseAges) {
  if (!Array.isArray(active) || active.length !== SLOT_COUNT) {
    throw new RangeError(`active must contain exactly ${SLOT_COUNT} slots`);
  }
  if (!Array.isArray(reuseAges) || reuseAges.length !== SLOT_COUNT) {
    throw new RangeError(`reuseAges must contain exactly ${SLOT_COUNT} slots`);
  }
  active.forEach((value, slot) => {
    if (typeof value !== "boolean") throw new TypeError(`active[${slot}] must be boolean`);
  });
  reuseAges.forEach((value, slot) => validateSignedWord(value, `reuseAges[${slot}]`));
}

function validateOrigin(origin) {
  if (!origin || typeof origin !== "object") throw new TypeError("origin must be an object");
  validateSignedWord(origin.x, "origin.x");
  validateSignedWord(origin.y, "origin.y");
}

function validateMapDimensions(mapWidth, mapHeight) {
  for (const [value, name] of [[mapWidth, "mapWidth"], [mapHeight, "mapHeight"]]) {
    if (!Number.isInteger(value) || value < 1 || value > 0x7fff) {
      throw new RangeError(`${name} must be a positive signed WORD`);
    }
  }
}

function validateOccupancy(occupancy, mapWidth, mapHeight) {
  if (!Array.isArray(occupancy) || occupancy.length !== mapWidth * mapHeight) {
    throw new RangeError("occupancy length must exactly match map dimensions");
  }
  occupancy.forEach((slot, index) => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) {
      throw new RangeError(`occupancy[${index}] must be a slot index`);
    }
  });
}

function validateDescriptors(descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    throw new TypeError("descriptors must be a non-empty array");
  }
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    if (!Array.isArray(descriptor)) throw new TypeError(`descriptor ${index} must be an array`);
    if (descriptor.length === 1 && descriptor[0] === 0) {
      return;
    }
    if (descriptor.length !== 4 || descriptor.some((value) => !isSignedWord(value))) {
      throw new TypeError(`descriptor ${index} must contain four signed WORDs`);
    }
    if (descriptor[0] === 0) throw new Error(`descriptor ${index} has malformed terminator`);
  }
  throw new Error("descriptors must end with a class-zero terminator");
}

function signedWord(value) {
  return (value << 16) >> 16;
}

function unsignedWord(value) {
  return value & 0xffff;
}

function isSignedWord(value) {
  return Number.isInteger(value) && value >= -0x8000 && value <= 0x7fff;
}

function validateSignedWord(value, label) {
  if (!isSignedWord(value)) throw new RangeError(`${label} must be a signed WORD`);
}

function validateUnsignedWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${label} must be an unsigned WORD`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function parseArgs(argv) {
  const options = {};
  const names = new Map([
    ["--input", "executablePath"],
    ["--functions", "functionsPath"],
    ["--seeds", "seedsPath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--json") continue;
    const key = names.get(argv[index]);
    if (!key || argv[index + 1] === undefined) {
      throw new Error(`Unknown or incomplete option ${argv[index]}`);
    }
    options[key] = argv[++index];
  }
  return options;
}
