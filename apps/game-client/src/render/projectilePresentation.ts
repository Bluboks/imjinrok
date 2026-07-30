import type { GridPoint, MapDefinition } from "@shared";
import {
  PRODUCT_IMMEDIATE_PROJECTILE_PROFILE,
  PRODUCT_LINEAR_PROJECTILE_PROFILE,
  TileVisibility,
  getTileVisibility,
  type PlayerVisibilityState,
  type ProjectileState,
} from "@simulation";
import { RENDER_DEPTH_BIAS } from "./visualScale.js";
import { resolveGridGroundContactWorldPosition } from "./gridGroundContactPosition.js";

/**
 * Product-only projectile presentation contract. It deliberately does not bind
 * a source SPR frame or alter simulation coordinates, collision, or damage.
 */
export interface ProjectileVisualDefinition {
  readonly profileId: string;
  readonly kind: "product-primitive";
  readonly color: number;
  readonly alpha: number;
  readonly radiusPx: number;
  readonly trailLengthPx: number;
  /** A render-only offset from the authoritative ground-contact point. */
  readonly liftPx: number;
  readonly depthBias: number;
}

export interface ProjectileVisualRegistry {
  get(profileId: string): ProjectileVisualDefinition | undefined;
}

export function createProjectileVisualRegistry(
  definitions: readonly ProjectileVisualDefinition[],
): ProjectileVisualRegistry {
  const byProfileId = new Map<string, ProjectileVisualDefinition>();

  for (const definition of definitions) {
    if (!definition.profileId || definition.profileId.trim() !== definition.profileId) {
      throw new Error("Projectile visual profile id must be non-empty and trimmed.");
    }
    if (byProfileId.has(definition.profileId)) {
      throw new Error(`Duplicate projectile visual profile '${definition.profileId}'.`);
    }
    if (
      definition.kind !== "product-primitive" ||
      !Number.isFinite(definition.alpha) || definition.alpha < 0 || definition.alpha > 1 ||
      !Number.isFinite(definition.radiusPx) || definition.radiusPx <= 0 ||
      !Number.isFinite(definition.trailLengthPx) || definition.trailLengthPx < 0 ||
      !Number.isFinite(definition.liftPx) ||
      !Number.isFinite(definition.depthBias) ||
      !Number.isSafeInteger(definition.color) || definition.color < 0 || definition.color > 0xffffff
    ) {
      throw new Error(`Projectile visual profile '${definition.profileId}' has invalid primitive dimensions.`);
    }

    byProfileId.set(definition.profileId, Object.freeze({ ...definition }));
  }

  return Object.freeze({
    get(profileId: string): ProjectileVisualDefinition | undefined {
      return byProfileId.get(profileId);
    },
  });
}

export const PRODUCT_PROJECTILE_VISUAL_REGISTRY = createProjectileVisualRegistry([
  {
    profileId: PRODUCT_IMMEDIATE_PROJECTILE_PROFILE.id,
    kind: "product-primitive",
    color: 0xf5e2a2,
    alpha: 0.92,
    radiusPx: 3,
    trailLengthPx: 0,
    liftPx: 13,
    depthBias: RENDER_DEPTH_BIAS.effect,
  },
  {
    profileId: PRODUCT_LINEAR_PROJECTILE_PROFILE.id,
    kind: "product-primitive",
    color: 0xf6c865,
    alpha: 0.96,
    radiusPx: 3,
    trailLengthPx: 13,
    liftPx: 13,
    depthBias: RENDER_DEPTH_BIAS.effect,
  },
]);

export interface ProjectileVisualPlacement {
  readonly id: string;
  readonly profileId: string;
  readonly visual: ProjectileVisualDefinition;
  readonly groundContact: GridPoint;
  readonly position: GridPoint;
  readonly depth: number;
  /** Unit vector pointing from the launch point to the current projectile point. */
  readonly travelDirection: GridPoint;
}

/** Product fog rule: only a presently visible projectile position is drawable. */
export function filterVisibleProjectiles(
  projectiles: readonly ProjectileState[],
  visibility: PlayerVisibilityState,
): readonly ProjectileState[] {
  return projectiles.filter((projectile) => (
    getTileVisibility(visibility, projectile.position) === TileVisibility.Visible
  ));
}

type ProjectilePresentationMap = Pick<MapDefinition, "tileWidth" | "tileHeight">;

/**
 * Returns null for unregistered profiles. This is intentional: an unknown
 * profile must not silently borrow a source-like product primitive.
 */
export function resolveProjectileVisualPlacement(
  projectile: ProjectileState,
  registry: ProjectileVisualRegistry,
  mapOrigin: GridPoint,
  map: ProjectilePresentationMap,
): ProjectileVisualPlacement | null {
  const visual = registry.get(projectile.profileId);

  if (!visual) {
    return null;
  }

  const groundContact = resolveGridGroundContactWorldPosition(projectile.position, mapOrigin, map);
  const launchPoint = resolveGridGroundContactWorldPosition(projectile.start, mapOrigin, map);
  const deltaX = groundContact.x - launchPoint.x;
  const deltaY = groundContact.y - launchPoint.y;
  const distance = Math.hypot(deltaX, deltaY);

  return {
    id: projectile.id,
    profileId: projectile.profileId,
    visual,
    groundContact,
    position: { x: groundContact.x, y: groundContact.y - visual.liftPx },
    depth: groundContact.y + visual.depthBias,
    travelDirection: distance === 0
      ? { x: 0, y: 0 }
      : { x: deltaX / distance, y: deltaY / distance },
  };
}

export interface ProjectilePresentationHandle {
  update(placement: ProjectileVisualPlacement): void;
  destroy(): void;
}

export interface ProjectilePresentationFactory {
  create(placement: ProjectileVisualPlacement): ProjectilePresentationHandle;
}

/**
 * Passive client reconciler: it only reads snapshot projectiles and owns their
 * presentation handles. Canonical id sorting protects rendering from object or
 * caller iteration order; no simulation state is mutated.
 */
export class ProjectilePresentationReconciler {
  private readonly handles = new Map<string, ProjectilePresentationHandle>();

  constructor(private readonly factory: ProjectilePresentationFactory) {}

  reconcile(
    projectiles: readonly ProjectileState[],
    registry: ProjectileVisualRegistry,
    mapOrigin: GridPoint,
    map: ProjectilePresentationMap,
  ): void {
    const liveIds = new Set<string>();
    const canonicalProjectiles = [...projectiles].sort((left, right) => (
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    ));

    for (const projectile of canonicalProjectiles) {
      const placement = resolveProjectileVisualPlacement(projectile, registry, mapOrigin, map);

      if (!placement) {
        continue;
      }

      liveIds.add(projectile.id);
      const existing = this.handles.get(projectile.id);

      if (existing) {
        existing.update(placement);
      } else {
        this.handles.set(projectile.id, this.factory.create(placement));
      }
    }

    for (const [id, handle] of this.handles) {
      if (!liveIds.has(id)) {
        handle.destroy();
        this.handles.delete(id);
      }
    }
  }

  destroy(): void {
    for (const handle of this.handles.values()) {
      handle.destroy();
    }
    this.handles.clear();
  }
}
