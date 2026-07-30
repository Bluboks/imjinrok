import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readCString, readPeImage } from "./pe-image.mjs";
import { assertEqual, readJson, requireRawOffset, sha256, verifyEvidencePoint } from "./static-evidence.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const defaultOriginalRoot = resolve(repositoryRoot, "original/imjinrok2");
const defaultExecutablePath = resolve(defaultOriginalRoot, "imjinrok2.exe");
const defaultReferencesPath = resolve(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const defaultJumpTablesPath = resolve(repositoryRoot, "analysis/generated/imjinrok2/jump-tables.json");

export const EXPECTED_EXECUTABLE_SHA256 = "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_REFERENCES_SHA256 = "f64cfa6f04bc39573552f42a8b7bdd5b08fea1ba774d05865162d1d80daaf9a5";
export const EXPECTED_JUMP_TABLES_SHA256 = "0ae517eb172f61b974ca7a4411e64c1cc42065c462ed53b3065ab2da633dfe2f";

const EVIDENCE_POINTS = [
  [0x00440553, "68 58 bb 4b 00", "FUN_00440540 supplies pal\\imjin2.pal"],
  [0x0044057a, "b9 c0 00 00 00 8d b4 24 88 00 00 00 bf b8 20 5e 00", "FUN_00440540 prepares the imjin2 copy to 0x005e20b8"],
  [0x00440590, "f3 a5", "FUN_00440540 copies the palette buffer"],
  [0x0044076f, "68 ac ba 4b 00", "FUN_00440540 supplies pal\\initmenu.pal"],
  [0x00440785, "68 48 ce bc 00", "FUN_00440540 selects 0x00bcce48 as the initmenu destination"],
  [0x0044078b, "e8 10 a9 00 00", "FUN_00440540 calls the palette loader for initmenu"],
  [0x004499c0, "68 48 ce bc 00 e8 e6 66 ff ff", "FUN_004499b0 applies the landing-title palette buffer 0x00bcce48"],
  [0x00449c9d, "bb 0e 00 00 00", "scenario selection returns target state 0x000e"],
  [0x0045fe4a, "66 a3 a0 6d c0 00 66 89 1d c8 df 4b 00", "dispatcher stores its target then enters state 0x008c"],
  [0x00460525, "e8 a6 02 fe ff 66 c7 05 c8 df 4b 00 96 00", "state 0x008c starts the fade state 0x0096"],
  [0x00460538, "e8 23 03 fe ff 3b c6", "state 0x0096 calls FUN_00440860"],
  [0x00440998, "68 b8 20 5e 00 e8 0e f7 ff ff", "FUN_00440860 applies the copied imjin2 buffer"],
  [0x0045ff36, "e8 15 e6 fd ff", "state 0x000e calls FUN_0043e550"],
  [0x0043e5ce, "e8 4d 03 00 00", "FUN_0043e550 calls FUN_0043e920"],
].map(([va, bytes, meaning]) => ({ va, bytes, meaning }));

const REQUIRED_REFERENCE_EDGES = [
  ["0x00440553", "0x004bbb58", "DATA"],
  ["0x00440586", "0x005e20b8", "DATA"],
  ["0x00440590", "0x005e20b8", "WRITE"],
  ["0x0044076f", "0x004bbaac", "DATA"],
  ["0x00440785", "0x00bcce48", "DATA"],
  ["0x0044078b", "0x0044b0a0", "UNCONDITIONAL_CALL"],
  ["0x004499c0", "0x00bcce48", "DATA"],
  ["0x0045fe4a", "0x00c06da0", "WRITE"],
  ["0x0045fe50", "0x004bdfc8", "WRITE"],
  ["0x00460525", "0x004407d0", "UNCONDITIONAL_CALL"],
  ["0x00460538", "0x00440860", "UNCONDITIONAL_CALL"],
  ["0x00440998", "0x005e20b8", "DATA"],
  ["0x0044099d", "0x004400b0", "UNCONDITIONAL_CALL"],
  ["0x0045ff36", "0x0043e550", "UNCONDITIONAL_CALL"],
  ["0x0043e5ce", "0x0043e920", "UNCONDITIONAL_CALL"],
];

const STAGE_RESOURCE_STRINGS = [
  [0x004baf08, "yfnt\\titlestartstage.spr"],
  [0x004baff8, "yfnt\\titlestartstagekorea.spr"],
  [0x004bafac, "yfnt\\titlestartstagejapan.spr"],
  [0x004baf60, "yfnt\\titlestartstagechina.spr"],
  [0x004bb044, "yfnt\\titlestartstagetoselect.spr"],
];

const STAGE_PALETTE_MENU_BUTTON_CATALOG = {
  id: "stage-palette-menu-button-catalog",
  sourcePath: "yfnt/gamemenubutton.spr",
  sha256: "ec73af9d1d5c739a8fd40fa9436a77fc92eb13f5ebb99a745d1279244129c387",
  paletteId: "imjin2",
};

export function verifyMainMenuPaletteStateVector({ originalRoot = defaultOriginalRoot, executablePath = defaultExecutablePath, referencesPath = defaultReferencesPath, jumpTablesPath = defaultJumpTablesPath } = {}) {
  const { buffer, image } = readPeImage(executablePath);
  assertEqual(sha256(buffer), EXPECTED_EXECUTABLE_SHA256, `${executablePath} SHA-256`);

  const referencesBytes = readFileSync(referencesPath);
  assertEqual(sha256(referencesBytes), EXPECTED_REFERENCES_SHA256, `${referencesPath} SHA-256`);
  const references = readJson(referencesPath);
  assertEqual(references.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${referencesPath} source SHA-256`);

  const jumpTablesBytes = readFileSync(jumpTablesPath);
  assertEqual(sha256(jumpTablesBytes), EXPECTED_JUMP_TABLES_SHA256, `${jumpTablesPath} SHA-256`);
  const jumpTables = readJson(jumpTablesPath);
  assertEqual(jumpTables.sourceSha256, EXPECTED_EXECUTABLE_SHA256, `${jumpTablesPath} source SHA-256`);

  return {
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduced",
    sources: {
      executable: { path: executablePath, sha256: EXPECTED_EXECUTABLE_SHA256 },
      references: { path: referencesPath, sha256: EXPECTED_REFERENCES_SHA256 },
      jumpTables: { path: jumpTablesPath, sha256: EXPECTED_JUMP_TABLES_SHA256 },
    },
    evidencePoints: EVIDENCE_POINTS.map((point) => verifyEvidencePoint(buffer, image, point)),
    referenceEdges: REQUIRED_REFERENCE_EDGES.map(([from, to, type]) => requireReference(references, from, to, type)),
    stateDispatch: requirePaletteStateDispatch(jumpTables),
    palettePaths: {
      landingTitle: readExpectedString(buffer, image, 0x004bbaac, "pal\\initmenu.pal"),
      stageFlow: readExpectedString(buffer, image, 0x004bbb58, "pal\\imjin2.pal"),
      stageResources: STAGE_RESOURCE_STRINGS.map(([va, expected]) => readExpectedString(buffer, image, va, expected)),
    },
    sourceAssets: {
      stagePaletteMenuButtonCatalog: verifySourceAsset(originalRoot, STAGE_PALETTE_MENU_BUTTON_CATALOG),
    },
    catalogUse: "Catalog-only: this imjin2 decode is not used for the stage Back control. Every nonempty source frame carries a mismatched label (계속, 옵션, 초기메뉴, 저장, 로드, 재시작, or 종료); frames 21-23 are empty.",
    unresolvedUseSite: "The bounded original EXE path statically confirms the country/mission screen's imjin2 palette state, but does not directly reference yfnt\\gamemenubutton.spr. No original Back-control use-site is claimed.",
  };
}

export function reproduceMainMenuPaletteSelection(input) {
  if (input?.view === "landing-title") {
    return { paletteId: "initmenu", paletteBuffer: "0x00bcce48", terminalState: "landing-title" };
  }
  if (input?.view === "country-mission-selection") {
    return {
      paletteId: "imjin2",
      paletteBuffer: "0x005e20b8",
      transitions: [
        { selectedScenarioTarget: "0x000e" },
        { state: "0x008c", targetState: "0x000e" },
        { state: "0x0096", appliesPaletteBuffer: "0x005e20b8", returnsTo: "0x000e" },
        { state: "0x000e", loads: "titlestartstage*.spr" },
      ],
    };
  }
  throw new TypeError("input.view must be 'landing-title' or 'country-mission-selection'");
}

export function createMainMenuPaletteStateFixture() {
  return {
    sourceExecutableSha256: EXPECTED_EXECUTABLE_SHA256,
    sourceReferencesSha256: EXPECTED_REFERENCES_SHA256,
    sourceJumpTablesSha256: EXPECTED_JUMP_TABLES_SHA256,
    analysisStatus: "static-confirmed",
    reproductionStatus: "reproduced",
    sourceAssets: [STAGE_PALETTE_MENU_BUTTON_CATALOG],
    vectors: [
      { id: "landing-title-uses-initmenu-buffer", input: { view: "landing-title" }, expected: reproduceMainMenuPaletteSelection({ view: "landing-title" }) },
      { id: "country-mission-selection-restores-imjin2-before-stage-sprites", input: { view: "country-mission-selection" }, expected: reproduceMainMenuPaletteSelection({ view: "country-mission-selection" }) },
    ],
  };
}

function requireReference(references, from, to, type) {
  const edge = references.references?.find((candidate) => candidate.from === from && candidate.to === to && candidate.type === type);
  if (!edge) throw new Error(`references.json is missing required ${type} edge ${from} -> ${to}`);
  return { from, to, type, fromFunctionEntry: edge.fromFunctionEntry };
}

function requirePaletteStateDispatch(jumpTables) {
  const table = jumpTables.tables?.find((candidate) => candidate.functionEntry === "0x0045f9c0" && candidate.switchAddress === "0x0046042b");
  if (!table) throw new Error("jump-tables.json is missing the main state switch at 0x0046042b");
  const fadeStart = table.cases.find((candidate) => candidate.label === 0x008c)?.destination;
  const fadeApply = table.cases.find((candidate) => candidate.label === 0x0096)?.destination;
  assertEqual(fadeStart, "0x00460525", "state 0x008c destination");
  assertEqual(fadeApply, "0x00460538", "state 0x0096 destination");
  return { switchAddress: table.switchAddress, states: [{ state: "0x008c", destination: fadeStart }, { state: "0x0096", destination: fadeApply }] };
}

function readExpectedString(buffer, image, va, expected) {
  const actual = readCString(buffer, requireRawOffset(image, va));
  assertEqual(actual, expected, `string at 0x${va.toString(16)}`);
  return { va: `0x${va.toString(16).padStart(8, "0")}`, value: actual };
}

function verifySourceAsset(originalRoot, asset) {
  const bytes = readFileSync(resolve(originalRoot, asset.sourcePath));
  assertEqual(sha256(bytes), asset.sha256, `${asset.sourcePath} SHA-256`);
  return asset;
}
