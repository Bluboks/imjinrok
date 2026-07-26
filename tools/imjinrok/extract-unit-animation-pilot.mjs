#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { parseSpriteLikeHeader } from "./codec.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SPRITE_PATH = "original/imjinrok2/char/swordk.spr";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SPRITE_SHA256 = "414d285b207ba12afdd856a0f16ddde615381cf491fe493d6ededf91681b55eb";

export const PILOT_IDENTITY = {
  internalClass: 2,
  originalGameplayName: "조선 창병",
  spriteSlot: 100,
  sourcePath: "char\\swordk.spr",
  gameplayNameStatus: "static-confirmed",
  projectEntityBindingStatus: "display-name-and-sprite-source-confirmed",
};

export const DIRECTION_DELTAS = new Map([
  [0x01, { deltaX: 0, deltaY: 1 }],
  [0x04, { deltaX: -1, deltaY: 0 }],
  [0x05, { deltaX: -1, deltaY: 1 }],
  [0x10, { deltaX: 0, deltaY: -1 }],
  [0x14, { deltaX: -1, deltaY: -1 }],
  [0x40, { deltaX: 1, deltaY: 0 }],
  [0x41, { deltaX: 1, deltaY: 1 }],
  [0x50, { deltaX: 1, deltaY: -1 }],
]);

const STATE_SPECS = new Map([
  [
    1,
    {
      functionEntry: 0x0041efa0,
      dispatchDestination: 0x0041d226,
      switchAddress: 0x0041f1aa,
      pathCondition: "(DWORD [entity+0x74] & 0x80000008) == 0",
      directionField: 0x01e6,
      spriteSlotField: 0x00a7,
      phaseCountField: 0x00a6,
      phaseCount: 8,
      frameBaseValues: new Map([
        [0x00a8, 0],
        [0x00aa, 8],
        [0x00ac, 16],
        [0x00ae, 24],
        [0x00b0, 32],
      ]),
      defaultDestination: 0x0041f267,
      destinations: new Map([
        [0x0041f1b1, { frameBaseField: 0x00a8, mirrorX: false }],
        [0x0041f1cb, { frameBaseField: 0x00aa, mirrorX: false }],
        [0x0041f1e5, { frameBaseField: 0x00ac, mirrorX: false }],
        [0x0041f1ff, { frameBaseField: 0x00ae, mirrorX: false }],
        [0x0041f219, { frameBaseField: 0x00ac, mirrorX: true }],
        [0x0041f233, { frameBaseField: 0x00aa, mirrorX: true }],
        [0x0041f24d, { frameBaseField: 0x00a8, mirrorX: true }],
        [0x0041f004, { frameBaseField: 0x00b0, mirrorX: false }],
      ]),
      directionDestinations: new Map([
        [0x01, 0x0041f1b1],
        [0x04, 0x0041f1e5],
        [0x05, 0x0041f1cb],
        [0x10, 0x0041f219],
        [0x14, 0x0041f1ff],
        [0x40, 0x0041f24d],
        [0x41, 0x0041f004],
        [0x50, 0x0041f233],
      ]),
    },
  ],
  [
    2,
    {
      functionEntry: 0x0041f380,
      dispatchDestination: 0x0041d22b,
      switchAddress: 0x0041f3a5,
      pathCondition: "unconditional",
      directionField: 0x01e6,
      spriteSlotField: 0x00bc,
      phaseCountField: 0x00bb,
      phaseCount: 8,
      frameBaseValues: new Map([
        [0x00be, 88],
        [0x00c0, 96],
        [0x00c2, 104],
        [0x00c4, 112],
        [0x00c6, 120],
      ]),
      defaultDestination: 0x0041f46b,
      destinations: new Map([
        [0x0041f3ac, { frameBaseField: 0x00be, mirrorX: false }],
        [0x0041f3c6, { frameBaseField: 0x00c0, mirrorX: false }],
        [0x0041f3cf, { frameBaseField: 0x00c2, mirrorX: false }],
        [0x0041f3e9, { frameBaseField: 0x00c4, mirrorX: false }],
        [0x0041f403, { frameBaseField: 0x00c2, mirrorX: true }],
        [0x0041f41d, { frameBaseField: 0x00c0, mirrorX: true }],
        [0x0041f437, { frameBaseField: 0x00be, mirrorX: true }],
        [0x0041f451, { frameBaseField: 0x00c6, mirrorX: false }],
      ]),
      directionDestinations: new Map([
        [0x01, 0x0041f3ac],
        [0x04, 0x0041f3cf],
        [0x05, 0x0041f3c6],
        [0x10, 0x0041f403],
        [0x14, 0x0041f3e9],
        [0x40, 0x0041f437],
        [0x41, 0x0041f451],
        [0x50, 0x0041f41d],
      ]),
    },
  ],
]);

const STATIC_EVIDENCE = [
  {
    id: "class-2-name-pointer-argument",
    va: 0x0045bfc4,
    bytes: "6a 00 68 28 50 aa 00",
    meaning: "class 2 type definition receives runtime name pointer 0x00aa5028",
  },
  {
    id: "class-2-slot-base-and-record",
    va: 0x0045c034,
    bytes: "6a 20 6a 00 6a 64 b9 a8 30 88 00 e8 bc fc ff ff",
    meaning: "class 2 writes sprite slot 100 and base frame 0 into definition record 0x008830a8",
  },
  {
    id: "class-2-name-storage-offset",
    va: 0x0048f8bb,
    bytes: "8d 9a 10 10 00 00",
    meaning: "name storage initializer advances to base +0x1010, which is 0x00aa5028",
  },
  {
    id: "class-2-name-source",
    va: 0x0048f8cf,
    bytes: "bf 64 83 4c 00",
    meaning: "name storage initializer copies the CP949 string at 0x004c8364",
  },
  {
    id: "sprite-loader-path-table-base",
    va: 0x0044336b,
    bytes: "ba 94 c0 4b 00",
    meaning: "loader starts at the resource path pointer table at 0x004bc094",
  },
  {
    id: "sprite-loader-runtime-record-base",
    va: 0x00443377,
    bytes: "be b8 c0 88 00",
    meaning: "loader starts runtime sprite records at 0x0088c0b8",
  },
  {
    id: "sprite-loader-runtime-record-stride",
    va: 0x004433ed,
    bytes: "81 c6 f8 0b 00 00",
    meaning: "loader advances runtime sprite records by 0x0bf8 bytes",
  },
  {
    id: "sprite-loader-path-pointer-stride",
    va: 0x004433f3,
    bytes: "83 c7 04",
    meaning: "loader advances the resource path table by one DWORD per runtime slot",
  },
  {
    id: "entity-class-switch-input",
    va: 0x004292a2,
    bytes: "33 c0 8a 46 37 8d 48 fe",
    meaning: "entity initializer dispatches on BYTE [entity+0x37], normalized by subtracting 2",
  },
  {
    id: "class-2-state-1-initializer",
    va: 0x00429f63,
    bytes: "53 6a 00 6a 64 8b ce 88 9e a6 00 00 00 e8 7b ef 00 00",
    meaning: "internal class 2 assigns slot 100, base 0, stride 8, and phase count 8 to state 1",
  },
  {
    id: "class-2-state-2-initializer",
    va: 0x00429f75,
    bytes: "53 6a 58 6a 64 8b ce 88 9e bb 00 00 00 e8 e9 ef 00 00",
    meaning: "internal class 2 assigns slot 100, base 88, stride 8, and phase count 8 to state 2",
  },
  {
    id: "state-dispatch-input",
    va: 0x0041d210,
    bytes: "0f be 41 03 48 83 f8 11",
    meaning: "animation state dispatcher reads signed BYTE [entity+0x03]",
  },
  {
    id: "state-1-normal-path-condition",
    va: 0x0041efa0,
    bytes: "f7 41 74 08 00 00 80 0f 84 d8 01 00 00",
    meaning: "state 1 uses the recovered +0x1e6 direction mapping only when flags +0x74 mask 0x80000008 is clear",
  },
  {
    id: "state-1-slot-write-and-direction-read",
    va: 0x0041f185,
    bytes: "0f bf 81 e6 01 00 00 66 0f b6 91 a7 00 00 00",
    meaning: "state 1 normal path reads direction +0x1e6 and sprite slot configuration +0x00a7",
  },
  {
    id: "state-2-slot-write-and-direction-read",
    va: 0x0041f380,
    bytes: "66 0f b6 81 bc 00 00 00 66 89 41 0a 0f bf 81 e6 01 00 00",
    meaning: "state 2 writes sprite slot from +0x00bc and reads direction +0x1e6",
  },
  {
    id: "direction-positive-x-bit",
    va: 0x00425db0,
    bytes: "bf 40 00 00 00",
    meaning: "movement toward increasing X contributes direction bit 0x40",
  },
  {
    id: "direction-negative-x-bit",
    va: 0x00425dc1,
    bytes: "bf 04 00 00 00",
    meaning: "movement toward decreasing X contributes direction bit 0x04",
  },
  {
    id: "direction-positive-y-bit",
    va: 0x00425de7,
    bytes: "bd 01 00 00 00",
    meaning: "movement toward increasing Y contributes direction bit 0x01",
  },
  {
    id: "direction-negative-y-bit",
    va: 0x00425df9,
    bytes: "83 cf 10",
    meaning: "movement toward decreasing Y contributes direction bit 0x10",
  },
  {
    id: "direction-field-writer",
    va: 0x004381a0,
    bytes: "66 8b 44 24 04 66 89 81 e6 01 00 00 66 89 81 e8 01 00 00",
    meaning: "normal direction writer stores the bitmask in WORD fields +0x1e6 and +0x1e8",
  },
  {
    id: "render-mirror-read",
    va: 0x0041ffb0,
    bytes: "8a 86 b5 01 00 00",
    meaning: "entity renderer reads BYTE [entity+0x1b5] as its mirrored draw branch selector",
  },
  {
    id: "render-slot-and-frame-read",
    va: 0x00420000,
    bytes: "0f bf 46 0a 0f bf 56 0c",
    meaning: "entity renderer reads sprite slot +0x0a and frame index +0x0c",
  },
  {
    id: "render-frame-pointer-lookup",
    va: 0x0042001b,
    bytes: "8b 04 8d 78 c5 88 00",
    meaning: "entity renderer indexes the selected runtime sprite record frame table",
  },
  {
    id: "render-sprite-data-base-lookup",
    va: 0x00420022,
    bytes: "8b 0c d5 ac cc 88 00",
    meaning: "entity renderer loads the selected runtime sprite record data base",
  },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractUnitAnimationPilot({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    spritePath: args.sprite ?? DEFAULT_SPRITE_PATH,
    jumpTablesPath: args.jumpTables ?? DEFAULT_JUMP_TABLES_PATH,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractUnitAnimationPilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  spritePath = DEFAULT_SPRITE_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer: executableBuffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const spriteBuffer = readFileSync(spritePath);
  const spriteSha256 = sha256(spriteBuffer);
  assertEqual(spriteSha256, EXPECTED_SPRITE_SHA256, `${spritePath} SHA-256`);
  const spriteHeader = parseSpriteLikeHeader(spriteBuffer, spritePath);

  const jumpTables = readJumpTables(jumpTablesPath);
  const evidencePoints = STATIC_EVIDENCE.map((point) => readEvidencePoint(executableBuffer, image, point));
  const mismatch = evidencePoints.find((point) => !point.matched);
  if (mismatch) {
    throw new Error(
      `Static evidence mismatch at ${mismatch.va} (${mismatch.id}): expected ${mismatch.expectedBytes}, got ${mismatch.actualBytes}`,
    );
  }

  const resourceBinding = extractResourceBinding(executableBuffer, image);
  assertEqual(resourceBinding.sourcePath, PILOT_IDENTITY.sourcePath, "runtime sprite slot 100 source path");
  const originalGameplayName = readEncodedCString(executableBuffer, image, 0x004c8364, "euc-kr");
  assertEqual(originalGameplayName, PILOT_IDENTITY.originalGameplayName, "internal class 2 gameplay name");

  const classSwitch = findSwitch(jumpTables, 0x004291d0, 0x004292b3);
  const classCase = requireCase(classSwitch, PILOT_IDENTITY.internalClass);
  assertEqual(classCase.destination, toHex(0x00429f48), "internal class 2 initializer destination");

  const stateDispatch = findSwitch(jumpTables, 0x0041d210, 0x0041d21a);
  const stateReports = Array.from(STATE_SPECS, ([state, spec]) => {
    const dispatchCase = requireCase(stateDispatch, state);
    assertEqual(dispatchCase.destination, toHex(spec.dispatchDestination), `state ${state} dispatcher destination`);
    return extractStateReport(jumpTables, state, spec);
  });

  return {
    analysisStatus: "static-confirmed-for-scoped-pilot",
    identity: {
      ...PILOT_IDENTITY,
      warning:
        "The binary confirms the original name and sprite source. Current combat statistics and the gameplay meanings of animation states 1 and 2 remain unconfirmed.",
    },
    sources: {
      executable: {
        path: executablePath,
        sha256: executableSha256,
      },
      sprite: {
        path: spritePath,
        embeddedPath: resourceBinding.sourcePath,
        sha256: spriteSha256,
        width: spriteHeader.width,
        height: spriteHeader.height,
        frameCount: spriteHeader.frameCount,
      },
      jumpTables: {
        path: jumpTablesPath,
      },
    },
    resourceBinding,
    entityBinding: {
      classField: toOffset(0x37),
      internalClass: PILOT_IDENTITY.internalClass,
      switchAddress: toHex(0x004292b3),
      initializerAddress: classCase.destination,
    },
    typeDefinition: {
      tableAddress: toHex(0x00882e10),
      recordStride: 0x014c,
      recordAddress: toHex(0x008830a8),
      spriteSlotField: "+0x04",
      baseFrameField: "+0x06",
      namePointerField: "+0x6c",
      namePointer: toHex(0x00aa5028),
      nameSourcePointer: toHex(0x004c8364),
      originalGameplayName,
    },
    runtimeFields: {
      animationState: toOffset(0x03),
      animationDirty: toOffset(0x04),
      spriteSlot: toOffset(0x0a),
      frameIndex: toOffset(0x0c),
      phase: toOffset(0x1b2),
      mirrorSelector: toOffset(0x1b5),
      direction: toOffset(0x1e6),
    },
    directionGeneration: Array.from(DIRECTION_DELTAS, ([direction, delta]) => ({
      direction,
      directionHex: toSmallHex(direction),
      ...delta,
    })),
    states: stateReports,
    renderFormula: {
      spriteRecordIndex: "spriteSlot",
      spriteRecordStride: 0x0bf8,
      framePointerTableOffset: 0x04c0,
      spriteDataBaseOffset: 0x0bf4,
      selectedFrame: "runtimeSpriteRecords[spriteSlot].frameOffsets[frameIndex] + runtimeSpriteRecords[spriteSlot].dataBase",
    },
    testVectors: buildTestVectors(),
    evidencePoints,
  };
}

export function selectPilotFrame({ state, direction, phase, previousMirrorX, entityFlags = 0 }) {
  const spec = STATE_SPECS.get(state);
  if (!spec) {
    throw new RangeError(`Unsupported pilot state ${state}; expected 1 or 2`);
  }
  if (!Number.isInteger(phase) || phase < 0 || phase >= spec.phaseCount) {
    throw new RangeError(`State ${state} phase ${phase} is outside 0..${spec.phaseCount - 1}`);
  }
  if (state === 1 && (entityFlags & 0x80000008) !== 0) {
    throw new RangeError(
      `State 1 flags 0x${(entityFlags >>> 0).toString(16)} select the unrecovered special +0x1e8 direction path`,
    );
  }

  const mapping = getDirectionMapping(spec, direction);
  if (!mapping) {
    return {
      state,
      direction,
      phase,
      frameIndex: phase,
      mirrorX: previousMirrorX,
      mirrorWrite: "unchanged",
      frameBaseField: null,
      usedDefault: true,
    };
  }

  const frameBase = spec.frameBaseValues.get(mapping.frameBaseField);
  if (frameBase === undefined) {
    throw new Error(`State ${state} has no initializer value for frame base field ${toOffset(mapping.frameBaseField)}`);
  }

  return {
    state,
    direction,
    phase,
    frameIndex: frameBase + phase,
    mirrorX: mapping.mirrorX,
    mirrorWrite: "assigned",
    frameBaseField: toOffset(mapping.frameBaseField),
    usedDefault: false,
  };
}

function extractResourceBinding(buffer, image) {
  const pointerTable = 0x004bc094;
  const runtimeRecordBase = 0x0088c0b8;
  const runtimeRecordStride = 0x0bf8;
  const slot = PILOT_IDENTITY.spriteSlot;
  const pointerCellVa = pointerTable + slot * 4;
  const pointerCellOffset = requireRawOffset(image, pointerCellVa);
  const sourcePathVa = buffer.readUInt32LE(pointerCellOffset);
  const sourcePathOffset = requireRawOffset(image, sourcePathVa);

  return {
    loaderFunction: toHex(0x00443360),
    pointerTable: toHex(pointerTable),
    slot,
    pointerCell: toHex(pointerCellVa),
    sourcePathPointer: toHex(sourcePathVa),
    sourcePath: readCString(buffer, sourcePathOffset),
    runtimeRecordBase: toHex(runtimeRecordBase),
    runtimeRecordStride,
    runtimeRecordAddress: toHex(runtimeRecordBase + slot * runtimeRecordStride),
  };
}

function extractStateReport(jumpTables, state, spec) {
  const directionSwitch = findSwitch(jumpTables, spec.functionEntry, spec.switchAddress);
  const directions = Array.from(DIRECTION_DELTAS, ([direction, delta]) => {
    const switchCase = requireCase(directionSwitch, direction);
    const destination = Number(switchCase.destination);
    const mapping = spec.destinations.get(destination);
    if (!mapping) {
      throw new Error(
        `State ${state} direction ${toSmallHex(direction)} reaches unrecognized destination ${switchCase.destination}`,
      );
    }
    const frameBase = spec.frameBaseValues.get(mapping.frameBaseField);
    if (frameBase === undefined) {
      throw new Error(`State ${state} has no frame base value for field ${toOffset(mapping.frameBaseField)}`);
    }

    return {
      direction,
      directionHex: toSmallHex(direction),
      ...delta,
      destination: switchCase.destination,
      frameBaseField: toOffset(mapping.frameBaseField),
      frameBase,
      phaseRange: [0, spec.phaseCount - 1],
      frameRange: [frameBase, frameBase + spec.phaseCount - 1],
      mirrorX: mapping.mirrorX,
    };
  });

  const defaultCases = directionSwitch.cases.filter(
    (switchCase) => switchCase.destination === toHex(spec.defaultDestination),
  );
  if (defaultCases.length === 0) {
    throw new Error(`State ${state} switch has no default-handler cases at ${toHex(spec.defaultDestination)}`);
  }

  return {
    state,
    functionEntry: toHex(spec.functionEntry),
    switchAddress: toHex(spec.switchAddress),
    spriteSlot: PILOT_IDENTITY.spriteSlot,
    spriteSlotConfigField: toOffset(spec.spriteSlotField),
    phaseField: toOffset(0x1b2),
    phaseCountField: toOffset(spec.phaseCountField),
    phaseCount: spec.phaseCount,
    pathCondition: spec.pathCondition,
    directionField: toOffset(spec.directionField),
    directions,
    unsupportedDirectionBehavior: {
      destination: toHex(spec.defaultDestination),
      frameIndex: "phase",
      mirrorSelector: "unchanged",
    },
  };
}

function getDirectionMapping(spec, direction) {
  const destination = spec.directionDestinations.get(direction);
  return destination === undefined ? undefined : spec.destinations.get(destination);
}

function buildTestVectors() {
  const vectors = [];
  for (const state of STATE_SPECS.keys()) {
    for (const direction of DIRECTION_DELTAS.keys()) {
      for (const phase of [0, 7]) {
        vectors.push(selectPilotFrame({ state, direction, phase, previousMirrorX: true }));
      }
    }
    vectors.push(selectPilotFrame({ state, direction: 0x00, phase: 0, previousMirrorX: true }));
    vectors.push(selectPilotFrame({ state, direction: 0x7f, phase: 7, previousMirrorX: false }));
  }
  return vectors;
}

function readJumpTables(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read static jump tables from ${path}: ${error.message}`, { cause: error });
  }
  if (!parsed.tables || typeof parsed.tables !== "object") {
    throw new Error(`${path} does not contain a jump-tables 'tables' object`);
  }
  return Object.values(parsed.tables);
}

function readEncodedCString(buffer, image, va, encoding) {
  const offset = requireRawOffset(image, va);
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }
  if (end === buffer.length) {
    throw new Error(`Unterminated ${encoding} string at ${toHex(va)}`);
  }
  return new TextDecoder(encoding, { fatal: true }).decode(buffer.subarray(offset, end));
}

function findSwitch(tables, functionEntry, switchAddress) {
  const table = tables.find(
    (candidate) =>
      candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress),
  );
  if (!table) {
    throw new Error(`Missing jump table for ${toHex(functionEntry)} switch ${toHex(switchAddress)}`);
  }
  return table;
}

function requireCase(table, label) {
  const switchCase = table.cases.find((candidate) => candidate.label === label);
  if (!switchCase) {
    throw new Error(`Switch ${table.switchAddress} has no case ${label}`);
  }
  return switchCase;
}

function readEvidencePoint(buffer, image, point) {
  const rawOffset = image.vaToRawOffset(point.va);
  const expectedBytes = Buffer.from(point.bytes.replaceAll(" ", ""), "hex");
  const actualBytes =
    rawOffset === undefined ? Buffer.alloc(0) : buffer.subarray(rawOffset, rawOffset + expectedBytes.length);

  return {
    ...point,
    va: toHex(point.va),
    rawOffset: rawOffset === undefined ? undefined : toHex(rawOffset),
    expectedBytes: formatBytes(expectedBytes),
    actualBytes: formatBytes(actualBytes),
    matched: Buffer.compare(actualBytes, expectedBytes) === 0,
  };
}

function requireRawOffset(image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new RangeError(`${toHex(va)} is not backed by a PE file section`);
  }
  return offset;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function toOffset(value) {
  return `+0x${value.toString(16).padStart(2, "0")}`;
}

function toSmallHex(value) {
  return `0x${value.toString(16).padStart(2, "0")}`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--input" || arg === "--sprite" || arg === "--jump-tables") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      parsed[arg === "--input" ? "input" : arg === "--sprite" ? "sprite" : "jumpTables"] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printReport(report) {
  console.log(`Unit animation pilot: internal class ${report.identity.internalClass}`);
  console.log(`  source: slot ${report.identity.spriteSlot} -> ${report.sources.sprite.embeddedPath}`);
  console.log(`  gameplay name: ${report.identity.originalGameplayName} (${report.identity.gameplayNameStatus})`);
  console.log(`  project entity binding: ${report.identity.projectEntityBindingStatus}`);
  for (const state of report.states) {
    console.log(`  state ${state.state}: ${state.directions.length} directions, ${state.phaseCount} phases`);
  }
  console.log(`  static evidence points: ${report.evidencePoints.length} matched`);
}
