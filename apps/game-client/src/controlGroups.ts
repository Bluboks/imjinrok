export type ControlGroupIntentKind = "assign" | "add" | "recall";

export interface ControlGroupIntent {
  kind: ControlGroupIntentKind;
  group: number;
}

export interface ControlGroupKeyFacts {
  code: string;
  key: string;
  repeat: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isCheatInputOpen: boolean;
  isBlockingModalOpen: boolean;
}

export interface ControlGroupRecallState {
  group: number;
  time: number;
}

export type ControlGroupAssignmentOutcome = "assign" | "clear";
export type ControlGroupRecallOutcome = "recall" | "empty";

export function decideControlGroupKeyIntent(facts: ControlGroupKeyFacts): ControlGroupIntent | null {
  if (facts.repeat || facts.altKey || facts.isCheatInputOpen || facts.isBlockingModalOpen) return null;

  const group = getControlGroupNumber(facts);

  if (group === null) return null;
  if (facts.ctrlKey || facts.metaKey) return { kind: "assign", group };
  if (facts.shiftKey) return { kind: "add", group };
  return { kind: "recall", group };
}

export function getControlGroupNumber({ code, key }: Pick<ControlGroupKeyFacts, "code" | "key">): number | null {
  if (/^Digit\d$/.test(code)) return Number(code.slice("Digit".length));
  if (/^Numpad\d$/.test(code)) return Number(code.slice("Numpad".length));
  if (/^\d$/.test(key)) return Number(key);
  return null;
}

export function decideControlGroupAssignmentOutcome(selectedUnitCount: number): ControlGroupAssignmentOutcome {
  return selectedUnitCount > 0 ? "assign" : "clear";
}

export function decideControlGroupRecallOutcome(liveUnitCount: number): ControlGroupRecallOutcome {
  return liveUnitCount > 0 ? "recall" : "empty";
}

export function shouldCenterControlGroupOnRecall(
  lastRecall: ControlGroupRecallState | null,
  group: number,
  now: number,
  doubleTapWindowMs: number,
): boolean {
  if (!lastRecall || lastRecall.group !== group) return false;

  const elapsedMs = now - lastRecall.time;
  return elapsedMs >= 0 && elapsedMs <= doubleTapWindowMs;
}
