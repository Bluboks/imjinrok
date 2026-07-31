import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { extractBuildingDemolitionEvidence, replayBuildingDemolition } from "./extract-building-demolition-evidence.mjs";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../analysis/fixtures/building-demolition-evidence.json"), "utf8"));

test("hash-bound demolition evidence reproduces phases, completion, and the ship-only transform", () => {
  const report = extractBuildingDemolitionEvidence();
  assert.equal(report.statuses.analysis, "static-confirmed-for-bounded-action-13-progress-refund-and-ship-transform");
  assert.equal(report.labels.label, "해체");
  assert.equal(report.labels.help, "건물을 해체하여 없앱니다.");
  assert.equal(report.source.executable.sha256, fixture.source.executableSha256);
  assert.equal(report.source.functions.sha256, fixture.source.functionsSha256);
  assert.equal(report.source.references.sha256, fixture.source.referencesSha256);
  assert.equal(report.source.entityTypeCatalog.sha256, fixture.source.entityTypeCatalogSha256);
  const { runtimeLabelVa, ...sourceLabels } = report.labels;
  assert.equal(runtimeLabelVa, "0x00aa4b88");
  assert.deepEqual(sourceLabels, fixture.labels);
  assert.deepEqual(report.completion.flag0x10.exactClasses.map(({ internalClass }) => internalClass), [18, 19, 26, 27, 29, 30, 38]);
  assert.deepEqual(report.completion.flag0x10.exactClasses.map(({ internalClass }) => internalClass), fixture.flag0x10Classes);
  assert.deepEqual(report.completion.flag0x10.constructedClass, { internalClass: 75, originalGameplayName: "일본 건설수레", spritePath: "char/carj.spr" });
  const byId = (id) => report.vectors.find(({ input }) => input.id === id).output;
  assert.deepEqual(byId("phase-boundaries").phases, [
    { progress: 0, phase: 0 }, { progress: 9, phase: 0 }, { progress: 10, phase: 1 }, { progress: 19, phase: 1 },
    { progress: 20, phase: 2 }, { progress: 29, phase: 2 }, { progress: 30, phase: 3 }, { progress: 39, phase: 3 },
    { progress: 40, phase: 4 }, { progress: 49, phase: 4 }, { progress: 50, phase: 5 }, { progress: 69, phase: 5 },
    { progress: 70, phase: 6 }, { progress: 99, phase: 6 }, { progress: 100, phase: 7 },
  ]);
  assert.deepEqual(byId("phase-boundaries").phases.map(({ progress, phase }) => [progress, phase]), fixture.phaseBoundaries);
  assert.deepEqual(byId("decrement-two-noncompletion").state, { progress: 1, maximumHealth: 1000, currentHealth: 10 });
  assert.deepEqual(
    { completed: byId("decrement-two-noncompletion").completed, progress: byId("decrement-two-noncompletion").state.progress, currentHealth: byId("decrement-two-noncompletion").state.currentHealth },
    fixture.vectors.decrementTwo.output,
  );
  assert.deepEqual(byId("decrement-one-last-step").state, { progress: 0, maximumHealth: 1000, currentHealth: 1 });
  assert.deepEqual(byId("decrement-underflow-completion"), { id: "decrement-underflow-completion", operation: "decrement", completed: true, state: { progress: 0, maximumHealth: 1000, currentHealth: 7 } });
  assert.deepEqual(byId("nonship-completion-refund").transformation, null);
  assert.deepEqual(byId("ship-completion-refund-and-transform").transformation, { removeOldEntity: true, internalClass: 75, entityIdentifier: 5, owner: 1, destination: { x: 19, y: 30 } });
});

test("demolition evidence rejects tampered EXE, generated analysis, and unknown vectors", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "building-demolition-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutable = join(directory, "imjinrok2.exe");
  const alteredCatalog = join(directory, "entity-type-catalog.json");
  const alteredFunctions = join(directory, "functions.json");
  const alteredReferences = join(directory, "references.json");
  copyFileSync("original/imjinrok2/imjinrok2.exe", alteredExecutable);
  copyFileSync("analysis/generated/entity-type-catalog.json", alteredCatalog);
  copyFileSync("analysis/generated/imjinrok2/functions.json", alteredFunctions);
  copyFileSync("analysis/generated/imjinrok2/references.json", alteredReferences);
  const executableBytes = readFileSync(alteredExecutable);
  executableBytes[0x100] ^= 0xff;
  writeFileSync(alteredExecutable, executableBytes);
  writeFileSync(alteredCatalog, `${readFileSync(alteredCatalog, "utf8")}\n`);
  writeFileSync(alteredFunctions, `${readFileSync(alteredFunctions, "utf8")}\n`);
  writeFileSync(alteredReferences, `${readFileSync(alteredReferences, "utf8")}\n`);
  assert.throws(() => extractBuildingDemolitionEvidence({ executablePath: alteredExecutable }), /SHA-256/);
  assert.throws(() => extractBuildingDemolitionEvidence({ catalogPath: alteredCatalog }), /SHA-256/);
  assert.throws(() => extractBuildingDemolitionEvidence({ functionsPath: alteredFunctions }), /SHA-256/);
  assert.throws(() => extractBuildingDemolitionEvidence({ referencesPath: alteredReferences }), /SHA-256/);
  assert.throws(() => replayBuildingDemolition({ operation: "unknown" }), /Unknown building-demolition vector operation/);
});
