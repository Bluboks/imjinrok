import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01FarmerState4FallbackFrames, selectK01FarmerState4FallbackFrame } from "./extract-k01-farmer-state4-fallback-frames.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-farmer-state4-fallback-frame-vectors.json");

test("recovers the source-created state-4 creation-default visual fallback for both farmer classes", () => {
  const report = extractK01FarmerState4FallbackFrames();
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "pending-audit");
  assert.deepEqual(report.initializer.classes.map(({ internalClass, initializerRange, noWord144Write }) => ({ internalClass, initializerRange, noWord144Write })), [
    { internalClass: 7, initializerRange: "0x0042981d-0x004298e7", noWord144Write: { field: "+0x144", scope: "exact class initializer range", result: true } },
    { internalClass: 31, initializerRange: "0x00429b90-0x00429c59", noWord144Write: { field: "+0x144", scope: "exact class initializer range", result: true } },
  ]);
  assert.deepEqual(report.state4.classGate, {
    functionEntry: "0x0041e370", switchAddress: "0x0041e385", classes: [7, 31], destination: "0x0041e3a0", highBit: "clear", zeroWord144Destination: "0x0041e3b3 -> 0x0041d870",
  });
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const expected = fixture.endpoints.map(([internalClass, direction, phase, spriteSlot, frameIndex, mirrorX]) => ({
    internalClass, visualState: 4, visualStateName: "state4-creation-default-visual-fallback", fallbackState: 8, fallbackStateName: "idle", direction,
    facing: ({ 1: "s", 5: "sw", 4: "w", 20: "nw", 16: "n", 80: "ne", 64: "e", 65: "se" })[direction], phase, spriteSlot,
    sourcePath: internalClass === 7 ? "char\\farmerk.spr" : "char\\farmerj.spr", frameIndex, mirrorX,
  }));
  assert.deepEqual(report.testVectors, expected);
});

test("selects exactly the state-8 idle slot/frame/mirror and rejects out-of-scope input", () => {
  const fallback = selectK01FarmerState4FallbackFrame({ internalClass: 7, direction: 16, phase: 7 });
  assert.deepEqual(fallback, {
    internalClass: 7, visualState: 4, visualStateName: "state4-creation-default-visual-fallback", fallbackState: 8, fallbackStateName: "idle",
    direction: 16, facing: "n", phase: 7, spriteSlot: 105, sourcePath: "char\\farmerk.spr", frameIndex: 23, mirrorX: true,
  });
  assert.equal(selectK01FarmerState4FallbackFrame({ internalClass: 31, direction: 65, phase: 0 }).frameIndex, 32);
  assert.throws(() => selectK01FarmerState4FallbackFrame({ internalClass: 7, direction: 1, phase: 0, creationWord: 1 }), /creation-default fallback/);
  assert.throws(() => selectK01FarmerState4FallbackFrame({ internalClass: 31, direction: 1, phase: 0, typeFlags: 0x80081001 }), /high-bit-clear/);
  assert.throws(() => selectK01FarmerState4FallbackFrame({ internalClass: 7, direction: 0, phase: 0 }), /normal grid set/);
  assert.throws(() => selectK01FarmerState4FallbackFrame({ internalClass: 8, direction: 1, phase: 0 }), /scoped classes/);
});

test("rejects tampered switches, zero fill, initializer field writes, and relevant artifacts", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "k01-farmer-state4-fallback-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  let artifactIndex = 0;
  const mutateJson = (source, mutate) => {
    const path = join(temp, `artifact-${artifactIndex}.json`);
    artifactIndex += 1;
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    return path;
  };
  const dispatcherSwitchPath = mutateJson(join(root, "analysis/generated/imjinrok2/jump-tables.json"), (value) => {
    Object.values(value.tables).find(({ functionEntry, switchAddress }) => functionEntry === "0x0041d210" && switchAddress === "0x0041d21a").cases.find(({ label }) => label === 4).destination = "0x0041d235";
  });
  assert.throws(() => extractK01FarmerState4FallbackFrames({ jumpTablesPath: dispatcherSwitchPath }), /state dispatcher case 4 destination/);
  const jumpTablesPath = mutateJson(join(root, "analysis/generated/imjinrok2/jump-tables.json"), (value) => {
    Object.values(value.tables).find(({ functionEntry, switchAddress }) => functionEntry === "0x0041e370" && switchAddress === "0x0041e385").cases.find(({ label }) => label === 31).destination = "0x0041e38c";
  });
  assert.throws(() => extractK01FarmerState4FallbackFrames({ jumpTablesPath }), /state-4 class 31 default gate/);
  const zeroFillSeedsPath = mutateJson(join(root, "analysis/generated/imjinrok2/seeds.json"), (value) => {
    value.functions.find(({ entry }) => entry === "0x00437650").instructions.find(({ address }) => address === "0x00437656").text = "MOV ECX,0x155";
  });
  assert.throws(() => extractK01FarmerState4FallbackFrames({ seedsPath: zeroFillSeedsPath }), /creator zero-fill DWORD count/);
  const injectedWriteSeedsPath = mutateJson(join(root, "analysis/generated/imjinrok2/seeds.json"), (value) => {
    value.functions.find(({ entry }) => entry === "0x004291d0").instructions.push({ address: "0x00429840", text: "MOV word ptr [ESI + 0x144],BX" });
  });
  assert.throws(() => extractK01FarmerState4FallbackFrames({ seedsPath: injectedWriteSeedsPath }), /class 7 initializer writes to WORD \+0x144/);
  const referencesPath = mutateJson(join(root, "analysis/generated/imjinrok2/references.json"), (value) => {
    value.references.find(({ from }) => from === "0x0041e3b3").to = "0x0041e200";
  });
  assert.throws(() => extractK01FarmerState4FallbackFrames({ referencesPath }), /missing required call edge 0x0041e3b3/);
  const executablePath = join(temp, "imjinrok2.exe");
  copyFileSync(join(root, "original/imjinrok2/imjinrok2.exe"), executablePath);
  const executable = readFileSync(executablePath);
  executable[0x1e3b3] ^= 1;
  writeFileSync(executablePath, executable);
  assert.throws(() => extractK01FarmerState4FallbackFrames({ executablePath }), /EXE SHA-256/);
});
