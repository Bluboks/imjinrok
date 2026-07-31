import type Phaser from "phaser";
import type { BattlefieldEnvironmentView } from "../hud.js";
import type { PanelBounds } from "./hudPanel.js";

/**
 * Responsive, non-interactive presentation geometry beside the minimap.
 * This is a product layout contract: original clock placement is unresolved.
 */
export interface MinimapHudAncillaryLayout {
  readonly clockBounds: PanelBounds;
  /** Reserved for the minimap's future +/- controls. */
  readonly zoomRailBounds: PanelBounds;
}

export interface HudClockHandAngles {
  /** Degrees clockwise from twelve o'clock. */
  readonly hourDegrees: number;
  /** Degrees clockwise from twelve o'clock. */
  readonly minuteDegrees: number;
}

/**
 * Allocates the clock in the minimap title rail and leaves the left map rail
 * free for zoom controls. Neither coordinate system nor geometry is a claim
 * about the 640x480 original HUD.
 */
export function resolveMinimapHudAncillaryLayout(minimapBounds: PanelBounds): MinimapHudAncillaryLayout {
  const clockSize = clamp(Math.min(minimapBounds.width * 0.17, minimapBounds.height - 12), 28, 34);
  const clockBounds: PanelBounds = {
    x: minimapBounds.x + minimapBounds.width - clockSize - 9,
    y: minimapBounds.y + 6,
    width: clockSize,
    height: clockSize,
  };
  const zoomRailBounds: PanelBounds = {
    x: minimapBounds.x + 8,
    y: minimapBounds.y + 42,
    width: 28,
    height: Math.max(0, minimapBounds.height - 50),
  };

  return { clockBounds, zoomRailBounds };
}

/**
 * Intentional superset adapter: the simulation's normalized day progress is
 * displayed as a twelve-hour dial. This is not a recovered original mapping.
 */
export function resolveHudClockHandAngles(timeOfDay01: number): HudClockHandAngles {
  const progress = normalizeCycleProgress(timeOfDay01);
  return {
    hourDegrees: progress * 360,
    minuteDegrees: (progress * 12 % 1) * 360,
  };
}

export function drawHudClock(
  graphics: Phaser.GameObjects.Graphics,
  bounds: PanelBounds,
  environment: Pick<BattlefieldEnvironmentView, "timeOfDay01"> | null,
): void {
  graphics.clear();
  if (!environment) return;

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radius = Math.max(8, Math.min(bounds.width, bounds.height) / 2 - 2);
  const hands = resolveHudClockHandAngles(environment.timeOfDay01);

  graphics.fillStyle(0x071214, 0.96);
  graphics.fillCircle(centerX, centerY, radius);
  graphics.lineStyle(1.5, 0xc9a85d, 0.94);
  graphics.strokeCircle(centerX, centerY, radius);
  graphics.lineStyle(1, 0x4f796f, 0.88);
  for (let tick = 0; tick < 12; tick += 1) {
    const outer = pointAtDegrees(centerX, centerY, radius - 3, tick * 30);
    const inner = pointAtDegrees(centerX, centerY, radius - (tick % 3 === 0 ? 6 : 4), tick * 30);
    graphics.lineBetween(outer.x, outer.y, inner.x, inner.y);
  }

  drawHand(graphics, centerX, centerY, radius * 0.68, hands.hourDegrees, 2, 0xd3b567);
  drawHand(graphics, centerX, centerY, radius * 0.84, hands.minuteDegrees, 1, 0x9cc8ba);
  graphics.fillStyle(0xbc8e47, 1);
  graphics.fillCircle(centerX, centerY, 2);
}

export function boundsOverlap(left: PanelBounds, right: PanelBounds): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function drawHand(
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  length: number,
  degrees: number,
  width: number,
  color: number,
): void {
  const end = pointAtDegrees(centerX, centerY, length, degrees);
  graphics.lineStyle(width, color, 1);
  graphics.lineBetween(centerX, centerY, end.x, end.y);
}

function pointAtDegrees(centerX: number, centerY: number, radius: number, degrees: number): { x: number; y: number } {
  const radians = degrees * Math.PI / 180;
  return {
    x: centerX + Math.sin(radians) * radius,
    y: centerY - Math.cos(radians) * radius,
  };
}

function normalizeCycleProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 1) + 1) % 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
