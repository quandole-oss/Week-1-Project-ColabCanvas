export type ZIndexAction = 'bringForward' | 'sendBackward' | 'bringToFront' | 'sendToBack';

/**
 * Compute new zIndex values for a group of objects, preserving their relative order.
 */
export function computeBatchZIndex(
  allObjects: { id: string; zIndex: number }[],
  targetIds: string[],
  action: ZIndexAction
): Array<{ id: string; zIndex: number }> {
  if (targetIds.length === 0) return [];

  const targetSet = new Set(targetIds);
  const sorted = [...allObjects].sort((a, b) => a.zIndex - b.zIndex);
  // Group members sorted by their current zIndex (preserves relative order)
  const groupMembers = sorted.filter((o) => targetSet.has(o.id));
  const others = sorted.filter((o) => !targetSet.has(o.id));

  if (groupMembers.length === 0) return [];
  if (others.length === 0) return groupMembers.map((o) => ({ id: o.id, zIndex: o.zIndex }));

  switch (action) {
    case 'bringToFront': {
      const maxOther = others[others.length - 1].zIndex;
      const topGroup = groupMembers[groupMembers.length - 1].zIndex;
      if (topGroup > maxOther) return groupMembers.map((o) => ({ id: o.id, zIndex: o.zIndex }));
      return groupMembers.map((o, i) => ({ id: o.id, zIndex: maxOther + 1 + i }));
    }
    case 'sendToBack': {
      const minOther = others[0].zIndex;
      const bottomGroup = groupMembers[0].zIndex;
      if (bottomGroup < minOther) return groupMembers.map((o) => ({ id: o.id, zIndex: o.zIndex }));
      return groupMembers.map((o, i) => ({ id: o.id, zIndex: minOther - groupMembers.length + i }));
    }
    case 'bringForward': {
      // Find the object just above the group's topmost member
      const topGroupZ = groupMembers[groupMembers.length - 1].zIndex;
      const aboveObj = others.find((o) => o.zIndex > topGroupZ);
      if (!aboveObj) return groupMembers.map((o) => ({ id: o.id, zIndex: o.zIndex }));
      return groupMembers.map((o, i) => ({ id: o.id, zIndex: aboveObj.zIndex + 1 + i }));
    }
    case 'sendBackward': {
      // Find the object just below the group's bottommost member
      const bottomGroupZ = groupMembers[0].zIndex;
      const belowArr = others.filter((o) => o.zIndex < bottomGroupZ);
      if (belowArr.length === 0) return groupMembers.map((o) => ({ id: o.id, zIndex: o.zIndex }));
      const belowObj = belowArr[belowArr.length - 1];
      return groupMembers.map((o, i) => ({ id: o.id, zIndex: belowObj.zIndex - groupMembers.length + i }));
    }
  }
}

export function computeNewZIndex(
  objects: { id: string; zIndex: number }[],
  targetId: string,
  action: ZIndexAction
): number {
  const sorted = [...objects].sort((a, b) => a.zIndex - b.zIndex);
  const targetIdx = sorted.findIndex((o) => o.id === targetId);
  if (targetIdx === -1) return 0;

  const target = sorted[targetIdx];

  switch (action) {
    case 'bringToFront': {
      const max = sorted[sorted.length - 1].zIndex;
      return target.zIndex >= max ? target.zIndex : max + 1;
    }
    case 'sendToBack': {
      const min = sorted[0].zIndex;
      return target.zIndex <= min ? target.zIndex : min - 1;
    }
    case 'bringForward': {
      if (targetIdx >= sorted.length - 1) return target.zIndex; // already at front
      return sorted[targetIdx + 1].zIndex + 1;
    }
    case 'sendBackward': {
      if (targetIdx <= 0) return target.zIndex; // already at back
      return sorted[targetIdx - 1].zIndex - 1;
    }
  }
}
