import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractObjectivePanelLayoutEvidence } from "../../../tools/imjinrok/extract-objective-panel-layout-evidence.mjs";
import {
  ORIGINAL_OBJECTIVE_PANEL_FRAME_ASSET,
  isResolvedOriginalObjectiveDismissButtonHit,
  resolveOriginalObjectivePanelLayout,
  resolveOriginalObjectivePanelOwnerFrame,
  resolveOriginalObjectivePanelUpdate,
  type OriginalObjectivePanelOwnerFrame,
  type OriginalObjectivePanelUpdateInput,
  type OriginalObjectivePanelUpdateResult,
} from "./originalObjectivePanelLayout";

interface UpdateVector {
  id: string;
  input: OriginalObjectivePanelUpdateInput;
  expected: OriginalObjectivePanelUpdateResult;
}

interface OwnerVector {
  id: string;
  input: {
    ownerEnabled: number;
    state: number;
    update?: OriginalObjectivePanelUpdateInput;
    cleanupSurfaceLockSucceeded?: boolean;
  };
  expected: OriginalObjectivePanelOwnerFrame;
}

const gameClientSrcDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(gameClientSrcDirectory, "../../..");
const executablePath = resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe");
const spritePath = resolve(repositoryRoot, "original/imjinrok2/yfnt/objectiveborder.spr");
const seedsPath = resolve(repositoryRoot, "analysis/generated/imjinrok2/seeds.json");
const referencesPath = resolve(repositoryRoot, "analysis/generated/imjinrok2/references.json");
const assetDirectory = resolve(
  gameClientSrcDirectory,
  "../public/assets/themes/default/ui/objective-panel",
);
const EXPECTED_OBJECTIVE_BORDER_PNG_SHA256 =
  "e098c64d2c50d4010cdc5117080a07ee1a8c6afcfd0d13380a4aca20672e37ce";
const vectors = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "analysis/fixtures/objective-panel-layout-vectors.json"),
    "utf8",
  ),
) as { updateVectors: UpdateVector[]; ownerVectors: OwnerVector[] };
const typographyVectors = JSON.parse(
  readFileSync(
    resolve(
      repositoryRoot,
      "analysis/fixtures/objective-modal-typography-vectors.json",
    ),
    "utf8",
  ),
) as {
  layoutVectors: Array<{
    id: string;
    input: { requestedMaxWidth: number };
    expected: { effectiveMaxWidth: number };
  }>;
};

test("client rectangles exactly match the independent original-input extraction", () => {
  const report = extractObjectivePanelLayoutEvidence({
    executablePath,
    spritePath,
    seedsPath,
    referencesPath,
  });
  const resolved = resolveOriginalObjectivePanelLayout(640, 480);

  assert.deepEqual(resolved, {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    frame: toClientRect(report.layout.frame),
    content: toClientRect(report.layout.content),
    dismissButton: toClientRect(report.layout.dismissButton),
    text: {
      maxWidth: report.layout.text.maxWidth,
      firstCenterY: report.layout.text.firstCenterY,
      secondCenterY: report.layout.text.secondCenterY,
    },
  });
});

test("exports the statically bound objective-border frame at its original dimensions", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(assetDirectory, "objectiveborder.manifest.json"), "utf8"),
  ) as {
    source: string;
    width: number;
    height: number;
    frameCount: number;
    exportedFrames: Array<{ index: number; fileName: string }>;
  };

  assert.deepEqual(manifest, {
    source: "original/imjinrok2/yfnt/objectiveborder.spr",
    layout: "spr",
    width: 416,
    height: 236,
    frameCount: 1,
    exportedFrames: [{ index: 0, fileName: "objectiveborder_0000.png" }],
  });
  const pngPath = resolve(assetDirectory, manifest.exportedFrames[0].fileName);
  assert.equal(existsSync(pngPath), true);
  assert.deepEqual(readPngDimensions(pngPath), { width: 416, height: 236 });
  assert.equal(sha256(readFileSync(pngPath)), EXPECTED_OBJECTIVE_BORDER_PNG_SHA256);
  assert.equal(
    ORIGINAL_OBJECTIVE_PANEL_FRAME_ASSET,
    "assets/themes/default/ui/objective-panel/objectiveborder_0000.png",
  );
});

test("scales all original rectangles uniformly and centers the 640x480 canvas", () => {
  assert.deepEqual(resolveOriginalObjectivePanelLayout(1280, 960), {
    scale: 2,
    offsetX: 0,
    offsetY: 0,
    frame: { x: 224, y: 162, width: 832, height: 472 },
    content: { x: 316, y: 270, width: 640, height: 248 },
    dismissButton: { x: 830, y: 534, width: 160, height: 48 },
    text: {
      maxWidth: 600,
      firstCenterY: 332,
      secondCenterY: 456,
    },
  });
  assert.deepEqual(resolveOriginalObjectivePanelLayout(1280, 720), {
    scale: 1.5,
    offsetX: 160,
    offsetY: 0,
    frame: { x: 328, y: 121.5, width: 624, height: 354 },
    content: { x: 397, y: 202.5, width: 480, height: 186 },
    dismissButton: { x: 782.5, y: 400.5, width: 120, height: 36 },
    text: {
      maxWidth: 450,
      firstCenterY: 249,
      secondCenterY: 342,
    },
  });
});

test("uses the same original renderer vector for requested and effective text width", () => {
  const k01Vector = typographyVectors.layoutVectors.find(
    ({ id }) =>
      id === "k01-primary-supplied-synthetic-gdi-metrics-wrap",
  );
  assert.ok(k01Vector);

  const base = resolveOriginalObjectivePanelLayout(640, 480);
  assert.equal(k01Vector.input.requestedMaxWidth, 320);
  assert.equal(base.text.maxWidth, k01Vector.expected.effectiveMaxWidth);

  const scaled = resolveOriginalObjectivePanelLayout(1280, 960);
  assert.equal(scaled.text.maxWidth, 2 * base.text.maxWidth);
});

test("preserves strict dismiss edges after responsive scaling", () => {
  const layout = resolveOriginalObjectivePanelLayout(1280, 720);

  assert.equal(isResolvedOriginalObjectiveDismissButtonHit(layout, 782.5, 418), false);
  assert.equal(isResolvedOriginalObjectiveDismissButtonHit(layout, 902.5, 418), false);
  assert.equal(isResolvedOriginalObjectiveDismissButtonHit(layout, 842.5, 400.5), false);
  assert.equal(isResolvedOriginalObjectiveDismissButtonHit(layout, 842.5, 436.5), false);
  assert.equal(isResolvedOriginalObjectiveDismissButtonHit(layout, 782.51, 400.51), true);
  assert.equal(isResolvedOriginalObjectiveDismissButtonHit(layout, 902.49, 436.49), true);
  assert.throws(
    () => isResolvedOriginalObjectiveDismissButtonHit(layout, Number.NaN, 418),
    /pointerX must be finite/,
  );
});

test("client behavior passes the same normal, boundary, failure, and out-of-range vectors", () => {
  for (const vector of vectors.updateVectors) {
    assert.deepEqual(resolveOriginalObjectivePanelUpdate(vector.input), vector.expected, vector.id);
  }
});

test("client owner lifecycle passes every scoped display and cleanup vector", () => {
  for (const vector of vectors.ownerVectors) {
    assert.deepEqual(resolveOriginalObjectivePanelOwnerFrame(vector.input), vector.expected, vector.id);
  }
});

test("rejects invalid viewport and original-field inputs instead of inventing fallback values", () => {
  const base = vectors.updateVectors[0].input;
  assert.throws(() => resolveOriginalObjectivePanelLayout(0, 480), /viewportWidth/);
  assert.throws(() => resolveOriginalObjectivePanelLayout(640, Number.NaN), /viewportHeight/);
  assert.throws(
    () => resolveOriginalObjectivePanelUpdate({ ...base, pointerX: 32768 }),
    /pointerX must be a signed WORD/,
  );
  assert.throws(
    () => resolveOriginalObjectivePanelOwnerFrame({ ownerEnabled: 1, state: 0x3f1 }),
    /update input is required/,
  );
  assert.throws(
    () =>
      resolveOriginalObjectivePanelOwnerFrame({
        ownerEnabled: 1,
        state: 0x3f1,
        update: vectors.updateVectors[2].input,
      }),
    /cleanupSurfaceLockSucceeded is required for dismissal cleanup/,
  );
  assert.throws(
    () => resolveOriginalObjectivePanelOwnerFrame({ ownerEnabled: 1, state: 32768 }),
    /state must be a signed WORD/,
  );
});

function toClientRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function readPngDimensions(path: string): { width: number; height: number } {
  const png = readFileSync(path);
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.deepEqual([...png.subarray(0, pngSignature.length)], pngSignature);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
