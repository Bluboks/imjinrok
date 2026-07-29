import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractK01FarmerResourceBranchFrames, selectK01FarmerResourceBranchFrame } from "./extract-k01-farmer-resource-branch-frames.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-farmer-resource-branch-frame-vectors.json");
const paths = {
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  jumpTablesPath: join(root, "analysis/generated/imjinrok2/jump-tables.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  seedsPath: join(root, "analysis/generated/imjinrok2/seeds.json"),
  farmerkPath: join(root, "original/imjinrok2/char/farmerk.spr"),
  farmerjPath: join(root, "original/imjinrok2/char/Farmerj.spr"),
};

test("recovers the narrowly evidenced quantity flow and class 7/31 nonzero idle/move frames", () => {
  const report = extractK01FarmerResourceBranchFrames();
  assert.deepEqual(report.fieldFlow.subrecord, {
    entityOffset: "+0x45c",
    selector: { subrecordOffset: "+0x1c", entityOffset: "+0x478", resetVa: "0x004550ea", writerVa: "0x004557a3" },
    quantity: { subrecordOffset: "+0x1e", entityOffset: "+0x47a", resetVa: "0x004550ee", increments: [{ va: "0x004564d4", selectorCase: 3, add: 12 }, { va: "0x004564db", selectorCase: "other observed cases", add: 9 }] },
    capacity: { subrecordOffset: "+0x20", entityOffset: "+0x47c", initialValue: 10, resetVa: "0x004550f2" },
  });
  assert.deepEqual(report.fieldFlow.creditGate, {
    functionEntry: "0x0043c9c0", range: "0x0043ce75-0x0043ce9e", zeroRegisterProvenance: { setVa: "0x0043ca1e", instruction: "XOR EBP,EBP", comparatorRegister: "BP", verifiedRange: "0x0043ca1e-0x0043cea3" }, condition: "quantity != 0 && selector != 0 && quantity < capacity (the observed signed JGE comparison)", callVa: "0x0043ce9a", target: "0x00424510", arguments: ["selector from +0x478", "quantity from +0x47a"],
  });
  assert.deepEqual(report.fieldFlow.coordinateIndexedTileStorageAdd, {
    functionEntry: "0x00424510", coordinateFields: ["entity +0x1bc", "entity +0x1be"], indexFormula: "x*45+y", tableVa: "0x00bb41cc", selectorCases: [1, 2, 3], effect: "selectors 1/2 add the supplied quantity to a coordinate-indexed tile WORD; selector 3 shifts the supplied quantity by 8 before that add",
  });
  assert.deepEqual(report.fieldFlow.quantityConfigRefresh, { functionEntry: "0x004562d0", moveCallVa: "0x0045650c", moveHelper: "0x00428e10", idleCallVa: "0x00456524", idleHelper: "0x00428fb0" });
  assert.deepEqual(report.callEdges.filter(({ from }) => from === "0x0045650c" || from === "0x00456524"), [
    { from: "0x0045650c", fromFunctionEntry: "0x004562d0", to: "0x00428e10" },
    { from: "0x00456524", fromFunctionEntry: "0x004562d0", to: "0x00428fb0" },
  ]);
  assert.deepEqual(report.states[7].idle.frameBases, [82, 90, 98, 106, 114]);
  assert.deepEqual(report.states[7].move.frameStart, 80);
  assert.deepEqual(report.states[31].idle.frameBases, [200, 208, 216, 224, 232]);
  assert.deepEqual(report.states[31].move.frameStart, 200);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const actual = report.testVectors.map(({ internalClass, state, direction, phase, carriedResourceQuantity, frameIndex, mirrorX }) => [internalClass, state, direction, phase, carriedResourceQuantity, frameIndex, mirrorX]);
  assert.deepEqual(actual, fixture.vectors);
});

test("replays nonzero, normal direction, and phase boundaries while rejecting zero and out-of-scope inputs", () => {
  assert.deepEqual(selectK01FarmerResourceBranchFrame({ internalClass: 7, state: 8, direction: 16, phase: 0, carriedResourceQuantity: 1 }), { internalClass: 7, state: 8, stateName: "idle", direction: 16, facing: "n", phase: 0, carriedResourceQuantity: 1, spriteSlot: 105, sourcePath: "char\\farmerk.spr", frameIndex: 98, mirrorX: true });
  assert.equal(selectK01FarmerResourceBranchFrame({ internalClass: 7, state: 1, direction: 65, phase: 7, carriedResourceQuantity: 0xffff }).frameIndex, 119);
  assert.equal(selectK01FarmerResourceBranchFrame({ internalClass: 31, state: 8, direction: 20, phase: 7, carriedResourceQuantity: 1 }).frameIndex, 231);
  assert.equal(selectK01FarmerResourceBranchFrame({ internalClass: 31, state: 1, direction: 64, phase: 7, carriedResourceQuantity: 1 }).frameIndex, 207);
  assert.throws(() => selectK01FarmerResourceBranchFrame({ internalClass: 7, state: 8, direction: 1, phase: 1, carriedResourceQuantity: 1 }), /recovered 0..0/);
  assert.throws(() => selectK01FarmerResourceBranchFrame({ internalClass: 31, state: 1, direction: 1, phase: 8, carriedResourceQuantity: 1 }), /recovered 0..7/);
  assert.throws(() => selectK01FarmerResourceBranchFrame({ internalClass: 7, state: 1, direction: 1, phase: 0, carriedResourceQuantity: 0 }), /must be nonzero/);
  assert.throws(() => selectK01FarmerResourceBranchFrame({ internalClass: 7, state: 4, direction: 1, phase: 0, carriedResourceQuantity: 1 }), /scoped set/);
  assert.throws(() => selectK01FarmerResourceBranchFrame({ internalClass: 1, state: 1, direction: 1, phase: 0, carriedResourceQuantity: 1 }), /scoped set/);
  assert.throws(() => selectK01FarmerResourceBranchFrame({ internalClass: 7, state: 1, direction: 0, phase: 0, carriedResourceQuantity: 1 }), /normal grid set/);
});

test("rejects tampered canonical function, jump-table, reference, seed, sprite, and EXE evidence", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-farmer-resource-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  let artifactIndex = 0;
  const mutateJson = (source, mutate) => {
    const path = join(temporaryDirectory, `artifact-${artifactIndex}.json`);
    artifactIndex += 1;
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    return path;
  };
  const functionsPath = mutateJson(paths.functionsPath, (value) => { value.functions.find(({ entry }) => entry === "0x00424510").instructionCount = 23; });
  assert.throws(() => extractK01FarmerResourceBranchFrames({ functionsPath }), /0x00424510 instruction count/);
  const jumpTablesPath = mutateJson(paths.jumpTablesPath, (value) => { Object.values(value.tables).find(({ switchAddress }) => switchAddress === "0x00428fcc").cases.find(({ label }) => label === 7).destination = "0x00429031"; });
  assert.throws(() => extractK01FarmerResourceBranchFrames({ jumpTablesPath }), /class 7 idle switch destination/);
  const referencesPath = mutateJson(paths.referencesPath, (value) => { value.references.find(({ from }) => from === "0x0043ce9a").to = "0x00424511"; });
  assert.throws(() => extractK01FarmerResourceBranchFrames({ referencesPath }), /0x0043ce9a -> 0x00424510/);
  const refreshReferencesPath = mutateJson(paths.referencesPath, (value) => { value.references.find(({ from }) => from === "0x0045650c").to = "0x00428e11"; });
  assert.throws(() => extractK01FarmerResourceBranchFrames({ referencesPath: refreshReferencesPath }), /0x0045650c -> 0x00428e10/);
  const seedsPath = mutateJson(paths.seedsPath, (value) => { value.functions.find(({ entry }) => entry === "0x004291d0").instructions.find(({ address }) => address === "0x00429ba7").text = "MOV EDI,0x92"; });
  assert.throws(() => extractK01FarmerResourceBranchFrames({ seedsPath }), /seed instruction 0x00429ba7/);
  const farmerkPath = join(temporaryDirectory, "farmerk.spr");
  copyFileSync(paths.farmerkPath, farmerkPath);
  const spriteBytes = readFileSync(farmerkPath);
  spriteBytes[spriteBytes.length - 1] ^= 1;
  writeFileSync(farmerkPath, spriteBytes);
  assert.throws(() => extractK01FarmerResourceBranchFrames({ farmerkPath }), /class 7 SPR SHA-256/);
  const farmerjPath = join(temporaryDirectory, "Farmerj.spr");
  copyFileSync(paths.farmerjPath, farmerjPath);
  const farmerjBytes = readFileSync(farmerjPath);
  farmerjBytes[farmerjBytes.length - 1] ^= 1;
  writeFileSync(farmerjPath, farmerjBytes);
  assert.throws(() => extractK01FarmerResourceBranchFrames({ farmerjPath }), /class 31 SPR SHA-256/);
  const executablePath = join(temporaryDirectory, "imjinrok2.exe");
  copyFileSync(join(root, "original/imjinrok2/imjinrok2.exe"), executablePath);
  const executableBytes = readFileSync(executablePath);
  executableBytes[0x28fdd] ^= 1;
  writeFileSync(executablePath, executableBytes);
  assert.throws(() => extractK01FarmerResourceBranchFrames({ executablePath }), /EXE SHA-256/);
});
