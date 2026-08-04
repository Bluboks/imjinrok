export type DebugPresentationPointerButton = "primary" | "secondary";
export type DebugPresentationPointerPhase = "down" | "move" | "up";
export type DebugPresentationPointerTargetKind = "outside" | "panel" | "button" | "input" | "label";

export interface DebugPresentationPointerFacts {
  locked: boolean;
  phase: DebugPresentationPointerPhase;
  button: DebugPresentationPointerButton | null;
  target: DebugPresentationPointerTargetKind;
  pressConsumed: boolean;
  releaseMatchesPress: boolean;
}

export type DebugPresentationPointerAction = "pass-through" | "consume" | "activate";

/**
 * Keeps pointer-lock debug-panel routing separate from DOM lookup and game
 * commands.  The scene applies the returned boundary decision to the actual
 * panel element; this policy only describes whether the game may observe the
 * gesture and whether a matching primary click may activate a control.
 */
export function decideDebugPresentationPointerAction(
  facts: DebugPresentationPointerFacts,
): DebugPresentationPointerAction {
  const overPanel = facts.target !== "outside";
  const interactive = facts.target === "button" || facts.target === "input" || facts.target === "label";

  if (facts.phase === "move") {
    return overPanel || facts.pressConsumed ? "consume" : "pass-through";
  }

  if (facts.phase === "down") {
    return facts.locked && overPanel && facts.button ? "consume" : "pass-through";
  }

  if (facts.pressConsumed) {
    return facts.button === "primary" && interactive && facts.releaseMatchesPress ? "activate" : "consume";
  }

  return facts.locked && overPanel && facts.button ? "consume" : "pass-through";
}

/** Classifies the element hit by the virtual cursor without depending on DOM APIs. */
export function classifyDebugPresentationTarget(
  tagName: string | null | undefined,
  insidePanel: boolean,
): DebugPresentationPointerTargetKind {
  if (!insidePanel) return "outside";

  switch (tagName?.toLowerCase()) {
    case "button":
      return "button";
    case "input":
      return "input";
    case "label":
      return "label";
    default:
      return "panel";
  }
}
