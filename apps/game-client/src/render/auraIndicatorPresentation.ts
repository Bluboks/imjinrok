import type { AppliedAuraEffectState } from "@shared";

export interface AuraIndicatorPresentation {
  readonly indicatorId: string;
  readonly color: number;
}

/**
 * Resolves only an opt-in serialized recipient effect. It intentionally does
 * not map an original SPR resource: the K01 indicator compositor is unproven.
 */
export function resolveAuraIndicatorPresentation(
  effects: Readonly<Record<string, AppliedAuraEffectState>> | undefined,
): AuraIndicatorPresentation | null {
  const effect = Object.entries(effects ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, candidate]) => candidate)
    .find((candidate) => candidate.indicatorId !== undefined);

  if (!effect?.indicatorId) {
    return null;
  }

  return { indicatorId: effect.indicatorId, color: colorForIndicatorId(effect.indicatorId) };
}

function colorForIndicatorId(indicatorId: string): number {
  let hash = 2166136261;
  for (const character of indicatorId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 0x808080 | (hash & 0x7f7f7f);
}
