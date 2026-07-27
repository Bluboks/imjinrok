#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPeImage, toHex } from "./pe-image.mjs";
import {
  assertEqual,
  readJson,
  readVaRange,
  requireRawOffset,
  sha256,
  verifyEvidencePoint,
  verifyRawCodeRange,
} from "./static-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SCRIPT_PATH = "original/imjinrok2/script/K0110";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_K0110_SHA256 =
  "d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8";

const QUESTION =
  "원본 owner object 0x005e3680의 네 selection-panel slot record에서 label index(owner+0x10+slot*2 = 0x005e3690 계열), kind(owner+0xc8+slot*4 = 0x005e3748 계열), active(owner+0xe8+slot*4 = 0x005e3768 계열), progress(owner+0x13c+slot*2 = 0x005e37bc 계열)를 생성·갱신·초기화·해제하는 complete upstream producer 집합과 record lifecycle은 무엇인가? optional gate fields owner+0xf8/+0x564/+0x568은 이 lifecycle과 결합되는가? 각 write가 어떤 입력 record·global·호출자에서 유래하며, kind exact 1과 label table 0x00c83e44의 원본 의미를 건설·생산·연구 중 하나로 정적으로 확정할 수 있는가?";

const RAW_CODE_RANGES = [
  ["diagnostic-report-helper", 0x0044b040, 0x0044b09f, "6c562893188cec5ce2a87b48a7911e3d3bb7744543f0db3e63b7a2390af64aa8"],
  ["owner-constructor-caller", 0x0045f070, 0x0045f07a, "0fc6c1d44f2053cd29de9e2ca8a410ce468487aa42139e5d5c13c83ea17b360c"],
  ["global-initialization-caller", 0x0045f190, 0x0045f244, "b512d4288d72637a244cfbb9485ae6a2b74350414524a5c91e11afcd9f0074be"],
  ["owner-reset-caller", 0x0045f250, 0x0045f308, "9ea10d5aa3a36a6741055fbc2bd07d68b99c417757e5ddc918fd2f0be855ee2a"],
  ["bulk-clear-caller", 0x00482340, 0x0048238d, "b141a423aa35bb79fe7532a6874929c54f62fed2706addbabefd8a3469beddae"],
  ["teardown-clear-caller", 0x004823d0, 0x004824b7, "55e726a80d109c3a79ef1f7930ffbc1567203d9ebea5c794447167c59840a003"],
  ["speech-command-dispatcher", 0x004830f0, 0x004833bd, "7550c0a70805130394c37c3f1a1bc5e30dbb34abc5b7da7032321445ad0c6df1"],
  ["single-slot-clear-caller", 0x004833f0, 0x004834c6, "a17194ccafa0fea463dae57b5ad46b93fe52fb32786408188309277dc93d35cd"],
  ["static-string-copier", 0x0048ea90, 0x004924b3, "55b7a67bd8d391eda3cc97f4eeaa1117334917ad0e7b0da8b129d15d1a6be92a"],
  ["owner-constructor", 0x004a7300, 0x004a73d4, "1643347bd0e12eb8693cfa6065ebb883cde247acd49137eaef49377639846165"],
  ["hero-table-loader", 0x004a7410, 0x004a75d7, "61bcc26e305254514a7930100c2ab7d74c5b86dfe6550d73be80e21cf8854c4e"],
  ["owner-reset", 0x004a75e0, 0x004a7641, "6dcf7725a4d0e3835fae0c4d066cf14f2d60ac7b3718d47242a92dfc9320fb68"],
  ["active-slot-reset", 0x004a7650, 0x004a7689, "cca2842253bab5ff4f963ccc43a1e93337043f847ed338021258540c64302000"],
  ["slot-producer", 0x004a7690, 0x004a7875, "8e486757f3e3b9192bcac5883d78644e63bcda4283ecf4016c629a139f5bf9a9"],
  ["speech-text-producer", 0x004a7a50, 0x004a7b0d, "d9cac0a631c10029910f6893ee82f3d2a216835494eb1cd301a97d48c19f468f"],
  ["speech-slot-wrapper", 0x004a7b10, 0x004a7bb4, "f27f1424cc4c9c0793fabe2abff78190f926f9f7bdb3fb2ee686d1f3efc71c6c"],
  ["owner-visibility-gate", 0x004a7de0, 0x004a7e2d, "e93088fd1bc116ab5267ebe8107848359bc425b5a57246ff7ec045b5cdac7702"],
  ["timed-slot-update", 0x004a7e30, 0x004a7f65, "a84c6ca4086c052eb87b79d7e91a0928326bea584d7089caef5b6ce17878fe97"],
  ["slot-admission-guard", 0x004a7f70, 0x004a7fdf, "bdbf1a6bebbd2b86b87a86be214d336d71bc0df48e70ead04caeadb2020a6ff7"],
  ["slot-clear", 0x004a8030, 0x004a812a, "a61dae0e8a6916bf6ac02da5198d96edc728d39187c0f20b41c83a4fc533e42f"],
  ["bulk-slot-clear", 0x004a8130, 0x004a8150, "5c5c83fd3e7256c06182b1167d1b2e161f30ee354fe0024419c26c888be2af74"],
  ["speech-text-clear", 0x004a8150, 0x004a8196, "b68adf66f9680eb28e5d624c6e1f8850ec4cb9e8cb090273aa3d97990ed4b2f0"],
  ["alternate-speech-wrapper-caller", 0x004a84b0, 0x004a84d7, "9351df88bf6d8045b1b5da85b65e2e74907d1ef520be3c118dca764bbfd4c269"],
  ["identifier-index-lookup", 0x004a8870, 0x004a88ea, "73bf10b346168bf86d4fec169c17b380004bad792e5147cc7d98b375d6142fd7"],
  ["lower-optional-overlay-producer", 0x004a88f0, 0x004a89de, "0f793d13f8118a747fd59627f340392d02b1ad1012a9c47fb338d2964940b26e"],
  ["upper-optional-overlay-producer", 0x004a89e0, 0x004a8abc, "c6cf2e355d2970b0683d253c32c422a5913525719f542bf116c47bdb0e862e41"],
  ["lower-optional-overlay-clear", 0x004a8ac0, 0x004a8ad4, "1311a40d59c3881d4494c510b56441c30d8a232a59cc107f5baa53afcd6c3ada"],
  ["upper-optional-overlay-clear", 0x004a8ae0, 0x004a8af4, "98db5d2847d785342d4b34b954b8ccc0eebe463864ae13d61ba93d7b598bd364"],
].map(([id, start, endExclusive, digest]) => ({
  id,
  start,
  endExclusive,
  sha256: digest,
}));

const FUNCTION_CATALOG = [
  ["0x0044b040", "0x0044b040-0x0044b09e", 95, 27, "2db4bdee7ecae3e9330a57a17c84ee2c1005485939df972715df3de99edad0b5"],
  ["0x0045f070", "0x0045f070-0x0045f079", 10, 2, "da8d24bf0dd9421273a28e8ebe55d481a8c421004cf49d46815c05fca5748e7c"],
  ["0x0045f190", "0x0045f190-0x0045f243", 180, 42, "a69bbff3a7935d129f2786c5e0d56db59441fe460b7951b40e2b8ca637456b8b"],
  ["0x0045f250", "0x0045f250-0x0045f307", 184, 49, "7812f6c4db08302e4cbb110591317aaac9a834995fd9e140a28e22dad618dfe5"],
  ["0x00482340", "0x00482340-0x0048238c", 77, 22, "0f33a0727962c95b37e0fc232b1b921a85fe450b61dc295f73e316bc9cbdc35d"],
  ["0x004823d0", "0x004823d0-0x004824b6", 231, 78, "bf77645626bb9b349beb9538b839627be0d0a05a4bf409a552793ca726c9e7c5"],
  ["0x004830f0", "0x004830f0-0x004833bc", 717, 218, "3f6cb76417e277a4c7c96357e081495e76c553e6ed3064ffeafa904bbc81272a"],
  ["0x004833f0", "0x004833f0-0x004834c5", 214, 74, "138086125d2a443bc84e63191107ffdfa1bd9e2f5f260f673073d16c8cedba46"],
  ["0x0048ea90", "0x0048ea90-0x004924b2", 14883, 5587, "ddec5f281d2f822115ef10035fce8a8a2c7ca61c23b94cee6993082cb44089e2"],
  ["0x004a7300", "0x004a7300-0x004a73d3", 212, 64, "677cac66563a0c6786054ab55f8288c595d741211657e7a66109e414cebc9de9"],
  ["0x004a7410", "0x004a7410-0x004a75d6", 455, 64, "74bdc06f99579c3127ac330369c63aafc5cfcb5c0191e4b00020aeb54c29ccc0"],
  ["0x004a75e0", "0x004a75e0-0x004a7640", 97, 28, "e23e8e6dd6aadf49b0fae5e03d8c25a8bc4ced9f3311ca9bfc7d737aee4f9f3d"],
  ["0x004a7650", "0x004a7650-0x004a7688", 57, 17, "ef6a8c5a24c41c32ea77e3ec2a3a68ba6fe5c258b5209ac4ae3b47fe5dff81b9"],
  ["0x004a7690", "0x004a7690-0x004a7874", 485, 130, "9b7f7cc40ae5dd7a8ef4da3c5ff954dd5be0b3825ff5f8d1215d6b09320d8cb8"],
  ["0x004a7a50", "0x004a7a50-0x004a7b0c", 189, 66, "7ee5dedfe0b05f2823a6d9c55b1fae1371f693e59e3efc277a13752c4695b528"],
  ["0x004a7b10", "0x004a7b10-0x004a7bb3", 164, 73, "027e5b11f3b8d21d9d8fb6351f3a872a08f91441d8f7ee8e5388a251cebcf480"],
  ["0x004a7de0", "0x004a7de0-0x004a7e2c", 77, 24, "1fefb64edf8dac4350af0d19553d1907301f073697d866d36d07aebaa705587f"],
  ["0x004a7e30", "0x004a7e30-0x004a7f64", 309, 91, "edd5f295bfc7a3b94e5fc5e7b80e562750b8aadaf1748488ba5d1d4356ae39bc"],
  ["0x004a7f70", "0x004a7f70-0x004a7fde", 111, 38, "8c028f50e74cdf1fb84c5fd987b608edd95465b7087b29dc4413c40141a4e572"],
  ["0x004a8030", "0x004a8030-0x004a8129", 250, 78, "105ebdbc36f5e73e733007b24e9403bc8960990949026cf30ae53bcad1a3e3ae"],
  ["0x004a8130", "0x004a8130-0x004a814f", 32, 17, "088582f002b380953e1afe5b851f586faf49109f0ec458dd43f986feddcfd104"],
  ["0x004a8150", "0x004a8150-0x004a8195", 70, 17, "f79a72308431cf1993be90cb1933cd58feb018f1a422f7e79f5d7aed12b34a10"],
  ["0x004a84b0", "0x004a84b0-0x004a84d6", 39, 15, "1477e22cc2f67cbaf2d078b9d58ca9f7803219710168faa96b7c7d37a2bcc868"],
  ["0x004a8870", "0x004a8870-0x004a88e9", 122, 51, "1527e8155b7b18927a69fd603fe83c95aa7d672717b638f83b2e0d5f093e5e41"],
  ["0x004a88f0", "0x004a88f0-0x004a89dd", 238, 75, "2ad0d78914605f3393b3d5a11cc25be6bad98b6d8276b6263e08cb6a314b5e4d"],
  ["0x004a89e0", "0x004a89e0-0x004a8abb", 220, 77, "20945c0abdc6e797e257c8390f19b45b40ce1b010f9588d49da1d57b5e1a0dc9"],
  ["0x004a8ac0", "0x004a8ac0-0x004a8ad3", 20, 6, "1be1d13bf8e14ba83891f3265c13df9e1e193d94311984d177f2f8e68d4c4717"],
  ["0x004a8ae0", "0x004a8ae0-0x004a8af3", 20, 6, "a1c1850890a969ca5be7e73a79ea4b0e6cc0527f34603a3ee850a3b574efdf2e"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({
  entry,
  bodyRange,
  bodySize,
  instructionCount,
  instructionSha256,
}));

const STATIC_EVIDENCE = [
  [0x0044b040, "8b 4c 24 0c 81 ec 00 01 00 00 8d 84 24 10 01 00 00 8d 54 24 00 50 51 52 e8 8e 27 06 00", "diagnostic helper formats the caller-supplied message into its local buffer"],
  [0x0044b077, "8b 94 24 08 01 00 00 8b 0d c0 29 5e 00 6a 00 8d 44 24 04 52 50 51 ff 15 cc 71 4b 00", "diagnostic helper passes its formatted buffer and caller metadata to the UI/import-side reporting target"],
  [0x004830f0, "81 ec 80 04 00 00 53 56 8b b4 24 8c 04 00 00 57 8b d9 0f bf 06 83 f8 0a 0f 87 97 02 00 00 ff 24 85 c0 33 48 00", "SPEECH command dispatcher reads a signed WORD opcode and dispatches through the complete 0..10 jump table"],
  [0x00483115, "8b 76 04 6a 00 6a 01 6a 00 66 8b 96 80 00 00 00 8d 86 82 00 00 00 50 56 8d 8e 82 04 00 00 6a 00 51 52 b9 80 36 5e 00 e8 cf 49 02 00", "SPEECH case passes record+0x80 slot, record+0x82 identifier, record+0x482 text/resource fields to owner 0x005e3680 through FUN_004a7b10"],
  [0x0048ef6f, "bf 6c 85 4c 00 83 c9 ff f2 ae f7 d1 2b f9 8b c1 8b f7 8b fb 8d 9a d0 09 00 00 c1 e9 02 f3 a5 8b c8 83 e1 03 f3 a4", "static identifier K1 at 0x004c856c is copied into the runtime identifier buffer at base+0x9c0 (0x00aa49d8)"],
  [0x0048fe97, "bf b0 81 4c 00 83 c9 ff f2 ae f7 d1 2b f9 8b c1 8b f7 8b fb 8d 9a f0 15 00 00 c1 e9 02 f3 a5 8b c8 33 c0 83 e1 03 f3 a4", "static CP949 label '조선 권율' at 0x004c81b0 is copied into 0x00aa55e8 before the next label destination is selected"],
  [0x004a731e, "8d 71 10 8d 91 c8 00 00 00 c7 44 24 14 04 00 00 00 33 db 89 5a 20 c6 45 00 ff 89 1a 89 5a e0 89 5a 10 8d 47 f0 66 89 9e 2c 01 00 00 33 c9 66 c7 06 ff ff", "constructor loop initializes active/kind/progress to zero and label index to signed WORD -1 for four slots"],
  [0x004a73a4, "89 98 f8 00 00 00 89 98 44 01 00 00 89 98 60 05 00 00 89 98 68 05 00 00 89 98 64 05 00 00", "constructor independently zeros optional field_0xf8, resource pointer, field_0x568, and field_0x564"],
  [0x004a76d0, "e8 9b 11 00 00 0f bf fb 8b e8 33 c0 66 39 6c 7e 10 0f 95 c0 89 44 24 10 8b 84 be e8 00 00 00 83 f8 01 75 0a 6a 00 53 8b ce e8 32 09 00 00 8b 4c 24 10 89 8c be c8 00 00 00", "producer resolves identifier index, computes kind from old-label inequality before optional clear, and then stores that boolean DWORD"],
  [0x004a771b, "83 f8 01 75 6f a1 90 3e c8 00 8b 0d 8c 3e c8 00 48 68 fe 00 00 00 49 50 51 6a 00 6a 00 b9 18 94 55 00 e8 7e 51 fa ff 0f bf d5 66 89 6c 7e 10", "slot-surface lock success alone reaches the label WORD store and portrait draw path; failure skips both"],
  [0x004a77ab, "66 c7 84 7e 3c 01 00 00 00 00 c7 84 be e8 00 00 00 01 00 00 00", "after the surface branch the producer always resets progress WORD to zero and writes active DWORD one"],
  [0x004a77c0, "8b 86 60 05 00 00 85 c0 74 17 68 1c 92 4c 00 68 b0 ab 4b 00 68 18 94 55 00 e8 62 38 fa ff 83 c4 0c 8b 9c 24 24 04 00 00 8d 4c 24 14 51 68 60 ba 94 00 53 e8 d8 b5 f9 ff 68 88 13 00 00 8d 54 24 24 6a 02 52 e8 c7 97 f9 ff 83 c4 18 89 86 60 05 00 00", "a non-null prior speech-resource pointer triggers YPRG004 reporting without being passed or cleared, then the new loader result overwrites owner+0x560"],
  [0x004a7812, "85 c0 75 18 53 68 0c 92 4c 00 68 b0 ab 4b 00 68 18 94 55 00 e8 15 38 fa ff 83 c4 10", "a null new loader result triggers the separate YPRG005 [%s] diagnostic"],
  [0x004a7650, "8b 44 24 04 56 57 8b f1 0f bf f8 83 bc be e8 00 00 00 01 75 1f 50 8b ce e8 f3 05 00 00 33 c0 89 84 be e8 00 00 00 89 84 be c8 00 00 00 89 84 be d8 00 00 00", "reset reads kind-related fields only when active equals one, then clears active, kind, and disposition while retaining label and progress"],
  [0x004a8047, "39 84 be e8 00 00 00 0f 85 80 00 00 00 8b 4c 24 28 c6 84 37 48 01 00 00 ff 3b cd 75 26 89 ac be d8 00 00 00 53 8b ce 89 ac be c8 00 00 00 e8 e6 fb ff ff 89 ac be e8 00 00 00 66 c7 44 7e 10 ff ff", "clear mode zero deactivates an exact-one slot, clears kind/disposition, and restores label WORD -1; nonzero mode retains active/label/kind"],
  [0x004a8150, "56 8b f1 b8 01 00 00 00 39 86 f8 00 00 00 75 32 8b 4c 24 08 c6 86 4c 01 00 00 ff 85 c9 75 1d c7 86 44 01 00 00 00 00 00 00 e8 22 11 00 00 c7 86 f8 00 00 00 00 00 00", "slot clear always calls the separate text-state helper with zero; only exact-one field_0xf8 is cleared"],
  [0x004a7de0, "56 33 c0 8d 91 e8 00 00 00 be 04 00 00 00 83 3a 01 75 05 b8 01 00 00 00 83 c2 04 4e 75 f0 8b 91 f8 00 00 00 85 d2 5e 74 05 b8 01 00 00 00 8b 91 68 05 00 00 85 d2 74 05 b8 01 00 00 00 8b 91 64 05 00 00 85 d2 74 05 b8 01 00 00 00 c3", "visibility ORs exact-one slot active states with nonzero field_0xf8, field_0x568, and field_0x564"],
  [0x004a88b7, "47 66 83 ff 11 7c bc 68 2c 92 4c 00 68 b0 ab 4b 00 68 18 94 55 00 e8 6e 27 fa ff 83 c4 0c 66 0d ff ff", "identifier lookup exhausts exactly 17 entries, reports failure, and returns signed WORD -1 without a producer-side range check"],
  [0x004a89cb, "c7 86 68 05 00 00 01 00 00 00", "the lower optional overlay producer independently writes field_0x568=1"],
  [0x004a8a99, "c7 83 64 05 00 00 01 00 00 00", "the upper optional overlay producer independently writes field_0x564=1 on its rendered branch"],
  [0x004a8ac0, "56 8b f1 e8 38 00 00 00 c7 86 68 05 00 00 00 00 00 00 5e c3", "the lower optional overlay clear has its own helper and independently writes field_0x568=0"],
  [0x004a8ae0, "56 8b f1 e8 68 00 00 00 c7 86 64 05 00 00 00 00 00 00 5e c3", "the upper optional overlay clear has its own helper and independently writes field_0x564=0"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REFERENCE_SETS = [
  ["FUN_004a7300 callers", "0x004a7300", 1, "fca6e85f2721dd38af0e74674ee074973af7a1e4f1b4de31ace36aa59226d19d"],
  ["FUN_004a7410 callers", "0x004a7410", 1, "465499cdc5289ce156ad5a9107805703da31810110390c550688dc76659b70b0"],
  ["FUN_004a75e0 callers", "0x004a75e0", 1, "8f2f77069ddc9341923696db6058baeb1c5020c0ea97f1c0416970bebbf8b052"],
  ["FUN_004a7650 callers", "0x004a7650", 1, "82961e348c2c3197e986759efacbe7ae1ac7cc0cc7b9b69ffea98392312d6fe3"],
  ["FUN_004a7690 callers", "0x004a7690", 2, "117a30ffda72c1eea239faae7bdd9ad540287f04db4fd0607177539163b2a261"],
  ["FUN_004a7b10 callers", "0x004a7b10", 2, "9fc9782b00890e23c921188d092da2219a7e2824dd5cd3255c813f255f8b49cd"],
  ["FUN_004a8030 callers", "0x004a8030", 4, "da636b6f82f4009aea9716fb81b222355ea4a1ee1318387f46d5b6397f81b001"],
  ["FUN_004a8130 callers", "0x004a8130", 2, "a904b1089a03783ed15e7af7c0ebb8aff63ac5f00595d79cc1b8c502baf8af99"],
  ["FUN_004a8150 callers", "0x004a8150", 1, "b56c378dd81a19998c350a6b21b465c8453c9eb14aef300e1cb03836f90685ff"],
  ["FUN_004a8870 callers", "0x004a8870", 1, "b1386971d9fa2c2b405e9dbee70635633f2fc07b03e79769245cdf8d9c2e5892"],
  ["FUN_004a88f0 callers", "0x004a88f0", 1, "19562c6867f3ac19eee58e3b7a51b331e52f1831325d01ce17d466e6bf7a446d"],
  ["FUN_004a89e0 callers", "0x004a89e0", 1, "91b603358e113ac8487e0ffbb29d52714c52e07fc700ef547bfe23f3403ab2f3"],
  ["FUN_004a8ac0 callers", "0x004a8ac0", 1, "d1684030df05da9c92a3ca158e2899092a94600dcd470d2dd2995fcfcae7c24a"],
  ["FUN_004a8ae0 callers", "0x004a8ae0", 1, "b829be63be699e7989bf96e9067bc0e4798185e6f83cf5ee31df6d84063849a9"],
].map(([label, target, count, digest]) => ({ label, target, count, digest }));

const OUTGOING_REFERENCE_SETS = [
  ["FUN_004830f0 outgoing", "0x004830f0", 69, "03cf5c0e81061d42296fb991392dfc546e0041a99b4f45a1c7170aec2260af36"],
  ["FUN_004a7410 outgoing", "0x004a7410", 84, "22e2bac200bff8430341a27eab2ee3f0e44c5bb863110be406a69ee599cb2b41"],
  ["FUN_004a7690 outgoing", "0x004a7690", 40, "5f6e12a9dd1202eeb1967100ac9fb1cef15c513d86a6cd3bfeed59af1a10de07"],
  ["FUN_004a7b10 outgoing", "0x004a7b10", 7, "151d799e4fc8ecfb1ab62ced18093612294e8e6d08ca4afff1eb0b08de67f47e"],
  ["FUN_004a8030 outgoing", "0x004a8030", 16, "6b3c9c6ed9ca862b27fe576c380788cbe02fcf20116f7b3370f3ff5a4fa4f8e6"],
].map(([label, source, count, digest]) => ({ label, source, count, digest }));

const LABEL_TABLE = [
  ["K1", 0x00aa49d8, 0x00aa55e8, 0x004c856c, 0x004c81b0, "조선 권율"],
  ["K2", 0x00aa49e8, 0x00aa5608, 0x004c8568, 0x004c81a4, "조선 이순신"],
  ["K3", 0x00aa49f8, 0x00aa5628, 0x004c8564, 0x004c8198, "조선 유성룡"],
  ["K4", 0x00aa4a08, 0x00aa5648, 0x004c8560, 0x004c8188, "조선 사명대사"],
  ["K5", 0x00aa4a18, 0x00aa5668, 0x004c855c, 0x004c817c, "조선 곽재우"],
  ["J1", 0x00aa4a38, 0x00aa56c8, 0x004c8554, 0x004c811c, "일본 고니시"],
  ["J2", 0x00aa4a48, 0x00aa56e8, 0x004c8550, 0x004c8110, "일본 가토"],
  ["J3", 0x00aa4a58, 0x00aa5708, 0x004c854c, 0x004c8100, "일본 와카자키"],
  ["J4", 0x00aa4a68, 0x00aa5728, 0x004c8548, 0x004c80f0, "일본 세이쇼오"],
  ["J5", 0x00aa4a78, 0x00aa5748, 0x004c8544, 0x004c80e4, "일본 우기다"],
  ["C1", 0x00aa4a88, 0x00aa5768, 0x004c8540, 0x004c8154, "명 이여송"],
  ["C2", 0x00aa4a98, 0x00aa5788, 0x004c853c, 0x004c8148, "명 조승훈"],
  ["C3", 0x00aa4aa8, 0x00aa57a8, 0x004c8538, 0x004c813c, "명 심유경"],
  ["C4", 0x00aa4ab8, 0x00aa57c8, 0x004c8534, 0x004c8134, "명 진린"],
  ["C5", 0x00aa4ac8, 0x00aa57e8, 0x004c8530, 0x004c8128, "명 여여문"],
  ["K10", 0x00aa4ad8, 0x00aa5008, 0x004c852c, 0x004c81bc, "조선 선조"],
  ["K6", 0x00aa4a28, 0x00aa56a8, 0x004c8558, 0x004c8160, "조선 허준"],
];

export function extractSelectionPanelSlotLifecycle({
  executablePath = DEFAULT_EXECUTABLE_PATH,
  scriptPath = DEFAULT_SCRIPT_PATH,
  functionsPath = DEFAULT_FUNCTIONS_PATH,
  referencesPath = DEFAULT_REFERENCES_PATH,
} = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const script = readFileSync(scriptPath);
  assertEqual(sha256(script), EXPECTED_K0110_SHA256, `${scriptPath} SHA-256`);
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  assertEqual(functions.sourceSha256, executableSha256, `${functionsPath} sourceSha256`);
  assertEqual(references.sourceSha256, executableSha256, `${referencesPath} sourceSha256`);

  const labelTable = verifyLabelTable(buffer, image);
  const producerDiagnostics = verifyProducerDiagnostics(buffer, image);
  const decodedScript = new TextDecoder("euc-kr", { fatal: true }).decode(script);
  const speechRecords = [...decodedScript.matchAll(/\[SPEECH\]\[([A-Z]\d+)\]\[(\d+)\]\[([^\]]+)\]\[([^\]]*)\]/gu)]
    .map((match) => ({
      identifier: match[1],
      slot: Number(match[2]),
      resource: match[3],
      text: match[4],
    }));
  if (speechRecords.length === 0) {
    throw new Error(`${scriptPath} contains no statically decodable SPEECH records`);
  }

  return {
    question: QUESTION,
    sourceExecutableSha256: executableSha256,
    sourceK0110Sha256: EXPECTED_K0110_SHA256,
    analysisStatus: "static-confirmed-with-explicit-alias-boundary",
    reproductionStatus: "scoped-reproduction-complete",
    implementationStatus: "analysis-only-no-production-change",
    completenessBoundary:
      "complete for the full owner method family and its structured direct callers recovered in functions.json/references.json; arbitrary unstructured alias writes through generic memory-copy or unanalyzed indirect targets cannot be globally excluded",
    rawCodeRanges: RAW_CODE_RANGES.map((range) =>
      verifyRawCodeRange(buffer, image, range)),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) =>
      verifyEvidencePoint(buffer, image, point)),
    referenceSets: REFERENCE_SETS.map((expected) =>
      verifyReferenceSet(references, expected)),
    outgoingReferenceSets: OUTGOING_REFERENCE_SETS.map((expected) =>
      verifyOutgoingReferenceSet(references, expected)),
    fields: {
      labelIndex: "signed WORD at owner+0x10+slot*2; constructor/clear sentinel -1",
      kind: "DWORD boolean written from old labelIndex != resolved labelIndex",
      active: "DWORD; lifecycle branches recognize exact value 1",
      progress: "signed WORD initialized/reset to 0 by constructor/producer; FUN_004a7880 is a downstream +5/clear-kind consumer",
      disposition:
        "raw DWORD at owner+0xd8+slot*4; producer stores its caller input after the surface branch and clear/reset write their mode-specific values",
    },
    lifecycle: {
      constructor:
        "FUN_004a7300 initializes four records: label=-1, kind=0, active=0, progress=0",
      producer:
        "FUN_004a7690, reached through FUN_004a7b10, derives slot and identifier from SPEECH input, resolves the identifier through FUN_004a8870, computes kind before replacement clear, conditionally stores/draws label only after slot-surface lock, stores caller disposition and writes progress=0 and active=1 even when that lock fails, reports YPRG004 without clearing a pre-existing resource pointer, and then overwrites that pointer with the new loader result",
      reset:
        "FUN_004a7650 only acts for active==1 and retains label/progress while clearing active/kind/disposition; FUN_004a75e0 applies it to slots 0..3",
      clear:
        "FUN_004a8030 mode zero restores label=-1 and clears active/kind/disposition for active==1; nonzero mode retains those record fields while selecting the alternate draw/disposition path; every slot branch calls FUN_004a8150(0), while actual speech-resource release is guarded by the prior non-null pointer",
      downstream:
        "FUN_004a7880 alone advances progress by 5 while signed progress<100 and clears kind at progress>=100; this is not an upstream producer",
    },
    optionalFields: {
      field_0xf8:
        "coupled to the successful SPEECH wrapper only through the separate FUN_004a7a50 text path and reset/clear helpers; it is not a member of each slot record",
      field_0x564:
        "independent fixed overlay state produced/cleared by FUN_004a89e0/FUN_004a8ae0; only OR-combined by visibility",
      field_0x568:
        "independent fixed overlay state produced/cleared by FUN_004a88f0/FUN_004a8ac0; only OR-combined by visibility",
    },
    labelTable,
    producerDiagnostics,
    k0110: {
      speechRecordCount: speechRecords.length,
      identifiers: [...new Set(speechRecords.map(({ identifier }) => identifier))],
      firstRecords: speechRecords.slice(0, 3),
      resolvedSpeakers: [...new Set(speechRecords.map(({ identifier }) => {
        const match = labelTable.find((entry) => entry.identifier === identifier);
        if (!match) {
          throw new Error(`K0110 SPEECH identifier ${identifier} is absent from the 17-entry table`);
        }
        return match.label;
      }))],
    },
    semanticConclusion:
      "kind==1 is statically disproved as construction/production/research: it is the one-bit old-versus-new SPEECH portrait/label identity change signal. The 17-entry table contains faction-prefixed speaker labels and K0110 selects K3/K10/K1 for 유성룡/선조/권율. No original construction/production/research compatibility slice is established for the project selectionPanel.",
  };
}

export function reproduceOwnerInitialization() {
  return {
    slots: Array.from({ length: 4 }, () => ({
      labelIndex: -1,
      kindState: 0,
      activeState: 0,
      progressWord: 0,
      disposition: 0,
    })),
    field_0xf8: 0,
    field_0x564: 0,
    field_0x568: 0,
    resourcePresent: false,
  };
}

export function reproduceSpeechSlotProduction(input) {
  assertSlot(input.slot, "slot");
  assertBoolean(input.guardAccepted, "guardAccepted");
  const initial = copyState(input.initial);
  if (!input.guardAccepted) {
    return { status: "guard-rejected", returnValue: 0, events: [], final: initial };
  }
  assertSignedWord(input.resolvedLabelIndex, "resolvedLabelIndex");
  const slot = initial.slots[input.slot];
  validateProducerRecord(slot, `initial.slots[${input.slot}]`);
  const changed = slot.labelIndex !== input.resolvedLabelIndex;
  const events = [
    { type: "resolve-label-index", value: input.resolvedLabelIndex },
    { type: "compare-old-label", old: slot.labelIndex, changed },
  ];
  if (slot.activeState === 1) {
    events.push({ type: "begin-replaced-active-slot-clear", mode: 0 });
    slot.labelIndex = -1;
    slot.kindState = 0;
    slot.activeState = 0;
    slot.disposition = 0;
    events.push({ type: "deactivate-and-restore-label-sentinel" });
    applySharedClearSideEffects(initial, events);
  }
  slot.kindState = changed ? 1 : 0;
  events.push({ type: "store-kind-after-optional-replacement-clear", value: slot.kindState });
  assertBoolean(input.surfaceLockSucceeded, "surfaceLockSucceeded");
  if (input.surfaceLockSucceeded) {
    slot.labelIndex = input.resolvedLabelIndex;
    if (input.resolvedLabelIndex < 0 || input.resolvedLabelIndex >= LABEL_TABLE.length) {
      events.push({
        type: "store-invalid-label-before-unresolved-frame-read",
        labelIndex: input.resolvedLabelIndex,
      });
      return {
        status: "unresolved-unsafe-label-index",
        returnValue: null,
        events,
        final: initial,
      };
    }
    events.push({ type: "store-label-and-draw-portrait", labelIndex: input.resolvedLabelIndex });
  } else {
    events.push({ type: "slot-surface-lock-failed-label-retained", labelIndex: slot.labelIndex });
  }
  assertUnsignedDword(input.dispositionInput, "dispositionInput");
  slot.disposition = input.dispositionInput;
  slot.progressWord = 0;
  slot.activeState = 1;
  events.push({
    type: "store-disposition-activate-slot-and-reset-progress",
    disposition: input.dispositionInput,
  });
  assertBoolean(initial.resourcePresent, "initial.resourcePresent");
  if (initial.resourcePresent) {
    events.push({
      type: "report-existing-speech-resource-before-overwrite",
      diagnostic: "YPRG004",
      resourcePresentAfterDiagnostic: true,
    });
  }
  assertBoolean(input.resourceLoadSucceeded, "resourceLoadSucceeded");
  initial.resourcePresent = input.resourceLoadSucceeded;
  events.push(input.resourceLoadSucceeded
    ? { type: "load-and-start-speech-resource" }
    : {
        type: "report-speech-resource-load-failure",
        diagnostic: "YPRG005 [%s]",
      });
  assertBoolean(input.textPathAccepted, "textPathAccepted");
  if (input.textPathAccepted) {
    initial.field_0xf8 = 1;
    events.push({ type: "activate-separate-speech-text-state" });
  }
  return { status: "completed", returnValue: 1, events, final: initial };
}

export function reproduceSlotReset(input) {
  assertSlot(input.slot, "slot");
  const final = copyState(input.initial);
  const record = final.slots[input.slot];
  assertUnsignedDword(record.activeState, `initial.slots[${input.slot}].activeState`);
  if (record.activeState !== 1) {
    return { status: "inactive-no-op", events: [], final };
  }
  assertSignedWord(record.labelIndex, `initial.slots[${input.slot}].labelIndex`);
  assertSignedWord(record.progressWord, `initial.slots[${input.slot}].progressWord`);
  record.activeState = 0;
  record.kindState = 0;
  record.disposition = 0;
  return {
    status: "reset-active-slot",
    events: [{ type: "erase-slot-surface" }, { type: "retain-label-and-progress" }],
    final,
  };
}

export function reproduceSlotClear(input) {
  assertSlot(input.slot, "slot");
  assertUnsignedDword(input.mode, "mode");
  const final = copyState(input.initial);
  const record = final.slots[input.slot];
  assertUnsignedDword(record.activeState, `initial.slots[${input.slot}].activeState`);
  const events = [];
  if (record.activeState === 1) {
    assertSignedWord(record.progressWord, `initial.slots[${input.slot}].progressWord`);
    if (input.mode === 0) {
      record.disposition = 0;
      record.kindState = 0;
      record.activeState = 0;
      record.labelIndex = -1;
      events.push({ type: "deactivate-and-restore-label-sentinel" });
    } else {
      assertSignedWord(record.labelIndex, `initial.slots[${input.slot}].labelIndex`);
      assertUnsignedDword(record.kindState, `initial.slots[${input.slot}].kindState`);
      record.disposition = 1;
      events.push({ type: "retain-active-record-and-redraw" });
    }
  }
  applySharedClearSideEffects(final, events);
  return { status: "clear-completed", events, final };
}

function applySharedClearSideEffects(state, events) {
  assertUnsignedDword(state.field_0xf8, "initial.field_0xf8");
  assertBoolean(state.resourcePresent, "initial.resourcePresent");
  events.push({ type: "call-separate-text-clear", mode: 0 });
  if (state.field_0xf8 === 1) {
    state.field_0xf8 = 0;
    events.push({ type: "clear-exact-one-speech-text-state" });
  }
  if (state.resourcePresent) {
    state.resourcePresent = false;
    events.push({ type: "release-speech-resource" });
  }
}

function verifyLabelTable(buffer, image) {
  const loaderBytes = readVaRange(buffer, image, 0x004a747c, 0x004a75d0);
  const expectedLoaderBytes = LABEL_TABLE.length * 2 * 10;
  assertEqual(loaderBytes.length, expectedLoaderBytes, "identifier/label pointer assignment byte count");
  const assignments = [];
  for (let offset = 0; offset < loaderBytes.length; offset += 10) {
    assertEqual(loaderBytes[offset], 0xc7, `pointer assignment ${offset / 10} opcode byte 0`);
    assertEqual(loaderBytes[offset + 1], 0x05, `pointer assignment ${offset / 10} opcode byte 1`);
    assignments.push({
      destination: loaderBytes.readUInt32LE(offset + 2),
      value: loaderBytes.readUInt32LE(offset + 6),
    });
  }
  const copierBytes = readVaRange(buffer, image, 0x0048ea90, 0x004924b3);
  const runtimeBufferBase = 0x00aa4018;

  return LABEL_TABLE.map(
    ([identifier, identifierPointer, labelPointer, identifierSourceVa, labelSourceVa, expectedLabel], index) => {
      const expectedIdentifierAssignment = {
        destination: 0x00c83e00 + index * 4,
        value: identifierPointer,
      };
      const expectedLabelAssignment = {
        destination: 0x00c83e44 + index * 4,
        value: labelPointer,
      };
      assertEqual(
        JSON.stringify(assignments[index]),
        JSON.stringify(expectedIdentifierAssignment),
        `identifier pointer assignment ${index}`,
      );
      assertEqual(
        JSON.stringify(assignments[index + LABEL_TABLE.length]),
        JSON.stringify(expectedLabelAssignment),
        `label pointer assignment ${index}`,
      );
      verifyStaticCopyLink(
        copierBytes,
        identifierSourceVa,
        identifierPointer - runtimeBufferBase,
        `${identifier} identifier`,
      );
      verifyStaticCopyLink(
        copierBytes,
        labelSourceVa,
        labelPointer - runtimeBufferBase,
        `${identifier} label`,
      );
      const actualIdentifier = readCStringAtVa(buffer, image, identifierSourceVa, "ascii");
      const actualLabel = readCStringAtVa(buffer, image, labelSourceVa, "euc-kr");
      assertEqual(actualIdentifier, identifier, `${toHex(identifierSourceVa)} identifier`);
      assertEqual(actualLabel, expectedLabel, `${toHex(labelSourceVa)} CP949 label`);
      return {
        index,
        identifier,
        label: expectedLabel,
        identifierPointer: toHex(identifierPointer),
        labelPointer: toHex(labelPointer),
        identifierSourceVa: toHex(identifierSourceVa),
        labelSourceVa: toHex(labelSourceVa),
      };
    },
  );
}

function verifyProducerDiagnostics(buffer, image) {
  return [
    {
      va: 0x004babb0,
      value: "FKJE8567",
      role: "diagnostic-title",
    },
    {
      va: 0x004c920c,
      value: "YPRG005 [%s]",
      role: "new-load-failure",
    },
    {
      va: 0x004c921c,
      value: "YPRG004",
      role: "existing-pointer-before-overwrite",
    },
  ].map(({ va, value, role }) => {
    assertEqual(readCStringAtVa(buffer, image, va, "ascii"), value, `${toHex(va)} diagnostic`);
    return { va: toHex(va), value, role };
  });
}

function verifyStaticCopyLink(copierBytes, sourceVa, destinationOffset, label) {
  const sourcePattern = Buffer.alloc(4);
  sourcePattern.writeUInt32LE(sourceVa);
  const sourceOffsets = findPatternOffsets(copierBytes, sourcePattern);
  assertEqual(sourceOffsets.length, 1, `${label} source immediate count`);

  const destinationPattern = Buffer.alloc(4);
  destinationPattern.writeUInt32LE(destinationOffset);
  const nearbyDestinationOffsets = findPatternOffsets(copierBytes, destinationPattern)
    .filter((offset) => Math.abs(offset - sourceOffsets[0]) <= 24);
  assertEqual(nearbyDestinationOffsets.length, 1, `${label} destination-offset linkage count`);
}

function findPatternOffsets(buffer, pattern) {
  const offsets = [];
  for (let offset = 0; offset < buffer.length;) {
    const found = buffer.indexOf(pattern, offset);
    if (found === -1) break;
    offsets.push(found);
    offset = found + 1;
  }
  return offsets;
}

function readCStringAtVa(buffer, image, va, encoding) {
  const offset = requireRawOffset(image, va);
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  if (end === buffer.length) throw new Error(`${toHex(va)} string is not NUL-terminated`);
  const bytes = buffer.subarray(offset, end);
  return encoding === "ascii"
    ? bytes.toString("ascii")
    : new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

function verifyFunctionCatalog(functions) {
  if (!Array.isArray(functions.functions)) {
    throw new TypeError("functions.json must contain a functions array");
  }
  return FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions.find(({ entry }) => entry === expected.entry);
    if (!actual) throw new Error(`functions.json is missing ${expected.entry}`);
    assertEqual(actual.bodyRanges?.length, 1, `${expected.entry} body range count`);
    for (const field of ["bodyRange", "bodySize", "instructionCount", "instructionSha256"]) {
      const actualValue = field === "bodyRange" ? actual.bodyRanges[0] : actual[field];
      assertEqual(actualValue, expected[field], `${expected.entry} ${field}`);
    }
    return expected;
  });
}

function verifyReferenceSet(references, expected) {
  if (!Array.isArray(references.references)) {
    throw new TypeError("references.json must contain a references array");
  }
  const projection = references.references
    .filter(({ to }) => to === expected.target)
    .map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const digest = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
  assertEqual(projection.length, expected.count, `${expected.label} structured reference count`);
  assertEqual(digest, expected.digest, `${expected.label} structured reference digest`);
  return { label: expected.label, target: expected.target, count: projection.length, sha256: digest, references: projection };
}

function verifyOutgoingReferenceSet(references, expected) {
  if (!Array.isArray(references.references)) {
    throw new TypeError("references.json must contain a references array");
  }
  const projection = references.references
    .filter(({ fromFunctionEntry }) => fromFunctionEntry === expected.source)
    .map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const digest = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
  assertEqual(projection.length, expected.count, `${expected.label} structured reference count`);
  assertEqual(digest, expected.digest, `${expected.label} structured reference digest`);
  return {
    label: expected.label,
    source: expected.source,
    count: projection.length,
    sha256: digest,
    references: projection,
  };
}

function copyState(value) {
  if (value === null || typeof value !== "object") {
    throw new TypeError("initial must be an owner state object");
  }
  const final = structuredClone(value);
  if (!Array.isArray(final.slots) || final.slots.length !== 4) {
    throw new RangeError("initial.slots must contain exactly four records");
  }
  return final;
}

function validateProducerRecord(record, label) {
  if (record === null || typeof record !== "object") {
    throw new TypeError(`${label} must be a slot record object`);
  }
  assertSignedWord(record.labelIndex, `${label}.labelIndex`);
  assertUnsignedDword(record.activeState, `${label}.activeState`);
}

function assertSlot(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new RangeError(`${label} must be one of the four reproduced slots 0..3; got ${String(value)}`);
  }
}

function assertSignedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${label} must be a signed WORD (-32768..32767); got ${String(value)}`);
  }
}

function assertUnsignedDword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be a canonical unsigned DWORD (0..4294967295); got ${String(value)}`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean; got ${String(value)}`);
}

function parseArgs(argv) {
  const parsed = {};
  const paths = new Map([
    ["--input", "executablePath"],
    ["--script", "scriptPath"],
    ["--functions", "functionsPath"],
    ["--references", "referencesPath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    const key = paths.get(arg);
    if (!key) throw new Error(`Unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${arg} requires a path`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { json, ...options } = parseArgs(process.argv.slice(2));
  const report = extractSelectionPanelSlotLifecycle(options);
  console.log(json ? JSON.stringify(report, null, 2) : `${report.analysisStatus}: ${report.semanticConclusion}`);
}
