import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";

import { parseSpriteLikeHeader } from "./codec.mjs";
import {
  EXPECTED_EXE_SHA256,
  EXPECTED_SPRITE_SHA256,
  extractK01ResultLogoMapping,
  mapK01ResultPhaseToSprFrame,
} from "./extract-k01-result-logo-mapping.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const fixture = JSON.parse(
  readFileSync(join(repositoryRoot, "analysis/fixtures/k01-result-logo-mapping.json"), "utf8"),
);
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const winLogoPath = join(repositoryRoot, "original/imjinrok2/yfnt/winlogo.spr");

test("binds both result variants to the exact 21 reachable SPR payloads", () => {
  const report = extractK01ResultLogoMapping();

  assert.equal(report.source.sha256, EXPECTED_EXE_SHA256);
  assert.equal(report.analysisStatus, fixture.analysisStatus);
  assert.equal(report.reproductionStatus, fixture.reproductionStatus);
  assert.deepEqual(report.functionEvidence, fixture.functionEvidence);
  assert.deepEqual(report.rawCodeRanges, fixture.rawCodeRanges);
  assert.deepEqual(report.evidencePoints, fixture.evidencePoints);
  assert.deepEqual(report.addressFormula, fixture.addressFormula);
  assert.deepEqual(report.variants, fixture.variants);

  for (const variant of ["win", "lose"]) {
    assert.equal(report.variants[variant].source.sha256, EXPECTED_SPRITE_SHA256[variant]);
    assert.equal(report.variants[variant].mappedPhaseCount, 21);
    assert.deepEqual(
      report.variants[variant].frames.map(({ phase, frame }) => [phase, frame]),
      Array.from({ length: 21 }, (_, phase) => [phase, phase]),
    );
  }
});

test("replays the independent x86 index arithmetic against codec-parsed source bytes", () => {
  for (const variant of ["win", "lose"]) {
    const sourcePath = join(
      repositoryRoot,
      variant === "win" ? "original/imjinrok2/yfnt/winlogo.spr" : "original/imjinrok2/yfnt/loselogo.spr",
    );
    const source = readFileSync(sourcePath);
    const header = parseSpriteLikeHeader(source, sourcePath);
    for (const expected of fixture.variants[variant].frames) {
      const mapping = mapK01ResultPhaseToSprFrame({ variant, phase: expected.phase });
      assert.equal(mapping.bankStride, (((3 * mapping.bank) << 7) - mapping.bank) | 0);
      assert.equal(mapping.offsetTableIndex, mapping.frame + mapping.bankStride * 2);
      assert.equal(mapping.frame, expected.phase);
      const parsedFrame = header.frames[mapping.frame];
      assert.equal(parsedFrame.relativeOffset, expected.sourceRelativeOffset, `${variant} phase ${expected.phase} relative offset`);
      assert.equal(parsedFrame.dataOffset, expected.sourceDataOffset, `${variant} phase ${expected.phase} data offset`);
      assert.equal(parsedFrame.size, expected.compressedPayloadSize, `${variant} phase ${expected.phase} payload size`);
      assert.equal(
        sha256(source.subarray(parsedFrame.dataOffset, parsedFrame.dataOffset + parsedFrame.size)),
        expected.compressedPayloadSha256,
        `${variant} phase ${expected.phase} compressed payload`,
      );
    }
  }
});

test("rejects unsupported variants and unreachable or malformed phases", () => {
  for (const input of [
    { variant: "other", phase: 0 },
    { variant: "win", phase: -1 },
    { variant: "win", phase: 21 },
    { variant: "lose", phase: 27 },
    { variant: "win", phase: 1.5 },
    { variant: "lose", phase: "0" },
  ]) {
    assert.throws(() => mapK01ResultPhaseToSprFrame(input), /variant must be one of win or lose|phase must be an integer/u);
  }
});

test("rejects tampered executable, SPR, and structured function metadata", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-result-logo-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  copyFileSync(executablePath, alteredExecutablePath);
  flipByte(alteredExecutablePath, 0x50c10);
  assert.throws(
    () => extractK01ResultLogoMapping({ executablePath: alteredExecutablePath }),
    /original executable SHA-256: expected/u,
  );

  const alteredWinLogoPath = join(directory, "winlogo.spr");
  copyFileSync(winLogoPath, alteredWinLogoPath);
  flipByte(alteredWinLogoPath, 0x0bf4);
  assert.throws(
    () => extractK01ResultLogoMapping({ winLogoPath: alteredWinLogoPath }),
    /winLogo SHA-256: expected/u,
  );

  const alteredFunctionsPath = join(directory, "functions.json");
  const functions = JSON.parse(readFileSync(functionsPath, "utf8"));
  functions.functions.find(({ entry }) => entry === "0x00450c10").instructionSha256 = "0".repeat(64);
  writeFileSync(alteredFunctionsPath, `${JSON.stringify(functions)}\n`);
  assert.throws(
    () => extractK01ResultLogoMapping({ functionsPath: alteredFunctionsPath }),
    /0x00450c10 instructionSha256 mismatch/u,
  );
});

function flipByte(path, offset) {
  const descriptor = openSync(path, "r+");
  try {
    const bytes = readFileSync(path);
    const altered = Buffer.from([bytes[offset] ^ 0xff]);
    writeSync(descriptor, altered, 0, 1, offset);
  } finally {
    closeSync(descriptor);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
