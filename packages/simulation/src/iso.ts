import type { GridPoint } from "../../shared/src/index.js";

export function cartToIso(position: GridPoint, tileWidth: number, tileHeight: number): GridPoint {
  return {
    x: (position.x - position.y) * (tileWidth / 2),
    y: (position.x + position.y) * (tileHeight / 2),
  };
}

export function isoToCart(position: GridPoint, tileWidth: number, tileHeight: number): GridPoint {
  const halfTileWidth = tileWidth / 2;
  const halfTileHeight = tileHeight / 2;

  return {
    x: (position.x / halfTileWidth + position.y / halfTileHeight) / 2,
    y: (position.y / halfTileHeight - position.x / halfTileWidth) / 2,
  };
}
