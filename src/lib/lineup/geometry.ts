/**
 * The height used by the bride's composition canvas. Keeping this calculation
 * shared lets read-only lineup views reproduce the same composition geometry.
 */
export function lineupCanvasHeight(width: number, viewportHeight: number, canvasTop: number) {
  if (width >= 768 && viewportHeight >= 700) {
    return Math.round(Math.max(480, Math.min(760, viewportHeight * 0.75)));
  }

  const availableHeight = viewportHeight - canvasTop - 88;
  return Math.max(280, Math.min(Math.round(width * 0.53), availableHeight));
}
