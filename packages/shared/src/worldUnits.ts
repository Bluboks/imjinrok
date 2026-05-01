export const WORLD_UNITS = {
  tileWidth: 2,
  tileHeight: 1,
  elevationStep: 0.5,
} as const;

export type WorldUnits = typeof WORLD_UNITS;
