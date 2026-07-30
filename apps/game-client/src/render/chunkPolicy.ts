/** Visibility updates stay small; static terrain is baked less often in larger FBOs. */
export const FOG_VISIBILITY_CHUNK_SIZE = 16;
export const TERRAIN_RENDER_CHUNK_SIZE = 32;

export interface ChunkGridSize {
  columns: number;
  rows: number;
  count: number;
}

export function getChunkGridSize(width: number, height: number, chunkSize: number): ChunkGridSize {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Chunk grid dimensions must be positive integers; received ${width}x${height}.`);
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`Chunk size must be a positive integer; received ${chunkSize}.`);
  }

  const columns = Math.ceil(width / chunkSize);
  const rows = Math.ceil(height / chunkSize);

  return { columns, rows, count: columns * rows };
}
