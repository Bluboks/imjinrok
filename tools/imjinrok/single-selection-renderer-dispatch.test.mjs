import assert from "node:assert/strict";
import { closeSync, copyFileSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_EXECUTABLE_SHA256,
  extractSingleSelectionRendererDispatch,
  reproduceSingleSelectionRendererDispatch,
} from "./extract-single-selection-renderer-dispatch.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const executablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const functionsPath = join(repositoryRoot, "analysis/generated/imjinrok2/functions.json");
const referencesPath = join(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const fixture = JSON.parse(readFileSync(
  join(repositoryRoot, "analysis/fixtures/single-selection-renderer-dispatch-vectors.json"),
  "utf8",
));

test("binds the exact-one caller and selected renderer to complete source artifacts", () => {
  assert.equal(fixture.sourceExecutableSha256, EXPECTED_EXECUTABLE_SHA256);
  const report = extractSingleSelectionRendererDispatch({ executablePath, functionsPath, referencesPath });

  assert.equal(report.analysisStatus, "static-confirmed-for-single-selection-renderer-dispatch");
  assert.equal(report.reproductionStatus, "reproduction-complete-for-bounded-lock-and-call-order");
  assert.deepEqual(report.commandRenderer, {
    entry: "0x0045ad90",
    bodyRange: "0x0045ad90-0x0045b39e",
    instructionCount: 458,
    instructionSha256: "7a994e241299d22b0ea3dd79f23805885fe369986236e0d59d4bbf3e5c96c430",
  });
  assert.deepEqual(report.selectedRenderer, {
    entry: "0x00421390",
    bodyRange: "0x00421390-0x004213fb",
    instructionCount: 35,
    instructionSha256: "42b9f50cb822fdf2dc6943f38f719cd4d651840e289b22dc76424c236188f7d1",
  });
  assert.deepEqual(report.dispatch, {
    caller: "FUN_0045ad90",
    callsite: "0x0045adcd",
    callee: "FUN_00421390",
    incomingCallCount: 1,
    selectedArgument: "the caller-derived DWORD pushed at 0x0045adbf; FUN_00421390 passes it to lock, successful unlock, and final helper",
    receiver: "ECX owner; its semantic type remains opaque",
  });
  assert.equal(report.referenceSets.find((entry) => entry.label === "sole exact-one incoming call")?.count, 1);
  assert.match(report.unresolvedBoundary, /semantic contents/u);
});

test("reproduces every bounded lock and flag vector as a full ordered result", () => {
  for (const vector of fixture.vectors) {
    assert.deepEqual(reproduceSingleSelectionRendererDispatch(vector.input), vector.expected, vector.id);
  }
});

test("does not inspect success-only fields after a non-one lock result", () => {
  assert.deepEqual(
    reproduceSingleSelectionRendererDispatch({ selectedArgument: 1, lockResult: 2, layoutWord: -1, ownerFlags: -1 }),
    {
      selectedArgument: 1,
      lockResult: 2,
      operations: [
        { type: "call", function: "FUN_0044abb0", receiver: "DAT_00559418", selectedArgument: 1 },
        { type: "call", function: "FUN_00421550", receiver: "owner", selectedArgument: 1 },
      ],
    },
  );
});

test("rejects malformed reached original-width fields", () => {
  assert.throws(
    () => reproduceSingleSelectionRendererDispatch({ selectedArgument: -1, lockResult: 0 }),
    /selectedArgument must be an unsigned original DWORD/u,
  );
  assert.throws(
    () => reproduceSingleSelectionRendererDispatch({ selectedArgument: 1, lockResult: 1, layoutWord: 0x1_0000, ownerFlags: 0 }),
    /layoutWord must be an unsigned original WORD/u,
  );
  assert.throws(
    () => reproduceSingleSelectionRendererDispatch({ selectedArgument: 1, lockResult: 1, layoutWord: 1, ownerFlags: -1 }),
    /ownerFlags must be an unsigned original DWORD/u,
  );
});

test("rejects altered executable and stale generated evidence", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "imjinrok-selected-renderer-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const alteredExecutablePath = join(directory, "imjinrok2.exe");
  const staleFunctionsPath = join(directory, "functions.json");
  const staleReferencesPath = join(directory, "references.json");
  copyFileSync(executablePath, alteredExecutablePath);
  const descriptor = openSync(alteredExecutablePath, "r+");
  try {
    writeSync(descriptor, Buffer.from([0]), 0, 1, 0x00421390 - 0x00400000);
  } finally {
    closeSync(descriptor);
  }
  writeFileSync(staleFunctionsPath, JSON.stringify({ sourceSha256: "0".repeat(64), functions: [] }));
  writeFileSync(staleReferencesPath, JSON.stringify({ sourceSha256: "0".repeat(64), references: [] }));

  assert.throws(
    () => extractSingleSelectionRendererDispatch({ executablePath: alteredExecutablePath, functionsPath, referencesPath }),
    /imjinrok2\.exe SHA-256 mismatch/u,
  );
  assert.throws(
    () => extractSingleSelectionRendererDispatch({ executablePath, functionsPath: staleFunctionsPath, referencesPath }),
    /functions\.json SHA-256 mismatch/u,
  );
  assert.throws(
    () => extractSingleSelectionRendererDispatch({ executablePath, functionsPath, referencesPath: staleReferencesPath }),
    /references\.json SHA-256 mismatch/u,
  );
});
