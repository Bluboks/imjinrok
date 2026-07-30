#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";
import { assertEqual, readJson, readVaRange, sha256, verifyEvidencePoint } from "./static-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_EXECUTABLE_PATH = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const DEFAULT_FUNCTIONS_PATH = resolve(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const DEFAULT_REFERENCES_PATH = resolve(repositoryRoot, "analysis/generated/imjinrok2/references.json");

const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const EXPECTED_FUNCTIONS_SHA256 = "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";
const GRID_STRIDE = 180;
const SEARCH_RADIUS = 25;
const ACCEPTED_NODE_LIMIT = 6000;

const FUNCTIONS = [
  ["0x00445290", "0x00445290-0x0044532d", 158, 58, "02f38d2a527b4e57521e7872f0d0f8c6952b9cad70044dbe7a1dffa672fc3438", "b89a78740b6007a97dd3c687ca0e035ba74915250c1ea5d45dc0ae802c9a2b0f", ["0x00444770"]],
  ["0x00444770", "0x00444770-0x00444ce4", 1397, 383, "44e5d64b8a8b01276423b15fdb68d7d8d4b3dd0ec5c73081810e7aef23b5011a", "3342eaab6b3289ac76bba21d795d71c692d1ac0a46ecbf2cb415e39803c247ea", ["0x0043ab70", "0x00444570", "0x004446a0", "0x0044b040"]],
  ["0x00444570", "0x00444570-0x0044466a", 251, 58, "ac0351e5b33f4f7418d7a381ece37ce8b9aa037f2bcfb956a9194194b471f47d", "0e26f93259a3b110ef020d0c91fade0679f112a4aed9518f1fbe496e6e88ecb0", []],
  ["0x004446a0", "0x004446a0-0x00444763", 196, 66, "f9f19244c7dbc7349fab455704299a04d73fa72be761df96ac3356acce3d1fac", "8276db9fd7f7e530607985c3aa97d7b254358bfdad9a6e1efea73485a3f4ec30", []],
  ["0x0043ab70", "0x0043ab70-0x0043ac4e", 223, 75, "e95b93ccd4bf91701b1272d599ef74819478bc0a1bf02e21b080bb2fc5fd013c", "1f6ecacdc308408fcfe5a848d5ead88f3a90bf307daa7c19d29119d7b8527648", []],
  ["0x00425b20", "0x00425b20-0x004262df", 1984, 506, "088a31ecaf83338b1823a4a21e14bb859690289d56f8bc53338145492a8e24c7", "a93987a8afa19da86d5c0fa478b0d902c2898970fda86a64229d2bca45e75d0f", ["0x00425a50", "0x00426680", "0x004266d0", "0x00438310", "0x00438460", "0x0043ac50", "0x0043d450", "0x0043d540", "0x00442770", "0x00445290", "0x00465010"]],
];

const REQUIRED_CALLS = [
  ["0x00425b20", "0x00425c59", "0x00445290"],
  ["0x00445290", "0x00445321", "0x00444770"],
  ["0x00444770", "0x00444957", "0x0043ab70"],
  ["0x00444770", "0x00444a39", "0x00444570"],
  ["0x00444770", "0x00444bbf", "0x0043ab70"],
  ["0x00444770", "0x00444bf4", "0x00444570"],
  ["0x00444770", "0x00444c95", "0x004446a0"],
];

const EVIDENCE_POINTS = [
  [0x00445290, "66 81 3d 24 66 7c 00 70 17 7e 04 83 c8 ff c3", "wrapper rejects with -1 when WORD 0x007c6624 is greater than 6000"],
  [0x004452e6, "66 3d 03 00 7d 0b 66 c7 05 a0 a8 54 00 1a 00", "Chebyshev distance below 3 selects frontier cap 26"],
  [0x004452f7, "33 c9 66 3d 05 00 0f 9d c1 49 83 e1 d8 83 c1 50", "Chebyshev distance 3..4 selects 40 and 5+ selects 80"],
  [0x004447b5, "b9 a4 1f 00 00 33 c0 bf a4 a8 54 00 0f bf f6 f3 ab", "core clears 0x1fa4 DWORDs at 0x0054a8a4"],
  [0x0044484a, "8b 1c 95 c8 a4 54 00 3b 9f c8 a4 54 00 7d 09", "frontier selection retains the first entry on equal score and replaces only on strict smaller score"],
  [0x004448ac, "8b c7 4a 8d 1c ad c8 a4 54 00 89 3d 38 27 55 00 a3 98 a8 54 00 c7 05 b0 a4 54 00 02 00 00 00 89 15 9c a8 54 00 c7 44 24 24 00 00 00 00", "before the eight helper calls, core initializes the helper globals to selected x and selected y minus 1"],
  [0x004448fd, "8d 59 e7 3b c3 0f 8c 31 01 00 00 83 c1 19 3b c1 0f 8f 26 01 00 00", "candidate x is limited to selected x plus or minus 25 inclusively"],
  [0x00444916, "3b d1 0f 8c 1b 01 00 00 83 c6 19 3b d6 0f 8f 10 01 00 00", "candidate y is limited to selected y plus or minus 25 inclusively"],
  [0x00444940, "0f bf 05 68 27 55 00 8d 14 c0 8d 04 50 8d 04 c0 8d 0c c5 58 52 63 00 e8 14 62 ff ff", "candidate screening calls FUN_0043ab70 with the selected entity profile"],
  [0x00444964, "8b 44 24 3c 8b 74 24 10 66 ff 00", "accepted candidates increment the caller-provided accepted-node WORD"],
  [0x004449be, "2b cb 8b d9 0f af d9 8b c8 0f af c8 8d 04 0b", "candidate score is squared Euclidean distance to requested goal without an accumulated path cost"],
  [0x004449d3, "8b 4c 24 28 3b c1 7d 10", "closest fallback updates only on strict smaller squared distance"],
  [0x00444a39, "e8 32 fb ff ff", "candidate state machine is called once per iteration"],
  [0x00444a42, "40 83 f8 08 89 44 24 24 0f 8c 96 fe ff ff", "the candidate loop makes exactly eight state-machine calls"],
  [0x00444c95, "e8 06 fa ff ff", "non-goal fallback invokes FUN_004446a0 waypoint postprocess"],
  [0x0043abf3, "8d 04 80 8d 04 c0 8d 14 82 66 8b 04 55 e4 27 ae 00 66 85 85 ee 01 00 00", "footprint predicate loads a WORD from 0x00ae27e4 and tests it against entity +0x1ee mask"],
];

const CANDIDATE_STEPS = [
  { state: 2, delta: { x: 1, y: 1 }, nextState: 4 },
  { state: 4, delta: { x: -1, y: 1 }, nextState: 8 },
  { state: 8, delta: { x: -1, y: -1 }, nextState: 1 },
  { state: 1, delta: { x: 0, y: -1 }, nextState: 3 },
  { state: 3, delta: { x: 2, y: 0 }, nextState: 6 },
  { state: 6, delta: { x: 0, y: 2 }, nextState: 12 },
  { state: 12, delta: { x: -2, y: 0 }, nextState: 9 },
  { state: 9, delta: { x: 1, y: -2 }, nextState: 2 },
];

export function frontierCapacityForChebyshevDistance(distance) {
  assertNonnegativeInteger(distance, "distance");
  if (distance < 3) return 26;
  if (distance < 5) return 40;
  return 80;
}

export function sourceHelperCandidateVector(helperOrigin) {
  assertCoordinate(helperOrigin, "helperOrigin");
  let point = { ...helperOrigin };
  return CANDIDATE_STEPS.map(({ state, delta, nextState }) => {
    point = { x: point.x + delta.x, y: point.y + delta.y };
    return { state, nextState, delta, coordinate: point };
  });
}

export function sourceSearchCandidateVector(current) {
  assertCoordinate(current, "current");
  return sourceHelperCandidateVector({ x: current.x, y: current.y - 1 });
}

export function selectStrictSmallestScore(frontier) {
  if (!Array.isArray(frontier) || frontier.length === 0) throw new RangeError("frontier must be non-empty");
  frontier.forEach(({ score }, index) => assertNonnegativeInteger(score, `frontier[${index}].score`));
  let selectedIndex = 0;
  for (let index = 1; index < frontier.length; index += 1) {
    if (frontier[index].score < frontier[selectedIndex].score) selectedIndex = index;
  }
  return selectedIndex;
}

export function sourceFootprintBlocked({ x, y, entity, terrain, width, height }) {
  assertCoordinate({ x, y }, "candidate");
  assertFootprintEntity(entity);
  assertGrid(terrain, width, height);
  for (let dx = 0; dx < entity.width; dx += 1) {
    for (let dy = 0; dy < entity.height; dy += 1) {
      const cellX = x - entity.width + 1 + dx;
      const cellY = y - entity.height + 1 + dy;
      if (cellX < 0 || cellX >= width || cellY < 0 || cellY >= height) return true;
      if ((terrain[cellX * height + cellY] & entity.mask) !== 0) return true;
    }
  }
  return false;
}

// This reference model confines itself to the statically bounded search: it does not assign
// product coordinates or global workspace lifecycle semantics outside this call.
export function replaySourcePathfinding({ start, goal, entity, terrain, width, height, acceptedNodeCounter = 0 }) {
  assertCoordinate(start, "start");
  assertCoordinate(goal, "goal");
  assertFootprintEntity(entity);
  assertGrid(terrain, width, height);
  assertNonnegativeInteger(acceptedNodeCounter, "acceptedNodeCounter");
  if (acceptedNodeCounter > ACCEPTED_NODE_LIMIT) return { returnValue: -1, reason: "accepted-node-limit" };

  const frontierCapacity = frontierCapacityForChebyshevDistance(Math.max(Math.abs(start.x - goal.x), Math.abs(start.y - goal.y)));
  const startKey = coordinateKey(start);
  const visited = new Map([[startKey, { coordinate: { ...start }, depth: 1, parent: null }]]);
  const frontier = [{ coordinate: { ...start }, score: squaredDistance(start, goal) }];
  let closest = frontier[0];
  let expanded = 0;
  let frontierCapReached = false;
  let maximumFrontierSize = frontier.length;

  while (frontier.length > 0) {
    const selected = selectStrictSmallestScore(frontier);
    const current = frontier.splice(selected, 1)[0];
    if (sameCoordinate(current.coordinate, goal)) return finishReplay("goal", current.coordinate, visited, expanded, frontierCapacity, acceptedNodeCounter, maximumFrontierSize);
    for (const candidate of sourceSearchCandidateVector(current.coordinate)) {
      const coordinate = candidate.coordinate;
      if (Math.abs(coordinate.x - start.x) > SEARCH_RADIUS || Math.abs(coordinate.y - start.y) > SEARCH_RADIUS) continue;
      if (visited.has(coordinateKey(coordinate))) continue;
      if (sourceFootprintBlocked({ ...coordinate, entity, terrain, width, height })) continue;
      const record = { coordinate, depth: visited.get(coordinateKey(current.coordinate)).depth + 1, parent: current.coordinate };
      visited.set(coordinateKey(coordinate), record);
      const entry = { coordinate, score: squaredDistance(coordinate, goal) };
      frontier.push(entry);
      maximumFrontierSize = Math.max(maximumFrontierSize, frontier.length);
      acceptedNodeCounter += 1;
      if (entry.score < closest.score) closest = entry;
      if (sameCoordinate(coordinate, goal)) {
        return finishReplay("goal", coordinate, visited, expanded + 1, frontierCapacity, acceptedNodeCounter, maximumFrontierSize);
      }
      if (frontier.length >= frontierCapacity) {
        frontierCapReached = true;
        break;
      }
    }
    expanded += 1;
    if (frontierCapReached) break;
  }

  return finishReplay(frontierCapReached ? "frontier-capacity" : "exhausted", closest.coordinate, visited, expanded, frontierCapacity, acceptedNodeCounter, maximumFrontierSize);
}

export function extractSourcePathfindingEvidence({ executablePath = DEFAULT_EXECUTABLE_PATH, functionsPath = DEFAULT_FUNCTIONS_PATH, referencesPath = DEFAULT_REFERENCES_PATH } = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, "EXE SHA-256");
  const functionsBytes = readFileSync(functionsPath);
  const referencesBytes = readFileSync(referencesPath);
  assertEqual(sha256(functionsBytes), EXPECTED_FUNCTIONS_SHA256, "functions SHA-256");
  assertEqual(sha256(referencesBytes), EXPECTED_REFERENCES_SHA256, "references SHA-256");
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  assertEqual(functions.sourceSha256, EXPECTED_EXECUTABLE_SHA256, "functions source SHA-256");
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, "references source SHA-256");

  const functionEvidence = FUNCTIONS.map(([entry, bodyRange, bodySize, instructionCount, instructionSha256, rawBodySha256, callees]) => {
    const record = functions.functions?.find((candidate) => candidate.entry === entry);
    if (!record) throw new Error(`functions artifact is missing ${entry}`);
    assertEqual(JSON.stringify(record.bodyRanges), JSON.stringify([bodyRange]), `${entry} body range`);
    assertEqual(record.bodySize, bodySize, `${entry} body size`);
    assertEqual(record.instructionCount, instructionCount, `${entry} instruction count`);
    assertEqual(record.instructionSha256, instructionSha256, `${entry} instruction SHA-256`);
    assertEqual(JSON.stringify(record.callees), JSON.stringify(callees), `${entry} callee set`);
    const start = Number.parseInt(entry, 16);
    assertEqual(sha256(readVaRange(buffer, image, start, start + bodySize)), rawBodySha256, `${entry} raw body SHA-256`);
    return { entry, bodyRange, bodySize, instructionCount, instructionSha256, rawBodySha256, callees };
  });

  const callEdges = REQUIRED_CALLS.map(([caller, callSite, callee]) => {
    const matches = references.references.filter((reference) => reference.fromFunctionEntry === caller && reference.from === callSite && reference.to === callee && reference.type === "UNCONDITIONAL_CALL");
    if (matches.length !== 1) throw new Error(`expected exactly one call edge ${caller}:${callSite}->${callee}, got ${matches.length}`);
    return { caller, callSite, callee };
  });

  const helperVectorOrigin = { x: 10, y: 10 };
  const searchCurrent = { x: 10, y: 10 };
  const openTerrain = Array(8 * 8).fill(0);
  const entity = { width: 1, height: 1, mask: 1 };
  return {
    question: "Within FUN_00425b20's call to FUN_00445290, which bounded static rules govern the wrapper gate/cap, greedy candidate search, footprint blocking, fallback, and waypoint postprocess boundary?",
    analysisStatus: "static-confirmed-for-bounded-source-pathfinding-control-flow",
    reproductionStatus: "reproduction-complete-for-bounded-synthetic-vectors",
    implementationStatus: "analysis-only-no-product-navigation-change",
    sources: {
      executable: sourceDescriptor(executablePath, buffer),
      functions: sourceDescriptor(functionsPath, functionsBytes, { sourceSha256: functions.sourceSha256 }),
      references: sourceDescriptor(referencesPath, referencesBytes, { sourceSha256: references.sourceSha256 }),
    },
    functionEvidence,
    callEdges,
    byteAnchors: EVIDENCE_POINTS.map(([va, bytes, meaning]) => verifyEvidencePoint(buffer, image, { va, bytes, meaning })),
    workspace: {
      visitDepthGrid: { address: "0x0054a8a4", clearDwordCount: 0x1fa4, dimensions: `${GRID_STRIDE}x${GRID_STRIDE}`, cell: "byte visit/depth" },
      openFrontier: "global array-backed coordinate/score workspace",
      lifecycle: "global workspace reset/serialization ownership is unresolved outside the bounded call",
    },
    wrapper: { acceptedNodeCounterAddress: "0x007c6624", rejectWhenGreaterThan: ACCEPTED_NODE_LIMIT, frontierCapacityByChebyshevDistance: [{ range: "0..2", frontierCapacity: 26 }, { range: "3..4", frontierCapacity: 40 }, { range: "5+", frontierCapacity: 80 }] },
    candidateStateMachine: {
      initialState: 2,
      callsPerExpansion: 8,
      helperVectorOrigin,
      helperVector: sourceHelperCandidateVector(helperVectorOrigin),
      searchCurrent,
      searchVector: sourceSearchCandidateVector(searchCurrent),
    },
    search: {
      score: "strict smallest squared Euclidean distance to requested goal; no accumulated g cost",
      tie: "first frontier entry survives equal score",
      candidateWindow: `start x/y ±${SEARCH_RADIUS} inclusive`,
      completion: "actual goal, frontier-capacity, or exhausted frontier; closest strict-score fallback is retained",
      waypointPostprocess: "FUN_00444770 performs decreasing-depth backtracking before its FUN_004446a0 call; this extractor binds FUN_004446a0 only as a postprocess call boundary",
    },
    footprintPredicate: { function: "FUN_0043ab70", blockedReturn: 1, clearReturn: 0, rectangle: "candidate anchor rectangle ending at x/y, dimensions entity +0x1e3/+0x1e4", mask: "entity +0x1ee against WORD 0x00ae27e4", outOfBounds: "blocked" },
    testVectors: {
      capBoundaries: [0, 2, 3, 4, 5].map((distance) => ({ distance, frontierCapacity: frontierCapacityForChebyshevDistance(distance) })),
      strictTie: { frontier: [{ score: 9 }, { score: 4 }, { score: 4 }, { score: 5 }], selectedIndex: selectStrictSmallestScore([{ score: 9 }, { score: 4 }, { score: 4 }, { score: 5 }]) },
      goalSuccess: replaySourcePathfinding({ start: { x: 2, y: 2 }, goal: { x: 3, y: 2 }, entity, terrain: openTerrain, width: 8, height: 8 }),
      closestPartialFallback: replaySourcePathfinding({ start: { x: 2, y: 2 }, goal: { x: 7, y: 7 }, entity, terrain: blockedGoalTerrain(), width: 8, height: 8 }),
      blockedAndOutOfBounds: { blocked: sourceFootprintBlocked({ x: 1, y: 1, entity, terrain: [0, 0, 0, 0, 1, 0, 0, 0, 0], width: 3, height: 3 }), outOfBounds: sourceFootprintBlocked({ x: -1, y: 0, entity, terrain: Array(9).fill(0), width: 3, height: 3 }) },
      capAndFailure: { frontierCapacity: replaySourcePathfinding({ start: { x: 30, y: 30 }, goal: { x: 0, y: 1 }, entity, terrain: Array(80 * 80).fill(0), width: 80, height: 80 }), acceptedNodeLimit: replaySourcePathfinding({ start: { x: 2, y: 2 }, goal: { x: 3, y: 2 }, entity, terrain: openTerrain, width: 8, height: 8, acceptedNodeCounter: 6001 }) },
    },
    uncertainties: [
      "0x00ae27e4 producer and terrain semantics are unresolved.",
      "global workspace reset lifecycle and scheduler serialization are unresolved.",
      "product coordinate mapping and the complete caller-side movement lifecycle are unresolved.",
      "This evidence does not claim full original-game pathfinding parity and does not change product navigation.",
    ],
  };
}

function finishReplay(reason, endpoint, visited, expanded, frontierCapacity, acceptedNodeCounter, maximumFrontierSize) {
  const insertionParentTrace = [];
  let record = visited.get(coordinateKey(endpoint));
  while (record) {
    insertionParentTrace.push(record.coordinate);
    record = record.parent ? visited.get(coordinateKey(record.parent)) : null;
  }
  insertionParentTrace.reverse();
  return { returnValue: reason === "goal" ? 0 : 1, reason, frontierCapacity, maximumFrontierSize, expanded, acceptedNodeCounter, endpoint, insertionParentTrace };
}

function blockedGoalTerrain() {
  const terrain = Array(8 * 8).fill(0);
  terrain[7 * 8 + 7] = 1;
  return terrain;
}

function sourceDescriptor(path, bytes, extra = {}) {
  return { path: relative(repositoryRoot, path) || ".", size: bytes.length, sha256: sha256(bytes), ...extra };
}

function coordinateKey({ x, y }) { return `${x},${y}`; }
function sameCoordinate(left, right) { return left.x === right.x && left.y === right.y; }
function squaredDistance(left, right) { return (left.x - right.x) ** 2 + (left.y - right.y) ** 2; }
function assertCoordinate(value, label) { if (!value || !Number.isInteger(value.x) || !Number.isInteger(value.y)) throw new TypeError(`${label} must contain integer x/y`); }
function assertNonnegativeInteger(value, label) { if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a nonnegative integer`); }
function assertFootprintEntity(entity) { if (!entity || !Number.isInteger(entity.width) || entity.width < 1 || !Number.isInteger(entity.height) || entity.height < 1 || !Number.isInteger(entity.mask) || entity.mask < 0 || entity.mask > 0xffff) throw new TypeError("entity must contain positive integer width/height and uint16 mask"); }
function assertGrid(terrain, width, height) { if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || !Array.isArray(terrain) || terrain.length !== width * height) throw new RangeError("terrain must be an x-major grid matching positive width/height"); terrain.forEach((mask, index) => { if (!Number.isInteger(mask) || mask < 0 || mask > 0xffff) throw new RangeError(`terrain[${index}] must be uint16`); }); }

function parseArgs(argv) {
  const options = {};
  const names = new Map([["--executable", "executablePath"], ["--functions", "functionsPath"], ["--references", "referencesPath"], ["--output", "outputPath"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = names.get(argv[index]);
    if (!key || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${argv[index]}`);
    options[key] = argv[++index];
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { outputPath, ...options } = parseArgs(process.argv.slice(2));
  const report = extractSourcePathfindingEvidence(options);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, serialized);
  else process.stdout.write(serialized);
}
