#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { extractK01FinalResultTransition } from "./extract-k01-final-result-transition.mjs";
import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

export const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SPRITE_SHA256 = Object.freeze({
  win: "045b64ce026386413098f339681e8ac859e641c2e28d86d6dc2a25e4fa84851e",
  lose: "94a33a66783eaa9ab4f458542707cc5fa81ea29c0057eabb3a659fdc39d78ad7",
});
export const RESULT_PHASE_COUNT = 21;
export const RESULT_BANK = 0;

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_PATHS = Object.freeze({
  executablePath: resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
  seedsPath: resolve(repositoryRoot, "analysis/generated/imjinrok2/seeds.json"),
  functionsPath: resolve(repositoryRoot, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(repositoryRoot, "analysis/generated/imjinrok2/references.json"),
  stringsPath: resolve(repositoryRoot, "analysis/generated/imjinrok2/strings.json"),
  jumpTablesPath: resolve(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json"),
  winLogoPath: resolve(repositoryRoot, "original/imjinrok2/yfnt/winlogo.spr"),
  loseLogoPath: resolve(repositoryRoot, "original/imjinrok2/yfnt/loselogo.spr"),
  winAudioPath: resolve(repositoryRoot, "original/imjinrok2/music/win.YAV"),
  loseAudioPath: resolve(repositoryRoot, "original/imjinrok2/music/lose.YAV"),
});

const FUNCTION_CONTRACTS = Object.freeze([
  {
    entry: "0x004434a0",
    name: "FUN_004434a0",
    nameSource: "DEFAULT",
    prototype: "undefined FUN_004434a0()",
    callingConvention: "unknown",
    returnType: "undefined",
    parameterCount: 0,
    external: false,
    thunk: false,
    bodySize: 223,
    instructionCount: 77,
    instructionSha256:
      "3f38878b35ed942a336b2c68705c6adb90084f6702e5bdd46a68fffaad6cb308",
    bodyRanges: ["0x004434a0-0x0044357e"],
    callers: [
      "0x00409fc0", "0x00412e40", "0x0043e550", "0x0043e920",
      "0x0043fcd0", "0x00443160", "0x00443360", "0x00449320",
      "0x004499b0", "0x0045f9c0", "0x00480180", "0x00480c60",
      "0x00482fc0", "0x00483e40", "0x00485c40", "0x004868a0",
      "0x004932f0", "0x00493900", "0x004945c0", "0x00494b80",
      "0x00494ed0", "0x00497ff0", "0x00498430", "0x004a3840",
      "0x004a5730", "0x004a5d90", "0x004a63b0", "0x004a6850",
      "0x004a7410", "0x004a9410", "0x004aa0f0", "0x004aafa0",
      "0x004ac5f0",
    ],
    callees: [
      "0x0044b040", "0x004ad725", "0x004ad7cd", "0x004adcb6",
      "0x004adf44", "0x004ae02c",
    ],
  },
  {
    entry: "0x00450c10",
    name: "FUN_00450c10",
    nameSource: "DEFAULT",
    prototype: "undefined FUN_00450c10()",
    callingConvention: "unknown",
    returnType: "undefined",
    parameterCount: 0,
    external: false,
    thunk: false,
    bodySize: 323,
    instructionCount: 111,
    instructionSha256:
      "cbf4d4f73d352a8f7f967de454b924dd4526ce16aabc1ec62a82c38bbddf4ffe",
    bodyRanges: ["0x00450c10-0x00450d52"],
    callers: [
      "0x0041fbc0", "0x0041fc20", "0x0041fcc0", "0x00420d70",
      "0x00420f80", "0x004211a0", "0x00421c50", "0x0046fd40",
      "0x0046feb0", "0x00470920", "0x0047fbe0", "0x00493400",
      "0x004958b0", "0x004a6ac0", "0x004abf40",
    ],
    callees: [],
  },
]);

const RAW_CODE_RANGES = [
  ["result-logo-record-loader", 0x004434a0, 0x0044357f, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["result-logo-frame-blitter", 0x00450c10, 0x00450d53, "256dd0a7a478c26d5ccc1acde2d9a4d28f4e933fbb3b00d92901bbb81505e759"],
  ["result-logo-poll", 0x00493400, 0x00493535, "21c1682f8496ba52ea9b96a40bf621543c50d0a5978ccccd9436fee878477160"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const EVIDENCE_POINTS = [
  [0x0044351e, "68 f4 0b 00 00 57 e8 1b aa 06 00", "loader copies the 0xbf4-byte SPR header into the selected record"],
  [0x00443529, "8b 97 c8 0b 00 00", "loader reads the source payload length from record offset 0xbc8"],
  [0x00443538, "89 87 f4 0b 00 00", "loader stores the allocated payload pointer at record offset 0xbf4"],
  [0x0049348a, "0f bf 81 e8 88 4c 00", "poll reads the signed bank from the 21-pair table"],
  [0x00493491, "0f bf 89 ea 88 4c 00", "poll reads the signed frame from the 21-pair table"],
  [0x004934ab, "8b 04 8d 70 a0 c7 00", "poll reads the offset-table DWORD at 0x00c7a070 + index*4"],
  [0x004934b2, "8b 0c d5 a4 a7 c7 00", "poll reads the payload pointer at 0x00c7a7a4 + bankStride*8"],
  [0x004934bf, "03 c1", "poll adds the source-relative offset to the payload pointer"],
  [0x004934d7, "e8 34 d7 fb ff", "poll passes the selected payload address to FUN_00450c10"],
  [0x00450cf9, "8a 1c 2e", "blitter reads compressed payload bytes"],
  [0x00450cfc, "80 fb fe", "blitter treats 0xfe as the transparent run marker"],
  [0x00450d24, "88 1c 02", "blitter writes literal payload bytes without frame remapping"],
  [0x00450d50, "c2 14 00", "blitter returns with the five-argument stack frame"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const QUESTION =
  "Which exact raw result phase pairs select the win/loss SPR payload frames, and what source-relative payload bytes does the original poll pass to the raw blitter?";

export function mapK01ResultPhaseToSprFrame({ variant, phase }) {
  assertVariant(variant);
  assertPhase(phase);

  const bank = RESULT_BANK;
  const frame = phase;
  const bankStride = (((3 * bank) << 7) - bank) | 0;
  const offsetTableIndex = (frame + bankStride * 2) | 0;
  return {
    variant,
    phase,
    bank,
    frame,
    bankStride,
    offsetTableIndex,
    offsetTableAddress: 0x00c7a070 + offsetTableIndex * 4,
    payloadPointerAddress: 0x00c7a7a4 + bankStride * 8,
    recordHeaderOffset: bank * 0x0bf8 + 0x04c0 + frame * 4,
    recordPayloadOffset: bank * 0x0bf8 + 0x0bf4,
  };
}

export function extractK01ResultLogoMapping(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const finalResult = extractK01FinalResultTransition({
    input: paths.executablePath,
    seeds: paths.seedsPath,
    functions: paths.functionsPath,
    references: paths.referencesPath,
    strings: paths.stringsPath,
    jumpTables: paths.jumpTablesPath,
    winLogo: paths.winLogoPath,
    loseLogo: paths.loseLogoPath,
    winAudio: paths.winAudioPath,
    loseAudio: paths.loseAudioPath,
  });
  const { buffer: executable, image } = readPeImage(paths.executablePath);
  assertEqual(sha256(executable), EXPECTED_EXE_SHA256, "original executable SHA-256");

  const functions = readJson(paths.functionsPath);
  assertEqual(functions.sourceSha256, EXPECTED_EXE_SHA256, "functions.json source SHA-256");
  const functionEvidence = FUNCTION_CONTRACTS.map((expected) =>
    verifyFunctionMetadata(functions.functions, expected),
  );
  const rawCodeRanges = RAW_CODE_RANGES.map((range) =>
    verifyRawCodeRange(executable, image, range),
  );
  const evidencePoints = EVIDENCE_POINTS.map((point) =>
    verifyEvidencePoint(executable, image, point),
  );

  const sourceVariants = {
    win: readLogoSource(paths.winLogoPath, "win"),
    lose: readLogoSource(paths.loseLogoPath, "lose"),
  };
  const variants = Object.fromEntries(
    Object.entries(sourceVariants).map(([variant, source]) => [
      variant,
      mapVariantFrames(variant, source),
    ]),
  );

  return {
    question: QUESTION,
    analysisStatus: "static-confirmed-for-raw-result-phase-to-spr-payload-selection",
    reproductionStatus: "reproduction-complete-for-supported-win-loss-phases-0-through-20",
    implementationStatus: "analysis-only-no-production-change",
    source: { path: repositoryRelative(paths.executablePath), sha256: EXPECTED_EXE_SHA256 },
    inputHashes: hashInputs(paths),
    reusedEvidence: {
      finalResult: {
        analysisStatus: finalResult.evidenceStatus,
        reproductionStatus: finalResult.reproductionStatus,
        phaseTable: finalResult.phaseTable,
        sources: {
          winLogo: normalizeSource(finalResult.sources.winLogo),
          loseLogo: normalizeSource(finalResult.sources.loseLogo),
        },
      },
    },
    functionEvidence,
    rawCodeRanges,
    evidencePoints,
    addressFormula: {
      bankStride: "((3 * bank) << 7) - bank = 383 * bank (x86 signed arithmetic)",
      tableIndex: "frame + 2 * bankStride = frame + 766 * bank",
      offsetRead: "DWORD[0x00c7a070 + 4 * tableIndex]",
      payloadPointerRead: "DWORD[0x00c7a7a4 + 8 * bankStride]",
      payloadAddress: "payloadPointer + sourceHeaderOffset[tableIndex]",
      sourceRecordHeader: "recordBase + bank * 0x0bf8 + 0x4c0 + frame * 4",
      sourceRecordPayload: "recordBase + bank * 0x0bf8 + 0xbf4",
      reachablePairs: "[0, phase] for phase 0..20; the 28-frame header does not expand this set",
    },
    variants,
    unresolved: [
      "The mapping proves compressed payload selection and the raw blitter's byte/RLE path only.",
      "Full clipped pixel output, palette realization, surface compositor, and presentation identity remain outside this evidence unit.",
      "No production result-state or presentation policy is changed by this extractor.",
    ],
  };
}

function readLogoSource(path, variant) {
  const bytes = readFileSync(path);
  assertEqual(sha256(bytes), EXPECTED_SPRITE_SHA256[variant], `${variant} logo SHA-256`);
  const header = parseSpriteLikeHeader(bytes, path);
  assertEqual(header.width, 250, `${variant} logo width`);
  assertEqual(header.height, 100, `${variant} logo height`);
  assertEqual(header.frameCount, 28, `${variant} logo frame count`);
  return { path, bytes, header, sha256: EXPECTED_SPRITE_SHA256[variant] };
}

function mapVariantFrames(variant, source) {
  const frames = [];
  for (let phase = 0; phase < RESULT_PHASE_COUNT; phase += 1) {
    const mapping = mapK01ResultPhaseToSprFrame({ variant, phase });
    const frame = source.header.frames[mapping.frame];
    if (!frame) throw new Error(`Mapped ${variant} phase ${phase} to absent SPR frame ${mapping.frame}`);
    const payload = source.bytes.subarray(frame.dataOffset, frame.dataOffset + frame.size);
    frames.push({
      phase,
      bank: mapping.bank,
      frame: mapping.frame,
      bankStride: mapping.bankStride,
      offsetTableIndex: mapping.offsetTableIndex,
      offsetTableAddress: toAddress(mapping.offsetTableAddress),
      payloadPointerAddress: toAddress(mapping.payloadPointerAddress),
      recordHeaderOffset: toAddress(mapping.recordHeaderOffset),
      recordPayloadOffset: toAddress(mapping.recordPayloadOffset),
      sourceRelativeOffset: frame.relativeOffset,
      sourceDataOffset: frame.dataOffset,
      compressedPayloadSize: frame.size,
      compressedPayloadSha256: sha256(payload),
    });
  }
  return {
    source: {
      path: repositoryRelative(source.path),
      sha256: source.sha256,
      width: source.header.width,
      height: source.header.height,
      frameCount: source.header.frameCount,
      endOffset: source.header.endOffset,
    },
    mappedPhaseCount: frames.length,
    frames,
  };
}

function verifyFunctionMetadata(records, expected) {
  const actual = records?.find(({ entry }) => entry === expected.entry);
  if (!actual) throw new Error(`functions.json is missing ${expected.entry}`);
  for (const key of [
    "entry", "name", "nameSource", "prototype", "callingConvention",
    "returnType", "parameterCount", "external", "thunk", "bodySize",
    "instructionCount", "instructionSha256",
  ]) {
    assertEqual(actual[key], expected[key], `${expected.entry} ${key}`);
  }
  assertDeepEqual(actual.bodyRanges, expected.bodyRanges, `${expected.entry} bodyRanges`);
  assertDeepEqual(actual.callers, expected.callers, `${expected.entry} callers`);
  assertDeepEqual(actual.callees, expected.callees, `${expected.entry} callees`);
  return expected;
}

function hashInputs(paths) {
  const entries = {
    executable: paths.executablePath,
    seeds: paths.seedsPath,
    functions: paths.functionsPath,
    references: paths.referencesPath,
    strings: paths.stringsPath,
    jumpTables: paths.jumpTablesPath,
    winLogo: paths.winLogoPath,
    loseLogo: paths.loseLogoPath,
    winAudio: paths.winAudioPath,
    loseAudio: paths.loseAudioPath,
  };
  return Object.fromEntries(
    Object.entries(entries).map(([id, path]) => [id, { path: relative(repositoryRoot, path), sha256: sha256(readFileSync(path)) }]),
  );
}

function assertVariant(value) {
  if (value !== "win" && value !== "lose") {
    throw new RangeError(`variant must be one of win or lose, got ${String(value)}`);
  }
}

function normalizeSource(source) {
  return { ...source, path: repositoryRelative(source.path) };
}

function repositoryRelative(path) {
  return relative(repositoryRoot, resolve(path));
}

function assertPhase(value) {
  if (!Number.isInteger(value) || value < 0 || value >= RESULT_PHASE_COUNT) {
    throw new RangeError(`phase must be an integer in 0..20, got ${String(value)}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function toAddress(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

function main() {
  const outputIndex = process.argv.indexOf("--output");
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  const report = extractK01ResultLogoMapping();
  if (outputPath) {
    const fixture = {
      schemaVersion: 1,
      generatedBy: "tools/imjinrok/extract-k01-result-logo-mapping.mjs",
      command: "node tools/imjinrok/extract-k01-result-logo-mapping.mjs --output analysis/fixtures/k01-result-logo-mapping.json",
      sourceExecutableSha256: report.source.sha256,
      inputHashes: report.inputHashes,
      analysisStatus: report.analysisStatus,
      reproductionStatus: report.reproductionStatus,
      functionEvidence: report.functionEvidence,
      rawCodeRanges: report.rawCodeRanges,
      evidencePoints: report.evidencePoints,
      addressFormula: report.addressFormula,
      variants: report.variants,
    };
    writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
    return;
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
