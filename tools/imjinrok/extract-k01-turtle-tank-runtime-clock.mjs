#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateOriginalSchedulerAttempt,
} from "./extract-k01-projectile-pool-cadence.mjs";
import { replayTurtleTankTurn } from "./extract-k01-turtle-tank-animation-pilot.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const EXPECTED_EXE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";

const FUNCTION_CONTRACTS = [
  ["0x0045f9c0", 801, "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24"],
  ["0x00447bc0", 75, "c5166177633b255028ae02aa6f7a60350f7e93f09ce5fcf101ac92ba066eefde"],
  ["0x00447e10", 66, "75860fcb9a74162cab2cbe0b72b7d0238d774205c7f63f118dd6c5da6af2e4f5"],
  ["0x00447360", 156, "8700298d4e2900a0f2833b1f9e1143c47d324478ef5fa419170e7945de7dd772"],
  ["0x0043c9c0", 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  ["0x00416c60", 2, "93ad3160226d88c5054de0873c15e8ee92753a82d1e1e91c1376c9268c749803"],
  ["0x00416c70", 555, "1aa33927309774ef7f107445f4678d1ffa5998447b7b76f2e7bd51d9f297ba57"],
  ["0x00416ad0", 96, "c197dbc091a4dfa8bb04eae17b055cbb82ff736cf6477f5be6f5c6333a8b59ff"],
  ["0x00425af0", 11, "272a5455b2f3c25d58ce435d1823c517615c8b739dc4952c8aec1f8cb03ce29c"],
  ["0x00425b20", 506, "088a31ecaf83338b1823a4a21e14bb859690289d56f8bc53338145492a8e24c7"],
  ["0x004262e0", 256, "4f570bc4b850c47ad406d5f9b5e6e3dace6ac2085bba150eb3b212c473265034"],
  ["0x0043d450", 10, "68070666ba954c3ee6d0b5fc857e6bdbb5fe86416ad724e22eb1986cc0724ced"],
  ["0x004381a0", 6, "3374eae851c0b4f466dda2bdbc72047cd09e08da36fc0dd6fd41b1e905f1fed4"],
  ["0x004381c0", 84, "3bda3c12b28b9cd641aa3d8af3d133754554800f3212d45c778e538ea022be4d"],
  ["0x0041efa0", 140, "0dd6b72b3f73f96672d22ceac55b7565cb93e92e3bc38598fa25a7b55013a646"],
  ["0x0041e370", 115, "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61"],
];

const REQUIRED_CALL_EDGES = [
  [0x0045fd5d, 0x0045f9c0, 0x00447bc0],
  [0x004602e4, 0x0045f9c0, 0x00447bc0],
  [0x00447c65, 0x00447bc0, 0x00447e10],
  [0x00447cb8, 0x00447bc0, 0x00447360],
  [0x00447499, 0x00447360, 0x0043c9c0],
  [0x0043d168, 0x0043c9c0, 0x00416c70],
  [0x00416f5f, 0x00416c70, 0x00416ad0],
  [0x004171ef, 0x00416c70, 0x00425af0],
  [0x00425b01, 0x00425af0, 0x004262e0],
  [0x00425b09, 0x00425af0, 0x00425b20],
  [0x00416b1c, 0x00416ad0, 0x0043d450],
  [0x00416b44, 0x00416ad0, 0x0043d450],
  [0x00416bc8, 0x00416ad0, 0x0043d450],
  [0x00416beb, 0x00416ad0, 0x0043d450],
  [0x00416c48, 0x00416ad0, 0x0043d450],
  [0x00425ec9, 0x00425b20, 0x0043d450],
  [0x0042649f, 0x004262e0, 0x0043d450],
  [0x0043d45e, 0x0043d450, 0x004381c0],
  [0x0043d46b, 0x0043d450, 0x004381a0],
];

const CODE_ANCHORS = [
  ["accepted-step-counter-before-pool", 0x00447c85, "a1 80 5f 7c 00 40 83 f8 14 a3 80 5f 7c 00 72 23 75 11", "the accepted path increments DWORD 0x007c5f80 before the unique pool call"],
  ["active-entity-dispatch", 0x00447480, "0f bf 0e 66 39 1c 4d d8 0e 7d 00 74 21 69 c9 58 05 00 00 81 c1 58 52 63 00 e8 22 55 ff ff 85 c0", "the pool's active-entity scan calls 0x0043c9c0 once for an active list entry"],
  ["action-five-dispatch", 0x0043cd88, "0f bf 86 b0 01 00 00 8d 48 ff 83 f9 44 0f 87 87 05 00 00 33 d2 8a 91 08 d4 43 00 ff 24 95 60 d3 43 00", "the entity action dispatcher selects a case from WORD entity+0x1b0"],
  ["action-five-path", 0x0043d153, "8b ce e8 76 e1 ff ff 8b ce e8 ff 9a fd ff 83 f8 01 75 07 8b ce e8 03 9b fd ff", "action 5 calls 0x00416c60 and then 0x00416c70 when it returns one"],
  ["turn-wrapper-special-gate", 0x0043d450, "f7 41 74 08 00 00 80 74 0d 8b 44 24 04 50 e8 5d ad ff ff c2 04 00 8b 54 24 04 52 e8 30 ad ff ff c2 04 00", "flags mask 0x80000008 selects 0x004381c0; the other branch writes both normal and extended directions"],
  ["turn-equality-cadence", 0x00438247, "75 0f 5f c6 81 f1 01 00 00 00 5e 83 c4 20 c2 04 00 8a 51 70 fe c2 3a 51 71 88 51 70", "equal target clears BYTE entity+0x1f1; unequal target wraps and compares BYTE entity+0x70"],
  ["turn-conditional-normal-copy", 0x004382df, "66 8b 91 e8 01 00 00 66 81 fa e8 03 7d 07 66 89 91 e6 01 00 00 88 41 04", "a step always writes extended WORD +0x1e8 and dirty +0x04, but copies normal WORD +0x1e6 only below 1000"],
  ["move-consumes-extended-direction", 0x0041efa0, "f7 41 74 08 00 00 80 0f 84 d8 01 00 00 66 0f b6 81 a7 00 00 00 66 89 41 0a 0f bf 81 e8 01 00 00", "the special movement consumer reads WORD entity+0x1e8"],
  ["attack-consumes-normal-direction", 0x0041e3f0, "66 8b 81 46 01 00 00 66 89 41 0a 0f bf 81 e6 01 00 00", "the class-14 special attack consumer reads WORD entity+0x1e6"],
];

export function extractK01TurtleTankRuntimeClock({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXE_SHA256, "original EXE SHA-256");
  const functions = readArtifact(functionsPath, executableSha256, "functions");
  const references = readArtifact(referencesPath, executableSha256, "references");
  const jumpTables = readArtifact(jumpTablesPath, executableSha256, "jump tables");
  const actionFive = requireActionFive(jumpTables);

  return {
    question: "Under the original accepted-update scheduler, exactly when does class-14 turtle-tank raw 16-ring orientation advance and become visible to movement/attack consumers, and what lossless project orientation/tick contract is required?",
    source: { executablePath, sha256: executableSha256 },
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "not-ported-contract-only",
    exactScope: "accepted scheduler gating through active entity dispatch and the recovered class-14 turn-wrapper call sites; not a claim that every active class-14 action reaches that wrapper",
    functionEvidence: FUNCTION_CONTRACTS.map(([entry, instructionCount, instructionSha256]) =>
      requireFunction(functions.functions, entry, instructionCount, instructionSha256),
    ),
    callEdges: REQUIRED_CALL_EDGES.map(([callsite, caller, callee]) =>
      requireCallEdge(references.references, callsite, caller, callee),
    ),
    codeAnchors: CODE_ANCHORS.map(([id, va, bytes, meaning]) =>
      validateAnchor(buffer, image, { id, va, bytes, meaning }),
    ),
    actionFive,
    scheduler: {
      acceptedUpdateCounter: "DWORD 0x007c5f80",
      currentMilliseconds: "DWORD 0x00882e04",
      acceptedOrder: ["0x00447e10 returns nonzero", "increment 0x007c5f80 with DWORD wrap", "0x00447360", "active entity 0x0043c9c0"],
      rejectedUpdate: "any scheduler rejection returns before increment, pool update, active-entity dispatch, and this turn helper",
      exactWallClockHz: null,
    },
    turnVisibility: {
      invocation: "a class-14 behavior path must reach 0x0043d450 with flags&0x80000008 nonzero; only then does it call 0x004381c0 during that accepted entity update",
      fields: {
        extendedMovementDirection: "+0x1e8 WORD",
        normalAttackDirection: "+0x1e6 WORD",
        cadence: "+0x70 BYTE/+0x71 BYTE",
        dirty: "+0x04 BYTE",
      },
      cadence: "equal target clears +0x1f1 without a cadence mutation; otherwise +0x70 wraps, advances only when incremented counter is >= +0x71, and resets to zero on a step",
      movement: "a step to an intermediate 1000..1007 is immediately observable by future special movement-consumer calls through +0x1e8",
      attack: "the same intermediate step leaves +0x1e6 unchanged, so special attack keeps its previous grid value; only a later step landing on a grid value below 1000 copies that grid value to +0x1e6",
      renderOrderBoundary: "the recovered evidence proves field visibility after the helper returns, not an unqualified same-frame renderer call order outside the recovered update chain",
    },
    projectContract: {
      requirement: "do not encode 1000..1007 as the existing 8-way Facing or derive them back from it",
      acceptedUpdate: "unsigned DWORD originalAcceptedUpdate ordinal, preserved with wrap and separate from project fixed ticks",
      orientation: "raw16 currentDirection plus independently retained grid8 normalDirection",
      perEntityTurnState: "unsigned BYTE cadenceCounter, unsigned BYTE cadenceLimit, BYTE turnPending, dirty flag",
      consumerRule: "movement reads raw16; attack reads grid8; grid8 changes only on raw16 grid entries",
      conversionBoundary: "an adapter from raw accepted updates/timeGetTime gates to project 24 Hz is intentional project policy until separately recovered; no Hz, milliseconds-per-turn, or multiplier is claimed here",
    },
    testVectors: createVectors(),
    uncertainties: [
      "the complete semantics and reachability conditions of every class-14 behavior path into the wrapper are not renamed beyond the verified call/branch chain",
      "the fixed wall-clock rate of accepted updates is not static-proven; timeGetTime supplies milliseconds but message-loop and other gates vary acceptance",
      "the project-side resampling or accumulator policy is not original behavior",
    ],
  };
}

export function replayTurtleTankAcceptedUpdate({ scheduler, turn, invokeTurnHelper = true }) {
  if (typeof invokeTurnHelper !== "boolean") throw new TypeError("invokeTurnHelper must be a boolean");
  const schedulerResult = evaluateOriginalSchedulerAttempt(scheduler);
  if (!schedulerResult.accepted || !invokeTurnHelper) {
    return { scheduler: schedulerResult, turn: { ...turn }, helperInvocationCount: 0 };
  }
  return {
    scheduler: schedulerResult,
    turn: replayTurtleTankTurn(turn),
    helperInvocationCount: 1,
  };
}

function createVectors() {
  const baseScheduler = {
    transitionGuardWord: 0, mainStateWord: 3, preUpdateReturn: 0,
    clockGateReturn: 1, commandGateModeWord: 1, commandReadinessReturn: 0,
  };
  return [
    { id: "rejected-clock-gate-does-not-touch-turn", result: replayTurtleTankAcceptedUpdate({ scheduler: { ...baseScheduler, clockGateReturn: 0, acceptedStepCounter: 7 }, turn: turn(1, 5, 1, 1) }) },
    { id: "grid-to-intermediate-to-grid", result: replaySequence(baseScheduler, [turn(1, 5, 1, 0), turn(1, 5, 1, 1), turn(1000, 5, 1, 0), turn(1000, 5, 1, 1)]) },
    { id: "equality-no-step", result: replayTurtleTankAcceptedUpdate({ scheduler: { ...baseScheduler, acceptedStepCounter: 10 }, turn: turn(1, 1, 1, 1, 1) }) },
    { id: "opposite-tie-steps-backward", result: replayTurtleTankAcceptedUpdate({ scheduler: { ...baseScheduler, acceptedStepCounter: 10 }, turn: turn(1, 16, 1, 1) }) },
    { id: "cadence-byte-wrap", result: replayTurtleTankAcceptedUpdate({ scheduler: { ...baseScheduler, acceptedStepCounter: 0xffffffff }, turn: turn(1, 5, 1, 0xff) }) },
  ];
}

function replaySequence(baseScheduler, turns) {
  return turns.reduce((state, nextTurn) => {
    const result = replayTurtleTankAcceptedUpdate({ scheduler: { ...baseScheduler, acceptedStepCounter: state.acceptedStepCounter }, turn: nextTurn });
    return { acceptedStepCounter: result.scheduler.acceptedStepCounter, turns: [...state.turns, result.turn] };
  }, { acceptedStepCounter: 0, turns: [] });
}

function turn(currentDirection, targetDirection, normalDirection, cadenceCounter, turnPending = 0) {
  return { currentDirection, targetDirection, normalDirection, cadenceCounter, cadenceLimit: 2, turnPending, dirty: 0 };
}

function readArtifact(path, sourceSha256, label) {
  const artifact = JSON.parse(readFileSync(resolve(path), "utf8"));
  assertEqual(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return artifact;
}

function requireFunction(functions, entry, instructionCount, instructionSha256) {
  const found = functions.find((candidate) => candidate.entry === entry);
  if (!found) throw new Error(`functions artifact is missing ${entry}`);
  assertEqual(found.instructionCount, instructionCount, `${entry} instruction count`);
  assertEqual(found.instructionSha256, instructionSha256, `${entry} instruction SHA-256`);
  return { entry, bodyRanges: found.bodyRanges, instructionCount, instructionSha256 };
}

function requireCallEdge(references, callsite, caller, callee) {
  const match = references.find((reference) => reference.type.endsWith("CALL") && reference.from === toHex(callsite) && reference.fromFunctionEntry === toHex(caller) && reference.to === toHex(callee));
  if (!match) throw new Error(`required call edge ${toHex(callsite)}: ${toHex(caller)} -> ${toHex(callee)} is missing`);
  return { callsite: match.from, caller: match.fromFunctionEntry, callee: match.to };
}

function requireActionFive(jumpTables) {
  const table = Object.values(jumpTables.tables).find((candidate) => candidate.functionEntry === "0x0043c9c0" && candidate.switchAddress === "0x0043cda3");
  if (!table) throw new Error("entity action switch is missing");
  const destination = table.cases.find((entry) => entry.label === 5)?.destination;
  assertEqual(destination, "0x0043d153", "action 5 dispatcher destination");
  return { switchAddress: table.switchAddress, action: 5, destination };
}

function validateAnchor(buffer, image, { id, va, bytes, meaning }) {
  const rawOffset = image.vaToRawOffset(va);
  if (rawOffset === undefined) throw new RangeError(`${toHex(va)} is not file-backed`);
  const expected = Buffer.from(bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (Buffer.compare(actual, expected) !== 0) throw new Error(`code anchor ${id} mismatch at ${toHex(va)}`);
  return { id, va: toHex(va), rawOffset: toHex(rawOffset), bytes, meaning, matched: true };
}

function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function assertEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(extractK01TurtleTankRuntimeClock(), null, 2)}\n`);
}
