#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPeImage } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";
import { extractEntityTypeCatalog } from "./extract-entity-type-catalog.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_FUNCTIONS_SHA256 =
  "7e071fdfe425d22447780c265fe1d3fd271a1bedd1773682bebcb8ddc6d2e16e";
export const EXPECTED_REFERENCES_SHA256 =
  "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";

const QUESTION =
  "`FUN_004475a0`의 refuted call 0x00447b23→FUN_004567c0을 제외한 다른 draw/input branches 가운데, 어떤 owner·resource·slot lifecycle이 gameplay 하단 HUD에 지속적으로 남는 selection/production surface를 구성하며, 그 producer/consumer 경계가 실제 production action 또는 current project construction/production/research view data와 의미상 결합되는가?";

const RAW_CODE_RANGES = [
  ["hud-render-root", 0x004475a0, 0x00447bb9, "81e6e28cf3a20e2ecd6d1f2e7ede44e646f044fbf86aa581620baa41f67f9f9c"],
  ["hud-slot-reset", 0x00459430, 0x0045948e, "91ab94fcc48ff982d9c8afb014d2e1d86e67fd9ad461851b968f4fa75b2a5fc3"],
  ["hud-input-root", 0x00459490, 0x0045acfd, "f6d20a3bbc4426f27cd430a743eb24e75812a544a034f85b3551b7fadfbec202"],
  ["selection-renderer", 0x0045ad90, 0x0045b39f, "f82b78ede2f143ebabd5ca357b5580d09bfdb5c33755bdc1e9c34c1ccc8974fc"],
  ["no-selection-seven-slot-producer", 0x0045b420, 0x0045b8ac, "767d88ab9cad2cc37abeccdaab80df61d7b4090a9cd761beb295519efbc91394"],
  ["no-selection-seven-slot-renderer", 0x0045b8b0, 0x0045b9a9, "5c5795bbb4799ae6ef721f9a1bc5aadec6ccc03402992dfcca797da299d67ea1"],
  ["seven-slot-getter", 0x00461360, 0x0046138a, "fa3182350b1541dbee6fabc0a644eaaecc67b43180187a19ed05ba11f3283702"],
  ["seven-slot-setter", 0x00461390, 0x004613fe, "d174f96bf0eef5680b40ef68ae61be79d25be9e7279b2fc478f7588a67c59358"],
  ["command-pack", 0x00477cc0, 0x00477db9, "7fab05352ff9a58f470bace2d9947ad9115c4008df2c9fa5b44819dc7801d3b5"],
  ["command-delivery", 0x00478250, 0x0047831b, "64430138e066f087daddb2aa00edf91963b8d2ac03c53b08ed60077cc405da0b"],
  ["entity-action-store", 0x00426740, 0x004267ff, "8dbf09b2ffd03bebde48d70613dd8237bd25a66b665250de34547513d66e9f9c"],
  ["entity-action-dispatch", 0x00426c20, 0x00428155, "04ed69acd326a5bcf2858a42dfacf8dacfe674de2f2e941fd0d4be157a654576"],
  ["selected-entity-render-root", 0x00421390, 0x004213fa, "8f75043c3ed2c77e5a0e1a95b3719105197db76fddb5668eb80b3eaac3e8d879"],
  ["contained-slot-renderer", 0x00421b20, 0x00421c41, "cd31b600f3a8a7123ecdcd693d2361b5c0f034b2177d63f3ad99dfffce60668d"],
  ["contained-container-add", 0x00481340, 0x0048138e, "340f042e8074ffda9870951259069833b0f9bfc0c62c8376892986ea3b7612fb"],
  ["contained-container-remove", 0x00481390, 0x0048155c, "2c62ba2f55e268795e5abdf4b87bf4eac4d17e50bd308ebf7c08f09c7f52062e"],
  ["selection-count-producer", 0x0043a8b0, 0x0043aa28, "7cf8d80ea61b0c45315a1c129cd4944c193023e2d996a420efa84b0c859b0539"],
  ["production-state-cancel", 0x00426930, 0x00426be2, "002fcf586fea37384233ca7edd4c394799a8a6dbbb9e49901bb7f980be9bd1c8"],
  ["production-state-update", 0x0042de00, 0x0042e181, "38877b0f924c5c347e9b96ff9a7e8d75ed860988277a19cdeb4dc2de9244af4d"],
  ["entity-queue-pump-owner", 0x0043c300, 0x0043c9b2, "58058d5b317f151334c5e9190703a5ed7b8aa88cce02a8be36ffa7746f75b756"],
  ["queue-pop-any-wrapper", 0x00428530, 0x0042857a, "96e30386c3110857061d79b6de7a43ec1d4e3e35ec7525e0798176fc21d1f285"],
  ["queue-pop-production-wrapper", 0x00428580, 0x004285ca, "63cd5585177b970d0175bee6e5f6485bdb0cfc55436f784d6cc4967e33427d3d"],
  ["action-definition-constructor", 0x004767a0, 0x004767d2, "54c30133efc5064982113731b24551cb0722544b7a860b84faf50de41df7c7a7"],
  ["action-definition-initializer", 0x00476820, 0x00477cb6, "560fffd80c7690646e58fa46a662eea0f18bacb329f5ad067287176c2dc5aad4"],
  ["produced-identifier-admission", 0x0047e050, 0x0047e0c9, "5767f4eb3019c48b872536d704f6031368e406975a15d2f9598964c314b5443f"],
  ["reservation-refund", 0x0047e300, 0x0047e32e, "9989e25aa7084d3f0e3e146223f8f5ac3d89a2e4a2206b54e070a2d723db6661"],
  ["reservation-acquire", 0x0047e330, 0x0047e399, "9af66fdc69d8501fde684c2cab7fb1954881223a342046a113d8720b2603f0b2"],
  ["queue-shift-any", 0x0047fda0, 0x0047fe0e, "7fe6f43a6f56e7100c1777bfbc1b1b14b5764e70de24985eafda8e771462283a"],
  ["queue-shift-production", 0x0047fe10, 0x0047fef0, "f3ebc24568b1e02822bb704d26eb62fdb0fa0eb4cd295f1e9836a261a7bf0225"],
  ["queue-append", 0x0047fef0, 0x0047ff77, "a89872fab5002fa62be0b5281c6d3a35af9b887cfbbc3c77c51f499212c817d8"],
  ["queue-can-append", 0x0047ff80, 0x0047ffd4, "1a087f4fdcaa5f886292a9c8572f76bb46ba59683ee0f18b2fdf2f3d9330fc53"],
  ["queue-count-matching", 0x0047ffe0, 0x00480007, "e354906692bceaaf581100fc2ccd7d58180ca868a41a52cab123656ad13c8643"],
  ["queue-remove-matching", 0x00480010, 0x00480089, "a06663985f0be96c232b28f870d7b4e5ec574fdd82535b223645afbdacaa82e9"],
  ["produced-entity-dispatch", 0x00483c50, 0x00483ca0, "e268694e2d2c2fc57c5b0e9a547004b77a6ccb1c700f9b30f5f3329d6e602ac9"],
].map(([id, start, endExclusive, digest]) => ({
  id,
  start,
  endExclusive,
  sha256: digest,
}));

const FUNCTION_CATALOG = [
  ["0x004475a0", "0x004475a0-0x00447bb8", 1561, 418, "fab8bfe9d6a10a75b13e22823ab820abe6deecaa08ed3ae460ca2b9fd87e3cff"],
  ["0x00459430", "0x00459430-0x0045948d", 94, 34, "afbdeb4a3357a350274e972439d9b25ae932af89eb867b2e3a49fba870ee2e9f"],
  ["0x00459490", "0x00459490-0x0045acfc", 6253, 1566, "dbbec91b48e85ad1a0a926613751bba4367fba7774ecf2550c02170948a25d8a"],
  ["0x0045ad90", "0x0045ad90-0x0045b39e", 1551, 458, "7a994e241299d22b0ea3dd79f23805885fe369986236e0d59d4bbf3e5c96c430"],
  ["0x0045b420", "0x0045b420-0x0045b8ab", 1164, 184, "183c4d683062da8a8a7d961266f6d6eb2fc3a14b5f99e2598e322277a8376963"],
  ["0x0045b8b0", "0x0045b8b0-0x0045b9a8", 249, 71, "3f8b7a591363aa271bea15dfdc2c62d0f2e7026e845ed4ea72af823a80e07525"],
  ["0x00461360", "0x00461360-0x00461389", 42, 12, "e634d3069c6476151dce1d147f985a16cc89053dec20caab47e8653d68d6f74d"],
  ["0x00461390", "0x00461390-0x004613fd", 110, 27, "a884de87e60a22110d3cc98de8d03660df750237285e89c0ef199811ba56b73d"],
  ["0x00477cc0", "0x00477cc0-0x00477db8", 249, 70, "d84234434445f60a701c73f7859adabf92f9dfa3bcd25bff775f781f9ca75250"],
  ["0x00478250", "0x00478250-0x0047831a", 203, 70, "1099b045a0f42720b15acf000a837cf453baa6e4c8b207310adb5ba6b04d5bee"],
  ["0x00426740", "0x00426740-0x004267fe", 191, 44, "8b533246c3f83af3e8ce085202fa9be3ddc2bc9e91911f474ce5ba7201d89525"],
  ["0x00426c20", "0x00426c20-0x00428154", 5429, 1428, "95c3358341e594a04aef234beb0838edc8bb296bd6a691ff41b376d9e4f8452c"],
  ["0x00421390", "0x00421390-0x004213fb", 108, 35, "42b9f50cb822fdf2dc6943f38f719cd4d651840e289b22dc76424c236188f7d1"],
  ["0x00421b20", "0x00421b20-0x00421c40", 289, 82, "549805a8005943355bf408ad53940badc3060ad6431320488029ab838ab5731b"],
  ["0x00481340", "0x00481340-0x0048138d", 78, 27, "9268d425689f83689030506ee81fae9a6ac4427155dac2c98f1c99639b44810f"],
  ["0x00481390", "0x00481390-0x0048155b", 460, 136, "ef74e37cbe6cf02451279e31a8192249cecc5c8248893619780acc810633988f"],
  ["0x0043a8b0", "0x0043a8b0-0x0043aa27", 376, 127, "3cc43419256685f4d877722adffa578794c001bfd82fa09033dc822d8f63b38e"],
  ["0x00426930", "0x00426930-0x00426be1", 690, 193, "ca350a4756d8904e4fc6a5bdf6b31203db167ccc4f4ab4a2a99ffbdd42aef4d4"],
  ["0x0042de00", "0x0042de00-0x0042e180", 897, 251, "5841f4432e37d248291bc77186d56a5d515bf462bae24614712092b39cfbf00c"],
  ["0x0043c300", "0x0043c300-0x0043c9b1", 1714, 524, "7b235cc2bd3826f8cc3e6d7c69cd7dd063cbd753a09e2cd2ee6904d4d17900ee"],
  ["0x00428530", "0x00428530-0x00428579", 74, 28, "9bd6ddce48964bcd037f00014ae9df1944576829fc32db252e994b4c67e4c0ac"],
  ["0x00428580", "0x00428580-0x004285c9", 74, 28, "4303e0dee9f23a650996458db755c6bbbfb61db5af49cf9c01aad5aba051d95e"],
  ["0x004767a0", "0x004767a0-0x004767d1", 50, 13, "cfce59d0fbe3479afc5b04d700cf3612176777c1ecd97c238e5023556080a34e"],
  ["0x00476820", "0x00476820-0x00477cb5", 5270, 1833, "734391831f41724301afe12e7b5949fdb5e35ec9b0790b04712f959136207a89"],
  ["0x0047e050", "0x0047e050-0x0047e0c8", 121, 33, "5e753843f762d9fa2368bdffb0cd7f1c609a0c7074d0a8b1d8e01558edd5b31b"],
  ["0x0047e300", "0x0047e300-0x0047e32d", 46, 16, "7536f64546431064c466d9b148d7179183c3f4238404c2c3dc58ba508aa827da"],
  ["0x0047e330", "0x0047e330-0x0047e398", 105, 42, "ee9fe78a2b9391829bf946209714ffa2e76707dc726c3936ee3a259c5a43ccf5"],
  ["0x0047fda0", "0x0047fda0-0x0047fe0d", 110, 35, "5367ac30fbe2ed1cbdb5eaa7747c65db80ce57f7ac3addbde76876a154789c14"],
  ["0x0047fe10", "0x0047fe10-0x0047feef", 224, 78, "580132150f8676aaaec696d01ad1ac145fbd8871e669660db2901be90fcb302f"],
  ["0x0047fef0", "0x0047fef0-0x0047ff76", 135, 45, "dad3e7c4f99b3b219f51e380f286510448b11eb982ba37a0b75dd57e9cce5b2c"],
  ["0x0047ff80", "0x0047ff80-0x0047ffd3", 84, 24, "7b25041c99aeccd8c49ed1900e8c58b4628c71e86484a6800a0cf5cfcc79fae2"],
  ["0x0047ffe0", "0x0047ffe0-0x00480006", 39, 15, "e9c4144461a28a113925b748fca8c0f69c6ccb4c7ac4fa3a839bb0ac08434445"],
  ["0x00480010", "0x00480010-0x00480088", 121, 45, "7f39e6f706a78e619a5dd56bf92b3808adcc27ba62c7a9d59ee5ee5fa0fc5cf9"],
  ["0x00483c50", "0x00483c50-0x00483c9f", 80, 26, "d33ed40b3a614bcc92bc4b3b429dd372e61b4ef6ccb03b290feffd80c7a9ab4e"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({
  entry,
  bodyRange,
  bodySize,
  instructionCount,
  instructionSha256,
}));

const STATIC_EVIDENCE = [
  [0x004594a0, "e8 8b ff ff ff 66 a1 2a 66 7c 00 bb 01 00 00 00 66 3b c5 75 0f e8 e6 1e 00 00 e8 61 1f 00 00 e9 dc 03 00 00", "input rebuild clears all transient slots, and selectionCount zero alone calls both no-selection producers before skipping selected-entity input"],
  [0x00459464, "6a 00 56 b9 d8 5e 7c 00 e8 1f 7f 00 00 46 66 83 fe 07 7c ec", "the update reset writes zero through the bounded setter for each of the seven owner slots before later no-selection population"],
  [0x00459cb9, "66 39 1d 22 2e 5e 00 0f 85 06 01 00 00 66 39 3d 2a 6e c0 00 0f 85 f9 00 00 00 68 25 02 00 00 56 b9 d8 5e 7c 00 66 c7 05 d4 de 4b 00 ff ff 66 89 3d 18 2e 5e 00 e8 0d 75 00 00 0f bf c0 c1 e0 04 0f bf 80 00 3f 5e 00 8d 0c 80 66 39 3c 8d 12 7e 94 00", "right-button release reaches an action only when the recovered action target-mode WORD is zero"],
  [0x00459d11, "68 ea 00 00 00 56 b9 d8 5e 7c 00 e8 df 74 00 00 0f bf d0 80 0d 2e 66 7c 00 04 68 25 02 00 00 c1 e2 04 56 b9 d8 5e 7c 00 66 8b 82 00 3f 5e 00 66 a3 2c 66 7c 00", "accepted right release sets flag bit 0x4 and copies the selected action WORD; it does not write the seven-slot owner"],
  [0x004472ef, "0f be 05 2e 66 7c 00 8b 0d 50 6e c0 00 83 e0 04 c1 e8 02 83 f9 01 75 03 55 eb 02 6a 01 8b 0d 10 97 94 00 66 8b 15 2c 66 7c 00 51 50 66 a1 44 cc bc 00 52 50 e8 98 09 03 00 83 c4 14", "the consumer normalizes flag 0x4 to DWORD 0 or 1, passes it as the third argument to FUN_00477cc0, and independently passes the application queue/immediate mode"],
  [0x00477d1c, "66 8b 8c 24 cc 00 00 00 8b 84 24 d4 00 00 00 66 89 4c 24 1c 8b 8c 24 d8 00 00 00 66 89 54 24 10 8a 94 24 dc 00 00 00 89 44 24 14 a1 80 5f 7c 00 89 4c 24 18 88 5c 24 12 88 54 24 13", "command packing stores the normalized right-release input as a DWORD payload while the action-record byte at +2 remains zero and the queue/immediate mode occupies byte +3"],
  [0x0047826f, "8a 4c 24 2c 33 c0 66 8b 7c 24 1c 89 44 24 0c 8b 54 24 28 89 44 24 10 89 44 24 14 8b 44 24 30 88 4c 24 0e 8b 4c 24 24 83 f8 01 66 89 7c 24 0c 88 44 24 0f 75 45", "delivery reconstructs action WORD, byte +2, byte +3, right-release DWORD, and context DWORD; byte +3 alone chooses immediate versus queued entity action delivery"],
  [0x0042674a, "80 b9 6a 02 00 00 01 74 0c 80 7c 24 06 01 75 05 33 c0 c2 14 00", "the entity replacement guard compares action-record byte +2, not the right-release DWORD stored at +0x26c"],
  [0x004267d1, "8b 54 24 08 89 81 68 02 00 00 8b 44 24 0c 89 91 6c 02 00 00 66 8b 54 24 10 89 81 70 02 00 00 66 89 91 66 02 00 00", "accepted immediate delivery stores action/bytes at +0x268, the normalized right-release DWORD at +0x26c, context at +0x270, and the trailing WORD at +0x266"],
  [0x0045ad90, "66 a1 2a 66 7c 00 83 ec 0c 66 3d 01 00 75 35", "the selection renderer distinguishes exactly one selection from the other paths"],
  [0x0045b8b0, "8b 44 24 04 b9 18 94 55 00 50 e8 f1 f2 fe ff 83 f8 01 0f 85 e0 00 00 00 53 55 56 57 33 f6 bb 02 67 7c 00 bd 07 00 00 00", "the no-selection renderer requires the target surface lock and directly iterates the seven WORDs at owner 0x007c5ed8+0x82a"],
  [0x0045b8d8, "66 8b 03 66 85 c0 0f 84 a6 00 00 00 8b 15 1c a4 89 00 0f bf c8 a1 e8 9c 89 00 c1 e1 04 03 c2 8b 15 2c 98 89 00 66 8b b9 02 3f 5e 00 8b 0d 30 98 89 00 50 51 0f bf 0d 84 bd 88 00 52 0f bf 15 64 bd 88 00 0f bf 05 82 bd 88 00 03 ca 50 0f bf 05 80 bd 88 00 0f af ce 03 c8 51 b9 18 94 55 00 e8 94 26 ff ff", "each nonzero owner WORD is sign-extended for type-table indexing and draws the first layer at xBase+slot*(slotStride+layerWidth), yBase using recovered global resource arguments"],
  [0x0045b93c, "0f bf cf 8b 3d 1c a4 89 00 8b 14 8d e8 9c 89 00 0f bf 0d 66 bd 88 00 0f bf 05 64 bd 88 00 03 d7 52 51 0f bf 0d 84 bd 88 00 0f bf 15 82 bd 88 00 03 c8 83 ea 02 0f af ce 50 52 0f bf 15 80 bd 88 00 03 ca 51 b9 18 94 55 00 e8 46 26 ff ff", "the second layer uses the resolved frame resource and exact xBase+slot*(slotStride+layerWidth), yBase-2, layerWidth, layerHeight arguments"],
  [0x0045b85a, "52 53 b9 d8 5e 7c 00 e8 2a 5b 00 00 43 89 5c 24 10 66 8b 1d 44 cc bc 00", "the no-selection producer writes accepted predefined type WORDs sequentially through the bounded owner setter"],
  [0x004213d5, "8b 46 74 f6 c4 06 74 07 8b ce e8 3c 07 00 00", "the selected-entity renderer reaches the ten-entry contained-object strip only under entity flag bits 0x600"],
  [0x00421baa, "8b 84 be 22 05 00 00 50 e8 29 02 02 00 83 c4 04 85 c0 74 6e 0f bf 84 be 22 05 00 00", "the ten-entry strip validates and draws contained object identifiers from owner+0x522; it is not the seven-slot no-selection owner or the production action queue"],
  [0x0043a959, "b8 38 0e 7d 00 66 83 38 00 75 07 66 83 78 02 00 74 0d 83 c0 04 41 3d 88 0e 7d 00 7d 16 eb e6 8b 95 b6 01 00 00 89 14 8d 38 0e 7d 00 66 ff 05 2a 66 7c 00", "selection admission scans exactly twenty four-byte selection records and increments the raw WORD count only after finding an empty record"],
  [0x0045b2d7, "0f bf 55 00 8b 4c 24 14 33 ff c1 e2 04 66 8b 82 00 3f 5e 00 50 0f bf 01 8d 14 c0 8d 04 50 8d 04 c0 8d 0c c5 54 55 63 00 e8 dc 4c 02 00 66 85 c0 7e 5c 83 c6 05 0f bf 0d 66 bd 88 00 6a 44 8d 04 19 8d 4e 03 8d 50 f9 83 c0 f4 52 51 50 56 b9 18 94 55 00 e8 91 15 ff ff", "the selected-action renderer counts matching entries in the selected entity queue and draws one marker for each positive count on that action slot"],
  [0x004767a0, "66 8b 44 24 04 66 8b 54 24 08 66 89 01 8b 44 24 0c 66 89 51 02 66 8b 54 24 10 89 41 0c 8b 44 24 14 66 89 51 10 8b 54 24 18 89 41 04 89 51 08 c2 18 00", "the action-definition constructor fixes the raw WORD/DWORD field widths and the 20-byte record layout"],
  [0x00477063, "6a 07 6a 1c 6a 02 6a 02 6a 00 6a 08 b9 6c 86 94 00 e8 27 f7 ff ff", "action 107 at 0x0094866c is a generic bit-0x8 produced-type action with internal class 28, prerequisite index 7, and no bit-0x100 one-entry restriction"],
  [0x004770fd, "6a 00 6a 4c 6a 02 6a 02 6a 00 68 08 01 00 00 b9 0c 87 94 00 e8 8a f6 ff ff", "action 115 at 0x0094870c is initialized with bits 0x108, target mode zero, produced internal class 76, no prerequisite index, and the remaining recovered raw fields"],
  [0x0045bd8c, "8b 44 24 44 66 89 51 26 66 8b 54 24 48 89 41 20", "the type-definition writer stores argument 16 as the DWORD at produced-type record +0x20"],
  [0x0045d96e, "6a 08 6a 06 56 6a 2f 6a 25 6a 00 6a 00 56 56 6a 00 68 90 01 00 00 6a 00 6a 17 6a 04 6a 2e 6a 00 68 99 00 00 00 b9 a0 90 88 00 e8 63 e3 ff ff", "the internal-class-76 initializer supplies exact argument 16 value 0x8 before calling the type-definition writer at 0x0045d998"],
  [0x00426c2c, "bb 01 00 00 00", "the dispatcher fixes EBX to one before later payload and state-WORD comparisons"],
  [0x004274b7, "8d 14 80 6a 08 8d 0c 95 10 7e 94 00 e8 18 f3 04 00 3b c3 0f 85 b8 06 00 00 66 8b 07 0f bf c8 8d 0c 89 c1 e1 02 66 8b 91 14 7e 94 00 66 89 54 24 14 8b 96 6c 02 00 00 3b d3 0f 85 f6 00 00 00", "the generic dispatcher selects action bit 0x8, reads the produced internal class, and sends payload one to queue removal while payload zero jumps to admission"],
  [0x004274e8, "8b 96 6c 02 00 00 3b d3 0f 85 f6 00 00 00 50 8d 8e fc 02 00 00 e8 0e 8b 05 00 3b c3 0f 85 39 0c 00 00", "payload one calls FUN_00480010; a matching removal returns immediately without caller refund, while no match falls through to refund and bookkeeping"],
  [0x0042750a, "0f bf 5c 24 14 8d 04 9b 8d 0c c3 8d 2c 4b c1 e5 02 0f bf 95 1e 2e 88 00 0f bf 85 22 2e 88 00 0f bf 8d 20 2e 88 00 52 50 51 0f be 4e 38 8d 04 49 c1 e0 04 2b c1 8d 04 40 8d 0c 80 c1 e1 04 81 c1 80 c4 82 00 e8 ad 6d 05 00", "payload-one no-match resolves the produced-type record and calls FUN_0047e300 with its three raw refund fields"],
  [0x00427553, "0f bf 07 66 8b 95 1e 2e 88 00 66 29 96 f0 03 00 00 8d 04 80 8b 0c 85 18 7e 94 00 85 c9 74 1d 0f be 56 38 8d 04 52 c1 e0 04 2b c2 8d 04 40 8d 14 80 8d 04 d1 66 ff 04 45 b8 e9 82 00 f6 85 30 2e 88 00 08 0f 84 a7 0b 00 00", "after refund, the no-match path subtracts produced-type +0x0e from entity+0x3f0, conditionally increments the action +0x08 indexed player WORD, then tests produced-type record +0x20 bit 0x8 before its final player/type writes"],
  [0x004275ec, "66 39 9e b0 01 00 00 0f 84 cd 02 00 00 8d 8e fc 02 00 00 83 ec 0c 8b d7 89 4c 24 24 8b c4 8b 0a 89 08 8b 4a 04 89 48 04 8b 4c 24 24 8b 52 08 89 50 08 e8 5d 89 05 00 3b c3 0f 85 18 0b 00 00", "payload zero compares the current state WORD with exact one; non-one states first check the 12-byte queue record against total and per-action capacity"],
  [0x0042762b, "66 39 9e 66 02 00 00 0f 85 2e 01 00 00", "on the non-state-one path entity+0x266 exact one enters prerequisite and FUN_0047e330 checks, while every non-one raw WORD jumps to 0x00427766 and skips reservation, entity+0x3f0 add, and the optional action-indexed decrement"],
  [0x0042771b, "8d 04 80 c1 e0 02 8b 88 14 7e 94 00 8d 14 89 8d 14 d1 8d 0c 51 66 8b 14 8d 1e 2e 88 00 66 01 96 f0 03 00 00 8b 90 18 7e 94 00 3b d5 74 1d", "after exact-one gate and successful reservation, non-state-one admission adds produced-type +0x0e to entity+0x3f0 and conditionally reaches the action +0x08 indexed player decrement"],
  [0x00427766, "0f be 4e 38 0f bf 54 24 14 8d 04 49 83 ec 0c c1 e0 04 2b c1 8d 04 40 8d 04 80 8d 0c c2 66 89 2c 4d 5c c5 82 00 0f be 4e 38 8d 04 49 c1 e0 04 2b c1 8d 04 40 8d 04 80 8d 0c c2 66 8b 96 b6 01 00 00", "non-state-one admission writes player/type 0x0082c55c to zero, then reads entity+0x1b6 for the 0x0082c624 player/type write before queue append"],
  [0x004278c6, "66 39 9e 66 02 00 00 0f 85 25 01 00 00", "on the exact-state-one path entity+0x266 exact one enters prerequisite and FUN_0047e330 checks, while every non-one raw WORD jumps to 0x004279f8 and skips reservation, entity+0x3f0 assignment, and the optional action-indexed decrement"],
  [0x004279ad, "8d 04 80 c1 e0 02 8b 88 14 7e 94 00 8d 14 89 8d 14 d1 8d 0c 51 66 8b 14 8d 1e 2e 88 00 66 89 96 f0 03 00 00 8b 90 18 7e 94 00 3b d5 74 1d", "after exact-one gate and successful reservation, exact-state-one admission assigns produced-type +0x0e to entity+0x3f0 and conditionally reaches the action +0x08 indexed player decrement"],
  [0x004279f8, "0f be 4e 38 0f bf 54 24 14 8d 04 49 c1 e0 04 2b c1 8d 04 40 8d 04 80 8d 0c c2 66 89 2c 4d 5c c5 82 00 0f be 4e 38 8d 04 49 c1 e0 04 2b c1 8d 04 40 8d 04 80 8d 0c c2 66 8b 96 b6 01 00 00", "exact-state-one admission writes player/type 0x0082c55c to zero, then reads entity+0x1b6 for the 0x0082c624 player/type write before state 0x0f start"],
  [0x004277b1, "8b cc 8b 10 89 11 8b 50 04 89 51 04 8b 40 08 89 41 08 8b 4c 24 24 e8 24 87 05 00 66 c7 07 01 00", "after the common player/type writes reached through successful reservation or the non-one gate bypass, the full 12-byte command is appended and consumed"],
  [0x00427a3e, "8b ce 66 89 ae b2 01 00 00 e8 a4 f1 ff ff 66 c7 86 b0 01 00 00 0f 00 c6 86 8d 00 00 00 00 0f bf 07 8d 04 80 8b 0c 85 14 7e 94 00 89 8e f4 01 00 00 66 89 ae f8 01 00 00 66 89 ae fa 01 00 00 8a 96 6a 02 00 00 66 c7 07 01 00 88 96 b4 01 00 00", "an admitted payload-zero action on the exact-state-WORD-one direct-start path sets state 0x0f and stores the produced internal class, not the payload, at entity+0x1f4"],
  [0x0047fef4, "66 83 be f0 00 00 00 14 7c 07 5f 33 c0 5e c2 0c 00 8b 7c 24 0c 0f bf c7 57 8d 04 80 66 8b 0c 85 10 7e 94 00 81 e1 00 01 00 00 66 85 c9 8b ce 74 12 e8 b6 00 00 00 66 3d 01 00 7c 19 5f 33 c0 5e c2 0c 00 e8 a4 00 00 00 66 3d 05 00 7c 07 5f 33 c0 5e c2 0c 00", "the entity queue rejects count 20 and limits bit-0x100 actions to one matching entry while other actions are limited to five"],
  [0x0043c38d, "66 39 ba ce e9 82 00 75 15 8b cb e8 e3 c1 fe ff 3b c7 75 0a 8b c7 5f 5e 5d 5b 83 c4 28 c3 8b cb e8 7e c1 fe ff 3b c7 75 0a", "the update owner conditionally asks the production-filtered queue pop first, then falls back to the general queue pop; each successful wrapper redelivers one removed record"],
  [0x0042de0b, "8b 86 f4 01 00 00 8a 9e 8d 00 00 00 88 5e 36 8d 0c 80 8d 14 c8 8d 0c 50 c1 e1 02 f6 81 30 2e 88 00 08 74 33 0f be 56 38 8d 14 92 8d 14 92 8d 04 90 66 83 3c 45 98 21 7d 00 00 74 1b 8b 8e b6 01 00 00 6a 01 51 e8 5b a5 04 00", "before any signed progress comparison, state 0x0f tests produced-type bit 0x8 and a player/type WORD; when both admit the branch it calls FUN_004783b0(entity+0x1b6, 1) and returns"],
  [0x0042df44, "8b 86 f4 01 00 00 8d 0c 80 8d 14 c8 8d 04 50 f6 04 85 30 2e 88 00 08 74 0c 66 8b 8e f4 01 00 00 6a 01 51 eb 0a 66 8b 96 f4 01 00 00 6a 00 52 0f be 4e 38 8d 04 49 c1 e0 04 2b c1 8d 04 40 8d 0c 80 c1 e1 04 81 c1 80 c4 82 00 e8 bd 00 05 00 8b f8 66 85 ff 0f 84 d9 01 00 00 8b 86 f4 01 00 00 8d 0c 80 8d 14 c8 0f be 4e 38 8d 14 50 66 8b 04 95 1e 2e 88 00 66 29 86 f0 03 00 00 8d 04 49 c1 e0 04 2b c1 0f bf 14 95 1e 2e 88 00 8d 04 40 8d 0c 80 c1 e1 04 8d 81 90 c4 82 00 8b 89 90 c4 82 00 2b ca 8b 54 24 0c 89 08 8b 4c 24 10 66 0f be 46 38 50 66 8b 86 f4 01 00 00 6a 64 6a 01 51 52 57 50 e8 45 5c 05 00", "state 0x0f consumes entity+0x1f4 as the produced internal class, obtains a nonzero produced identifier, and passes the class and placement data to the direct entity-creation dispatcher"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SETS = [
  [
    "FUN_00459430 callers",
    "0x00459430",
    1,
    "d24c4c84dfa0f7be5e8d0b8a38609122ccc5b44ab1e67e33086bf489b0842058",
  ],
  [
    "FUN_0045b420 callers",
    "0x0045b420",
    1,
    "b2e3cfa60d4d551344c8b754968039478e0320bb62f8184c66c9ddc9a146b497",
  ],
  [
    "FUN_0045b8b0 callers",
    "0x0045b8b0",
    1,
    "c2a9684f993fb285ff29be15b30a867b3da1ade9f13d7bac8e934c2821ef893d",
  ],
  [
    "FUN_00461390 callers",
    "0x00461390",
    3,
    "20c637b4dd92d7e2411828dd7eeb10e439715eb4e9bc325a16b8a8735a241752",
  ],
  [
    "FUN_00477cc0 callers",
    "0x00477cc0",
    15,
    "478860c8462d22e4f7b68f14c5247dadc21ae7ab987dd8e33f05a611869c5146",
  ],
  [
    "FUN_00478250 callers",
    "0x00478250",
    2,
    "da33c8d26873f69a654b83bca62c3821a46cee2918975c5f7698f6bc0962cdb6",
  ],
  [
    "FUN_00421b20 callers",
    "0x00421b20",
    1,
    "a220c209844c46fb1361aed201f58724508c19917ec8090667c687b6281e58fd",
  ],
  [
    "FUN_00426930 callers",
    "0x00426930",
    2,
    "5297a63228ad546449dc9f3f7561b21677ad7cdfc26cbe8c8656e09eac1234d7",
  ],
  [
    "FUN_0042de00 callers",
    "0x0042de00",
    1,
    "02b86dcb71b5e547fd237bac313cfc5d6823fa0c340be866dca37b0b29ecfef6",
  ],
  [
    "FUN_00428530 callers",
    "0x00428530",
    1,
    "98c395ace336d81b5579a8c4d50ff3fae53630f3975e7a9984df72b99ac49835",
  ],
  [
    "FUN_00428580 callers",
    "0x00428580",
    1,
    "13ea87efa571b11679528e08cb1054fb4d7ad39e7b872a93666215ca1d51690b",
  ],
  [
    "FUN_0047fef0 callers",
    "0x0047fef0",
    3,
    "d19803dabe0ab63d61efd31efed82c577e95767d5c3fb513a4c4863465b28470",
  ],
  [
    "FUN_0047ff80 callers",
    "0x0047ff80",
    2,
    "cdb75d465ffc1a31202fa20416867a963fd4b9fca2d4d43bc0b43bf8ea2f4680",
  ],
  [
    "FUN_00480010 callers",
    "0x00480010",
    2,
    "e0d0adec12f3178ca761570d44c2c02d18b532ad697baf4c8ddb424a1a2ab677",
  ],
].map(([label, target, count, digest]) => ({
  label,
  key: "to",
  value: target,
  type: "UNCONDITIONAL_CALL",
  count,
  digest,
}));

REFERENCE_SETS.push(
  {
    label: "FUN_004475a0 outgoing",
    key: "fromFunctionEntry",
    value: "0x004475a0",
    count: 233,
    digest: "81f7e6c7c7aba4adaa5ee2e3b18ac6e26672481a6bd8aeb6a68ef4918af07dc9",
  },
  {
    label: "FUN_00459490 outgoing",
    key: "fromFunctionEntry",
    value: "0x00459490",
    count: 848,
    digest: "eb8e49be85f069a15dfaef4be5c2e7f08caa605bf40ce61dac5d9736f8aeb05f",
  },
  {
    label: "FUN_00426c20 outgoing",
    key: "fromFunctionEntry",
    value: "0x00426c20",
    count: 379,
    digest: "b5be97466e55145f1eb9b1976354f7f475a01a77ac68dd57afa69e849eddbd6c",
  },
  {
    label: "FUN_0042de00 outgoing",
    key: "fromFunctionEntry",
    value: "0x0042de00",
    count: 59,
    digest: "5c9bba3fbe3674f0b0f6d9dc87448efe38e692b830af0490fb1911576bb373e6",
  },
  {
    label: "FUN_0043c300 outgoing",
    key: "fromFunctionEntry",
    value: "0x0043c300",
    count: 106,
    digest: "800e8c54d21c64052537708e7288d5d37d7f6c6728b02d5e7115611306e06e6a",
  },
  {
    label: "FUN_00476820 outgoing",
    key: "fromFunctionEntry",
    value: "0x00476820",
    count: 458,
    digest: "3d15ed4165d753bc70e95743620e6aa41f98f72bc33710196171c0f291f6316c",
  },
);

export function extractPersistentSelectionActionBoundary({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  const functionsSha256 = sha256(readFileSync(functionsPath));
  const referencesSha256 = sha256(readFileSync(referencesPath));
  assertEqual(functions.sourceSha256, executableSha256, `${functionsPath} sourceSha256`);
  assertEqual(references.sourceSha256, executableSha256, `${referencesPath} sourceSha256`);
  const entityTypeCatalog = extractEntityTypeCatalog({ executablePath });
  const producedType = entityTypeCatalog.types.find(({ internalClass }) => internalClass === 76);
  if (!producedType) {
    throw new Error("entity type catalog is missing statically recovered internal class 76");
  }
  assertEqual(producedType.originalGameplayName, "조선 권율", "internal class 76 original name");

  return {
    question: QUESTION,
    sourceExecutableSha256: executableSha256,
    sourceFunctionsSha256: functionsSha256,
    sourceReferencesSha256: referencesSha256,
    analysisStatus: "static-confirmed-for-scoped-production-action-and-slot-boundary",
    reproductionStatus: "partial-reproduction-production-state-static-only",
    implementationStatus: "analysis-only-no-production-ui-change",
    completenessBoundary:
      "reproduction-complete only for the bounded synthetic selection/no-selection owner and input transport plus modeled FUN_00426c20 action dispatch paths: action 115 payload-zero state/capacity/gate/reservation/common-write admission and payload-one removal/no-match rollback, and action 107 capacity/prerequisite early exits. The queue pump, selected-action queue-count marker, state-0x0f produced-type handoff/update, and deeper FUN_0042de00/FUN_00483c50 dispatch boundary are static-only; overall reproduction is partial.",
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SETS.map((expected) => verifyReferenceSet(references, expected)),
    owners: {
      selectedActionMirror:
        "transient arrays at 0x007c66cc..0x007c6701 rebuilt by FUN_00459490 and drawn by FUN_0045ad90",
      noSelectionSevenSlots:
        "seven raw WORDs at owner 0x007c5ed8+0x82a..0x836 (0x007c6702..0x007c670e); reset/population use FUN_00461390 while FUN_0045b8b0 reads the same array directly",
      containedObjects:
        "separate per-entity bounded container at entity+0x51a with count/capacity and ten DWORD identifier pairs at +0x522",
      pendingCommand:
        "selected action WORD at 0x007c662c and flags WORD at 0x007c662e; right release is bit 0x4",
      productionActionQueue:
        "per-entity 12-byte records at entity+0x2fc, raw WORD count at entity+0x3ec, maximum 20; selected-action rendering counts matching action WORDs",
    },
    selectionValueDomains: {
      selectionCount:
        "raw unsigned WORD maintained by FUN_0043a8b0 over twenty selection records; the bounded producer domain is 0..20",
      sevenSlotStorage:
        "raw unsigned WORD storage; this producer emits zero or internal-class identifiers 1..95, and the renderer sign-extends each nonzero value before table indexing",
    },
    productionAction: {
      actionId: 115,
      definitionAddress: "0x0094870c",
      initializerCallAddress: "0x00477111",
      rawFlagsWord: 0x108,
      targetModeWord: 0,
      producedInternalClass: 76,
      prerequisiteIndexDword: 0,
      actionBookkeepingIndexDword: 0,
      perActionQueueLimit: 1,
      producedTypeField0x20Dword: 0x8,
      producedTypeField0x20Bit0x8: true,
      producedTypeRawFields: {
        field0x0eWord: 0,
        field0x10Word: 400,
        field0x12Word: 0,
      },
      producedTypeIdentity: {
        originalGameplayName: producedType.originalGameplayName,
        definitionAddress: producedType.definition.recordAddress,
        initializerCallAddress: producedType.definition.initializerCallAddress,
        sourceNamePointer: producedType.name.sourcePointer,
      },
    },
    semanticConclusion:
      "The bounded right-release path has no direct write or read link to the seven-slot no-selection owner, and the separate ten-entry strip remains a contained-object container. Separately, action 115 is statically bound to produced internal class 76 (조선 권율). For payload zero, a non-state-one path checks queue capacity first; on both state branches entity+0x266 exact one reaches prerequisite/FUN_0047e330 reservation checks and, after reservation success, the state-specific entity+0x3f0 write plus optional action-indexed decrement. A non-one field bypasses those checks and those two writes, joining only at the common player/type writes before state 0x0f start or queue append. The right-release payload one instead removes a matching queued action without caller refund; when no match exists it reaches FUN_0047e300 and separate rollback bookkeeping. The selected-action renderer proves queue-count display but not the remembered persistent right-click reservation feature. This confirms a narrow original production-action data-flow slice without making the seven-slot owner or the project's broader selectionPanel architecture equivalent to it.",
    unresolvedBoundary:
      "The user-remembered right-click production reservation/pinning feature is not bound to action 115: this candidate's right-release payload removes a matching queued action or reaches a no-match refund/bookkeeping path. FUN_0042de00 first applies the produced-type bit-0x8/player-word early-return gate before progress and later performs additional reservation, type-specific, entity+0x54a/+0x54c, optional UI/SPEECH, linked-callback, and reset side effects; those state-update results are static-only and not reproduced. The exact gameplay meaning of the no-match rollback edge, scheduling admission around FUN_0043c300, placement branches, and deeper FUN_00483c50 entity-constructor path remain unresolved. The project construction/research contracts remain unbound. Subsequent independent slices bind the remembered global magic-auto-use and hero-priority toggles to other player fields without identifying either with action 115 or this seven-slot owner.",
  };
}

export function reproducePersistentSelectionAction(input) {
  assertRecord(input, "input");
  const selectionCount = assertInteger(input.selectionCount, 0, 20, "selectionCount");
  const drawSurfaceLockSucceeded = assertBoolean(
    input.drawSurfaceLockSucceeded,
    "drawSurfaceLockSucceeded",
  );
  const operations = [{ type: "reset-action-and-seven-slot-state" }];

  if (selectionCount === 0) {
    const predefinedSlots = assertFixedOriginalTypeArray(
      input.predefinedSlots,
      7,
      "predefinedSlots",
    );
    operations.push({ type: "rebuild-predefined-no-selection-owner", slots: predefinedSlots });
    if (drawSurfaceLockSucceeded) {
      for (let slot = 0; slot < predefinedSlots.length; slot += 1) {
        if (predefinedSlots[slot] !== 0) {
          operations.push({
            type: "draw-predefined-no-selection-slot",
            slot,
            typeWord: predefinedSlots[slot],
          });
        }
      }
    } else {
      operations.push({ type: "skip-no-selection-draw-surface-lock-failure" });
    }
    return {
      selectionCount,
      command: null,
      predefinedOwnerSlots: predefinedSlots,
      operations,
    };
  }

  const actionAvailable = assertBoolean(input.actionAvailable, "actionAvailable");
  if (!actionAvailable) {
    return {
      selectionCount,
      command: null,
      predefinedOwnerSlots: [],
      operations,
    };
  }

  const actionWord = assertInteger(input.actionWord, 1, 0x7fff, "actionWord");
  if (drawSurfaceLockSucceeded) {
    operations.push({ type: "draw-selected-action-slot", actionWord });
  } else {
    operations.push({ type: "skip-selected-action-draw-surface-lock-failure" });
  }

  const pointerRelease = assertBoolean(input.pointerRelease, "pointerRelease");
  if (!pointerRelease) {
    return {
      selectionCount,
      command: null,
      predefinedOwnerSlots: [],
      operations,
    };
  }

  const pointerButton = assertEnum(input.pointerButton, ["left", "right", "other"], "pointerButton");
  let flagWord = 0;
  if (pointerButton === "left") {
    flagWord = 0x2;
    operations.push({ type: "accept-left-action-release" });
  } else if (pointerButton === "right") {
    const targetModeWord = assertInteger(input.targetModeWord, 0, 0x7fff, "targetModeWord");
    if (targetModeWord === 0) {
      flagWord = 0x4;
      operations.push({ type: "accept-right-zero-target-mode-action-release" });
    } else {
      operations.push({ type: "ignore-right-release-for-nonzero-target-mode" });
    }
  }

  if (flagWord === 0) {
    return {
      selectionCount,
      command: null,
      predefinedOwnerSlots: [],
      operations,
    };
  }

  const immediateMode = assertBoolean(input.immediateMode, "immediateMode");
  const rightReleasePayload = (flagWord & 0x4) >>> 2;
  const delivery = immediateMode ? "immediate-entity-action" : "queued-entity-action";
  operations.push({
    type: "pack-command",
    actionWord,
    actionRecordByte2: 0,
    immediateModeByte3: immediateMode ? 1 : 0,
    rightReleasePayload,
  });
  operations.push({ type: "deliver-command", delivery });

  return {
    selectionCount,
    command: {
      actionWord,
      actionRecordByte2: 0,
      immediateModeByte3: immediateMode ? 1 : 0,
      rightReleasePayload,
      delivery,
    },
    predefinedOwnerSlots: [],
    operations,
  };
}

const PRODUCTION_ACTIONS = new Map([
  [107, {
    actionId: 107,
    rawFlagsWord: 0x8,
    producedInternalClass: 28,
    prerequisiteIndexDword: 7,
    actionBookkeepingIndexDword: 7,
    perActionQueueLimit: 5,
  }],
  [115, {
    actionId: 115,
    rawFlagsWord: 0x108,
    producedInternalClass: 76,
    prerequisiteIndexDword: 0,
    actionBookkeepingIndexDword: 0,
    producedTypeField0x20Bit0x8: true,
    producedTypeRawFields: {
      field0x0eWord: 0,
      field0x10Word: 400,
      field0x12Word: 0,
    },
    perActionQueueLimit: 1,
  }],
]);

export function reproduceProductionActionDispatch(input) {
  assertRecord(input, "input");
  const actionId = assertInteger(input.actionId, 0, 228, "actionId");
  const definition = PRODUCTION_ACTIONS.get(actionId);
  if (!definition) {
    throw new RangeError("actionId must be one of the statically modeled production actions: 107, 115");
  }
  const rightReleasePayload = assertInteger(
    input.rightReleasePayload,
    0,
    1,
    "rightReleasePayload",
  );
  const operations = [{
    type: "dispatch-production-action",
    actionId,
    producedInternalClass: definition.producedInternalClass,
    rightReleasePayload,
  }];
  const result = {
    actionId,
    rightReleasePayload,
    finalQueueActionIds: null,
    stateWordWrite: null,
    producedTypeWrite: null,
    commandConsumed: true,
    operations,
  };

  if (rightReleasePayload === 1) {
    if (!definition.producedTypeRawFields) {
      throw new RangeError(
        "rightReleasePayload 1 rollback reproduction is scoped to statically bounded action 115",
      );
    }
    const queueActionIds = assertQueueActionIds(input.queueActionIds);
    result.finalQueueActionIds = [...queueActionIds];
    const matchIndex = result.finalQueueActionIds.indexOf(actionId);
    if (matchIndex !== -1) {
      result.finalQueueActionIds.splice(matchIndex, 1);
      operations.push({
        type: "remove-first-matching-queued-action-without-caller-refund",
        matchIndex,
      });
      return result;
    }
    operations.push({ type: "matching-queued-action-not-found" });
    operations.push({
      type: "refund-produced-type-resources-and-capacity",
      producedInternalClass: definition.producedInternalClass,
      rawFields: definition.producedTypeRawFields,
    });
    operations.push({
      type: "subtract-produced-type-field-0x0e-from-entity-field-0x3f0",
      producedInternalClass: definition.producedInternalClass,
      amountWord: definition.producedTypeRawFields.field0x0eWord,
    });
    if (definition.actionBookkeepingIndexDword !== 0) {
      operations.push({
        type: "increment-action-indexed-player-word",
        actionBookkeepingIndexDword: definition.actionBookkeepingIndexDword,
      });
    }
    if (definition.producedTypeField0x20Bit0x8) {
      operations.push({
        type: "write-produced-type-player-word-0x82c55c",
        value: 1,
      });
      operations.push({
        type: "write-produced-type-player-word-0x82c624",
        value: 0,
      });
    }
    return result;
  }

  const currentStateWord = assertInteger(input.currentStateWord, 0, 0xffff, "currentStateWord");
  const stateWordIsExactlyOne = currentStateWord === 1;
  if (!stateWordIsExactlyOne) {
    const queueActionIds = assertQueueActionIds(input.queueActionIds);
    result.finalQueueActionIds = [...queueActionIds];
    if (queueActionIds.length >= 20) {
      operations.push({ type: "reject-queued-action-total-capacity", maximum: 20 });
      return result;
    }
    const matchingCount = queueActionIds.filter((entry) => entry === actionId).length;
    if (matchingCount >= definition.perActionQueueLimit) {
      operations.push({
        type: "reject-queued-action-per-action-capacity",
        maximum: definition.perActionQueueLimit,
        matchingCount,
      });
      return result;
    }
  }

  const entityField0x266Word = assertInteger(
    input.entityField0x266Word,
    0,
    0xffff,
    "entityField0x266Word",
  );
  const reservationPathReached = entityField0x266Word === 1;
  if (reservationPathReached) {
    if (definition.prerequisiteIndexDword !== 0) {
      const prerequisiteAvailable = assertBoolean(
        input.prerequisiteAvailable,
        "prerequisiteAvailable",
      );
      if (!prerequisiteAvailable) {
        operations.push({
          type: "reject-missing-production-prerequisite",
          prerequisiteIndexDword: definition.prerequisiteIndexDword,
        });
        return result;
      }
    }
    if (!definition.producedTypeRawFields) {
      throw new RangeError(
        "action 107 reproduction is scoped to prerequisite and capacity early exits before type-specific admission",
      );
    }
    const reservationOutcome = assertEnum(
      input.reservationOutcome,
      ["success", "resource-a", "resource-b", "capacity"],
      "reservationOutcome",
    );
    if (reservationOutcome !== "success") {
      operations.push({
        type: "reject-resource-or-capacity-reservation",
        reason: reservationOutcome,
      });
      return result;
    }
    operations.push({
      type: "reserve-resources-and-capacity",
      producedInternalClass: definition.producedInternalClass,
    });
  } else {
    operations.push({
      type: "bypass-prerequisite-and-reservation-for-entity-field-0x266-non-one",
      entityField0x266Word,
    });
    if (!definition.producedTypeRawFields) {
      throw new RangeError(
        "action 107 reproduction is scoped to prerequisite and capacity early exits before type-specific admission",
      );
    }
  }

  const entityField0x1b6Word = assertInteger(
    input.entityField0x1b6Word,
    0,
    0xffff,
    "entityField0x1b6Word",
  );
  if (reservationPathReached) {
    operations.push({
      type: stateWordIsExactlyOne
        ? "assign-produced-type-field-0x0e-to-entity-field-0x3f0"
        : "add-produced-type-field-0x0e-to-entity-field-0x3f0",
      producedInternalClass: definition.producedInternalClass,
      amountWord: definition.producedTypeRawFields.field0x0eWord,
    });
    if (definition.actionBookkeepingIndexDword !== 0) {
      operations.push({
        type: "decrement-action-indexed-player-word",
        actionBookkeepingIndexDword: definition.actionBookkeepingIndexDword,
      });
    }
  }
  operations.push({
    type: "write-produced-type-player-word-0x82c55c",
    value: 0,
  });
  operations.push({
    type: "write-produced-type-player-word-0x82c624-from-entity-field-0x1b6",
    value: entityField0x1b6Word,
  });

  if (!stateWordIsExactlyOne) {
    result.finalQueueActionIds.push(actionId);
    operations.push({
      type: "append-production-action-to-queue",
      queueIndex: result.finalQueueActionIds.length - 1,
      actionId,
    });
    return result;
  }

  result.stateWordWrite = 0x0f;
  result.producedTypeWrite = definition.producedInternalClass;
  operations.push({ type: "clear-current-action-state" });
  operations.push({
    type: "start-production-state",
    stateWord: 0x0f,
    producedInternalClass: definition.producedInternalClass,
  });
  return result;
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
    assertEqual(actual.instructionCount, expected.instructionCount, `${expected.entry} instruction count`);
    assertEqual(
      actual.instructionSha256,
      expected.instructionSha256,
      `${expected.entry} instruction SHA-256`,
    );
    return expected;
  });
}

function verifyReferenceSet(references, expected) {
  const projected = (references.references ?? [])
    .filter((reference) =>
      reference[expected.key] === expected.value
      && (expected.type === undefined || reference.type === expected.type))
    .map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assertEqual(projected.length, expected.count, `${expected.label} count`);
  const digest = createHash("sha256").update(JSON.stringify(projected)).digest("hex");
  assertEqual(digest, expected.digest, `${expected.label} projection SHA-256`);
  return {
    label: expected.label,
    key: expected.key,
    value: expected.value,
    count: projected.length,
    digest,
    references: projected,
  };
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

function assertEnum(value, choices, label) {
  if (!choices.includes(value)) {
    throw new RangeError(`${label} must be one of ${choices.join(", ")}`);
  }
  return value;
}

function assertFixedOriginalTypeArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new RangeError(
      `${label} must contain exactly ${length} raw WORD values from the recovered 0..95 producer domain`,
    );
  }
  return value.map((entry, index) =>
    assertInteger(entry, 0, 95, `${label}[${index}]`));
}

function assertQueueActionIds(value) {
  if (!Array.isArray(value) || value.length > 20) {
    throw new RangeError("queueActionIds must contain at most 20 action WORDs");
  }
  return value.map((entry, index) =>
    assertInteger(entry, 0, 228, `queueActionIds[${index}]`));
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
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const { json, options } = parseArguments(process.argv.slice(2));
    const report = extractPersistentSelectionActionBoundary(options);
    process.stdout.write(`${json ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
