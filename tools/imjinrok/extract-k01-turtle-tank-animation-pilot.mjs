#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import {
  EXPECTED_EXECUTABLE_SHA256,
  extractEntityTypeCatalog,
} from "./extract-entity-type-catalog.mjs";
import { extractOriginalSpriteTable } from "./extract-sprite-table.mjs";
import { extractUnitAnimationPilot } from "./extract-unit-animation-pilot.mjs";
import { readCString, readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_JUMP_TABLES_PATH = "analysis/generated/imjinrok2/jump-tables.json";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_SPRITE_PATH = "original/imjinrok2/char/ghosttankj.spr";
const DEFAULT_EXP1_SPRITE_PATH = "original/imjinrok2/fnt/exp1.spr";
const DEFAULT_EXP2_SPRITE_PATH = "original/imjinrok2/fnt/exp2.spr";

export const EXPECTED_TURTLE_TANK = {
  internalClass: 14,
  originalGameplayName: "일본 귀갑차",
  typeRecordAddress: "0x00884038",
  typeFlags: 0x80143205,
  sprite: {
    slot: 104,
    tableIndex: 4,
    pointerCell: "0x004bc234",
    sourcePath: "char\\ghosttankj.spr",
    sha256:
      "34c3fdb3bcd79bc95f907aa7c381c11a374b30c8f7dd45f89f0e762a139f04ec",
    width: 70,
    height: 60,
    frameCount: 88,
  },
};

export const TURTLE_TANK_GRID_PROFILES = [
  { facing: "s", direction: 1, deltaX: 0, deltaY: 1, configuredBaseIndex: 2, mirrorX: false },
  { facing: "sw", direction: 5, deltaX: -1, deltaY: 1, configuredBaseIndex: 4, mirrorX: false },
  { facing: "w", direction: 4, deltaX: -1, deltaY: 0, configuredBaseIndex: 6, mirrorX: false },
  { facing: "nw", direction: 20, deltaX: -1, deltaY: -1, configuredBaseIndex: 8, mirrorX: false },
  { facing: "n", direction: 16, deltaX: 0, deltaY: -1, configuredBaseIndex: 6, mirrorX: true },
  { facing: "ne", direction: 80, deltaX: 1, deltaY: -1, configuredBaseIndex: 4, mirrorX: true },
  { facing: "e", direction: 64, deltaX: 1, deltaY: 0, configuredBaseIndex: 2, mirrorX: true },
  { facing: "se", direction: 65, deltaX: 1, deltaY: 1, configuredBaseIndex: 0, mirrorX: false },
];

export const TURTLE_TANK_INTERMEDIATE_TURN_PROFILES = [
  { direction: 1000, configuredBaseIndex: 3, mirrorX: false },
  { direction: 1001, configuredBaseIndex: 5, mirrorX: false },
  { direction: 1002, configuredBaseIndex: 7, mirrorX: false },
  { direction: 1003, configuredBaseIndex: 7, mirrorX: true },
  { direction: 1004, configuredBaseIndex: 5, mirrorX: true },
  { direction: 1005, configuredBaseIndex: 3, mirrorX: true },
  { direction: 1006, configuredBaseIndex: 1, mirrorX: true },
  { direction: 1007, configuredBaseIndex: 1, mirrorX: false },
];
// Kept as a source-compatible export for older focused consumers.
export const TURTLE_TANK_OPAQUE_PROFILES = TURTLE_TANK_INTERMEDIATE_TURN_PROFILES;

const CLASS_INITIALIZER_FUNCTION = 0x004291d0;
const CLASS_SWITCH_ADDRESS = 0x004292b3;
const CLASS_DESTINATION = 0x0042bae1;
const ATTACK_FUNCTION = 0x0041e370;
const ATTACK_SWITCH_ADDRESS = 0x0041e385;
const ATTACK_DESTINATION = 0x0041e38c;
const MOVE_FUNCTION = 0x0041efa0;
const MOVE_GRID_SWITCH = 0x0041efe3;
const MOVE_OPAQUE_SWITCH = 0x0041f0c8;
const ATTACK_GRID_SWITCH = 0x0041e425;
const ATTACK_OPAQUE_SWITCH = 0x0041e513;
const IDLE_FUNCTION = 0x0041d870;
const IDLE_GRID_SWITCH = 0x0041d8a5;
const ACTION_DISPATCH_FUNCTION = 0x0043c9c0;
const ACTION_DISPATCH_SWITCH = 0x0043cda3;
const ACTION_7_DESTINATION = 0x0043ce6e;
const STATE_1_SPECIAL_MASK = 0x80000008;
const ALTERNATE_MOVEMENT_MASK = 0x04000000;
const IDLE_SPECIAL_MASK = 0x00000008;

const FUNCTION_CONTRACTS = [
  ["0x004291d0", ["0x004291d0-0x0042c547"], 4156, "1c05959938219ae4fa918ba3061b1856dcfb575f007a1a48281dd316709a7e96"],
  ["0x0041e370", ["0x0041e370-0x0041e3bd", "0x0041e3f0-0x0041e5db"], 115, "aa96086d04f698f4965205fa74803f0cc7d7db9a05ee610834a0ccffac293a61"],
  ["0x0041d870", ["0x0041d870-0x0041d976", "0x0041d9f0-0x0041dbdc"], 149, "725ef4a43130d35f9001bbd0b96ab9868b54ee4c000a49de36b96eccce7cdfc2"],
  ["0x0041d700", ["0x0041d700-0x0041d7f5"], 49, "4efa54b7c845a61fe9aae4a14f62d0d1d2bab44c2b3e26db4cb524003bbc1af3"],
  ["0x0041efa0", ["0x0041efa0-0x0041f272"], 140, "0dd6b72b3f73f96672d22ceac55b7565cb93e92e3bc38598fa25a7b55013a646"],
  ["0x00438e80", ["0x00438e80-0x00438e9e"], 6, "870ed439ab165b6aef1ba7c7406f30b089809a389d42ede44a4e00371fdf7d0f"],
  ["0x00438f20", ["0x00438f20-0x00438f4e"], 24, "3bc91bd78040f10b1dd0bbfd140e85f6bf284a0ae0b99172faa667b79bf4e49f"],
  ["0x00438fa0", ["0x00438fa0-0x00438fbe"], 6, "2da5a68ba80b3afe8bc617a8f8b0977da82dd62a0339d25fa7ea3b99eeaf04a6"],
  ["0x00438ff0", ["0x00438ff0-0x0043901e"], 24, "4bb786a729f1f05a50fd96f4f3b63e9a7359aa571a98ddc6336980dec88a3d1b"],
  ["0x00439110", ["0x00439110-0x0043913e"], 24, "67e1b441220f1c64d444eab72f46fe1eceefb70912f321bf79769337a5bfe925"],
  ["0x004381a0", ["0x004381a0-0x004381bd"], 6, "3374eae851c0b4f466dda2bdbc72047cd09e08da36fc0dd6fd41b1e905f1fed4"],
  ["0x004381c0", ["0x004381c0-0x00438300"], 84, "3bda3c12b28b9cd641aa3d8af3d133754554800f3212d45c778e538ea022be4d"],
  ["0x0043d450", ["0x0043d450-0x0043d472"], 10, "68070666ba954c3ee6d0b5fc857e6bdbb5fe86416ad724e22eb1986cc0724ced"],
  ["0x0045bd00", ["0x0045bd00-0x0045bef8"], 103, "6561fe98f630ac5f7f0765426c257c4bc3900aae6d2964afa649447cb5030e8a"],
  ["0x00437650", ["0x00437650-0x00438025"], 539, "4605056775f6f43c9b2065ea5a4ddff5570137eb87587f4a09d2018618e13c28"],
  ["0x00401000", ["0x00401000-0x00401037"], 13, "8e8430b40d9e5d090d58cf25a5a2ac7448f92067f079cfa44e5082e27aad8ffb"],
  ["0x00401040", ["0x00401040-0x0040136e"], 297, "b661208c820b3511cab26655ba2ef8ba976b29b2d52f02fd7f4250d45d3ca0ee"],
  ["0x00401390", ["0x00401390-0x00401428"], 38, "4255f9070783a65edcccf0eee0bb113b51e845ce6c0c16fa7615b721dc75d315"],
  ["0x00401430", ["0x00401430-0x0040143f"], 4, "789748ef1874b86fdd5ab7a92020c6b1be3de0c5be0f0a4e6993ea1b3853c0e5"],
  ["0x00401440", ["0x00401440-0x004014aa"], 35, "3f4f6e1fb58eb526b13dc2f958ce180f3007b9d4626bd2fff34c3c0df8ffc761"],
  ["0x00401710", ["0x00401710-0x00401a99"], 303, "bd56ffda69bcb5d6ccb9363312ae9c94f6618e6a695021f76d276777f81e2836"],
  ["0x00401aa0", ["0x00401aa0-0x00401abf"], 10, "12e5503e54d816a0b80d573ad2f3407b1faea0558344218c9fd21b8ac329fbc0"],
  ["0x00401b70", ["0x00401b70-0x00401bad"], 21, "e1dc7a4eeec8ddf3839bc5335e650266b0a343b9750e57ec852978e181332ae4"],
  ["0x00401bb0", ["0x00401bb0-0x00401bed"], 21, "356133a54a4668d3a1a784fdb3476df6e5baec62d5f99dd163edc396e18a6061"],
  ["0x004233f0", ["0x004233f0-0x0042373d"], 273, "0d7a09841ec0e8a288a93496102037c1d56ec5c9328ed12255c4ff2cb8d92115"],
  ["0x0043c9c0", ["0x0043c9c0-0x0043d35f"], 684, "eb1c7c21a9af5a2099a2d716ad1253db65fff75ef0befcae871e3462f4d3bcfa"],
  ["0x00443360", ["0x00443360-0x0044343c"], 75, "8fb6ff5d2ca2dd9428e6087a2b27fcb4d408d4dd7d8140b42e13b727575de018"],
  ["0x00447360", ["0x00447360-0x00447599"], 156, "8700298d4e2900a0f2833b1f9e1143c47d324478ef5fa419170e7945de7dd772"],
].map(([entry, bodyRanges, instructionCount, instructionSha256]) => ({
  entry,
  bodyRanges,
  instructionCount,
  instructionSha256,
}));

const EVIDENCE = [
  {
    id: "class-14-idle-initializer",
    va: 0x0042bae1,
    bytes:
      "6a 01 6a 10 6a 68 6a 00 8b ce c6 86 92 00 00 00 01 e8 89 d3 00 00 6a 01 6a 20 6a 68 6a 01 8b ce e8 7a d3 00 00 6a 01 6a 30 6a 68 6a 02 8b ce e8 6b d3 00 00 6a 01 6a 40 6a 68 6a 03 8b ce e8 5c d3 00 00 6a 01 6a 00 6a 68 6a 04 8b ce e8 4d d3 00 00",
    meaning: "state 8 writes phase 1, slot 104, and five bases 16,32,48,64,0",
  },
  {
    id: "class-14-movement-initializer",
    va: 0x0042bb33,
    bytes: "bb 08 00 00 00 8b ce 53 6a 00 6a 68 88 9e a6 00 00 00 e8 d6 d3 00 00",
    meaning: "state 1 writes phase 8, slot 104, start 0, stride 8 through the nine-base helper",
  },
  {
    id: "class-14-attack-initializer",
    va: 0x0042bb4a,
    bytes: "6a 01 6a 48 6a 68 8b ce 66 c7 86 44 01 00 00 01 00 e8 b0 d5 00 00",
    meaning: "state 4 writes phase 1, slot 104, start 72, stride 1 through the nine-base helper",
  },
  {
    id: "idle-normal-path-gate",
    va: 0x0041d870,
    bytes: "f6 41 74 08 74 05 e9 75 01 00 00 e9 00 00 00 00",
    meaning: "state 8 uses the normal consumer when flags bit 0x08 is clear",
  },
  {
    id: "movement-special-path-and-direction-field",
    va: 0x0041efa0,
    bytes:
      "f7 41 74 08 00 00 80 0f 84 d8 01 00 00 66 0f b6 81 a7 00 00 00 66 89 41 0a 0f bf 81 e8 01 00 00",
    meaning: "state 1 mask selects the special consumer, which reads direction WORD +0x1e8",
  },
  {
    id: "movement-raw-1000-direct-branch",
    va: 0x0041efc0,
    bytes: "3d e8 03 00 00 0f 8f ef 00 00 00 0f 84 cf 00 00 00",
    meaning: "the movement special consumer compares raw direction 1000 directly and branches to 0x0041f0a0",
  },
  {
    id: "movement-raw-1000-frame-base",
    va: 0x0041f0a0,
    bytes: "66 8b 81 b2 01 00 00 c6 81 b5 01 00 00 00 66 03 81 ae 00 00 00 66 89 41 0c c3",
    meaning: "raw direction 1000 selects movement base field +0xae (index 3) with mirror byte zero",
  },
  {
    id: "attack-class-14-special-wrapper",
    va: 0x0041e38c,
    bytes: "66 83 b9 44 01 00 00 00 75 05 e9 d5 f4 ff ff e9 50 00 00 00",
    meaning: "class 14 uses the special state-4 consumer when WORD +0x144 is nonzero",
  },
  {
    id: "attack-special-direction-field",
    va: 0x0041e3f0,
    bytes: "66 8b 81 46 01 00 00 66 89 41 0a 0f bf 81 e6 01 00 00",
    meaning: "the special attack consumer reads slot +0x146 and direction WORD +0x1e6",
  },
  {
    id: "attack-raw-1000-direct-branch",
    va: 0x0041e402,
    bytes: "3d e8 03 00 00 0f 8f f8 00 00 00 0f 84 d8 00 00 00",
    meaning: "the attack special consumer compares raw direction 1000 directly and branches to 0x0041e4eb",
  },
  {
    id: "attack-raw-1000-frame-base",
    va: 0x0041e4eb,
    bytes: "66 8b 81 b2 01 00 00 c6 81 b5 01 00 00 00 66 03 81 4e 01 00 00 66 89 41 0c c3",
    meaning: "raw direction 1000 selects attack base field +0x14e (index 3) with mirror byte zero",
  },
  {
    id: "direction-writer-updates-both-fields",
    va: 0x004381a0,
    bytes: "66 8b 44 24 04 66 89 81 e6 01 00 00 66 89 81 e8 01 00 00 b8 01 00 00 00 88 41 04 c2 04 00",
    meaning: "the normal direction writer stores the same WORD to +0x1e6 and +0x1e8",
  },
  {
    id: "state-8-producer",
    va: 0x0043c344,
    bytes: "66 8b 83 b2 01 00 00 89 8b 28 02 00 00 0f be 8b 92 00 00 00 66 40 c6 43 03 08",
    meaning: "the idle producer selects raw animation state 8",
  },
  {
    id: "state-4-producer",
    va: 0x00423837,
    bytes: "8a 57 6f 8a 4f 6e fe c2 c6 47 03 04",
    meaning: "the target-driven attack producer selects raw animation state 4",
  },
  { id: "turn-ring-full-table", va: 0x004381d1, bytes: "b8 01 00 00 00 66 3b f7 66 89 44 24 08 66 c7 44 24 0a e8 03 66 c7 44 24 0c 05 00 66 c7 44 24 0e e9 03 66 c7 44 24 10 04 00 66 c7 44 24 12 ea 03 66 c7 44 24 14 14 00 66 c7 44 24 16 eb 03 66 c7 44 24 18 10 00 66 c7 44 24 1a ec 03 66 c7 44 24 1c 50 00 66 c7 44 24 1e ed 03 66 c7 44 24 20 40 00 66 c7 44 24 22 ee 03 66 c7 44 24 24 41 00 66 c7 44 24 26 ef 03 75 0f", meaning: "all 16 WORD 16-ring entries are 1,1000,5,1001,4,1002,20,1003,16,1004,80,1005,64,1006,65,1007" },
  { id: "turn-equality-and-cadence", va: 0x00438247, bytes: "75 0f 5f c6 81 f1 01 00 00 00 5e 83 c4 20 c2 04 00 8a 51 70 fe c2 3a 51 71 88 51 70", meaning: "equality clears +0x1f1; otherwise BYTE +0x70 increments then compares +0x71" },
  { id: "turn-write-contract", va: 0x00438269, bytes: "55 c6 41 70 00 88 81 f1 01 00 00 33 d2", meaning: "cadence step resets +0x70 and sets +0x1f1" },
  { id: "turn-shortest-forward-and-backward-tie", va: 0x004382a4, bytes: "66 83 fe 08 5d 7d 15 42 81 e2 0f 00 00 80 79 05 4a 83 ca f0 42 66 8b 54 54 08 eb 18 8d 72 ff 83 fe ff 75 0b 66 c7 81 e8 01 00 00 ef 03 eb 0c 66 8b 54 54 06 66 89 91 e8 01 00 00", meaning: "forward distance <8 increments; distance >=8, including the opposite tie, decrements with wrap before writing +0x1e8" },
  { id: "turn-normal-copy-only", va: 0x004382df, bytes: "66 8b 91 e8 01 00 00 66 81 fa e8 03 7d 07 66 89 91 e6 01 00 00 88 41 04", meaning: "new +0x1e8 below 1000 copies to +0x1e6, then marks BYTE +0x04 dirty" },
  { id: "class14-type-writer-defaults", va: 0x0045c7e6, bytes: "6a 08 6a 00 68 05 32 14 80 56 6a 02 6a 03 6a 02 6a 02 6a 02", meaning: "class-14 type writer call supplies zero-based arg 35 value 2 for cadence and arg 39 value 8 for action flags" },
  { id: "type-writer-cadence-field-0x48", va: 0x0045be40, bytes: "66 8b 94 24 90 00 00 00 66 89 41 46 66 8b 84 24 94 00 00 00 66 89 51 48", meaning: "type writer stores DX loaded from zero-based arg 35 at [ESP+0x90] to type WORD +0x48" },
  { id: "type-writer-action-flags-field-0x54", va: 0x0045be6d, bytes: "8b 94 24 a0 00 00 00 89 41 50 8b 84 24 a4 00 00 00 89 51 54", meaning: "type writer stores zero-based arg 39 from [ESP+0xa0] to type DWORD +0x54" },
  { id: "entity-init-action-flags-copy", va: 0x00437bc0, bytes: "66 8b 0c 85 64 2e 88 00 33 c0 66 89 8e 84 00 00 00", meaning: "entity initializer copies class type action flags at +0x54 to runtime WORD +0x84" },
  { id: "entity-init-cadence-limit-copy", va: 0x00437e2a, bytes: "8a 88 56 2e 88 00 88 8e 21 01 00 00 8a 90 58 2e 88 00 88 56 71", meaning: "entity initializer copies type cadence byte at +0x48 to runtime BYTE +0x71" },
  { id: "destruction-effect-branch", va: 0x0042360d, bytes: "f6 c3 08 74 7a e8 89 e4 fd ff 8b c8 66 85 c9 74 62 a1 8c 5f 7c 00 bf fb ff 00 00", meaning: "action 6 bit 0x08 allocates before reading/updating PRNG" },
  { id: "destruction-effect-selection", va: 0x00423639, bytes: "f7 f7 f6 c2 01 89 15 8c 5f 7c 00 74 23", meaning: "PRNG remainder parity selects kind 2 or 4 and stores state only after allocation" },
  { id: "effect-pool-first-free", va: 0x00401aa0, bytes: "b8 01 00 00 00 b9 ca 25 84 00 66 83 39 00 74 0f 83 c1 02 40 81 f9 40 26 84 00 7c ee 66 33 c0", meaning: "effect pool scans indices 1..59; slot 0 is reserved" },
  { id: "effect-kind2-config", va: 0x00401056, bytes: "6a 01 6a 00 6a 00 6a 12 6a 00 6a 05 b9 e8 a1 4c 00 e8 94 ff ff ff", meaning: "effect config index 5 has base 0, phase count 18, repeat 0" },
  { id: "effect-kind4-config", va: 0x00401082, bytes: "6a 01 6a 00 6a 00 6a 03 6a 00 6a 06 b9 00 a2 4c 00 e8 68 ff ff ff", meaning: "effect config index 6 has base 0, phase count 3, repeat 0" },
  { id: "effect-kind2-materializer", va: 0x00401b70, bytes: "8b 4c 24 04 56 0f bf c1 8d 14 c5 00 00 00 00 2b d0 8b 44 24 14 50 8b 44 24 10 8d 34 d5 f0 70 94 00 8b 54 24 14 52 50 51 6a 02", meaning: "helper materializes effect kind 2" },
  { id: "effect-kind4-materializer", va: 0x00401bb0, bytes: "8b 4c 24 04 56 0f bf c1 8d 14 c5 00 00 00 00 2b d0 8b 44 24 14 50 8b 44 24 10 8d 34 d5 f0 70 94 00 8b 54 24 14 52 50 51 6a 04", meaning: "helper materializes effect kind 4" },
  { id: "effect-update-tick", va: 0x00401440, bytes: "56 8b f1 0f bf 46 0e 48 75 48 66 83 7e 34 01 75 05 66 83 46 2c fe 8b 4e 10 66 c7 46 04 06 00 a1 80 5f 7c 00 2b c8 83 f9 02 72 07 66 ff 46 06 89 46 10", meaning: "effect phase advances iff unsigned lastTick-currentTick is at least 2" },
  { id: "state7-renderer-fields", va: 0x004236a4, bytes: "66 8b 8e 8c 01 00 00 33 c0 66 3b c8 c6 46 6f 00 c6 46 03 07", meaning: "standard state-7 branch reads WORD +0x18c" },
  { id: "state7-renderer-table-fields", va: 0x0041d700, bytes: "66 8b 81 92 01 00 00 66 89 41 0a 0f bf 81 e6 01 00 00 48 83 f8 4f 0f 87 ce 00 00 00", meaning: "canonical state-7 renderer reads slot WORD +0x192" },
  { id: "state7-renderer-base-fields", va: 0x0041d72b, bytes: "66 8b 81 b2 01 00 00 c6 81 b5 01 00 00 00 66 03 81 94 01 00 00 66 89 41 0c c3", meaning: "state-7 renderer reads frame base +0x194; sibling branches read +0x196..+0x19c" },
  { id: "class14-ancillary-helper", va: 0x00438fa0, bytes: "8a 44 24 08 0f bf 54 24 04 88 81 d1 00 00 00 66 8b 44 24 0c 66 89 84 51 d2 00 00 00 c2 10 00", meaning: "class-14 ancillary helper writes +0xd1/+0xd2, not state-7 fields" },
  { id: "action6-next-action7", va: 0x0043ce03, bytes: "e8 e8 65 fe ff 83 f8 01 0f 85 ba 04 00 00 8a 86 84 00 00 00 24 19 f6 d8 1b c0 24 f1 83 c0 16 66 89 86 b0 01 00 00", meaning: "action 6 return 1 dispatches to action 7 when +0x84&0x19 is nonzero" },
  { id: "action7-release-return-zero", va: 0x0043ce6e, bytes: "8b ce e8 cb 68 fe ff 66 8b 86 7a 04 00 00 66 3b c5 74 1e", meaning: "action 7 calls its helper before the retain gate" },
  { id: "action7-default-release-gate", va: 0x0043ce9f, bytes: "f6 46 74 80 0f 84 6c 04 00 00", meaning: "action 7 with +0x74 bit 0x80 clear jumps to return-0" },
  { id: "action7-return-zero", va: 0x0043d315, bytes: "5f 5e 5d 33 c0 5b 81 c4 80 00 00 00 c3", meaning: "action dispatcher returns zero" },
  { id: "active-list-release", va: 0x00447499, bytes: "e8 22 55 ff ff 85 c0 75 0c 66 8b 16 52 e8 f5 c5 03 00", meaning: "active list calls dispatcher and releases slot when return is zero" },
];

const GRID_DESTINATIONS = {
  idle: new Map([[1, 0x0041d8ac], [5, 0x0041d8c6], [4, 0x0041d8cf], [20, 0x0041d8e9], [16, 0x0041d903], [80, 0x0041d91d], [64, 0x0041d937], [65, 0x0041d951]]),
  move: new Map([[1, 0x0041efea], [5, 0x0041f004], [4, 0x0041f01e], [20, 0x0041f038], [16, 0x0041f052], [80, 0x0041f06c], [64, 0x0041f219], [65, 0x0041f086]]),
  attack: new Map([[1, 0x0041e42c], [5, 0x0041e446], [4, 0x0041e44f], [20, 0x0041e469], [16, 0x0041e483], [80, 0x0041e49d], [64, 0x0041e4b7], [65, 0x0041e4d1]]),
};
const OPAQUE_DESTINATIONS = {
  move: new Map([[1001, 0x0041f0e9], [1002, 0x0041f11d], [1003, 0x0041f137], [1004, 0x0041f103], [1005, 0x0041f0cf], [1006, 0x0041f16b], [1007, 0x0041f151]]),
  attack: new Map([[1001, 0x0041e534], [1002, 0x0041e568], [1003, 0x0041e582], [1004, 0x0041e54e], [1005, 0x0041e51a], [1006, 0x0041e5b6], [1007, 0x0041e59c]]),
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(extractK01TurtleTankAnimationPilot(parseArgs(process.argv.slice(2))), null, 2));
}

export function extractK01TurtleTankAnimationPilot({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  jumpTablesPath = DEFAULT_JUMP_TABLES_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  spritePath = DEFAULT_SPRITE_PATH,
  exp1SpritePath = DEFAULT_EXP1_SPRITE_PATH,
  exp2SpritePath = DEFAULT_EXP2_SPRITE_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const functions = readArtifact(functionsPath, executableSha256, "functions");
  const functionEvidence = FUNCTION_CONTRACTS.map((contract) =>
    validateFunction(functions.functions, contract),
  );
  const jumpTables = readArtifact(jumpTablesPath, executableSha256, "jump tables");
  validateCase(jumpTables, CLASS_INITIALIZER_FUNCTION, CLASS_SWITCH_ADDRESS, 14, CLASS_DESTINATION, "class 14 initializer");
  validateCase(jumpTables, ATTACK_FUNCTION, ATTACK_SWITCH_ADDRESS, 14, ATTACK_DESTINATION, "class 14 attack wrapper");
  validateCase(jumpTables, ACTION_DISPATCH_FUNCTION, ACTION_DISPATCH_SWITCH, 7, ACTION_7_DESTINATION, "action 7 dispatcher");
  validateDirectionSwitches(jumpTables);
  const seeds = readArtifact(seedsPath, executableSha256, "seeds");

  const commonPilot = extractUnitAnimationPilot({
    executablePath,
    jumpTablesPath,
    seedsPath,
  });
  validateCommonGridDirections(commonPilot);

  const catalog = extractEntityTypeCatalog({ executablePath, seedsPath });
  const type = catalog.types.find(({ internalClass }) => internalClass === 14);
  if (!type) throw new Error("entity catalog is missing class 14");
  validateType(type);
  const sprite = inspectSprite(executablePath, spritePath);
  const destruction = inspectDestructionEvidence({ buffer, image, exp1SpritePath, exp2SpritePath });
  const initializerWriteScan = scanClass14InitializerWrites(seeds);
  validateClass14InitializerScan(initializerWriteScan);
  const evidencePoints = EVIDENCE.map((point) => readEvidencePoint(buffer, image, point));
  requireAllEvidence(evidencePoints);

  const states = {
    idle: buildState("idle", 8, 1, 0, 8, false),
    move: buildState("move", 1, 8, 0, 8, true),
    attack: buildState("attack", 4, 1, 72, 1, true),
  };
  const flags = EXPECTED_TURTLE_TANK.typeFlags >>> 0;
  return {
    schemaVersion: 2,
    question:
      "원본 내부 class 14 일본 귀갑차의 core frame, intermediate 16-ring turn, creation-default action-6 transient destruction/release contract는 무엇인가?",
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "theme-level-mapping",
    sources: {
      executable: { path: executablePath, sha256: executableSha256 },
      functions: { path: functionsPath, sourceSha256: functions.sourceSha256 },
      jumpTables: { path: jumpTablesPath, sourceSha256: jumpTables.sourceSha256 },
      seeds: { path: seedsPath, sourceSha256: seeds.sourceSha256 },
      sprite,
      destruction: destruction.resources,
    },
    identity: {
      internalClass: type.internalClass,
      originalGameplayName: type.originalGameplayName,
      typeRecordAddress: type.definition.recordAddress,
      typeFlags: type.definition.flags,
      spriteSlot: type.sprite.slot,
      sourcePath: type.sprite.sourcePath,
    },
    classDispatch: { functionEntry: toHex(CLASS_INITIALIZER_FUNCTION), switchAddress: toHex(CLASS_SWITCH_ADDRESS), class: 14, destination: toHex(CLASS_DESTINATION), scopedBlock: "0x0042bae1-0x0042bb8c" },
    attackDispatch: { wrapperFunction: toHex(ATTACK_FUNCTION), switchAddress: toHex(ATTACK_SWITCH_ADDRESS), class: 14, destination: toHex(ATTACK_DESTINATION), specialConsumer: "0x0041e3f0", requiredPhaseCountCondition: "WORD [entity+0x144] != 0", flagsGate: "none" },
    initialTypeFlags: {
      value: toHex(flags),
      state1SpecialMaskValue: toHex((flags & STATE_1_SPECIAL_MASK) >>> 0),
      alternateMovementEligibilityMaskValue: toHex(flags & ALTERNATE_MOVEMENT_MASK),
      idleSpecialMaskValue: toHex(flags & IDLE_SPECIAL_MASK),
      creationDefaultPaths: { idle: "normal +0x1e6", move: "special +0x1e8", attack: "special +0x1e6" },
      laterRuntimeMutation: "unresolved",
    },
    recoveredStateSemantics: {
      idle: { producer: "0x0043c344", wrapper: "0x0041d870", consumer: "0x0041d880" },
      move: { producer: "0x00425b20", consumer: "0x0041efa0", directionField: "+0x1e8" },
      attack: { producer: "0x00423837", wrapper: "0x0041e370", consumer: "0x0041e3f0", directionField: "+0x1e6" },
    },
    states,
    intermediateTurnDirections: {
      humanMeaning: "intermediate 16-ring turn direction; generic Facing mapping unresolved",
      acceptedByStates: ["move", "attack"],
      profiles: TURTLE_TANK_INTERMEDIATE_TURN_PROFILES,
    },
    functionEvidence,
    evidencePoints,
    turnContract: {
      ring: [1, 1000, 5, 1001, 4, 1002, 20, 1003, 16, 1004, 80, 1005, 64, 1006, 65, 1007],
      cadenceDefault: 2,
      fieldContract: { normalDirection: "+0x1e6 WORD", extendedDirection: "+0x1e8 WORD", cadence: "+0x70 BYTE/+0x71 BYTE", turnPending: "+0x1f1 BYTE", dirty: "+0x04 BYTE" },
    },
    destruction,
    initializerWriteScan,
    acceptedInputScope:
      "creation-default class-14 state frames, all eight grid directions, intermediate 16-ring turn directions, action-6 bit-0x08 transient destruction, and effect phases within each recovered count",
    unresolvedScope:
      "generic Facing mapping for intermediate 16-ring turn directions, frames 81..87 outside the refuted creation-default death path, exact seconds per phase, original update-to-24-Hz mapping, pivot, hit reaction, later flag mutation, and project-side transient destruction/tick mapping",
  };
}

export function replayTurtleTankTurn({
  currentDirection,
  targetDirection,
  normalDirection,
  cadenceCounter,
  cadenceLimit,
  turnPending = 0,
  dirty = 0,
}) {
  validateUnsignedWord(currentDirection, "currentDirection");
  validateUnsignedWord(targetDirection, "targetDirection");
  validateUnsignedWord(normalDirection, "normalDirection");
  validateUnsignedByte(cadenceCounter, "cadenceCounter");
  validateUnsignedByte(cadenceLimit, "cadenceLimit");
  validateUnsignedByte(turnPending, "turnPending");
  validateUnsignedByte(dirty, "dirty");
  const ring = [1, 1000, 5, 1001, 4, 1002, 20, 1003, 16, 1004, 80, 1005, 64, 1006, 65, 1007];
  const currentIndex = ring.indexOf(currentDirection);
  const targetIndex = ring.indexOf(targetDirection);
  if (currentIndex < 0 || targetIndex < 0) {
    throw new RangeError("currentDirection and targetDirection must be recovered 16-ring WORD values");
  }
  if (currentDirection === targetDirection) {
    return { returned: 1, currentDirection, normalDirection, cadenceCounter, cadenceLimit, turnPending: 0, dirty, stepped: false };
  }
  const incremented = (cadenceCounter + 1) & 0xff;
  if (incremented < cadenceLimit) {
    return { returned: 0, currentDirection, normalDirection, cadenceCounter: incremented, cadenceLimit, turnPending, dirty, stepped: false };
  }
  const forwardDistance = (targetIndex - currentIndex + ring.length) % ring.length;
  const nextIndex = forwardDistance < 8 ? (currentIndex + 1) % ring.length : (currentIndex + ring.length - 1) % ring.length;
  const nextDirection = ring[nextIndex];
  return { returned: 0, currentDirection: nextDirection, normalDirection: nextDirection < 1000 ? nextDirection : normalDirection, cadenceCounter: 0, cadenceLimit, turnPending: 1, dirty: 1, stepped: true, forwardDistance };
}

export function replayTurtleTankDestruction({
  flags,
  effectPool,
  prngState,
  x,
  y,
  ownerByte,
  runtimeFlags = 0x05,
}) {
  validateUnsignedWord(flags, "flags");
  validateUnsignedDword(prngState, "prngState");
  validateSignedWord(x, "x");
  validateSignedWord(y, "y");
  validateUnsignedByte(ownerByte, "ownerByte");
  validateUnsignedDword(runtimeFlags, "runtimeFlags");
  if (!Array.isArray(effectPool) || effectPool.length !== 60 || effectPool.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffff)) {
    throw new RangeError("effectPool must contain exactly 60 unsigned WORD active values");
  }
  if ((flags & 0x02) !== 0 || (flags & 0x01) !== 0 || (flags & 0x08) === 0) {
    throw new RangeError("flags must select the recovered action-6 bit-0x08 branch");
  }
  const slot = effectPool.slice(1).findIndex((value) => value === 0);
  const nextAction = (flags & 0x10) !== 0 || (flags & 0x08) !== 0 ? 7 : null;
  const releasesOnNextAcceptedUpdate = nextAction === 7 && (runtimeFlags & 0x80) === 0;
  if (slot < 0) {
    return { returned: 1, effect: null, prngState, nextAction, releasesOnNextAcceptedUpdate };
  }
  const nextPrngState = (Math.imul(prngState, 0xff83) >>> 0) % 0xfffb;
  const kind = (nextPrngState & 1) === 1 ? 2 : 4;
  return {
    returned: 1,
    prngState: nextPrngState,
    effect: {
      slot: slot + 1,
      kind,
      x,
      y,
      ownerByte,
      resourceSlot: kind === 2 ? 5 : 6,
      baseFrame: 0,
      phaseCount: kind === 2 ? 18 : 3,
      repeatCounter: 0,
      repeatLimit: 0,
    },
    nextAction,
    releasesOnNextAcceptedUpdate,
  };
}

export function selectTransientEffectFrame({ kind, phase, phaseCount }) {
  if (![2, 4].includes(kind)) throw new RangeError("kind must be 2 or 4");
  validateUnsignedWord(phase, "phase");
  validateUnsignedWord(phaseCount, "phaseCount");
  const expectedPhaseCount = kind === 2 ? 18 : 3;
  if (phaseCount !== expectedPhaseCount || phase >= phaseCount) throw new RangeError("phaseCount/phase is outside the recovered effect configuration");
  return { kind, phase, phaseCount, frameIndex: phase };
}

export function replayTransientEffectUpdate({
  kind,
  phase,
  phaseCount,
  repeatCounter = 0,
  repeatLimit = 0,
  lastTick,
  currentTick,
}) {
  selectTransientEffectFrame({ kind, phase, phaseCount });
  validateUnsignedWord(repeatCounter, "repeatCounter");
  validateUnsignedWord(repeatLimit, "repeatLimit");
  validateUnsignedDword(lastTick, "lastTick");
  validateUnsignedDword(currentTick, "currentTick");
  const elapsed = (lastTick - currentTick) >>> 0;
  if (elapsed < 2) {
    return { returned: 1, phase, frameIndex: phase, phaseCount, repeatCounter, repeatLimit, lastTick, currentTick, advanced: false };
  }
  const nextPhase = phase + 1;
  if (nextPhase !== phaseCount) {
    return { returned: 1, phase: nextPhase, frameIndex: nextPhase, phaseCount, repeatCounter, repeatLimit, lastTick: currentTick, currentTick, advanced: true };
  }
  if (repeatCounter < repeatLimit) {
    return { returned: 1, phase: 0, frameIndex: 0, phaseCount, repeatCounter: repeatCounter + 1, repeatLimit, lastTick: currentTick, currentTick, advanced: true };
  }
  return { returned: 0, phase: nextPhase, frameIndex: null, phaseCount, repeatCounter, repeatLimit, lastTick: currentTick, currentTick, advanced: true };
}

export function selectTurtleTankFrame({
  state,
  direction,
  phase,
  entityFlags = EXPECTED_TURTLE_TANK.typeFlags,
  attackPhaseCount = 1,
}) {
  validateUnsignedDword(entityFlags, "entityFlags");
  validateUnsignedWord(attackPhaseCount, "attackPhaseCount");
  validateSignedWord(direction, "direction");
  const stateName = new Map([[8, "idle"], [1, "move"], [4, "attack"]]).get(state);
  if (!stateName) throw new RangeError(`state ${state} is outside the scoped set 1,4,8`);
  const phaseCount = stateName === "move" ? 8 : 1;
  if (!Number.isInteger(phase) || phase < 0 || phase >= phaseCount) {
    throw new RangeError(`phase ${phase} is outside 0..${phaseCount - 1} for ${stateName}`);
  }
  validateReplayGates(stateName, entityFlags >>> 0, attackPhaseCount);
  const grid = TURTLE_TANK_GRID_PROFILES.find((profile) => profile.direction === direction);
  const intermediate = TURTLE_TANK_INTERMEDIATE_TURN_PROFILES.find((profile) => profile.direction === direction);
  if (!grid && !(intermediate && stateName !== "idle")) {
    throw new RangeError(`direction ${direction} is outside the recovered ${stateName} set`);
  }
  const profile = grid ?? intermediate;
  const frameIndex =
    stateName === "attack"
      ? 72 + profile.configuredBaseIndex
      : profile.configuredBaseIndex * 8 + phase;
  if (frameIndex >= EXPECTED_TURTLE_TANK.sprite.frameCount) {
    throw new RangeError(`frame ${frameIndex} exceeds 87`);
  }
  return {
    state,
    stateName,
    direction,
    ...(grid ? { facing: grid.facing } : { facing: null, directionMeaning: "intermediate-turn" }),
    phase,
    spriteSlot: 104,
    sourcePath: EXPECTED_TURTLE_TANK.sprite.sourcePath,
    frameIndex,
    mirrorX: profile.mirrorX,
  };
}

function buildState(name, originalAnimationState, phaseCount, frameStart, stride, acceptsOpaque) {
  const directions = TURTLE_TANK_GRID_PROFILES.map((profile) => {
    const frameBase = frameStart + profile.configuredBaseIndex * stride;
    return { ...profile, frameBase, phaseRange: [0, phaseCount - 1], frameRange: [frameBase, frameBase + phaseCount - 1] };
  });
  return {
    originalAnimationState,
    spriteSlot: 104,
    sourcePath: EXPECTED_TURTLE_TANK.sprite.sourcePath,
    phaseCount,
    frameStart,
    frameStride: stride,
    acceptsOpaqueRawDirections: acceptsOpaque,
    configuredBases: name === "idle" ? [16, 32, 48, 64, 0] : Array.from({ length: 9 }, (_, index) => frameStart + index * stride),
    frameRange: [Math.min(...directions.map(({ frameRange }) => frameRange[0])), Math.max(...directions.map(({ frameRange }) => frameRange[1]))],
    directions,
  };
}

function validateReplayGates(state, flags, attackPhaseCount) {
  if (state === "idle" && (flags & IDLE_SPECIAL_MASK) !== 0) {
    throw new Error("state 8 normal consumer requires flags bit 0x08 clear");
  }
  if (state === "move") {
    if (((flags & STATE_1_SPECIAL_MASK) >>> 0) !== 0x80000000) {
      throw new Error("class 14 state 1 creation-default special path requires mask value 0x80000000");
    }
    if ((flags & ALTERNATE_MOVEMENT_MASK) !== 0) {
      throw new Error("class 14 state 1 creation-default path requires alternate movement mask clear");
    }
  }
  if (state === "attack" && attackPhaseCount === 0) {
    throw new Error("class 14 attack wrapper requires WORD +0x144 nonzero");
  }
}

function validateCommonGridDirections(pilot) {
  const state = pilot.states.find(({ state }) => state === 1);
  if (!state) throw new Error("shared direction pilot is missing state 1");
  const actual = state.directions
    .map(({ direction, deltaX, deltaY, mirrorX }) => ({ direction, deltaX, deltaY, mirrorX }))
    .sort((a, b) => a.direction - b.direction);
  const expected = TURTLE_TANK_GRID_PROFILES
    .map(({ direction, deltaX, deltaY, mirrorX }) => ({ direction, deltaX, deltaY, mirrorX }))
    .sort((a, b) => a.direction - b.direction);
  assertDeepEqual(actual, expected, "shared grid direction profile");
}

function validateDirectionSwitches(artifact) {
  for (const [state, functionEntry, gridSwitch, intermediateSwitch] of [
    ["idle", IDLE_FUNCTION, IDLE_GRID_SWITCH, undefined],
    ["move", MOVE_FUNCTION, MOVE_GRID_SWITCH, MOVE_OPAQUE_SWITCH],
    ["attack", ATTACK_FUNCTION, ATTACK_GRID_SWITCH, ATTACK_OPAQUE_SWITCH],
  ]) {
    const grid = requireSwitch(artifact, functionEntry, gridSwitch);
    for (const [label, destination] of GRID_DESTINATIONS[state]) {
      assertEqual(requireCase(grid, label).destination, toHex(destination), `${state} raw direction ${label}`);
    }
    if (intermediateSwitch !== undefined) {
      const intermediate = requireSwitch(artifact, functionEntry, intermediateSwitch);
      for (const [label, destination] of OPAQUE_DESTINATIONS[state]) {
        assertEqual(requireCase(intermediate, label).destination, toHex(destination), `${state} intermediate turn direction ${label}`);
      }
    }
  }
}

function validateType(type) {
  assertEqual(type.originalGameplayName, EXPECTED_TURTLE_TANK.originalGameplayName, "class 14 name");
  assertEqual(type.definition.recordAddress, EXPECTED_TURTLE_TANK.typeRecordAddress, "class 14 record");
  assertEqual(type.definition.flags, toHex(EXPECTED_TURTLE_TANK.typeFlags), "class 14 flags");
  assertEqual(type.sprite.slot, 104, "class 14 sprite slot");
  assertEqual(type.sprite.pointerCell, EXPECTED_TURTLE_TANK.sprite.pointerCell, "class 14 pointer cell");
  assertEqual(type.sprite.sourcePath, EXPECTED_TURTLE_TANK.sprite.sourcePath, "class 14 source");
}

function inspectSprite(executablePath, spritePath) {
  const table = extractOriginalSpriteTable(executablePath).entries[EXPECTED_TURTLE_TANK.sprite.tableIndex];
  if (!table) throw new Error("sprite table is missing index 4");
  assertEqual(table.tableVa, EXPECTED_TURTLE_TANK.sprite.pointerCell, "sprite pointer cell");
  assertEqual(table.sourcePath, EXPECTED_TURTLE_TANK.sprite.sourcePath, "sprite table source");
  const buffer = readFileSync(spritePath);
  const digest = sha256(buffer);
  assertEqual(digest, EXPECTED_TURTLE_TANK.sprite.sha256, `${spritePath} SHA-256`);
  const header = parseSpriteLikeHeader(buffer, spritePath);
  for (const key of ["width", "height", "frameCount"]) {
    assertEqual(header[key], EXPECTED_TURTLE_TANK.sprite[key], `${spritePath} ${key}`);
  }
  return {
    path: spritePath,
    sha256: digest,
    width: header.width,
    height: header.height,
    frameCount: header.frameCount,
    slot: 104,
    tableIndex: 4,
    pointerCell: table.tableVa,
    sourcePath: table.sourcePath,
  };
}

function inspectDestructionEvidence({ buffer, image, exp1SpritePath, exp2SpritePath }) {
  const resources = [
    { kind: 2, slot: 5, pointerCell: 0x004bc0a8, pointer: 0x004bd900, sourcePath: "fnt\\exp1.spr", path: exp1SpritePath, sha256: "51eecc60551b018ffd2729b7d30c69104d8231c89542a833bd0fc9906a613918", width: 100, height: 100, frameCount: 36, frameRange: [0, 17] },
    { kind: 4, slot: 6, pointerCell: 0x004bc0ac, pointer: 0x004bd8f0, sourcePath: "fnt\\exp2.spr", path: exp2SpritePath, sha256: "6442030d5fd4a2cd74ee10438ed9cf0a88760e6bbb7b80303f1858acbb248957", width: 32, height: 32, frameCount: 300, frameRange: [0, 2] },
  ].map((resource) => {
    const cellOffset = image.vaToRawOffset(resource.pointerCell);
    const pointer = cellOffset === undefined ? undefined : buffer.readUInt32LE(cellOffset);
    assertEqual(pointer, resource.pointer, `${toHex(resource.pointerCell)} pointer`);
    const stringOffset = image.vaToRawOffset(pointer);
    assertEqual(readCString(buffer, stringOffset), resource.sourcePath, `${toHex(resource.pointer)} source path`);
    const bytes = readFileSync(resource.path);
    assertEqual(sha256(bytes), resource.sha256, `${resource.path} SHA-256`);
    const header = parseSpriteLikeHeader(bytes, resource.path);
    for (const key of ["width", "height", "frameCount"]) assertEqual(header[key], resource[key], `${resource.path} ${key}`);
    return { ...resource, pointerCell: toHex(resource.pointerCell), pointer: toHex(resource.pointer) };
  });
  return {
    creationDefaults: {
      cadence: { typeWriterArgument: 35, value: 2, typeField: "+0x48 WORD", runtimeField: "+0x71 BYTE" },
      actionFlags: { typeWriterArgument: 39, value: 8, typeField: "+0x54 DWORD", runtimeField: "+0x84 WORD" },
    },
    action: { action: 6, flagsMask: "0x0008", returns: 1, fullPool: "completes without effect or PRNG write", dispatcherNextAction: 7, releaseGate: "next accepted update: BYTE +0x74 low byte 0x05 lacks 0x80" },
    pool: { recordCount: 60, reservedSlot: 0, allocationRange: [1, 59], firstFree: true },
    prng: { formula: "((Math.imul(state, 0xff83) >>> 0) % 0xfffb)", global: "0x007c5f8c", oddKind: 2, evenKind: 4 },
    effectUpdate: { tickRule: "unsigned (lastTick-currentTick) mod 2^32 >= 2", noSecondsOrFpsConversion: true, terminalOnPhaseEqualsCountWhenRepeatCounterEqualsLimit: true },
    resources,
  };
}

function scanClass14InitializerWrites(seeds) {
  const start = 0x0042bae1;
  const endExclusive = 0x0042bb8d;
  const initializer = seeds.functions?.find(({ entry }) => entry === "0x004291d0");
  if (!initializer?.instructions) throw new Error("seeds artifact is missing canonical instructions for 0x004291d0");
  const instructions = initializer.instructions.filter(({ address }) => {
    const value = Number.parseInt(address, 16);
    return value >= start && value < endExclusive;
  });
  const directWrites = instructions.flatMap((instruction) => {
    const match = /^([A-Z]+) (?:(byte|word|dword) ptr )?\[ESI \+ 0x([0-9a-f]+)\](?:,|$)/.exec(instruction.text);
    if (!match) return [];
    return [{ va: instruction.address, operation: match[1], field: `+0x${match[3]}`, width: match[2] ?? "unspecified", text: instruction.text }];
  });
  const helperCalls = instructions.flatMap((instruction) => {
    const match = /^CALL (0x[0-9a-f]+)$/.exec(instruction.text);
    return match ? [{ va: instruction.address, target: match[1] }] : [];
  });
  return {
    provenance: { functionEntry: initializer.entry, sourceSha256: seeds.sourceSha256 },
    range: `${toHex(start)}-${toHex(endExclusive - 1)}`,
    rangeConvention: "inclusive",
    directWrites,
    helperCalls,
    state7Fields: ["+0x18c", "+0x192", "+0x194", "+0x196", "+0x198", "+0x19a", "+0x19c"],
    state7FieldWrites: directWrites.filter(({ field }) => ["+0x18c", "+0x192", "+0x194", "+0x196", "+0x198", "+0x19a", "+0x19c"].includes(field)),
  };
}

function validateClass14InitializerScan(scan) {
  assertDeepEqual(
    scan.directWrites.map(({ operation, field, width }) => ({ operation, field, width })),
    [
      { operation: "MOV", field: "+0x92", width: "byte" },
      { operation: "MOV", field: "+0xa6", width: "byte" },
      { operation: "MOV", field: "+0x144", width: "word" },
      { operation: "MOV", field: "+0xd0", width: "byte" },
      { operation: "MOV", field: "+0xec", width: "byte" },
    ],
    "class 14 initializer direct writes",
  );
  assertDeepEqual(
    scan.helperCalls.map(({ target }) => target),
    ["0x00438e80", "0x00438e80", "0x00438e80", "0x00438e80", "0x00438e80", "0x00438f20", "0x00439110", "0x00438ff0", "0x00438ff0"],
    "class 14 initializer helper calls",
  );
  assertDeepEqual(scan.state7FieldWrites, [], "class 14 initializer state-7 field writes");
}

function readArtifact(path, sourceSha256, label) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  assertEqual(artifact.sourceSha256, sourceSha256, `${label} source SHA-256`);
  return artifact;
}

function validateFunction(functions, contract) {
  const record = functions.find(({ entry }) => entry === contract.entry);
  if (!record) throw new Error(`functions artifact is missing ${contract.entry}`);
  assertDeepEqual(record.bodyRanges, contract.bodyRanges, `${contract.entry} body ranges`);
  assertEqual(record.instructionCount, contract.instructionCount, `${contract.entry} instruction count`);
  assertEqual(record.instructionSha256, contract.instructionSha256, `${contract.entry} instruction SHA-256`);
  return { entry: record.entry, bodyRanges: record.bodyRanges, instructionCount: record.instructionCount, instructionSha256: record.instructionSha256 };
}

function validateCase(artifact, functionEntry, switchAddress, label, destination, name) {
  const table = requireSwitch(artifact, functionEntry, switchAddress);
  assertEqual(requireCase(table, label).destination, toHex(destination), `${name} destination`);
}

function requireSwitch(artifact, functionEntry, switchAddress) {
  const table = Object.values(artifact.tables ?? {}).find(
    (candidate) => candidate.functionEntry === toHex(functionEntry) && candidate.switchAddress === toHex(switchAddress),
  );
  if (!table) throw new Error(`missing switch ${toHex(switchAddress)} in ${toHex(functionEntry)}`);
  return table;
}

function requireCase(table, label) {
  const entry = table.cases.find((candidate) => candidate.label === label);
  if (!entry) throw new Error(`switch ${table.switchAddress} is missing case ${label}`);
  return entry;
}

function readEvidencePoint(buffer, image, evidence) {
  const offset = image.vaToRawOffset(evidence.va);
  const expected = Buffer.from(evidence.bytes.replaceAll(" ", ""), "hex");
  const actual = offset === undefined ? Buffer.alloc(0) : buffer.subarray(offset, offset + expected.length);
  return { ...evidence, va: toHex(evidence.va), expectedBytes: formatBytes(expected), actualBytes: formatBytes(actual), matched: Buffer.compare(expected, actual) === 0 };
}

function requireAllEvidence(points) {
  const mismatch = points.find(({ matched }) => !matched);
  if (mismatch) throw new Error(`static evidence mismatch at ${mismatch.va} (${mismatch.id}): expected ${mismatch.expectedBytes}, got ${mismatch.actualBytes}`);
}

function validateUnsignedDword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be an unsigned DWORD`);
}
function validateUnsignedWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must be an unsigned WORD`);
}
function validateUnsignedByte(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError(`${label} must be an unsigned BYTE`);
}
function validateSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError(`${label} must be a signed WORD`);
}
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}
function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
function parseArgs(argv) {
  const result = {};
  const options = new Map([["--input", "executablePath"], ["--functions", "functionsPath"], ["--jump-tables", "jumpTablesPath"], ["--seeds", "seedsPath"], ["--sprite", "spritePath"], ["--exp1-sprite", "exp1SpritePath"], ["--exp2-sprite", "exp2SpritePath"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") continue;
    const key = options.get(argument);
    if (!key) throw new Error(`unknown argument: ${argument}`);
    if (!argv[index + 1]) throw new Error(`${argument} requires a path`);
    result[key] = argv[++index];
  }
  return result;
}
