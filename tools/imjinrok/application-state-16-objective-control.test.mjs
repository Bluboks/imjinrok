import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  EXPECTED_BUTTONS201_SHA256,
  EXPECTED_EXECUTABLE_SHA256,
  EXPECTED_GAME_MENU_BORDER_SHA256,
  extractApplicationState16ObjectiveControl,
  reproduceApplicationState16Transition,
  reproduceEscapeOpenRequest,
  reproduceGameplayPanelOpenRequest,
  reproduceObjectiveControlInitialization,
  reproduceObjectiveControlUpdate,
} from "./extract-application-state-16-objective-control.mjs";
import { readJson } from "./static-evidence.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const fixturePath = join(
  repositoryRoot,
  "analysis/fixtures/application-state-16-objective-control-vectors.json",
);
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const buttons201Path = join(
  repositoryRoot,
  "original/imjinrok2/yfnt/buttons201.spr",
);
const gameMenuBorderPath = join(
  repositoryRoot,
  "original/imjinrok2/yfnt/gamemenuborder.spr",
);
const seedsPath = join(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const referencesPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/references.json",
);

const fixture = readJson(fixturePath);

test("extractor binds the report and vectors to exact original inputs", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.equal(fixture.sourceButtons201Sha256, EXPECTED_BUTTONS201_SHA256);
  assert.equal(
    fixture.sourceGameMenuBorderSha256,
    EXPECTED_GAME_MENU_BORDER_SHA256,
  );

  const report = extractApplicationState16ObjectiveControl({
    executablePath,
    buttonSpritePath: buttons201Path,
    menuBorderSpritePath: gameMenuBorderPath,
    seedsPath,
    referencesPath,
  });

  assert.equal(report.analysisStatus, "static-confirmed");
  assert.equal(report.reproductionStatus, "reproduction-complete");
  assert.equal(report.implementationStatus, "analysis-only; no client scene integration");
  assert.equal(report.functions.length, 25);
  assert.equal(report.rawCodeRanges.length, 3);
  assert.equal(report.evidencePoints.length, 27);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(report.referenceSets).map(([address, set]) => [
        address,
        set.count,
      ]),
    ),
    {
      "0x004bdfc8": 90,
      "0x00c06e30": 8,
      "0x005527b0": 7,
      "0x00529428": 12,
    },
  );
  assert.deepEqual(report.objectiveControl.rectangle, {
    left: 264,
    top: 110,
    right: 376,
    bottom: 138,
    width: 112,
    height: 28,
  });
  assert.deepEqual(report.gameplayPanel.rectangle, {
    left: 138,
    top: 457,
    right: 166,
    bottom: 472,
    width: 28,
    height: 15,
  });
  assert.equal(report.sources.buttons201.embeddedPath, "yfnt\\buttons201.spr");
  assert.equal(
    report.sources.gameMenuBorder.embeddedPath,
    "yfnt\\gamemenuborder.spr",
  );
  assert.match(report.staticOnlyScope[0], /runtime SPR loader failure/);
  assert.match(report.applicationState.caveat, /indirect memory writes/);
});

test("all reproduction vectors compare complete observable results", async (t) => {
  const groups = [
    ["escapeVectors", reproduceEscapeOpenRequest],
    ["gameplayPanelVectors", reproduceGameplayPanelOpenRequest],
    ["applicationTransitionVectors", reproduceApplicationState16Transition],
    ["initializationVectors", reproduceObjectiveControlInitialization],
    ["objectiveControlVectors", reproduceObjectiveControlUpdate],
  ];

  for (const [groupName, reproduce] of groups) {
    for (const vector of fixture[groupName]) {
      await t.test(`${groupName}: ${vector.id}`, () => {
        assert.deepEqual(reproduce(vector.input), vector.expected);
      });
    }
  }
});

test("K01 vectors connect request, state transition, mode, and objective activation", () => {
  const escape = vectorById(fixture.escapeVectors, "successful-VK_ESCAPE-request");
  const transition = reproduceApplicationState16Transition({
    openRequestValue: reproduceEscapeOpenRequest(escape.input).nextOpenRequestValue,
    applicationState: 3,
  });
  const initialized = reproduceObjectiveControlInitialization(
    vectorById(
      fixture.initializationVectors,
      "K01-mode-one-objective-control-active",
    ).input,
  );
  const released = reproduceObjectiveControlUpdate(
    vectorById(
      fixture.objectiveControlVectors,
      "release-inside-produces-0x3f0",
    ).input,
  );

  assert.deepEqual(
    {
      applicationState: transition.nextApplicationState,
      mode: initialized.mode,
      active: initialized.active,
      ownerState: released.ownerStateAfterReturnWrite,
    },
    { applicationState: 0x16, mode: 1, active: true, ownerState: 0x3f0 },
  );
});

test("mode zero preserves constructor-initialized active fields without a setter event", () => {
  const modeZero = reproduceObjectiveControlInitialization(
    vectorById(
      fixture.initializationVectors,
      "mode-zero-keeps-initial-active-state",
    ).input,
  );

  assert.equal(modeZero.active, true);
  assert.deepEqual(modeZero.events, [
    "select-common-ui-mode-0",
    "preserve-constructor-initialized-active-objective-control",
  ]);
  assert.equal(modeZero.events.includes("activate-objective-control"), false);
});

test("extractor is deterministic across independent runs", () => {
  const input = {
    executablePath,
    buttonSpritePath: buttons201Path,
    menuBorderSpritePath: gameMenuBorderPath,
    seedsPath,
    referencesPath,
  };

  assert.deepEqual(
    extractApplicationState16ObjectiveControl(input),
    extractApplicationState16ObjectiveControl(input),
  );
});

test("reproduction models reject invalid field widths and types", () => {
  assert.throws(
    () =>
      reproduceEscapeOpenRequest({
        message: -1,
        virtualKey: 0x1b,
        openRequestValue: 0,
        applicationState: 3,
        gameTime: 4,
        scriptBusy: false,
      }),
    /message must be an unsigned DWORD/,
  );
  assert.throws(
    () =>
      reproduceObjectiveControlUpdate({
        ...fixture.objectiveControlVectors[0].input,
        active: 1,
      }),
    /active must be boolean/,
  );
  assert.throws(
    () =>
      reproduceGameplayPanelOpenRequest({
        ...fixture.gameplayPanelVectors[0].input,
        pointerX: 0x8000,
      }),
    /pointerX must be a signed WORD/,
  );
});

test("extractor rejects altered executable and resource inputs", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-app-state-16-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const alteredExecutable = copyAndAlter(executablePath, directory, "altered.exe");
  assert.throws(
    () => extractApplicationState16ObjectiveControl({ executablePath: alteredExecutable }),
    /SHA-256 mismatch/,
  );

  const alteredButtons = copyAndAlter(buttons201Path, directory, "buttons201.spr");
  assert.throws(
    () =>
      extractApplicationState16ObjectiveControl({
        buttonSpritePath: alteredButtons,
      }),
    /SHA-256 mismatch/,
  );

  const alteredBorder = copyAndAlter(
    gameMenuBorderPath,
    directory,
    "gamemenuborder.spr",
  );
  assert.throws(
    () =>
      extractApplicationState16ObjectiveControl({
        menuBorderSpritePath: alteredBorder,
      }),
    /SHA-256 mismatch/,
  );
});

test("extractor rejects generated evidence with a stale source hash", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-app-state-16-seeds-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredSeedsPath = join(directory, "seeds.json");
  const seeds = JSON.parse(readFileSync(seedsPath, "utf8"));
  seeds.sourceSha256 = "0".repeat(64);
  writeFileSync(alteredSeedsPath, `${JSON.stringify(seeds, null, 2)}\n`);

  assert.throws(
    () =>
      extractApplicationState16ObjectiveControl({
        seedsPath: alteredSeedsPath,
      }),
    /source SHA-256 mismatch/,
  );
});

function vectorById(vectors, id) {
  const vector = vectors.find((candidate) => candidate.id === id);
  assert.ok(vector, `missing vector ${id}`);
  return vector;
}

function copyAndAlter(source, directory, name) {
  const destination = join(directory, name);
  copyFileSync(source, destination);
  const buffer = readFileSync(destination);
  buffer[buffer.length - 1] ^= 0xff;
  writeFileSync(destination, buffer);
  return destination;
}
