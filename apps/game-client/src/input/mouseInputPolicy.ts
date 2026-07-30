import type { MouseControlMode } from "../gameplayPreferences.js";

export type MousePointerButton = "primary" | "secondary";
export type MouseHitKind = "friendly-selectable" | "enemy" | "resource" | "world";

export interface MouseInputFacts {
  button: MousePointerButton;
  dragging: boolean;
  hasPendingTargetAction: boolean;
  hasControllableSelection: boolean;
  hit: MouseHitKind;
}

export type MouseInputAction =
  | { kind: "select" }
  | { kind: "confirm-pending-action" }
  | { kind: "issue-default-action" }
  | { kind: "cancel-pending-action" }
  | { kind: "ignore" };

/**
 * Product input adapter. It deliberately returns semantic actions instead of
 * issuing engine commands, so maps and mods may provide their own hit-testing
 * and command resolver without duplicating button-mode rules.
 */
export function decideMouseInputAction(mode: MouseControlMode, facts: MouseInputFacts): MouseInputAction {
  if (facts.button === "secondary") {
    if (facts.hasPendingTargetAction) return { kind: "cancel-pending-action" };
    return mode === "two-button" ? { kind: "issue-default-action" } : { kind: "ignore" };
  }

  if (facts.hasPendingTargetAction) return { kind: "confirm-pending-action" };
  if (facts.dragging) return { kind: "select" };
  if (mode === "two-button") return { kind: "select" };
  if (facts.hit === "friendly-selectable" || !facts.hasControllableSelection) return { kind: "select" };
  return { kind: "issue-default-action" };
}
