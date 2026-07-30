import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const sceneSource = readFileSync(resolve(sourceDirectory, "../scenes/SkirmishScene.ts"), "utf8");

function getMethod(name: string, nextMethod: string): string {
  const method = sceneSource.match(new RegExp(`  private ${name}\\([\\s\\S]*?(?=\\n  private ${nextMethod})`, "u"))?.[0];

  assert.ok(method, `${name} must exist`);
  return method;
}

test("fog chunk clears before its one guarded batch and uses no per-tile RenderTexture draw", () => {
  const method = getMethod("redrawFogChunk", "drawBaseFogTile");

  assert.match(method, /renderTexture\.clear\(\);\n    runRenderTextureBatch\(renderTexture/u);
  assert.match(method, /runRenderTextureBatch\(renderTexture/u);
  assert.doesNotMatch(method, /renderTexture\.draw\(/u);
});

test("terrain and fog retain the shared ground layer beneath every elevated surface", () => {
  const terrain = getMethod("redrawTerrain", "redrawElevationOverlay");
  const fog = getMethod("redrawFogChunk", "drawBaseFogTile");

  assert.doesNotMatch(terrain, /if \(tile\.elevation > 0\) \{\s*continue;/u);
  assert.ok(
    fog.indexOf("this.drawBaseFogTile(renderTexture, bounds, textureKey, visibility, x, y, worldX, worldY);")
      < fog.indexOf("this.drawElevationFogTile(renderTexture, bounds, visibility, x, y, worldX, worldY);"),
    "fog must draw the shared ground footprint before its optional elevation layer",
  );
});

test("terrain bake, explicit tiles, and fog helpers use the guarded batch contract", () => {
  const terrain = getMethod("redrawTerrain", "redrawElevationOverlay");
  const explicitTerrain = getMethod("drawExplicitTileVisual", "createExplicitElevationOverlay");
  const explicitFog = getMethod("drawExplicitTileFog", "getExplicitTileFogStamp");
  const fogHelpers = getMethod("drawFallbackFogTile", "drawSourceFogComposite")
    + getMethod("drawSourceFogComposite", "getFogVisibilityAt")
    + getMethod("drawVisualFogFrame", "ensureFogChunkRenderTexture");

  assert.match(terrain, /runRenderTextureBatch\(renderTexture/u);
  assert.match(terrain, /TERRAIN_RENDER_CHUNK_SIZE/u);
  assert.match(explicitTerrain, /renderTexture\.batchDraw\(/u);
  assert.match(explicitFog, /renderTexture\.batchDraw\(/u);
  assert.match(fogHelpers, /renderTexture\.batchDraw\(/u);
  assert.doesNotMatch(`${terrain}\n${explicitTerrain}\n${explicitFog}\n${fogHelpers}`, /renderTexture\.draw\(/u);
});
