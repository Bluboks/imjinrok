#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, parsePeImage, toHex } from "./pe-image.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULTS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  fixturePath: resolve(ROOT, "analysis/fixtures/source-building-placement-evidence.json"),
  profilesPath: resolve(ROOT, "analysis/generated/original-entity-visual-profiles.json"),
};
const CANONICAL = {
  executablePath: "original/imjinrok2/imjinrok2.exe",
  functionsPath: "analysis/generated/imjinrok2/functions.json",
  referencesPath: "analysis/generated/imjinrok2/references.json",
  fixturePath: "analysis/fixtures/source-building-placement-evidence.json",
  profilesPath: "analysis/generated/original-entity-visual-profiles.json",
};

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const EXPECTED_FUNCTIONS_SHA256 = "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

const FUNCTIONS = [
  [0x0041fdb0, "0x0041fdb0-0x00420839", 2698, 771, "f2532e10676a6484a2db46fa55b95b14b6a00b04fdf9064ed255cb896a81cbfb", "15d55f819b04e813e4695190801e1ed33774f071ed62ecd5b83281fa9d4e032a"],
  [0x00421c50, "0x00421c50-0x00423026", 5079, 1451, "c85adf3a77e7bd68aba58c1277bd31020edf4384e80941314e0a212c2f8bfbf2", "b7ee83e3f8b1206e509046d725e16f85050aaa3948adaa7c4f3d6ab01e85e9cd"],
  [0x00438930, "0x00438930-0x00438a90", 353, 102, "f095a81e19b441510427bb0a92e1dfced95b902cac97e1efc5f58ce6b6017216", "db1e30ca6b2421fa492e8f3410bda10155f28270c973fda5c687f6f598e68de7"],
  [0x00438aa0, "0x00438aa0-0x00438be8", 329, 90, "993f78a2f9e0a444e1c698e3c980d035390156f39f60501914135fc3aa51661d", "0328533aa4b2015b46c698eddde5e61cea899186f861c652f2517203d81b48d9"],
  [0x00465010, "0x00465010-0x004650c7", 184, 57, "d857a8ff4bc383cdfd3450d9204d085536adf6f28f14b73089d33afbb6e796ee", "e3753b8d4fe4b494d0223960dba3ccf9ad1b990b2f8bd4d5722e8ee72ee8af88"],
];

const CALL_EDGES = [
  [0x00420764, 0x0041fdb0, 0x00421c50],
  [0x004389c4, 0x00438930, 0x00465010],
  [0x00438a2a, 0x00438930, 0x00465010],
];

const OPCODE_ANCHORS = [
  [0x00438939, "8a 8e e3 01 00 00", "FUN_00438930 reads signed runtime footprint width BYTE entity +0x1e3"],
  [0x0043895d, "8a 8e e4 01 00 00", "FUN_00438930 reads signed runtime footprint height BYTE entity +0x1e4"],
  [0x00438990, "66 8b 88 bc c0 88 00 66 89 8e da 01 00 00 66 8b 80 c0 c0 88 00 66 89 86 dc 01 00 00", "FUN_00438930 copies signed SPR pixel dimensions from slot table into runtime +0x1da/+0x1dc"],
  [0x00438a2f, "0f bf 86 da 01 00 00", "FUN_00438930 consumes runtime signed pixel width +0x1da for the valid local pivot"],
  [0x00438a66, "66 8b 14 85 1c 2e 88 00", "FUN_00438930 loads signed type render offset table entry before top-Y adjustment"],
  [0x00438aa1, "8a 99 e3 01 00 00", "FUN_00438aa0 reads signed runtime footprint width BYTE entity +0x1e3"],
  [0x00438abe, "8a 99 e4 01 00 00", "FUN_00438aa0 reads signed runtime footprint height BYTE entity +0x1e4"],
  [0x00438af2, "66 8b 90 bc c0 88 00 66 89 91 da 01 00 00 66 8b 80 c0 c0 88 00 66 89 81 dc 01 00 00", "FUN_00438aa0 copies signed SPR pixel dimensions from slot table into runtime +0x1da/+0x1dc"],
  [0x00438b31, "66 8b 96 84 39 84 00 66 8b be c4 33 86 00", "FUN_00438aa0 reads cached projection words at 0x843984/0x8633c4 using far occupied cell"],
  [0x0041fdb0, "83 ec 0c 56 8b f1 8a 46 01 84 c0 75 07", "FUN_0041fdb0 entity draw consumer begins in the bounded source renderer"],
  [0x00421c50, "83 ec 14 53 55 56 8b f1", "FUN_00421c50 building draw consumer begins in the bounded source renderer"],
];

export function replaySourceBuildingPlacement(vector) {
  if (vector?.operation !== "place") throw new Error(`unsupported vector operation ${vector?.operation}`);
  const input = vector.input ?? {};
  validateSignedWord(input.x, "x");
  validateSignedWord(input.y, "y");
  validateExtent(input.width, "width");
  validateExtent(input.height, "height");
  validatePositiveSignedWord(input.pixelWidth, "pixelWidth");
  validatePositiveSignedWord(input.pixelHeight, "pixelHeight");
  validateSignedWord(input.runtimeOffsetX, "runtimeOffsetX");
  validateSignedWord(input.runtimeOffsetY, "runtimeOffsetY");
  validateSignedByte(input.signedByte16, "signedByte16");
  validateSignedWord(input.typeOffset, "typeOffset");
  if (!Number.isInteger(input.flags) || input.flags < 0 || input.flags > 0xffff) throw new RangeError("flags must be an unsigned WORD");

  const farCell = {
    x: input.x - Math.trunc(input.width / 2) + input.width - 1,
    y: input.y - Math.trunc(input.height / 2) + input.height - 1,
  };
  validateSignedWord(farCell.x, "farCell.x");
  validateSignedWord(farCell.y, "farCell.y");

  const centeredPivot = (input.flags & 0x08) !== 0;
  const projectionPath = input.projectionPath ?? "FUN_00438930->FUN_00465010";
  if (!["FUN_00438930->FUN_00465010", "FUN_00438aa0->cached-cell-tables"].includes(projectionPath)) throw new RangeError(`unsupported projection path ${projectionPath}`);
  const projected = projectionPath === "FUN_00438aa0->cached-cell-tables"
    ? requireProjection(input.cachedProjected, "cachedProjected")
    : requireProjection(input.viewportProjected, "viewportProjected");
  const screenX = toSignedWord(projected.x + input.runtimeOffsetX - Math.trunc(input.pixelWidth / 2));
  const screenY = toSignedWord(
    centeredPivot
      ? projected.y + input.signedByte16 + input.runtimeOffsetY - Math.trunc(input.pixelHeight / 2)
      : projected.y + input.signedByte16 + input.typeOffset + input.runtimeOffsetY - input.pixelHeight,
  );

  return {
    farCell,
    footprint: { width: input.width, height: input.height },
    pixelDimensions: { width: input.pixelWidth, height: input.pixelHeight },
    runtimeFields: {
      centerX: input.x,
      centerY: input.y,
      footprintWidth: input.width,
      footprintHeight: input.height,
      pixelWidth: input.pixelWidth,
      pixelHeight: input.pixelHeight,
      runtimeOffsetX: input.runtimeOffsetX,
      runtimeOffsetY: input.runtimeOffsetY,
    },
    projected,
    pivot: centeredPivot ? "center" : "type-offset",
    output: { screenX, screenY },
    projectionPath,
  };
}

export function extractSourceBuildingPlacementEvidence(options = {}) {
  const paths = { ...DEFAULTS, ...options };
  const executable = readFileSync(paths.executablePath);
  const executableSha256 = sha256(executable);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, "original EXE SHA-256");
  const image = parsePeImage(executable, paths.executablePath);
  const functionsBuffer = readFileSync(paths.functionsPath);
  const referencesBuffer = readFileSync(paths.referencesPath);
  assertEqual(sha256(functionsBuffer), EXPECTED_FUNCTIONS_SHA256, "functions artifact SHA-256");
  assertEqual(sha256(referencesBuffer), EXPECTED_REFERENCES_SHA256, "references artifact SHA-256");
  const functions = JSON.parse(functionsBuffer.toString("utf8"));
  const references = JSON.parse(referencesBuffer.toString("utf8"));
  assertEqual(functions.sourceSha256, executableSha256, "functions source SHA-256");
  assertEqual(references.sourceSha256, executableSha256, "references source SHA-256");

  const functionEvidence = FUNCTIONS.map((specification) => verifyFunction(functions.functions, executable, image, specification));
  const callEdges = CALL_EDGES.map(([site, caller, callee]) => verifyCallEdge(references.references, site, caller, callee));
  const byteAnchors = OPCODE_ANCHORS.map(([va, bytes, meaning]) => verifyAnchor(executable, image, { va, bytes, meaning }));
  const profiles = readProfiles(paths.profilesPath, executableSha256);
  const fixture = JSON.parse(readFileSync(paths.fixturePath, "utf8"));
  assertEqual(fixture.sourceExecutableSha256, executableSha256, "fixture source EXE SHA-256");
  if (!Array.isArray(fixture.vectors) || fixture.vectors.length === 0) throw new Error("source placement vectors are required");
  const vectors = fixture.vectors.map((vector) => {
    const result = replaySourceBuildingPlacement(vector);
    assertEqual(sha256(Buffer.from(JSON.stringify(result))), vector.expectedSha256, `${vector.id} replay SHA-256`);
    if (vector.expected) assertDeepEqual(result, vector.expected, `${vector.id} expected result`);
    return { id: vector.id, operation: vector.operation, result };
  });

  return {
    schemaVersion: 1,
    question: "How does the original renderer derive a building sprite's far occupied cell and pixel placement fields?",
    analysisStatus: "static-confirmed-native-far-occupied-cell-and-pixel-dimension-sources",
    reproductionStatus: "reproduction-complete-bounded-signed-field-replay",
    implementationStatus: "product-adapter-uses-common-actual-footprint; native-cell-cache-and-native-footprint-extents-not-implemented",
    source: {
      executablePath: CANONICAL.executablePath,
      executableSha256,
      functionsPath: CANONICAL.functionsPath,
      functionsSha256: sha256(functionsBuffer),
      referencesPath: CANONICAL.referencesPath,
      referencesSha256: sha256(referencesBuffer),
      profilesPath: CANONICAL.profilesPath,
      profileSourceSprites: profiles,
    },
    functionEvidence,
    callEdges,
    byteAnchors,
    nativeFields: {
      centerCell: { x: "entity +0x1bc signed WORD", y: "entity +0x1be signed WORD" },
      footprint: { width: "entity +0x1e3 signed BYTE", height: "entity +0x1e4 signed BYTE", formula: "far = center - trunc(extent/2) + extent - 1" },
      pixelDimensions: { width: "entity +0x1da signed WORD", height: "entity +0x1dc signed WORD", source: "SPR slot table stride 0xbf8 at globals +0x88c0bc/+0x88c0c0" },
      placementOffsets: { x: "entity +0x1de signed WORD", y: "entity +0x1e0 signed WORD", signedByte16: "entity +0x16 signed BYTE", typeOffset: "type record +0x0c signed WORD" },
      output: { x: "entity +0x1d6 signed WORD", y: "entity +0x1d8 signed WORD", consumer: "FUN_0041fdb0 and FUN_00421c50" },
      projection: {
        clearFlag8: "FUN_00438930 calls FUN_00465010 with explicit camera/cached-cell projection inputs",
        setFlag8: "FUN_00438930 uses the same projected output and height/2 branch",
        cachedDirect: "FUN_00438aa0 reads 0x843984/0x8633c4 + 4*(farX*180+farY)",
        lifetime: "raw table lifetime and native table producer remain outside this bounded replay",
      },
    },
    pivotBoundary: "The existing local source-frame pivot remains valid; +0x1e3/+0x1e4 are occupied-cell extents, while source SPR header width/height and runtime +0x1da/+0x1dc are pixel dimensions.",
    vectors,
    fixture: { path: CANONICAL.fixturePath, sha256: sha256(readFileSync(paths.fixturePath)), vectorCount: fixture.vectors.length },
  };
}

function readProfiles(path, executableSha256) {
  const profileBuffer = readFileSync(path);
  const profile = JSON.parse(profileBuffer.toString("utf8"));
  if (profile.source?.executableSha256 !== executableSha256) throw new Error("profile source EXE SHA-256 mismatch");
  const sourceSprites = [48, 49, 57, 63].map((internalClass) => {
    const type = profile.types?.find((candidate) => candidate.internalClass === internalClass);
    if (!type?.sprite?.sha256 || !type.sprite.sourcePathResolved) throw new Error(`profile class ${internalClass} source sprite hash is missing`);
    const sourcePath = resolve(ROOT, "original/imjinrok2", type.sprite.sourcePathResolved);
    const sourceBytes = readFileSync(sourcePath);
    const sourceSha256 = sha256(sourceBytes);
    if (sourceSha256 !== type.sprite.sha256) throw new Error(`profile class ${internalClass} source sprite hash does not match ${sourcePath}`);
    return {
      internalClass,
      sourcePath: type.sprite.sourcePathResolved,
      sha256: sourceSha256,
      width: type.sprite.width,
      height: type.sprite.height,
    };
  });
  return { profileSha256: sha256(profileBuffer), sourceSprites };
}

function verifyFunction(functions, executable, image, [entry, bodyRange, bodySize, instructionCount, instructionSha256, rawBodySha256]) {
  const record = functions.find((candidate) => candidate.entry === toHex(entry));
  if (!record || record.bodySize !== bodySize || record.instructionCount !== instructionCount || record.instructionSha256 !== instructionSha256 || JSON.stringify(record.bodyRanges) !== JSON.stringify([bodyRange])) throw new Error(`function provenance mismatch for ${toHex(entry)}`);
  const offset = image.vaToRawOffset(entry);
  if (offset === undefined) throw new Error(`${toHex(entry)} is not file-backed`);
  assertEqual(sha256(executable.subarray(offset, offset + bodySize)), rawBodySha256, `${toHex(entry)} raw body SHA-256`);
  return { entry: toHex(entry), bodyRange, bodySize, instructionCount, instructionSha256, rawBodySha256 };
}

function verifyCallEdge(references, site, caller, callee) {
  const matches = references.filter((reference) => reference.from === toHex(site) && reference.fromFunctionEntry === toHex(caller) && reference.to === toHex(callee) && reference.type === "UNCONDITIONAL_CALL");
  if (matches.length !== 1) throw new Error(`call edge missing ${toHex(site)} -> ${toHex(callee)}`);
  return { from: toHex(site), fromFunctionEntry: toHex(caller), to: toHex(callee), type: matches[0].type };
}

function verifyAnchor(buffer, image, { va, bytes, meaning }) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) throw new Error(`anchor ${toHex(va)} is not file-backed`);
  const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex");
  if (!buffer.subarray(offset, offset + expected.length).equals(expected)) throw new Error(`byte anchor mismatch at ${toHex(va)}`);
  return { id: meaning, va: toHex(va), rawOffset: toHex(offset), bytes };
}

function requireProjection(value, name) {
  if (!value || !Number.isInteger(value.x) || !Number.isInteger(value.y)) throw new RangeError(`${name} must contain integer x/y`);
  validateSignedWord(value.x, `${name}.x`);
  validateSignedWord(value.y, `${name}.y`);
  return { x: value.x, y: value.y };
}
function validateSignedWord(value, name) { if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${name} must be a signed WORD`); }
function validatePositiveSignedWord(value, name) { validateSignedWord(value, name); if (value <= 0) throw new RangeError(`${name} must be positive`); }
function validateExtent(value, name) { if (!Number.isInteger(value) || value < 1 || value > 0x7f) throw new RangeError(`${name} must be a positive signed BYTE extent`); }
function validateSignedByte(value, name) { if (!Number.isInteger(value) || value < -0x80 || value > 0x7f) throw new RangeError(`${name} must be a signed BYTE`); }
function toSignedWord(value) { const wrapped = ((value % 0x10000) + 0x10000) % 0x10000; return wrapped >= 0x8000 ? wrapped - 0x10000 : wrapped; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }
function assertDeepEqual(actual, expected, label) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch`); }

function parseArgs(argv) {
  const options = {};
  const names = new Map([["--executable", "executablePath"], ["--functions", "functionsPath"], ["--references", "referencesPath"], ["--fixture", "fixturePath"], ["--profiles", "profilesPath"], ["--output", "outputPath"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = names.get(argv[index]);
    if (!key || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${argv[index]}`);
    options[key] = argv[++index];
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = extractSourceBuildingPlacementEvidence(parseArgs(process.argv.slice(2)));
  const outputPath = process.argv.includes("--output") ? parseArgs(process.argv.slice(2)).outputPath : null;
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
