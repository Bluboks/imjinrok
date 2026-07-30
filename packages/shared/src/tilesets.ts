/**
 * Renderer-facing terrain contracts. These references deliberately say nothing
 * about how an original map record selects a tile or frame.
 */
export interface VisualAssetGeometry {
  width: number;
  height: number;
  /** Source-pixel point placed on the map tile's ground-contact point. */
  footprintAnchor: { x: number; y: number };
}

export interface VisualAssetRef {
  url: string;
  frame: number;
  /** Required when a map explicitly renders this asset as a tile. */
  imageGeometry?: VisualAssetGeometry;
}

export interface SourceAssetCatalogEntry {
  sourcePath: string;
  sha256: string;
}

export type SourceEvidenceStatus = "source-fact" | "source-backed-adaptation" | "unresolved";

export interface TilesetDefinition {
  id: string;
  displayName: string;
  terrainAssets: Readonly<Record<string, VisualAssetRef>>;
  elevationAssets?: Readonly<Record<string, VisualAssetRef>>;
  evidenceStatus: SourceEvidenceStatus;
  sourceAssets?: readonly SourceAssetCatalogEntry[];
}

export interface EnvironmentVisualProfile {
  id: string;
  displayName: string;
  paletteAssets?: readonly PaletteVisualAsset[];
  effectAssets?: readonly VisualAssetRef[];
  evidenceStatus: SourceEvidenceStatus;
  sourceAssets?: readonly SourceAssetCatalogEntry[];
}

/** Hash-bound palette data consumed by a renderer adapter, not an image frame. */
export interface PaletteVisualAsset extends VisualAssetRef {
  id: string;
  sourceSha256: string;
}

export type ResourceVisualState = "active" | "depleted";

export interface ResourceVisualIdentity {
  states: Readonly<Partial<Record<ResourceVisualState, VisualAssetRef>>>;
  evidenceStatus: SourceEvidenceStatus;
}

export interface ResourceVisualSetDefinition {
  id: string;
  displayName: string;
  resources: Readonly<Record<string, ResourceVisualIdentity>>;
  evidenceStatus: SourceEvidenceStatus;
  sourceAssets?: readonly SourceAssetCatalogEntry[];
}
