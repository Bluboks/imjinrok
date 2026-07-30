/**
 * Executes exactly one RenderTexture batch and always closes it, including
 * when resolving a texture or tile descriptor throws during the draw loop.
 */
export interface RenderTextureBatchTarget {
  beginDraw(): unknown;
  endDraw(): unknown;
}

export function runRenderTextureBatch(
  renderTexture: RenderTextureBatchTarget,
  draw: () => void,
): void {
  renderTexture.beginDraw();

  try {
    draw();
  } finally {
    renderTexture.endDraw();
  }
}
