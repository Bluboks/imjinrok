import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gameClientSrcDirectory = dirname(fileURLToPath(import.meta.url));
const resultAssetDirectory = resolve(gameClientSrcDirectory, "../public/assets/themes/default/ui/result");

test("mission result logos use source-exported win and loss animation frames", () => {
  assertSourceResultLogo("winlogo", "original/imjinrok2/yfnt/winlogo.spr");
  assertSourceResultLogo("loselogo", "original/imjinrok2/yfnt/loselogo.spr");
});

test("mission result backdrop uses the source result title screen", () => {
  const manifestPath = resolve(resultAssetDirectory, "titleresult", "titleresult.manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    source: string;
    width: number;
    height: number;
    frameCount: number;
    exportedFrames: Array<{ index: number; fileName: string }>;
  };

  assert.equal(manifest.source, "original/imjinrok2/yfnt/titleresult.spr");
  assert.equal(manifest.width, 640);
  assert.equal(manifest.height, 480);
  assert.equal(manifest.frameCount, 1);
  assert.deepEqual(manifest.exportedFrames, [{ index: 0, fileName: "titleresult_0000.png" }]);
  assert.deepEqual(
    readPngDimensions(resolve(resultAssetDirectory, "titleresult", "titleresult_0000.png")),
    { width: 640, height: 480 },
  );
});

function assertSourceResultLogo(stem: string, source: string): void {
  const manifestPath = resolve(resultAssetDirectory, stem, `${stem}.manifest.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    source: string;
    width: number;
    height: number;
    frameCount: number;
    exportedFrames: Array<{ index: number; fileName: string }>;
  };

  assert.equal(manifest.source, source);
  assert.equal(manifest.width, 250);
  assert.equal(manifest.height, 100);
  assert.equal(manifest.frameCount, 28);
  assert.equal(manifest.exportedFrames.length, 28);

  for (const frame of manifest.exportedFrames) {
    assert.equal(frame.fileName, `${stem}_${String(frame.index).padStart(4, "0")}.png`);
    const pngPath = resolve(resultAssetDirectory, stem, frame.fileName);

    assert.equal(existsSync(pngPath), true, `missing ${pngPath}`);
    assert.deepEqual(readPngDimensions(pngPath), { width: 250, height: 100 });
  }
}

function readPngDimensions(path: string): { width: number; height: number } {
  const png = readFileSync(path);
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  assert.deepEqual([...png.subarray(0, pngSignature.length)], pngSignature, `${path} should be a PNG`);

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}
