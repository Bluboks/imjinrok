import assert from "node:assert/strict";
import test from "node:test";
import { resolveGameClientAssetUrl } from "./assetUrl.js";

test("resolves root and relative public assets under a Pages base path", () => {
  assert.equal(
    resolveGameClientAssetUrl("/assets/audio/menu/menumusic.wav", "/imjinrok/"),
    "/imjinrok/assets/audio/menu/menumusic.wav",
  );
  assert.equal(
    resolveGameClientAssetUrl("assets/themes/default/ui/title.png", "/imjinrok/"),
    "/imjinrok/assets/themes/default/ui/title.png",
  );
});

test("keeps root development paths and already based paths stable", () => {
  assert.equal(resolveGameClientAssetUrl("/assets/ui/title.png", "/"), "/assets/ui/title.png");
  assert.equal(resolveGameClientAssetUrl("/imjinrok/assets/ui/title.png", "/imjinrok/"), "/imjinrok/assets/ui/title.png");
  assert.equal(resolveGameClientAssetUrl("/imjinrok", "/imjinrok/"), "/imjinrok/");
});

test("leaves external, data, blob, and protocol-relative URLs unchanged", () => {
  const absoluteAssetUrl = new URL("/assets/ui/title.png", "https://example.test").toString();
  for (const assetPath of [
    absoluteAssetUrl,
    "https://cdn.example.test/title.png",
    "data:image/png;base64,AAAA",
    "blob:https://example.test/asset-id",
    "//cdn.example.test/title.png",
  ]) {
    assert.equal(resolveGameClientAssetUrl(assetPath, "/imjinrok/"), assetPath);
  }
});
