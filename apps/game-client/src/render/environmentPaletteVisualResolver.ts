import type { ContentRegistry, EnvironmentVisualProfile, MapDefinition, PaletteVisualAsset } from "@shared";
import type { EnvironmentState } from "@simulation";

export interface EnvironmentPalettePreloadDescriptor extends PaletteVisualAsset {
  readonly profileId: string;
  readonly paletteId: string;
  readonly cacheKey: string;
}

export interface SourcePaletteManifest {
  readonly source: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly rgb6: readonly number[];
  readonly evidenceStatus: "source-backed-adaptation";
}

export interface SourcePaletteOverlayAdapter {
  readonly evidenceStatus: "source-backed-adaptation";
  readonly paletteId: string;
  readonly rgb: number;
  readonly alpha: number;
}

type EnvironmentPaletteRegistry = Pick<ContentRegistry, "environmentVisualProfiles">;
type EnvironmentPaletteMap = Pick<MapDefinition, "id" | "environmentVisualProfileId">;

/** Preload all palette manifests before a launch map is selected, in stable order. */
export function getRegisteredEnvironmentPalettePreloadDescriptors(
  registry: EnvironmentPaletteRegistry,
): EnvironmentPalettePreloadDescriptor[] {
  return Object.keys(registry.environmentVisualProfiles)
    .sort()
    .flatMap((profileId) => {
      const profile = registry.environmentVisualProfiles[profileId];
      return profile ? getPalettePreloadDescriptors(profile) : [];
    });
}

export function resolveSelectedEnvironmentPalette(
  registry: EnvironmentPaletteRegistry,
  map: EnvironmentPaletteMap,
  environment: Pick<EnvironmentState, "visualPaletteId">,
): EnvironmentPalettePreloadDescriptor | null {
  const paletteId = environment.visualPaletteId;
  if (!paletteId) {
    return null;
  }
  const profile = resolveEnvironmentVisualProfile(registry, map);
  const asset = profile.paletteAssets?.find((candidate) => candidate.id === paletteId);
  if (!asset) {
    throw new Error(`Environment visual profile '${profile.id}' has no palette '${paletteId}' selected by map '${map.id}'.`);
  }
  return { ...asset, profileId: profile.id, paletteId: asset.id, cacheKey: createCacheKey(profile.id, asset.id) };
}

/**
 * Source bytes are reduced to one overlay tint/opacity. This is deliberately a
 * source-backed adaptation, never a claim of indexed-palette or LUT parity.
 */
export function createSourcePaletteOverlayAdapter(
  descriptor: Pick<EnvironmentPalettePreloadDescriptor, "paletteId" | "sourceSha256">,
  rawManifest: unknown,
): SourcePaletteOverlayAdapter {
  const manifest = assertSourcePaletteManifest(rawManifest, descriptor);
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let index = 0; index < manifest.rgb6.length; index += 3) {
    red += manifest.rgb6[index] ?? 0;
    green += manifest.rgb6[index + 1] ?? 0;
    blue += manifest.rgb6[index + 2] ?? 0;
  }
  const componentCount = manifest.rgb6.length / 3;
  const average = [red, green, blue].map((total) => Math.min(255, Math.round((total / componentCount) * 4)));
  const [r, g, b] = average;
  const luminance = ((r ?? 0) * 0.2126 + (g ?? 0) * 0.7152 + (b ?? 0) * 0.0722) / 255;

  return {
    evidenceStatus: "source-backed-adaptation",
    paletteId: descriptor.paletteId,
    rgb: ((r ?? 0) << 16) | ((g ?? 0) << 8) | (b ?? 0),
    alpha: Number(Math.max(0.04, Math.min(0.3, (1 - luminance) * 0.3)).toFixed(4)),
  };
}

function getPalettePreloadDescriptors(profile: EnvironmentVisualProfile): EnvironmentPalettePreloadDescriptor[] {
  const seenIds = new Set<string>();
  return (profile.paletteAssets ?? []).map((asset) => {
    if (seenIds.has(asset.id)) {
      throw new Error(`Environment visual profile '${profile.id}' contains duplicate palette '${asset.id}'.`);
    }
    seenIds.add(asset.id);
    return { ...asset, profileId: profile.id, paletteId: asset.id, cacheKey: createCacheKey(profile.id, asset.id) };
  }).sort((left, right) => left.cacheKey.localeCompare(right.cacheKey));
}

function resolveEnvironmentVisualProfile(registry: EnvironmentPaletteRegistry, map: EnvironmentPaletteMap): EnvironmentVisualProfile {
  const profileId = map.environmentVisualProfileId;
  if (!profileId) {
    throw new Error(`Map '${map.id}' selected palette '${map.id}' without an environment visual profile.`);
  }
  const profile = registry.environmentVisualProfiles[profileId];
  if (!profile) {
    throw new Error(`Map '${map.id}' references unregistered environment visual profile '${profileId}'.`);
  }
  return profile;
}

function assertSourcePaletteManifest(
  value: unknown,
  descriptor: Pick<EnvironmentPalettePreloadDescriptor, "paletteId" | "sourceSha256">,
): SourcePaletteManifest {
  if (!value || typeof value !== "object") {
    throw new Error(`Palette '${descriptor.paletteId}' resource is absent or malformed.`);
  }
  const manifest = value as Partial<SourcePaletteManifest>;
  if (manifest.sha256 !== descriptor.sourceSha256) {
    throw new Error(`Palette '${descriptor.paletteId}' source SHA-256 does not match its selected profile resource.`);
  }
  if (manifest.byteLength !== 768 || !Array.isArray(manifest.rgb6) || manifest.rgb6.length !== 768) {
    throw new Error(`Palette '${descriptor.paletteId}' resource must contain exactly 768 source bytes.`);
  }
  if (manifest.evidenceStatus !== "source-backed-adaptation" || typeof manifest.source !== "string") {
    throw new Error(`Palette '${descriptor.paletteId}' resource has an invalid source-backed adapter manifest.`);
  }
  if (manifest.rgb6.some((component) => !Number.isInteger(component) || component < 0 || component > 255)) {
    throw new Error(`Palette '${descriptor.paletteId}' resource contains invalid palette bytes.`);
  }
  return manifest as SourcePaletteManifest;
}

function createCacheKey(profileId: string, paletteId: string): string {
  return `environment-palette:${profileId}:${paletteId}`;
}
