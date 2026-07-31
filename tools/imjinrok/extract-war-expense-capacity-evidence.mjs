#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const RAW_CODE_RANGES = [
  ["player-capacity-initializer", 0x004457d0, 0x004457f1, "40c81bdd36d2c6a7a00c904e68ae4dbeab7d3e337cc71bfa5fdec194e0a77058"],
  ["immediate-admission", 0x0047e050, 0x0047e0d0, "8d88f3bf3123ac1cd354de14f20b6d311f9d2cf09277d8c11412ae3b394ab7da"],
  ["immediate-add", 0x0047e0d0, 0x0047e160, "f5b70636b713ff951700edc8f1ae7a3aaadd5880a6cba3334afbf6d4102b2e65"],
  ["immediate-remove", 0x0047e160, 0x0047e300, "175971a36c72685af6dbd9296e14351cda894cdfde805d7de0ff109f62d767b1"],
  ["reservation-refund", 0x0047e300, 0x0047e330, "a5f5053de1f667c6b85d2822910a30af12b4c602cd844454d551f03541a40632"],
  ["reservation-admission", 0x0047e330, 0x0047e3a0, "2bdfc056fb9dd3b9a7505eda68fe264e074d52caf644efa99843f5af60907e42"],
  ["producer-handoff", 0x0042dfb1, 0x0042dfec, "25766a2fb3a053ae60fce8d2ea66220379279734b20ec8d1f0b86775b6c226df"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const STATIC_EVIDENCE = [
  [0x004457d1, "b8 d2 df 82 00 b9 08 00 00 00 ba fa 00 00 00 66 89 50 fe 66 c7 00 c4 09 05 10 2c 00 00 49 75 ef", "eight 0x2c10-byte player records receive +0x1b50=250 and +0x1b52=2500"],
  [0x0047e050, "66 83 7c 24 08 01 75 16 66 8b 81 4a 1b 00 00 66 3b 81 50 1b 00 00 7c 21", "normal immediate admission requires live entity count below +0x1b50"],
  [0x0047e06e, "0f bf 91 50 1b 00 00 0f bf 81 4a 1b 00 00 83 ea 06 3b c2 7c 06", "alternate immediate admission requires live entity count below +0x1b50 minus six"],
  [0x0047e09a, "0f bf b1 4c 1b 00 00 0f bf 04 85 1e 2e 88 00 0f bf 89 52 1b 00 00 03 c6 5e 3b c1 7e 06", "immediate admission accepts live expense plus produced type +0x0e when it is at most +0x1b52"],
  [0x0047e106, "66 ff 81 4a 1b 00 00", "immediate add increments live entity count"],
  [0x0047e136, "66 01 91 4c 1b 00 00", "immediate add increases live war-expense sum by type +0x0e"],
  [0x0047e20c, "66 ff 89 4a 1b 00 00", "immediate removal decrements live entity count"],
  [0x0047e23a, "66 29 91 4c 1b 00 00", "immediate removal subtracts type +0x0e from live war-expense sum"],
  [0x0047e31d, "8b 46 10 2b c2 89 46 10", "refund subtracts the produced type expense from player pending expense +0x10"],
  [0x0047e349, "0f bf 8e 4c 1b 00 00 8b 7c 24 18 8b 56 10 03 cf 03 ca 0f bf 96 52 1b 00 00 3b ca 7f 2b", "reservation checks live plus pending plus new expense against +0x1b52 before adding pending expense"],
  [0x0042dfb1, "66 8b 04 95 1e 2e 88 00 66 29 86 f0 03 00 00", "producer pending expense is subtracted immediately before constructor handoff"],
  [0x0042dfc8, "0f bf 14 95 1e 2e 88 00 8d 04 40 8d 0c 80 c1 e1 04 8d 81 90 c4 82 00 8b 89 90 c4 82 00 2b ca", "player pending expense is subtracted immediately before constructor handoff"],
  [0x0047e5ba, "0f bf 85 4c 1b 00 00 03 f2 8d 54 24 20 52 8b 55 10 03 c2", "UI numerator is live expense + pending expense"],
  [0x0047e66b, "0f bf 95 52 1b 00 00", "UI denominator reads maximum war expense +0x1b52"],
  [0x0049142a, "bf 48 7a 4c 00 f2 ae f7 d1 2b f9 8b c1 8b f7 8b fb 8d 9a 10 28 00", "FUN_0048ea90 copies the source CP949 shortage message into runtime message storage"],
  [0x004c7a48, "c0 fc ba f1 b0 a1 20 ba ce c1 b7 c7 d5 b4 cf b4 d9 2e", "CP949 source string is 전비가 부족합니다."],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const VECTORS = [
  { id: "initialization", operation: "initialize" },
  { id: "immediate-normal-count-last-slot", operation: "immediate-admission", state: { liveCount: 249, liveExpense: 0, pendingExpense: 0, maxCount: 250, maxExpense: 2500 }, typeExpense: 1, countMode: "normal" },
  { id: "immediate-normal-count-full", operation: "immediate-admission", state: { liveCount: 250, liveExpense: 0, pendingExpense: 0, maxCount: 250, maxExpense: 2500 }, typeExpense: 0, countMode: "normal" },
  { id: "immediate-alternate-count-last-slot", operation: "immediate-admission", state: { liveCount: 243, liveExpense: 0, pendingExpense: 0, maxCount: 250, maxExpense: 2500 }, typeExpense: 0, countMode: "alternate" },
  { id: "immediate-alternate-count-full", operation: "immediate-admission", state: { liveCount: 244, liveExpense: 0, pendingExpense: 0, maxCount: 250, maxExpense: 2500 }, typeExpense: 0, countMode: "alternate" },
  { id: "immediate-expense-equal-maximum", operation: "immediate-admission", state: { liveCount: 0, liveExpense: 2499, pendingExpense: 0, maxCount: 250, maxExpense: 2500 }, typeExpense: 1, countMode: "normal" },
  { id: "immediate-expense-over-maximum", operation: "immediate-admission", state: { liveCount: 0, liveExpense: 2500, pendingExpense: 0, maxCount: 250, maxExpense: 2500 }, typeExpense: 1, countMode: "normal" },
  { id: "reservation-success", operation: "reserve", state: { resourceA: 300, resourceB: 200, liveExpense: 2200, pendingExpense: 100, maxExpense: 2500 }, resourceA: 70, resourceB: 80, typeExpense: 100 },
  { id: "reservation-capacity-failure", operation: "reserve", state: { resourceA: 300, resourceB: 200, liveExpense: 2200, pendingExpense: 201, maxExpense: 2500 }, resourceA: 70, resourceB: 80, typeExpense: 100 },
  { id: "reservation-resource-b-failure", operation: "reserve", state: { resourceA: 300, resourceB: 79, liveExpense: 0, pendingExpense: 0, maxExpense: 2500 }, resourceA: 70, resourceB: 80, typeExpense: 100 },
  { id: "reserve-refund-completion-transfer", operation: "reserve-refund-complete", state: { resourceA: 300, resourceB: 200, liveCount: 4, liveExpense: 2200, pendingExpense: 100, producerPendingExpense: 100, maxExpense: 2500 }, resourceA: 70, resourceB: 80, typeExpense: 100 },
  { id: "add-remove", operation: "add-remove", state: { liveCount: 4, liveExpense: 200, rawFlag2Count: 1 }, typeExpense: 50, typeFlags: 2 },
  { id: "action-115-class-76-zero-cost", operation: "zero-cost-hero", state: { resourceA: 300, resourceB: 200, liveCount: 249, liveExpense: 2500, pendingExpense: 0, maxCount: 250, maxExpense: 2500 }, action: 115, internalClass: 76, typeExpense: 0 },
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = readOutputPath(process.argv.slice(2));
  const report = extractWarExpenseCapacityEvidence();
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, text);
  else process.stdout.write(text);
}

export function extractWarExpenseCapacityEvidence({
  executablePath = "original/imjinrok2/imjinrok2.exe",
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  return {
    schemaVersion: 1,
    question: "What static player-record fields and ordered original paths admit, reserve, refund, transfer, remove, and display war expense, and does a confirmed runtime writer increase the maximum?",
    analysisStatus: "static-confirmed-for-bounded-war-expense-capacity-flow",
    reproductionStatus: "reproduction-complete-for-bounded-admission-reservation-transfer-and-removal",
    implementationStatus: "analysis-only-no-gameplay-change",
    source: { executablePath, executableSha256: EXPECTED_EXECUTABLE_SHA256 },
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    evidencePoints: STATIC_EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    playerRecord: {
      base: "0x0082c480", stride: "0x2c10", count: 8,
      fields: {
        liveEntityCount: { offset: "+0x1b4a", width: "signed WORD" },
        maximumEntityCount: { offset: "+0x1b50", width: "signed WORD", initialValue: 250 },
        liveWarExpense: { offset: "+0x1b4c", width: "signed WORD" },
        rawFlag0x2CategoryCount: { offset: "+0x1b4e", width: "signed WORD", meaning: "raw type-flag 0x2 category; not classified as buildings" },
        maximumWarExpense: { offset: "+0x1b52", width: "signed WORD", initialValue: 2500 },
        pendingWarExpense: { offset: "+0x10", width: "DWORD" },
      },
    },
    message: {
      sourceVa: "0x004c7a48", encoding: "CP949", text: "전비가 부족합니다.",
      copier: "FUN_0048ea90", copyVa: "0x0049142a", runtimeMessageTable: "0x00aa67e8",
    },
    paths: {
      immediateAdmission: "FUN_0047e050: count normal < max, alternate < max-6; then live+type(+0x0e) <= max expense",
      add: "FUN_0047e0d0: increments live count and adds type +0x0e to live expense; flag 0x2 increments only the raw category count",
      remove: "FUN_0047e160: removes matching live entity, decrements live count and subtracts type +0x0e; flag 0x2 decrements only the raw category count",
      reserve: "FUN_0047e330: resource checks precede live+pending+new expense <= maximum; success deducts both resources and adds pending expense",
      refund: "FUN_0047e300: refunds both resources and subtracts pending expense",
      completion: "FUN_0042de00 at 0x0042dfb1..0x0042dfeb subtracts producer and player pending expense immediately before constructor handoff",
      ui: "FUN_0047e400 formats live+pending at 0x0047e5ba and maximum at 0x0047e66b",
    },
    action115: { action: 115, producedInternalClass: 76, originalGameplayName: "권율", typeField0x0eExpense: 0 },
    maximumWriterScope: {
      directReferenceSet: "No runtime writer to player +0x1b52 was found in the complete direct-reference set outside initialization.",
      unresolved: ["alias writers", "save/load writers", "map writers", "script writers"],
      conclusion: "A remembered recruit/general-count cap increase is not confirmed and must not be implemented as original-game behavior.",
    },
    vectors: VECTORS.map((input) => ({ input, output: replayWarExpenseScenario(input) })),
  };
}

export function replayWarExpenseScenario(vector) {
  switch (vector.operation) {
    case "initialize":
      return { id: vector.id, operation: vector.operation, accepted: true, state: { playerCount: 8, playerRecordStride: "0x2c10", maximumEntityCount: 250, maximumWarExpense: 2500 } };
    case "immediate-admission":
      return replayImmediateAdmission(vector);
    case "reserve":
      return replayReserve(vector);
    case "reserve-refund-complete":
      return replayReserveRefundComplete(vector);
    case "add-remove":
      return replayAddRemove(vector);
    case "zero-cost-hero":
      return replayZeroCostHero(vector);
    default:
      throw new TypeError(`Unknown war-expense vector operation: ${vector.operation}`);
  }
}

function replayImmediateAdmission(vector) {
  const { state, typeExpense, countMode } = vector;
  const countLimit = state.maxCount - (countMode === "alternate" ? 6 : 0);
  const accepted = state.liveCount < countLimit && state.liveExpense + typeExpense <= state.maxExpense;
  return { id: vector.id, operation: vector.operation, accepted, reason: accepted ? "accepted" : state.liveCount >= countLimit ? "entity-count" : "war-expense", state: { ...state }, countLimit };
}

function replayReserve(vector) {
  const { state, resourceA, resourceB, typeExpense } = vector;
  const capacity = state.liveExpense + state.pendingExpense + typeExpense <= state.maxExpense;
  const resourceBOk = state.resourceB >= resourceB;
  const resourceAOk = state.resourceA >= resourceA;
  const accepted = resourceBOk && resourceAOk && capacity;
  const reason = !resourceBOk ? "resource-b" : !resourceAOk ? "resource-a" : !capacity ? "war-expense" : "accepted";
  return { id: vector.id, operation: vector.operation, accepted, reason, state: accepted ? { ...state, resourceA: state.resourceA - resourceA, resourceB: state.resourceB - resourceB, pendingExpense: state.pendingExpense + typeExpense } : { ...state } };
}

function replayReserveRefundComplete(vector) {
  const reserved = replayReserve({ ...vector, id: "reserve" });
  if (!reserved.accepted) throw new Error("transfer vector must reserve successfully");
  const refunded = { ...reserved.state, resourceA: reserved.state.resourceA + vector.resourceA, resourceB: reserved.state.resourceB + vector.resourceB, pendingExpense: reserved.state.pendingExpense - vector.typeExpense };
  const completionInput = { ...reserved.state, producerPendingExpense: vector.state.producerPendingExpense - vector.typeExpense, pendingExpense: reserved.state.pendingExpense - vector.typeExpense };
  const completed = { ...completionInput, liveCount: completionInput.liveCount + 1, liveExpense: completionInput.liveExpense + vector.typeExpense };
  return { id: vector.id, operation: vector.operation, accepted: true, reservation: reserved.state, refund: refunded, completion: completed, handoffOrder: ["producer-pending-subtract", "player-pending-subtract", "constructor-handoff", "live-add"] };
}

function replayAddRemove(vector) {
  const added = { ...vector.state, liveCount: vector.state.liveCount + 1, liveExpense: vector.state.liveExpense + vector.typeExpense, rawFlag2Count: vector.state.rawFlag2Count + (vector.typeFlags & 2 ? 1 : 0) };
  const removed = { ...added, liveCount: added.liveCount - 1, liveExpense: added.liveExpense - vector.typeExpense, rawFlag2Count: added.rawFlag2Count - (vector.typeFlags & 2 ? 1 : 0) };
  return { id: vector.id, operation: vector.operation, accepted: true, add: added, remove: removed };
}

function replayZeroCostHero(vector) {
  const admitted = replayImmediateAdmission({ ...vector, operation: "immediate-admission", countMode: "normal" });
  const reserved = replayReserve({ ...vector, operation: "reserve", resourceA: 0, resourceB: 0 });
  const state = { ...reserved.state, liveCount: reserved.state.liveCount + 1, liveExpense: reserved.state.liveExpense + vector.typeExpense };
  return { id: vector.id, operation: vector.operation, accepted: admitted.accepted && reserved.accepted, action: vector.action, internalClass: vector.internalClass, typeExpense: vector.typeExpense, state };
}

function readOutputPath(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--json")) return undefined;
  if (argv.length === 2 && argv[0] === "--output" && argv[1]) return argv[1];
  throw new Error("Usage: extract-war-expense-capacity-evidence.mjs [--json | --output <path>]");
}
