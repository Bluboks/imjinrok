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
