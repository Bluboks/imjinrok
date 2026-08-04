/**
 * Selection is intentionally a superset of command admission.  Visible
 * allied and enemy entities can be inspected in the HUD, while only units
 * owned by the local player may participate in commands and shortcuts.
 */
export type SelectionRelationship = "local" | "allied" | "enemy";

export interface SelectionPolicyFacts {
  readonly relationship: SelectionRelationship;
  readonly visible: boolean;
}

export interface SelectionPolicy {
  readonly inspectable: boolean;
  readonly selectable: boolean;
  readonly commandable: boolean;
}

export interface UnitSelectionClickIdentity {
  readonly kind: string;
  readonly playerId: string;
  readonly time: number;
}

export function isSameUnitSelectionDoubleClick(
  previous: UnitSelectionClickIdentity | null,
  current: Pick<UnitSelectionClickIdentity, "kind" | "playerId">,
  now: number,
  windowMs: number,
): boolean {
  return previous !== null
    && previous.kind === current.kind
    && previous.playerId === current.playerId
    && now - previous.time <= windowMs;
}

export function resolveSelectionPolicy(facts: SelectionPolicyFacts): SelectionPolicy {
  if (!facts.visible) {
    return { inspectable: false, selectable: false, commandable: false };
  }

  const commandable = facts.relationship === "local";
  return { inspectable: true, selectable: true, commandable };
}
