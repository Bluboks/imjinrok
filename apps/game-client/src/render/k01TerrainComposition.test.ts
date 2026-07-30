import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
const sceneSource = readFileSync(scenePath, "utf8");

test("K01 source tiles and their fog base receive a terrain-footprint underlay before alpha artwork", () => {
  const terrainBranch = sceneSource.match(/if \(explicitVisual\) \{[\s\S]*?this\.drawExplicitTileVisual\([\s\S]*?\n            \}/u)?.[0];
  const fogBranch = sceneSource.match(/if \(explicitVisual\) \{[\s\S]*?this\.drawExplicitTileFog\([\s\S]*?\n      \}/u)?.[0];

  assert.ok(terrainBranch, "terrain source visual branch must exist");
  assert.ok(fogBranch, "explicit fog base branch must exist");
  assert.ok(terrainBranch.indexOf("this.terrainTextureKeys.get(tile.terrain)!") < terrainBranch.indexOf("this.drawExplicitTileVisual"));
  assert.ok(fogBranch.indexOf("this.drawFallbackFogTile") < fogBranch.indexOf("this.drawExplicitTileFog"));
});
