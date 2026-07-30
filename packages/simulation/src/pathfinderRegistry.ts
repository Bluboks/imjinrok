import type { Pathfinder } from "./pathfinder.js";

export interface RegisterPathfinderOptions {
  /** Replaces the provider currently registered for this exact stable id. */
  replace?: boolean;
}

export class PathfinderRegistry {
  private readonly pathfinders = new Map<string, Pathfinder>();

  register(pathfinder: Pathfinder, options: RegisterPathfinderOptions = {}): void {
    assertPathfinderId(pathfinder.id);

    if (this.pathfinders.has(pathfinder.id) && options.replace !== true) {
      throw new Error(`Pathfinder '${pathfinder.id}' is already registered.`);
    }

    this.pathfinders.set(pathfinder.id, pathfinder);
  }

  require(id: string): Pathfinder {
    assertPathfinderId(id);
    const pathfinder = this.pathfinders.get(id);

    if (!pathfinder) {
      throw new Error(`Unknown pathfinding profile '${id}'. Register its Pathfinder before creating the world.`);
    }

    return pathfinder;
  }

  has(id: string): boolean {
    return this.pathfinders.has(id);
  }

  ids(): readonly string[] {
    return [...this.pathfinders.keys()].sort();
  }
}

export const defaultPathfinderRegistry = new PathfinderRegistry();

export function registerPathfinder(pathfinder: Pathfinder, options?: RegisterPathfinderOptions): void {
  defaultPathfinderRegistry.register(pathfinder, options);
}

export function requirePathfinder(id: string): Pathfinder {
  return defaultPathfinderRegistry.require(id);
}

function assertPathfinderId(id: string): void {
  if (!id.trim()) {
    throw new Error("Pathfinding profile id must not be empty.");
  }
  if (id !== id.trim()) {
    throw new Error(`Pathfinding profile id '${id}' must not have surrounding whitespace.`);
  }
}
