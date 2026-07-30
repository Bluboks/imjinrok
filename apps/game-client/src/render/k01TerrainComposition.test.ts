import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
const sceneSource = readFileSync(scenePath, "utf8");

test("K01 source tiles and their fog base receive a terrain-footprint underlay before alpha artwork", () => {
  const terrainBranch = sceneSource.match(/  private redrawTerrain\(\): void \{[\s\S]*?(?=\n  private redrawElevationOverlay)/u)?.[0];
  const fogBranch = sceneSource.match(/  private drawBaseFogTile\([\s\S]*?(?=\n  private drawFallbackFogTile)/u)?.[0];

  assert.ok(terrainBranch, "terrain source visual branch must exist");
  assert.ok(fogBranch, "explicit fog base branch must exist");
  assert.ok(terrainBranch.indexOf("this.drawExplicitTileVisual(renderTexture, { minX, minY }, explicitUnderlay") < terrainBranch.lastIndexOf("this.drawExplicitTileVisual(renderTexture, { minX, minY }, explicitVisual"));
  assert.ok(fogBranch.indexOf("this.drawExplicitTileFog(renderTexture, bounds, explicitUnderlay") < fogBranch.lastIndexOf("this.drawExplicitTileFog(renderTexture, bounds, explicitVisual"));
  assert.match(sceneSource, /resolveExplicitTileUnderlayVisual\(CONTENT_REGISTRY, this\.map, tile\)/u, "chunk bounds must include the same explicit underlay contract");
});
