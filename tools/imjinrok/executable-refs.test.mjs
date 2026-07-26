import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractExecutableReferences } from "./extract-executable-refs.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalExecutablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");

test("original executable references K01/K02 campaign assets with PE offsets", () => {
  const report = extractExecutableReferences(originalExecutablePath);
  const refsByValue = new Map(report.references.map((reference) => [normalizePath(reference.value), reference]));
  const expectedK01K02Refs = [
    "script\\k0120",
    "script\\k0115",
    "script\\k0230",
    "script\\k0227",
    "script\\k0225",
    "script\\k0220",
    "script\\k0210",
    "script\\k0110",
    "stagemap\\k01.map",
    "stagemap\\k02.map",
  ];

  assert.equal(report.imageBase, "0x00400000");

  for (const expectedRef of expectedK01K02Refs) {
    const reference = refsByValue.get(normalizePath(expectedRef));

    assert.ok(reference, `missing ${expectedRef}`);
    assert.equal(reference.section, ".data");
    assert.equal(reference.categories.includes("k01-k02-mvp"), true);
    assert.match(reference.rawOffset, /^0x[0-9a-f]{8}$/);
    assert.match(reference.va, /^0x[0-9a-f]{8}$/);
  }

  assert.deepEqual(report.campaign.k01K02Refs.map((reference) => normalizePath(reference.value)), expectedK01K02Refs.map(normalizePath));
});

test("original executable exposes UI resource and map-control strings", () => {
  const report = extractExecutableReferences(originalExecutablePath);
  const uiSpriteValues = new Set(report.ui.spriteRefs.map((reference) => normalizePath(reference.value)));
  const controlValues = new Set(report.ui.controlIds.map((reference) => reference.value));
  const mapControlValues = new Set(report.ui.mapControlIds.map((reference) => reference.value));

  assert.equal(uiSpriteValues.has("yfnt/mouseinterface.spr"), true);
  assert.equal(uiSpriteValues.has("yfnt/selectstageborder.spr"), true);
  assert.equal(uiSpriteValues.has("yfnt/titlelobby.spr"), true);
  assert.equal(uiSpriteValues.has("yfnt/titleresult.spr"), true);
  assert.equal(uiSpriteValues.has("yfnt/titlestartstagekorea.spr"), true);
  assert.equal(uiSpriteValues.has("yfnt/titlestartstagetoselect.spr"), true);

  assert.equal(controlValues.has("YSELECTSTAGE"), true);
  assert.equal(controlValues.has("YOKCANCEL"), true);
  assert.equal(controlValues.has("YMAP000 [%d]"), true);
  assert.equal(mapControlValues.has("YMAP006 [%d][%d]"), true);
  assert.ok(report.ui.spriteRefs.length > 20);
  assert.ok(report.ui.mapControlIds.length >= 20);
});

test("original executable xrefs UI resource and control anchors from code", () => {
  const report = extractExecutableReferences(originalExecutablePath);
  const refsByValue = new Map(report.references.map((reference) => [reference.value, reference]));

  assertAnchor(refsByValue.get("YSELECTSTAGE"), "0x004c93d4", ["0x004aafb4", "0x004ab01d"]);
  assertAnchor(refsByValue.get("YSELECTSTAGE [%s]"), "0x004c93a4", ["0x004aaffc", "0x004ab065"]);
  assertAnchor(refsByValue.get("yfnt\\selectstageborder.spr"), "0x004c93b8", ["0x004aafd5"]);
  assertAnchor(refsByValue.get("YMAP000 [%d]"), "0x004c8d40", ["0x004994c7"]);
  assertAnchor(refsByValue.get("YMAP006 [%d][%d]"), "0x004c8d68", ["0x0049b1b1"]);
  assertAnchor(refsByValue.get("YOKCANCEL"), "0x004c8a54", ["0x00494b93", "0x004a5e56"]);
  assertAnchor(refsByValue.get("YOKCANCEL [%s]"), "0x004c8a30", ["0x00494bdb", "0x004a5eb9"]);
  assertAnchor(refsByValue.get("yfnt\\mouseinterface.spr"), "0x004c9030", ["0x004a51d9", "0x004aaade"]);
  assertAnchor(refsByValue.get("yfnt\\titlestartstagekorea.spr"), "0x004baff8", ["0x0043e99d"]);
  assertAnchor(refsByValue.get("yfnt\\titlestartstagetoselect.spr"), "0x004bb044", ["0x0043e933"]);
});

function normalizePath(path) {
  return path.replaceAll("\\", "/").toLowerCase();
}

function pushXrefVas(reference) {
  assert.ok(reference);
  return (reference.xrefs ?? []).filter((xref) => xref.kind === "push-imm32").map((xref) => xref.instructionVa);
}

function assertAnchor(reference, expectedVa, expectedPushXrefVas) {
  assert.ok(reference);
  assert.equal(reference.va, expectedVa);
  assert.deepEqual(pushXrefVas(reference), expectedPushXrefVas);
}
