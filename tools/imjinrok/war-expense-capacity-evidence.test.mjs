import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
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
});

test("war-expense replay covers reserve-refund-completion ordering and raw flag-0x2 accounting", () => {
  const fixture = extractWarExpenseCapacityEvidence();
  const transfer = fixture.vectors.find((vector) => vector.input.id === "reserve-refund-completion-transfer").output;
  assert.deepEqual(transfer.handoffOrder, ["producer-pending-subtract", "player-pending-subtract", "constructor-handoff", "live-add"]);
  assert.deepEqual(transfer.completion, { resourceA: 230, resourceB: 120, liveCount: 5, liveExpense: 2300, pendingExpense: 100, producerPendingExpense: 0, maxExpense: 2500 });
  const addRemove = fixture.vectors.find((vector) => vector.input.id === "add-remove").output;
  assert.deepEqual(addRemove.remove, { liveCount: 4, liveExpense: 200, rawFlag2Count: 1 });
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
