import {
  UI_DOMAIN_ACTION_REQUESTED_EVENT,
  type UiDomainActionRequestedView,
} from "../hud.js";
import {
  appendUiDomainAction,
  assertK01OpenObjectiveModalAction,
  consumeNextUiDomainAction,
  createK01OpenObjectiveModalAction,
  K01_OBJECTIVE_ID,
  type K01OpenObjectiveModalAction,
} from "./objectiveModalActions.js";

export const K01_SCENARIO_ID = "imjinrok-k01";

export interface UiDomainActionEventBus {
  on(
    event: typeof UI_DOMAIN_ACTION_REQUESTED_EVENT,
    listener: (action: unknown) => void,
  ): unknown;
  off(
    event: typeof UI_DOMAIN_ACTION_REQUESTED_EVENT,
    listener: (action: unknown) => void,
  ): unknown;
  emit(
    event: typeof UI_DOMAIN_ACTION_REQUESTED_EVENT,
    action: UiDomainActionRequestedView,
  ): unknown;
}

export interface K01ObjectiveModalCandidateInput {
  readonly scenarioId: string;
  readonly interactionEnabled: boolean;
  readonly objectiveIds: readonly string[];
}

export function resolveK01ObjectiveModalActionCandidate(
  input: K01ObjectiveModalCandidateInput,
): K01OpenObjectiveModalAction | null {
  if (input.scenarioId !== K01_SCENARIO_ID) {
    return null;
  }
  if (!input.interactionEnabled) {
    return null;
  }
  if (!input.objectiveIds.includes(K01_OBJECTIVE_ID)) {
    return null;
  }

  return createK01OpenObjectiveModalAction();
}

export function emitK01ObjectiveModalActionRequest(
  eventBus: UiDomainActionEventBus,
  action: unknown,
): void {
  assertK01OpenObjectiveModalAction(action);
  eventBus.emit(UI_DOMAIN_ACTION_REQUESTED_EVENT, action);
}

export class ObjectiveModalActionBridge {
  private pendingActions: readonly K01OpenObjectiveModalAction[] = [];
  private listening = false;
  private consuming = false;

  constructor(
    private readonly eventBus: UiDomainActionEventBus,
    private readonly consumeAction: (action: K01OpenObjectiveModalAction) => void,
  ) {}

  start(): void {
    if (this.listening) {
      return;
    }

    this.eventBus.on(
      UI_DOMAIN_ACTION_REQUESTED_EVENT,
      this.handleActionRequested,
    );
    this.listening = true;
  }

  stop(): void {
    if (this.listening) {
      this.eventBus.off(
        UI_DOMAIN_ACTION_REQUESTED_EVENT,
        this.handleActionRequested,
      );
    }

    this.listening = false;
    this.pendingActions = [];
  }

  get pendingCount(): number {
    return this.pendingActions.length;
  }

  private readonly handleActionRequested = (
    action: unknown,
  ): void => {
    if (!hasActionType(action, "open-objective-modal")) {
      return;
    }

    assertK01OpenObjectiveModalAction(action);
    this.pendingActions = appendUiDomainAction(this.pendingActions, action);
    this.consumePendingActions();
  };

  private consumePendingActions(): void {
    if (this.consuming) {
      return;
    }

    this.consuming = true;
    try {
      while (this.listening && this.pendingActions.length > 0) {
        const next = consumeNextUiDomainAction(this.pendingActions);
        this.pendingActions = next.remainingActions;
        if (next.action) {
          this.consumeAction(next.action);
        }
      }
    } finally {
      this.consuming = false;
    }
  }
}

function hasActionType(value: unknown, type: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    value.type === type
  );
}

export class ObjectiveModalRequestState {
  private activeAction: K01OpenObjectiveModalAction | null = null;

  get active(): K01OpenObjectiveModalAction | null {
    return this.activeAction;
  }

  open(action: unknown): boolean {
    assertK01OpenObjectiveModalAction(action);
    if (this.activeAction?.metadata.objectiveId === action.metadata.objectiveId) {
      return false;
    }

    this.activeAction = action;
    return true;
  }

  close(): void {
    this.activeAction = null;
  }
}
