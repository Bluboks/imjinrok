import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendUiDomainAction,
  consumeNextUiDomainAction,
  createOpenObjectiveModalAction,
  type OpenObjectiveModalAction,
  type UiDomainAction,
} from "./objectiveModalActions";

interface DispatcherVector {
  id: string;
  expected: {
    consumedActions: Array<{
      type: "open-objective-modal";
      metadata: { profile: "original-parity" };
    }>;
  };
}

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(sourceDirectory, "../../../..");
const vectors = JSON.parse(
  readFileSync(
    resolve(
      repositoryRoot,
      "analysis/fixtures/objective-pending-action-dispatch-vectors.json",
    ),
    "utf8",
  ),
) as { dispatcherVectors: DispatcherVector[] };

test("represents every statically consumed objective action without original state numbers", () => {
  for (const vector of vectors.dispatcherVectors) {
    const pendingActions = vector.expected.consumedActions.map(({ metadata }) =>
      createOpenObjectiveModalAction(metadata),
    );
    const first = consumeNextUiDomainAction(pendingActions);

    assert.deepEqual(first.action, vector.expected.consumedActions[0] ?? null, vector.id);
    assert.deepEqual(
      first.remainingActions,
      vector.expected.consumedActions.slice(1),
      vector.id,
    );
  }
});

test("keeps original-parity actions and K01 extension actions in one typed channel", () => {
  type K01ExtensionAction = UiDomainAction<
    "show-k01-reinforcement-notice",
    { waveId: string; optional: boolean }
  >;
  type K01UiAction =
    | OpenObjectiveModalAction<{ profile: "original-parity"; objectiveId: string }>
    | K01ExtensionAction;

  const originalAction: K01UiAction = createOpenObjectiveModalAction<{
    profile: "original-parity";
    objectiveId: string;
  }>({ profile: "original-parity", objectiveId: "k01-primary" });
  const extensionAction: K01UiAction = {
    type: "show-k01-reinforcement-notice",
    metadata: { waveId: "k0120", optional: false },
  };
  const pending = appendUiDomainAction(
    appendUiDomainAction<K01UiAction>([], originalAction),
    extensionAction,
  );

  const first = consumeNextUiDomainAction(pending);
  const second = consumeNextUiDomainAction(first.remainingActions);
  assert.deepEqual(first.action, originalAction);
  assert.deepEqual(second.action, extensionAction);
  assert.deepEqual(second.remainingActions, []);
});

test("does not invent an action when the channel is empty", () => {
  assert.deepEqual(consumeNextUiDomainAction([]), {
    action: null,
    remainingActions: [],
  });
});
