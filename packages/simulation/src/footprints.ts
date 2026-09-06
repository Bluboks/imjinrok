import {
  k01SourceFootprintByOriginalClass,
  unitDefinitions,
  type FootprintDefinition,
  type GridPoint,
  type UnitDefinitionId,
} from "../../shared/src/index.js";
import type { WorldState } from "./types.js";

export type FootprintAnchor = "project-center" | "source-center";

export interface EffectiveFootprint {
  readonly footprint: FootprintDefinition;
  readonly anchor: FootprintAnchor;
}

export type FootprintContext = {
  readonly sourceRuntimeProfile?: Pick<NonNullable<WorldState["sourceRuntimeProfile"]>, "profileId">;
} | undefined;

/** Minimal context for bounded K01 placement admission before WorldState exists. */
export const K01_SOURCE_RUNTIME_FOOTPRINT_CONTEXT: FootprintContext = Object.freeze({
  sourceRuntimeProfile: Object.freeze({ profileId: "k01:source-runtime" }),
});

const K01_SOURCE_BUILDING_CLASS_BY_KIND: Readonly<Partial<Record<UnitDefinitionId, number>>> = Object.freeze({
  house: 48,
  "town-center": 49,
  barracks: 50,
  "korean-training-command": 51,
  beacon: 52,
  "japanese-camp-house": 57,
  "japanese-hq": 58,
  "japanese-camp-barracks": 60,
  "japanese-camp-firehouse": 62,
  "japanese-camp-tower": 63,
});

export function resolveEffectiveFootprint(context: FootprintContext, kind: UnitDefinitionId): EffectiveFootprint {
  const definition = unitDefinitions[kind];
  const sourceClass = K01_SOURCE_BUILDING_CLASS_BY_KIND[kind];
  const sourceProfileSelected = context?.sourceRuntimeProfile?.profileId === "k01:source-runtime";
  const sourceFootprint = sourceProfileSelected && sourceClass !== undefined
    ? k01SourceFootprintByOriginalClass[sourceClass]
    : undefined;

  if (sourceProfileSelected && sourceClass !== undefined &&
    (sourceFootprint === undefined || sourceFootprint.evidence !== "static-confirmed")) {
    throw new Error(`K01 source footprint evidence is missing for original class ${sourceClass}.`);
  }

  if (sourceFootprint === undefined) {
    return { footprint: definition.footprint, anchor: "project-center" };
  }

  return {
    footprint: {
      ...definition.footprint,
      width: sourceFootprint.width,
      height: sourceFootprint.height,
    },
    anchor: "source-center",
  };
}

export function getUnitFootprintTiles(
  context: FootprintContext,
  kind: UnitDefinitionId,
  position: GridPoint,
): GridPoint[] {
  const { footprint, anchor } = resolveEffectiveFootprint(context, kind);
  return getFootprintTiles(position, footprint, anchor);
}

export function getFootprintTiles(
  center: GridPoint,
  footprint: FootprintDefinition,
  anchor: FootprintAnchor = "project-center",
): GridPoint[] {
  if (!Number.isFinite(footprint.width) || !Number.isFinite(footprint.height)) {
    return [];
  }

  const width = Math.floor(footprint.width);
  const height = Math.floor(footprint.height);

  if (
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    (anchor === "source-center" && (!Number.isInteger(center.x) || !Number.isInteger(center.y) ||
      center.x < -0x8000 || center.x > 0x7fff || center.y < -0x8000 || center.y > 0x7fff))
  ) {
    return [];
  }

  const originX = anchor === "source-center"
    ? center.x - Math.floor(width / 2)
    : Math.round(center.x - (width - 1) / 2);
  const originY = anchor === "source-center"
    ? center.y - Math.floor(height / 2)
    : Math.round(center.y - (height - 1) / 2);
  if (anchor === "source-center" && (
    originX < -0x8000 || originX + width - 1 > 0x7fff ||
    originY < -0x8000 || originY + height - 1 > 0x7fff
  )) {
    return [];
  }
  const tiles: GridPoint[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({ x: originX + x, y: originY + y });
    }
  }

  return tiles;
}
