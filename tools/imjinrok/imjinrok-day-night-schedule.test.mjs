import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_REFERENCES_SHA256,
  createImjinrokDayNightScheduleFixture,
  createInitialDayNightState,
  extractImjinrokDayNightSchedule,
  reproduceDayNightUpdate,
  reproduceForcedDayNightPalette,
} from "./extract-imjinrok-day-night-schedule.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalRoot = join(repositoryRoot, "original/imjinrok2");
const executablePath = join(originalRoot, "imjinrok2.exe");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixturePath = join(repositoryRoot, "analysis/fixtures/imjinrok-day-night-schedule-vectors.json");
const fixtureBytes = readFileSync(fixturePath, "utf8");
const fixture = JSON.parse(fixtureBytes);

test("hash-binds original palettes and static day/night state/event schedule", () => {
  assert.deepEqual(fixture, createImjinrokDayNightScheduleFixture());
  assert.equal(fixtureBytes, `${JSON.stringify(createImjinrokDayNightScheduleFixture())}\n`);
  const report = extractImjinrokDayNightSchedule({ executablePath, referencesPath, originalRoot });
  assert.equal(report.sources.executable.sha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(report.sources.references.sha256, EXPECTED_REFERENCES_SHA256);
  assert.deepEqual(report.sources.palettes.map(({ id, bytes }) => ({ id, bytes })), [
    { id: "imjin2", bytes: 768 }, { id: "night1", bytes: 768 }, { id: "night2", bytes: 768 }, { id: "night3", bytes: 768 }, { id: "night4", bytes: 768 },
  ]);
  assert.deepEqual(report.constructorState, createInitialDayNightState());
  assert.deepEqual(report.timing, { subTicksPerPhase: 540, phasesPerCycle: 16, admittedUpdatesPerCycle: 8640, admittedUpdatesToPhase8Boundary: 4320 });
  assert.equal(report.referenceEdges.length, 23);
  assert.ok(report.rawCodeRanges.some(({ id }) => id === "palette-apply-boundary"));
});

test("reproduces every scheduled palette event in original operation order", () => {
  for (const vector of fixture.vectors) {
    if (vector.id === "constructor-initial-state") continue;
    assert.deepEqual(reproduceDayNightUpdate(vector.input), vector.expected, vector.id);
  }
  for (const vector of fixture.forceVectors) assert.deepEqual(reproduceForcedDayNightPalette(vector.input), vector.expected, vector.id);
});

test("rejects malformed synthetic state instead of inventing an original transition", () => {
  assert.throws(() => reproduceDayNightUpdate({ state: { ...createInitialDayNightState(), phase: 16 } }), /input\.state\.phase must be an integer/u);
  assert.throws(() => reproduceDayNightUpdate({ state: { ...createInitialDayNightState(), subTick: -1 } }), /input\.state\.subTick must be an integer/u);
  assert.throws(() => reproduceDayNightUpdate({ state: { ...createInitialDayNightState(), advanceGate: "paused" } }), /input\.state\.advanceGate must be an integer/u);
  assert.throws(() => reproduceForcedDayNightPalette({ phaseLightFlag: 1.5 }), /phaseLightFlag must be an integer/u);
});

test("rejects tampered executable, each palette, and stale analysis", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-day-night-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const alteredReferencesPath = join(directory, "references.json");
  copyFileSync(executablePath, alteredExecutablePath);
  copyFileSync(referencesPath, alteredReferencesPath);
  flipByte(alteredExecutablePath, 0x492510 - 0x400000);
  writeFileSync(alteredReferencesPath, `${JSON.stringify({ stale: true })}\n`);
  assert.throws(() => extractImjinrokDayNightSchedule({ executablePath: alteredExecutablePath, referencesPath, originalRoot }), /imjinrok2\.exe SHA-256 mismatch/u);
  assert.throws(() => extractImjinrokDayNightSchedule({ executablePath, referencesPath: alteredReferencesPath, originalRoot }), /references\.json SHA-256 mismatch/u);

  for (const name of ["imjin2", "night1", "night2", "night3", "night4"]) {
    const paletteRoot = join(directory, name);
    copyPaletteInputs(paletteRoot);
    flipByte(join(paletteRoot, `pal/${name}.pal`), 0);
    assert.throws(() => extractImjinrokDayNightSchedule({ executablePath, referencesPath, originalRoot: paletteRoot }), new RegExp(`${name}\\.pal SHA-256 mismatch`, "u"));
  }
});

function copyPaletteInputs(destinationRoot) {
  for (const name of ["imjin2", "night1", "night2", "night3", "night4"]) {
    const destination = join(destinationRoot, `pal/${name}.pal`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(originalRoot, `pal/${name}.pal`), destination);
  }
}

function flipByte(path, offset) {
  const bytes = readFileSync(path);
  bytes[offset] ^= 0xff;
  writeFileSync(path, bytes);
}
