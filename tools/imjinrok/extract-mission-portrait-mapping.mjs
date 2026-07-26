#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_EXECUTABLE_PATH = join(
  repositoryRoot,
  "original/imjinrok2/imjinrok2.exe",
);
const DEFAULT_HERO_SPRITE_PATH = join(
  repositoryRoot,
  "original/imjinrok2/yfnt/hero.spr",
);

export const EXPECTED_IMJINROK_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_HERO_SPRITE_SHA256 =
  "a701bd0a66ec30dfd0bbc33ad7e78b937e725292fd37e9cae983ca28ad6af853";

const SPEAKER_COUNT = 17;
const SPEAKER_SOURCE_TABLE_START_VA = 0x004c856c;
const SPEAKER_RUNTIME_STRUCTURE_BASE = 0x00aa4018;
const SPEAKER_RUNTIME_STORAGE_OFFSET = 0x09c0;
const SPEAKER_RUNTIME_STORAGE_STRIDE = 0x10;
const SPEAKER_LOOKUP_POINTER_TABLE_VA = 0x00c83e00;
const SPEAKER_LOOKUP_POINTER_INITIALIZER_VA = 0x004a747c;
const SPEAKER_FRAME_TABLE_VA = 0x004c91ac;
const HERO_RESOURCE_PATH_VA = 0x004c91f4;
const SPEAKER_COPY_FUNCTION_START_VA = 0x0048ef6f;
const SPEAKER_COPY_FUNCTION_END_VA = 0x0048f400;
const LOOKUP_FAILURE_INDEX = -1;

const CODE_ANCHORS = [
  {
    id: "speaker-storage-initializer-call",
    va: 0x0045f19e,
    bytes: "b9 18 40 aa 00 e8 e8 f8 02 00",
  },
  {
    id: "speaker-storage-structure-base",
    va: 0x0048ea90,
    bytes: "53 8b d1",
  },
  {
    id: "speaker-storage-first-id-slot",
    va: 0x0048ef5b,
    bytes: "8d 9a c0 09 00 00",
  },
  {
    id: "speech-record-type-zero-dispatch",
    va: 0x00483115,
    bytes: "8b 76 04 6a 00 6a 01 6a 00",
  },
  {
    id: "speech-display-call",
    va: 0x0048313c,
    bytes: "e8 cf 49 02 00",
  },
  {
    id: "hero-sprite-resource-load",
    va: 0x004a7440,
    bytes: "68 f4 91 4c 00",
  },
  {
    id: "speaker-id-lookup-call",
    va: 0x004a76d0,
    bytes: "e8 9b 11 00 00",
  },
  {
    id: "speaker-frame-table-read",
    va: 0x004a774a,
    bytes: "0f bf 04 55 ac 91 4c 00",
  },
  {
    id: "hero-sprite-frame-offset-read",
    va: 0x004a7758,
    bytes: "8b 0c 85 48 43 c8 00",
  },
  {
    id: "speaker-lookup-count",
    va: 0x004a88b8,
    bytes: "66 83 ff 11",
  },
  {
    id: "speaker-lookup-failure",
    va: 0x004a88d5,
    bytes: "66 0d ff ff",
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const report = extractMissionPortraitMapping(options);
  console.log(JSON.stringify(report, null, 2));
}

export function extractMissionPortraitMapping({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  heroSpritePath = DEFAULT_HERO_SPRITE_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(
    executableSha256,
    EXPECTED_IMJINROK_EXE_SHA256,
    "original executable SHA-256",
  );

  const heroSpriteBuffer = readFileSync(heroSpritePath);
  const heroSpriteSha256 = sha256(heroSpriteBuffer);
  assertEqual(
    heroSpriteSha256,
    EXPECTED_HERO_SPRITE_SHA256,
    "hero sprite SHA-256",
  );
  const heroSpriteHeader = parseSpriteLikeHeader(heroSpriteBuffer, heroSpritePath);
  assertEqual(heroSpriteHeader.width, 130, "hero sprite width");
  assertEqual(heroSpriteHeader.height, 120, "hero sprite height");
  assertEqual(heroSpriteHeader.frameCount, 20, "hero sprite frame count");

  const resourcePath = readAsciiAtVa(buffer, image, HERO_RESOURCE_PATH_VA);
  assertEqual(resourcePath, "yfnt\\hero.spr", "hero resource path");

  const codeAnchors = CODE_ANCHORS.map((anchor) =>
    validateCodeAnchor(buffer, image, anchor),
  );
  const speakerStorage = extractSpeakerStorage(buffer, image);
  const lookupOrder = extractLookupOrder(buffer, image, speakerStorage);
  const frameIndexes = readFrameIndexes(buffer, image);
  const entries = lookupOrder.map((speaker, lookupIndex) => {
    const frameIndex = frameIndexes[lookupIndex];
    if (frameIndex < 0 || frameIndex >= heroSpriteHeader.frameCount) {
      throw new Error(
        `speaker ${speaker.speakerId} references hero frame ${frameIndex}, outside 0..${heroSpriteHeader.frameCount - 1}`,
      );
    }

    return {
      speakerId: speaker.speakerId,
      lookupIndex,
      frameIndex,
      assetFileName: `hero_${String(frameIndex).padStart(4, "0")}.png`,
      sourceIdAddress: speaker.sourceIdAddress,
      runtimeStorageAddress: speaker.runtimeStorageAddress,
      lookupPointerAddress: toHex(
        SPEAKER_LOOKUP_POINTER_TABLE_VA + lookupIndex * 4,
      ),
      frameTableAddress: toHex(SPEAKER_FRAME_TABLE_VA + lookupIndex * 2),
    };
  });

  return {
    schemaVersion: 1,
    evidenceStatus: "static-proven",
    source: {
      executablePath,
      executableSha256,
      heroSpritePath,
      heroSpriteSha256,
      resourcePath,
      width: heroSpriteHeader.width,
      height: heroSpriteHeader.height,
      frameCount: heroSpriteHeader.frameCount,
    },
    lookupFailureIndex: LOOKUP_FAILURE_INDEX,
    codeAnchors,
    entries,
  };
}

function extractSpeakerStorage(buffer, image) {
  const copyStart = requireRawOffset(image, SPEAKER_COPY_FUNCTION_START_VA);
  const copyEnd = requireRawOffset(image, SPEAKER_COPY_FUNCTION_END_VA);
  let previousCopyOffset = copyStart - 1;

  return Array.from({ length: SPEAKER_COUNT }, (_value, storageIndex) => {
    const sourceIdVa = SPEAKER_SOURCE_TABLE_START_VA - storageIndex * 4;
    const speakerId = readAsciiAtVa(buffer, image, sourceIdVa);
    if (!/^(?:K(?:[1-6]|10)|J[1-5]|C[1-5])$/.test(speakerId)) {
      throw new Error(
        `unexpected speaker ID ${JSON.stringify(speakerId)} at ${toHex(sourceIdVa)}`,
      );
    }

    const copyInstruction = Buffer.alloc(5);
    copyInstruction[0] = 0xbf;
    copyInstruction.writeUInt32LE(sourceIdVa, 1);
    const copyOffset = buffer.indexOf(
      copyInstruction,
      Math.max(copyStart, previousCopyOffset + 1),
    );
    if (copyOffset < 0 || copyOffset >= copyEnd) {
      throw new Error(
        `speaker ID copy for ${speakerId} was not found in ${toHex(SPEAKER_COPY_FUNCTION_START_VA)}`,
      );
    }
    previousCopyOffset = copyOffset;

    const nextStorageOffset =
      SPEAKER_RUNTIME_STORAGE_OFFSET +
      (storageIndex + 1) * SPEAKER_RUNTIME_STORAGE_STRIDE;
    const nextStorageInstruction = Buffer.alloc(6);
    nextStorageInstruction.set([0x8d, 0x9a]);
    nextStorageInstruction.writeUInt32LE(nextStorageOffset, 2);
    const nextStorageInstructionOffset = buffer.indexOf(
      nextStorageInstruction,
      copyOffset + copyInstruction.length,
    );
    if (
      nextStorageInstructionOffset < 0 ||
      nextStorageInstructionOffset >= copyOffset + 96
    ) {
      throw new Error(
        `next speaker storage slot after ${speakerId} was not found near ${toHex(image.rawOffsetToVa(copyOffset))}`,
      );
    }

    return {
      speakerId,
      sourceIdAddress: toHex(sourceIdVa),
      runtimeStorageAddress: toHex(
        SPEAKER_RUNTIME_STRUCTURE_BASE +
          SPEAKER_RUNTIME_STORAGE_OFFSET +
          storageIndex * SPEAKER_RUNTIME_STORAGE_STRIDE,
      ),
      copyInstructionAddress: toHex(image.rawOffsetToVa(copyOffset)),
    };
  });
}

function extractLookupOrder(buffer, image, speakerStorage) {
  const storageByAddress = new Map(
    speakerStorage.map((speaker) => [
      Number.parseInt(speaker.runtimeStorageAddress.slice(2), 16),
      speaker,
    ]),
  );
  const initializerOffset = requireRawOffset(
    image,
    SPEAKER_LOOKUP_POINTER_INITIALIZER_VA,
  );

  return Array.from({ length: SPEAKER_COUNT }, (_value, lookupIndex) => {
    const instructionOffset = initializerOffset + lookupIndex * 10;
    assertBytes(
      buffer.subarray(instructionOffset, instructionOffset + 2),
      Buffer.from([0xc7, 0x05]),
      `lookup pointer initializer ${lookupIndex} opcode`,
    );
    assertEqual(
      buffer.readUInt32LE(instructionOffset + 2),
      SPEAKER_LOOKUP_POINTER_TABLE_VA + lookupIndex * 4,
      `lookup pointer initializer ${lookupIndex} destination`,
    );

    const runtimeStorageAddress = buffer.readUInt32LE(instructionOffset + 6);
    const speaker = storageByAddress.get(runtimeStorageAddress);
    if (!speaker) {
      throw new Error(
        `lookup pointer ${lookupIndex} references unknown storage ${toHex(runtimeStorageAddress)}`,
      );
    }
    return speaker;
  });
}

function readFrameIndexes(buffer, image) {
  const tableOffset = requireRawOffset(image, SPEAKER_FRAME_TABLE_VA);
  return Array.from({ length: SPEAKER_COUNT }, (_value, index) =>
    buffer.readInt16LE(tableOffset + index * 2),
  );
}

function validateCodeAnchor(buffer, image, anchor) {
  const expectedBytes = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const offset = requireRawOffset(image, anchor.va);
  const actualBytes = buffer.subarray(offset, offset + expectedBytes.length);
  assertBytes(actualBytes, expectedBytes, `${anchor.id} at ${toHex(anchor.va)}`);

  return {
    id: anchor.id,
    address: toHex(anchor.va),
    bytes: formatBytes(actualBytes),
  };
}

function readAsciiAtVa(buffer, image, va) {
  return readCString(buffer, requireRawOffset(image, va));
}

function requireRawOffset(image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new Error(`${toHex(va)} is outside the executable image`);
  }
  return offset;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

function assertBytes(actual, expected, label) {
  if (!actual.equals(expected)) {
    throw new Error(
      `${label} mismatch: expected ${formatBytes(expected)}, received ${formatBytes(actual)}`,
    );
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function formatBytes(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") {
      options.executablePath = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--hero-sprite") {
      options.heroSpritePath = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--json") {
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}
