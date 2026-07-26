import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const reportPath = join(
  repositoryRoot,
  "analysis/generated/sprite-mapping-audit.json",
);
const report = JSON.parse(readFileSync(reportPath, "utf8"));

test("sprite mapping audit is deterministic and current", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "sprite-mapping-audit-"));
  const regeneratedPath = join(temporaryDirectory, "audit.json");
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "tools/imjinrok/audit-sprite-mappings.mjs",
      regeneratedPath,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(readFileSync(regeneratedPath, "utf8")),
    report,
  );
});

test("entity mappings stay quarantined while portraits are statically proven", () => {
  assert.deepEqual(report.summary, {
    visualCount: 16,
    unitVisualCount: 7,
    buildingVisualCount: 9,
    stateMappingCount: 50,
    clipCount: 290,
    frameReferenceCount: 1_878,
    missingFrameReferenceCount: 0,
    unverifiedVisualCount: 16,
    portraitCueCount: 17,
    unverifiedPortraitCueCount: 0,
    findingCount: 71,
  });
  assert.ok(
    report.visuals.every((visual) => visual.evidenceStatus === "unverified"),
  );
  assert.ok(
    report.portraits.cues.every(
      (cue) => cue.evidenceStatus === "static-proven",
    ),
  );
  assert.equal(report.portraits.evidenceStatus, "static-proven");
  assert.deepEqual(report.portraits.registeredSpeakerIds, [
    "K1",
    "K2",
    "K3",
    "K4",
    "K5",
    "J1",
    "J2",
    "J3",
    "J4",
    "J5",
    "C1",
    "C2",
    "C3",
    "C4",
    "C5",
    "K10",
    "K6",
  ]);
  assert.ok(
    report.portraits.originalScriptSpeakerTokens.some(
      (token) => token.speakerToken === "원균",
    ),
  );
  assert.ok(
    report.portraits.originalScriptSpeakerTokens.some(
      (token) => token.speakerToken === "이순신",
    ),
  );
  assert.deepEqual(
    Object.fromEntries(
      report.portraits.cues.map(({ portraitId, frameIndex }) => [
        portraitId,
        frameIndex,
      ]),
    ),
    {
      C1: 5,
      C2: 14,
      C3: 13,
      C4: 10,
      C5: 12,
      J1: 4,
      J2: 2,
      J3: 3,
      J4: 1,
      J5: 0,
      K1: 6,
      K10: 15,
      K2: 11,
      K3: 8,
      K4: 9,
      K5: 7,
      K6: 17,
    },
  );
  assert.ok(
    report.findings.some(
      (finding) =>
        finding.code === "distinct-state-frame-collision" &&
        finding.visualId === "japanese-gunner" &&
        finding.states.includes("attack") &&
        finding.states.includes("move"),
    ),
  );
  assert.equal(
    report.findings.filter(
      (finding) => finding.code === "building-health-frame-unverified",
    ).length,
    9,
  );
  assert.deepEqual(report.portraits.currentScenarioPortraitIds, [
    "J1",
    "K1",
    "K10",
    "K3",
  ]);
});

test("audit provenance hashes resolve to the current source files", () => {
  for (const sourceFile of report.sourceFiles) {
    assert.equal(
      sha256File(join(repositoryRoot, sourceFile.path)),
      sourceFile.sha256,
      sourceFile.path,
    );
  }
  for (const visual of report.visuals) {
    assert.equal(
      sha256File(join(repositoryRoot, visual.source.path)),
      visual.source.sha256,
      visual.source.path,
    );
    assert.equal(
      sha256File(join(repositoryRoot, visual.conversionManifest.path)),
      visual.conversionManifest.sha256,
      visual.conversionManifest.path,
    );
  }
  assert.equal(
    sha256File(join(repositoryRoot, report.portraits.source.path)),
    report.portraits.source.sha256,
    report.portraits.source.path,
  );
  assert.equal(
    sha256File(
      join(repositoryRoot, report.portraits.source.conversionManifest.path),
    ),
    report.portraits.source.conversionManifest.sha256,
    report.portraits.source.conversionManifest.path,
  );
});

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
