#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractK01HeroBasicAttackPilot } from "./extract-k01-hero-basic-attack-pilot.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_JUMP_TABLES_PATH =
  "analysis/generated/imjinrok2/jump-tables.json";

const PROJECTILE_SUBTYPE = 0x0c;
const PROJECTILE_EFFECT_KIND = 9;
const PROJECTILE_CONFIG_TABLE = 0x005281c8;
const PROJECTILE_CONFIG_STRIDE = 0x10;
const PROJECTILE_CONFIG_WRITER = 0x0040c420;
const PROJECTILE_POOL_BASE = 0x00aa85e8;
const PROJECTILE_RECORD_SIZE = 0x03a0;
const PROJECTILE_ACTIVE_TABLE = 0x00842500;
const PROJECTILE_SLOT_COUNT = 100;
const FIRST_ALLOCATABLE_SLOT = 1;
const MAX_ROUTE_POINTS = 160;
const ROUTE_X_OFFSET = 0x011c;
const ROUTE_Y_OFFSET = 0x025c;
const PROJECTILE_POOL_RANDOM_MULTIPLIER = 0xff83;
const PROJECTILE_POOL_RANDOM_MODULUS = 0xfffb;
const HEALTH_APPLICATION_MODE = 0x007c6282;
const HEALTH_APPLICATION_TABLE = 0x0082c482;
const HEALTH_APPLICATION_TABLE_STRIDE = 0x2c10;

const FUNCTION_ENTRIES = {
  subtypeTableInitializer: 0x0040c470,
  recordInitializer: 0x0040c6c0,
  recordPostInitializer: 0x0040c970,
  subtypeDispatcher: 0x0040df10,
  subtypeImpactHandler: 0x0040e270,
  activeTableWrite: 0x0040f0e0,
  routeBuilder: 0x0040f9b0,
  visualPositionUpdate: 0x0040fd50,
  renderUpdate: 0x004107a0,
  routeInitializer: 0x00410ab0,
  recordUpdate: 0x00410cc0,
  slotAllocation: 0x00411160,
  slotRelease: 0x00411180,
  recordSpawn: 0x004111b0,
  damageCalculation: 0x00413070,
  effectApplication: 0x00413700,
  damageResolution: 0x00413b30,
  preSpawnSideEffect: 0x0041a880,
  targetReferenceStateSetup: 0x0041a990,
  healthSubtraction: 0x00438130,
  targetValidityBeforeSpawn: 0x00438c50,
  healthApplicationModeProducer: 0x0043e1e0,
  activeRecordGenerationLookup: 0x00441db0,
  activeRecordLookup: 0x00441e40,
  poolUpdate: 0x00447360,
};

const REQUIRED_CALL_EDGES = [
  [0x00417430, 0x00438c50],
  [0x00417430, 0x0041a990],
  [0x00417430, 0x00411160],
  [0x00417430, 0x0041a880],
  [0x00417430, 0x004111b0],
  [0x00417430, 0x00441e40],
  [0x004111b0, 0x0040c6c0],
  [0x004111b0, 0x0040f0e0],
  [0x0040c6c0, 0x00410ab0],
  [0x0040c6c0, 0x0040f9b0],
  [0x0040c6c0, 0x0040c970],
  [0x0040c6c0, 0x00441db0],
  [0x00447360, 0x00410cc0],
  [0x00410cc0, 0x0040df10],
  [0x00410cc0, 0x0040fd50],
  [0x00410cc0, 0x004107a0],
  [0x0040df10, 0x0040e270],
  [0x0040e270, 0x00413700],
  [0x00413700, 0x00413b30],
  [0x00413b30, 0x00413070],
  [0x00413b30, 0x00438130],
  [0x00447360, 0x00411180],
  [0x0041a880, 0x00466340],
  [0x0041a880, 0x00461550],
  [0x0041a880, 0x004abec0],
];

const CODE_ANCHORS = [
  {
    id: "subtype-0x0c-config",
    va: 0x0040c5dc,
    bytes:
      "6a 01 6a 01 6a 00 6a 00 6a 00 6a 00 6a 1d 6a 0e b9 88 82 52 00 e8 2a fe ff ff",
    meaning:
      "the subtype 0x0c table record receives [14, 29, 0, 0, 0, 0, 1, 1]",
  },
  {
    id: "subtype-config-maps-control-words",
    va: 0x0040c8f2,
    bytes:
      "0f bf 46 26 c1 e0 04 66 8b 88 c8 81 52 00 66 89 4e 2c 66 8b 90 ca 81 52 00 66 89 56 12 66 8b 88 cc 81 52 00 66 89 4e 14 66 8b 90 ce 81 52 00 66 89 96 12 01 00 00 66 8b 88 d0 81 52 00 66 89 8e 14 01 00 00",
    meaning:
      "the initializer copies subtype config words 0..4 into +0x2c, +0x12, +0x14, +0x112, and +0x114",
  },
  {
    id: "route-start-and-sample-cap",
    va: 0x0040fa11,
    bytes:
      "66 89 a9 1c 01 00 00 66 3b d0 66 89 b9 5c 02 00 00 be 01 00 00 00",
    meaning:
      "the route stores signed-word start X/Y at the first route element",
  },
  {
    id: "route-error-and-sample-counters-start-zero",
    va: 0x0040f9c7,
    bytes:
      "33 c0 66 3b eb 89 6c 24 14 89 7c 24 30 89 5c 24 2c 89 74 24 1c 89 44 24 10 89 44 24 18",
    meaning:
      "the route builder initializes both its line-error accumulator and retained-sample counter storage from zero",
  },
  {
    id: "record-update-arrival-compare",
    va: 0x00410e0a,
    bytes:
      "66 8b 86 a6 00 00 00 0f bf c8 66 3b 86 a8 00 00 00",
    meaning:
      "the record update compares the current route index with the final route index",
  },
  {
    id: "zero-retracking-word-skips-retracking",
    va: 0x00410cff,
    bytes:
      "66 83 be 14 01 00 00 01 0f 85 fd 00 00 00",
    meaning:
      "record +0x114 must equal 1 to enter the pre-arrival target retracking block",
  },
  {
    id: "record-update-arrival-dispatch",
    va: 0x00410fdb,
    bytes: "8b ce e8 2e cf ff ff",
    meaning:
      "arrival calls the subtype dispatcher before the update returns zero",
  },
  {
    id: "zero-mid-flight-word-skips-effect-block",
    va: 0x00410fec,
    bytes:
      "bf 01 00 00 00 66 39 be 12 01 00 00 0f 85 3c 01 00 00",
    meaning:
      "record +0x112 must equal 1 to enter the mid-flight effect block",
  },
  {
    id: "non-arrival-visual-and-render-update",
    va: 0x0041113a,
    bytes:
      "66 ff 86 a6 00 00 00 8b ce e8 08 ec ff ff 8b ce e8 51 f6 ff ff",
    meaning:
      "the non-arrival path increments the route index, then calls visual-position and render updates",
  },
  {
    id: "slot-allocation-failure",
    va: 0x00411160,
    bytes:
      "b8 01 00 00 00 b9 02 25 84 00 66 83 39 00 74 0f 83 c1 02 40 81 f9 c8 25 84 00 7c ee 66 33 c0",
    meaning:
      "allocation scans slots 1..99 and returns zero when every slot is active",
  },
  {
    id: "ryu-spawn-requires-free-slot",
    va: 0x00417b74,
    bytes: "e8 e7 95 ff ff 0f bf e8 85 ed 0f 84 24 1b 00 00",
    meaning:
      "Ryu Seong-ryong skips projectile creation when slot allocation returns zero",
  },
  {
    id: "ryu-spawns-subtype-0x0c",
    va: 0x00417bf8,
    bytes: "55 6a 0c e8 b0 95 ff ff",
    meaning:
      "the Ryu attack branch passes subtype 0x0c and the allocated slot to the spawn function",
  },
  {
    id: "ryu-loads-exact-active-target-coordinates",
    va: 0x00417b84,
    bytes:
      "0f bf 86 22 01 00 00 8b ce 8d 14 c0 8d 04 50 8d 04 c0 c1 e0 03 66 8b b8 c2 52 63 00 66 8b 98 c4 52 63 00",
    meaning:
      "the Ryu branch reads route-end X/Y directly from the active target record",
  },
  {
    id: "ryu-target-reference-side-effect-state",
    va: 0x0041a990,
    bytes:
      "8b 44 24 04 66 c7 81 d4 04 00 00 01 00 89 81 d0 04 00 00 66 c7 81 d6 04 00 00 05 00 c2 04 00",
    meaning:
      "the pre-spawn helper stores the target reference and state words 1 and 5 on the attacker",
  },
  {
    id: "subtype-0x0c-effect-kind-nine",
    va: 0x0040e270,
    bytes:
      "66 8b 81 84 00 00 00 66 8b 91 82 00 00 00 50 8b 81 9a 00 00 00 52 66 8b 91 9e 00 00 00 50 52",
    meaning:
      "the subtype handler loads the stored target, payload, and effect-coordinate fields",
  },
  {
    id: "subtype-0x0c-effect-call",
    va: 0x0040e29c,
    bytes: "8b 81 a0 00 00 00 6a 01 6a 09 52 50 e8 53 54 00 00",
    meaning:
      "arrival applies effect kind 9 with radius/selector value 1",
  },
  {
    id: "completed-record-is-released",
    va: 0x004474ce,
    bytes:
      "8b cd e8 eb 97 fc ff 85 c0 75 09 56 e8 a1 9c fc ff",
    meaning:
      "the pool update releases the slot when the record update returns zero",
  },
  {
    id: "projectile-pool-random-state-before-records",
    va: 0x00447360,
    bytes:
      "a1 90 5f 7c 00 33 d2 a3 94 5f 7c 00 a1 8c 5f 7c 00 8b c8 53 c1 e1 09 2b c8 33 db c1 e1 06 03 c8 56 8d 04 48 b9 fb ff 00 00 f7 f1",
    meaning:
      "the pool update copies the previous random state and advances seed * 0xff83 modulo 0xfffb before iterating projectile records",
  },
  {
    id: "effect-kind-nine-class-four-modifier",
    va: 0x00413537,
    bytes:
      "03 fe 66 83 ff 5a 7e 05 bf 5a 00 00 00 83 f8 01 74 7b 83 f8 02 74 76 83 f8 03 74 71 83 f8 04 75 43 8b 4c 24 18 0f bf d1 6b d2 1e",
    meaning:
      "effect kind 9 caps defense at 90 and selects a 30-percent payload modifier for defender class 4",
  },
  {
    id: "defense-word-add-and-conditional-half",
    va: 0x004130bd,
    bytes:
      "66 8b b9 a8 52 63 00 8a 81 12 53 63 00 66 03 b9 9c 52 63 00 3c 01 75 0a 0f bf c7 99 2b c2 8b f0 d1 fe",
    meaning:
      "defense base and modifier add in DI with WORD wrap; flag byte 1 derives signed truncation-toward-zero half-defense in ESI",
  },
  {
    id: "effect-kind-nine-class-five-and-defense",
    va: 0x0041359b,
    bytes:
      "83 f8 05 75 24 8b 4c 24 18 0f bf c1 8d 04 80 8d 14 80 d1 e2 b8 1f 85 eb 51 f7 ea c1 fa 05 8b c2 c1 e8 1f 03 d0 03 ca",
    meaning:
      "effect kind 9 selects the class-5 50-percent modifier with signed truncation",
  },
  {
    id: "effect-kind-nine-final-minimum-damage",
    va: 0x004135c8,
    bytes:
      "0f bf d7 0f bf c1 0f af d0 b8 1f 85 eb 51 f7 ea c1 fa 05 8b c2 c1 e8 1f 03 d0 2b ca 8b c1 66 85 c0 7f 3e",
    meaning:
      "the final result subtracts the signed defense percentage and branches to a minimum damage of 1",
  },
  {
    id: "health-application-table-gate",
    va: 0x00438130,
    bytes:
      "66 83 3d 82 62 7c 00 01 75 1f 0f be 51 38 8d 04 52 c1 e0 04 2b c2 8d 04 40 8d 04 80 c1 e0 04 8a 90 82 c4 82 00 84 d2 74 1e",
    meaning:
      "mode WORD 0x007c6282 equal to 1 indexes byte 0x0082c482 + signed([defender+0x38]) * 0x2c10 and returns 1 when that byte is zero",
  },
  {
    id: "damage-result-flows-directly-to-health-application",
    va: 0x00413c11,
    bytes:
      "8b 4c 24 24 8b 6c 24 20 53 51 55 e8 4f f4 ff ff 83 c4 0c 8d be 58 52 63 00 8b cf 6a 0a 50 e8 fc 44 02 00",
    meaning:
      "damage resolution calls the calculator and then passes EAX directly to 0x00438130 without a branch that excludes the table gate or a zero calculation result",
  },
  {
    id: "health-signed-buffer-and-health-branches",
    va: 0x00438159,
    bytes:
      "66 8b 81 90 00 00 00 8b 54 24 04 66 85 c0 74 1f 66 3b c2 7c 11 2b c2 66 89 81 90 00 00 00 b8 01 00 00 00 c2 08 00",
    meaning:
      "buffer is tested and compared to damage as signed AX/DX; the absorbing branch subtracts in AX and stores the low WORD",
  },
  {
    id: "health-application-mode-toggle-producer",
    va: 0x0043e3ba,
    bytes:
      "33 d2 5f 66 39 15 82 62 7c 00 5e 5b 0f 94 c2 66 89 15 82 62 7c 00 c2 68 00",
    meaning:
      "raw command-switch case 302 toggles WORD 0x007c6282 between zero and one",
  },
  {
    id: "buffer-smaller-than-damage-subtracts-full-damage",
    va: 0x0043817f,
    bytes:
      "66 c7 81 90 00 00 00 00 00 66 29 51 3e 66 83 79 3e 00 7f e4 66 c7 41 3e 00 00 33 c0 c2 08 00",
    meaning:
      "when the buffer is smaller, the original clears it and subtracts the full damage from health before clamping",
  },
];

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractK01RyuProjectilePilot({
    executablePath: args.input ?? DEFAULT_EXECUTABLE_PATH,
    seedsPath: args.seeds ?? DEFAULT_SEEDS_PATH,
    jumpTablesPath: args.jumpTables ?? DEFAULT_JUMP_TABLES_PATH,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }
}

export function extractK01RyuProjectilePilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  const seeds = readAnalysisDocument(
    seedsPath,
    executableSha256,
    "Ghidra seed analysis",
  );
  const jumpTables = readAnalysisDocument(
    jumpTablesPath,
    executableSha256,
    "Ghidra jump-table analysis",
  );
  const subtypeConfig = extractSubtypeConfig(
    requireFunction(seeds, FUNCTION_ENTRIES.subtypeTableInitializer)
      .instructions,
    PROJECTILE_SUBTYPE,
  );
  assertArrayEqual(
    subtypeConfig,
    [14, 29, 0, 0, 0, 0, 1, 1],
    "subtype-0x0c-config",
  );
  const subtypeSwitch = requireJumpTable(
    jumpTables,
    FUNCTION_ENTRIES.subtypeDispatcher,
    0x0040df92,
  );
  const expectedSubtypeLabels = [
    ...Array.from({ length: 21 }, (_, index) => index + 1),
    null,
  ];
  assertArrayEqual(
    subtypeSwitch.cases.map((candidate) => candidate.label),
    expectedSubtypeLabels,
    "subtype dispatcher labels",
  );
  const subtypeCase = subtypeSwitch.cases.find(
    (candidate) => candidate.label === PROJECTILE_SUBTYPE,
  );
  assertEqual(
    subtypeCase?.destination,
    toHex(0x0040e039),
    "subtype 0x0c dispatcher destination",
  );
  requireInstruction(
    requireFunction(seeds, FUNCTION_ENTRIES.subtypeDispatcher),
    0x0040e03b,
    "CALL 0x0040e270",
  );
  const damageSwitch = requireJumpTable(
    jumpTables,
    FUNCTION_ENTRIES.damageCalculation,
    0x004130f4,
  );
  const damageCase = damageSwitch.cases.find(
    (candidate) => candidate.label === PROJECTILE_EFFECT_KIND,
  );
  assertEqual(
    damageCase?.destination,
    toHex(0x00413537),
    "effect kind 9 damage-switch destination",
  );
  const postInitializerSwitch = requireJumpTable(
    jumpTables,
    FUNCTION_ENTRIES.recordPostInitializer,
    0x0040c97a,
  );
  assertEqual(
    postInitializerSwitch.cases.find(
      (candidate) => candidate.label === PROJECTILE_SUBTYPE,
    )?.destination,
    toHex(0x0040c9d1),
    "subtype 0x0c post-initializer destination",
  );
  const modeProducerSwitch = requireJumpTable(
    jumpTables,
    FUNCTION_ENTRIES.healthApplicationModeProducer,
    0x0043e1f6,
  );
  assertEqual(
    modeProducerSwitch.cases.find(
      (candidate) => candidate.label === 302,
    )?.destination,
    toHex(0x0043e3ba),
    "health-application mode producer case 302",
  );
  requireInstruction(
    requireFunction(seeds, FUNCTION_ENTRIES.recordInitializer),
    0x0040c921,
    "MOV word ptr [ESI + 0x112],DX",
  );
  requireInstruction(
    requireFunction(seeds, FUNCTION_ENTRIES.recordInitializer),
    0x0040c92f,
    "MOV word ptr [ESI + 0x114],CX",
  );
  requireInstruction(
    requireFunction(seeds, FUNCTION_ENTRIES.recordUpdate),
    0x00410cff,
    "CMP word ptr [ESI + 0x114],0x1",
  );
  requireInstruction(
    requireFunction(seeds, FUNCTION_ENTRIES.recordUpdate),
    0x00410ff1,
    "CMP word ptr [ESI + 0x112],DI",
  );
  requireInstruction(
    requireFunction(seeds, FUNCTION_ENTRIES.healthSubtraction),
    0x00438130,
    "CMP word ptr [0x007c6282],0x1",
  );
  requireInstruction(
    requireFunction(seeds, FUNCTION_ENTRIES.healthApplicationModeProducer),
    0x0043e3c9,
    "MOV word ptr [0x007c6282],DX",
  );
  const callEdges = REQUIRED_CALL_EDGES.map(([caller, callee]) =>
    requireCallEdge(seeds, caller, callee),
  );

  const basicAttack = extractK01HeroBasicAttackPilot({
    executablePath,
    seedsPath,
  });
  const ryu = basicAttack.heroes.find(
    (hero) => hero.projectEntityId === "ryu-seong-ryong",
  );
  if (!ryu) {
    throw new Error("Missing Ryu Seong-ryong basic-attack evidence");
  }
  assertEqual(
    ryu.delivery.projectileSubtype,
    PROJECTILE_SUBTYPE,
    "Ryu projectile subtype",
  );
  assertEqual(ryu.delivery.payloadDamage, 45, "Ryu base payload");

  return {
    schemaVersion: 1,
    question:
      "유성룡 투사체 subtype 0x0c는 어떻게 비행하고, 언제 충돌하며, 최종 체력 피해를 어떻게 계산·적용하는가?",
    evidenceStatus: "static-proven-k01-ryu-projectile-subtype-0x0c",
    reproductionStatus: "reproduction-complete",
    analysisScope:
      "Static-proven and reproduction-complete only for the stated original CFG and the port's accepted coordinate subset 0..32767: Ryu Seong-ryong's attack-phase spawn of subtype 0x0c through slot allocation, record initialization, sampled route flight, arrival dispatch, effect kind 9 WORD-semantics damage calculation, the raw health-application mode/table gate, signed buffer-before-health application, and record release. The original producers and full signed-WORD ranges of attacker +0x6a/+0x6c and active target +0x32/+0x34, original tick duration, project-coordinate conversion, target acquisition/range, hit reaction, death cleanup, and entity +0x4a production remain outside this scope.",
    acceptedInputSubset: {
      routeCoordinates:
        "each coordinate must be an integer in 0..32767; this is a conservative port contract selected to reproduce the audited arithmetic without signed-WORD wrap, not a statically proven original caller range",
      status:
        "static-proven and reproduction-complete claims for route arithmetic are limited to this accepted subset and the published normal, boundary, and failure vectors",
    },
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      seeds: {
        path: seedsPath,
        sourceSha256: seeds.sourceSha256,
        schemaVersion: seeds.schemaVersion,
      },
      jumpTables: {
        path: jumpTablesPath,
        sourceSha256: jumpTables.sourceSha256,
        schemaVersion: jumpTables.schemaVersion,
      },
    },
    identity: {
      originalClass: ryu.identity.internalClass,
      originalGameplayName: ryu.identity.originalGameplayName,
      projectileSubtype: PROJECTILE_SUBTYPE,
      basePayload: ryu.delivery.payloadDamage,
      spawnCallSite: ryu.delivery.callSite,
    },
    subtypeConfig: {
      tableAddress: toHex(PROJECTILE_CONFIG_TABLE),
      recordAddress: toHex(
        PROJECTILE_CONFIG_TABLE +
          PROJECTILE_SUBTYPE * PROJECTILE_CONFIG_STRIDE,
      ),
      recordStride: PROJECTILE_CONFIG_STRIDE,
      initializerFunction: toHex(
        FUNCTION_ENTRIES.subtypeTableInitializer,
      ),
      values: subtypeConfig,
      routeSampleInterval: subtypeConfig[0],
      spriteSlot: subtypeConfig[1],
      midFlightEffectControlWord: subtypeConfig[3],
      retrackingControlWord: subtypeConfig[4],
      fieldMapping: {
        midFlightEffectControlWord: "+0x112",
        retrackingControlWord: "+0x114",
      },
    },
    recordLifecycle: {
      activeTableAddress: toHex(PROJECTILE_ACTIVE_TABLE),
      recordPoolAddress: toHex(PROJECTILE_POOL_BASE),
      recordSize: PROJECTILE_RECORD_SIZE,
      slotCount: PROJECTILE_SLOT_COUNT,
      allocatableSlots: {
        first: FIRST_ALLOCATABLE_SLOT,
        last: PROJECTILE_SLOT_COUNT - 1,
      },
      allocationFailure: "return 0 and skip spawn",
      release:
        "arrival handler returns 1; record update returns 0; pool update clears the active-table word",
      preUpdateRandomMutation:
        "before iterating records, copy currentSeed to previousSeed, then set seed and currentSeed to unsignedLow32(seed * 0xff83) % 0xfffb",
    },
    recordFields: {
      subtype: { offset: "+0x26", width: "signed word" },
      ownerOrSide: { offset: "+0x2e", width: "signed byte" },
      routeSampleInterval: { offset: "+0x2c", width: "signed word" },
      routeStart: {
        x: "+0x76",
        y: "+0x78",
        width: "signed word",
      },
      routeEnd: {
        x: "+0x7a",
        y: "+0x7c",
        width: "signed word",
      },
      storedEffectCoordinates: {
        x: "+0x82",
        y: "+0x84",
        width: "signed word",
      },
      attackerReference: { offset: "+0xa0", width: "dword" },
      targetReference: { offset: "+0x9a", width: "dword" },
      payload: { offset: "+0x9e", width: "signed word" },
      currentRouteIndex: { offset: "+0xa6", width: "signed word" },
      finalRouteIndex: { offset: "+0xa8", width: "signed word" },
      midFlightEffectControl: {
        offset: "+0x112",
        width: "word",
        subtype0cValue: subtypeConfig[3],
      },
      retrackingControl: {
        offset: "+0x114",
        width: "word",
        subtype0cValue: subtypeConfig[4],
      },
      routeX: {
        offset: "+0x11c",
        elementWidth: "signed word",
        maximumElements: MAX_ROUTE_POINTS,
      },
      routeY: {
        offset: "+0x25c",
        elementWidth: "signed word",
        maximumElements: MAX_ROUTE_POINTS,
      },
    },
    controlFlow: {
      spawn:
        "validate the stored target; write the attacker's target-reference side-effect state; allocate the first free slot 1..99; load the active target's signed-word X/Y; run the pre-spawn side-effect helper; skip creation when no slot is free",
      flight:
        "the call site directly reads signed WORD attacker +0x6a/+0x6c and active target +0x32/+0x34, but this scope does not prove their producers or full caller range; within the port's conservative accepted subset 0..32767, build the audited Bresenham-style line, retain the start plus every 14th step, cap route indices to 0..159, and consume one retained point per projectile-pool update",
      collision:
        "config words 3 and 4 are both zero and are copied to +0x112/+0x114, so subtype 0x0c skips the mid-flight effect and target-retracking blocks; along the complete subtype-relevant update path, only currentRouteIndex == finalRouteIndex reaches its subtype dispatcher",
      impact:
        "case 0x0c calls effect kind 9 with the stored payload and target reference, then the pool releases the projectile slot in the same update",
      missingTarget:
        "inactive targets are skipped by effect application; a reused slot with a different generation makes damage calculation return zero but still passes that zero to health application; both paths still release the projectile",
      preSpawnSideEffect:
        "0x0041a880 directly reads attacker/target coordinates and passes coordinates with fixed global-object ECX values to 0x00466340, 0x00461550, and 0x004abec0; it contains no direct memory store and does not pass the attacker pointer to those calls, but the callees' global or coordinate-indexed mutations and human-facing meanings remain unresolved",
    },
    damage: {
      effectKind: PROJECTILE_EFFECT_KIND,
      payloadFormula:
        "signed WORD [attacker+0x46] + signed WORD [attacker+0x4a]",
      basePayload: ryu.delivery.payloadDamage,
      defense:
        "rawDefense = signedWord(word(defenseBase + defenseModifier)); defense = signedWord(word(rawDefense + (specialDefenseFlag == 1 ? trunc(rawDefense / 2) : 0))); if signed defense > 90, replace it with 90",
      classModifiers: {
        "4": "+30%",
        "5": "+50%",
        other: "0%",
      },
      result:
        "modifiedWord = signedWord(word(payload + trunc(payload * classModifierPercent / 100))); resultWord = signedWord(word(modifiedWord - trunc(defense * modifiedWord / 100))); calculated damage is resultWord when signed resultWord > 0, otherwise 1",
      application:
        "after calculation, 0x00438130 first applies the raw mode/table gate; otherwise it tests and compares buffer AX and damage DX as signed WORDs, subtracts the damage WORD from buffer when signed AX >= DX, or clears buffer and uses the full damage WORD as the health SUB operand; wrapped health is kept only when signed health > 0 and otherwise clamped to zero. healthSubtractionOperand reports that WORD operand, not the actual final HP delta after wrap/clamp",
      healthApplicationGate: {
        modeAddress: toHex(HEALTH_APPLICATION_MODE),
        tableAddress: toHex(HEALTH_APPLICATION_TABLE),
        tableStride: HEALTH_APPLICATION_TABLE_STRIDE,
        defenderIndex:
          "signed BYTE [defender+0x38], used without an independently recovered range guard",
        branch:
          "when mode WORD == 1 and table[defenderSignedByte38 * 0x2c10] == 0, return 1 before reading or mutating buffer/health",
        reproductionInputContract:
          "defenderSignedByte38 records and validates the raw signed index; selectedHealthApplicationTableByte is supplied independently as the already-selected raw byte read at the original computed address because the pure reproduction API does not receive the complete original table",
        modeProducer:
          "0x0043e1e0 raw command-switch input word 302 toggles mode WORD 0x007c6282 between 0 and 1",
      },
      targetReferenceFailure:
        "generation mismatch returns calculation result zero and still calls health application; ordinary positive buffer/health vectors remain unchanged, while signed-WORD boundary state can still be cleared or clamped",
      switchAddress: damageSwitch.switchAddress,
      caseDestination: damageCase.destination,
    },
    dispatcher: {
      function: toHex(FUNCTION_ENTRIES.subtypeDispatcher),
      switchAddress: subtypeSwitch.switchAddress,
      caseLabels: expectedSubtypeLabels,
      caseLabel: PROJECTILE_SUBTYPE,
      caseDestination: subtypeCase.destination,
      handlerFunction: toHex(FUNCTION_ENTRIES.subtypeImpactHandler),
    },
    callEdges,
    analyzedFunctions: Object.values(FUNCTION_ENTRIES).map((entry) =>
      summarizeFunction(requireFunction(seeds, entry)),
    ),
    codeAnchors: CODE_ANCHORS.map((anchor) =>
      validateCodeAnchor(buffer, image, anchor),
    ),
    testVectors: createReproductionVectors(subtypeConfig[0]),
    unresolvedScope: [
      "the original global tick duration and conversion from one projectile-pool update to project simulation ticks",
      "conversion between original signed-word projectile coordinates and project GridPoint world units",
      "the producer and complete meaning of attacker +0x4a",
      "target acquisition, exact range, hit reaction, death processing, and target-reference cleanup after death",
      "human-facing names for defender class +0x80 and special defense flag +0x83",
      "the human-facing meaning of raw command 302, mode WORD 0x007c6282, table 0x0082c482, and defender signed byte +0x38",
      "callee-side global and coordinate-indexed effects of 0x0041a880 calls 0x00466340, 0x00461550, and 0x004abec0",
      "the producers, range guards, and full signed-WORD values that the Ryu call site can receive in attacker +0x6a/+0x6c and active target +0x32/+0x34",
    ],
  };
}

export function allocateProjectileSlot(activeSubtypes) {
  if (
    !Array.isArray(activeSubtypes) ||
    activeSubtypes.length !== PROJECTILE_SLOT_COUNT
  ) {
    throw new RangeError(
      `activeSubtypes must contain exactly ${PROJECTILE_SLOT_COUNT} words`,
    );
  }
  for (
    let slot = FIRST_ALLOCATABLE_SLOT;
    slot < PROJECTILE_SLOT_COUNT;
    slot += 1
  ) {
    validateUnsignedWord(activeSubtypes[slot], `activeSubtypes[${slot}]`);
    if (activeSubtypes[slot] === 0) {
      return slot;
    }
  }
  return 0;
}

export function advanceProjectilePoolRandomState({
  seed,
  currentSeed,
}) {
  validateUnsignedDword(seed, "seed");
  validateUnsignedDword(currentSeed, "currentSeed");
  const nextSeed = Number(
    BigInt.asUintN(
      32,
      BigInt(seed) * BigInt(PROJECTILE_POOL_RANDOM_MULTIPLIER),
    ) %
      BigInt(PROJECTILE_POOL_RANDOM_MODULUS),
  );
  return {
    seed: nextSeed,
    currentSeed: nextSeed,
    previousSeed: currentSeed,
  };
}

export function buildSampledProjectileRoute({
  startX,
  startY,
  endX,
  endY,
  sampleInterval,
}) {
  for (const [label, value] of Object.entries({
    startX,
    startY,
    endX,
    endY,
  })) {
    validateAcceptedRouteCoordinate(value, label);
  }
  validateSignedWord(sampleInterval, "sampleInterval");
  if (sampleInterval < 1) {
    throw new RangeError(
      `sampleInterval must be a positive signed word; got ${sampleInterval}`,
    );
  }

  const memory = new ArrayBuffer(PROJECTILE_RECORD_SIZE);
  const record = new DataView(memory);
  writeRoutePoint(record, 0, startX, startY);

  const deltaX = Math.abs(endX - startX);
  const deltaY = Math.abs(endY - startY);
  const stepX = startX < endX ? 1 : -1;
  const stepY = startY < endY ? 1 : -1;
  let x = startX;
  let y = startY;
  let retainedCount = 1;
  let sampleCounter = 0;

  function retainCurrentPoint() {
    sampleCounter = (sampleCounter + 1) % sampleInterval;
    if (sampleCounter !== 0) {
      return;
    }
    writeRoutePoint(record, retainedCount, x, y);
    if (retainedCount < MAX_ROUTE_POINTS) {
      retainedCount += 1;
    }
  }

  if (deltaY < deltaX) {
    const halfDelta = Math.trunc(deltaX / 2);
    let error = 0;
    while (x !== endX) {
      x += stepX;
      error += deltaY;
      if (error > halfDelta) {
        y += stepY;
        error -= deltaX;
      }
      retainCurrentPoint();
    }
  } else if (startY !== endY) {
    const halfDelta = Math.trunc(deltaY / 2);
    let error = 0;
    while (y !== endY) {
      y += stepY;
      error += deltaX;
      if (error > halfDelta) {
        x += stepX;
        error -= deltaY;
      }
      retainCurrentPoint();
    }
  }

  const finalRouteIndex = retainedCount - 1;
  const points = Array.from(
    { length: finalRouteIndex + 1 },
    (_, index) => readRoutePoint(record, index),
  );
  return {
    points,
    finalRouteIndex,
    updateCountUntilImpact: finalRouteIndex + 1,
  };
}

export function calculateEffectKindNineDamage({
  payload,
  defenseBase,
  defenseModifier = 0,
  specialDefenseFlag = 0,
  defenderClass,
}) {
  validateSignedWord(payload, "payload");
  validateSignedWord(defenseBase, "defenseBase");
  validateSignedWord(defenseModifier, "defenseModifier");
  validateUnsignedByte(specialDefenseFlag, "specialDefenseFlag");
  validateUnsignedDword(defenderClass, "defenderClass");

  let modifierPercent = 0;
  if (defenderClass === 4) {
    modifierPercent = 30;
  } else if (defenderClass === 5) {
    modifierPercent = 50;
  }
  const modified = addSignedWords(
    payload,
    Math.trunc((payload * modifierPercent) / 100),
  );
  const rawDefense = addSignedWords(defenseBase, defenseModifier);
  let defense = addSignedWords(
    rawDefense,
    specialDefenseFlag === 1 ? Math.trunc(rawDefense / 2) : 0,
  );
  if (defense > 90) {
    defense = 90;
  }
  const resultWord = toSignedWord(
    modified - Math.trunc((defense * modified) / 100),
  );
  return resultWord > 0 ? resultWord : 1;
}

export function resolveSubtype0cImpact({
  targetActive,
  targetGenerationMatches,
  payload,
  defenseBase,
  defenseModifier = 0,
  specialDefenseFlag = 0,
  defenderClass,
  buffer,
  health,
  healthApplicationMode = 0,
  defenderSignedByte38 = 0,
  selectedHealthApplicationTableByte = 1,
}) {
  if (typeof targetActive !== "boolean") {
    throw new TypeError(`targetActive must be a boolean; got ${targetActive}`);
  }
  if (typeof targetGenerationMatches !== "boolean") {
    throw new TypeError(
      `targetGenerationMatches must be a boolean; got ${targetGenerationMatches}`,
    );
  }
  validateUnsignedWord(buffer, "buffer");
  validateUnsignedWord(health, "health");
  validateUnsignedWord(healthApplicationMode, "healthApplicationMode");
  validateSignedByte(defenderSignedByte38, "defenderSignedByte38");
  // This pure reproduction accepts the raw index and the byte already
  // selected from the original table as separate original-input values.
  validateUnsignedByte(
    selectedHealthApplicationTableByte,
    "selectedHealthApplicationTableByte",
  );

  if (!targetActive) {
    return {
      effectDispatched: false,
      calculatedDamage: 0,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 0,
      healthApplicationReturn: null,
      healthApplicationSkippedByTableGate: false,
      buffer,
      health,
      projectileReleased: true,
    };
  }
  const damage = targetGenerationMatches
    ? calculateEffectKindNineDamage({
        payload,
        defenseBase,
        defenseModifier,
        specialDefenseFlag,
        defenderClass,
      })
    : 0;
  if (
    healthApplicationMode === 1 &&
    selectedHealthApplicationTableByte === 0
  ) {
    return {
      effectDispatched: true,
      calculatedDamage: damage,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 0,
      healthApplicationReturn: 1,
      healthApplicationSkippedByTableGate: true,
      buffer,
      health,
      projectileReleased: true,
    };
  }
  const signedBuffer = toSignedWord(buffer);
  if (signedBuffer !== 0 && signedBuffer >= damage) {
    return {
      effectDispatched: true,
      calculatedDamage: damage,
      damageAppliedToBuffer: damage,
      healthSubtractionOperand: 0,
      healthApplicationReturn: 1,
      buffer: toUnsignedWord(buffer - damage),
      health,
      healthApplicationSkippedByTableGate: false,
      projectileReleased: true,
    };
  }
  const healthAfterWordSubtraction = toUnsignedWord(health - damage);
  const healthRemainsPositive =
    toSignedWord(healthAfterWordSubtraction) > 0;
  return {
    effectDispatched: true,
    calculatedDamage: damage,
    damageAppliedToBuffer: 0,
    healthSubtractionOperand: damage,
    healthApplicationReturn: healthRemainsPositive ? 1 : 0,
    healthApplicationSkippedByTableGate: false,
    buffer: 0,
    health: healthRemainsPositive ? healthAfterWordSubtraction : 0,
    projectileReleased: true,
  };
}

function createReproductionVectors(sampleInterval) {
  const shortRoute = buildSampledProjectileRoute({
    startX: 10,
    startY: 20,
    endX: 23,
    endY: 20,
    sampleInterval,
  });
  const cappedRoute = buildSampledProjectileRoute({
    startX: 0,
    startY: 100,
    endX: 3000,
    endY: 100,
    sampleInterval,
  });
  const randomState = {
    seed: 12345,
    currentSeed: 54321,
  };
  return [
    {
      id: "normal-flight-and-impact",
      input: {
        route: {
          startX: 10,
          startY: 20,
          endX: 38,
          endY: 20,
          sampleInterval,
        },
        impact: {
          targetActive: true,
          targetGenerationMatches: true,
          payload: 45,
          defenseBase: 20,
          defenseModifier: 10,
          specialDefenseFlag: 0,
          defenderClass: 4,
          buffer: 0,
          health: 100,
        },
      },
      expected: {
        route: {
          points: [
            { x: 10, y: 20 },
            { x: 24, y: 20 },
            { x: 38, y: 20 },
          ],
          finalRouteIndex: 2,
          updateCountUntilImpact: 3,
        },
        impact: {
          effectDispatched: true,
          calculatedDamage: 41,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 41,
          healthApplicationReturn: 1,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 59,
          projectileReleased: true,
        },
      },
    },
    {
      id: "short-route-arrives-at-start-sample",
      input: {
        route: {
          startX: 10,
          startY: 20,
          endX: 23,
          endY: 20,
          sampleInterval,
        },
      },
      expected: { route: shortRoute },
    },
    {
      id: "route-error-accumulator-starts-at-zero",
      input: {
        route: {
          startX: 0,
          startY: 0,
          endX: 15,
          endY: 8,
          sampleInterval,
        },
      },
      expected: {
        route: {
          points: [
            { x: 0, y: 0 },
            { x: 14, y: 7 },
          ],
          finalRouteIndex: 1,
          updateCountUntilImpact: 2,
        },
      },
    },
    {
      id: "route-cap-preserves-original-memory-alias",
      input: {
        route: {
          startX: 0,
          startY: 100,
          endX: 3000,
          endY: 100,
          sampleInterval,
        },
      },
      expected: { route: cappedRoute },
    },
    {
      id: "pool-random-state-advances-before-projectiles",
      input: { randomState },
      expected: {
        randomState: advanceProjectilePoolRandomState(randomState),
      },
    },
    {
      id: "buffer-is-consumed-before-health",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: true,
          payload: 45,
          defenseBase: 0,
          defenseModifier: 0,
          specialDefenseFlag: 0,
          defenderClass: 1,
          buffer: 50,
          health: 100,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 45,
          damageAppliedToBuffer: 45,
          healthSubtractionOperand: 0,
          healthApplicationReturn: 1,
          healthApplicationSkippedByTableGate: false,
          buffer: 5,
          health: 100,
          projectileReleased: true,
        },
      },
    },
    {
      id: "health-table-gate-skips-all-state-mutation",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: true,
          payload: 45,
          defenseBase: 0,
          defenderClass: 1,
          buffer: 50,
          health: 100,
          healthApplicationMode: 1,
          defenderSignedByte38: 3,
          selectedHealthApplicationTableByte: 0,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 45,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 0,
          healthApplicationReturn: 1,
          healthApplicationSkippedByTableGate: true,
          buffer: 50,
          health: 100,
          projectileReleased: true,
        },
      },
    },
    {
      id: "defense-word-add-wraps-before-signed-cap",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: true,
          payload: 45,
          defenseBase: 32767,
          defenseModifier: 1,
          defenderClass: 1,
          buffer: 0,
          health: 20000,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 14790,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 14790,
          healthApplicationReturn: 1,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 5210,
          projectileReleased: true,
        },
      },
    },
    {
      id: "conditional-half-defense-add-wraps-as-word",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: true,
          payload: 45,
          defenseBase: -32768,
          specialDefenseFlag: 1,
          defenderClass: 1,
          buffer: 0,
          health: 100,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 5,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 5,
          healthApplicationReturn: 1,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 95,
          projectileReleased: true,
        },
      },
    },
    {
      id: "class-five-modified-payload-wraps-through-cx",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: true,
          payload: 32767,
          defenseBase: 0,
          defenderClass: 5,
          buffer: 0,
          health: 100,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 1,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 1,
          healthApplicationReturn: 1,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 99,
          projectileReleased: true,
        },
      },
    },
    {
      id: "signed-negative-buffer-does-not-absorb-damage",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: true,
          payload: 45,
          defenseBase: 0,
          defenderClass: 1,
          buffer: 0xffff,
          health: 100,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 45,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 45,
          healthApplicationReturn: 1,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 55,
          projectileReleased: true,
        },
      },
    },
    {
      id: "signed-negative-health-clamps-after-word-subtraction",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: true,
          payload: 45,
          defenseBase: 0,
          defenderClass: 1,
          buffer: 0,
          health: 0xffff,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 45,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 45,
          healthApplicationReturn: 0,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 0,
          projectileReleased: true,
        },
      },
    },
    {
      id: "inactive-target-is-not-dispatched",
      input: {
        impact: {
          targetActive: false,
          targetGenerationMatches: true,
          payload: 45,
          defenseBase: 0,
          defenderClass: 4,
          buffer: 0,
          health: 100,
        },
      },
      expected: {
        impact: {
          effectDispatched: false,
          calculatedDamage: 0,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 0,
          healthApplicationReturn: null,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 100,
          projectileReleased: true,
        },
      },
    },
    {
      id: "stale-target-generation-deals-zero",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: false,
          payload: 45,
          defenseBase: 0,
          defenderClass: 4,
          buffer: 0,
          health: 100,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 0,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 0,
          healthApplicationReturn: 1,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 100,
          projectileReleased: true,
        },
      },
    },
    {
      id: "stale-generation-zero-damage-still-runs-health-branch",
      input: {
        impact: {
          targetActive: true,
          targetGenerationMatches: false,
          payload: 45,
          defenseBase: 0,
          defenderClass: 4,
          buffer: 0,
          health: 0xffff,
        },
      },
      expected: {
        impact: {
          effectDispatched: true,
          calculatedDamage: 0,
          damageAppliedToBuffer: 0,
          healthSubtractionOperand: 0,
          healthApplicationReturn: 0,
          healthApplicationSkippedByTableGate: false,
          buffer: 0,
          health: 0,
          projectileReleased: true,
        },
      },
    },
    {
      id: "full-projectile-pool-skips-spawn",
      input: {
        activeSubtypes: Array(PROJECTILE_SLOT_COUNT).fill(
          PROJECTILE_SUBTYPE,
        ),
      },
      expected: { allocatedSlot: 0, spawned: false },
    },
  ];
}

function extractSubtypeConfig(instructions, subtype) {
  const expectedRecord =
    PROJECTILE_CONFIG_TABLE + subtype * PROJECTILE_CONFIG_STRIDE;
  let recordAddress;
  let pushes = [];

  for (const instruction of instructions) {
    const recordMove = /^MOV ECX,(0x[0-9a-f]+)$/.exec(
      instruction.text,
    );
    if (recordMove) {
      recordAddress = Number.parseInt(recordMove[1].slice(2), 16);
    }
    const push = /^PUSH (-?0x[0-9a-f]+)$/.exec(instruction.text);
    if (push) {
      pushes.push(parseImmediate(push[1]));
    }
    if (instruction.text !== `CALL ${toHex(PROJECTILE_CONFIG_WRITER)}`) {
      continue;
    }
    if (recordAddress === expectedRecord) {
      if (pushes.length !== 8) {
        throw new Error(
          `Subtype ${toHex(subtype)} config has ${pushes.length} arguments; expected 8`,
        );
      }
      return pushes.toReversed();
    }
    recordAddress = undefined;
    pushes = [];
  }
  throw new Error(
    `Missing subtype ${toHex(subtype)} config record ${toHex(expectedRecord)}`,
  );
}

function requireJumpTable(document, functionEntry, switchAddress) {
  if (!Array.isArray(document.tables)) {
    throw new Error("Jump-table analysis has no tables array");
  }
  const table = document.tables.find(
    (candidate) =>
      candidate.functionEntry === toHex(functionEntry) &&
      candidate.switchAddress === toHex(switchAddress),
  );
  if (!table || !Array.isArray(table.cases)) {
    throw new Error(
      `Missing jump table ${toHex(switchAddress)} for function ${toHex(functionEntry)}`,
    );
  }
  return table;
}

function requireInstruction(functionReport, address, text) {
  const instruction = functionReport.instructions.find(
    (candidate) => candidate.address === toHex(address),
  );
  if (!instruction || instruction.text !== text) {
    throw new Error(
      `${functionReport.entry} instruction mismatch at ${toHex(address)}: expected ${text}, got ${instruction?.text ?? "missing"}`,
    );
  }
  return instruction;
}

function requireCallEdge(seeds, caller, callee) {
  const callerReport = requireFunction(seeds, caller);
  const expectedCallee = toHex(callee);
  const callText = `CALL ${expectedCallee}`;
  if (
    !callerReport.instructions.some(
      (instruction) => instruction.text === callText,
    )
  ) {
    throw new Error(
      `Missing required call edge ${toHex(caller)} -> ${expectedCallee}`,
    );
  }
  return {
    caller: toHex(caller),
    callee: expectedCallee,
  };
}

function readAnalysisDocument(path, expectedSourceSha256, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label} from ${path}: ${error.message}`, {
      cause: error,
    });
  }
  if (!parsed || typeof parsed.sourceSha256 !== "string") {
    throw new Error(`${path} is not a supported ${label} document`);
  }
  assertEqual(
    parsed.sourceSha256,
    expectedSourceSha256,
    `${path} source SHA-256`,
  );
  return parsed;
}

function requireFunction(seeds, entry) {
  if (!Array.isArray(seeds.functions)) {
    throw new Error("Ghidra seed analysis has no functions array");
  }
  const functionReport = seeds.functions.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!functionReport || !Array.isArray(functionReport.instructions)) {
    throw new Error(
      `Ghidra seed analysis is missing function ${toHex(entry)} instructions`,
    );
  }
  return functionReport;
}

function summarizeFunction(functionReport) {
  return {
    entry: functionReport.entry,
    name: functionReport.name,
    bodyRanges: functionReport.bodyRanges,
    basicBlockCount: functionReport.basicBlocks.length,
    instructionCount: functionReport.instructions.length,
    instructionSha256: functionReport.instructionSha256,
  };
}

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) {
    throw new RangeError(
      `${toHex(anchor.va)} is not backed by a PE file section`,
    );
  }
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (Buffer.compare(actual, expected) !== 0) {
    throw new Error(
      `Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}: expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    ...anchor,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    expectedBytes: formatBytes(expected),
    actualBytes: formatBytes(actual),
    matched: true,
  };
}

function writeRoutePoint(record, index, x, y) {
  record.setInt16(ROUTE_X_OFFSET + index * 2, toSignedWord(x), true);
  record.setInt16(ROUTE_Y_OFFSET + index * 2, toSignedWord(y), true);
}

function readRoutePoint(record, index) {
  return {
    x: record.getInt16(ROUTE_X_OFFSET + index * 2, true),
    y: record.getInt16(ROUTE_Y_OFFSET + index * 2, true),
  };
}

function toSignedWord(value) {
  return (value << 16) >> 16;
}

function toUnsignedWord(value) {
  return value & 0xffff;
}

function addSignedWords(left, right) {
  return toSignedWord(toUnsignedWord(left) + toUnsignedWord(right));
}

function validateAcceptedRouteCoordinate(value, label) {
  validateIntegerRange(value, 0, 0x7fff, label);
}

function validateSignedWord(value, label) {
  validateIntegerRange(value, -0x8000, 0x7fff, label);
}

function validateUnsignedWord(value, label) {
  validateIntegerRange(value, 0, 0xffff, label);
}

function validateUnsignedByte(value, label) {
  validateIntegerRange(value, 0, 0xff, label);
}

function validateSignedByte(value, label) {
  validateIntegerRange(value, -0x80, 0x7f, label);
}

function validateUnsignedDword(value, label) {
  validateIntegerRange(value, 0, 0xffffffff, label);
}

function validateIntegerRange(value, minimum, maximum, label) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(
      `${label} must be an integer in ${minimum}..${maximum}; got ${value}`,
    );
  }
}

function parseImmediate(value) {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(3) : value.slice(2);
  const parsed = Number.parseInt(digits, 16);
  return negative ? -parsed : parsed;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} mismatch: expected ${expected}, got ${actual}`,
    );
  }
}

function assertArrayEqual(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      `${label} mismatch: expected [${expected.join(", ")}], got [${actual.join(", ")}]`,
    );
  }
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join(" ");
}

function parseArgs(argv) {
  const parsed = {};
  const pathOptions = new Map([
    ["--input", "input"],
    ["--seeds", "seeds"],
    ["--jump-tables", "jumpTables"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    const option = pathOptions.get(argument);
    if (!option) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${argument} requires a path`);
    }
    parsed[option] = value;
    index += 1;
  }
  return parsed;
}

function printSummary(report) {
  console.log("K01 Ryu Seong-ryong projectile pilot:");
  console.log(`  subtype: ${toHex(report.identity.projectileSubtype)}`);
  console.log(
    `  route sample interval: ${report.subtypeConfig.routeSampleInterval}`,
  );
  console.log(`  effect kind: ${report.damage.effectKind}`);
  console.log(`  base payload: ${report.damage.basePayload}`);
  console.log(`  reproduction vectors: ${report.testVectors.length}`);
}
