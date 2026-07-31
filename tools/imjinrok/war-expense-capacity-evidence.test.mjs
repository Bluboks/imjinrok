import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EXPECTED_REFERENCES_SHA256,
  EXPECTED_SEEDS_SHA256,
  extractWarExpenseCapacityEvidence,
  replayWarExpenseScenario,
} from "./extract-war-expense-capacity-evidence.mjs";

test("war-expense extractor is hash-bound and its bounded replay vectors agree with the fixture", () => {
  const report = extractWarExpenseCapacityEvidence();
  const fixture = JSON.parse(readFileSync("analysis/fixtures/war-expense-capacity-vectors.json", "utf8"));
  assert.deepEqual(report, fixture);
  assert.equal(report.vectors.find((vector) => vector.input.id === "immediate-normal-count-full").output.reason, "entity-count");
  assert.equal(report.vectors.find((vector) => vector.input.id === "reservation-capacity-failure").output.reason, "war-expense");
  assert.equal(report.vectors.find((vector) => vector.input.id === "action-115-class-76-zero-cost").output.state.liveExpense, 2500);
  assert.equal(report.action115.producedInternalClass, 76);
  assert.equal(report.action115.typeField0x0eExpense, 0);
  assert.equal(report.action115.provenance.persistentSelectionActionEvidence.sourceReferencesSha256, EXPECTED_REFERENCES_SHA256);
  assert.equal(report.action115.provenance.canonicalEntityTypeCatalog.sourceSeedsSha256, EXPECTED_SEEDS_SHA256);
  assert.deepEqual(report.flag0x2BuildingCategory.types.map(({ internalClass }) => internalClass), Array.from({ length: 35 }, (_, index) => index + 40));
  assert.equal(report.maximumWriterScope.directReferenceSet.count, 6);
  assert.deepEqual(report.maximumWriterScope.directReferenceSet.directWriteReferences.map(({ from, fromFunctionEntry }) => ({ from, fromFunctionEntry })), [{ from: "0x004457e4", fromFunctionEntry: "0x004457d0" }]);
});

test("war-expense replay covers transfer ordering and the separate signed building-category gate", () => {
  const fixture = extractWarExpenseCapacityEvidence();
  const transfer = fixture.vectors.find((vector) => vector.input.id === "reserve-refund-completion-transfer").output;
  assert.deepEqual(transfer.handoffOrder, ["producer-pending-subtract", "player-pending-subtract", "constructor-handoff", "live-add"]);
  assert.deepEqual(transfer.completion, { resourceA: 230, resourceB: 120, liveCount: 5, liveExpense: 2300, pendingExpense: 100, producerPendingExpense: 0, maxExpense: 2500 });
  const addRemove = fixture.vectors.find((vector) => vector.input.id === "add-remove").output;
  assert.deepEqual(addRemove.remove, { liveCount: 4, liveExpense: 200, rawFlag2Count: 1 });
  const byId = (id) => fixture.vectors.find((vector) => vector.input.id === id).output;
  assert.deepEqual(byId("flag-0x2-category-count-49-accept"), { id: "flag-0x2-category-count-49-accept", operation: "flag-0x2-category-admission", accepted: true, gateApplied: true, reason: "accepted", limit: 50 });
  assert.deepEqual(byId("flag-0x2-category-count-50-reject"), { id: "flag-0x2-category-count-50-reject", operation: "flag-0x2-category-admission", accepted: false, gateApplied: true, reason: "building-category-count", limit: 50 });
  assert.deepEqual(byId("flag-0x2-category-global-bypass"), { id: "flag-0x2-category-global-bypass", operation: "flag-0x2-category-admission", accepted: true, gateApplied: false, reason: "gate-bypassed", limit: 50 });
  assert.deepEqual(byId("flag-0x2-category-signed-division"), { id: "flag-0x2-category-signed-division", operation: "flag-0x2-category-admission", accepted: true, gateApplied: true, reason: "accepted", limit: -1 });
  assert.throws(() => replayWarExpenseScenario({ operation: "unknown" }), /Unknown war-expense vector operation/);
});

test("war-expense extractor rejects a changed executable", () => {
  const directory = mkdtempSync(join(tmpdir(), "war-expense-capacity-"));
  const altered = join(directory, "imjinrok2.exe");
  copyFileSync("original/imjinrok2/imjinrok2.exe", altered);
  const bytes = readFileSync(altered);
  bytes[bytes.length - 1] ^= 0xff;
  writeFileSync(altered, bytes);
  assert.throws(() => extractWarExpenseCapacityEvidence({ executablePath: altered }), /SHA-256/);
});

test("war-expense extractor rejects altered generated reference and seed provenance", () => {
  const directory = mkdtempSync(join(tmpdir(), "war-expense-provenance-"));
  const alteredReferences = join(directory, "references.json");
  const alteredSeeds = join(directory, "seeds.json");
  copyFileSync("analysis/generated/imjinrok2/references.json", alteredReferences);
  copyFileSync("analysis/generated/imjinrok2/seeds.json", alteredSeeds);
  writeFileSync(alteredReferences, `${readFileSync(alteredReferences, "utf8")}\n`);
  writeFileSync(alteredSeeds, `${readFileSync(alteredSeeds, "utf8")}\n`);
  assert.throws(() => extractWarExpenseCapacityEvidence({ referencesPath: alteredReferences }), /SHA-256/);
  assert.throws(() => extractWarExpenseCapacityEvidence({ seedsPath: alteredSeeds }), /SHA-256/);
});
