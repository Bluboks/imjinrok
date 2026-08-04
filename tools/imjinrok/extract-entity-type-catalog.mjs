#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";

const TYPE_WRITER_ENTRY = 0x0045bd00;
const TYPE_INITIALIZER_ENTRY = 0x0045bf50;
const NAME_INITIALIZER_ENTRY = 0x0048ea90;
const TYPE_TABLE_ADDRESS = 0x00882e10;
const TYPE_RECORD_STRIDE = 0x014c;
const TYPE_ARGUMENT_COUNT = 51;
const TYPE_CLASS_MINIMUM = 1;
const TYPE_CLASS_MAXIMUM = 95;
const NAME_RUNTIME_BASE = 0x00aa4018;
const RESOURCE_POINTER_TABLE = 0x004bc094;

const ARGUMENT_INDEX = {
  spriteSlot: 0,
  baseFrame: 1,
  renderVerticalOffset: 4,
  warExpense: 5,
  grainCost: 6,
  woodCost: 7,
  flags: 37,
  namePointer: 49,
};

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SEEDS_SHA256 =
  "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2";

const CODE_ANCHORS = [
  {
    id: "type-definition-render-vertical-offset-argument-load",
    va: 0x0045bd20,
    bytes: "66 8b 44 24 14",
    meaning:
      "one-based writer argument 5 low WORD is loaded from stack +0x14",
  },
  {
    id: "type-definition-render-vertical-offset-field-write",
    va: 0x0045bd2e,
    bytes: "66 89 41 0c",
    meaning:
      "the previously loaded one-based writer argument 5 low WORD is written to signed type record render vertical-offset field +0x0c",
  },
  {
    id: "type-definition-sprite-slot-write",
    va: 0x0045bd0a,
    bytes: "66 89 41 04",
    meaning: "argument 0 is written to type record sprite slot +0x04",
  },
  {
    id: "type-definition-base-frame-write",
    va: 0x0045bd13,
    bytes: "66 89 51 06",
    meaning: "argument 1 is written to type record base frame +0x06",
  },
  {
    id: "type-definition-war-expense-argument-load-and-write",
    va: 0x0045bd29,
    bytes: "66 8b 54 24 18 66 89 41 0c 66 8b 44 24 1c 66 89 51 0e",
    meaning:
      "the adjacent low-WORD argument pipeline loads stack +0x18 and writes the following signed type record field +0x0e",
  },
  {
    id: "type-definition-grain-cost-argument-load-and-write",
    va: 0x0045bd32,
    bytes: "66 8b 44 24 1c 66 89 51 0e 66 8b 54 24 20 66 89 41 10",
    meaning:
      "argument 6 low WORD is loaded from stack +0x1c and written to signed type record grain-cost field +0x10",
  },
  {
    id: "type-definition-wood-cost-argument-load-and-write",
    va: 0x0045bd3b,
    bytes: "66 8b 54 24 20 66 89 41 10 66 8b 44 24 24 66 89 51 12",
    meaning:
      "argument 7 low WORD is loaded from stack +0x20 and written to signed type record wood-cost field +0x12",
  },
  {
    id: "reservation-resource-argument-to-player-field-order",
    va: 0x0047e339,
    bytes: "39 5e 0c 72 53 8b 44 24 10 8b 4e 08 3b c8 72 48",
    meaning:
      "FUN_0047e330 compares caller argument 2 with player +0x0c before caller argument 1 with player +0x08",
  },
  {
    id: "reservation-resource-deduct-call-order",
    va: 0x0047e366,
    bytes: "50 8b ce e8 f2 fe ff ff 85 c0 74 1f 53 8b ce e8 36 ff ff ff",
    meaning:
      "after admission FUN_0047e330 passes caller argument 1 to FUN_0047e260, then argument 2 to FUN_0047e2b0",
  },
  {
    id: "grain-shortage-cp949-source",
    va: 0x004c7a70,
    bytes: "b0 ee b9 b0 c0 cc 20 ba ce c1 b7 c7 d5 b4 cf b4 d9 2e",
    meaning: "CP949 source string is 곡물이 부족합니다.",
  },
  {
    id: "wood-shortage-cp949-source",
    va: 0x004c7a5c,
    bytes: "b8 f1 c0 e7 b0 a1 20 ba ce c1 b7 c7 d5 b4 cf b4 d9 2e",
    meaning: "CP949 source string is 목재가 부족합니다.",
  },
  {
    id: "type-definition-flags-write",
    va: 0x0045be6a,
    bytes: "89 51 4c",
    meaning: "argument 37 is written to type record flags +0x4c",
  },
  {
    id: "type-definition-name-pointer-write",
    va: 0x0045bef0,
    bytes: "89 51 6c",
    meaning: "argument 49 is written to type record name pointer +0x6c",
  },
  {
    id: "type-definition-argument-cleanup",
    va: 0x0045bef6,
    bytes: "c2 cc 00",
    meaning: "the writer consumes exactly 51 DWORD arguments",
  },
  {
    id: "type-definition-initializer-entry",
    va: TYPE_INITIALIZER_ENTRY,
    bytes: "56 6a 00 68 58 47 aa 00",
    meaning: "the complete type-definition initializer begins with class 1 arguments",
  },
  {
    id: "runtime-name-initializer-entry",
    va: NAME_INITIALIZER_ENTRY,
    bytes: "53 8b d1 56 57",
    meaning: "the runtime name initializer derives destination storage from ECX",
  },
  {
    id: "sprite-resource-pointer-table",
    va: 0x0044336b,
    bytes: "ba 94 c0 4b 00",
    meaning: "the sprite loader starts from the slot-indexed resource pointer table",
  },
];

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractEntityTypeCatalog({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
  });

  if (args.output) {
    writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report, args.output);
  }
}

export function extractEntityTypeCatalog({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(
    executableSha256,
    EXPECTED_EXECUTABLE_SHA256,
    `${executablePath} SHA-256`,
  );

  const { document: seeds, sha256: seedsSha256 } = readSeeds(seedsPath);
  assertEqual(seedsSha256, EXPECTED_SEEDS_SHA256, `${seedsPath} SHA-256`);
  assertEqual(
    seeds.sourceSha256,
    executableSha256,
    `${seedsPath} source SHA-256`,
  );

  const typeWriter = requireFunction(seeds, TYPE_WRITER_ENTRY);
  const typeInitializer = requireFunction(seeds, TYPE_INITIALIZER_ENTRY);
  const nameInitializer = requireFunction(seeds, NAME_INITIALIZER_ENTRY);
  const codeAnchors = CODE_ANCHORS.map((anchor) =>
    validateCodeAnchor(buffer, image, anchor),
  );
  const nameCopies = extractNameCopies(nameInitializer.instructions);
  const types = extractTypeCalls(typeInitializer.instructions)
    .map((typeCall) =>
      buildTypeRecord({
        buffer,
        image,
        nameCopies,
        typeCall,
      }),
    )
    .sort((left, right) => left.internalClass - right.internalClass);

  validateCompleteClassRange(types);

  const pathUsage = countBy(
    types,
    (type) => type.sprite.sourcePathNormalized,
  );

  return {
    schemaVersion: 2,
    evidenceStatus: "static-proven-type-identities",
    analysisScope:
      "Internal class, original CP949 name, sprite slot, base frame, raw flags, source path, and three signed-WORD economy fields written by the canonical type writer only. Grain/wood names are cross-bound by the separately hash-bound production/refund control-flow and shortage-message evidence; animation and other gameplay meanings are not inferred.",
    source: {
      executablePath,
      executableSha256,
      seedsPath,
      seedsSha256,
      seedsSourceSha256: seeds.sourceSha256,
      ghidraSchemaVersion: seeds.schemaVersion,
    },
    layout: {
      typeWriterFunction: toHex(TYPE_WRITER_ENTRY),
      typeInitializerFunction: toHex(TYPE_INITIALIZER_ENTRY),
      runtimeNameInitializerFunction: toHex(NAME_INITIALIZER_ENTRY),
      typeTableAddress: toHex(TYPE_TABLE_ADDRESS),
      typeRecordStride: TYPE_RECORD_STRIDE,
      runtimeNameBase: toHex(NAME_RUNTIME_BASE),
      resourcePointerTable: toHex(RESOURCE_POINTER_TABLE),
      fields: {
        spriteSlot: "+0x04",
        baseFrame: "+0x06",
        renderVerticalOffset: {
          offset: "+0x0c",
          width: "signed WORD",
          writerArgumentOrdinal: 5,
          writerArgumentIndex: ARGUMENT_INDEX.renderVerticalOffset,
        },
        warExpense: {
          offset: "+0x0e",
          width: "signed WORD",
          writerArgumentIndex: ARGUMENT_INDEX.warExpense,
        },
        grainCost: {
          offset: "+0x10",
          width: "signed WORD",
          writerArgumentIndex: ARGUMENT_INDEX.grainCost,
        },
        woodCost: {
          offset: "+0x12",
          width: "signed WORD",
          writerArgumentIndex: ARGUMENT_INDEX.woodCost,
        },
        flags: "+0x4c",
        namePointer: "+0x6c",
      },
      economySemanticProvenance: {
        grainCost:
          "type +0x10 is passed as FUN_0047e330 caller argument 1, compared with player +0x08, deducted by FUN_0047e260, and bound to the CP949 곡물이 부족합니다. source message",
        woodCost:
          "type +0x12 is passed as FUN_0047e330 caller argument 2, compared with player +0x0c, deducted by FUN_0047e2b0, and bound to the CP949 목재가 부족합니다. source message",
      },
    },
    analyzedFunctions: [
      summarizeFunction(typeWriter),
      summarizeFunction(typeInitializer),
      summarizeFunction(nameInitializer),
    ],
    summary: {
      typeCount: types.length,
      minimumClass: types[0].internalClass,
      maximumClass: types.at(-1).internalClass,
      uniqueOriginalNameCount: new Set(
        types.map((type) => type.originalGameplayName),
      ).size,
      uniqueSpritePathCount: pathUsage.size,
      sharedSpritePathCount: [...pathUsage.values()].filter(
        (usageCount) => usageCount > 1,
      ).length,
      baseFrameZeroCount: types.filter(
        (type) => type.sprite.baseFrame === 0,
      ).length,
      baseFrameSevenCount: types.filter(
        (type) => type.sprite.baseFrame === 7,
      ).length,
      otherBaseFrameCount: types.filter(
        (type) =>
          type.sprite.baseFrame !== 0 && type.sprite.baseFrame !== 7,
      ).length,
    },
    codeAnchors,
    types,
  };
}

function buildTypeRecord({ buffer, image, nameCopies, typeCall }) {
  const namePointer = requireArgument(typeCall, ARGUMENT_INDEX.namePointer);
  const matchingNameCopies = nameCopies.get(namePointer);
  if (!matchingNameCopies) {
    throw new Error(
      `Type ${typeCall.internalClass} name pointer ${toHex(namePointer)} has no statically recovered runtime copy`,
    );
  }
  if (matchingNameCopies.length !== 1) {
    throw new Error(
      `Type ${typeCall.internalClass} name pointer ${toHex(namePointer)} has ${matchingNameCopies.length} possible runtime copies`,
    );
  }
  const [nameCopy] = matchingNameCopies;

  const spriteSlot = requireArgument(typeCall, ARGUMENT_INDEX.spriteSlot);
  const sourcePath = readResourcePath(buffer, image, spriteSlot);

  return {
    internalClass: typeCall.internalClass,
    originalGameplayName: readEncodedCString(
      buffer,
      image,
      nameCopy.sourcePointer,
      "euc-kr",
    ),
    definition: {
      recordAddress: toHex(typeCall.recordAddress),
      initializerCallAddress: toHex(typeCall.callAddress),
      flags: toHex(requireArgument(typeCall, ARGUMENT_INDEX.flags)),
      economy: {
        warExpense: requireSignedWordArgument(
          typeCall,
          ARGUMENT_INDEX.warExpense,
        ),
        grainCost: requireSignedWordArgument(
          typeCall,
          ARGUMENT_INDEX.grainCost,
        ),
        woodCost: requireSignedWordArgument(
          typeCall,
          ARGUMENT_INDEX.woodCost,
        ),
      },
      renderVerticalOffset: requireSignedWordArgument(
        typeCall,
        ARGUMENT_INDEX.renderVerticalOffset,
      ),
    },
    name: {
      runtimePointer: toHex(namePointer),
      sourcePointer: toHex(nameCopy.sourcePointer),
      sourceInstructionAddress: toHex(nameCopy.sourceInstructionAddress),
      destinationInstructionAddress: toHex(
        nameCopy.destinationInstructionAddress,
      ),
    },
    sprite: {
      slot: spriteSlot,
      baseFrame: requireArgument(typeCall, ARGUMENT_INDEX.baseFrame),
      pointerCell: toHex(RESOURCE_POINTER_TABLE + spriteSlot * 4),
      sourcePathPointer: toHex(sourcePath.sourcePathPointer),
      sourcePath: sourcePath.value,
      sourcePathNormalized: normalizeSourcePath(sourcePath.value),
    },
  };
}

function extractTypeCalls(instructions) {
  const calls = [];
  const registerValues = new Map();
  let currentRecordAddress;
  let pushedArguments = [];

  for (const instruction of instructions) {
    const constantMove = /^MOV (E[A-Z]{2}),(-?0x[0-9a-f]+)$/.exec(
      instruction.text,
    );
    if (constantMove) {
      registerValues.set(
        constantMove[1],
        parseImmediate(constantMove[2]),
      );
      if (constantMove[1] === "ECX") {
        currentRecordAddress = parseImmediate(constantMove[2]);
      }
    }

    const push = /^PUSH (.+)$/.exec(instruction.text);
    if (push) {
      pushedArguments.push({
        instructionAddress: Number(instruction.address),
        operand: push[1],
        value: resolvePushValue(push[1], registerValues),
      });
    }

    if (instruction.text !== `CALL ${toHex(TYPE_WRITER_ENTRY)}`) {
      continue;
    }

    if (
      pushedArguments.length === TYPE_ARGUMENT_COUNT + 1 &&
      pushedArguments[0].instructionAddress === TYPE_INITIALIZER_ENTRY
    ) {
      pushedArguments = pushedArguments.slice(1);
    }
    if (pushedArguments.length !== TYPE_ARGUMENT_COUNT) {
      throw new Error(
        `Type writer call at ${instruction.address} has ${pushedArguments.length} recovered arguments; expected ${TYPE_ARGUMENT_COUNT}`,
      );
    }
    if (currentRecordAddress === undefined) {
      throw new Error(
        `Type writer call at ${instruction.address} has no constant ECX record address`,
      );
    }

    const internalClass =
      (currentRecordAddress - TYPE_TABLE_ADDRESS) / TYPE_RECORD_STRIDE;
    if (!Number.isInteger(internalClass)) {
      throw new Error(
        `Type writer call at ${instruction.address} uses unaligned record ${toHex(currentRecordAddress)}`,
      );
    }

    calls.push({
      internalClass,
      recordAddress: currentRecordAddress,
      callAddress: Number(instruction.address),
      arguments: pushedArguments,
    });
    currentRecordAddress = undefined;
    pushedArguments = [];
  }

  return calls;
}

function extractNameCopies(instructions) {
  const copies = new Map();
  let sourcePointer;
  let sourceInstructionAddress;
  let nextEbxOffset;

  for (const instruction of instructions) {
    const sourceMove = /^MOV EDI,(0x[0-9a-f]+)$/.exec(instruction.text);
    if (sourceMove) {
      sourcePointer = parseImmediate(sourceMove[1]);
      sourceInstructionAddress = Number(instruction.address);
      continue;
    }

    const ebxDestination = /^LEA EBX,\[EDX \+ (0x[0-9a-f]+)\]$/.exec(
      instruction.text,
    );
    if (ebxDestination) {
      nextEbxOffset = parseImmediate(ebxDestination[1]);
      continue;
    }

    let destinationPointer;
    if (instruction.text === "MOV EDI,EDX") {
      destinationPointer = NAME_RUNTIME_BASE;
    } else if (
      instruction.text === "MOV EDI,EBX" &&
      nextEbxOffset !== undefined
    ) {
      destinationPointer = NAME_RUNTIME_BASE + nextEbxOffset;
    } else {
      continue;
    }

    if (
      sourcePointer === undefined ||
      sourceInstructionAddress === undefined
    ) {
      continue;
    }
    const copy = {
      sourcePointer,
      sourceInstructionAddress,
      destinationInstructionAddress: Number(instruction.address),
    };
    const existingCopies = copies.get(destinationPointer);
    if (existingCopies) {
      existingCopies.push(copy);
    } else {
      copies.set(destinationPointer, [copy]);
    }
    sourcePointer = undefined;
    sourceInstructionAddress = undefined;
  }

  return copies;
}

function requireArgument(typeCall, argumentIndex) {
  const chronologicalIndex = TYPE_ARGUMENT_COUNT - 1 - argumentIndex;
  const argument = typeCall.arguments[chronologicalIndex];
  if (!argument || argument.value === undefined) {
    throw new Error(
      `Type ${typeCall.internalClass} argument ${argumentIndex} is not a statically resolved integer`,
    );
  }
  return argument.value;
}

function requireSignedWordArgument(typeCall, argumentIndex) {
  const value = requireArgument(typeCall, argumentIndex);
  if (!Number.isInteger(value)) {
    throw new Error(
      `Type ${typeCall.internalClass} argument ${argumentIndex} is not an integer WORD`,
    );
  }
  const rawWord = value & 0xffff;
  return rawWord >= 0x8000 ? rawWord - 0x10000 : rawWord;
}

function readResourcePath(buffer, image, spriteSlot) {
  const pointerCell = RESOURCE_POINTER_TABLE + spriteSlot * 4;
  const pointerCellOffset = requireRawOffset(image, pointerCell);
  const sourcePathPointer = buffer.readUInt32LE(pointerCellOffset);
  const sourcePathOffset = requireRawOffset(image, sourcePathPointer);
  const value = readCString(buffer, sourcePathOffset);
  if (!/^(?:char|fnt)\\[^\\/:*?"<>|]+\.spr$/i.test(value)) {
    throw new Error(
      `Sprite slot ${spriteSlot} has unexpected resource path ${JSON.stringify(value)}`,
    );
  }
  return { sourcePathPointer, value };
}

function validateCompleteClassRange(types) {
  const expectedCount = TYPE_CLASS_MAXIMUM - TYPE_CLASS_MINIMUM + 1;
  assertEqual(types.length, expectedCount, "entity type count");

  for (
    let internalClass = TYPE_CLASS_MINIMUM;
    internalClass <= TYPE_CLASS_MAXIMUM;
    internalClass += 1
  ) {
    const type = types[internalClass - TYPE_CLASS_MINIMUM];
    if (type?.internalClass !== internalClass) {
      throw new Error(
        `Entity type catalog is missing class ${internalClass}`,
      );
    }
  }
}

function readSeeds(path) {
  let bytes;
  let parsed;
  try {
    bytes = readFileSync(path);
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Cannot read Ghidra seed analysis from ${path}: ${error.message}`, {
      cause: error,
    });
  }
  if (
    !parsed ||
    !Array.isArray(parsed.functions) ||
    typeof parsed.sourceSha256 !== "string"
  ) {
    throw new Error(`${path} is not a supported Ghidra seed analysis document`);
  }
  return { document: parsed, sha256: sha256(bytes) };
}

function requireFunction(seeds, entry) {
  const functionReport = seeds.functions.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!functionReport || !Array.isArray(functionReport.instructions)) {
    throw new Error(
      `Ghidra seed analysis is missing function ${toHex(entry)} instructions`,
    );
  }
  return functionReport;
}

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = requireRawOffset(image, anchor.va);
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (Buffer.compare(actual, expected) !== 0) {
    throw new Error(
      `Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}: expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    ...anchor,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    expectedBytes: formatBytes(expected),
    actualBytes: formatBytes(actual),
    matched: true,
  };
}

function summarizeFunction(functionReport) {
  return {
    entry: functionReport.entry,
    name: functionReport.name,
    bodyRanges: functionReport.bodyRanges,
    instructionCount: functionReport.instructions.length,
  };
}

function resolvePushValue(operand, registerValues) {
  if (/^-?0x[0-9a-f]+$/.test(operand)) {
    return parseImmediate(operand);
  }
  return registerValues.get(operand);
}

function parseImmediate(value) {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(3) : value.slice(2);
  const parsed = Number.parseInt(digits, 16);
  return negative ? -parsed : parsed;
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
  return new TextDecoder(encoding, { fatal: true }).decode(
    buffer.subarray(offset, end),
  );
}

function requireRawOffset(image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new RangeError(
      `${toHex(va)} is not backed by a PE file section`,
    );
  }
  return offset;
}

function normalizeSourcePath(path) {
  return path.replaceAll("\\", "/").toLowerCase();
}

function countBy(values, selectKey) {
  const counts = new Map();
  for (const value of values) {
    const key = selectKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} mismatch: expected ${expected}, got ${actual}`,
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
  const pathArgumentKeys = {
    "--input": "input",
    "--output": "output",
    "--seeds": "seeds",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    const key = pathArgumentKeys[arg];
    if (key) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a path`);
      }
      parsed[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printSummary(report, outputPath) {
  console.log(
    `Entity type catalog: ${report.summary.typeCount} classes (${report.summary.minimumClass}..${report.summary.maximumClass})`,
  );
  console.log(
    `  names: ${report.summary.uniqueOriginalNameCount}, sprite paths: ${report.summary.uniqueSpritePathCount}`,
  );
  console.log(`  static code anchors: ${report.codeAnchors.length} matched`);
  if (outputPath) {
    console.log(`  output: ${outputPath}`);
  }
}
