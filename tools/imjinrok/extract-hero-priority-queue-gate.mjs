#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SEEDS_PATH = "analysis/generated/imjinrok2/seeds.json";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_SEEDS_SHA256 =
  "325cef518b8ad459d2d1ddfefd3cb5dc960dba060e75a291736049d569b4a329";
export const EXPECTED_FUNCTIONS_SHA256 =
  "c10ea2de1f4998411d52443419c9a7f52ff7f9c18e79bd4115ba197d2f5bebc3";
export const EXPECTED_REFERENCES_SHA256 =
  "df11ff3713988ef22b3390b5b0ae7b4a87464b5de547a4866e1c8ec8a0bcaf4c";

const QUESTION =
  "FUN_0043c300의 player-scoped production-filter queue gate는 어떤 입력·HUD control·writer·reset 경로를 가지며, FUN_00428580/FUN_0047fe10이 우선 추출하는 action/type 집합은 사용자가 기억한 unit-production queue의 global hero-priority toggle과 정확히 일치하는가?";

const ACTION_TABLE_ADDRESS = 0x00947e10;
const ACTION_RECORD_STRIDE = 20;
const ACTION_CONSTRUCTOR = 0x004767a0;
const ACTION_INITIALIZER = 0x00476820;
const ACTION_DEFINITION_COUNT = 229;
const MAX_ACTION_ID = 303;
const TYPE_TABLE_ADDRESS = 0x00882e10;
const TYPE_RECORD_STRIDE = 0x014c;
const TYPE_WRITER = 0x0045bd00;
const TYPE_INITIALIZER = 0x0045bf50;
const TYPE_COUNT = 95;
const TYPE_ARGUMENT_COUNT = 51;
const TYPE_FIELD_0X20_ARGUMENT_INDEX = 16;
const PLAYER_RECORD_BASE = 0x0082c480;
const PLAYER_RECORD_STRIDE = 0x2c10;
const PLAYER_COUNT = 8;
const PRIORITY_GATE_OFFSET = 0x254e;
const PRIORITY_GATE_ADDRESS = PLAYER_RECORD_BASE + PRIORITY_GATE_OFFSET;
const MAX_QUEUE_RECORDS = 20;

const RAW_CODE_RANGES = [
  ["control-record-writer", 0x004576c0, 0x004576f9, "ec5599a94d3add2e24c2ddaf431d9340f6e58028c478425c02e9a909a89b04ec"],
  ["control-record-initializer", 0x00457700, 0x004590ab, "0a5ab739311f3a5a9f34bc40130e4f920eca24c9a7d0338346858c2a898117c3"],
  ["action-slot-hit-test", 0x00459110, 0x004591d0, "429eb7383706ecf059aa238c04e1fb12af22c4f154f265d1dcd3906cea339566"],
  ["action-slot-add", 0x004593c0, 0x0045942b, "aa3a9c8aae82d67936cac236530b000c5fbf82ae3eea9c8671f381b03ea59837"],
  ["hud-input-and-rebuild", 0x00459490, 0x0045acfd, "f6d20a3bbc4426f27cd430a743eb24e75812a544a034f85b3551b7fadfbec202"],
  ["no-selection-toggle-producer", 0x0045b3a0, 0x0045b41a, "782d749759dac1060c16b04fb2bf7388530bfd02245b663f92be3f247931514e"],
  ["root-owner-reset", 0x00460ba0, 0x00460e21, "47f5f8e1743260ffdbc0f378f46510ec4126c2accc74cc41e2464dd77a5f3b32"],
  ["action-slot-getter", 0x00461200, 0x004612bd, "11e38c3ffdc3c65ce6872cefd068ebed74f75c4773ff0f75aa41a18ced2572ec"],
  ["action-slot-writer", 0x004612c0, 0x00461355, "10da3e73fc49d28f6f9a89bcb522068b5ea97494a6ceac43aca223d2788dd0a1"],
  ["queue-pump-owner", 0x0043c300, 0x0043c9b2, "58058d5b317f151334c5e9190703a5ed7b8aa88cce02a8be36ffa7746f75b756"],
  ["fifo-pop-wrapper", 0x00428530, 0x0042857a, "96e30386c3110857061d79b6de7a43ec1d4e3e35ec7525e0798176fc21d1f285"],
  ["filtered-pop-wrapper", 0x00428580, 0x004285ca, "63cd5585177b970d0175bee6e5f6485bdb0cfc55436f784d6cc4967e33427d3d"],
  ["action-definition-writer", 0x004767a0, 0x004767d2, "54c30133efc5064982113731b24551cb0722544b7a860b84faf50de41df7c7a7"],
  ["action-flag-test", 0x004767e0, 0x004767f2, "ad9e965216be01d5d887542928f5944783225f2fd1a999b7c18c6c3de4b5c0f6"],
  ["action-definition-initializer", 0x00476820, 0x00477cb6, "560fffd80c7690646e58fa46a662eea0f18bacb329f5ad067287176c2dc5aad4"],
  ["gate-command-consumer", 0x00477f50, 0x00478247, "e6ddd9ed5fd10ea374e4d37b349234f6a1ee638978350e7fa82b1015f574a4ca"],
  ["player-record-reset", 0x0047df30, 0x0047e041, "9caa28a318ca161e0c859536ce6a4135e5b08f4fbc1e3668149f599d798c93db"],
  ["fifo-pop", 0x0047fda0, 0x0047fe0e, "7fe6f43a6f56e7100c1777bfbc1b1b14b5764e70de24985eafda8e771462283a"],
  ["production-filtered-pop", 0x0047fe10, 0x0047fef0, "f3ebc24568b1e02822bb704d26eb62fdb0fa0eb4cd295f1e9836a261a7bf0225"],
  ["type-definition-writer", 0x0045bd00, 0x0045bef9, "509503dff8e20541fc50bda41de8292633761c372011b8bdcf43e95c0553809e"],
  ["type-definition-initializer", 0x0045bf50, 0x0045efba, "dd9fb78ef95091369b138c654a1f157a9425a778ce92d226aa975b73a90ff93b"],
].map(([id, start, endExclusive, digest]) => ({
  id,
  start,
  endExclusive,
  sha256: digest,
}));

const FUNCTION_CATALOG = [
  ["0x004576c0", "0x004576c0-0x004576f8", 57, 15, "f6af7b1ff1aa0a6fb2fc921d23a6afc7ff79bc9b65c74412182c4bc87f56b315"],
  ["0x00457700", "0x00457700-0x004590aa", 6571, 1918, "237adb95491fabec00340debf993531625623c87c5fb487694f446575533ad1f"],
  ["0x00459110", "0x00459110-0x004591cf", 192, 63, "a40c568416d927cb4b36a9d6ab683c55a100edb05bb0fdc5256a7ed987dc5f1f"],
  ["0x004593c0", "0x004593c0-0x0045942a", 107, 38, "7b45ee3d0464c0c5333276820f86529cbca31c7f968a269e1022dce74571e246"],
  ["0x00459490", "0x00459490-0x0045acfc", 6253, 1566, "dbbec91b48e85ad1a0a926613751bba4367fba7774ecf2550c02170948a25d8a"],
  ["0x0045b3a0", "0x0045b3a0-0x0045b419", 122, 40, "a3cc2ecbb2925866234102bbd1ff0584cf3c01694c926e1399168139d87e9ace"],
  ["0x00460ba0", "0x00460ba0-0x00460e20", 641, 144, "248c49519c1c692efde84ee3aac2159912097dca7ed46fe3f93ab7b7048b748e"],
  ["0x00461200", "0x00461200-0x004612bc", 189, 48, "4cb5df6c0381376210ca3df951a26ccc316532917dfb554771e10578fc7ff8af"],
  ["0x004612c0", "0x004612c0-0x00461354", 149, 33, "b75a64b998cfe854a8ad6d288078fa7f968ce7c95fbcc0c9f341efda31b49e34"],
  ["0x0043c300", "0x0043c300-0x0043c9b1", 1714, 524, "7b235cc2bd3826f8cc3e6d7c69cd7dd063cbd753a09e2cd2ee6904d4d17900ee"],
  ["0x00428530", "0x00428530-0x00428579", 74, 28, "9bd6ddce48964bcd037f00014ae9df1944576829fc32db252e994b4c67e4c0ac"],
  ["0x00428580", "0x00428580-0x004285c9", 74, 28, "4303e0dee9f23a650996458db755c6bbbfb61db5af49cf9c01aad5aba051d95e"],
  ["0x004767a0", "0x004767a0-0x004767d1", 50, 13, "cfce59d0fbe3479afc5b04d700cf3612176777c1ecd97c238e5023556080a34e"],
  ["0x004767e0", "0x004767e0-0x004767f1", 18, 6, "0ee4cce74ec24fd9adb64b36f025922f50827d314d56fafff84829b105fe6582"],
  ["0x00476820", "0x00476820-0x00477cb5", 5270, 1833, "734391831f41724301afe12e7b5949fdb5e35ec9b0790b04712f959136207a89"],
  ["0x00477f50", "0x00477f50-0x00478246", 759, 231, "9b2f23088fd45345e924f4f27848920e5a1cae8f227b582b192adb74f8407f12"],
  ["0x0047df30", "0x0047df30-0x0047e040", 273, 65, "89b196471e8036b3402fc7a8905cd573330831ac51d9dd6fdffe5a3e24c05a16"],
  ["0x0047fda0", "0x0047fda0-0x0047fe0d", 110, 35, "5367ac30fbe2ed1cbdb5eaa7747c65db80ce57f7ac3addbde76876a154789c14"],
  ["0x0047fe10", "0x0047fe10-0x0047feef", 224, 78, "580132150f8676aaaec696d01ad1ac145fbd8871e669660db2901be90fcb302f"],
  ["0x0045bd00", "0x0045bd00-0x0045bef8", 505, 103, "6561fe98f630ac5f7f0765426c257c4bc3900aae6d2964afa649447cb5030e8a"],
  ["0x0045bf50", "0x0045bf50-0x0045efb9", 12394, 5100, "1fcf54f5ad46f30893b04871058a6c307a0ef32e8dab2c689be4cc18fb980133"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({
  entry,
  bodyRange,
  bodySize,
  instructionCount,
  instructionSha256,
}));

const STATIC_EVIDENCE = [
  [0x00460bfb, "8d ae a8 65 06 00 57 8b cd e8 27 d3 01 00 47 81 c5 10 2c 00 00 83 ff 08 7c ec", "the root owner initializes exactly eight player records at 0x2c10-byte stride"],
  [0x0047df35, "b9 04 0b 00 00 33 c0 8b fe f3 ab", "the player-record reset zeroes exactly 0xb04 DWORDs, covering the full 0x2c10-byte record and the gate at +0x254e"],
  [0x004594a0, "e8 8b ff ff ff 66 a1 2a 66 7c 00 bb 01 00 00 00 66 3b c5 75 0f e8 e6 1e 00 00 e8 61 1f 00 00", "the HUD rebuild clears action slots and reaches the two no-selection producers only when selectionCount is zero"],
  [0x0045b3a0, "0f bf 0d 44 cc bc 00 6a 00 6a 01 8d 04 49 6a 00 c1 e0 04 2b c1 8d 04 40 8d 04 80 c1 e0 04", "the no-selection toggle producer indexes the current player's 0x2c10-byte record"],
  [0x0045b3f6, "66 83 b9 ce e9 82 00 00 75 0d 6a 23 6a 01 e8 b7 df ff ff 83 c4 14 c3 6a 24 6a 01 e8 aa df ff ff", "target gate zero installs control identifier 0x23 in slot 1; nonzero installs identifier 0x24"],
  [0x00457a27, "68 68 77 aa 00 68 48 4e aa 00 6a 00 6a 00 6a 00 6a 1c 6a 3f b9 30 41 5e 00 e8 7b fc ff ff", "control identifier 0x23 maps to action 63 and recovered frame/resource index 28"],
  [0x00457a45, "68 28 77 aa 00 68 68 4e aa 00 6a 00 6a 00 6a 00 6a 1d 6a 40 b9 40 41 5e 00 e8 5d fc ff ff", "control identifier 0x24 maps to action 64 and recovered frame/resource index 29"],
  [0x00459121, "8b 5c 24 10 68 8a 00 00 00 53 b9 d8 5e 7c 00 e8 cb 80 00 00 66 85 c0", "the slot hit test first requires the requested owner slot to contain a nonzero control identifier"],
  [0x0045914c, "0f bf 3d 62 bd 88 00 0f bf db 8b c3 99 f7 ff 0f bf 35 64 bd 88 00 0f bf 0d 68 bd 88 00 03 ce", "slot coordinates use signed WORD column count, cell width and horizontal gap from the recovered layout globals"],
  [0x0045917f, "3b d5 5d 7e 46 03 c1 03 c6 3b d0 7d 3e", "pointer X must be strictly inside the slot's left and right edges"],
  [0x00459191, "0f bf 35 66 bd 88 00 0f bf 0d 6a bd 88 00 03 ce 0f bf 15 c6 df 4b 00 0f af c8 0f bf 05 6e bd 88 00 8d 3c 08 3b d7 7e 11 03 c1 03 c6 3b d0 7d 09", "pointer Y uses the row formula and must be strictly inside the top and bottom edges"],
  [0x00477fd4, "be ce e9 82 00 bb 40 6b 7c 00 89 74 24 10 33 ff c7 44 24 18 32 00 00 00", "the command consumer starts from player 0 gate address 0x0082e9ce and iterates each player's command records"],
  [0x00478077, "66 3d 3f 00 75 10 33 ff 66 c7 06 01 00 66 89 7b fc e9 7c 01 00 00", "action 63 writes exact WORD 1 to the player-scoped gate and consumes the command record"],
  [0x0047808d, "66 3d 40 00 75 0e 66 89 3e 33 ff 66 89 7b fc e9 68 01 00 00", "action 64 writes WORD zero to the player-scoped gate and consumes the command record"],
  [0x00478209, "8b 44 24 18 83 c3 68 48 89 44 24 18 0f 85 d1 fd ff ff 81 c6 10 2c 00 00 81 fb c0 0d 7d 00", "the writer scans 50 command records per player, then advances the gate pointer by 0x2c10 across all player groups"],
  [0x0043c373, "0f be 4b 38 bf 01 00 00 00 8d 04 49 c1 e0 04 2b c1 8d 04 40 8d 14 80 c1 e2 04", "the queue owner sign-extends entity player byte and derives exact 0x2c10 player stride"],
  [0x0043c38d, "66 39 ba ce e9 82 00 75 15 8b cb e8 e3 c1 fe ff 3b c7 75 0a 8b c7 5f 5e 5d 5b 83 c4 28 c3", "gate WORD exact 1 tries the filtered wrapper first and returns immediately when one record is removed"],
  [0x0043c3ab, "8b cb e8 7e c1 fe ff 3b c7 75 0a", "gate disabled or filtered-pop failure falls back to the ordinary FIFO wrapper"],
  [0x0042858b, "50 8d 8f fc 02 00 00 e8 79 78 05 00 8b f0 83 fe 01 75 24", "the filtered wrapper removes a queue record before it attempts entity redelivery"],
  [0x0042859e, "8b 54 24 08 6a 1e 6a 00 8b 44 24 14 83 ec 0c 8b cc 89 11 8b 54 24 24 89 41 04 89 51 08 8b cf e8 7e e1 ff ff", "after removal the wrapper attempts redelivery with constants 0 and 30 and does not observe the delivery return"],
  [0x0047fe15, "66 8b 85 f0 00 00 00 66 85 c0 7f 08 5f 5e 33 c0 5d c2 04 00", "a nonpositive signed queue count makes the filtered pop return zero without reading records"],
  [0x0047fe30, "0f bf c7 6a 08 8d 04 40 0f bf 44 85 00 8d 34 80 c1 e6 02 8d 8e 10 7e 94 00 e8 92 69 ff ff", "each scanned record's action WORD indexes the 20-byte action table and tests action flag bit 0x8"],
  [0x0047fe52, "8b b6 14 7e 94 00 8d 0c b6 8d 14 ce 8d 04 56 f6 04 85 30 2e 88 00 08 75 12", "an action passing the first test is selected only when its produced-type record +0x20 also has bit 0x8"],
  [0x0047fe8a, "0f bf c7 47 8d 0c 40 8b 44 24 10 8d 54 8d 00 8b 4c 8d 00 89 08 8b 4a 04 89 48 04 8b 52 08 89 50 08", "the selected full 12-byte record is copied before later records are shifted"],
  [0x0047fede, "66 ff 8d f0 00 00 00 5f 5e b8 01 00 00", "successful filtered removal decrements the queue-count WORD and returns one"],
  [0x004767a0, "66 8b 44 24 04 66 8b 54 24 08 66 89 01 8b 44 24 0c 66 89 51 02 66 8b 54 24 10 89 41 0c 8b 44 24 14 66 89 51 10 8b 54 24 18 89 41 04 89 51 08", "the action constructor fixes the six raw fields of each 20-byte action record"],
  [0x0045bd8c, "8b 44 24 44 66 89 51 26 66 8b 54 24 48 89 41 20", "type initializer argument 16 is stored as the produced-type DWORD at record +0x20"],
  [0x0045d96e, "6a 08 6a 06 56 6a 2f 6a 25 6a 00 6a 00 56 56 6a 00 68 90 01 00 00", "internal class 76 supplies +0x20 DWORD value 8 in the complete type initializer"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SET_SPECS = [
  ["priority gate complete direct references", "to", "0x0082e9ce", undefined, 6, "10892d3d70ade33544cf16377e398ee8a3baa8d9852495a0bb2d69e24ceecbac"],
  ["FUN_0045b3a0 callers", "to", "0x0045b3a0", "UNCONDITIONAL_CALL", 1, "cf5ed9d1cdc370fd7fe4b2098aaea61d08edcb924a1fd293c91ca2066c16708a"],
  ["FUN_00457700 callers", "to", "0x00457700", "UNCONDITIONAL_CALL", 1, "6c285dadc18e7a8cf6bc177eaa70176853f5f75b431858df4856649c744687ea"],
  ["FUN_004576c0 callers", "to", "0x004576c0", "UNCONDITIONAL_CALL", 213, "85b3b55084c7e5b53fe62c3af8b27081a3423feeee63d1571d853c4b53a86f4b"],
  ["FUN_00477f50 callers", "to", "0x00477f50", "UNCONDITIONAL_CALL", 1, "49a162f57cc0900f1139c22584b925f5619b77925ff52bf93b858e1607066232"],
  ["FUN_0047df30 callers", "to", "0x0047df30", "UNCONDITIONAL_CALL", 1, "8641aa5405554936b103584f987953b10bd0f58acf5af9c8e6ee595ef323ded3"],
  ["FUN_0043c300 callers", "to", "0x0043c300", "UNCONDITIONAL_CALL", 1, "511ee9c058f2d70d7c5b1509b85c0b22030b48e2d75f7d2202f7bba42db8b5fe"],
  ["FUN_00428530 callers", "to", "0x00428530", "UNCONDITIONAL_CALL", 1, "98c395ace336d81b5579a8c4d50ff3fae53630f3975e7a9984df72b99ac49835"],
  ["FUN_00428580 callers", "to", "0x00428580", "UNCONDITIONAL_CALL", 1, "13ea87efa571b11679528e08cb1054fb4d7ad39e7b872a93666215ca1d51690b"],
  ["FUN_0047fda0 callers", "to", "0x0047fda0", "UNCONDITIONAL_CALL", 1, "97e818f37081180ae9a910cafb361360224696b12918eef4246cd91bf5ef3311"],
  ["FUN_0047fe10 callers", "to", "0x0047fe10", "UNCONDITIONAL_CALL", 1, "2ee46265c8423e5bbe7f7fdb1948c9b71b0db8358313b63acd348246ed326cec"],
  ["FUN_004767a0 callers", "to", "0x004767a0", "UNCONDITIONAL_CALL", 229, "a2f09338859687dbc5ec10894af3c24efbab06e55590b952ce87d2f39777af3f"],
  ["FUN_0045bd00 callers", "to", "0x0045bd00", "UNCONDITIONAL_CALL", 95, "fff383cbaf779191fa07b02392b16681cd5254f59227dfc474bdfb4a98781181"],
].map(([label, key, value, type, count, digest]) => ({
  label,
  key,
  value,
  type,
  count,
  digest,
}));

export function extractHeroPriorityQueueGate({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  seedsPath = DEFAULT_SEEDS_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const seedsBytes = readFileSync(seedsPath);
  const functionsBytes = readFileSync(functionsPath);
  const referencesBytes = readFileSync(referencesPath);
  assertEqual(sha256(seedsBytes), EXPECTED_SEEDS_SHA256, `${seedsPath} SHA-256`);
  assertEqual(sha256(functionsBytes), EXPECTED_FUNCTIONS_SHA256, `${functionsPath} SHA-256`);
  assertEqual(
    sha256(referencesBytes),
    EXPECTED_REFERENCES_SHA256,
    `${referencesPath} SHA-256`,
  );
  const seeds = parseJsonBytes(seedsBytes, seedsPath);
  const functions = parseJsonBytes(functionsBytes, functionsPath);
  const references = parseJsonBytes(referencesBytes, referencesPath);
  assertEqual(seeds.sourceSha256, EXPECTED_EXECUTABLE_SHA256, "seeds source SHA-256");
  assertEqual(functions.sourceSha256, EXPECTED_EXECUTABLE_SHA256, "functions source SHA-256");
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, "references source SHA-256");

  const actionDefinitions = extractActionDefinitions(buffer, image, references);
  const typeField0x20Definitions = extractTypeField0x20Definitions(seeds);
  const entityTypeCatalog = extractEntityTypeCatalog({
    executablePath,
    seedsPath,
  });
  const namesByClass = new Map(
    entityTypeCatalog.types.map(({ internalClass, originalGameplayName }) => [
      internalClass,
      originalGameplayName,
    ]),
  );
  const filteredActions = classifyFilteredActions(
    actionDefinitions,
    typeField0x20Definitions,
    namesByClass,
  );

  return {
    schemaVersion: 1,
    question: QUESTION,
    analysisStatus: "static-confirmed-hero-priority-queue-toggle",
    reproductionStatus: "reproduction-complete-for-bounded-gate-control-and-queue-pop",
    implementationStatus: "analysis-only-no-product-change",
    source: {
      executablePath,
      executableSha256: EXPECTED_EXECUTABLE_SHA256,
      seedsPath,
      seedsSha256: EXPECTED_SEEDS_SHA256,
      functionsPath,
      functionsSha256: EXPECTED_FUNCTIONS_SHA256,
      referencesPath,
      referencesSha256: EXPECTED_REFERENCES_SHA256,
    },
    gate: {
      playerRecordBase: toHex(PLAYER_RECORD_BASE),
      playerRecordStride: PLAYER_RECORD_STRIDE,
      playerCount: PLAYER_COUNT,
      fieldOffset: toHex(PRIORITY_GATE_OFFSET),
      playerZeroAddress: toHex(PRIORITY_GATE_ADDRESS),
      storageWidth: "WORD",
      enabledComparison: "exactly 1",
      initialAndResetValue: 0,
      enableActionWord: 63,
      disableActionWord: 64,
      noSelectionControl: {
        owner: "0x007c5ed8",
        slotIndex: 1,
        offControlIdentifier: 0x23,
        offFrameOrResourceIndex: 0x1c,
        onControlIdentifier: 0x24,
        onFrameOrResourceIndex: 0x1d,
        availability: "selectionCount raw WORD exactly zero",
        rectFormula:
          "column=slot%WORD[0x0088bd62], row=trunc(slot/WORD[0x0088bd62]); x=WORD[0x0088bd6c]+column*(WORD[0x0088bd64]+WORD[0x0088bd68]); y=WORD[0x0088bd6e]+row*(WORD[0x0088bd66]+WORD[0x0088bd6a]); w=WORD[0x0088bd64]; h=WORD[0x0088bd66]",
        hitRule: "strict interior on both axes",
      },
    },
    classification: {
      actionRecordCount: actionDefinitions.length,
      actionFlagMask: 0x8,
      producedTypeRecordCount: typeField0x20Definitions.length,
      producedTypeField: "+0x20 DWORD",
      producedTypeFlagMask: 0x8,
      filteredActionCount: filteredActions.length,
      filteredActions,
      verdict:
        "The filtered set is exactly 16 named original hero-character production actions (115..130, with action 120 producing class 94). Clone/carriage/artisan classes 81/92/93 are excluded. This statically confirms the player-scoped toggle as the remembered hero-priority production-queue toggle.",
    },
    queueOrdering: {
      gateDisabled: "remove FIFO index 0, then attempt redelivery",
      gateEnabled:
        "remove the first action whose action WORD has bit 0x8 and whose produced-type +0x20 DWORD has bit 0x8; if none exists, fall back to FIFO index 0",
      mutationOrder:
        "copy selected full 12-byte record, shift later records, decrement queue-count WORD, then attempt redelivery",
      redeliveryBoundary:
        "FUN_00428530/FUN_00428580 do not observe FUN_00426740's return; removal is not rolled back when deeper redelivery rejects or fails",
    },
    actionDefinitions,
    typeField0x20Definitions,
    rawCodeRanges: RAW_CODE_RANGES.map((range) =>
      verifyRawCodeRange(buffer, image, range)),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) =>
      verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SET_SPECS.map((spec) =>
      verifyReferenceSet(references, spec)),
    completenessBoundary:
      "Static closure covers the exact per-player WORD gate, its full structured direct-reference set, process/game-owner reset, actions 63/64 writer, no-selection slot-1 control records and strict hit rectangle formula, all 229 constructor-initialized action definitions, all 95 produced-type +0x20 DWORD values, the 16-action filtered set, and filtered/FIFO removal ordering. Reproduction covers the bounded control visibility/hit result, actions 63/64 gate writes, and queue selection/removal/fallback. The generic HUD release-to-command transport, deeper FUN_00426740 acceptance, and resource-file identity behind frame/resource indices 28/29 remain static-only or unresolved and are not represented as reproduced results.",
    semanticConclusion:
      "Confirmed: this is a player-scoped global hero-priority toggle for production queues. It is exposed in the no-selection action HUD, action 63 enables it, action 64 disables it, and exact gate value 1 prioritizes the first queued action in the exact 16-action named-hero set before FIFO fallback. It is distinct from the adjacent actions 61/62 gate, the seven-WORD no-selection surface, and the remembered right-click persistent HUD reservation lead.",
    unresolvedBoundary:
      "The generic pointer-release command-packing path and original resource filenames for the two control frames were not promoted to reproduction. Alias/bulk save-load paths beyond the statically closed owner reset are not claimed absent. A subsequent independent static slice confirms the adjacent global magic auto-use lower-left toggle without identifying it with this hero-priority gate. Production-button right-click persistent reservation/pinning remains a separate unresolved lead.",
  };
}

export function reproduceHeroPriorityControlSurface(input) {
  assertRecord(input, "input");
  const selectionCount = assertInteger(input.selectionCount, 0, 20, "selectionCount");
  const result = {
    controls: [],
    targetControl: null,
    operations: [{ type: "clear-nine-action-slots" }],
  };
  if (selectionCount !== 0) {
    return result;
  }

  const currentPlayerIndex = assertInteger(
    input.currentPlayerIndex,
    0,
    PLAYER_COUNT - 1,
    "currentPlayerIndex",
  );
  const adjacentGateWord = assertInteger(
    input.adjacentGateWord,
    0,
    0xffff,
    "adjacentGateWord",
  );
  const priorityGateWord = assertInteger(
    input.priorityGateWord,
    0,
    0xffff,
    "priorityGateWord",
  );
  const first = {
    slotIndex: 0,
    controlIdentifier: adjacentGateWord === 0 ? 0x21 : 0x22,
    actionWord: adjacentGateWord === 0 ? 61 : 62,
    frameOrResourceIndex: adjacentGateWord === 0 ? 0x1b : 0x1a,
  };
  const target = {
    slotIndex: 1,
    controlIdentifier: priorityGateWord === 0 ? 0x23 : 0x24,
    actionWord: priorityGateWord === 0 ? 63 : 64,
    frameOrResourceIndex: priorityGateWord === 0 ? 0x1c : 0x1d,
  };
  result.controls.push(first, target);
  result.operations.push(
    { type: "add-no-selection-control", ...first },
    { type: "add-no-selection-control", ...target },
  );

  if (input.layout === undefined) {
    result.targetControl = { ...target, playerIndex: currentPlayerIndex, rect: null, hit: null };
    return result;
  }
  const layout = validateSyntheticLayout(input.layout);
  const rect = resolveActionSlotRect(target.slotIndex, layout);
  let hit = null;
  if (input.pointer !== undefined) {
    assertRecord(input.pointer, "pointer");
    const x = assertInteger(input.pointer.x, -0x80000000, 0x7fffffff, "pointer.x");
    const y = assertInteger(input.pointer.y, -0x80000000, 0x7fffffff, "pointer.y");
    hit =
      x > rect.x
      && x < rect.x + rect.width
      && y > rect.y
      && y < rect.y + rect.height;
  }
  result.targetControl = {
    ...target,
    playerIndex: currentPlayerIndex,
    rect,
    hit,
  };
  return result;
}

export function reproduceHeroPriorityGateCommand(input) {
  assertRecord(input, "input");
  const initialGateWord = assertInteger(
    input.initialGateWord,
    0,
    0xffff,
    "initialGateWord",
  );
  const commandReached = assertBoolean(input.commandReached, "commandReached");
  const result = {
    finalGateWord: initialGateWord,
    commandConsumed: false,
    operations: [],
  };
  if (!commandReached) {
    return result;
  }
  const actionWord = assertInteger(input.actionWord, 0, 0xffff, "actionWord");
  if (actionWord !== 63 && actionWord !== 64) {
    throw new RangeError(
      `actionWord ${actionWord} is outside the bounded hero-priority gate writer actions 63/64`,
    );
  }
  result.finalGateWord = actionWord === 63 ? 1 : 0;
  result.commandConsumed = true;
  result.operations.push({
    type: actionWord === 63 ? "enable-player-hero-priority-gate" : "disable-player-hero-priority-gate",
    actionWord,
    writtenWord: result.finalGateWord,
  });
  return result;
}

export function reproduceHeroPriorityQueuePump(input) {
  assertRecord(input, "input");
  const gateWord = assertInteger(input.gateWord, 0, 0xffff, "gateWord");
  const queueRecords = validateQueueRecords(input.queueRecords);
  const result = {
    returnValue: 0,
    selectionMode: null,
    selectedIndex: null,
    removedRecord: null,
    finalQueueRecords: queueRecords.map(cloneRecord),
    operations: [],
  };

  let selectedIndex;
  if (gateWord === 1) {
    result.operations.push({ type: "scan-production-filtered-actions" });
    for (let index = 0; index < queueRecords.length; index += 1) {
      const actionWord = signedLowWord(queueRecords[index][0]);
      assertInteger(actionWord, 1, MAX_ACTION_ID, `queueRecords[${index}] action WORD`);
      if (FILTERED_ACTION_IDS.has(actionWord)) {
        selectedIndex = index;
        result.selectionMode = "hero-priority-filter";
        break;
      }
    }
    if (selectedIndex === undefined) {
      result.operations.push({ type: "filtered-pop-returned-zero" });
    }
  }
  if (selectedIndex === undefined && queueRecords.length > 0) {
    selectedIndex = 0;
    result.selectionMode = gateWord === 1 ? "fifo-fallback" : "fifo-gate-disabled";
  }
  if (selectedIndex === undefined) {
    result.operations.push({ type: "fifo-pop-returned-zero" });
    return result;
  }

  const [removedRecord] = result.finalQueueRecords.splice(selectedIndex, 1);
  result.returnValue = 1;
  result.selectedIndex = selectedIndex;
  result.removedRecord = removedRecord;
  result.operations.push(
    {
      type: "remove-full-12-byte-queue-record",
      selectedIndex,
      selectionMode: result.selectionMode,
      record: removedRecord,
    },
    {
      type: "attempt-redelivery-after-removal",
      wrapperConstant: result.selectionMode === "hero-priority-filter" ? 30 : 20,
      record: removedRecord,
      resultObservedByWrapper: false,
    },
  );
  return result;
}

const FILTERED_ACTION_IDS = new Set([
  115, 116, 117, 118, 119, 120, 121, 122,
  123, 124, 125, 126, 127, 128, 129, 130,
]);

function classifyFilteredActions(actionDefinitions, typeDefinitions, namesByClass) {
  const typesByInternalClass = new Map(
    typeDefinitions.map((definition) => [definition.internalClass, definition]),
  );
  const filteredActions = [];
  for (const action of actionDefinitions) {
    if ((action.flagsWord & 0x8) === 0) {
      continue;
    }
    const internalClass = action.producedInternalClass;
    if (
      !Number.isInteger(internalClass)
      || internalClass < 1
      || internalClass > TYPE_COUNT
    ) {
      throw new RangeError(
        `Action ${action.actionId} with flag bit 0x8 has produced internal class ${internalClass}; expected 1..${TYPE_COUNT}`,
      );
    }
    const typeDefinition = typesByInternalClass.get(internalClass);
    if (typeDefinition === undefined) {
      throw new Error(
        `Action ${action.actionId} references missing type definition ${internalClass}`,
      );
    }
    const originalProducedTypeName = namesByClass.get(internalClass);
    if (
      typeof originalProducedTypeName !== "string"
      || originalProducedTypeName.length === 0
    ) {
      throw new Error(
        `Action ${action.actionId} references type ${internalClass} without an original catalog name`,
      );
    }
    if ((typeDefinition.field0x20Dword & 0x8) === 0) {
      continue;
    }
    filteredActions.push({
      ...action,
      originalProducedTypeName,
      producedTypeField0x20Dword: typeDefinition.field0x20Dword,
    });
  }
  return filteredActions;
}

export function extractActionDefinitions(buffer, image, references) {
  const constructorCalls = (references.references ?? [])
    .filter(
      ({ to, type }) =>
        to === toHex(ACTION_CONSTRUCTOR) && type === "UNCONDITIONAL_CALL",
    )
    .map(({ from }) => Number.parseInt(from.slice(2), 16))
    .sort((left, right) => left - right);
  assertEqual(
    constructorCalls.length,
    ACTION_DEFINITION_COUNT,
    "action constructor caller count",
  );

  const definitions = [];
  let cursor = ACTION_INITIALIZER;
  for (const callAddress of constructorCalls) {
    const argumentsInPushOrder = [];
    while (argumentsInPushOrder.length < 6) {
      const opcode = readByteAtVa(buffer, image, cursor);
      if (opcode === 0x6a) {
        const value = readByteAtVa(buffer, image, cursor + 1);
        argumentsInPushOrder.push(value >= 0x80 ? value - 0x100 : value);
        cursor += 2;
      } else if (opcode === 0x68) {
        argumentsInPushOrder.push(readUInt32AtVa(buffer, image, cursor + 1));
        cursor += 5;
      } else {
        throw new Error(
          `Action initializer expected immediate PUSH ${argumentsInPushOrder.length} at ${toHex(cursor)}, got opcode ${toHex(opcode)}`,
        );
      }
    }
    assertEqual(readByteAtVa(buffer, image, cursor), 0xb9, `action ECX move at ${toHex(cursor)}`);
    const recordAddress = readUInt32AtVa(buffer, image, cursor + 1);
    cursor += 5;
    assertEqual(cursor, callAddress, `action constructor call address`);
    assertEqual(readByteAtVa(buffer, image, cursor), 0xe8, `action CALL opcode at ${toHex(cursor)}`);
    cursor += 5;
    const actionId = (recordAddress - ACTION_TABLE_ADDRESS) / ACTION_RECORD_STRIDE;
    if (!Number.isInteger(actionId) || actionId < 1 || actionId > MAX_ACTION_ID) {
      throw new Error(`Unaligned action record ${toHex(recordAddress)} at ${toHex(callAddress)}`);
    }
    const [arg6, arg5, arg4, arg3, arg2, arg1] = argumentsInPushOrder;
    definitions.push({
      actionId,
      recordAddress: toHex(recordAddress),
      initializerCallAddress: toHex(callAddress),
      flagsWord: arg1 & 0xffff,
      targetModeWord: arg2 & 0xffff,
      rawDword0x0c: arg3 >>> 0,
      rawWord0x10: arg4 & 0xffff,
      producedInternalClass: arg5 >>> 0,
      rawDword0x08: arg6 >>> 0,
    });
  }
  assertEqual(cursor, 0x00477cb5, "action initializer parsed end");
  const ids = definitions.map(({ actionId }) => actionId).sort((a, b) => a - b);
  assertEqual(new Set(ids).size, ACTION_DEFINITION_COUNT, "unique action definition count");
  for (let index = 1; index < ids.length; index += 1) {
    if (ids[index - 1] >= ids[index]) {
      throw new Error(`Action definition IDs are not strictly increasing at ${ids[index]}`);
    }
  }
  return definitions.sort((left, right) => left.actionId - right.actionId);
}

function extractTypeField0x20Definitions(seeds) {
  const initializer = seeds.functions?.find(
    ({ entry }) => entry === toHex(TYPE_INITIALIZER),
  );
  if (!initializer?.instructions) {
    throw new Error(`seeds.json missing ${toHex(TYPE_INITIALIZER)} instructions`);
  }
  const definitions = [];
  const registerValues = new Map();
  let recordAddress;
  let pushedArguments = [];
  for (const instruction of initializer.instructions) {
    let match = /^MOV (E[A-Z]{2}),(-?0x[0-9a-f]+)$/u.exec(instruction.text);
    if (match) {
      const value = parseImmediate(match[2]);
      registerValues.set(match[1], value);
      if (match[1] === "ECX") {
        recordAddress = value;
      }
    }
    match = /^PUSH (.+)$/u.exec(instruction.text);
    if (match) {
      pushedArguments.push({
        instructionAddress: Number(instruction.address),
        value: /^-?0x[0-9a-f]+$/u.test(match[1])
          ? parseImmediate(match[1])
          : registerValues.get(match[1]),
      });
    }
    if (instruction.text !== `CALL ${toHex(TYPE_WRITER)}`) {
      continue;
    }
    if (
      pushedArguments.length === TYPE_ARGUMENT_COUNT + 1
      && pushedArguments[0].instructionAddress === TYPE_INITIALIZER
    ) {
      pushedArguments = pushedArguments.slice(1);
    }
    assertEqual(
      pushedArguments.length,
      TYPE_ARGUMENT_COUNT,
      `${instruction.address} type argument count`,
    );
    const internalClass = (recordAddress - TYPE_TABLE_ADDRESS) / TYPE_RECORD_STRIDE;
    if (!Number.isInteger(internalClass)) {
      throw new Error(`Unaligned type record ${toHex(recordAddress)} at ${instruction.address}`);
    }
    const chronologicalIndex =
      TYPE_ARGUMENT_COUNT - 1 - TYPE_FIELD_0X20_ARGUMENT_INDEX;
    const field0x20Dword = pushedArguments[chronologicalIndex]?.value;
    if (!Number.isInteger(field0x20Dword)) {
      throw new Error(
        `Type ${internalClass} +0x20 argument is not a statically resolved integer`,
      );
    }
    definitions.push({
      internalClass,
      recordAddress: toHex(recordAddress),
      initializerCallAddress: instruction.address,
      field0x20Dword: field0x20Dword >>> 0,
      bit0x8: (field0x20Dword & 0x8) !== 0,
    });
    recordAddress = undefined;
    pushedArguments = [];
  }
  assertEqual(definitions.length, TYPE_COUNT, "type definition count");
  definitions.sort((left, right) => left.internalClass - right.internalClass);
  for (let internalClass = 1; internalClass <= TYPE_COUNT; internalClass += 1) {
    assertEqual(
      definitions[internalClass - 1].internalClass,
      internalClass,
      `type definition ${internalClass}`,
    );
  }
  return definitions;
}

function verifyFunctionCatalog(functions) {
  return FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions?.find(({ entry }) => entry === expected.entry);
    if (!actual) {
      throw new Error(`functions.json missing ${expected.entry}`);
    }
    assertEqual(actual.bodyRanges?.length, 1, `${expected.entry} body range count`);
    assertEqual(actual.bodyRanges[0], expected.bodyRange, `${expected.entry} body range`);
    assertEqual(actual.bodySize, expected.bodySize, `${expected.entry} body size`);
    assertEqual(
      actual.instructionCount,
      expected.instructionCount,
      `${expected.entry} instruction count`,
    );
    assertEqual(
      actual.instructionSha256,
      expected.instructionSha256,
      `${expected.entry} instruction SHA-256`,
    );
    return expected;
  });
}

function verifyReferenceSet(references, spec) {
  const projected = (references.references ?? [])
    .filter(
      (reference) =>
        reference[spec.key] === spec.value
        && (spec.type === undefined || reference.type === spec.type),
    )
    .map(({ from, to, type, fromFunctionEntry }) => ({
      from,
      to,
      type,
      fromFunctionEntry,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const digest = createHash("sha256").update(JSON.stringify(projected)).digest("hex");
  assertEqual(projected.length, spec.count, `${spec.label} count`);
  assertEqual(digest, spec.digest, `${spec.label} SHA-256`);
  return {
    label: spec.label,
    key: spec.key,
    value: spec.value,
    count: projected.length,
    digest,
    references: projected,
  };
}

function validateSyntheticLayout(value) {
  assertRecord(value, "layout");
  return {
    columns: assertInteger(value.columns, 1, 0x7fff, "layout.columns"),
    cellWidth: assertInteger(value.cellWidth, 1, 0x7fff, "layout.cellWidth"),
    cellHeight: assertInteger(value.cellHeight, 1, 0x7fff, "layout.cellHeight"),
    horizontalGap: assertInteger(
      value.horizontalGap,
      0,
      0x7fff,
      "layout.horizontalGap",
    ),
    verticalGap: assertInteger(value.verticalGap, 0, 0x7fff, "layout.verticalGap"),
    originX: assertInteger(value.originX, -0x8000, 0x7fff, "layout.originX"),
    originY: assertInteger(value.originY, -0x8000, 0x7fff, "layout.originY"),
  };
}

function resolveActionSlotRect(slotIndex, layout) {
  const column = slotIndex % layout.columns;
  const row = Math.trunc(slotIndex / layout.columns);
  return {
    x: layout.originX + column * (layout.cellWidth + layout.horizontalGap),
    y: layout.originY + row * (layout.cellHeight + layout.verticalGap),
    width: layout.cellWidth,
    height: layout.cellHeight,
  };
}

function validateQueueRecords(value) {
  if (!Array.isArray(value) || value.length > MAX_QUEUE_RECORDS) {
    throw new RangeError(`queueRecords must contain at most ${MAX_QUEUE_RECORDS} records`);
  }
  return value.map((record, recordIndex) => {
    if (!Array.isArray(record) || record.length !== 3) {
      throw new RangeError(`queueRecords[${recordIndex}] must contain exactly 3 raw DWORDs`);
    }
    return record.map((dword, dwordIndex) =>
      assertInteger(
        dword,
        0,
        0xffffffff,
        `queueRecords[${recordIndex}][${dwordIndex}]`,
      ));
  });
}

function cloneRecord(record) {
  return [...record];
}

function signedLowWord(value) {
  const word = value & 0xffff;
  return word >= 0x8000 ? word - 0x10000 : word;
}

function readByteAtVa(buffer, image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new RangeError(`${toHex(va)} is not backed by the executable`);
  }
  return buffer.readUInt8(offset);
}

function readUInt32AtVa(buffer, image, va) {
  const offset = image.vaToRawOffset(va);
  if (offset === undefined) {
    throw new RangeError(`${toHex(va)} is not backed by the executable`);
  }
  return buffer.readUInt32LE(offset);
}

function parseImmediate(value) {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(3) : value.slice(2);
  const parsed = Number.parseInt(digits, 16);
  return negative ? -parsed : parsed;
}

function parseJsonBytes(bytes, path) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Cannot parse ${path}: ${error.message}`, { cause: error });
  }
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean`);
  }
  return value;
}

function assertInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer in ${minimum}..${maximum}`);
  }
  return value;
}

function parseArguments(argv) {
  const options = {};
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    const key = {
      "--exe": "executablePath",
      "--seeds": "seedsPath",
      "--functions": "functionsPath",
      "--references": "referencesPath",
    }[argument];
    if (!key) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${argument} requires a path`);
    }
    options[key] = resolve(value);
    index += 1;
  }
  return { json, options };
}

const isMain =
  process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const { json, options } = parseArguments(process.argv.slice(2));
    const report = extractHeroPriorityQueueGate(options);
    process.stdout.write(
      `${json ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
