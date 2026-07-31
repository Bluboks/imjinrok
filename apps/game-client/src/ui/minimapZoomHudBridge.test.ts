import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

test("minimap zoom rail uses the typed bridge, consumes UI pointers, and cleans its game listener", () => {
  const uiSource = readFileSync(resolve(sourceDirectory, "../scenes/UIScene.ts"), "utf8");
  const skirmishSource = readFileSync(resolve(sourceDirectory, "../scenes/SkirmishScene.ts"), "utf8");

  assert.match(uiSource, /const request: MinimapZoomRequestedView = \{ direction, source: "rail-button" \};/);
  assert.match(uiSource, /MINIMAP_ZOOM_REQUESTED_EVENT, request/);
  assert.match(uiSource, /event\.stopPropagation\(\);\n            this\.requestMinimapZoom\(direction\)/);
  assert.match(uiSource, /this\.minimapZoomControlZones = \{\};/);
  assert.match(skirmishSource, /on\(MINIMAP_ZOOM_REQUESTED_EVENT, this\.handleMinimapZoomRequested/);
  assert.match(skirmishSource, /off\(MINIMAP_ZOOM_REQUESTED_EVENT, this\.handleMinimapZoomRequested/);
  assert.match(skirmishSource, /this\.setCameraZoomAtScreenPoint\(this\.getBattlefieldZoomAnchor\(\), nextZoom\)/);
  assert.match(skirmishSource, /MINIMAP_VIEWPORT_REGISTRY_KEY/);
});
