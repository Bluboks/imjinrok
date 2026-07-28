import assert from "node:assert/strict";
import { closeSync, copyFileSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_PANEL_SHA256,
  extractPannelSprHudBlit,
  reproducePannelHudBlit,
} from "./extract-pannel-spr-hud-blit.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const panelPath = join(repositoryRoot, "original/imjinrok2/fnt/pannel.spr");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixture = JSON.parse(readFileSync(join(repositoryRoot, "analysis/fixtures/pannel-spr-hud-blit-vectors.json"), "utf8"));

test("binds the pannel loader record and final HUD blit to the exact source artifacts", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourcePanelSha256, EXPECTED_PANEL_SHA256);
  const report = extractPannelSprHudBlit({ executablePath, panelPath, referencesPath });

  assert.equal(report.analysisStatus, "static-confirmed-for-pannel-loader-to-hud-blit");
  assert.equal(report.reproductionStatus, "reproduction-complete-for-bounded-blit-admission-and-lifecycle");
  assert.deepEqual(report.loader, {
    function: "FUN_00443360",
    pointerTable: "0x004bc094",
    panelTableEntry: "0x004bc098",
    panelPath: "fnt\\pannel.spr",
    recordBase: "0x0088c0b8",
    recordStride: "0x0bf8",
    panelRecord: "0x0088ccb0",
    widthField: "DWORD[0x0088ccb4]",
    heightField: "DWORD[0x0088ccb8]",
    payloadPointerField: "DWORD[0x0088d8a4]",
    loaderFailure: "FUN_004434a0 reports a load/type/allocation failure as zero; FUN_00443360 records only the first such error and continues through later table entries. This extractor does not infer the later HUD-frame contents after a missing payload pointer.",
  });
  assert.deepEqual(report.finalBlit.rectangle, {
    x: 0,
    y: 0,
    width: 640,
    height: 163,
    right: 640,
    bottom: 163,
    coordinateSystem: "top-left shared 640×480 HUD canvas",
  });
  assert.equal(report.finalBlit.consumer.callsite, "0x00447a0f");
  assert.equal(report.finalBlit.destination.bytePlane, "DAT_00559418 + 0x1510");
  assert.deepEqual(
    report.rawCodeRanges.find((range) => range.id === "common-spr-object-loader"),
    {
      id: "common-spr-object-loader",
      byteRange: "0x004434a0-0x0044357f (end exclusive)",
      bodySha256: "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0",
    },
  );
  assert.deepEqual(report.finalBlit.ordering.slice(-2), [
    "unlock DAT_0054926c through FUN_0044ada0",
    "later call FUN_0045ad90 renders the common selection-command grid",
  ]);
});

test("reproduces normal, lock-failure, and gate-failure panel-blit boundaries", () => {
  for (const vector of fixture.vectors) {
    assert.deepEqual(reproducePannelHudBlit(vector.input), vector.expected, vector.id);
  }
});

test("does not inspect malformed or absent later inputs after an earlier source gate skips them", () => {
  assert.deepEqual(
    reproducePannelHudBlit({ selectedRecordGate: 1, globalGate: -1, panelGate: -1, surfaceLockSucceeded: "not-reached" }),
    fixture.vectors[2].expected,
  );
  assert.deepEqual(
    reproducePannelHudBlit({ selectedRecordGate: 0, globalGate: 1, panelGate: -1, surfaceLockSucceeded: "not-reached" }),
    fixture.vectors[3].expected,
  );
  assert.deepEqual(
    reproducePannelHudBlit({ selectedRecordGate: 0, globalGate: 0, panelGate: 1, surfaceLockSucceeded: "not-reached" }),
    fixture.vectors[4].expected,
  );
});

test("refuses noncanonical or unrepresentable source-domain gate values when reached", () => {
  assert.throws(
    () => reproducePannelHudBlit({ selectedRecordGate: 0x1_0000, globalGate: 0, panelGate: 0, surfaceLockSucceeded: true }),
    /selectedRecordGate must be an unsigned original WORD value/u,
  );
  assert.throws(
    () => reproducePannelHudBlit({ selectedRecordGate: -1 }),
    /selectedRecordGate must be an unsigned original WORD value/u,
  );
  assert.throws(
    () => reproducePannelHudBlit({ selectedRecordGate: 0, globalGate: -1 }),
    /globalGate must be an unsigned original WORD value/u,
  );
  assert.throws(
    () => reproducePannelHudBlit({ selectedRecordGate: 0, globalGate: 0, panelGate: 0x1_0000 }),
    /panelGate must be an unsigned original WORD value/u,
  );
  assert.throws(
    () => reproducePannelHudBlit({ selectedRecordGate: 0, globalGate: 0, panelGate: 0, surfaceLockSucceeded: 1 }),
    /surfaceLockSucceeded must be a boolean/u,
  );
});

test("rejects tampered executable and panel inputs", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-pannel-hud-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const alteredPanelPath = join(directory, "pannel.spr");
  copyFileSync(executablePath, alteredExecutablePath);
  copyFileSync(panelPath, alteredPanelPath);
  flipByte(alteredExecutablePath, 0x469f2);
  flipByte(alteredPanelPath, 0x0bf4);

  assert.throws(() => extractPannelSprHudBlit({ executablePath: alteredExecutablePath, panelPath, referencesPath }), /imjinrok2\.exe SHA-256 mismatch/u);
  assert.throws(() => extractPannelSprHudBlit({ executablePath, panelPath: alteredPanelPath, referencesPath }), /pannel\.spr SHA-256 mismatch/u);
});

test("rejects stale generated structured references", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-pannel-refs-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const staleReferencesPath = join(directory, "references.json");
  writeFileSync(staleReferencesPath, JSON.stringify({ sourceSha256: "0".repeat(64), references: [] }));

  assert.throws(
    () => extractPannelSprHudBlit({ executablePath, panelPath, referencesPath: staleReferencesPath }),
    /references\.json SHA-256 mismatch/u,
  );
});

function flipByte(path, offset) {
  const descriptor = openSync(path, "r+");
  try {
    const current = Buffer.alloc(1);
    readFileSync(path).copy(current, 0, offset, offset + 1);
    current[0] ^= 0xff;
    writeSync(descriptor, current, 0, 1, offset);
  } finally {
    closeSync(descriptor);
  }
}
