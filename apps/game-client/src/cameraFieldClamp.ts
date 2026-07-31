export interface CameraFieldClampPoint {
  x: number;
  y: number;
}

export interface CameraFieldClampRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraFieldClampViewport extends CameraFieldClampRectangle {
  originX: number;
  originY: number;
}

export interface CameraFieldClampInput {
  cameraCenter: CameraFieldClampPoint;
  worldBounds: CameraFieldClampRectangle;
  cameraViewport: CameraFieldClampViewport;
  fieldViewport: CameraFieldClampRectangle;
  zoom: number;
}

/**
 * Clamps a camera center so the playable screen field remains within the world
 * whenever its world-space extent fits. If it does not fit on an axis, the
 * field is centered on that world axis to keep the result stable.
 */
export function clampCameraCenterToWorldField({
  cameraCenter,
  worldBounds,
  cameraViewport,
  fieldViewport,
  zoom,
}: CameraFieldClampInput): CameraFieldClampPoint {
  assertFinitePoint(cameraCenter, "cameraCenter");
  assertNonNegativeRectangle(worldBounds, "worldBounds");
  assertPositiveViewport(cameraViewport, "cameraViewport");
  assertNonNegativeRectangle(fieldViewport, "fieldViewport");

  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new RangeError(`zoom must be positive and finite; got ${String(zoom)}`);
  }

  const cameraOriginX = cameraViewport.width * cameraViewport.originX;
  const cameraOriginY = cameraViewport.height * cameraViewport.originY;
  const fieldLeft = (fieldViewport.x - cameraViewport.x - cameraOriginX) / zoom;
  const fieldRight = (fieldViewport.x + fieldViewport.width - cameraViewport.x - cameraOriginX) / zoom;
  const fieldTop = (fieldViewport.y - cameraViewport.y - cameraOriginY) / zoom;
  const fieldBottom = (fieldViewport.y + fieldViewport.height - cameraViewport.y - cameraOriginY) / zoom;

  return {
    x: clampAxis(cameraCenter.x, worldBounds.x, worldBounds.x + worldBounds.width, fieldLeft, fieldRight),
    y: clampAxis(cameraCenter.y, worldBounds.y, worldBounds.y + worldBounds.height, fieldTop, fieldBottom),
  };
}

function clampAxis(value: number, worldStart: number, worldEnd: number, fieldStart: number, fieldEnd: number): number {
  const minimumCenter = worldStart - fieldStart;
  const maximumCenter = worldEnd - fieldEnd;

  if (minimumCenter <= maximumCenter) {
    return Math.min(Math.max(value, minimumCenter), maximumCenter);
  }

  return (worldStart + worldEnd - fieldStart - fieldEnd) / 2;
}

function assertFinitePoint(point: CameraFieldClampPoint, label: string): void {
  assertFiniteNumber(point.x, `${label}.x`);
  assertFiniteNumber(point.y, `${label}.y`);
}

function assertNonNegativeRectangle(rectangle: CameraFieldClampRectangle, label: string): void {
  assertFiniteNumber(rectangle.x, `${label}.x`);
  assertFiniteNumber(rectangle.y, `${label}.y`);
  assertFiniteNumber(rectangle.width, `${label}.width`);
  assertFiniteNumber(rectangle.height, `${label}.height`);

  if (rectangle.width < 0 || rectangle.height < 0) {
    throw new RangeError(`${label} dimensions must be non-negative; got ${JSON.stringify(rectangle)}`);
  }
}

function assertPositiveViewport(viewport: CameraFieldClampViewport, label: string): void {
  assertNonNegativeRectangle(viewport, label);
  assertFiniteNumber(viewport.originX, `${label}.originX`);
  assertFiniteNumber(viewport.originY, `${label}.originY`);

  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError(`${label} dimensions must be positive; got ${JSON.stringify(viewport)}`);
  }
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite; got ${String(value)}`);
  }
}
