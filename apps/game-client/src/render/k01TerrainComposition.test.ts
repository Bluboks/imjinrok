import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scenePath = resolve(dirname(fileURLToPath(import.meta.url)), "../scenes/SkirmishScene.ts");
const sceneSource = readFileSync(scenePath, "utf8");

test("source terrain composition consumes the global raster plan before generic tile chunking", () => {
  const terrainBranch = sceneSource.match(/  private redrawTerrain\(\): void \{[\s\S]*?(?=\n  private redrawSourceTerrainRaster)/u)?.[0];
  const sourceRasterBranch = sceneSource.match(/  private redrawSourceTerrainRaster\([\s\S]*?(?=\n  private sourceTerrainRegionIntersectsVisual)/u)?.[0];
  const fogBranch = sceneSource.match(/  private drawBaseFogTile\([\s\S]*?(?=\n  private drawFallbackFogTile)/u)?.[0];

  assert.ok(terrainBranch, "terrain source raster selection must exist");
  assert.ok(sourceRasterBranch, "source terrain raster replay must exist");
  assert.ok(fogBranch, "source terrain fog base branch must exist");
  assert.ok(terrainBranch.indexOf("createSourceTerrainRasterPlan(") < terrainBranch.indexOf("for (let chunkY"), "source terrain must select its global plan before generic chunks");
  assert.ok(terrainBranch.indexOf("this.redrawSourceTerrainRaster(sourceRasterPlan,") < terrainBranch.indexOf("for (let chunkY"), "source terrain plan must bypass tile-chunk compositing");
  assert.ok(sourceRasterBranch.indexOf("renderTexture.clear();") >= 0, "each source raster region must start from a clear target");
  assert.ok(sourceRasterBranch.indexOf("plan.clearColor") > sourceRasterBranch.indexOf("renderTexture.clear();"), "source raster clear color must be applied before replay");
  assert.ok(sourceRasterBranch.indexOf("for (const region of plan.regions)") < sourceRasterBranch.indexOf("for (const point of plan.cells)"), "each output region must replay the complete global cell order");
  const coveragePass = sourceRasterBranch.indexOf("if (useCoverageUnderlay");
  const selectedPass = sourceRasterBranch.lastIndexOf("for (const point of plan.cells)");
  assert.ok(coveragePass >= 0 && selectedPass > coveragePass, "coverage must be a distinct pass before selected source frames");
  assert.ok(sourceRasterBranch.indexOf('coverage?.mode === "canonical-source-art"') >= 0, "canonical map-level coverage must be explicit");
  assert.ok(sourceRasterBranch.indexOf('coverage?.mode === "legacy-authored-underlay"') >= 0, "legacy authored underlay must remain a distinct plan branch");
  assert.ok(selectedPass < sourceRasterBranch.lastIndexOf("this.drawExplicitTileVisual(renderTexture, { minX: region.left, minY: region.top }, descriptor"), "selected source cells must draw through the global plan order");
  assert.doesNotMatch(fogBranch, /alignSourceTerrainCoverageUnderlay/u, "source fog coverage must not inherit selected-frame offsets");
});
