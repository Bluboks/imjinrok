import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  UI_DOMAIN_ACTION_REQUESTED_EVENT,
  type UiDomainActionRequestedView,
} from "../hud.js";
import {
  emitK01ObjectiveModalActionRequest,
  K01_SCENARIO_ID,
  ObjectiveModalActionBridge,
  ObjectiveModalRequestState,
  resolveK01ObjectiveModalActionCandidate,
  type UiDomainActionEventBus,
} from "./objectiveModalActionBridge.js";
import {
  createK01OpenObjectiveModalAction,
  K01_OBJECTIVE_ID,
  type UiDomainAction,
  type K01OpenObjectiveModalAction,
} from "./objectiveModalActions.js";

interface DispatcherVector {
  readonly id: string;
  readonly expected: {
    readonly consumedActions: readonly {
      readonly type: string;
    }[];
  };
}

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(sourceDirectory, "../../../..");
const dispatcherVectors = (
  JSON.parse(
    readFileSync(
      resolve(
        repositoryRoot,
        "analysis/fixtures/objective-pending-action-dispatch-vectors.json",
      ),
      "utf8",
    ),
  ) as { dispatcherVectors: DispatcherVector[] }
).dispatcherVectors;

class FakeUiDomainActionEventBus implements UiDomainActionEventBus {
  private readonly listeners = new Set<
    (action: unknown) => void
  >();

  on(
    event: typeof UI_DOMAIN_ACTION_REQUESTED_EVENT,
    listener: (action: unknown) => void,
  ): void {
    assert.equal(event, UI_DOMAIN_ACTION_REQUESTED_EVENT);
    this.listeners.add(listener);
  }

  off(
    event: typeof UI_DOMAIN_ACTION_REQUESTED_EVENT,
    listener: (action: unknown) => void,
  ): void {
    assert.equal(event, UI_DOMAIN_ACTION_REQUESTED_EVENT);
    this.listeners.delete(listener);
  }

  emit(
    event: typeof UI_DOMAIN_ACTION_REQUESTED_EVENT,
    action: UiDomainActionRequestedView,
  ): void {
    assert.equal(event, UI_DOMAIN_ACTION_REQUESTED_EVENT);
    for (const listener of [...this.listeners]) {
      listener(action);
    }
  }

  emitRaw(action: unknown): void {
    for (const listener of [...this.listeners]) {
      listener(action);
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

test("selects only the existing project-owned K01 objective producer", () => {
  assert.deepEqual(
    resolveK01ObjectiveModalActionCandidate({
      scenarioId: K01_SCENARIO_ID,
      interactionEnabled: true,
      objectiveIds: [K01_OBJECTIVE_ID],
    }),
    createK01OpenObjectiveModalAction(),
  );
  assert.equal(
    resolveK01ObjectiveModalActionCandidate({
      scenarioId: "imjinrok-k02",
      interactionEnabled: true,
      objectiveIds: [K01_OBJECTIVE_ID],
    }),
    null,
  );
  assert.equal(
    resolveK01ObjectiveModalActionCandidate({
      scenarioId: K01_SCENARIO_ID,
      interactionEnabled: true,
      objectiveIds: ["protect-gwon-yul"],
    }),
    null,
  );
  assert.equal(
    resolveK01ObjectiveModalActionCandidate({
      scenarioId: K01_SCENARIO_ID,
      interactionEnabled: false,
      objectiveIds: [K01_OBJECTIVE_ID],
    }),
    null,
  );
});

test("publishes and consumes each statically confirmed open action exactly once", () => {
  const originalOpenVectors = dispatcherVectors.filter(
    (vector) => vector.expected.consumedActions.length > 0,
  );
  assert.ok(originalOpenVectors.length > 0);

  for (const vector of originalOpenVectors) {
    assert.deepEqual(
      vector.expected.consumedActions.map((action) => action.type),
      ["open-objective-modal"],
      vector.id,
    );

    const eventBus = new FakeUiDomainActionEventBus();
    const consumed: K01OpenObjectiveModalAction[] = [];
    const bridge = new ObjectiveModalActionBridge(eventBus, (action) => {
      consumed.push(action);
    });
    bridge.start();
    bridge.start();

    emitK01ObjectiveModalActionRequest(eventBus, createK01OpenObjectiveModalAction());

    assert.equal(eventBus.listenerCount, 1, vector.id);
    assert.deepEqual(consumed, [createK01OpenObjectiveModalAction()], vector.id);
    assert.equal(bridge.pendingCount, 0, vector.id);
  }
});

test("queues reentrant and repeated requests in order without duplicate listeners", () => {
  const eventBus = new FakeUiDomainActionEventBus();
  const consumed: K01OpenObjectiveModalAction[] = [];
  let emittedReentrantRequest = false;
  const bridge = new ObjectiveModalActionBridge(eventBus, (action) => {
    consumed.push(action);
    if (!emittedReentrantRequest) {
      emittedReentrantRequest = true;
      emitK01ObjectiveModalActionRequest(eventBus, createK01OpenObjectiveModalAction());
    }
  });
  bridge.start();
  bridge.start();

  emitK01ObjectiveModalActionRequest(eventBus, createK01OpenObjectiveModalAction());
  emitK01ObjectiveModalActionRequest(eventBus, createK01OpenObjectiveModalAction());

  assert.equal(eventBus.listenerCount, 1);
  assert.deepEqual(consumed, [
    createK01OpenObjectiveModalAction(),
    createK01OpenObjectiveModalAction(),
    createK01OpenObjectiveModalAction(),
  ]);
  assert.equal(bridge.pendingCount, 0);
});

test("activates one modal request until the UI owner closes it", () => {
  const state = new ObjectiveModalRequestState();
  const action = createK01OpenObjectiveModalAction();

  assert.equal(state.open(action), true);
  assert.deepEqual(state.active, action);
  assert.equal(state.open(createK01OpenObjectiveModalAction()), false);
  assert.deepEqual(state.active, action);

  state.close();
  assert.equal(state.active, null);
  assert.equal(state.open(createK01OpenObjectiveModalAction()), true);
});

test("shutdown drops queued work and recreation owns the only live listener", () => {
  const eventBus = new FakeUiDomainActionEventBus();
  const oldConsumed: K01OpenObjectiveModalAction[] = [];
  let oldBridge: ObjectiveModalActionBridge;
  oldBridge = new ObjectiveModalActionBridge(eventBus, (action) => {
    oldConsumed.push(action);
    emitK01ObjectiveModalActionRequest(eventBus, createK01OpenObjectiveModalAction());
    oldBridge.stop();
  });
  oldBridge.start();

  emitK01ObjectiveModalActionRequest(eventBus, createK01OpenObjectiveModalAction());

  assert.deepEqual(oldConsumed, [createK01OpenObjectiveModalAction()]);
  assert.equal(oldBridge.pendingCount, 0);
  assert.equal(eventBus.listenerCount, 0);

  const newConsumed: K01OpenObjectiveModalAction[] = [];
  const newBridge = new ObjectiveModalActionBridge(eventBus, (action) => {
    newConsumed.push(action);
  });
  newBridge.start();
  emitK01ObjectiveModalActionRequest(eventBus, createK01OpenObjectiveModalAction());

  assert.deepEqual(oldConsumed, [createK01OpenObjectiveModalAction()]);
  assert.deepEqual(newConsumed, [createK01OpenObjectiveModalAction()]);
  assert.equal(eventBus.listenerCount, 1);
});

test("rejects malformed metadata at the event boundary with field-specific errors", () => {
  const eventBus = new FakeUiDomainActionEventBus();
  const bridge = new ObjectiveModalActionBridge(eventBus, () => {});
  bridge.start();

  assert.throws(
    () =>
      eventBus.emitRaw({
        type: "open-objective-modal",
        metadata: {
          profile: "original-parity",
          objectiveId: "",
          trigger: "hud-objective-button",
        },
      }),
    /metadata\.objectiveId must be "build-beacon"/,
  );
  assert.throws(
    () =>
      emitK01ObjectiveModalActionRequest(eventBus, {
        type: "open-objective-modal",
        metadata: {
          profile: "original-parity",
          objectiveId: "build-beacon",
          trigger: "unknown",
        },
      }),
    /metadata\.trigger must be "hud-objective-button"/,
  );
});

test("ignores a legitimate unrelated UI domain action without consuming it", () => {
  const eventBus = new FakeUiDomainActionEventBus();
  const consumed: K01OpenObjectiveModalAction[] = [];
  const bridge = new ObjectiveModalActionBridge(eventBus, (action) => {
    consumed.push(action);
  });
  const extensionAction: UiDomainAction<
    "show-reinforcement-notice",
    { readonly reinforcementId: string }
  > = {
    type: "show-reinforcement-notice",
    metadata: {
      reinforcementId: "k01-reinforcement-1",
    },
  };
  bridge.start();

  assert.doesNotThrow(() => {
    eventBus.emit(UI_DOMAIN_ACTION_REQUESTED_EVENT, extensionAction);
  });
  assert.deepEqual(consumed, []);
  assert.equal(bridge.pendingCount, 0);
});
