import type { TerrainKindSlot } from "./visuals.js";

export interface ElevationNeighbor {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  elevation: number;
}

export const ELEVATION_NEIGHBOR_OFFSETS = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
] as const satisfies readonly Omit<ElevationNeighbor, "elevation">[];

const higherNeighborSlotByOffset = {
  "1,1": "corner_n",
  "0,1": "ramp_ne",
  "-1,1": "corner_e",
  "1,0": "ramp_nw",
  "-1,0": "ramp_se",
  "1,-1": "corner_w",
  "0,-1": "ramp_sw",
  "-1,-1": "corner_s",
} as const satisfies Record<string, TerrainKindSlot>;

export function resolveElevationTerrainSlot(
  centerElevation: number,
  neighbors: readonly ElevationNeighbor[],
): TerrainKindSlot | null {
  let highestElevation = centerElevation;
  for (const neighbor of neighbors) {
    if (neighbor.elevation > highestElevation) {
      highestElevation = neighbor.elevation;
    }
  }

  if (highestElevation <= centerElevation) {
    return centerElevation > 0 ? "plateauTop" : null;
  }

  let directionX = 0;
  let directionY = 0;
  for (const neighbor of neighbors) {
    if (neighbor.elevation === highestElevation) {
      directionX += neighbor.dx;
      directionY += neighbor.dy;
    }
  }

  if (directionX === 0 && directionY === 0) {
    return null;
  }

  const offset = normalizeDirectionOffset(directionX, directionY);
  const key = `${offset.dx},${offset.dy}` as keyof typeof higherNeighborSlotByOffset;

  return higherNeighborSlotByOffset[key] ?? null;
}

function normalizeDirectionOffset(directionX: number, directionY: number): Pick<ElevationNeighbor, "dx" | "dy"> {
  const absX = Math.abs(directionX);
  const absY = Math.abs(directionY);

  if (absX > absY) {
    return { dx: Math.sign(directionX) as -1 | 1, dy: 0 };
  }

  if (absY > absX) {
    return { dx: 0, dy: Math.sign(directionY) as -1 | 1 };
  }

  return {
    dx: Math.sign(directionX) as -1 | 1,
    dy: Math.sign(directionY) as -1 | 1,
  };
}
