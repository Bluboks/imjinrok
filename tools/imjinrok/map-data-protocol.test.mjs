import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  extractK01MapDataProtocol,
  extractMapDataProtocolFromBuffer,
  readProtocolCell,
  validateProtocolArtifact,
  verifyK01MapDataProtocolArtifact,
} from "./map-data-protocol.mjs";

const artifactPath = "analysis/generated/k01-map-data-protocol.json";

test("K01 map-data protocol is deterministic and hash-bound", () => {
  const first = extractK01MapDataProtocol();
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  validateProtocolArtifact(artifact);
  assert.deepEqual(artifact, first);
  assert.equal(readProtocolCell(artifact, "rawRasterVerticalShift", 15, 6), 0);
  assert.equal(readProtocolCell(artifact, "rawRasterVerticalShift", 16, 6), 16);
  assert.throws(() => readProtocolCell(artifact, "objectIndex", 60, 0), /outside/u);
  assert.doesNotThrow(() => verifyK01MapDataProtocolArtifact());
});

test("K01 map-data protocol fails closed for tampered, truncated, and wrong-dimension inputs", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-map-protocol-"));
  const original = readFileSync("original/imjinrok2/stagemap/k01.map");

  const tamperedPath = join(directory, "tampered.map");
  const tampered = Buffer.from(original);
  tampered[0x32514] ^= 0x01;
  writeFileSync(tamperedPath, tampered);
  assert.throws(() => extractK01MapDataProtocol({ mapPath: tamperedPath }), /SHA-256 mismatch/u);

  const truncatedPath = join(directory, "truncated.map");
  writeFileSync(truncatedPath, original.subarray(0, original.length - 1));
  assert.throws(() => extractK01MapDataProtocol({ mapPath: truncatedPath }), /size mismatch/u);

  const wrongDimensionPath = join(directory, "wrong-dimension.map");
  const wrongDimension = Buffer.from(original);
  wrongDimension.writeInt32LE(59, 0x2da0);
  writeFileSync(wrongDimensionPath, wrongDimension);
  assert.throws(() => extractMapDataProtocolFromBuffer(wrongDimension, { source: wrongDimensionPath }), /profile\/header dimension mismatch/u);

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  artifact.channels.objectIndex.valuesBase64 = Buffer.from([0]).toString("base64");
  assert.throws(() => validateProtocolArtifact(artifact), /byte count|digest mismatch/u);
});

test("generic protocol core reaches a real profile/header dimension gate", () => {
  const synthetic = Buffer.alloc(0x10bd8c);
  synthetic.writeInt32LE(0, 0x00);
  synthetic.writeInt32LE(0, 0x2d98);
  synthetic.writeInt32LE(0, 0x2d9c);
  synthetic.writeUInt32LE(60, 0x2da0);
  synthetic.writeUInt32LE(60, 0x2da4);
  assert.doesNotThrow(() => extractMapDataProtocolFromBuffer(synthetic));
  synthetic.writeUInt32LE(59, 0x2da0);
  assert.throws(() => extractMapDataProtocolFromBuffer(synthetic), /profile\/header dimension mismatch/u);
});

test("protocol rejects stale evidence fixtures and creates deterministic nested outputs", async () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-map-protocol-evidence-"));
  const compositor = JSON.parse(readFileSync("analysis/fixtures/k01-gameplay-terrain-compositor.json", "utf8"));
  compositor.channelDigests.rawRasterVerticalShiftSha256 = "0".repeat(64);
  const compositorPath = join(directory, "compositor.json");
  writeFileSync(compositorPath, JSON.stringify(compositor));
  assert.throws(() => extractK01MapDataProtocol({ evidencePaths: { compositor: compositorPath } }), /raw shift digest|compositor/u);

  const { writeK01MapDataProtocolArtifacts } = await import("./map-data-protocol.mjs");
  const outputPath = join(directory, "nested", "artifact.json");
  const typeScriptPath = join(directory, "nested", "artifact.ts");
  mkdirSync(join(directory, "nested"), { recursive: true });
  assert.doesNotThrow(() => writeK01MapDataProtocolArtifacts({ outputPath, typeScriptPath }));
  assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), JSON.parse(readFileSync(artifactPath, "utf8")));
});

test("low-nibble derivation masks high bits independently of canonical K01 values", () => {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const schema = artifact.channelSchemas.find((entry) => entry.id === "field_0x32514_low_nibble");
  assert.deepEqual(schema.operation, { kind: "bitmask", mask: 15, source: "field_0x32514_raw", testVectors: [{ input: 162, output: 2 }] });
  assert.deepEqual(schema.operation.testVectors.map(({ input, output }) => input & schema.operation.mask), [2]);
});

test("artifact validation rejects schema/channel drift and altered source metadata", () => {
  const baseline = JSON.parse(readFileSync(artifactPath, "utf8"));
  const extraChannel = structuredClone(baseline);
  extraChannel.channels.extra = extraChannel.channels.objectIndex;
  assert.throws(() => validateProtocolArtifact(extraChannel), /channel set/u);

  const missingSchema = structuredClone(baseline);
  missingSchema.channelSchemas.pop();
  assert.throws(() => validateProtocolArtifact(missingSchema), /channel schema/u);

  const alteredMetadata = structuredClone(baseline);
  alteredMetadata.sources.map.sha256 = "0".repeat(64);
  assert.throws(() => validateProtocolArtifact(alteredMetadata), /source metadata/u);

  const invalidBase64 = structuredClone(baseline);
  invalidBase64.channels.objectIndex.valuesBase64 = "!";
  assert.throws(() => validateProtocolArtifact(invalidBase64), /base64|valuesBase64/u);
});
