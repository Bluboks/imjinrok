#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePeImage } from "./pe-image.mjs";
import { readJson, verifyEvidencePoint, verifyRawCodeRange, verifySeededFunction } from "./static-evidence.mjs";

const EXPECTED_EXE = {
  size: 843_833,
  sha256: "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e",
};
const EXPECTED_ARTIFACT_HASHES = {
  functions: "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e",
  references: "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5",
  seeds: "386b0f4e86c3376f34fe2b50fedb7e45b762c30784d4ebcc0387aa6f431811b2",
};
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DEFAULT_PATHS = {
  executablePath: resolve(ROOT, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: resolve(ROOT, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: resolve(ROOT, "analysis/generated/imjinrok2/references.json"),
  seedsPath: resolve(ROOT, "analysis/generated/imjinrok2/seeds.json"),
};

const FLAG_ADDRESS = "0x008438dc";
const FLAG_ADDRESS_NUMBER = 0x008438dc;
const ZERO_FILL = { start: 0x007c5ed8, endExclusive: 0x00843980 };
const FLAG_DIRECT_REFERENCES = [
  ["0x0048a731", "READ", "0x0048a5c0"],
  ["0x0048a77a", "WRITE", "0x0048a5c0"],
  ["0x0048a7f2", "READ", "0x0048a5c0"],
];
const REDRAW_REQUEST_ADDRESS = "0x007c6610";
const COMPACT_MAP_MODE_ADDRESS = "0x007c6612";
const PRIMARY_GATE_ADDRESS = "0x00bcbd84";
const REDRAW_REQUEST_DIRECT_REFERENCES = [
  ["0x00447930", "READ", "0x004475a0"],
  ["0x00447940", "WRITE", "0x004475a0"],
  ["0x0045f482", "WRITE", "0x0045f320"],
];
const COMPACT_MAP_MODE_DIRECT_REFERENCES = [
  ["0x00447964", "READ", "0x004475a0"],
  ["0x0045f48b", "READ", "0x0045f320"],
  ["0x0045f495", "WRITE", "0x0045f320"],
];
const SEEDED_FUNCTION_SPECS = [
  {
    entry: "0x0048a5c0",
    bodyRange: "0x0048a5c0-0x0048a878",
    blockCount: 32,
    instructionCount: 181,
    instructionSha256: "c2a0e73fb0e208846f77187fa11310cdd4177f62c6fbd61732d822f513115791",
    bodySha256: "0b78f8d459c6fa6d316d00bfa07148949a9156d182d3428726623749a0d9eed8",
  },
  {
    entry: "0x00460ba0",
    bodyRange: "0x00460ba0-0x00460e20",
    blockCount: 17,
    instructionCount: 144,
    instructionSha256: "248c49519c1c692efde84ee3aac2159912097dca7ed46fe3f93ab7b7048b748e",
    bodySha256: "47f5f8e1743260ffdbc0f378f46510ec4126c2accc74cc41e2464dd77a5f3b32",
  },
];
const ARTIFACT_FUNCTION_SPECS = [
  {
    entry: "0x004475a0",
    bodyRange: "0x004475a0-0x00447bb8",
    bodySize: 1561,
    instructionCount: 418,
    instructionSha256: "fab8bfe9d6a10a75b13e22823ab820abe6deecaa08ed3ae460ca2b9fd87e3cff",
    bodySha256: "81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c",
    requiredCallers: ["0x0045f9c0"],
    requiredCallees: ["0x0044abb0", "0x0044ada0", "0x004abbc0", "0x004abe50"],
  },
  {
    entry: "0x0045f320",
    bodyRange: "0x0045f320-0x0045f928",
    bodySize: 1545,
    instructionCount: 479,
    instructionSha256: "4fbafd1048ead3bb7cf6a527f356e619358b8aae7a89113f14840200bb84df51",
    bodySha256: "0e1f7677a947bb9499881bb308a55adced0c1cbf516408a3fb1056428d60c469",
  },
  {
    entry: "0x004abbc0",
    bodyRange: "0x004abbc0-0x004abcab",
    bodySize: 236,
    instructionCount: 70,
    instructionSha256: "ddce35f213714deb4b58e0726f197550ec7f8cbeaa60c9031640da3bf89ec45f",
    bodySha256: "f836259410483095b460877f36604666713d9f432c86e8dc9a0e460323a7bcf5",
  },
  {
    entry: "0x004abe50",
    bodyRange: "0x004abe50-0x004abebd",
    bodySize: 110,
    instructionCount: 36,
    instructionSha256: "4d98df782636f4a514db1ac3f854df6073aa396f73d2e0101ab4d293b3dad7da",
    bodySha256: "59d03958417ea5e31fafff2f10f517faf8c41344210fdeaed1baa0ad527a3549",
    requiredCallees: ["0x004abd90"],
  },
  {
    entry: "0x004abd90",
    bodyRange: "0x004abd90-0x004abe48",
    bodySize: 185,
    instructionCount: 63,
    instructionSha256: "1b1c587b4b416a28edd243b90ecc9f169b1db3f3d3675134bacb673db2e41543",
    bodySha256: "f7e991299d06f83d49733276dd14a0080a75a1890c55bd26570778fc3fcdf7e3",
    requiredCallees: ["0x0044ba50"],
  },
];
const UNIQUE_HUD_ROOT_CALLEES = ["0x004abbc0", "0x004abe50"];
const REQUIRED_SEEDS = [
  ["0x0048a731", "k01-k0120-condition-site", "0x0048a5c0"],
  ["0x00460baf", "mission-session-zero-fill", "0x00460ba0"],
];
const ANCHORS = [
  {
    id: "beacon-qualified-scan-and-one-write",
    va: 0x0048a724,
    bytes:
      "e8 77 d8 ff ff 85 c0 0f 85 c1 00 00 00 66 39 2d dc 38 84 00 0f 85 b4 00 00 00 53 57 33 db bf 8f 52 63 00 c7 44 24 10 b0 04 00 00 53 e8 eb 76 fb ff 83 c4 04 85 c0 74 7e 66 0f be 47 01 66 3b 05 44 cc bc 00 75 70 80 3f 34 75 6b 80 7f 55 64 75 65 b9 08 be bc 00 66 89 35 dc 38 84 00",
    meaning:
      "only the active current-owner class-52 progress-100 scan writes the flag, and it writes WORD one",
  },
  {
    id: "native-effects-do-not-clear-flag",
    va: 0x0048a781,
    bytes:
      "e8 1a 7c ff ff 85 c0 75 19 68 38 2f 4c 00 b9 08 be bc 00 e8 e7 79 ff ff b9 08 be bc 00 e8 9d 7b ff ff 8d 4c 24 14 51 6a 10 6a 35 6a 37 e8 6d dc ff ff 6a 05 6a 35 6a 37 e8 e2 84 fb ff 83 c4 1c b9 f0 ff ab 00 56 e8 04 a1 fd ff 6a 35 6a 37 b9 d8 5e 7c 00 e8 96 6d fd ff",
    meaning:
      "after the one-write, script/native calls occur; no instruction in this block clears the flag",
  },
  {
    id: "post-state-is-the-only-direct-read-consumer",
    va: 0x0048a7da,
    bytes:
      "8b 44 24 10 43 81 c7 58 05 00 00 48 89 44 24 10 0f 85 5f ff ff ff 5f 5b 66 39 35 dc 38 84 00 75 17 b9 08 be bc 00 e8 8b 7b ff ff 85 c0 75 09 66 8b c6 5e 5d 83 c4 50 c3",
    meaning:
      "after the fixed 1200-slot loop, flag exactly one gates a script-context read and direct AX one return",
  },
  {
    id: "standard-mission-entry-clears-containing-dword",
    va: 0x00460ba3,
    bytes: "8b f1 57 b9 aa f6 01 00 33 c0 8b fe f3 ab",
    meaning:
      "standard mission entry zero-fills DWORDs in [0x007c5ed8, 0x00843980), which contains the flag",
  },
  {
    id: "hud-compact-map-primary-gate",
    va: 0x004478d5,
    bytes:
      "0f bf 0d 44 cc bc 00 8d 04 49 c1 e0 04 2b c1 8d 04 40 8d 14 80 c1 e2 04 66 39 9a d0 e9 82 00 74 0d 66 39 1d 84 bd bc 00 0f 85 8e 00 00 00",
    meaning:
      "HUD compact-map draw path continues when the current-player record WORD is zero or WORD[0x00bcbd84] is zero; otherwise it skips the draw block",
  },
  {
    id: "hud-compact-map-render-consumer",
    va: 0x00447903,
    bytes:
      "33 c9 66 39 0d 84 27 55 00 75 0e 51 51 6a 3f e8 39 b6 02 00 83 c4 0c eb 12 a1 80 5f 7c 00 33 d2 be 1e 00 00 00 f7 f6 85 d2 75 02 8b cb 66 39 1d 10 66 7c 00 66 89 1d 84 27 55 00 75 0b 66 c7 05 10 66 7c 00 00 00 eb 05 66 3b cb 75 41 a1 6c 92 54 00 b9 18 94 55 00 50 e8 50 32 00 00 3b c3 75 2d 0f bf 0d 12 66 7c 00 51 b9 c8 51 5e 00 e8 4a 42 06 00 b9 c8 51 5e 00 e8 d0 44 06 00 8b 15 6c 92 54 00 b9 18 94 55 00 52 e8 0f 34 00 00",
    meaning:
      "the admitted HUD path consumes the redraw request and compact-map mode, then locks a surface, calls 0x004abbc0 and 0x004abe50, and unlocks it",
  },
  {
    id: "key-nine-writes-compact-map-control",
    va: 0x0045f464,
    bytes:
      "66 83 3d c8 df 4b 00 03 0f 85 e2 01 00 00 66 83 3d 84 27 55 00 00 0f 84 d4 01 00 00 33 d2 66 c7 05 10 66 7c 00 01 00 66 39 15 12 66 7c 00 0f 94 c2 66 89 15 12 66 7c 00 e9 b3 01 00 00",
    meaning:
      "the key-9 window path, conditioned on mode WORD 3 and a nonzero prior latch, writes redraw-request one and toggles compact-map mode between zero and one",
  },
  {
    id: "hud-compact-map-terrain-map-cell-byte-write",
    va: 0x004abbe3,
    bytes:
      "33 f6 66 39 31 0f 8e b8 00 00 00 0f bf d2 55 89 54 24 14 0f bf c6 33 db 66 0f b6 94 81 5b 40 00 00 66 0f b6 bc 81 5c 40 00 00 0f bf d2 0f bf ff 8d 14 92 8d 14 d2 8d 3c 97 8b 54 24 14 8a 9f fe 3e 82 00 0f be af 5e 4d 7d 00 8b fb 33 db 8a 9c 81 5a 40 00 00 03 da 33 d2 0f af 1d 28 94 55 00 8a 94 81 59 40 00 00 a1 28 a9 55 00 c1 e5 08 03 c3 46 8a 9c 2f 68 40 53 00 88 1c 02",
    meaning:
      "mode-one helper iterates WORD[ECX] cells, derives a source byte from cell/table bytes, and stores that byte through the compact HUD surface destination base",
  },
  {
    id: "hud-compact-map-terrain-mode-one-branch",
    va: 0x004abbc0,
    bytes:
      "a1 20 94 55 00 8b 15 b8 cc 88 00 2b d0 8b 44 24 04 53 81 c2 86 01 00 00 56 83 f8 01 57 0f 85 88 00 00 00",
    meaning:
      "terrain/map-cell helper selects the byte-writing loop when its stack mode argument equals one; other modes branch to the alternate clear loop",
  },
  {
    id: "hud-compact-map-active-entity-marker-projection",
    va: 0x004abe50,
    bytes:
      "55 57 33 ff 8b e9 66 39 3d 38 37 84 00 7e 5c 56 0f bf c7 0f bf 34 45 d8 2d 84 00 56 e8 cf 5f f9 ff 83 c4 04 85 c0 74 38 8d 0c f6 8d 04 4e 8d 34 c0 c1 e6 03 80 be 5a 52 63 00 01 75 23 8d 8e 58 52 63 00 e8 58 d4 f8 ff 66 8b 96 16 54 63 00 50 66 8b 86 14 54 63 00 52 50 8b cd e8 e0 fe ff ff",
    meaning:
      "helper iterates the active-entity index list, requires an active-record byte equal to one, obtains two record WORDs, and passes them with the HUD surface context to 0x004abd90",
  },
  {
    id: "hud-compact-map-marker-pixel-writer",
    va: 0x004abd90,
    bytes:
      "0f bf 44 24 08 0f bf 54 24 04 53 55 56 57 8b f9 0f bf 8c 47 ba 37 03 00 8d 04 11 8b 15 b8 cc 88 00 66 0f b6 8c 47 b2 b7 03 00 66 0f b6 9c 47 b3 b7 03 00 a1 20 94 55 00 2b d0 0f bf f1 8d 84 1a 86 01 00 00 b9 18 94 55 00 0f bf e8 8b 44 24 1c 50 55 56 e8 68 fc f9 ff",
    meaning:
      "marker projection derives compact-surface coordinates from the two passed WORDs and calls 0x0044ba50 with the HUD surface context and a marker argument",
  },
];

export function extractK01BeaconMinimapLifecycle(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const executable = readVerified(paths.executablePath, "original executable", EXPECTED_EXE);
  const image = parsePeImage(executable.buffer, paths.executablePath);
  const functions = readVerifiedJson(paths.functionsPath, "functions", EXPECTED_ARTIFACT_HASHES.functions);
  const references = readVerifiedJson(paths.referencesPath, "references", EXPECTED_ARTIFACT_HASHES.references);
  const seeds = readVerifiedJson(paths.seedsPath, "seeds", EXPECTED_ARTIFACT_HASHES.seeds);
  verifyNoNamedCompactMapCandidate([executable.buffer, readFileSync(paths.functionsPath), readFileSync(paths.referencesPath), readFileSync(paths.seedsPath)]);

  const analyzedFunctions = SEEDED_FUNCTION_SPECS.map((spec) => {
    const record = functions.parsed.functions.find(({ entry }) => entry === spec.entry);
    if (!record || record.instructionSha256 !== spec.instructionSha256) {
      throw new Error(`Function instruction provenance mismatch for ${spec.entry}`);
    }
    return verifySeededFunction(executable.buffer, image, seeds.parsed, spec);
  });
  for (const spec of ARTIFACT_FUNCTION_SPECS) {
    analyzedFunctions.push(verifyFunctionArtifact(executable.buffer, image, functions.parsed, spec));
  }
  for (const callee of UNIQUE_HUD_ROOT_CALLEES) {
    const record = functions.parsed.functions.find((candidate) => candidate.entry === callee);
    if (!record || !same(record.callers ?? [], ["0x004475a0"])) {
      throw new Error(`HUD helper caller provenance mismatch for ${callee}`);
    }
  }
  for (const [address, label, functionEntry] of REQUIRED_SEEDS) {
    const seed = seeds.parsed.seeds.find((entry) => entry.address === address);
    if (!seed || seed.label !== label || seed.functionEntry !== functionEntry) {
      throw new Error(`Required seed mismatch at ${address}`);
    }
  }

  const flagReferences = references.parsed.references
    .filter(({ to }) => to === FLAG_ADDRESS)
    .map(({ from, type, fromFunctionEntry }) => [from, type, fromFunctionEntry]);
  if (!same(flagReferences, FLAG_DIRECT_REFERENCES)) {
    throw new Error("Beacon flag canonical direct-reference set mismatch");
  }
  const flagDwordCovered = FLAG_ADDRESS_NUMBER >= ZERO_FILL.start && FLAG_ADDRESS_NUMBER < ZERO_FILL.endExclusive;
  if (!flagDwordCovered) throw new Error("Mission-entry zero fill does not cover beacon flag");
  const redrawRequestReferences = directReferences(references.parsed, REDRAW_REQUEST_ADDRESS);
  const compactMapModeReferences = directReferences(references.parsed, COMPACT_MAP_MODE_ADDRESS);
  if (!same(redrawRequestReferences, REDRAW_REQUEST_DIRECT_REFERENCES)) {
    throw new Error("Compact-map redraw-request canonical direct-reference set mismatch");
  }
  if (!same(compactMapModeReferences, COMPACT_MAP_MODE_DIRECT_REFERENCES)) {
    throw new Error("Compact-map mode canonical direct-reference set mismatch");
  }

  return {
    question:
      "For K01, does a completed-beacon count drive a minimap enable/disable lifecycle, including disable after the last completed beacon is removed?",
    classification: "still-unresolved",
    classificationReason:
      "The HUD compact-map draw/control entry is recovered, but the computed/current-player primary gate and WORD[0x00bcbd84] producers remain unresolved; either could be alias-written from beacon completion or destruction. Only the hypothesis that one-shot WORD[0x008438dc] itself is the live completed-beacon gate is refuted.",
    analysisStatus: "static-confirmed-renderer-and-refuted-one-shot-flag-hypothesis; overall-rule-unresolved",
    reproductionStatus: "reproduction-complete-for-flag-and-primary-gate-vectors",
    implementationStatus: "none",
    sources: {
      executable: omitBuffer(executable),
      functions: summarizeArtifact(functions),
      references: summarizeArtifact(references),
      seeds: summarizeArtifact(seeds),
    },
    analyzedFunctions,
    evidence: ANCHORS.map((anchor) => verifyEvidencePoint(executable.buffer, image, anchor)),
    searchTrail: {
      completedBeaconStateSearch:
        "Filtered the complete references artifact by direct target 0x008438dc; the only three results are 0x0048a731 READ, 0x0048a77a WRITE, and 0x0048a7f2 READ, all in FUN_0048a5c0.",
      originalTextResourceSearch:
        "ASCII strings from the hash-bound EXE and generated imjinrok2 JSON were searched for mini-map/minimap/small-map spellings; no original named string/resource candidate was found, so names were not used to identify the renderer.",
      functionGraphCandidate:
        "The source-bound function graph identifies FUN_004475a0 (caller 0x0045f9c0) as a HUD candidate because its callees include paired surface lock/unlock 0x0044abb0/0x0044ada0 and the uniquely root-called compact-map helpers 0x004abbc0 and 0x004abe50.",
      exactConfirmation:
        "Byte anchors at 0x004478d5, 0x00447903, and 0x0045f464 close the primary gate, request/mode consumption with surface draw, and interactive writer. They identify a concrete HUD compact-map entry, while its primary-gate producers remain the exact unresolved edge for the overall rule.",
    },
    flagLifecycle: {
      address: FLAG_ADDRESS,
      width: "WORD",
      qualifyingRecord:
        "active lookup succeeds; signed owner byte equals current-player WORD; class byte is 52; progress byte is 100",
      writer: { site: "0x0048a77a", value: 1, condition: "each qualifying iteration of the initial flag-zero scan" },
      initializerReset: {
        site: "0x00460baf",
        range: "[0x007c5ed8, 0x00843980)",
        effect: "standard mission entry clears the containing DWORD",
      },
      clearerOnDestructionOrRemoval: "none in the complete proven flag CFG/direct-reference set",
      directReferenceSet: FLAG_DIRECT_REFERENCES.map(([from, type, fromFunctionEntry]) => ({ from, type, fromFunctionEntry })),
      directConsumer: {
        site: "0x0048a7f2",
        flow: "flag == 1 exactly -> 0x00482390(script context +8) -> if zero return AX=1; otherwise continue hero-loss checks",
        notClaimed: "No minimap/UI-render call is reached from this direct consumer in the proven CFG.",
      },
      nativeEffectsBoundary:
        "The post-write calls to 0x00488420, 0x00442ca0, 0x004648d0, and 0x00461570 are not classified as minimap or fog-of-war behavior here because their downstream consumer data flow is outside this unit.",
    },
    beaconFlagHypothesis: {
      classification: "refuted",
      statement: "WORD[0x008438dc] is the live completed-beacon count gate for the HUD compact-map renderer",
      reason:
        "Its complete canonical direct-reference set is confined to FUN_0048a5c0, it is one-shot with no removal clearer in that set, and no direct operand occurs in the recovered renderer root/control anchors.",
    },
    compactMapDrawControl: {
      renderer: {
        root: "0x004475a0",
        primaryGate:
          `continue to cadence/render control when current-player record WORD[0x0082e9d0 + signed(WORD[0x00bccc44])*0x2c10] == 0 OR WORD[${PRIMARY_GATE_ADDRESS}] == 0; otherwise skip`,
        directConsumer:
          "after cadence/request control, lock via 0x0044abb0 -> call 0x004abbc0(mode WORD[0x007c6612]) -> call 0x004abe50 -> unlock via 0x0044ada0",
        beaconInputBoundary:
          "the complete direct-reference set for WORD[0x008438dc] contains only 0x0048a5c0 sites; no 0x008438dc direct operand occurs in this renderer root or its recovered draw-control anchors",
      },
      helpers: {
        terrainMapCellByteWriter: {
          entry: "0x004abbc0",
          fact: "in mode one, iterates WORD[ECX] cell entries, derives a byte from cell/table data, and writes it through the compact HUD surface destination",
        },
        activeEntityMarkerProjection: {
          entry: "0x004abe50",
          fact: "iterates active-entity indices, gates on an active-record byte, then passes two record WORDs and HUD surface context to 0x004abd90",
          projection: "0x004abd90 derives surface coordinates and calls 0x0044ba50 for the marker pixel operation",
        },
      },
      mode: {
        address: COMPACT_MAP_MODE_ADDRESS,
        writer: "0x0045f495 toggles it on the key-9 window path after mode WORD[0x004bdfc8] == 3 and prior latch WORD[0x00552784] != 0",
        initializerReset: "0x00460baf broad zero-fill covers this WORD during standard mission entry",
        clearerOnDestructionOrRemoval: "none in the canonical direct-reference set",
        directReferenceSet: compactMapModeReferences.map(referenceObject),
      },
      redrawRequest: {
        address: REDRAW_REQUEST_ADDRESS,
        writer: "0x0045f482 writes one on the same key-9 path",
        consumerClearer: "0x00447940 clears it after the renderer consumes a request",
        initializerReset: "0x00460baf broad zero-fill covers this WORD during standard mission entry",
        directReferenceSet: redrawRequestReferences.map(referenceObject),
      },
      unresolvedPrimaryGateProducer:
        `The direct-reference set for WORD[${PRIMARY_GATE_ADDRESS}] contains reads only; the per-player record operand is computed. This unit does not assign either raw gate a gameplay name or claim its alias writers are globally absent.`,
    },
    vectors: lifecycleVectors(),
    remainingEdge:
      "Recover all producers/alias writers of current-player record WORD[0x0082e9d0 + signed(WORD[0x00bccc44])*0x2c10] and WORD[0x00bcbd84], then trace whether completion and destruction/removal can reach either operand. Until then, the overall completed-beacon minimap rule is unresolved. Selector-5 grid mutation remains outside this unit and is not called fog-of-war behavior.",
  };
}

export function replayBeaconFlagLifecycle({ initialFlagWord, records }) {
  const flag = unsignedWord(initialFlagWord, "initialFlagWord");
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  let nextFlag = flag;
  const events = [];
  if (nextFlag !== 0) {
    events.push({ kind: "initial-flag-nonzero-skip" });
    return { finalFlagWord: nextFlag, events };
  }
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object") throw new TypeError(`records[${index}] must be an object`);
    const qualifies = record.active === true && record.ownerMatches === true && record.classByte === 52 && record.progressByte === 100;
    if (!qualifies) {
      events.push({ kind: "record-no-op", index });
      continue;
    }
    nextFlag = 1;
    events.push({ kind: "flag-write-one", index });
  }
  return { finalFlagWord: nextFlag, events };
}

export function resetFlagAtStandardMissionEntry(value) {
  unsignedWord(value, "value");
  return 0;
}

export function compactMapPrimaryGateAllows({ playerRecordGateWord, globalGateWord }) {
  return unsignedWord(playerRecordGateWord, "playerRecordGateWord") === 0 || unsignedWord(globalGateWord, "globalGateWord") === 0;
}

function lifecycleVectors() {
  const completed = { active: true, ownerMatches: true, classByte: 52, progressByte: 100 };
  return [
    { id: "zero-completed-beacons", input: { initialFlagWord: 0, records: [] }, expected: replayBeaconFlagLifecycle({ initialFlagWord: 0, records: [] }) },
    { id: "first-completion-writes-one", input: { initialFlagWord: 0, records: [completed] }, expected: replayBeaconFlagLifecycle({ initialFlagWord: 0, records: [completed] }) },
    { id: "multiple-completions-repeat-within-one-scan", input: { initialFlagWord: 0, records: [completed, completed] }, expected: replayBeaconFlagLifecycle({ initialFlagWord: 0, records: [completed, completed] }) },
    { id: "last-removal-does-not-clear-existing-one", input: { initialFlagWord: 1, records: [] }, expected: replayBeaconFlagLifecycle({ initialFlagWord: 1, records: [] }) },
    { id: "inactive-or-incomplete-records-are-no-ops", input: { initialFlagWord: 0, records: [{ ...completed, active: false }, { ...completed, progressByte: 99 }] }, expected: replayBeaconFlagLifecycle({ initialFlagWord: 0, records: [{ ...completed, active: false }, { ...completed, progressByte: 99 }] }) },
    { id: "standard-entry-reset-clears-stale-word", input: { value: 0xffff }, expected: { finalFlagWord: resetFlagAtStandardMissionEntry(0xffff) } },
    { id: "compact-map-primary-gate-allows-zero-player-word", input: { playerRecordGateWord: 0, globalGateWord: 1 }, expected: { allowsRenderControl: compactMapPrimaryGateAllows({ playerRecordGateWord: 0, globalGateWord: 1 }) } },
    { id: "compact-map-primary-gate-allows-zero-global-word", input: { playerRecordGateWord: 1, globalGateWord: 0 }, expected: { allowsRenderControl: compactMapPrimaryGateAllows({ playerRecordGateWord: 1, globalGateWord: 0 }) } },
    { id: "compact-map-primary-gate-skips-only-two-nonzero-words", input: { playerRecordGateWord: 1, globalGateWord: 1 }, expected: { allowsRenderControl: compactMapPrimaryGateAllows({ playerRecordGateWord: 1, globalGateWord: 1 }) } },
  ];
}

function verifyFunctionArtifact(buffer, image, functions, spec) {
  const record = functions.functions.find((candidate) => candidate.entry === spec.entry);
  if (!record || record.bodyRanges?.length !== 1 || record.bodyRanges[0] !== spec.bodyRange || record.bodySize !== spec.bodySize || record.instructionCount !== spec.instructionCount || record.instructionSha256 !== spec.instructionSha256) {
    throw new Error(`Function artifact provenance mismatch for ${spec.entry}`);
  }
  for (const caller of spec.requiredCallers ?? []) {
    if (!record.callers?.includes(caller)) throw new Error(`Function graph caller mismatch for ${spec.entry}: ${caller}`);
  }
  for (const callee of spec.requiredCallees ?? []) {
    if (!record.callees?.includes(callee)) throw new Error(`Function graph callee mismatch for ${spec.entry}: ${callee}`);
  }
  const start = Number.parseInt(spec.entry.slice(2), 16);
  const endExclusive = start + spec.bodySize;
  return {
    entry: spec.entry,
    bodyRange: spec.bodyRange,
    byteRange: `0x${start.toString(16).padStart(8, "0")}-0x${endExclusive.toString(16).padStart(8, "0")} (end exclusive)`,
    instructionCount: spec.instructionCount,
    bodySha256: verifyRawCodeRange(buffer, image, { id: spec.entry, start, endExclusive, sha256: spec.bodySha256 }).bodySha256,
  };
}

function directReferences(references, address) {
  return references.references
    .filter(({ to }) => to === address)
    .map(({ from, type, fromFunctionEntry }) => [from, type, fromFunctionEntry]);
}

function referenceObject([from, type, fromFunctionEntry]) {
  return { from, type, fromFunctionEntry };
}

function verifyNoNamedCompactMapCandidate(buffers) {
  const spellings = ["mini-map", "minimap", "small-map"];
  for (const buffer of buffers) {
    const lower = buffer.toString("latin1").toLowerCase();
    for (const spelling of spellings) {
      if (lower.includes(spelling)) throw new Error(`Unexpected named compact-map candidate: ${spelling}`);
    }
  }
}

function readVerified(path, label, expected) {
  const buffer = readFileSync(path);
  if (buffer.length !== expected.size) throw new Error(`${label} size mismatch`);
  const sha256 = digest(buffer);
  if (sha256 !== expected.sha256) throw new Error(`${label} SHA-256 mismatch`);
  return { path, size: buffer.length, sha256, buffer };
}

function readVerifiedJson(path, label, expectedSha256) {
  const buffer = readFileSync(path);
  const sha256 = digest(buffer);
  if (sha256 !== expectedSha256) throw new Error(`${label} SHA-256 mismatch`);
  const parsed = readJson(path);
  if (parsed.sourceSha256 !== EXPECTED_EXE.sha256) throw new Error(`${label} source SHA-256 mismatch`);
  return { path, size: buffer.length, sha256, parsed };
}

function summarizeArtifact({ path, size, sha256, parsed }) {
  return { path, size, sha256, sourceSha256: parsed.sourceSha256 };
}

function unsignedWord(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${name} must be an unsigned WORD`);
  return value;
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function same(actual, expected) {
  return actual.length === expected.length && actual.every((entry, index) => JSON.stringify(entry) === JSON.stringify(expected[index]));
}

function omitBuffer({ buffer, ...value }) {
  return value;
}

function parseArgs(argv) {
  const result = {};
  const names = { "--executable": "executablePath", "--functions": "functionsPath", "--references": "referencesPath", "--seeds": "seedsPath" };
  for (let index = 0; index < argv.length; index += 1) {
    const key = names[argv[index]];
    if (!key || !argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    result[key] = argv[++index];
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(extractK01BeaconMinimapLifecycle(parseArgs(process.argv.slice(2))), null, 2)}\n`);
}
