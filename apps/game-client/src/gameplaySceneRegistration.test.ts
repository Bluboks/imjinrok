import assert from "node:assert/strict";
import test from "node:test";
import {
  GameplaySceneLoadController,
  registerGameplaySceneBundle,
  type GameplaySceneRegistrationPort,
} from "./gameplaySceneRegistration.js";
import type { GameLaunchContext } from "./session.js";

class RecordingRegistrationPort implements GameplaySceneRegistrationPort<string> {
  readonly keys = new Set<string>();
  readonly added: Array<{ key: string; scene: string }> = [];

  hasScene(key: string): boolean {
    return this.keys.has(key);
  }

  addScene(key: string, scene: string): void {
    this.keys.add(key);
    this.added.push({ key, scene });
  }
}

const context: GameLaunchContext = {
  entryMode: "singleplayer",
  connectionMode: "local",
  scenarioType: "skirmish",
  session: null,
  serverOnline: false,
};

test("gameplay scene registration adds each missing scene once", () => {
  const registration = new RecordingRegistrationPort();

  registerGameplaySceneBundle(registration, { skirmish: "skirmish-scene", ui: "ui-scene" });
  registerGameplaySceneBundle(registration, { skirmish: "replacement-skirmish", ui: "replacement-ui" });

  assert.deepEqual(registration.added, [
    { key: "skirmish", scene: "skirmish-scene" },
    { key: "ui", scene: "ui-scene" },
  ]);
});

test("duplicate gameplay load intent shares one import and launches once", async () => {
  const registration = new RecordingRegistrationPort();
  const controller = new GameplaySceneLoadController();
  let resolveBundle: ((bundle: { skirmish: string; ui: string }) => void) | undefined;
  let imports = 0;
  const pendingBundle = new Promise<{ skirmish: string; ui: string }>((resolve) => {
    resolveBundle = resolve;
  });
  const launches: GameLaunchContext[] = [];

  const firstLoad = controller.load(context, () => {
    imports += 1;
    return pendingBundle;
  }, registration, (launchContext) => launches.push(launchContext));
  const duplicateLoad = controller.load(context, () => {
    imports += 1;
    return pendingBundle;
  }, registration, (launchContext) => launches.push(launchContext));

  assert.strictEqual(duplicateLoad, firstLoad);
  assert.equal(controller.getState(), "loading");
  assert.equal(imports, 0, "the import is scheduled after the request state is captured");

  resolveBundle?.({ skirmish: "skirmish-scene", ui: "ui-scene" });
  await firstLoad;

  assert.equal(imports, 1);
  assert.equal(controller.getState(), "ready");
  assert.deepEqual(launches, [context]);
  assert.deepEqual(registration.added, [
    { key: "skirmish", scene: "skirmish-scene" },
    { key: "ui", scene: "ui-scene" },
  ]);
});

test("a failed gameplay import records failure and can be retried", async () => {
  const registration = new RecordingRegistrationPort();
  const controller = new GameplaySceneLoadController();
  const failure = new Error("chunk unavailable");

  await assert.rejects(
    controller.load(context, async () => { throw failure; }, registration, () => assert.fail("must not launch")),
    failure,
  );

  assert.equal(controller.getState(), "failed");
  await controller.load(context, async () => ({ skirmish: "skirmish-scene", ui: "ui-scene" }), registration, () => undefined);
  assert.equal(controller.getState(), "ready");
});
