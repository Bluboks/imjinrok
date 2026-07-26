import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANIMATION_STATIC_EVIDENCE,
  DRAW_RUNTIME_BREAKPOINTS,
  extractAnimationStaticEvidence,
} from "./extract-animation-evidence.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const originalExecutablePath = join(repositoryRoot, "original/imjinrok2/imjinrok2.exe");

test("original executable contains sprite draw-path and slot/frame evidence bytes", () => {
  const report = extractAnimationStaticEvidence(originalExecutablePath);
  const mismatches = report.evidencePoints.filter((point) => !point.matched);

  assert.deepEqual(mismatches, []);
  assert.equal(report.imageBase, "0x00400000");
  assert.equal(report.evidencePoints.length, ANIMATION_STATIC_EVIDENCE.length);
  assert.deepEqual(report.runtimeBreakpoints, DRAW_RUNTIME_BREAKPOINTS.map((breakpoint) => toHex(breakpoint)));

  const evidenceById = new Map(report.evidencePoints.map((point) => [point.id, point]));
  assert.equal(evidenceById.get("draw-frame-index-read")?.va, "0x0040179f");
  assert.equal(evidenceById.get("draw-frame-pointer-lookup")?.va, "0x004017bc");
  assert.equal(evidenceById.get("frame-setter-primary-switch")?.category, "sprite-slot-setter-candidate");
  assert.equal(evidenceById.get("action-slot-registration-write")?.category, "action-slot-registration");
  assert.equal(evidenceById.get("frame-debug-format-string")?.actualBytes, "74 79 70 65 3a 25 64 20 66 72 61 6d 65 3a 25 64 00");
  assert.equal(evidenceById.get("frame-debug-format-xref")?.category, "built-in-frame-debug-candidate");
});

function toHex(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}
