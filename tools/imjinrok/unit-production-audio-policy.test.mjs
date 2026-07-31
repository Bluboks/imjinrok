import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractUnitProductionAudioPolicy } from "./extract-unit-production-audio-policy.mjs";

const root = resolve(import.meta.dirname, "../..");

test("distinguishes the common trainspot loader from unbound gamejvi train candidates", () => {
  const report = extractUnitProductionAudioPolicy();
  assert.equal(report.statuses.analysis, "hypothesis-resource-initialization-confirmed-event-binding-unresolved");
  assert.equal(report.source.commonMessage.loaderCallVa, "0x00471df0");
  assert.equal(report.source.commonMessage.loaderSlot, "0x00c4b620");
  assert.equal(report.source.trainCandidates.length, 16);
  assert.deepEqual(report.source.trainCandidates.map(({ path }) => path), [
    "gamejvi/train1k1.YAV", "gamejvi/train2k1.YAV", "gamejvi/train3k1.YAV", "gamejvi/train4k1.YAV", "gamejvi/train5k1.YAV", "gamejvi/train6k1.YAV",
    "gamejvi/train1j1.YAV", "gamejvi/train2j1.YAV", "gamejvi/train3j1.YAV", "gamejvi/train4j1.YAV", "gamejvi/train5j1.YAV",
    "gamejvi/train1c1.YAV", "gamejvi/train2c1.YAV", "gamejvi/train3c1.YAV", "gamejvi/train4c1.YAV", "gamejvi/train5c1.YAV",
  ]);
  assert.match(report.rejectedInference, /K01 hero identity/);
});

test("rejects tampered EXE and audio-resource inputs", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "unit-production-audio-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const executable = join(temporaryDirectory, "imjinrok2.exe");
  copyFileSync(join(root, "original/imjinrok2/imjinrok2.exe"), executable);
  const bytes = readFileSync(executable);
  bytes[0x100] ^= 0xff;
  writeFileSync(executable, bytes);
  assert.throws(() => extractUnitProductionAudioPolicy({ executable }), /EXE SHA-256/);
  assert.throws(() => extractUnitProductionAudioPolicy({ resourceDirectory: temporaryDirectory }), /trainspotdonemessage\.YAV/);
});
