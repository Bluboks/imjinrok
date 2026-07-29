import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01JapaneseFarmerFrames, selectK01JapaneseFarmerFrame } from "./extract-k01-japanese-farmer-frames.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-japanese-farmer-frame-vectors.json");

test("recovers class 31 source creation order, Farmerj identity, map records, and scoped core frames", () => {
  const report = extractK01JapaneseFarmerFrames();
  assert.deepEqual(report.identity, { internalClass: 31, originalGameplayName: "일본 농부", typeRecordAddress: "0x00885644", typeFlags: "0x00081001", projectKind: "japanese-farmer", identityMapping: "exact-static-identity-source" });
  assert.deepEqual(report.creation, { mapLoader: "0x0048dbe0", wrapper: "0x00483c50", creator: "0x00437650", zeroFill: { dwordCount: 342, byteCount: 1368, instruction: "0x00437666" }, subrecordReset: { context: "0x0043792b", call: "0x00437962", offset: "0x45c" }, classWrite: "0x00437b86", initializerCall: "0x00437f29", initializerWordAtEntry: 0 });
  assert.deepEqual(report.initializerCalls, { initializerRange: "0x00429b90-0x00429c59", idle: { helper: "0x00438e50", state: 8, slot: 145, frameStart: 0, phaseCount: 8, branch: "0x00429108" }, move: { helper: "0x00438ef0", state: 1, slot: 145, frameStart: 160, phaseCount: 8, branch: "0x00428f1a" }, death: { helper: "0x004390b0", state: 7, slot: 145, frameStart: 240, frameStride: 0, phaseCount: 8, facingCallCount: 5 } });
  assert.deepEqual(report.mapRecords.map(({ rawOwnerWord, sourcePosition }) => ({ rawOwnerWord, sourcePosition })), [{ rawOwnerWord: 1, sourcePosition: { x: 7, y: 48 } }, { rawOwnerWord: 1, sourcePosition: { x: 7, y: 47 } }, { rawOwnerWord: 1, sourcePosition: { x: 48, y: 1 } }]);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.deepEqual(report.testVectors, fixture.vectors.map(([state, direction, phase]) => selectK01JapaneseFarmerFrame({ state, direction, phase })));
});

test("replays normal-direction boundaries and rejects state 4 and the nonzero initializer branch", () => {
  assert.equal(selectK01JapaneseFarmerFrame({ state: 8, direction: 20, phase: 7 }).frameIndex, 31);
  assert.deepEqual(selectK01JapaneseFarmerFrame({ state: 1, direction: 80, phase: 0 }), { internalClass: 31, state: 1, stateName: "move", direction: 80, facing: "ne", phase: 0, spriteSlot: 145, sourcePath: "char\\farmerj.spr", frameIndex: 168, mirrorX: true });
  assert.equal(selectK01JapaneseFarmerFrame({ state: 7, direction: 64, phase: 0 }).frameIndex, 240);
  assert.throws(() => selectK01JapaneseFarmerFrame({ state: 4, direction: 1, phase: 0 }), /scoped set/);
  assert.throws(() => selectK01JapaneseFarmerFrame({ state: 8, direction: 1, phase: 8 }), /recovered 0..7/);
  assert.throws(() => selectK01JapaneseFarmerFrame({ state: 8, direction: 0, phase: 0 }), /normal grid set/);
  assert.throws(() => selectK01JapaneseFarmerFrame({ state: 8, direction: 1, phase: 0, initializerWord: 1 }), /nonzero branch/);
});

test("rejects tampered canonical artifacts, raw bytes, map, and Farmerj sprite", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "k01-japanese-farmer-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  let artifactIndex = 0;
  const mutateJson = (source, mutate) => { const path = join(temp, `artifact-${artifactIndex}.json`); artifactIndex += 1; const value = JSON.parse(readFileSync(source, "utf8")); mutate(value); writeFileSync(path, `${JSON.stringify(value)}\n`); return path; };
  const functionsPath = mutateJson(join(root, "analysis/generated/imjinrok2/functions.json"), (value) => { value.functions.find(({ entry }) => entry === "0x00437650").instructionCount = 538; });
  assert.throws(() => extractK01JapaneseFarmerFrames({ functionsPath }), /0x00437650 instruction count/);
  const jumpTablesPath = mutateJson(join(root, "analysis/generated/imjinrok2/jump-tables.json"), (value) => { Object.values(value.tables).find(({ functionEntry }) => functionEntry === "0x00428fb0").cases.find(({ label }) => label === 31).destination = "0x00429109"; });
  assert.throws(() => extractK01JapaneseFarmerFrames({ jumpTablesPath }), /idle helper class 31 destination/);
  const seedsPath = mutateJson(join(root, "analysis/generated/imjinrok2/seeds.json"), (value) => { value.functions.find(({ entry }) => entry === "0x004291d0").instructions.find(({ address }) => address === "0x00429ba7").text = "MOV EDI,0x92"; });
  assert.throws(() => extractK01JapaneseFarmerFrames({ seedsPath }), /sprite slot register/);
  const mapPath = join(temp, "k01.map"); copyFileSync(join(root, "original/imjinrok2/stagemap/k01.map"), mapPath); const mapBytes = readFileSync(mapPath); mapBytes[10] ^= 1; writeFileSync(mapPath, mapBytes);
  assert.throws(() => extractK01JapaneseFarmerFrames({ mapPath }), /K01 map SHA-256/);
  const farmerjPath = join(temp, "Farmerj.spr"); copyFileSync(join(root, "original/imjinrok2/char/Farmerj.spr"), farmerjPath); const spriteBytes = readFileSync(farmerjPath); spriteBytes[spriteBytes.length - 1] ^= 1; writeFileSync(farmerjPath, spriteBytes);
  assert.throws(() => extractK01JapaneseFarmerFrames({ farmerjPath }), /Farmerj SHA-256/);
  const executablePath = join(temp, "imjinrok2.exe"); copyFileSync(join(root, "original/imjinrok2/imjinrok2.exe"), executablePath); const executableBytes = readFileSync(executablePath); executableBytes[0x8dcca] ^= 1; writeFileSync(executablePath, executableBytes);
  assert.throws(() => extractK01JapaneseFarmerFrames({ executablePath }), /EXE SHA-256/);
});
