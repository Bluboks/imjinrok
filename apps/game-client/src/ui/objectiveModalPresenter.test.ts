import test from "node:test";
import assert from "node:assert/strict";
import { imjinrokK01Scenario } from "@shared";
import {
  createK01OpenObjectiveModalAction,
  K01_OBJECTIVE_ID,
} from "./objectiveModalActions.js";
import {
  K01_SCENARIO_ID,
  ObjectiveModalRequestState,
} from "./objectiveModalActionBridge.js";
import {
  OBJECTIVE_MODAL_FRAME_TEXTURE_KEY,
  ObjectiveModalPresenterController,
  openK01ObjectiveModalRequest,
  resolveK01ObjectiveModalPresentation,
  resolveObjectiveModalPresenterLayout,
  type ObjectiveModalDismissReason,
  type ObjectiveModalEscapeEvent,
  type ObjectiveModalInputOwnership,
  type ObjectiveModalPresenterHost,
  type ObjectiveModalPresenterView,
  type ObjectiveModalPresenterViewRequest,
} from "./objectiveModalPresenter.js";

const K01_PRESENTATION_SOURCE = {
  scenario: imjinrokK01Scenario,
} as const;

class FakeObjectiveModalPresenterView implements ObjectiveModalPresenterView {
  readonly layouts: ObjectiveModalPresenterViewRequest["layout"][] = [];
  destroyCount = 0;

  constructor(readonly request: ObjectiveModalPresenterViewRequest) {}

  relayout(layout: ObjectiveModalPresenterViewRequest["layout"]): void {
    this.layouts.push(layout);
  }

  destroy(): void {
    this.destroyCount += 1;
  }
}

class FakeObjectiveModalPresenterHost implements ObjectiveModalPresenterHost {
  width = 640;
  height = 480;
  textureAvailable = true;
  readonly views: FakeObjectiveModalPresenterView[] = [];
  inputOwnershipActive = false;
  inputOwnershipAcquireCount = 0;
  inputOwnershipReleaseCount = 0;
  failViewCreation = false;
  private readonly escapeListeners = new Set<
    (event: ObjectiveModalEscapeEvent) => void
  >();
  private readonly resizeListeners = new Set<() => void>();

  getViewportSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  hasTexture(textureKey: string): boolean {
    assert.equal(textureKey, OBJECTIVE_MODAL_FRAME_TEXTURE_KEY);
    return this.textureAvailable;
  }

  acquireInputOwnership(): ObjectiveModalInputOwnership {
    assert.equal(this.inputOwnershipActive, false);
    this.inputOwnershipActive = true;
    this.inputOwnershipAcquireCount += 1;
    let released = false;
    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.inputOwnershipActive = false;
        this.inputOwnershipReleaseCount += 1;
      },
    };
  }

  createView(
    request: ObjectiveModalPresenterViewRequest,
  ): ObjectiveModalPresenterView {
    if (this.failViewCreation) {
      throw new Error("synthetic view creation failure");
    }
    const view = new FakeObjectiveModalPresenterView(request);
    this.views.push(view);
    return view;
  }

  onEscape(listener: (event: ObjectiveModalEscapeEvent) => void): void {
    this.escapeListeners.add(listener);
  }

  offEscape(listener: (event: ObjectiveModalEscapeEvent) => void): void {
    this.escapeListeners.delete(listener);
  }

  onResize(listener: () => void): void {
    this.resizeListeners.add(listener);
  }

  offResize(listener: () => void): void {
    this.resizeListeners.delete(listener);
  }

  emitEscape(): { prevented: number; stopped: number } {
    const result = { prevented: 0, stopped: 0 };
    const event: ObjectiveModalEscapeEvent = {
      preventDefault: () => {
        result.prevented += 1;
      },
      stopPropagation: () => {
        result.stopped += 1;
      },
    };
    for (const listener of [...this.escapeListeners]) {
      listener(event);
    }
    return result;
  }

  emitResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const listener of [...this.resizeListeners]) {
      listener();
    }
  }

  get escapeListenerCount(): number {
    return this.escapeListeners.size;
  }

  get resizeListenerCount(): number {
    return this.resizeListeners.size;
  }
}

test("maps the K01 request to the exact K0110 objective and empty second string", () => {
  assert.deepEqual(
    resolveK01ObjectiveModalPresentation(
      createK01OpenObjectiveModalAction(),
      K01_PRESENTATION_SOURCE,
    ),
    {
      objectiveId: K01_OBJECTIVE_ID,
      primaryText:
        "1. 봉화대를 짓고 적군 섬멸 (유성룡, 권율은 살아 남아야 한다.)",
      secondaryText: "",
    },
  );
});

test("rejects missing or altered K01 presentation data with actionable context", () => {
  const action = createK01OpenObjectiveModalAction();
  assert.throws(
    () => resolveK01ObjectiveModalPresentation(action, {}),
    /requires launchContext\.scenario.*build-beacon/,
  );
  assert.throws(
    () =>
      resolveK01ObjectiveModalPresentation(action, {
        scenario: { id: K01_SCENARIO_ID },
      }),
    /requires scenario\.briefing/,
  );
  assert.throws(
    () =>
      resolveK01ObjectiveModalPresentation(action, {
        scenario: {
          id: K01_SCENARIO_ID,
          briefing: { objective: "봉화대를 건설하십시오." },
        },
      }),
    /requires the exact K0110 briefing objective/,
  );
});

test("resolves the verified base geometry and a uniformly centered scaled layout", () => {
  assert.deepEqual(resolveObjectiveModalPresenterLayout(640, 480), {
    viewport: { x: 0, y: 0, width: 640, height: 480 },
    original: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      frame: { x: 112, y: 81, width: 416, height: 236 },
      content: { x: 158, y: 135, width: 320, height: 124 },
      dismissButton: { x: 415, y: 267, width: 80, height: 24 },
      text: { maxWidth: 320, firstCenterY: 166, secondCenterY: 228 },
    },
  });
  assert.deepEqual(resolveObjectiveModalPresenterLayout(1280, 720), {
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    original: {
      scale: 1.5,
      offsetX: 160,
      offsetY: 0,
      frame: { x: 328, y: 121.5, width: 624, height: 354 },
      content: { x: 397, y: 202.5, width: 480, height: 186 },
      dismissButton: { x: 782.5, y: 400.5, width: 120, height: 36 },
      text: { maxWidth: 480, firstCenterY: 249, secondCenterY: 342 },
    },
  });
});

test("owns the full viewport and opens duplicate requests only once", () => {
  const host = new FakeObjectiveModalPresenterHost();
  const presenter = new ObjectiveModalPresenterController(host, () => {});
  const content = resolveK01ObjectiveModalPresentation(
    createK01OpenObjectiveModalAction(),
    K01_PRESENTATION_SOURCE,
  );
  presenter.start();

  assert.equal(presenter.open(content), true);
  assert.equal(presenter.open(content), false);
  assert.equal(host.views.length, 1);
  assert.equal(host.inputOwnershipAcquireCount, 1);
  assert.equal(host.inputOwnershipActive, true);
  assert.deepEqual(host.views[0]?.request.layout.viewport, {
    x: 0,
    y: 0,
    width: 640,
    height: 480,
  });

  host.views[0]?.request.input.pointerDown({
    x: 8,
    y: 8,
    primaryButton: false,
  });
  assert.equal(presenter.active, true);
});

test("dismisses only on a primary release strictly inside the verified rectangle", () => {
  const host = new FakeObjectiveModalPresenterHost();
  const dismissReasons: ObjectiveModalDismissReason[] = [];
  const presenter = new ObjectiveModalPresenterController(host, (reason) => {
    dismissReasons.push(reason);
  });
  presenter.start();
  presenter.open(
    resolveK01ObjectiveModalPresentation(
      createK01OpenObjectiveModalAction(),
      K01_PRESENTATION_SOURCE,
    ),
  );
  const input = host.views[0]!.request.input;

  input.pointerDown({ x: 10, y: 10, primaryButton: true });
  assert.equal(presenter.active, true, "held primary button");
  input.pointerUp({ x: 415, y: 279, primaryButton: true });
  assert.equal(presenter.active, true, "left edge");
  input.pointerDown({ x: 10, y: 10, primaryButton: true });
  input.pointerUp({ x: 495, y: 279, primaryButton: true });
  assert.equal(presenter.active, true, "right edge");
  input.pointerDown({ x: 10, y: 10, primaryButton: true });
  input.pointerUp({ x: 455, y: 267, primaryButton: true });
  assert.equal(presenter.active, true, "top edge");
  input.pointerDown({ x: 10, y: 10, primaryButton: true });
  input.pointerUp({ x: 455, y: 291, primaryButton: true });
  assert.equal(presenter.active, true, "bottom edge");
  input.pointerDown({ x: 10, y: 10, primaryButton: true });
  input.pointerUp({ x: 200, y: 200, primaryButton: true });
  assert.equal(presenter.active, true, "outside release");
  input.pointerUp({ x: 455, y: 279, primaryButton: true });
  assert.equal(presenter.active, true, "release without prior down");
  input.pointerDown({ x: 10, y: 10, primaryButton: true });
  input.pointerUp({ x: 455, y: 279, primaryButton: false });
  assert.equal(presenter.active, true, "non-primary release");
  input.pointerDown({ x: 10, y: 10, primaryButton: true });
  input.pointerUp({ x: 455, y: 279, primaryButton: true });

  assert.equal(presenter.active, false);
  assert.deepEqual(dismissReasons, ["pointer-release"]);
  assert.equal(host.views[0]?.destroyCount, 1);
  assert.equal(host.inputOwnershipActive, false);
  assert.equal(host.inputOwnershipReleaseCount, 1);
});

test("Escape dismisses, consumes the key event, and closes the active request", () => {
  const host = new FakeObjectiveModalPresenterHost();
  const requestState = new ObjectiveModalRequestState();
  const presenter = new ObjectiveModalPresenterController(host, () => {
    requestState.close();
  });
  presenter.start();

  assert.equal(
    openK01ObjectiveModalRequest({
      action: createK01OpenObjectiveModalAction(),
      source: K01_PRESENTATION_SOURCE,
      requestState,
      presenter,
    }),
    true,
  );
  assert.deepEqual(requestState.active, createK01OpenObjectiveModalAction());
  assert.equal(
    openK01ObjectiveModalRequest({
      action: createK01OpenObjectiveModalAction(),
      source: K01_PRESENTATION_SOURCE,
      requestState,
      presenter,
    }),
    false,
  );

  assert.deepEqual(host.emitEscape(), { prevented: 1, stopped: 1 });
  assert.equal(presenter.active, false);
  assert.equal(requestState.active, null);
  assert.equal(host.inputOwnershipActive, false);
  assert.equal(host.inputOwnershipReleaseCount, 1);
});

test("resize relayouts the existing view without duplicating view or listeners", () => {
  const host = new FakeObjectiveModalPresenterHost();
  const presenter = new ObjectiveModalPresenterController(host, () => {});
  presenter.start();
  presenter.start();
  presenter.open(
    resolveK01ObjectiveModalPresentation(
      createK01OpenObjectiveModalAction(),
      K01_PRESENTATION_SOURCE,
    ),
  );

  host.emitResize(1280, 720);

  assert.equal(host.views.length, 1);
  assert.equal(host.escapeListenerCount, 1);
  assert.equal(host.resizeListenerCount, 1);
  assert.deepEqual(host.views[0]?.layouts, [
    resolveObjectiveModalPresenterLayout(1280, 720),
  ]);
  assert.equal(host.inputOwnershipActive, true);
  assert.equal(host.inputOwnershipAcquireCount, 1);
  assert.equal(host.inputOwnershipReleaseCount, 0);
});

test("shutdown destroys active presentation and removes lifecycle listeners", () => {
  const host = new FakeObjectiveModalPresenterHost();
  const dismissReasons: ObjectiveModalDismissReason[] = [];
  const presenter = new ObjectiveModalPresenterController(host, (reason) => {
    dismissReasons.push(reason);
  });
  presenter.start();
  presenter.open(
    resolveK01ObjectiveModalPresentation(
      createK01OpenObjectiveModalAction(),
      K01_PRESENTATION_SOURCE,
    ),
  );

  presenter.shutdown();
  presenter.shutdown();

  assert.equal(presenter.active, false);
  assert.equal(host.views[0]?.destroyCount, 1);
  assert.equal(host.escapeListenerCount, 0);
  assert.equal(host.resizeListenerCount, 0);
  assert.equal(host.inputOwnershipActive, false);
  assert.equal(host.inputOwnershipReleaseCount, 1);
  assert.deepEqual(dismissReasons, []);
});

test("missing texture and invalid content fail loudly without leaving active state", () => {
  const host = new FakeObjectiveModalPresenterHost();
  const requestState = new ObjectiveModalRequestState();
  const presenter = new ObjectiveModalPresenterController(host, () => {
    requestState.close();
  });
  presenter.start();
  host.textureAvailable = false;

  assert.throws(
    () =>
      openK01ObjectiveModalRequest({
        action: createK01OpenObjectiveModalAction(),
        source: K01_PRESENTATION_SOURCE,
        requestState,
        presenter,
      }),
    /texture "ui-objective-modal-objectiveborder" is unavailable.*objectiveborder_0000\.png/,
  );
  assert.equal(presenter.active, false);
  assert.equal(requestState.active, null);
  assert.equal(host.views.length, 0);
  assert.equal(host.inputOwnershipAcquireCount, 0);
  assert.equal(host.inputOwnershipReleaseCount, 0);

  host.textureAvailable = true;
  assert.throws(
    () =>
      presenter.open({
        objectiveId: K01_OBJECTIVE_ID,
        primaryText: "",
        secondaryText: "",
      }),
    /content\.primaryText must be a non-empty string/,
  );
  assert.equal(presenter.active, false);
  assert.equal(host.inputOwnershipAcquireCount, 0);

  host.failViewCreation = true;
  assert.throws(
    () =>
      presenter.open({
        objectiveId: K01_OBJECTIVE_ID,
        primaryText: "objective",
        secondaryText: "",
      }),
    /synthetic view creation failure/,
  );
  assert.equal(host.inputOwnershipActive, false);
  assert.equal(host.inputOwnershipAcquireCount, 1);
  assert.equal(host.inputOwnershipReleaseCount, 1);
});
