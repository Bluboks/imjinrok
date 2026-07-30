import { getThemeAssetUrl, type ThemeDefinition, type ThemeFrameRef } from "@shared";

export interface ThemeTextureLoadRequest extends ThemeFrameRef {
  readonly url: string;
}

/**
 * Produces the texture requests that must complete before gameplay renders.
 * Re-evaluating the plan after a load failure deliberately retains failed keys
 * so the create-time fallback can retry them.
 */
export function getMissingThemeTextureLoadRequests(
  theme: ThemeDefinition,
  frameRefs: readonly ThemeFrameRef[],
  textureExists: (textureKey: string) => boolean,
): ThemeTextureLoadRequest[] {
  const requests: ThemeTextureLoadRequest[] = [];
  const queuedTextureKeys = new Set<string>();

  for (const { visual, frame } of frameRefs) {
    if (queuedTextureKeys.has(frame.textureKey) || textureExists(frame.textureKey)) {
      continue;
    }

    queuedTextureKeys.add(frame.textureKey);
    requests.push({
      visual,
      frame,
      url: getThemeAssetUrl(theme, visual, frame),
    });
  }

  return requests;
}
