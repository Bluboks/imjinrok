import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createMainMenuPaletteStateFixture,
  reproduceMainMenuPaletteSelection,
  verifyMainMenuPaletteStateVector,
} from "./main-menu-palette-state-vector.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const executablePath = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const referencesPath = resolve(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const jumpTablesPath = resolve(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json");
const fixturePath = resolve(repositoryRoot, "analysis/fixtures/main-menu-palette-state-vector.json");

test("static vector binds the landing and country/mission palette state paths", () => {
  const fixtureBytes = readFileSync(fixturePath, "utf8");
  const fixture = JSON.parse(fixtureBytes);
  assert.deepEqual(fixture, createMainMenuPaletteStateFixture());
  assert.equal(fixtureBytes, `${JSON.stringify(createMainMenuPaletteStateFixture())}\n`);

  const report = verifyMainMenuPaletteStateVector({ executablePath, referencesPath, jumpTablesPath });
  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduced");
  assert.deepEqual(report.stateDispatch.states, [
    { state: "0x008c", destination: "0x00460525" },
    { state: "0x0096", destination: "0x00460538" },
  ]);
  assert.equal(report.palettePaths.landingTitle.value, "pal\\initmenu.pal");
  assert.equal(report.palettePaths.stageFlow.value, "pal\\imjin2.pal");
  assert.equal(report.palettePaths.stageResources.length, 5);
  assert.deepEqual(report.sourceAssets.stagePaletteMenuButtonCatalog, {
    id: "stage-palette-menu-button-catalog",
    sourcePath: "yfnt/gamemenubutton.spr",
    sha256: "ec73af9d1d5c739a8fd40fa9436a77fc92eb13f5ebb99a745d1279244129c387",
    paletteId: "imjin2",
  });
  assert.match(report.catalogUse, /Catalog-only/u);
  assert.match(report.catalogUse, /stage Back control/u);
  assert.match(report.unresolvedUseSite, /No original Back-control use-site is claimed/u);

  for (const vector of fixture.vectors) {
    assert.deepEqual(reproduceMainMenuPaletteSelection(vector.input), vector.expected, vector.id);
  }
});

test("rejects tampered executable, static artifacts, and source sprite evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-main-menu-palette-state-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const alteredExecutable = join(directory, "imjinrok2.exe");
  copyFileSync(executablePath, alteredExecutable);
  flipByte(alteredExecutable, 0x00440553 - 0x00400000);
  assert.throws(() => verifyMainMenuPaletteStateVector({ executablePath: alteredExecutable, referencesPath, jumpTablesPath }), /imjinrok2\.exe SHA-256 mismatch/u);

  const alteredReferences = join(directory, "references.json");
  copyFileSync(referencesPath, alteredReferences);
  flipByte(alteredReferences, 0);
  assert.throws(() => verifyMainMenuPaletteStateVector({ executablePath, referencesPath: alteredReferences, jumpTablesPath }), /references\.json SHA-256 mismatch/u);

  const alteredJumpTables = join(directory, "jump-tables.json");
  copyFileSync(jumpTablesPath, alteredJumpTables);
  flipByte(alteredJumpTables, 0);
  assert.throws(() => verifyMainMenuPaletteStateVector({ executablePath, referencesPath, jumpTablesPath: alteredJumpTables }), /jump-tables\.json SHA-256 mismatch/u);

  const alteredOriginalRoot = join(directory, "original");
  const alteredButton = join(alteredOriginalRoot, "yfnt/gamemenubutton.spr");
  mkdirSync(join(alteredOriginalRoot, "yfnt"), { recursive: true });
  copyFileSync(resolve(repositoryRoot, "original/imjinrok2/yfnt/gamemenubutton.spr"), alteredButton);
  flipByte(alteredButton, 0);
  assert.throws(() => verifyMainMenuPaletteStateVector({ originalRoot: alteredOriginalRoot, executablePath, referencesPath, jumpTablesPath }), /yfnt\/gamemenubutton\.spr SHA-256 mismatch/u);
});

test("rejects a palette-selection vector outside the static scope", () => {
  assert.throws(() => reproduceMainMenuPaletteSelection({ view: "menu-button" }), /input\.view/u);
});

function flipByte(path, offset) {
  const bytes = readFileSync(path);
  bytes[offset] ^= 0xff;
  writeFileSync(path, bytes);
}
