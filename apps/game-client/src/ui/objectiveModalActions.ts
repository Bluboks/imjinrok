export interface UiDomainAction<
  Type extends string = string,
  Metadata extends object = Readonly<Record<string, unknown>>,
> {
  readonly type: Type;
  readonly metadata: Readonly<Metadata>;
}

export type OpenObjectiveModalAction<
  Metadata extends object = Readonly<Record<string, never>>,
> = UiDomainAction<"open-objective-modal", Metadata>;

export const K01_OBJECTIVE_ID = "build-beacon";
export const K01_OBJECTIVE_MODAL_TRIGGER = "hud-objective-button";

export interface K01ObjectiveModalMetadata {
  readonly profile: "original-parity";
  readonly objectiveId: typeof K01_OBJECTIVE_ID;
  readonly trigger: typeof K01_OBJECTIVE_MODAL_TRIGGER;
}

export type K01OpenObjectiveModalAction =
  OpenObjectiveModalAction<K01ObjectiveModalMetadata>;

export interface UiDomainActionConsumption<Action extends UiDomainAction> {
  readonly action: Action | null;
  readonly remainingActions: readonly Action[];
}

export function createOpenObjectiveModalAction(): OpenObjectiveModalAction;
export function createOpenObjectiveModalAction<Metadata extends object>(
  metadata: Metadata,
): OpenObjectiveModalAction<Metadata>;
export function createOpenObjectiveModalAction(
  metadata: object = {},
): OpenObjectiveModalAction<object> {
  return {
    type: "open-objective-modal",
    metadata: { ...metadata },
  };
}

export function createK01OpenObjectiveModalAction(): K01OpenObjectiveModalAction {
  return createOpenObjectiveModalAction({
    profile: "original-parity",
    objectiveId: K01_OBJECTIVE_ID,
    trigger: K01_OBJECTIVE_MODAL_TRIGGER,
  });
}

export function assertK01OpenObjectiveModalAction(
  value: unknown,
): asserts value is K01OpenObjectiveModalAction {
  if (!isRecord(value)) {
    throw new TypeError(
      `objective modal action must be an object; got ${describeValue(value)}`,
    );
  }
  if (value.type !== "open-objective-modal") {
    throw new TypeError(
      `objective modal action type must be "open-objective-modal"; got ${describeValue(value.type)}`,
    );
  }
  if (!isRecord(value.metadata)) {
    throw new TypeError(
      `objective modal action metadata must be an object; got ${describeValue(value.metadata)}`,
    );
  }

  const { profile, objectiveId, trigger } = value.metadata;
  if (profile !== "original-parity") {
    throw new TypeError(
      `objective modal action metadata.profile must be "original-parity"; got ${describeValue(profile)}`,
    );
  }
  if (objectiveId !== K01_OBJECTIVE_ID) {
    throw new TypeError(
      `objective modal action metadata.objectiveId must be "${K01_OBJECTIVE_ID}"; got ${describeValue(objectiveId)}`,
    );
  }
  if (trigger !== K01_OBJECTIVE_MODAL_TRIGGER) {
    throw new TypeError(
      `objective modal action metadata.trigger must be "${K01_OBJECTIVE_MODAL_TRIGGER}"; got ${describeValue(trigger)}`,
    );
  }
}

export function appendUiDomainAction<Action extends UiDomainAction>(
  pendingActions: readonly Action[],
  action: Action,
): readonly Action[] {
  return [...pendingActions, action];
}

export function consumeNextUiDomainAction<Action extends UiDomainAction>(
  pendingActions: readonly Action[],
): UiDomainActionConsumption<Action> {
  const [action, ...remainingActions] = pendingActions;
  return {
    action: action ?? null,
    remainingActions,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}
