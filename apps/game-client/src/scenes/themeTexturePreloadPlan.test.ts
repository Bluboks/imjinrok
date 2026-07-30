import assert from "node:assert/strict";
import test from "node:test";
import { defaultTheme, getThemeFrameRefs } from "@shared";
import { getMissingThemeTextureLoadRequests } from "./themeTexturePreloadPlan";

test("includes every missing default-theme texture in the Skirmish preload phase", () => {
  const frameRefs = getThemeFrameRefs(defaultTheme);
  const requests = getMissingThemeTextureLoadRequests(defaultTheme, frameRefs, () => false);

  assert.deepEqual(
    requests.map((request) => request.frame.textureKey),
    frameRefs.map(({ frame }) => frame.textureKey),
  );
  assert.equal(new Set(requests.map((request) => request.frame.textureKey)).size, requests.length);
});

test("builds the deterministic Skirmish preload plan from missing unique texture keys", () => {
  const [first, second] = getThemeFrameRefs(defaultTheme);
  assert.ok(first);
  assert.ok(second);

  const requests = getMissingThemeTextureLoadRequests(
    defaultTheme,
    [first, first, second],
    (textureKey) => textureKey === second.frame.textureKey,
  );

  assert.deepEqual(
    requests.map((request) => ({ textureKey: request.frame.textureKey, url: request.url })),
    [{
      textureKey: first.frame.textureKey,
      url: `${defaultTheme.assetRoot}/${first.visual.assetPath}/${first.frame.fileName ?? `${first.frame.textureKey}.png`}`,
    }],
  );
});

test("retains a failed preload texture in the create-time retry plan until Phaser reports it loaded", () => {
  const [retryable, alreadyLoaded] = getThemeFrameRefs(defaultTheme);
  assert.ok(retryable);
  assert.ok(alreadyLoaded);

  const initiallyQueued = getMissingThemeTextureLoadRequests(
    defaultTheme,
    [retryable, alreadyLoaded],
    (textureKey) => textureKey === alreadyLoaded.frame.textureKey,
  );
  assert.deepEqual(initiallyQueued.map((request) => request.frame.textureKey), [retryable.frame.textureKey]);

  const retryAfterFailure = getMissingThemeTextureLoadRequests(
    defaultTheme,
    [retryable, alreadyLoaded],
    (textureKey) => textureKey === alreadyLoaded.frame.textureKey,
  );
  assert.deepEqual(retryAfterFailure.map((request) => request.frame.textureKey), [retryable.frame.textureKey]);

  const noRetryAfterSuccess = getMissingThemeTextureLoadRequests(
    defaultTheme,
    [retryable, alreadyLoaded],
    () => true,
  );
  assert.deepEqual(noRetryAfterSuccess, []);
});
