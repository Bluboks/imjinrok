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

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_SCRIPT_PATH = "original/imjinrok2/script/K0110";
const DEFAULT_FUNCTIONS_PATH = "analysis/generated/imjinrok2/functions.json";
const DEFAULT_REFERENCES_PATH = "analysis/generated/imjinrok2/references.json";

export const EXPECTED_EXECUTABLE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_K0110_SHA256 =
  "d9dcc3c78d0373181677afc63fe9331ff561387e36877a62912ca66515f4aea8";

const COMMAND_ARG_COUNTS = Object.freeze({
  SPEECH: 4,
  CHANGETITLE: 1,
  CHANGEMUSIC: 1,
  SETDELAYTIME: 1,
  NARATION: 1,
  SHOWMODE: 1,
  PROCESSMODE: 1,
  OBJECTIVE: 2,
  PLAYSOUND: 1,
  TITLE: 1,
  NOEND: 0,
});

const RAW_CODE_RANGES = [
  ["command-lookup", 0x00482590, 0x0048285d, "554cf9b9abd60b96288e42e37c7defb9aa64f385a9b1451299598e24eb32ac33"],
  ["record-dispatcher", 0x00482860, 0x00482edb, "3c7f2ca5e6cbf18ae520d2e5b036771a115ec3758c175600dbbef9aa50a06153"],
  ["title-resource-load-gate", 0x00482fc0, 0x00483050, "4653ca88dbe2ae7ff78ce4c7d770c2eaa2f0357961619b0933261150fee59350"],
  ["title-resource-release", 0x00483050, 0x00483075, "dd835f3b2d3877cd7a607521b347a9dbe123fb0585f83abbda717caec261ad4c"],
  ["record-consumer", 0x004830f0, 0x004833bd, "7550c0a70805130394c37c3f1a1bc5e30dbb34abc5b7da7032321445ad0c6df1"],
  ["resource-release-helper", 0x00443440, 0x00443465, "addfc931b1f6504fc8a1913f77f26d19ec7aab08839c29fb61b9c0e0d5ceb59c"],
  ["resource-loader", 0x004434a0, 0x0044357f, "ab4c32302ba6ba9c56fad040df9689aad63a8e03eb33cdeab7b5972368170cf0"],
  ["script-teardown", 0x00482010, 0x00482147, "1b6026efd4dc1dc53dc4a01f3f1335043508d8fb0a970058e396d627df9499e5"],
  ["script-shutdown", 0x004823d0, 0x004824b7, "55e726a80d109c3a79ef1f7930ffbc1567203d9ebea5c794447167c59840a003"],
  ["overlay-compositor", 0x004a84e0, 0x004a8607, "99b27288bd3e851b53f9ab153ce68af73de34675c263f2f8df5fc3883f1bd09e"],
  ["objective-text-producer", 0x004a88f0, 0x004a89de, "0f793d13f8118a747fd59627f340392d02b1ad1012a9c47fb338d2964940b26e"],
  ["title-text-producer", 0x004a89e0, 0x004a8abc, "c6cf2e355d2970b0683d253c32c422a5913525719f542bf116c47bdb0e862e41"],
  ["objective-clear", 0x004a8ac0, 0x004a8ad4, "1311a40d59c3881d4494c510b56441c30d8a232a59cc107f5baa53afcd6c3ada"],
  ["title-clear", 0x004a8ae0, 0x004a8af4, "98db5d2847d785342d4b34b954b8ccc0eebe463864ae13d61ba93d7b598bd364"],
].map(([id, start, endExclusive, digest]) => ({ id, start, endExclusive, sha256: digest }));

const FUNCTION_CATALOG = [
  ["0x00482590", "0x00482590-0x0048285c", 717, 169, "e34141e233eb0090dfea1c2384c3dddf5257ff237eb62376930ac1dbb57d9ec8"],
  ["0x00482860", "0x00482860-0x00482eda", 1659, 456, "536a838eb9dba533ab3fd11a4b617f20fd75ae5d62a5c0e28db9bb2500d2e5b7"],
  ["0x00482fc0", "0x00482fc0-0x0048304f", 144, 40, "4f3369ae7d9bbc8dfd5f484143a19287f5ca1a0d47bdda095ebe6b65a38d2997"],
  ["0x00483050", "0x00483050-0x00483074", 37, 12, "b872225a5197255fe7c57bf6a9bfb535bce521119be324a4cc75f423149e7af1"],
  ["0x004830f0", "0x004830f0-0x004833bc", 717, 218, "3f6cb76417e277a4c7c96357e081495e76c553e6ed3064ffeafa904bbc81272a"],
  ["0x00443440", "0x00443440-0x00443464", 37, 10, "8559fcdaed3da43ef1530b01b51e2ae6ffa2af388df306f8b1ba09f8a5e5490b"],
  ["0x004434a0", "0x004434a0-0x0044357e", 223, 77, "3f38878b35ed942a336b2c68705c6adb90084f6702e5bdd46a68fffaad6cb308"],
  ["0x00482010", "0x00482010-0x00482146", 311, 101, "f498d313ccfd6c08016c2e612d0b579736fe8ada1348dc6d5a8fd4630a174ebd"],
  ["0x004823d0", "0x004823d0-0x004824b6", 231, 78, "bf77645626bb9b349beb9538b839627be0d0a05a4bf409a552793ca726c9e7c5"],
  ["0x004a84e0", "0x004a84e0-0x004a8606", 295, 103, "aee7b66ad3c47ac38ad8690c14dc4a147ac4a764f47ef8a4831c4966a2f37d2d"],
  ["0x004a88f0", "0x004a88f0-0x004a89dd", 238, 75, "2ad0d78914605f3393b3d5a11cc25be6bad98b6d8276b6263e08cb6a314b5e4d"],
  ["0x004a89e0", "0x004a89e0-0x004a8abb", 220, 77, "20945c0abdc6e797e257c8390f19b45b40ce1b010f9588d49da1d57b5e1a0dc9"],
  ["0x004a8ac0", "0x004a8ac0-0x004a8ad3", 20, 6, "1be1d13bf8e14ba83891f3265c13df9e1e193d94311984d177f2f8e68d4c4717"],
  ["0x004a8ae0", "0x004a8ae0-0x004a8af3", 20, 6, "a1c1850890a969ca5be7e73a79ea4b0e6cc0527f34603a3ee850a3b574efdf2e"],
].map(([entry, bodyRange, bodySize, instructionCount, instructionSha256]) => ({ entry, bodyRange, bodySize, instructionCount, instructionSha256 }));

const REFERENCE_PROJECTIONS = [
  ["command lookup outgoing", "0x00482590", 40, "691e738cda14d5d35b0a8e6053a9de7546ca78fbd4ed53da7384171a30b26c91"],
  ["record dispatcher outgoing", "0x00482860", 70, "447e8ad4a846ccfd687f971cec7705915b6a9ce6ffbd54f3d2b4f14aab18f182"],
  ["title load gate outgoing", "0x00482fc0", 13, "9bba117e023b58058f84d153b85559fe1a9f0a7f7c76e5513a5a2333331358a7"],
  ["title release outgoing", "0x00483050", 2, "3a89131f3c93e2a768efd02f0f08ed454f39b402622aa58266c2767c96321484"],
  ["record consumer outgoing", "0x004830f0", 69, "03cf5c0e81061d42296fb991392dfc546e0041a99b4f45a1c7170aec2260af36"],
  ["resource release helper outgoing", "0x00443440", 1, "c7d86bc4f01b7e1f4f9ceeab75e8019921437755a4f6e0b256a5d96b5dbe4733"],
  ["resource loader outgoing", "0x004434a0", 23, "a72dc55652ecc5ff6e3d2c71403082188da0e72dfdc41defceaae9d3c1a0641b"],
  ["script teardown outgoing", "0x00482010", 30, "58632238ce7a2e9ab7e886148279da08d2ee9793b85781c604d3f83b7b985f57"],
  ["script shutdown outgoing", "0x004823d0", 26, "47e85be331410c1e1a851eecebbd33f2040d967cb425bb369bc4406c0aae60e3"],
  ["overlay compositor outgoing", "0x004a84e0", 16, "abcc36278d6b346b6a8386bd8a26b7d773918ca412f171e39f1f05e3a72e0992"],
  ["objective text outgoing", "0x004a88f0", 7, "2a687c111ca30c3da6c17ae61195de413205d2d0c76cd55d5ac0666ac8fb581a"],
  ["title text outgoing", "0x004a89e0", 10, "6f5562c02a7335c71c0dbdd54cd98298f1c8c463c182bfe5ffaa0638de7beceb"],
  ["objective clear outgoing", "0x004a8ac0", 1, "f2a9b834b7f18c3191e087ae0742bc150ca89cb094242f2433b7499928eb40da"],
  ["title clear outgoing", "0x004a8ae0", 1, "f145efdd60ffebc6848cb3b56bc539425eabaf14e7859e25587178b18d9d1ea5"],
].map(([label, fromFunctionEntry, count, digest]) => ({ label, fromFunctionEntry, count, digest }));

const STATIC_EVIDENCE = [
  [0x00482fc9, "8b 86 14 0c 00 00 85 c0 75 57", "CHANGETITLE load gate checks owner+0xc14 before attempting a new image"],
  [0x00483053, "8b 86 14 0c 00 00 85 c0 74 16", "CHANGETITLE release helper checks owner+0xc14"],
  [0x0048305d, "8d 46 20 50 e8 da 03 fc ff 83 c4 04 c7 86 14 0c 00 00 00 00 00 00", "release helper frees resource subobject owner+0x20 and clears owner+0xc14"],
  [0x0048317b, "e8 d0 fe ff ff 8d 4c 24 0c 51 8b cb e8 34 fe ff ff", "record consumer releases previous image then invokes title load gate"],
  [0x0048318e, "0f 85 11 02 00 00", "only a zero title-load helper result would reject the record"],
  [0x00482fe5, "e8 e6 fd fb ff 83 c6 20 8d 54 24 10 56 52 e8 a8 04 fc ff", "title loader normalizes the source path and invokes resource image loader"],
  [0x0048302a, "68 a0 2b 4c 00 68 b0 ab 4b 00 68 18 94 55 00 e8 02 80 fc ff", "pre-existing image path logs TitleSpr Already Allocated Memory"],
  [0x004a8580, "8b 87 68 05 00 00 bd bc 00 00 00 83 f8 01", "compositor gates objective rectangle on owner+0x568 == 1"],
  [0x004a85c6, "83 bf 64 05 00 00 01", "compositor checks title rectangle only after objective draw"],
  [0x004823f7, "b9 80 36 5e 00 e8 bf 66 02 00 b9 80 36 5e 00 e8 d5 66 02 00", "shutdown clears objective then title before releasing remaining script resources"],
  [0x0048212e, "e8 1d 0f 00 00 66 89 ae 18 0c 00 00 66 89 ae 1a 0c 00 00 89 6e 04", "script teardown releases CHANGETITLE resource and resets record indices"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

export function extractChangeTitleConsumerEvidence({ executablePath = DEFAULT_EXECUTABLE_PATH, scriptPath = DEFAULT_SCRIPT_PATH, functionsPath = DEFAULT_FUNCTIONS_PATH, referencesPath = DEFAULT_REFERENCES_PATH } = {}) {
  const { buffer, image } = readPeImage(executablePath);
  const executableSha256 = sha256(buffer);
  assertEqual(executableSha256, EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);
  const script = readFileSync(scriptPath);
  assertEqual(sha256(script), EXPECTED_K0110_SHA256, `${scriptPath} SHA-256`);
  const functions = readJson(functionsPath);
  const references = readJson(referencesPath);
  assertEqual(functions.sourceSha256, executableSha256, `${functionsPath} sourceSha256`);
  assertEqual(references.sourceSha256, executableSha256, `${referencesPath} sourceSha256`);
  const commands = parseScript(new TextDecoder("euc-kr", { fatal: true }).decode(script));
  const preFirstSpeech = commands.slice(0, commands.findIndex(({ command }) => command === "SPEECH"));
  verifyK0110Prelude(preFirstSpeech);
  return {
    question: "What owner/resource fields does K0110 CHANGETITLE create or replace, where is the loaded title sprite consumed, and what remains after replacement/load/teardown failure?",
    sourceExecutableSha256: executableSha256,
    sourceK0110Sha256: EXPECTED_K0110_SHA256,
    analysisStatus: "static-confirmed",
    reproductionStatus: "scoped-reproduction-complete",
    implementationStatus: "analysis-only-no-production-change",
    rawCodeRanges: RAW_CODE_RANGES.map((range) => verifyRawCodeRange(buffer, image, range)),
    functionCatalog: verifyFunctionCatalog(functions),
    evidencePoints: STATIC_EVIDENCE.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceProjections: REFERENCE_PROJECTIONS.map((expected) => verifyReferenceProjection(references, expected)),
    commandMapping: { CHANGETITLE: 1, SETDELAYTIME: 3, OBJECTIVE: 7, TITLE: 9 },
    record: { kind: 1, payloadBytes: 0x80, sourceField: "record+0x04 points to NUL-terminated source path" },
    ownerResource: {
      owner: "script owner 0x005e3680",
      resourceBase: "owner+0x20",
      image: "owner+0xc14 (resourceBase+0xbf4)",
      commandCount: "owner+0x60c increments after every nonzero kind-1 result",
      replacement: "FUN_004830f0 case 1 always calls release then load; same-path and different-path requests both release the previous image first",
    },
    loadFailure: {
      existingImage: "FUN_00482fc0 logs TitleSpr Already Allocated Memory and retains the existing image when called without the consumer's release",
      missingOrMalformedSource: "FUN_004434a0 failure leaves owner+0xc14 zero; FUN_00482fc0 still returns 1, so the record is consumed despite no image",
      consumerReturn: "case 1 has no observed zero return from FUN_00482fc0; a zero would be the only record rejection branch",
    },
    compositor: {
      surface: "FUN_004a84e0 blits scratch surface DAT_0054927c to target surface supplied by its caller (K01 frame path supplies 0x00549580)",
      order: ["owner+0x568 == 1 objective rectangle", "owner+0x564 == 1 title rectangle"],
      titleText: "FUN_004a89e0 writes TITLE text to a DAT_0054927c HDC and sets owner+0x564",
      objectiveText: "FUN_004a88f0 writes OBJECTIVE text to the same scratch surface and sets owner+0x568",
      spriteConsumer: "no structured reference or direct field read from owner+0xc14 into FUN_004a84e0 or another observed draw consumer; actual CHANGETITLE sprite compositor remains unresolved",
    },
    teardown: {
      entry: "FUN_00482010 invokes FUN_004823d0, frees record payloads, then FUN_00483050 releases owner+0xc14 and zeroes it",
      overlayClearOrder: ["FUN_004a8ac0 objective clear and +0x568=0", "FUN_004a8ae0 title clear and +0x564=0"],
      shutdownDelay: "FUN_004823d0 calls Sleep(1000) after resource cleanup",
    },
    k0110: { preFirstSpeech, changeTitleCount: preFirstSpeech.filter(({ command }) => command === "CHANGETITLE").length, titleSources: preFirstSpeech.filter(({ command }) => command === "CHANGETITLE").map(({ args: [path] }) => path) },
    excludedScope: ["outer update cadence and wall-clock sprite duration", "actual title sprite draw consumer (no static edge found)", "runtime VM/dynamic probes", "production port or B02 cadence"],
  };
}

export function reproduceChangeTitleLifecycle({ initialImage = null, operations = [] } = {}) {
  if (initialImage !== null && typeof initialImage !== "string") throw new TypeError("initialImage must be a string or null");
  if (!Array.isArray(operations)) throw new TypeError("operations must be an array");
  let image = initialImage;
  const events = [];
  for (const [index, operation] of operations.entries()) {
    if (!operation || typeof operation !== "object") throw new TypeError(`operations[${index}] must be an object`);
    const path = operation.path;
    if (typeof path !== "string") throw new TypeError(`operations[${index}].path must be a string`);
    const loadResult = operation.loadResult;
    if (loadResult !== "success" && loadResult !== "failure") throw new TypeError(`operations[${index}].loadResult must be success or failure`);
    const released = image !== null;
    image = null;
    if (loadResult === "success" && path.length > 0) image = path;
    events.push({ path, released, loaded: image === path && loadResult === "success" && path.length > 0, recordAccepted: true, imageAfter: image });
  }
  return { events, finalImage: image, ownerImageField: image === null ? 0 : 1 };
}

export function reproduceDirectTitleLoadGate({ existingImage = null, path = "", loadResult = "failure" } = {}) {
  if (existingImage !== null && typeof existingImage !== "string") throw new TypeError("existingImage must be a string or null");
  if (typeof path !== "string") throw new TypeError("path must be a string");
  if (loadResult !== "success" && loadResult !== "failure") throw new TypeError("loadResult must be success or failure");
  if (existingImage !== null) return { branch: "already-allocated-memory", imageAfter: existingImage, returnValue: 1 };
  const loaded = loadResult === "success" && path.length > 0;
  return { branch: loaded ? "load-success" : "load-failure", imageAfter: loaded ? path : null, returnValue: 1 };
}

export function reproduceChangeTitleTeardown({ image = null, objectiveActive = 0, titleActive = 0 } = {}) {
  if (image !== null && typeof image !== "string") throw new TypeError("image must be a string or null");
  if (![0, 1].includes(objectiveActive) || ![0, 1].includes(titleActive)) throw new RangeError("overlay flags must be 0 or 1");
  return { releasedImage: image !== null, imageAfter: null, objectiveAfter: 0, titleAfter: 0, overlayClearOrder: ["objective", "title"] };
}

function parseScript(text) {
  const commands = [];
  for (const [lineIndex, line] of text.split(/\r?\n/u).entries()) {
    const tokens = [...line.matchAll(/\[([^\]]*)\]/gu)].map((match) => match[1]);
    for (let cursor = 0; cursor < tokens.length;) {
      const command = tokens[cursor].toUpperCase();
      const count = COMMAND_ARG_COUNTS[command];
      if (count === undefined) { cursor += 1; continue; }
      const args = tokens.slice(cursor + 1, cursor + count + 1);
      if (args.length !== count) throw new Error(`K0110 line ${lineIndex + 1}: ${command} is missing an argument`);
      commands.push({ line: lineIndex + 1, command, args });
      cursor += count + 1;
    }
  }
  return commands;
}

function verifyK0110Prelude(prelude) {
  const expected = [["CHANGEMUSIC", ["music\\briefmusic.yav"]], ["CHANGETITLE", ["ybriefingfnt\\k01\\k01.spr"]], ["SETDELAYTIME", ["500"]]];
  for (let index = 1; index <= 11; index += 1) expected.push(["CHANGETITLE", [`ybriefingfnt\\K01\\k01${String(index).padStart(2, "0")}.spr`]], ["SETDELAYTIME", ["15"]]);
  expected.push(["TITLE", ["1. 불안한 전운"]], ["OBJECTIVE", ["1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)", ""]], ["SETDELAYTIME", ["100"]]);
  assertEqual(JSON.stringify(prelude.map(({ command, args }) => [command, args])), JSON.stringify(expected), "K0110 CHANGETITLE prelude");
}

function verifyFunctionCatalog(functions) {
  if (!Array.isArray(functions.functions)) throw new TypeError("functions.json must contain a functions array");
  return FUNCTION_CATALOG.map((expected) => {
    const actual = functions.functions.find((candidate) => candidate.entry === expected.entry);
    if (!actual) throw new Error(`functions.json is missing ${expected.entry}`);
    for (const field of ["bodySize", "instructionCount", "instructionSha256"]) assertEqual(actual[field], expected[field], `${expected.entry} ${field}`);
    assertEqual(actual.bodyRanges?.length, 1, `${expected.entry} body range count`);
    assertEqual(actual.bodyRanges[0], expected.bodyRange, `${expected.entry} body range`);
    return expected;
  });
}

function verifyReferenceProjection(references, expected) {
  if (!Array.isArray(references.references)) throw new TypeError("references.json must contain a references array");
  const projection = references.references.filter((reference) => reference.fromFunctionEntry === expected.fromFunctionEntry).map(({ from, to, type, fromFunctionEntry }) => ({ from, to, type, fromFunctionEntry })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assertEqual(projection.length, expected.count, `${expected.label} count`);
  const digest = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
  assertEqual(digest, expected.digest, `${expected.label} SHA-256`);
  return { ...expected, sha256: digest, references: projection };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) console.log(JSON.stringify(extractChangeTitleConsumerEvidence(), null, 2));
