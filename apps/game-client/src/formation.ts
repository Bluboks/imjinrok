import type { GridPoint } from "@shared";

export interface FormationBounds {
  width: number;
  height: number;
}

export function createFormationTargets(
  origin: GridPoint,
  count: number,
  bounds: FormationBounds,
): GridPoint[] {
  const targetCount = Math.max(0, Math.floor(count));

  if (targetCount === 0 || bounds.width <= 0 || bounds.height <= 0) {
    return [];
  }

  const clampedOrigin = clampPoint(origin, bounds);
  const targets: GridPoint[] = [];
  const seen = new Set<string>();
  const maxRadius = Math.max(bounds.width, bounds.height);

  for (let radius = 0; radius <= maxRadius && targets.length < targetCount; radius += 1) {
    for (const offset of getFormationRingOffsets(radius)) {
      const candidate = clampPoint({
        x: clampedOrigin.x + offset.x,
        y: clampedOrigin.y + offset.y,
      }, bounds);
      const key = toPointKey(candidate);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      targets.push(candidate);

      if (targets.length >= targetCount) {
        break;
      }
    }
  }

  while (targets.length < targetCount) {
    targets.push(clampedOrigin);
  }

  return targets;
}

function getFormationRingOffsets(radius: number): GridPoint[] {
  if (radius <= 0) {
    return [{ x: 0, y: 0 }];
  }

  const offsets: GridPoint[] = [];

  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (Math.max(Math.abs(x), Math.abs(y)) === radius) {
        offsets.push({ x, y });
      }
    }
  }

  return offsets.sort(compareFormationOffsets);
}

function compareFormationOffsets(a: GridPoint, b: GridPoint): number {
  const distanceDelta = getDistanceSq(a) - getDistanceSq(b);

  if (distanceDelta !== 0) {
    return distanceDelta;
  }

  const manhattanDelta = Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y));

  if (manhattanDelta !== 0) {
    return manhattanDelta;
  }

  return a.y - b.y || a.x - b.x;
}

function getDistanceSq(point: GridPoint): number {
  return point.x * point.x + point.y * point.y;
}

function clampPoint(point: GridPoint, bounds: FormationBounds): GridPoint {
  return {
    x: Math.max(0, Math.min(bounds.width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(bounds.height - 1, Math.round(point.y))),
  };
}

function toPointKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}
