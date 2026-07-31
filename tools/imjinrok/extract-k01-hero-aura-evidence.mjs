#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

const EXPECTED_EXE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const EXPECTED_EVENT_MARK_SHA256 = "30bcdcc2236fe88b28be0321ba826543ce0fc313982f5d52c6e8cfb039535ee3";

const ANCHORS = [
  { id: "class-76-type-call", va: 0x0045d98e, bytes: "68 99 00 00 00 b9 a0 90 88 00 e8 63 e3 ff ff" },
  { id: "class-78-type-call", va: 0x0045da97, bytes: "68 9e 00 00 00 b9 38 93 88 00 e8 5a e2 ff ff" },
  { id: "eventmark-resource-pointer", va: 0x004bc214, bytes: "98 d2 4b 00" },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = readOutputPath(process.argv.slice(2));
  const report = extractK01HeroAuraEvidence();
  if (outputPath) {
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

/**
 * A deliberately negative evidence extractor. It fixes the exact inputs and
 * candidate facts needed for a future full data/control-flow recovery, while
 * refusing to turn an observed mark or resource-table presence into aura
 * mechanics or compositor evidence.
 */
export function extractK01HeroAuraEvidence({
  executablePath = "original/imjinrok2/imjinrok2.exe",
  eventMarkPath = "original/imjinrok2/fnt/eventmark.spr",
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXE_SHA256, `${executablePath} SHA-256`);
  const eventMark = readFileSync(eventMarkPath);
  const eventMarkSha256 = sha256(eventMark);
  assertEqual(eventMarkSha256, EXPECTED_EVENT_MARK_SHA256, `${eventMarkPath} SHA-256`);

  return {
    schemaVersion: 1,
    evidenceStatus: "unverified-k01-hero-aura",
    question: "For K01 class 76 Gwon Yul and class 78 Ryu Seong-ryong, what exact nearby-ally aura, if any, changes which stat fields, and what source resource/frame/compositor draws the recipient mark?",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      eventMark: { path: eventMarkPath, sha256: eventMarkSha256 },
    },
    confirmedInputs: {
      heroTypeRecords: [
        { internalClass: 76, originalGameplayName: "조선 권율", typeRecord: "0x008890a0", initializerCall: "0x0045d998" },
        { internalClass: 78, originalGameplayName: "조선 유성룡", typeRecord: "0x00889338", initializerCall: "0x0045daa1" },
      ],
      resourceCandidate: {
        sourcePath: "fnt\\eventmark.spr",
        resourcePointerTableEntry: "0x004bc214",
        spriteSlot: 96,
      },
    },
    codeAnchors: ANCHORS.map((anchor) => validateAnchor(buffer, image, anchor)),
    unresolvedScope: [
      "No complete producer-to-recipient control-flow path has been recovered for class 76 or 78.",
      "Affected ally/type gates, radius metric/boundary, stat fields, modifier arithmetic, update/removal timing, and overlap/tie behavior are unverified.",
      "The eventmark resource-table entry does not prove that it is the observed aura mark, nor any frame, placement, fog, or compositor gate.",
      "No K01 aura profile or source sprite conversion is authorized by this evidence.",
    ],
  };
}

function validateAnchor(buffer, image, anchor) {
  const offset = image.vaToRawOffset(anchor.va);
  if (offset === undefined) throw new Error(`${toHex(anchor.va)} is not backed by the PE image`);
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(offset, offset + expected.length);
  if (Buffer.compare(actual, expected) !== 0) {
    throw new Error(`Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}`);
  }
  return { id: anchor.id, va: toHex(anchor.va), expectedBytes: anchor.bytes, matched: true };
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

function readOutputPath(argv) {
  if (argv.length === 0) return undefined;
  if (argv.length === 2 && argv[0] === "--output" && argv[1]) return argv[1];
  throw new Error("Usage: extract-k01-hero-aura-evidence.mjs [--output <path>]");
}
