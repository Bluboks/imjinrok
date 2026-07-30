import assert from "node:assert/strict";
import test from "node:test";
import { defaultTheme, getThemeFrameRefs } from "@shared";
import {
  ThemeTextureDeferredBatchQueue,
  getGameplayThemeTextureLoadPlan,
  getMissingThemeTextureLoadRequests,
} from "./themeTexturePreloadPlan";

test("partitions default-theme textures into deterministic critical and deferred gameplay tiers", () => {
  const frameRefs = getThemeFrameRefs(defaultTheme);
  const plan = getGameplayThemeTextureLoadPlan(defaultTheme, () => false);
  const plannedKeys = [...plan.critical, ...plan.deferred].map((request) => request.frame.textureKey);

  assert.deepEqual(
    [...plannedKeys].sort(),
    frameRefs.map(({ frame }) => frame.textureKey).sort(),
  );
  assert.equal(new Set(plannedKeys).size, plannedKeys.length);
  assert.ok(plan.critical.length > 0);
  assert.ok(plan.deferred.length > 0);
  assert.deepEqual(getGameplayThemeTextureLoadPlan(defaultTheme, () => false), plan);
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

test("loads deferred theme textures in bounded unique batches and retains failures for retry", () => {
  const [first, second, third] = getMissingThemeTextureLoadRequests(defaultTheme, getThemeFrameRefs(defaultTheme), () => false);
  assert.ok(first && second && third);
  const loaded = new Set<string>();
  const queue = new ThemeTextureDeferredBatchQueue([first, first, second, third], 2);

  assert.deepEqual(
    queue.takeNextBatch((textureKey) => loaded.has(textureKey)).map((request) => request.frame.textureKey),
    [first.frame.textureKey, second.frame.textureKey],
  );
  loaded.add(first.frame.textureKey);
  assert.deepEqual(
    queue.completeActiveBatch((textureKey) => loaded.has(textureKey)).map((request) => request.frame.textureKey),
    [first.frame.textureKey],
  );

  assert.deepEqual(
    queue.takeNextBatch((textureKey) => loaded.has(textureKey)).map((request) => request.frame.textureKey),
    [third.frame.textureKey],
  );
  loaded.add(third.frame.textureKey);
  queue.completeActiveBatch((textureKey) => loaded.has(textureKey));
  assert.deepEqual(queue.takeNextBatch((textureKey) => loaded.has(textureKey)), []);

  queue.retryMissing((textureKey) => loaded.has(textureKey));
  assert.deepEqual(
    queue.takeNextBatch((textureKey) => loaded.has(textureKey)).map((request) => request.frame.textureKey),
    [second.frame.textureKey],
  );
});

test("cancelling deferred loading prevents later batches and completion callbacks from producing work", () => {
  const [first] = getMissingThemeTextureLoadRequests(defaultTheme, getThemeFrameRefs(defaultTheme), () => false);
  assert.ok(first);
  const queue = new ThemeTextureDeferredBatchQueue([first]);

  queue.takeNextBatch(() => false);
  queue.cancel();

  assert.deepEqual(queue.completeActiveBatch(() => true), []);
  assert.deepEqual(queue.takeNextBatch(() => false), []);
});
