#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readJson, sha256, verifyEvidencePoint } from "./static-evidence.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_EXECUTABLE_PATH = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const DEFAULT_CLOCK_SPRITE_PATH = resolve(repositoryRoot, "original/imjinrok2/fnt/clock.spr");
const DEFAULT_REFERENCES_PATH = resolve(repositoryRoot, "analysis/generated/imjinrok2/references.json");

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";
export const EXPECTED_CLOCK_SPRITE_SHA256 = "c142349b5aa68f3659a99b42fc9aff8ca541758f0504549b24f27a928e1a08e6";

const RESOURCE_TABLE_ENTRY_VA = 0x004bc200;
const RESOURCE_PATH_VA = 0x004bd2ec;
const RESOURCE_PATH = "fnt\\clock.spr";

export function extractSourceClockAsset({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  clockSpritePath = DEFAULT_CLOCK_SPRITE_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer: executable, image } = readPeImage(executablePath);
  assertEqual(sha256(executable), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const referencesBytes = readFileSync(referencesPath);
  assertEqual(sha256(referencesBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  const references = readJson(referencesPath);
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${referencesPath} source SHA-256`);

  const evidencePoint = verifyEvidencePoint(executable, image, {
    va: RESOURCE_TABLE_ENTRY_VA,
    bytes: "ec d2 4b 00",
    meaning: "data-table entry points at the embedded fnt\\clock.spr path",
  });
  const embeddedPath = readCString(executable, image.vaToRawOffset(RESOURCE_PATH_VA));
  assertEqual(embeddedPath, RESOURCE_PATH, "clock resource embedded path");
  const reference = references.references.find((candidate) =>
    candidate.from === toHex(RESOURCE_TABLE_ENTRY_VA)
      && candidate.to === toHex(RESOURCE_PATH_VA)
      && candidate.type === "DATA",
  );
  if (!reference) throw new Error("Missing source-clock data-table reference in the canonical reference artifact.");

  const sprite = readFileSync(clockSpritePath);
  assertEqual(sha256(sprite), EXPECTED_CLOCK_SPRITE_SHA256, `${clockSpritePath} SHA-256`);
  const header = parseSpriteLikeHeader(sprite, clockSpritePath);
  assertEqual(header.width, 32, "clock sprite width");
  assertEqual(header.height, 36, "clock sprite height");
  assertEqual(header.frameCount, 20, "clock sprite frame count");

  return {
    schemaVersion: 1,
    question: "What can static source data prove about the original fnt\\clock.spr asset without inferring a HUD clock frame or time mapping?",
    analysisStatus: "static-confirmed-for-resource-identity-and-sprite-container-only",
    reproductionStatus: "reproduction-complete-for-hash-bound-path-pointer-and-sprite-header",
    implementationStatus: "intentional-adaptation-for-web-HUD-clock; original-frame-placement-and-time-mapping-unimplemented",
    source: {
      executable: { path: repositoryPath(executablePath), sha256: EXPECTED_EXECUTABLE_SHA256 },
      references: { path: repositoryPath(referencesPath), sha256: EXPECTED_REFERENCES_SHA256 },
      resourceTableEntry: toHex(RESOURCE_TABLE_ENTRY_VA),
      resourcePathAddress: toHex(RESOURCE_PATH_VA),
      resourcePath: RESOURCE_PATH,
      clockSprite: {
        path: repositoryPath(clockSpritePath),
        sha256: EXPECTED_CLOCK_SPRITE_SHA256,
        width: header.width,
        height: header.height,
        frameCount: header.frameCount,
        frameByteSizes: header.frames.map((frame) => frame.size),
      },
    },
    evidence: { dataTablePointer: evidencePoint, reference },
    unresolved: [
      "No bounded code path from this data-table entry to a clock draw call is recovered.",
      "No clock.spr frame is assigned a face, hand, state, or time-of-day meaning.",
      "No original placement, update cadence, input behavior, or original time-to-angle mapping is established.",
    ],
  };
}

function repositoryPath(path) {
  const output = relative(repositoryRoot, path).replaceAll("\\\\", "/");
  return output.startsWith("../") ? path : output;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      args.output = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractSourceClockAsset();
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) writeFileSync(resolve(args.output), output);
  else process.stdout.write(output);
}
