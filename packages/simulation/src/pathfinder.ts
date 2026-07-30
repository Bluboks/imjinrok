import type { GridPoint } from "../../shared/src/index.js";
import type { UnitState, WorldState } from "./types.js";

export interface FindPathOptions {
  allowPartial?: boolean;
  /**
   * Use only for reachability checks. Movement paths keep mobile footprints
   * blocked so their waypoints remain immediately occupiable.
   */
  ignoreMobileBlockers?: boolean;
}

/** A deterministic, replaceable route provider selected by a stable profile id. */
export interface Pathfinder {
  readonly id: string;
  findPath(
    state: WorldState,
    unit: UnitState,
    target: GridPoint,
    options: FindPathOptions,
  ): GridPoint[] | null;
}
