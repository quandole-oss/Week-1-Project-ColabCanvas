import { describe, it, expect } from 'vitest';
import { computeNewZIndex } from './zIndex';

describe('computeNewZIndex', () => {
  const objects = [
    { id: 'a', zIndex: 1 },
    { id: 'b', zIndex: 5 },
    { id: 'c', zIndex: 10 },
  ];

  it('bringForward: returns next object zIndex + 1', () => {
    expect(computeNewZIndex(objects, 'b', 'bringForward')).toBe(11);
  });

  it('sendToBack: returns min - 1', () => {
    expect(computeNewZIndex(objects, 'b', 'sendToBack')).toBe(0);
  });

  it('bringToFront: returns max + 1', () => {
    expect(computeNewZIndex(objects, 'b', 'bringToFront')).toBe(11);
  });

  it('object already at front returns its current zIndex (no-op)', () => {
    expect(computeNewZIndex(objects, 'c', 'bringToFront')).toBe(10);
    expect(computeNewZIndex(objects, 'c', 'bringForward')).toBe(10);
  });

  it('object already at back returns its current zIndex (no-op)', () => {
    expect(computeNewZIndex(objects, 'a', 'sendToBack')).toBe(1);
    expect(computeNewZIndex(objects, 'a', 'sendBackward')).toBe(1);
  });

  it('sendBackward: returns prev object zIndex - 1', () => {
    expect(computeNewZIndex(objects, 'b', 'sendBackward')).toBe(0);
  });

  it('returns 0 for unknown target', () => {
    expect(computeNewZIndex(objects, 'unknown', 'bringToFront')).toBe(0);
  });
});
