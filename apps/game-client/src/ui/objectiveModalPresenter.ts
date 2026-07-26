import {
  ORIGINAL_OBJECTIVE_PANEL_FRAME_ASSET,
  isResolvedOriginalObjectiveDismissButtonHit,
  resolveOriginalObjectivePanelLayout,
  type OriginalObjectivePanelRect,
  type ResolvedOriginalObjectivePanelLayout,
} from "../originalObjectivePanelLayout.js";
import { imjinrokK01Scenario } from "@shared";
import {
  K01_SCENARIO_ID,
  ObjectiveModalRequestState,
} from "./objectiveModalActionBridge.js";
import {
  assertK01OpenObjectiveModalAction,
  type K01OpenObjectiveModalAction,
} from "./objectiveModalActions.js";

export const OBJECTIVE_MODAL_FRAME_TEXTURE_KEY =
  "ui-objective-modal-objectiveborder";

export interface ObjectiveModalPresentationContent {
  readonly objectiveId: string;
  readonly primaryText: string;
  readonly secondaryText: string;
}

export interface ObjectiveModalPresentationSource {
  readonly scenario?: {
    readonly id: string;
    readonly briefing?: {
      readonly objective: string;
    };
  };
}

export interface ObjectiveModalPresenterLayout {
  readonly viewport: OriginalObjectivePanelRect;
  readonly original: ResolvedOriginalObjectivePanelLayout;
}

export interface ObjectiveModalPointer {
  readonly x: number;
  readonly y: number;
  readonly primaryButton: boolean;
}

export type ObjectiveModalDismissReason = "pointer-release" | "escape";

export interface ObjectiveModalPresenterView {
  relayout(layout: ObjectiveModalPresenterLayout): void;
  destroy(): void;
}

export interface ObjectiveModalInputOwnership {
  release(): void;
}

export interface ObjectiveModalPresenterViewInput {
  readonly pointerDown: (pointer: ObjectiveModalPointer) => void;
  readonly pointerUp: (pointer: ObjectiveModalPointer) => void;
}

export interface ObjectiveModalPresenterViewRequest {
  readonly textureKey: typeof OBJECTIVE_MODAL_FRAME_TEXTURE_KEY;
  readonly content: ObjectiveModalPresentationContent;
  readonly layout: ObjectiveModalPresenterLayout;
  readonly input: ObjectiveModalPresenterViewInput;
}

export interface ObjectiveModalEscapeEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

export interface ObjectiveModalPresenterHost {
  getViewportSize(): { readonly width: number; readonly height: number };
  hasTexture(textureKey: string): boolean;
  acquireInputOwnership(): ObjectiveModalInputOwnership;
  createView(request: ObjectiveModalPresenterViewRequest): ObjectiveModalPresenterView;
  onEscape(listener: (event: ObjectiveModalEscapeEvent) => void): void;
  offEscape(listener: (event: ObjectiveModalEscapeEvent) => void): void;
  onResize(listener: () => void): void;
  offResize(listener: () => void): void;
}

export function resolveK01ObjectiveModalPresentation(
  action: unknown,
  source: ObjectiveModalPresentationSource,
): ObjectiveModalPresentationContent {
  assertK01OpenObjectiveModalAction(action);
  const scenario = source.scenario;
  if (!scenario) {
    throw new TypeError(
      `K01 objective modal requires launchContext.scenario for objective "${action.metadata.objectiveId}"`,
    );
  }
  if (scenario.id !== K01_SCENARIO_ID) {
    throw new TypeError(
      `K01 objective modal requires scenario "${K01_SCENARIO_ID}"; got ${JSON.stringify(scenario.id)}`,
    );
  }
  if (!scenario.briefing) {
    throw new TypeError(
      `K01 objective modal requires scenario.briefing for scenario "${scenario.id}"`,
    );
  }
  const canonicalObjective = imjinrokK01Scenario.briefing?.objective;
  if (canonicalObjective === undefined) {
    throw new TypeError(
      "K01 objective modal requires the canonical K01 scenario briefing objective, but it is missing",
    );
  }
  if (scenario.briefing.objective !== canonicalObjective) {
    throw new TypeError(
      `K01 objective modal requires the exact K0110 briefing objective; got ${JSON.stringify(scenario.briefing.objective)}`,
    );
  }

  return {
    objectiveId: action.metadata.objectiveId,
    primaryText: scenario.briefing.objective,
    secondaryText: "",
  };
}

export function resolveObjectiveModalPresenterLayout(
  viewportWidth: number,
  viewportHeight: number,
): ObjectiveModalPresenterLayout {
  return {
    viewport: {
      x: 0,
      y: 0,
      width: viewportWidth,
      height: viewportHeight,
    },
    original: resolveOriginalObjectivePanelLayout(viewportWidth, viewportHeight),
  };
}

export class ObjectiveModalPresenterController {
  private view: ObjectiveModalPresenterView | null = null;
  private inputOwnership: ObjectiveModalInputOwnership | null = null;
  private activeContent: ObjectiveModalPresentationContent | null = null;
  private primaryButtonDown = false;
  private listening = false;

  constructor(
    private readonly host: ObjectiveModalPresenterHost,
    private readonly onDismiss: (reason: ObjectiveModalDismissReason) => void,
  ) {}

  get active(): boolean {
    return this.activeContent !== null;
  }

  get content(): ObjectiveModalPresentationContent | null {
    return this.activeContent;
  }

  start(): void {
    if (this.listening) {
      return;
    }

    this.host.onEscape(this.handleEscape);
    this.host.onResize(this.handleResize);
    this.listening = true;
  }

  open(content: ObjectiveModalPresentationContent): boolean {
    if (!this.listening) {
      throw new Error("objective modal presenter must be started before opening");
    }
    if (this.active) {
      return false;
    }

    assertObjectiveModalPresentationContent(content);
    if (!this.host.hasTexture(OBJECTIVE_MODAL_FRAME_TEXTURE_KEY)) {
      throw new Error(
        `objective modal texture "${OBJECTIVE_MODAL_FRAME_TEXTURE_KEY}" is unavailable; expected asset "${ORIGINAL_OBJECTIVE_PANEL_FRAME_ASSET}" to be loaded before presentation`,
      );
    }

    const resolvedContent = { ...content };
    const inputOwnership = this.host.acquireInputOwnership();
    let view: ObjectiveModalPresenterView;
    try {
      view = this.host.createView({
        textureKey: OBJECTIVE_MODAL_FRAME_TEXTURE_KEY,
        content: resolvedContent,
        layout: this.resolveLayout(),
        input: {
          pointerDown: this.handlePointerDown,
          pointerUp: this.handlePointerUp,
        },
      });
    } catch (error) {
      inputOwnership.release();
      throw error;
    }

    this.view = view;
    this.inputOwnership = inputOwnership;
    this.activeContent = resolvedContent;
    this.primaryButtonDown = false;
    return true;
  }

  shutdown(): void {
    if (this.listening) {
      this.host.offEscape(this.handleEscape);
      this.host.offResize(this.handleResize);
      this.listening = false;
    }

    const view = this.view;
    const inputOwnership = this.inputOwnership;
    this.view = null;
    this.inputOwnership = null;
    this.activeContent = null;
    this.primaryButtonDown = false;
    try {
      view?.destroy();
    } finally {
      inputOwnership?.release();
    }
  }

  private readonly handlePointerDown = (
    pointer: ObjectiveModalPointer,
  ): void => {
    if (!this.active) {
      return;
    }

    assertObjectiveModalPointer(pointer);
    if (pointer.primaryButton) {
      this.primaryButtonDown = true;
    }
  };

  private readonly handlePointerUp = (
    pointer: ObjectiveModalPointer,
  ): void => {
    if (!this.active) {
      return;
    }

    assertObjectiveModalPointer(pointer);
    const wasPrimaryButtonDown = this.primaryButtonDown;
    this.primaryButtonDown = false;
    if (
      pointer.primaryButton &&
      wasPrimaryButtonDown &&
      isResolvedOriginalObjectiveDismissButtonHit(
        this.resolveLayout().original,
        pointer.x,
        pointer.y,
      )
    ) {
      this.close("pointer-release");
    }
  };

  private readonly handleEscape = (event: ObjectiveModalEscapeEvent): void => {
    if (!this.active) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.close("escape");
  };

  private readonly handleResize = (): void => {
    if (!this.active || !this.view) {
      return;
    }

    this.view.relayout(this.resolveLayout());
  };

  private close(reason: ObjectiveModalDismissReason): void {
    const view = this.view;
    const inputOwnership = this.inputOwnership;
    this.view = null;
    this.inputOwnership = null;
    this.activeContent = null;
    this.primaryButtonDown = false;
    try {
      view?.destroy();
    } finally {
      try {
        inputOwnership?.release();
      } finally {
        this.onDismiss(reason);
      }
    }
  }

  private resolveLayout(): ObjectiveModalPresenterLayout {
    const viewport = this.host.getViewportSize();
    return resolveObjectiveModalPresenterLayout(viewport.width, viewport.height);
  }
}

export function openK01ObjectiveModalRequest({
  action,
  source,
  requestState,
  presenter,
}: {
  action: unknown;
  source: ObjectiveModalPresentationSource;
  requestState: ObjectiveModalRequestState;
  presenter: ObjectiveModalPresenterController;
}): boolean {
  const content = resolveK01ObjectiveModalPresentation(action, source);
  if (!requestState.open(action)) {
    return false;
  }

  try {
    if (!presenter.open(content)) {
      throw new Error(
        `objective modal request state opened objective "${content.objectiveId}" while the presenter was already active`,
      );
    }
  } catch (error) {
    requestState.close();
    throw error;
  }

  return true;
}

function assertObjectiveModalPresentationContent(
  content: ObjectiveModalPresentationContent,
): void {
  if (!content || typeof content !== "object") {
    throw new TypeError(
      `objective modal content must be an object; got ${String(content)}`,
    );
  }
  assertNonEmptyString(content.objectiveId, "objective modal content.objectiveId");
  assertNonEmptyString(content.primaryText, "objective modal content.primaryText");
  if (typeof content.secondaryText !== "string") {
    throw new TypeError(
      `objective modal content.secondaryText must be a string; got ${String(content.secondaryText)}`,
    );
  }
}

function assertObjectiveModalPointer(pointer: ObjectiveModalPointer): void {
  if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) {
    throw new RangeError(
      `objective modal pointer coordinates must be finite; got (${String(pointer.x)}, ${String(pointer.y)})`,
    );
  }
  if (typeof pointer.primaryButton !== "boolean") {
    throw new TypeError(
      `objective modal pointer.primaryButton must be boolean; got ${String(pointer.primaryButton)}`,
    );
  }
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string; got ${JSON.stringify(value)}`);
  }
}
