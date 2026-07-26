#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

export const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_K0120_SHA256 =
  "6d9b8043f4634c8b8f1696e6d9b49b17dff99b53280b9934c1dfbd998be6054d";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const DEFAULT_PATHS = {
  input: resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
  script: resolve(repositoryRoot, "original/imjinrok2/script/K0120"),
  seeds: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/seeds.json",
  ),
  functions: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/functions.json",
  ),
  references: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/references.json",
  ),
  jumpTables: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/jump-tables.json",
  ),
};

const FUNCTION_ENTRIES = {
  missionUpdate: 0x0048a5c0,
  rawRelationBlocker: 0x00487fa0,
  descriptorCreator: 0x00488420,
  selectorOperation: 0x00442ca0,
  rawByteWriter: 0x004648d0,
  rawCoordinateWriter: 0x00461570,
  scriptPostState: 0x00482390,
  scriptBusy: 0x004823a0,
  scriptLoad: 0x00482180,
  scriptStart: 0x00482340,
  slotLookup: 0x00441db0,
  activeLookup: 0x00441e40,
  rawRelationCompare: 0x004426a0,
  slotAllocate: 0x00483a60,
  recordCreate: 0x00483c50,
};

const EXPECTED_FUNCTIONS = new Map([
  [
    0x0048ddb0,
    {
      range: "0x0048ddb0-0x0048deca",
      instructions: 105,
      blocks: 36,
      sha256:
        "276da99513996baa45d73bd4c09da0fe231fb10e65b762b4bbf3bfb144908981",
    },
  ],
  [
    0x0048a5c0,
    {
      range: "0x0048a5c0-0x0048a878",
      instructions: 181,
      blocks: 32,
      sha256:
        "c2a0e73fb0e208846f77187fa11310cdd4177f62c6fbd61732d822f513115791",
    },
  ],
  [
    0x00487fa0,
    {
      range: "0x00487fa0-0x0048800f",
      instructions: 37,
      blocks: 7,
      sha256:
        "319555c1ab68da1f8fd1474869386b56cc58318d61e1a55908f18d143c526094",
    },
  ],
  [
    0x00488420,
    {
      range: "0x00488420-0x004884b5",
      instructions: 59,
      blocks: 11,
      sha256:
        "4b4841d6b3756b3d2dd3f3c6621ab98a413ce4608ea3d5c9c737ee1618c3ee8b",
    },
  ],
  [
    0x00442ca0,
    {
      range: "0x00442ca0-0x00442d95",
      instructions: 82,
      blocks: 25,
      sha256:
        "e3edb412a4a3ab9bb72fb4285c9e07ab0417de52bb692e047548457b02fa1f67",
    },
  ],
  [
    0x004648d0,
    {
      range: "0x004648d0-0x004648d9",
      instructions: 3,
      blocks: 1,
      sha256:
        "b0efc5dec9ace61129d9d0aa242cac65ece9db87c517be3c8e6e04b9df9adfba",
    },
  ],
  [
    0x00461570,
    {
      range: "0x00461570-0x00461590",
      instructions: 6,
      blocks: 1,
      sha256:
        "09b777daad87f401fcf60713c43b1ac9664759682315407c27a84211e3cef3b9",
    },
  ],
  [
    0x00482390,
    {
      range: "0x00482390-0x00482393",
      instructions: 2,
      blocks: 1,
      sha256:
        "0f019498e796041d4448ab24729aef7f664c3ce9d648fa54ddbe4eefc6a502ab",
    },
  ],
  [
    0x004823a0,
    {
      range: "0x004823a0-0x004823a3",
      instructions: 2,
      blocks: 1,
      sha256:
        "89917ca0f56c10aa67814cd5318e7dc1c9f1dd3e7b94e915eda062024850563e",
    },
  ],
  [
    0x00482180,
    {
      range: "0x00482180-0x004822f4",
      instructions: 114,
      blocks: 16,
      sha256:
        "acf831ee8a608862cb7c64595f3a90b7799a967b1c9b7b38b0da9fe6e1b20f8c",
    },
  ],
  [
    0x00482340,
    {
      range: "0x00482340-0x0048238c",
      instructions: 22,
      blocks: 4,
      sha256:
        "0f33a0727962c95b37e0fc232b1b921a85fe450b61dc295f73e316bc9cbdc35d",
    },
  ],
  [
    0x00441db0,
    {
      range: "0x00441db0-0x00441dd8",
      instructions: 12,
      blocks: 3,
      sha256:
        "12984df20c7bb82eb364b29180f75185fe17ac268bffb3d3c782a7fa6c5adf8e",
    },
  ],
  [
    0x00441e40,
    {
      range: "0x00441e40-0x00441e7a",
      instructions: 19,
      blocks: 5,
      sha256:
        "01b3c1652d8edf30a6c0dc948215f734475111fc734338603d847545c43e7cda",
    },
  ],
  [
    0x004426a0,
    {
      range: "0x004426a0-0x004426e1",
      instructions: 23,
      blocks: 1,
      sha256:
        "992c88ef4558ec0ce71340db71f7aa5dea19be134eeae9d64c62cd40e16e1ac1",
    },
  ],
  [
    0x00483a60,
    {
      range: "0x00483a60-0x00483a9c",
      instructions: 25,
      blocks: 7,
      sha256:
        "887217ddc12a9bc4dd90c38b9365be9bcaf65f14e1d0c709de86c62479cbd917",
    },
  ],
  [
    0x00483c50,
    {
      range: "0x00483c50-0x00483c9f",
      instructions: 26,
      blocks: 1,
      sha256:
        "d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e",
    },
  ],
]);

const REQUIRED_CALL_EDGES = [
  [0x0048de12, 0x0048ddb0, 0x0048a5c0],
  [0x0048a724, 0x0048a5c0, 0x00487fa0],
  [0x0048a750, 0x0048a5c0, 0x00441e40],
  [0x0048a781, 0x0048a5c0, 0x004823a0],
  [0x0048a794, 0x0048a5c0, 0x00482180],
  [0x0048a79e, 0x0048a5c0, 0x00482340],
  [0x0048a7ae, 0x0048a5c0, 0x00488420],
  [0x0048a7b9, 0x0048a5c0, 0x00442ca0],
  [0x0048a7c7, 0x0048a5c0, 0x004648d0],
  [0x0048a7d5, 0x0048a5c0, 0x00461570],
  [0x0048a800, 0x0048a5c0, 0x00482390],
  [0x00487fb9, 0x00487fa0, 0x00441db0],
  [0x00487fed, 0x00487fa0, 0x004426a0],
  [0x00488440, 0x00488420, 0x00483a60],
  [0x00488494, 0x00488420, 0x00483c50],
];

const CODE_ANCHORS = [
  {
    id: "mission-dispatcher-returns-update-result",
    va: 0x0048de12,
    bytes: "e8 a9 c7 ff ff 5e c3",
    meaning:
      "the mission dispatcher calls 0x0048a5c0 and returns without replacing AX",
  },
  {
    id: "blocker-and-initial-flag-gates",
    va: 0x0048a724,
    bytes:
      "e8 77 d8 ff ff 85 c0 0f 85 c1 00 00 00 66 39 2d dc 38 84 00 0f 85 b4 00 00 00",
    meaning:
      "the raw-relation blocker and nonzero WORD flag each bypass the slot scan",
  },
  {
    id: "entity-slot-scan-and-match-fields",
    va: 0x0048a73e,
    bytes:
      "53 57 33 db bf 8f 52 63 00 c7 44 24 10 b0 04 00 00 53 e8 eb 76 fb ff 83 c4 04 85 c0 74 7e 66 0f be 47 01 66 3b 05 44 cc bc 00 75 70 80 3f 34 75 6b 80 7f 55 64 75 65",
    meaning:
      "the 1200-slot scan calls the active lookup and checks signed +0x38, class +0x37, and progress +0x8c",
  },
  {
    id: "flag-before-script-and-native-effects",
    va: 0x0048a775,
    bytes:
      "b9 08 be bc 00 66 89 35 dc 38 84 00 e8 1a 7c ff ff 85 c0 75 19 68 38 2f 4c 00 b9 08 be bc 00 e8 e7 79 ff ff b9 08 be bc 00 e8 9d 7b ff ff 8d 4c 24 14 51 6a 10 6a 35 6a 37 e8 6d dc ff ff 6a 05 6a 35 6a 37 e8 e2 84 fb ff 83 c4 1c b9 f0 ff ab 00 56 e8 04 a1 fd ff 6a 35 6a 37 b9 d8 5e 7c 00 e8 96 6d fd ff",
    meaning:
      "the match writes one before checking busy; load/start are conditional and the four native calls are ordered and unconditional within the match block",
  },
  {
    id: "no-break-loop-and-exact-post-state-return",
    va: 0x0048a7da,
    bytes:
      "8b 44 24 10 43 81 c7 58 05 00 00 48 89 44 24 10 0f 85 5f ff ff ff 5f 5b 66 39 35 dc 38 84 00 75 17 b9 08 be bc 00 e8 8b 7b ff ff 85 c0 75 09 66 8b c6 5e 5d 83 c4 50 c3",
    meaning:
      "every scan iteration advances by 0x558; after the loop only flag exactly one and script context +8 equal zero return AX one",
  },
  {
    id: "raw-relation-blocker-loop",
    va: 0x00487fa0,
    bytes:
      "56 57 33 ff 66 39 3d 38 37 84 00 7e 56 0f bf c7 0f bf 34 45 d8 2d 84 00 56 e8 f2 9d fb ff 83 c4 04 85 c0 74 34",
    meaning:
      "the blocker uses signed active count/list entries and the low-word slot/record-positive check",
  },
  {
    id: "raw-relation-blocker-flags-and-table-values",
    va: 0x00487fc5,
    bytes:
      "8d 0c f6 8d 04 4e 8d 04 c0 c1 e0 03 f7 80 cc 52 63 00 02 00 02 00 74 1c 0f bf 15 44 cc bc 00 0f be 80 90 52 63 00 52 50 e8 ae a6 fb ff 83 c4 08 85 c0 74 0f",
    meaning:
      "records with +0x74 mask 0x00020002 compare raw relation-table bytes and the first difference returns blocker one",
  },
  {
    id: "descriptor-allocation-and-boundary-flow",
    va: 0x00488431,
    bytes:
      "0f bf 74 24 10 66 8b 2c 77 66 85 ed 74 6c 55 e8 1b b6 ff ff 83 c4 04 66 85 c0 74 56 66 8b 5c 77 02 66 8b 4c 77 04 66 8b 74 77 06",
    meaning:
      "signed-word descriptors terminate at class zero; slot zero returns failure before later descriptors",
  },
  {
    id: "descriptor-coordinate-bounds-and-create-call",
    va: 0x0048845c,
    bytes:
      "8b 54 24 1c 03 d6 8b 74 24 18 03 ce 66 85 c9 7c 2f 0f bf f1 3b 35 90 2d ac 00 7d 24 66 85 d2 7c 1f 0f bf f2 3b 35 94 2d ac 00 7d 14 8b 74 24 20 53 6a 64 56 52 51 50 55 e8 b7 b7 ff ff",
    meaning:
      "signed low-word coordinates outside either map bound skip creation; accepted entries call the record creator",
  },
  {
    id: "selector-five-table-and-byte-grid-mutations",
    va: 0x00442cc7,
    bytes:
      "b8 54 be 4b 00 eb 28",
    meaning:
      "selector five chooses the DWORD pattern table at 0x004bbe54",
  },
  {
    id: "selector-byte-grid-writes",
    va: 0x00442d61,
    bytes:
      "8a 9c 39 5e 4d 7d 00 84 db 74 10 c6 84 39 5e 4d 7d 00 00 c6 84 39 ee cb 7d 00 01",
    meaning:
      "a nonzero first raw byte grid cell is set to zero and the corresponding second grid cell to one",
  },
  {
    id: "raw-byte-post-effect-write",
    va: 0x004648d0,
    bytes: "8a 44 24 04 88 41 02 c2 04 00",
    meaning:
      "the pushed byte is stored at ECX+2, yielding BYTE 0x00abfff2=1 for the K01 call",
  },
  {
    id: "raw-coordinate-post-effect-writes",
    va: 0x00461570,
    bytes:
      "8b 44 24 04 8b 54 24 08 c7 81 9c c7 07 00 01 00 00 00 89 81 a0 c7 07 00 89 91 a4 c7 07 00 c2 08 00",
    meaning:
      "the K01 ECX base produces DWORD 0x00843674=1, 0x00843678=55, and 0x0084367c=53",
  },
  {
    id: "script-state-raw-accessors",
    va: 0x00482390,
    bytes: "8b 41 08 c3 90 90 90 90 90 90 90 90 90 90 90 90 8b 41 04 c3",
    meaning:
      "the post-state accessor returns context+8 and the busy accessor at 0x004823a0 returns context+4",
  },
];

export const K01_REINFORCEMENT_DESCRIPTORS = [
  [13, 1, -2, -2],
  [82, 1, 0, -2],
  [13, 1, 2, -2],
  [14, 1, -2, 0],
  [14, 1, 0, 0],
  [14, 1, 2, 0],
  [12, 1, -2, 2],
  [12, 1, 0, 2],
  [12, 1, 2, 2],
  [0],
];

export const SELECTOR_FIVE_HALF_WIDTHS = [
  1, 2, 3, 4, 4, 4, 4, 4, 3, 2, 1,
];

export function evaluateRawRelationBlocker({
  activeCount,
  activeEntries,
  currentPlayer,
  relationValue,
}) {
  validateSigned16(activeCount, "activeCount");
  validateSigned16(currentPlayer, "currentPlayer");
  if (!Array.isArray(activeEntries)) {
    throw new TypeError("activeEntries must be an array");
  }
  if (typeof relationValue !== "function") {
    throw new TypeError("relationValue must be a function");
  }
  if (activeCount <= 0) return 0;
  if (activeEntries.length < activeCount) {
    throw new RangeError(
      `activeEntries must contain at least activeCount (${activeCount}) records`,
    );
  }

  for (let index = 0; index < activeCount; index += 1) {
    const entry = activeEntries[index];
    validateBlockerEntry(entry, index);
    if (entry.slotTableWord === 0 || entry.recordPositiveWord <= 0) {
      continue;
    }
    if (((entry.flags74 >>> 0) & 0x00020002) === 0) continue;
    const ownerRelation = relationValue(entry.ownerSignedByte);
    const playerRelation = relationValue(currentPlayer);
    validateByte(ownerRelation, `relationValue(owner at ${index})`);
    validateByte(playerRelation, `relationValue(player at ${index})`);
    if (ownerRelation !== playerRelation) return 1;
  }
  return 0;
}

export function runK01BeaconTrigger({
  blockerPresent,
  initialFlagWord,
  currentPlayer,
  records,
  scriptBusyResults,
  loadResults,
  descriptorAllocationResults,
  mapWidth = 180,
  mapHeight = 180,
  scriptPostState,
}) {
  validateBoolean(blockerPresent, "blockerPresent");
  validateUnsigned16(initialFlagWord, "initialFlagWord");
  validateSigned16(currentPlayer, "currentPlayer");
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  for (const [value, label] of [
    [scriptBusyResults, "scriptBusyResults"],
    [loadResults, "loadResults"],
    [descriptorAllocationResults, "descriptorAllocationResults"],
  ]) {
    if (!Array.isArray(value)) {
      throw new TypeError(`${label} must be an explicit result array`);
    }
  }
  const recordsByIndex = new Map();
  for (const record of records) {
    validateScanRecord(record);
    if (recordsByIndex.has(record.index)) {
      throw new Error(`duplicate entity scan index ${record.index}`);
    }
    recordsByIndex.set(record.index, record);
  }

  let flagWord = initialFlagWord;
  let busyIndex = 0;
  let loadIndex = 0;
  let allocationIndex = 0;
  const events = [];
  const matches = [];

  if (!blockerPresent && flagWord === 0) {
    for (let index = 0; index < 0x4b0; index += 1) {
      const record = recordsByIndex.get(index);
      if (
        !record ||
        record.slotTableWord === 0 ||
        record.healthSignedWord <= 0 ||
        record.activeByte === 0 ||
        record.ownerSignedByte !== currentPlayer ||
        record.classByte !== 0x34 ||
        record.progressByte !== 0x64
      ) {
        continue;
      }

      matches.push(index);
      flagWord = 1;
      events.push({ kind: "flag-write", index, value: 1 });
      const busy = requireResult(
        scriptBusyResults,
        busyIndex++,
        "scriptBusyResults",
      );
      validateUnsigned32(busy, `scriptBusyResults[${busyIndex - 1}]`);
      events.push({ kind: "script-busy-read", index, value: busy });
      if (busy === 0) {
        const loadResult = requireResult(
          loadResults,
          loadIndex++,
          "loadResults",
        );
        validateIntegerRange(
          loadResult,
          0,
          1,
          `loadResults[${loadIndex - 1}]`,
        );
        events.push({
          kind: "script-load",
          index,
          path: "script\\k0120",
          returnValue: loadResult,
          callerChecked: false,
        });
        events.push({ kind: "script-start", index });
      }

      const creation = createDescriptorEntities({
        originX: 55,
        originY: 53,
        rawArgument: 0x10,
        mapWidth,
        mapHeight,
        allocateSlot() {
          const value = requireResult(
            descriptorAllocationResults,
            allocationIndex++,
            "descriptorAllocationResults",
          );
          validateIntegerRange(
            value,
            0,
            1199,
            `descriptorAllocationResults[${allocationIndex - 1}]`,
          );
          return value;
        },
      });
      events.push({
        kind: "descriptor-create-helper",
        index,
        ignoredResult: creation.returnValue,
        creations: creation.creations,
        skippedOutOfBounds: creation.skippedOutOfBounds,
      });
      events.push({
        kind: "selector-five",
        index,
        x: 55,
        y: 53,
        selector: 5,
      });
      events.push({
        kind: "raw-byte-write",
        index,
        address: "0x00abfff2",
        value: 1,
      });
      events.push({
        kind: "raw-coordinate-write",
        index,
        values: {
          "0x00843674": 1,
          "0x00843678": 55,
          "0x0084367c": 53,
        },
      });
    }
  }

  let returnValue = 0;
  if (flagWord === 1) {
    if (scriptPostState === undefined) {
      throw new RangeError(
        "scriptPostState is required when the final flag word is exactly 1",
      );
    }
    validateUnsigned32(scriptPostState, "scriptPostState");
    events.push({
      kind: "script-post-state-read",
      value: scriptPostState,
    });
    if (scriptPostState === 0) returnValue = 1;
  }

  return {
    blockerPresent,
    scanRan: !blockerPresent && initialFlagWord === 0,
    matches,
    flagWord,
    events,
    returnValue,
  };
}

export function createDescriptorEntities({
  originX,
  originY,
  rawArgument,
  mapWidth,
  mapHeight,
  descriptors = K01_REINFORCEMENT_DESCRIPTORS,
  allocateSlot,
}) {
  validateSigned16(originX, "originX");
  validateSigned16(originY, "originY");
  validateSigned16(rawArgument, "rawArgument");
  validatePositiveSigned32(mapWidth, "mapWidth");
  validatePositiveSigned32(mapHeight, "mapHeight");
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    throw new TypeError("descriptors must be a non-empty array");
  }
  if (typeof allocateSlot !== "function") {
    throw new TypeError("allocateSlot must be a function");
  }

  const creations = [];
  const skippedOutOfBounds = [];
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    if (
      !Array.isArray(descriptor) ||
      (descriptor.length !== 4 &&
        !(descriptor.length === 1 && descriptor[0] === 0))
    ) {
      throw new TypeError(
        `descriptor ${index} must contain four signed words or a class-zero terminator`,
      );
    }
    descriptor.forEach((value, field) =>
      validateSigned16(value, `descriptor ${index} field ${field}`),
    );
    const [entityClass, owner, dx, dy] = descriptor;
    if (entityClass === 0) {
      return {
        returnValue: 1,
        creations,
        skippedOutOfBounds,
      };
    }

    const slot = allocateSlot(entityClass, index);
    validateIntegerRange(
      slot,
      0,
      1199,
      `allocated slot for descriptor ${index}`,
    );
    if (slot === 0) {
      return {
        returnValue: 0,
        creations,
        skippedOutOfBounds,
      };
    }

    const x = signed16(originX + dx);
    const y = signed16(originY + dy);
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) {
      skippedOutOfBounds.push({ index, entityClass, slot, x, y });
      continue;
    }
    creations.push({
      index,
      entityClass,
      slot,
      x,
      y,
      rawArgument,
      constant100: 100,
      owner,
    });
  }
  throw new Error("descriptor list is missing its class-zero terminator");
}

export function applySelectorFivePattern({
  centerX,
  centerY,
  mapWidth,
  mapHeight,
  sourceValue,
}) {
  validateSigned16(centerX, "centerX");
  validateSigned16(centerY, "centerY");
  validatePositiveSigned32(mapWidth, "mapWidth");
  validatePositiveSigned32(mapHeight, "mapHeight");
  if (typeof sourceValue !== "function") {
    throw new TypeError("sourceValue must be a function");
  }
  const mutations = [];
  for (let row = 0; row < SELECTOR_FIVE_HALF_WIDTHS.length; row += 1) {
    const y = signed16(centerY + row - 5);
    const halfWidth = SELECTOR_FIVE_HALF_WIDTHS[row];
    for (let dx = -halfWidth; dx <= halfWidth; dx += 1) {
      const x = signed16(centerX + dx);
      if (y < 0 || y >= mapHeight || x < 0 || x >= mapWidth) {
        continue;
      }
      const source = sourceValue(x, y);
      validateByte(source, `sourceValue(${x}, ${y})`);
      if (source !== 0) {
        mutations.push({ x, y, firstGridAfter: 0, secondGridAfter: 1 });
      }
    }
  }
  return mutations;
}

export function extractK01BeaconK0120Trigger(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const { buffer: executableBuffer, image } = readPeImage(paths.input);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(
    executableSha256,
    EXPECTED_EXE_SHA256,
    "original executable SHA-256",
  );
  const seeds = readAnalysisJson(paths.seeds, "seeds");
  const functions = readAnalysisJson(paths.functions, "functions");
  const references = readAnalysisJson(paths.references, "references");
  const jumpTables = readAnalysisJson(paths.jumpTables, "jump tables");
  for (const document of [seeds, functions, references, jumpTables]) {
    assertEqual(
      document.sourceSha256,
      executableSha256,
      "canonical analysis source SHA-256",
    );
  }

  const analyzedFunctions = [...EXPECTED_FUNCTIONS].map(
    ([entry, expected]) =>
      validateFunction(seeds, functions, entry, expected),
  );
  const callEdges = REQUIRED_CALL_EDGES.map(([site, caller, callee]) =>
    requireCallEdge(seeds, functions, site, caller, callee),
  );
  const codeAnchors = CODE_ANCHORS.map((anchor) =>
    validateCodeAnchor(executableBuffer, image, anchor),
  );
  const descriptorData = recoverDescriptorsFromMissionFunction(
    requireFunction(seeds, FUNCTION_ENTRIES.missionUpdate),
  );
  assertDeepEqual(
    descriptorData,
    K01_REINFORCEMENT_DESCRIPTORS,
    "K01 descriptor array",
  );
  const selectorPattern = recoverSelectorFivePattern(
    executableBuffer,
    image,
    jumpTables,
  );
  assertDeepEqual(
    selectorPattern.halfWidths,
    SELECTOR_FIVE_HALF_WIDTHS,
    "selector-five half widths",
  );
  const flagReferences = validateFlagReferences(references);
  const script = inspectK0120(paths.script);

  return {
    question:
      "For K01, what exact gates cause FUN_0048a5c0 to scan entity slots for a completed beacon, when is WORD 0x008438dc written, how do script busy/load/start and same-scan multiple matches behave, what direct native post-trigger effects run and in what order, and when does the post-trigger script-state gate return 1?",
    evidenceStatus: "static-proven-k01-beacon-k0120-trigger",
    reproductionStatus: "reproduction-complete",
    integrationStatus: "gated-no-exact-original-project-type-mapping",
    sources: {
      executable: {
        path: paths.input,
        sha256: executableSha256,
      },
      script: {
        path: paths.script,
        sha256: script.sha256,
        size: script.size,
        encoding: script.encoding,
      },
    },
    analyzedFunctions,
    callEdges,
    codeAnchors,
    entityScan: {
      recordBase: "0x00635258",
      runtimePointerStart: "0x0063528f",
      count: 0x4b0,
      stride: 0x558,
      activeLookupEntry: "0x00441e40",
      activeLookupConditions: [
        "WORD slot table entry != 0",
        "signed WORD record+0x3e > 0",
        "BYTE record+0x1f0 != 0",
      ],
      reproductionRecordInputs: {
        slotTableWord: "unsigned WORD raw bits",
        healthSignedWord: "signed WORD record+0x3e",
        activeByte: "BYTE record+0x1f0",
      },
      ownerRelationOffset: "0x38",
      classOffset: "0x37",
      progressOffset: "0x8c",
      requiredClass: 52,
      requiredProgress: 100,
    },
    rawRelationBlocker: {
      entry: "0x00487fa0",
      activeCountAddress: "0x00843738",
      activeListAddress: "0x00842dd8",
      acceptedRecordConditions: [
        "WORD slot table entry != 0",
        "signed WORD record+0x3e > 0",
      ],
      flags74Mask: "0x00020002",
      relationCompareEntry: "0x004426a0",
      meaningStatus: "raw-relation-blocker-only",
    },
    triggerFlag: {
      address: "0x008438dc",
      scanGate: "WORD != 0 skips scan",
      matchWrite: "WORD = 1 before script state checks",
      postGate: "WORD == 1 exactly",
      references: flagReferences,
      resetLifecycle: "unresolved-no-other-direct-reference",
    },
    scriptBehavior: {
      context: "0x00bcbe08",
      busyField: "+0x04",
      postStateField: "+0x08",
      loadPath: "script\\k0120",
      busyNonzero: "skip load/start only",
      loaderReturnValues: [0, 1],
      loaderResultObservedByCaller: false,
      startReturnContract: "void",
      postStateReadGate: "final flag WORD == 1 exactly",
      commands: script.commands,
      noSpawnCommand: true,
    },
    descriptorCreation: {
      helper: "0x00488420",
      origin: { x: 55, y: 53 },
      rawArgument: 0x10,
      constant100: 100,
      descriptors: descriptorData,
      typeIdentities: {
        12: "일본 조총병",
        13: "일본 사무라이",
        14: "일본 귀갑차",
        52: "조선 봉화대",
        82: "일본 고니시",
      },
    },
    selectorFive: selectorPattern,
    nativePostEffects: [
      "0x00488420(55,53,0x10,descriptor-array)",
      "0x00442ca0(55,53,5)",
      "ECX=0x00abfff0; 0x004648d0(1)",
      "ECX=0x007c5ed8; 0x00461570(55,53)",
    ],
    sameScanBehavior:
      "no break: every matching record in the initial 1200-slot scan repeats the match block",
    earlyReturn:
      "after scan/skip, flag WORD exactly one and script context +8 exactly zero return AX one to the caller",
    testVectors: buildReferenceVectors(),
    uncertainties: [
      "WORD 0x008438dc reset lifecycle is not proven",
      "the human semantics of raw relation-table values and the native raw grid/global states are unresolved",
      "full victory timer/result and hero-loss interpretation are outside this unit",
      "current scenario identities for classes 12, 13, 14, and 82 are not exact original mappings",
    ],
  };
}

function recoverDescriptorsFromMissionFunction(functionReport) {
  const writes = new Map();
  const registers = new Map();
  let stackDelta = 0;
  for (const instruction of functionReport.instructions) {
    const address = Number(instruction.address);
    if (address > 0x0048a6a2) break;
    const fullMove = /^MOV (EAX|ECX|EDX|ESI|EBP),(-?0x[0-9a-f]+)$/.exec(
      instruction.text,
    );
    if (fullMove) registers.set(fullMove[1].slice(1), signed16(parseImmediate(fullMove[2])));
    const xor = /^XOR (EBP|ESI),\1$/.exec(instruction.text);
    if (xor) registers.set(xor[1].slice(1), 0);
    if (/^PUSH /.test(instruction.text)) stackDelta -= 4;
    const write =
      /^MOV word ptr \[ESP \+ (0x[0-9a-f]+)\],(AX|CX|DX|SI|BP|0x[0-9a-f]+)$/.exec(
        instruction.text,
      );
    if (!write) continue;
    const offset = stackDelta + parseImmediate(write[1]);
    const value = write[2].startsWith("0x")
      ? signed16(parseImmediate(write[2]))
      : registers.get(write[2]);
    if (value === undefined) {
      throw new Error(
        `Unresolved descriptor word ${write[2]} at ${instruction.address}`,
      );
    }
    writes.set(offset, value);
  }
  const result = [];
  for (let offset = 4; offset < 76; offset += 8) {
    const descriptor = [0, 2, 4, 6].map((delta) =>
      writes.get(offset + delta),
    );
    if (descriptor.some((value) => value === undefined)) {
      throw new Error(
        `Missing descriptor word at stack offset ${toHex(offset)}`,
      );
    }
    result.push(descriptor);
  }
  const terminator = writes.get(76);
  if (terminator !== 0) {
    throw new Error(
      `Descriptor terminator mismatch at stack offset 0x0000004c: expected 0, got ${terminator}`,
    );
  }
  result.push([terminator]);
  return result;
}

function recoverSelectorFivePattern(buffer, image, jumpTables) {
  const table = jumpTables.tables.find(
    (candidate) =>
      candidate.functionEntry === toHex(FUNCTION_ENTRIES.selectorOperation) &&
      candidate.switchAddress === "0x00442cab",
  );
  const selectorFive = table?.cases?.find((candidate) => candidate.label === 5);
  if (selectorFive?.destination !== "0x00442cc7") {
    throw new Error(
      "Canonical jump table does not map selector 5 to 0x00442cc7",
    );
  }
  const values = [];
  for (let va = 0x004bbe54; values.length < 64; va += 4) {
    const rawOffset = image.vaToRawOffset(va);
    if (rawOffset === undefined) {
      throw new Error(`Selector table VA ${toHex(va)} is not file-backed`);
    }
    const value = buffer.readInt32LE(rawOffset);
    values.push(value);
    if (value === 100) break;
  }
  if (values.at(-1) !== 100) {
    throw new Error("Selector-five table is missing its DWORD 100 terminator");
  }
  const centerRow = values[0];
  const halfWidths = values.slice(1, -1);
  assertEqual(centerRow, 5, "selector-five center row");
  return {
    selector: 5,
    tableAddress: "0x004bbe54",
    centerRow,
    rowOffsets: halfWidths.map((_, index) => index - centerRow),
    halfWidths,
    terminator: 100,
    mutation:
      "for each in-bounds cell in the row spans, if first raw grid byte is nonzero, write it to zero then write second raw grid byte to one",
  };
}

function inspectK0120(path) {
  const buffer = readFileSync(path);
  const digest = sha256(buffer);
  assertEqual(digest, EXPECTED_K0120_SHA256, "K0120 SHA-256");
  assertEqual(buffer.length, 519, "K0120 size");
  let text;
  try {
    text = new TextDecoder("windows-949", { fatal: true }).decode(buffer);
  } catch (error) {
    throw new Error(`Cannot decode K0120 as CP949/EUC-KR: ${error.message}`, {
      cause: error,
    });
  }
  const commands = [];
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    const tokens = [...line.matchAll(/\[([^\]]*)\]/g)].map(
      (match) => match[1],
    );
    if (tokens.length === 0) continue;
    commands.push({
      line: lineIndex + 1,
      command: tokens[0],
      args: tokens.slice(1),
    });
  }
  const expected = [
    { command: "SPEECH", args: ["K1", "0", "K01120"] },
    { command: "SPEECH", args: ["K3", "1", "K01130"] },
    { command: "SPEECH", args: ["K1", "0", "K01140"] },
  ];
  const normalized = commands.map(({ command, args }) => ({
    command,
    args: args.slice(0, 3),
  }));
  assertDeepEqual(normalized, expected, "K0120 command order");
  if (commands.some(({ command }) => /spawn|create|unit/i.test(command))) {
    throw new Error("K0120 unexpectedly contains a spawn-like command");
  }
  return {
    sha256: digest,
    size: buffer.length,
    encoding: "CP949/EUC-KR",
    commands,
  };
}

function validateFlagReferences(references) {
  const actual = references.references
    .filter((reference) => reference.to === "0x008438dc")
    .map(({ from, type, fromFunctionEntry }) => ({
      from,
      type,
      fromFunctionEntry,
    }));
  const expected = [
    {
      from: "0x0048a731",
      type: "READ",
      fromFunctionEntry: "0x0048a5c0",
    },
    {
      from: "0x0048a77a",
      type: "WRITE",
      fromFunctionEntry: "0x0048a5c0",
    },
    {
      from: "0x0048a7f2",
      type: "READ",
      fromFunctionEntry: "0x0048a5c0",
    },
  ];
  assertDeepEqual(actual, expected, "WORD 0x008438dc direct references");
  return actual;
}

function validateFunction(seeds, functions, entry, expected) {
  const seed = requireFunction(seeds, entry);
  const summary = functions.functions.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!summary) throw new Error(`Missing function summary ${toHex(entry)}`);
  assertDeepEqual(seed.bodyRanges, [expected.range], `${toHex(entry)} range`);
  assertEqual(
    seed.instructions.length,
    expected.instructions,
    `${toHex(entry)} instruction count`,
  );
  assertEqual(
    seed.basicBlocks.length,
    expected.blocks,
    `${toHex(entry)} basic-block count`,
  );
  assertEqual(
    summary.instructionSha256,
    expected.sha256,
    `${toHex(entry)} instruction SHA-256`,
  );
  return {
    entry: toHex(entry),
    name: summary.name,
    bodyRanges: summary.bodyRanges,
    basicBlockCount: seed.basicBlocks.length,
    instructionCount: summary.instructionCount,
    instructionSha256: summary.instructionSha256,
  };
}

function requireCallEdge(seeds, functions, site, caller, callee) {
  const callerSeed = requireFunction(seeds, caller);
  const instruction = callerSeed.instructions.find(
    (candidate) =>
      Number(candidate.address) === site &&
      candidate.text === `CALL ${toHex(callee)}`,
  );
  if (!instruction) {
    throw new Error(
      `Missing call edge ${toHex(site)}: ${toHex(caller)} -> ${toHex(callee)}`,
    );
  }
  const callerSummary = functions.functions.find(
    (candidate) => candidate.entry === toHex(caller),
  );
  if (!callerSummary?.callees?.includes(toHex(callee))) {
    throw new Error(
      `Function summary omits ${toHex(caller)} -> ${toHex(callee)}`,
    );
  }
  return {
    callSite: toHex(site),
    caller: toHex(caller),
    callee: toHex(callee),
    bytes: instruction.bytes,
  };
}

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) {
    throw new Error(`${toHex(anchor.va)} is not file-backed`);
  }
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (!actual.equals(expected)) {
    throw new Error(
      `Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}: expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    id: anchor.id,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    byteLength: expected.length,
    bytes: formatBytes(expected),
    meaning: anchor.meaning,
    matched: true,
  };
}

function buildReferenceVectors() {
  const record = {
    index: 5,
    slotTableWord: 1,
    healthSignedWord: 1,
    activeByte: 1,
    ownerSignedByte: 1,
    classByte: 52,
    progressByte: 100,
  };
  return [
    {
      id: "single-idle-match-loader-zero-still-starts",
      result: summarizeTrigger(
        runK01BeaconTrigger({
          blockerPresent: false,
          initialFlagWord: 0,
          currentPlayer: 1,
          records: [record],
          scriptBusyResults: [0],
          loadResults: [0],
          descriptorAllocationResults: Array(9).fill(1),
          scriptPostState: 0,
        }),
      ),
      expected: {
        scanRan: true,
        matches: [5],
        flagWord: 1,
        returnValue: 1,
        eventKinds: [
          "flag-write",
          "script-busy-read",
          "script-load",
          "script-start",
          "descriptor-create-helper",
          "selector-five",
          "raw-byte-write",
          "raw-coordinate-write",
          "script-post-state-read",
        ],
      },
    },
    {
      id: "single-idle-match-loader-one-still-starts",
      result: summarizeTrigger(
        runK01BeaconTrigger({
          blockerPresent: false,
          initialFlagWord: 0,
          currentPlayer: 1,
          records: [record],
          scriptBusyResults: [0],
          loadResults: [1],
          descriptorAllocationResults: Array(9).fill(1),
          scriptPostState: 1,
        }),
      ),
      expected: {
        scanRan: true,
        matches: [5],
        flagWord: 1,
        returnValue: 0,
        eventKinds: [
          "flag-write",
          "script-busy-read",
          "script-load",
          "script-start",
          "descriptor-create-helper",
          "selector-five",
          "raw-byte-write",
          "raw-coordinate-write",
          "script-post-state-read",
        ],
      },
    },
    {
      id: "busy-match-skips-loader-but-keeps-native-effects",
      result: summarizeTrigger(
        runK01BeaconTrigger({
          blockerPresent: false,
          initialFlagWord: 0,
          currentPlayer: 1,
          records: [record],
          scriptBusyResults: [1],
          loadResults: [],
          descriptorAllocationResults: Array(9).fill(1),
          scriptPostState: 1,
        }),
      ),
      expected: {
        scanRan: true,
        matches: [5],
        flagWord: 1,
        returnValue: 0,
        eventKinds: [
          "flag-write",
          "script-busy-read",
          "descriptor-create-helper",
          "selector-five",
          "raw-byte-write",
          "raw-coordinate-write",
          "script-post-state-read",
        ],
      },
    },
    {
      id: "other-nonzero-flag-skips-scan-and-exact-one-return",
      result: summarizeTrigger(
        runK01BeaconTrigger({
          blockerPresent: false,
          initialFlagWord: 2,
          currentPlayer: 1,
          records: [record],
          scriptBusyResults: [],
          loadResults: [],
          descriptorAllocationResults: [],
        }),
      ),
      expected: {
        scanRan: false,
        matches: [],
        flagWord: 2,
        returnValue: 0,
        eventKinds: [],
      },
    },
  ];
}

function summarizeTrigger(result) {
  return {
    scanRan: result.scanRan,
    matches: result.matches,
    flagWord: result.flagWord,
    returnValue: result.returnValue,
    eventKinds: result.events.map((event) => event.kind),
  };
}

function validateBlockerEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new TypeError(`activeEntries[${index}] must be an object`);
  }
  validateSigned16(entry.slotIndex, `activeEntries[${index}].slotIndex`);
  validateSigned16(
    entry.slotTableWord,
    `activeEntries[${index}].slotTableWord`,
  );
  validateSigned16(
    entry.recordPositiveWord,
    `activeEntries[${index}].recordPositiveWord`,
  );
  validateUnsigned32(entry.flags74, `activeEntries[${index}].flags74`);
  validateSigned8(
    entry.ownerSignedByte,
    `activeEntries[${index}].ownerSignedByte`,
  );
}

function validateScanRecord(record) {
  if (!record || typeof record !== "object") {
    throw new TypeError("scan record must be an object");
  }
  validateIntegerRange(record.index, 0, 0x4af, "record.index");
  validateUnsigned16(
    record.slotTableWord,
    `record ${record.index}.slotTableWord`,
  );
  validateSigned16(
    record.healthSignedWord,
    `record ${record.index}.healthSignedWord`,
  );
  validateByte(record.activeByte, `record ${record.index}.activeByte`);
  validateSigned8(
    record.ownerSignedByte,
    `record ${record.index}.ownerSignedByte`,
  );
  validateByte(record.classByte, `record ${record.index}.classByte`);
  validateByte(record.progressByte, `record ${record.index}.progressByte`);
}

function readAnalysisJson(path, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label} analysis from ${path}: ${error.message}`, {
      cause: error,
    });
  }
  if (!parsed || typeof parsed.sourceSha256 !== "string") {
    throw new Error(`${path} is not a supported ${label} analysis document`);
  }
  return parsed;
}

function requireFunction(seeds, entry) {
  const report = seeds.functions?.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!report?.instructions || !report?.basicBlocks) {
    throw new Error(`Ghidra seeds omit function ${toHex(entry)}`);
  }
  return report;
}

function parseImmediate(value) {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(3) : value.slice(2);
  const parsed = Number.parseInt(digits, 16);
  return negative ? -parsed : parsed;
}

function signed16(value) {
  return (value << 16) >> 16;
}

function requireResult(results, index, label) {
  if (index >= results.length) {
    throw new RangeError(`${label}[${index}] is required for this path`);
  }
  return results[index];
}

function validateBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean; got ${value}`);
  }
}

function validateSigned8(value, label) {
  validateIntegerRange(value, -0x80, 0x7f, label);
}

function validateByte(value, label) {
  validateIntegerRange(value, 0, 0xff, label);
}

function validateSigned16(value, label) {
  validateIntegerRange(value, -0x8000, 0x7fff, label);
}

function validateUnsigned16(value, label) {
  validateIntegerRange(value, 0, 0xffff, label);
}

function validateUnsigned32(value, label) {
  validateIntegerRange(value, 0, 0xffffffff, label);
}

function validatePositiveSigned32(value, label) {
  validateIntegerRange(value, 1, 0x7fffffff, label);
}

function validateIntegerRange(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer in ${minimum}..${maximum}; got ${value}`,
    );
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join(" ");
}

function parseArgs(argv) {
  const parsed = {};
  const options = new Map([
    ["--input", "input"],
    ["--script", "script"],
    ["--seeds", "seeds"],
    ["--functions", "functions"],
    ["--references", "references"],
    ["--jump-tables", "jumpTables"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    const key = options.get(argument);
    if (!key) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[++index];
    if (!value) throw new Error(`${argument} requires a path`);
    parsed[key] = resolve(value);
  }
  return parsed;
}

function printSummary(report) {
  console.log("K01 beacon/K0120 trigger:");
  console.log(`  EXE SHA-256: ${report.sources.executable.sha256}`);
  console.log(`  K0120 SHA-256: ${report.sources.script.sha256}`);
  console.log(`  analyzed functions: ${report.analyzedFunctions.length}`);
  console.log(`  call edges: ${report.callEdges.length}`);
  console.log(`  code anchors: ${report.codeAnchors.length}`);
  console.log(
    `  selector 5 half widths: ${report.selectorFive.halfWidths.join(",")}`,
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = extractK01BeaconK0120Trigger(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printSummary(report);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
