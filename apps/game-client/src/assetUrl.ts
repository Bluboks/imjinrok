const DEFAULT_ASSET_BASE_PATH = import.meta.env?.BASE_URL ?? "/";
const EXTERNAL_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu;

/**
 * Resolves a public game asset against Vite's configured application base.
 *
 * Asset definitions intentionally keep their public paths so they remain
 * usable by source and conversion tests. Phaser and other browser loaders
 * call this at their boundary, where the Vite base is available.
 */
export function resolveGameClientAssetUrl(
  assetPath: string,
  basePath = DEFAULT_ASSET_BASE_PATH,
): string {
  if (EXTERNAL_URL_PATTERN.test(assetPath)) {
    return assetPath;
  }

  const base = normalizeBasePath(basePath);
  const path = assetPath.replace(/^\/+/, "");
  if (base === "/") {
    return `/${path}`;
  }

  const baseWithoutTrailingSlash = base.slice(0, -1);
  if (assetPath === baseWithoutTrailingSlash) {
    return base;
  }
  if (assetPath.startsWith(base)) {
    return assetPath;
  }

  return `${base}${path}`;
}

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (trimmed === "" || trimmed === "." || trimmed === "./") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${withLeadingSlash.replace(/\/+$/u, "")}/`;
}
