import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractSourcePathfindingEvidence,
  frontierCapacityForChebyshevDistance,
  replaySourcePathfinding,
  selectStrictSmallestScore,
  sourceHelperCandidateVector,
  sourceSearchCandidateVector,
  sourceFootprintBlocked,
} from "./extract-source-pathfinding-evidence.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
  fixturePath: join(root, "analysis/fixtures/source-pathfinding-evidence.json"),
};
const entity = { width: 1, height: 1, mask: 1 };

test("extracts the hash-bound bounded pathfinding evidence fixture", () => {
  const report = extractSourcePathfindingEvidence();
  assert.deepEqual(report, JSON.parse(readFileSync(paths.fixturePath, "utf8")));
  assert.equal(report.functionEvidence.length, 6);
  assert.equal(report.callEdges.length, 7);
  assert.equal(report.testVectors.capAndFailure.frontierCapacity.reason, "frontier-capacity");
  assert.equal(report.testVectors.capAndFailure.acceptedNodeLimit.returnValue, -1);
  assert.deepEqual(report.candidateStateMachine.helperVector.map(({ state, nextState }) => [state, nextState]), [[2, 4], [4, 8], [8, 1], [1, 3], [3, 6], [6, 12], [12, 9], [9, 2]]);
  assert.deepEqual(report.candidateStateMachine.searchVector.map(({ coordinate }) => coordinate), [
    { x: 11, y: 10 }, { x: 10, y: 11 }, { x: 9, y: 10 }, { x: 9, y: 9 },
    { x: 11, y: 9 }, { x: 11, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 9 },
  ]);
});

test("reproduces wrapper capacity boundaries, exact candidate order, and strict first-entry ties", () => {
  assert.deepEqual([0, 2, 3, 4, 5].map(frontierCapacityForChebyshevDistance), [26, 26, 40, 40, 80]);
  assert.deepEqual(sourceHelperCandidateVector({ x: 10, y: 10 }).map(({ coordinate }) => coordinate), [
    { x: 11, y: 11 }, { x: 10, y: 12 }, { x: 9, y: 11 }, { x: 9, y: 10 },
    { x: 11, y: 10 }, { x: 11, y: 12 }, { x: 9, y: 12 }, { x: 10, y: 10 },
  ]);
  assert.deepEqual(sourceSearchCandidateVector({ x: 10, y: 10 }).map(({ coordinate }) => coordinate), [
    { x: 11, y: 10 }, { x: 10, y: 11 }, { x: 9, y: 10 }, { x: 9, y: 9 },
    { x: 11, y: 9 }, { x: 11, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 9 },
  ]);
  assert.equal(selectStrictSmallestScore([{ score: 9 }, { score: 4 }, { score: 4 }, { score: 5 }]), 1);
});

test("reproduces goal, strict closest fallback, footprint block/OOB, frontier capacity, and wrapper failure vectors", () => {
  const open = Array(8 * 8).fill(0);
  const goal = replaySourcePathfinding({ start: { x: 2, y: 2 }, goal: { x: 3, y: 2 }, entity, terrain: open, width: 8, height: 8 });
  assert.deepEqual(goal.insertionParentTrace, [{ x: 2, y: 2 }, { x: 3, y: 2 }]);
  assert.equal(goal.reason, "goal");
  assert.equal(goal.acceptedNodeCounter, 1);
  assert.equal(goal.maximumFrontierSize, 1);
  assert.equal(goal.expanded, 1);

  const blockedGoal = [...open];
  blockedGoal[7 * 8 + 7] = 1;
  const partial = replaySourcePathfinding({ start: { x: 2, y: 2 }, goal: { x: 7, y: 7 }, entity, terrain: blockedGoal, width: 8, height: 8 });
  assert.notDeepEqual(partial.endpoint, { x: 7, y: 7 });
  assert.equal(partial.reason, "exhausted");
  assert.equal(sourceFootprintBlocked({ x: 1, y: 1, entity, terrain: [0, 0, 0, 0, 1, 0, 0, 0, 0], width: 3, height: 3 }), true);
  assert.equal(sourceFootprintBlocked({ x: -1, y: 0, entity, terrain: Array(9).fill(0), width: 3, height: 3 }), true);

  const capacity = replaySourcePathfinding({ start: { x: 30, y: 30 }, goal: { x: 0, y: 1 }, entity, terrain: Array(80 * 80).fill(0), width: 80, height: 80 });
  assert.equal(capacity.reason, "frontier-capacity");
  assert.equal(capacity.maximumFrontierSize, capacity.frontierCapacity);
  assert.deepEqual(replaySourcePathfinding({ start: { x: 2, y: 2 }, goal: { x: 3, y: 2 }, entity, terrain: open, width: 8, height: 8, acceptedNodeCounter: 6001 }), { returnValue: -1, reason: "accepted-node-limit" });
});

test("fails closed for malformed pure inputs and hash-bound source tampering", (t) => {
  assert.throws(() => frontierCapacityForChebyshevDistance(-1), /nonnegative integer/u);
  assert.throws(() => sourceHelperCandidateVector({ x: 1.5, y: 0 }), /integer x\/y/u);
  assert.throws(() => sourceSearchCandidateVector({ x: 1.5, y: 0 }), /integer x\/y/u);
  assert.throws(() => selectStrictSmallestScore([]), /non-empty/u);
  assert.throws(() => sourceFootprintBlocked({ x: 0, y: 0, entity, terrain: [], width: 1, height: 1 }), /grid/u);
  assert.throws(() => replaySourcePathfinding({ start: { x: 0, y: 0 }, goal: { x: 1, y: 1 }, entity: { width: 0, height: 1, mask: 1 }, terrain: [0], width: 1, height: 1 }), /positive integer/u);

  const directory = mkdtempSync(join(tmpdir(), "source-pathfinding-evidence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [label, source, option, expected] of [
    ["executable", paths.executablePath, "executablePath", /not an MZ executable|EXE SHA-256/u],
    ["functions", paths.functionsPath, "functionsPath", /functions SHA-256/u],
    ["references", paths.referencesPath, "referencesPath", /references SHA-256/u],
  ]) {
    const target = join(directory, label);
    copyFileSync(source, target);
    const bytes = readFileSync(target);
    bytes[0] ^= 0xff;
    writeFileSync(target, bytes);
    assert.throws(() => extractSourcePathfindingEvidence({ [option]: target }), expected);
  }
});
