const SNAP_SIZE = 50;

/** Snap a value to the nearest grid increment (50px, matching visual grid). */
export function snapToGrid(value: number): number {
  return Math.round(value / SNAP_SIZE) * SNAP_SIZE;
}

/**
 * Snap a position accounting for Fabric.js stroke offset.
 * Fabric's left/top refers to the shape boundary; the stroke extends outward
 * by strokeWidth/2. This snaps the visual outer edge to the grid, then
 * converts back to the shape-boundary coordinate.
 */
export function snapToGridStrokeAware(value: number, strokeWidth: number, strokeUniform: boolean): number {
  const strokeOffset = strokeUniform ? 0 : strokeWidth / 2;
  return snapToGrid(value - strokeOffset) + strokeOffset;
}

interface PositionableObject {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  originX?: string | number;
  originY?: string | number;
  group?: unknown;
  calcTransformMatrix?: () => number[];
}

/**
 * Calculate the top-left position regardless of current originX/originY.
 * Fabric.js changes origin during scaling (e.g., dragging top-left corner sets
 * originX:'right', originY:'bottom'). If we read obj.left/obj.top directly,
 * we get the position of the CURRENT origin, not the top-left corner.
 */
export function getTopLeftPosition(obj: PositionableObject): { left: number; top: number } {
  const width = (obj.width ?? 0) * (obj.scaleX ?? 1);
  const height = (obj.height ?? 0) * (obj.scaleY ?? 1);
  let left = obj.left ?? 0;
  let top = obj.top ?? 0;

  if (obj.originX === 'right') left -= width;
  else if (obj.originX === 'center') left -= width / 2;

  if (obj.originY === 'bottom') top -= height;
  else if (obj.originY === 'center') top -= height / 2;

  return { left, top };
}

/**
 * Get absolute top-left position for an object that may be inside an ActiveSelection.
 * When inside a group, child.left/top are relative to the group center — NOT absolute.
 * This uses calcTransformMatrix() to get the true canvas position.
 */
export function getAbsolutePosition(obj: PositionableObject): { left: number; top: number } {
  if (!obj.group || !obj.calcTransformMatrix) return getTopLeftPosition(obj);

  const matrix = obj.calcTransformMatrix();
  // matrix[4], matrix[5] = absolute center of the object in canvas space
  const w = obj.width ?? 0;
  const h = obj.height ?? 0;
  // Extract effective scale from the full transform matrix
  const sx = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1]);
  const sy = Math.sqrt(matrix[2] * matrix[2] + matrix[3] * matrix[3]);
  return {
    left: matrix[4] - (w * sx) / 2,
    top: matrix[5] - (h * sy) / 2,
  };
}
