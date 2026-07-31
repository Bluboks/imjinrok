#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_IMJINROK_EXE_SHA256 } from "./validate-static-analysis.mjs";
import { readCString, readPeImage } from "./pe-image.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const COMMON_MESSAGE = {
  path: "tempeft/trainspotdonemessage.YAV",
  sha256: "9bdca60d29bbf3514917ba721273829dd72f5b1b2419047400c9f2081284c7f6",
  stringVa: 0x004c1abc,
  loaderCallVa: 0x00471df0,
  loaderSlot: 0x00c4b620,
};

const TRAIN_CANDIDATES = [
  ["train1k1.YAV", "68c0ae859126113008b4137f49c8f57cf7371fcc0ea10c8ad304d62da0e3deb0", 0x004c4ce0],
  ["train2k1.YAV", "b7111aa851dddf3befaab3a3a03a8b52b55a3bfa8a4a4cd7d2264ff6efa99a2d", 0x004c4da4],
  ["train3k1.YAV", "a1ee43f57863c5c223048aab9d7476c22514984b4764fd7258d5eb69202cd1bb", 0x004c4e68],
  ["train4k1.YAV", "6f76212d0f7abefaf5a1847f2ed2367b4a1f3473abc7fe65fceb63337fd8f01b", 0x004c4f2c],
  ["train5k1.YAV", "ded200a7b3aca7e1efec3bb63f41fb33671f9005932605905cea49bef16736a3", 0x004c4ff0],
  ["train6k1.YAV", "7e62d8b8b47b2f87623d91c1792a07a2b4565b2dd828c30c146604690c9ff0ea", 0x004c50b4],
  ["train1j1.YAV", "ac8875dea7dc159c44dd9f1e61bbb29051d72004c8e1f079bb606b89e24a5f6f", 0x004c5178],
  ["train2j1.YAV", "977c7b9348f36af91b16638935eb7b11e976419a0df3525ac0f26386b3bd9945", 0x004c523c],
  ["train3j1.YAV", "10d8c22e869c6939046707d1f8a216d69b283e731e3dd319fb295102f894aabb", 0x004c5300],
  ["train4j1.YAV", "27854a17bed948fba558ef9f9301d0b62c6d501d7b79d311b3ca82d2c4008088", 0x004c53c4],
  ["train5j1.YAV", "86baec161962073c99a1639f260c0cba2cc1d3b4ef0f1ba4f487c5eac63e3d3a", 0x004c5488],
  ["train1c1.YAV", "0ae8bf7408a8c934b67738fb9bc82f322f06e83e313a40f220125d9f742fd367", 0x004c554c],
  ["train2c1.YAV", "5a3a7bea4186b53b68adccac0d57a5f4073bf4ca3784d0bccc5cd96d3d4aebe6", 0x004c5610],
  ["train3c1.YAV", "8ad9f257919f2aab97194f464593faa738823c81579060d75b5b69fadda5581d", 0x004c56d4],
  ["train4c1.YAV", "e04c016f8dda3ad9104bdac9b836caca780f2b906281f8a1e1efbb0c5ef96383", 0x004c5798],
  ["train5c1.YAV", "35039dfc44329d589d68d1e83afa9a2612063d1c30d1aa45f996cca69c9dfc6c", 0x004c585c],
].map(([fileName, sha256, stringVa]) => ({ fileName, path: `gamejvi/${fileName}`, sha256, stringVa }));

export function extractUnitProductionAudioPolicy({
  executable = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
  resourceDirectory = resolve(repositoryRoot, "original/imjinrok2"),
} = {}) {
  const { buffer, image } = readPeImage(executable);
  assertEqual(sha256(buffer), EXPECTED_IMJINROK_EXE_SHA256, `EXE SHA-256 for ${executable}`);
  assertCString(image, buffer, COMMON_MESSAGE.stringVa, toOriginalPath(COMMON_MESSAGE.path));
  assertBytes(image, buffer, COMMON_MESSAGE.loaderCallVa, [0x68, 0xbc, 0x1a, 0x4c, 0x00, 0x6a, 0x01, 0x6a, 0x00, 0x6a, 0x00, 0xb9, 0x20, 0xb6, 0xc4, 0x00, 0xe8, 0x1b, 0xf1, 0xff, 0xff]);
  assertHash(resolve(resourceDirectory, COMMON_MESSAGE.path), COMMON_MESSAGE.sha256);

  const trainCandidates = TRAIN_CANDIDATES.map((candidate) => {
    assertCString(image, buffer, candidate.stringVa, toOriginalPath(candidate.path));
    assertHash(resolve(resourceDirectory, candidate.path), candidate.sha256);
    return { ...candidate, stringVa: toHex(candidate.stringVa) };
  });

  return {
    schemaVersion: 1,
    question: "Does the original EXE bind the common trainspot message or gamejvi train families to a K01 hero production-complete event?",
    statuses: {
      analysis: "hypothesis-resource-initialization-confirmed-event-binding-unresolved",
      reproduction: "complete-for-resource-and-loader-input-vectors-only",
      implementation: "product-policy-default-silent-explicit-opt-in-only",
    },
    source: {
      executable: { path: executable, sha256: EXPECTED_IMJINROK_EXE_SHA256 },
      commonMessage: { ...COMMON_MESSAGE, stringVa: toHex(COMMON_MESSAGE.stringVa), loaderCallVa: toHex(COMMON_MESSAGE.loaderCallVa), loaderSlot: toHex(COMMON_MESSAGE.loaderSlot) },
      trainCandidates,
    },
    staticFinding: "0x004714d0 initializes the common message resource in a distinct loader slot. The listed gamejvi train strings and files are a separate resource family, but this bounded scan does not prove any class/event consumer for either family.",
    rejectedInference: "Neither filename family is a K01 hero identity or production-complete scheduling binding.",
    unresolved: ["The call site that plays the common trainspot resource.", "The consumers of each gamejvi train entry.", "Any exact class-76/class-78 or project-kind production-complete mapping."],
  };
}

function assertCString(image, buffer, va, expected) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) throw new Error(`VA ${toHex(va)} is outside the PE image`);
  assertEqual(readCString(buffer, offset), expected, `string at ${toHex(va)}`);
}

function assertBytes(image, buffer, va, expected) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) throw new Error(`VA ${toHex(va)} is outside the PE image`);
  assertEqual(JSON.stringify([...buffer.subarray(offset, offset + expected.length)]), JSON.stringify(expected), `bytes at ${toHex(va)}`);
}

function assertHash(path, expected) {
  assertEqual(sha256(readFileSync(path)), expected, `SHA-256 for ${path}`);
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function toHex(value) { return `0x${value.toString(16).padStart(8, "0")}`; }
function toOriginalPath(path) { return path.toLowerCase().replaceAll("/", "\\"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractUnitProductionAudioPolicy(), null, 2));
}
