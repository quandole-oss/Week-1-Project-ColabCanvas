import { describe, it, expect, vi } from 'vitest';
import { executeAIAction } from './aiService';
import type { CanvasObject, CanvasObjectProps, ShapeType } from '../types';
import { Timestamp } from 'firebase/firestore';

function makeObj(id: string, type: ShapeType, props: CanvasObjectProps, zIndex = 1): CanvasObject {
  const now = Timestamp.now();
  return { id, type, props, zIndex, createdBy: 'u', createdAt: now, updatedBy: 'u', updatedAt: now };
}

describe('executeAIAction', () => {
  const createObject = vi.fn((_type: ShapeType, _props: CanvasObjectProps) => 'new-id');
  const updateObject = vi.fn();
  const deleteObject = vi.fn();
  const reorderObject = vi.fn();

  const objects = new Map<string, CanvasObject>();
  objects.set('obj1', makeObj('obj1', 'rect', { left: 100, top: 100, width: 50, height: 50, fill: '#FF0000' }, 1));

  it('duplicateObject creates a new object with +20px offset', () => {
    const result = executeAIAction(
      { type: 'duplicateObject', params: { objectId: 'obj1' } },
      objects,
      createObject,
      updateObject,
      deleteObject,
      reorderObject
    );

    expect(result.success).toBe(true);
    expect(createObject).toHaveBeenCalledWith(
      'rect',
      expect.objectContaining({ left: 120, top: 120 })
    );
    expect(result.createdIds).toEqual(['new-id']);
  });

  it('reorderObject dispatches the correct action to the callback', () => {
    const result = executeAIAction(
      { type: 'reorderObject', params: { objectId: 'obj1', action: 'bringToFront' } },
      objects,
      createObject,
      updateObject,
      deleteObject,
      reorderObject
    );

    expect(result.success).toBe(true);
    expect(reorderObject).toHaveBeenCalledWith('obj1', 'bringToFront');
  });

  it('duplicateObject fails for unknown object', () => {
    const result = executeAIAction(
      { type: 'duplicateObject', params: { objectId: 'nonexistent' } },
      objects,
      createObject,
      updateObject,
      deleteObject,
      reorderObject
    );

    expect(result.success).toBe(false);
  });
});
